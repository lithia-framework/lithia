use napi_derive::napi;
use rayon::prelude::*;
use std::{fs, time::Instant};

pub mod compiler;
pub mod paths_rewriter;
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
pub fn build_project(source_root: String, out_root: String) -> napi::Result<()> {
    let start = Instant::now();

    let config =
        BuildConfig::new(source_root, out_root).map_err(napi::Error::from_reason)?;

    fs::remove_dir_all(&config.out_root).ok();

    use crate::scanner::FileScanner;
    let ts_files = crate::scanner::NativeFileScanner::new()
        .scan_dir(
            &[config.source_root_str()],
            Some(crate::scanner::ScanOptions {
                include: Some(vec!["**/*.mts".to_string()]),
                ignore: Some(config.ignore_patterns.clone()),
            }),
        )
        .map_err(|e| napi::Error::from_reason(format!("scan failed: {}", e)))?;

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
                .compile_file(std::path::Path::new(&file.full_path), &output_path)
                .map(|_| CompileResult {
                    output_path: output_path.to_string_lossy().to_string(),
                    duration_ms: file_start.elapsed().as_secs_f64() * 1000.0,
                })
        })
        .collect();

    let mut build_result = BuildResult::new(start.elapsed().as_secs_f64() * 1000.0);
    build_result.files_compiled = ts_files.len();

    for result in results {
        match result {
            Ok(timing) => build_result.timings.push(timing),
            Err(e) => build_result.failures.push(e),
        }
    }


    if build_result.has_failures() {
        let failures_msg = build_result
            .failures
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

    crate::router::write_routes_manifest(&config).map_err(napi::Error::from_reason)?;
    crate::events::write_events_manifest(&config).map_err(napi::Error::from_reason)?;

    Ok(())
}
