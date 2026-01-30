/**
 * @fileoverview Main Builder Orchestrator (Native).
 * Coordinates scanning, parallel compilation via SWC/Rayon, 
 * and manifest generation for routes and events.
 */

use napi_derive::napi;
use rayon::prelude::*;
use std::{fs, time::Instant, path::Path};

pub mod compiler;
pub mod paths_rewriter;
pub mod config;
pub mod sourcemap;
pub mod tsconfig;
pub mod types;

use compiler::TypeScriptCompiler;
use config::BuildConfig;
use types::{BuildResult, CompileResult};

/**
 * Main entry point for the native build process, exposed to Node.js.
 * @param source_root The directory containing .mts source files.
 * @param out_root The target directory for compiled .mjs files.
 */
#[napi]
pub fn build_project(source_root: String, out_root: String) -> napi::Result<()> {
    let start = Instant::now();

    // 1. Initialize Configuration
    let config = BuildConfig::new(source_root, out_root)
        .map_err(napi::Error::from_reason)?;

    // 2. Clean Output Directory
    // We ignore errors here in case the directory doesn't exist yet
    let _ = fs::remove_dir_all(&config.out_root);

    // 3. Scan for TypeScript files
    use crate::scanner::{FileScanner, NativeFileScanner, ScanOptions};
    
    let ts_files = NativeFileScanner::new()
        .scan_dir(
            &[config.source_root_str()],
            Some(ScanOptions {
                include: Some(vec!["**/*.mts".to_string(), "**/*.ts".to_string()]),
                ignore: Some(config.ignore_patterns.clone()),
            }),
        )
        .map_err(|e| napi::Error::from_reason(format!("Scanner failed: {}", e)))?;

    if ts_files.is_empty() {
        return Ok(());
    }

    // 4. Parallel Compilation
    let compiler = TypeScriptCompiler::new(config.ts_config.clone());
    
    // Using Rayon's par_iter to compile files in parallel
    let results: Vec<Result<CompileResult, String>> = ts_files
        .par_iter()
        .map(|file| {
            let output_path = config.compute_output_path(Path::new(&file.path));

            // Ensure the specific sub-directory exists in the output root
            if let Some(parent) = output_path.parent() {
                fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }

            let file_start = Instant::now();
            compiler
                .compile_file(Path::new(&file.full_path), &output_path)
                .map(|_| CompileResult {
                    output_path: output_path.to_string_lossy().into_owned(),
                    duration_ms: file_start.elapsed().as_secs_f64() * 1000.0,
                })
        })
        .collect();

    // 5. Aggregate Results
    let mut build_summary = BuildResult::new(start.elapsed().as_secs_f64() * 1000.0);
    build_summary.files_compiled = ts_files.len();

    for result in results {
        match result {
            Ok(timing) => build_summary.timings.push(timing),
            Err(e) => build_summary.failures.push(e),
        }
    }

    // 6. Handle Compilation Failures
    if build_summary.has_failures() {
        let error_count = build_summary.failures.len();
        let sampled_errors = build_summary.failures.iter()
            .take(3) // Only show the first 3 errors to avoid terminal flooding
            .cloned()
            .collect::<Vec<_>>()
            .join("\n\n");

        return Err(napi::Error::from_reason(format!(
            "Build failed with {} errors. Sample output:\n\n{}",
            error_count, sampled_errors
        )));
    }

    // 7. Generate Manifests
    // These link the compiled files to the Lithia runtime
    crate::router::write_routes_manifest(&config).map_err(napi::Error::from_reason)?;
    crate::events::write_events_manifest(&config).map_err(napi::Error::from_reason)?;

    Ok(())
}