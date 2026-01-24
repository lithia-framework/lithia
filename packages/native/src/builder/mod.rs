use crate::router::{
    processor::{NativeRouteProcessor, RouteProcessor},
    Route,
};
use napi_derive::napi;
use rayon::prelude::*;
use std::{fs, time::Instant};

pub mod compiler;
pub mod config;
pub mod reporter;
pub mod sourcemap;
pub mod tsconfig;
pub mod types;

use compiler::TypeScriptCompiler;
use config::BuildConfig;
use types::{BuildResult, CompileResult};

#[napi]
pub fn build_project() -> napi::Result<()> {
    let start = Instant::now();

    // Load configuration
    let config = BuildConfig::new().map_err(|e| napi::Error::from_reason(e))?;

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
    let compile_start = Instant::now();
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

    let compile_duration = compile_start.elapsed();

    // Aggregate results
    let mut build_result = BuildResult::new(start.elapsed().as_secs_f64() * 1000.0);
    build_result.files_compiled = ts_files.len();

    for result in results {
        match result {
            Ok(timing) => build_result.timings.push(timing),
            Err(e) => build_result.failures.push(e),
        }
    }

    // Print build summary
    println!(
        "Built {} files in {:.2}ms ({} failures)",
        build_result.files_compiled,
        compile_duration.as_secs_f64() * 1000.0,
        build_result.failures.len()
    );

    if build_result.has_failures() {
        return Err(napi::Error::from_reason(format!(
            "Build completed with {} failures: {:?}",
            build_result.failures.len(),
            build_result.failures.iter().take(5).collect::<Vec<_>>()
        )));
    }

    build_result.total_duration_ms = start.elapsed().as_secs_f64() * 1000.0;
    println!("Total build time: {:.2}ms", build_result.total_duration_ms);

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
        let routes: Vec<Route> = route_files
            .iter()
            .map(|file| processor.process_route_file(file))
            .map(Route::from)
            .collect();

        let json = serde_json::to_string_pretty(&routes)
            .map_err(|e| napi::Error::from_reason(format!("Failed to serialize routes: {}", e)))?;

        fs::write(&config.out_root.join("routes.json"), json)
            .map_err(|e| napi::Error::from_reason(format!("Failed to write file: {}", e)))?;
    }

    Ok(())
}
