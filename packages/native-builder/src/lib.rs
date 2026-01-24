use napi_derive::napi;
use rayon::prelude::*;
use std::time::Instant;

use lithia_native_scanner::FileInfo;

mod compiler;
mod config;
mod reporter;
mod sourcemap;
mod tsconfig;
mod types;

use compiler::TypeScriptCompiler;
use config::BuildConfig;
use reporter::print_timings;
use types::{BuildResult, CompileResult};

#[napi]
pub fn build_project(source_dir: Option<String>, out_dir: Option<String>) -> napi::Result<()> {
    let start = Instant::now();

    // Load configuration
    let config = BuildConfig::new(source_dir, out_dir)
        .map_err(|e| napi::Error::from_reason(e))?;

    // Scan files
    let all_files = lithia_native_scanner::scan_files(
        vec![config.source_root_str()],
        Some(config.ignore_patterns.clone()),
    )
    .map_err(|e| napi::Error::from_reason(format!("scan failed: {}", e)))?;

    let ts_files: Vec<FileInfo> = all_files
        .iter()
        .cloned()
        .filter(|f| f.path.ends_with(".ts"))
        .collect();

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
    print_timings(&build_result);

    if build_result.has_failures() {
        return Err(napi::Error::from_reason(format!(
            "Build completed with {} failures: {:?}",
            build_result.failures.len(),
            build_result
                .failures
                .iter()
                .take(5)
                .collect::<Vec<_>>()
        )));
    }

    build_result.total_duration_ms = start.elapsed().as_secs_f64() * 1000.0;
    println!("Total build time: {:.2}ms", build_result.total_duration_ms);

    // Generate route manifest
    let manifest_path = config.out_root.join("routes.json");
    let manifest_path_str = manifest_path.to_string_lossy().to_string();

    if let Err(e) = lithia_native_router::scan_and_process_routes(
        config.source_root_str(),
        Some(manifest_path_str.clone()),
        Some(config.out_root_str()),
        Some(config.source_root_str()),
    ) {
        eprintln!("Failed to generate route manifest: {}", e);
    } else {
        println!("Wrote route manifest: {}", manifest_path_str);
    }

    Ok(())
}
