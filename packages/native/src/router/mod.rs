//!
//! @fileoverview Router Manifest Generator (Native).
//! Orchestrates the discovery of route files and the generation of the
//! routes.json manifest used by the Lithia runtime.
//!

use napi_derive::napi;
use serde::Serialize;
use std::fs;

use crate::{
    builder::config::BuildConfig,
    router::{
        convention::MatchedMethodSuffix,
        processor::{NativeRouteProcessor, RouteProcessor},
    },
    scanner::{FileScanner, NativeFileScanner, ScanOptions},
    schema_version,
};

pub mod convention;
pub mod processor;
pub mod transformer;

/// Serializable route representation sent to the host (N-API).
#[napi(object)]
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Route {
    /// Uppercase HTTP method (GET, POST, etc.) or null for 'all'.
    pub method: Option<String>,
    /// Normalized URL path (e.g., /users/:id).
    pub path: String,
    /// Indicates if the path contains variable segments.
    pub dynamic: bool,
    /// Path to the compiled .mjs file on disk.
    pub file_path: String,
    /// Regex string used by the runtime for fast URL matching.
    pub regex: String,
}

/// The top-level manifest file structure.
#[napi(object)]
#[derive(Serialize)]
pub struct RoutesManifest {
    pub version: String,
    pub routes: Vec<Route>,
}

/// Internal Rust representation with typed method suffixes.
pub struct RouteCore {
    pub method: Option<MatchedMethodSuffix>,
    pub path: String,
    pub dynamic: bool,
    pub file_path: String,
    pub regex: String,
}

/// Conversion logic to transform internal types into JS-compatible types.
impl From<RouteCore> for Route {
    fn from(core: RouteCore) -> Self {
        Self {
            method: core.method.map(|m| m.as_str().to_string()),
            path: core.path,
            dynamic: core.dynamic,
            file_path: core.file_path,
            regex: core.regex,
        }
    }
}

/**
 * Scans the build output for compiled route handlers and writes the manifest.
 * * @param config The current build configuration.
 */
pub fn write_routes_manifest(config: &BuildConfig) -> Result<(), String> {
    let routes_dir = config.out_root.join("app").join("routes");

    // Early return if no routes exist in the project.
    if !routes_dir.exists() {
        return Ok(());
    }

    // 1. Scan the output directory for compiled .mjs route files.
    let route_files = NativeFileScanner::new()
        .scan_dir(
            &[
                config.output_path_str(),
                "app".to_string(),
                "routes".to_string(),
            ],
            Some(ScanOptions {
                include: Some(vec!["**/*.mjs".to_string(), "**/*.js".to_string()]),
                ignore: None,
            }),
        )
        .map_err(|e| format!("Router scan failed: {}", e))?;

    // 2. Process files into logical route definitions.
    let processor = NativeRouteProcessor::new(None, None);
    let routes: Vec<Route> = route_files
        .iter()
        .map(|file| processor.process_route_file(file))
        .map(Route::from)
        .collect();

    // 3. Serialize the Manifest to the root of the output folder.
    let manifest = RoutesManifest {
        version: schema_version().to_string(),
        routes,
    };

    let json = serde_json::to_string_pretty(&manifest)
        .map_err(|e| format!("Failed to serialize routes: {}", e))?;

    let manifest_path = config.out_root.join("routes.json");
    fs::write(&manifest_path, json).map_err(|e| {
        format!(
            "Failed to write routes manifest {}: {}",
            manifest_path.display(),
            e
        )
    })?;

    Ok(())
}
