//! Native builder entrypoints and orchestration.
//!
//! This module exposes the `build_project` function which is invoked from the
//! host (Node) via N-API. It wires together scanning, compilation and route
//! manifest generation using the Rust-based SWC compiler integration.
//!
//! Exposes the native `build_project` entrypoint used by the host.

use crate::{
    router::{
        Route, RoutesManifest, processor::{NativeRouteProcessor, RouteProcessor}
    }, schema_version,
};
use napi_derive::napi;
use rayon::prelude::*;
use std::{fs, time::Instant};

pub mod compiler;
pub mod config;
pub mod sourcemap;
pub mod tsconfig;
pub mod types;

#[cfg(test)]
mod tests;

use compiler::TypeScriptCompiler;
use config::BuildConfig;
use types::{BuildResult, CompileResult};

#[napi]
/// Build the project located at `source_root` and emit outputs to `out_root`.
///
/// This function is exported to the host via N-API and performs the full
/// native compilation pipeline:
/// 1. Reads build configuration from `source_root`.
/// 2. Scans for TypeScript files matching `.ts`.
/// 3. Compiles files (in parallel) using the embedded SWC-based compiler.
/// 4. Aggregates compilation results and fails the build if there are errors.
/// 5. If route files exist in the output, produces a `routes.json` manifest
///    containing route metadata consumed by the runtime.
///
/// Errors are returned as `napi::Error` to be propagated to the host.
/// High-level build entrypoint for the native TypeScript builder.
///
/// `build_project` coordinates scanning the source tree, applying route
/// conventions, and producing a `RoutesManifest` that can be consumed by the
/// runtime. Currently this function is a thin wrapper and may be expanded to
/// run parallel compilation and emit artifacts to disk.
pub fn build_project(source_root: String, out_root: String) -> napi::Result<()> {
    let start = Instant::now();

    // Load configuration
    let config =
        BuildConfig::new(source_root, out_root).map_err(|e| napi::Error::from_reason(e))?;
        
    fs::remove_dir_all(&config.out_root).ok();

    // Scan TypeScript files using glob patterns
    use crate::scanner::FileScanner;
    let ts_files = crate::scanner::NativeFileScanner::new()
        .scan_dir(
            &[config.source_root_str()],
            Some(crate::scanner::ScanOptions {
                include: Some(vec!["**/*.ts".to_string()]),
                ignore: Some(config.ignore_patterns.clone()),
            }),
        )
        .map_err(|e| napi::Error::from_reason(format!("scan failed: {}", e)))?;

    // Compile files in parallel
    let compiler = TypeScriptCompiler::new(config.ts_config.clone());

    let results: Vec<Result<CompileResult, String>> = ts_files
        .par_iter()
        .map(|file| {
            let output_path = config.compute_output_path(&file.path);

            if let Some(parent) = output_path.parent() {
                std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }

            let file_start = Instant::now();
            compiler
                .compile_file(&std::path::Path::new(&file.full_path), &output_path)
                .map(|_| CompileResult {
                    output_path: output_path.to_string_lossy().to_string(),
                    duration_ms: file_start.elapsed().as_secs_f64() * 1000.0,
                })
        })
        .collect();

    // Aggregate results
    let mut build_result = BuildResult::new(start.elapsed().as_secs_f64() * 1000.0);
    build_result.files_compiled = ts_files.len();

    for result in results {
        match result {
            Ok(timing) => build_result.timings.push(timing),
            Err(e) => build_result.failures.push(e),
        }
    }

    // Build summary is emitted to the host (Node) via the native API; avoid printing here.

    if build_result.has_failures() {
        let failures_msg = build_result.failures
            .iter()
            .take(5)
            .map(|e| e.as_str())
            .collect::<Vec<_>>()
            .join("\n\n");
        
        return Err(napi::Error::from_reason(format!(
            "Build completed with {} failures:\n\n{}",
            build_result.failures.len(),
            failures_msg
        )));
    }

    build_result.total_duration_ms = start.elapsed().as_secs_f64() * 1000.0;

    let routes_path = config.out_root.join("app").join("routes");
    if routes_path.exists() {
        let route_files = crate::scanner::NativeFileScanner::new()
            .scan_dir(
                &[
                    config.output_path_str(),
                    "app".to_string(),
                    "routes".to_string(),
                ],
                Some(crate::scanner::ScanOptions {
                    include: Some(vec!["**/*.js".to_string()]),
                    ignore: None,
                }),
            )
            .map_err(|e| napi::Error::from_reason(format!("scan failed: {}", e)))?;

        let processor = NativeRouteProcessor::new(None, None);

        let version = schema_version().to_string();
        let routes: Vec<Route> = route_files
            .iter()
            .map(|file| processor.process_route_file(file))
            .filter(|route| route.method.is_some())
            .map(Route::from)
            .collect();

        let manifest = RoutesManifest { version, routes };

        let json = serde_json::to_string(&manifest)
            .map_err(|e| napi::Error::from_reason(format!("Failed to serialize routes: {}", e)))?;

        fs::write(&config.out_root.join("routes.json"), json)
            .map_err(|e| napi::Error::from_reason(format!("Failed to write file: {}", e)))?;
    }

    Ok(())
}
