use napi_derive::napi;
use serde::Serialize;
use std::fs;

use crate::convention::MatchedMethodSuffix;
use crate::processor::{NativeRouteProcessor, RouteProcessor};

mod convention;
pub mod processor;
mod transformer;

#[napi(object)]
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Route {
    pub method: Option<String>,
    pub path: String,
    pub dynamic: bool,
    pub file_path: String,
    pub source_file_path: String,
    pub regex: String,
}

pub struct RouteCore {
    pub method: Option<MatchedMethodSuffix>,
    pub path: String,
    pub dynamic: bool,
    pub file_path: String,
    pub source_file_path: String,
    pub regex: String,
}

impl From<RouteCore> for Route {
    fn from(core: RouteCore) -> Self {
        Self {
            method: core.method.map(|m| m.as_str().to_string()),
            path: core.path,
            dynamic: core.dynamic,
            file_path: core.file_path,
            source_file_path: core.source_file_path,
            regex: core.regex,
        }
    }
}

#[napi]
pub fn scan_and_process_routes(
    routes_dir: String,
    output_file: Option<String>,
    out_dir: Option<String>,
    source_root: Option<String>,
) -> napi::Result<Vec<Route>> {
    let files = lithia_native_scanner::scan_files(vec![routes_dir.clone()], None)
        .map_err(|e| napi::Error::from_reason(format!("Failed to scan directory: {}", e)))?;

    let processor = NativeRouteProcessor::new(None, None);
    let mut routes: Vec<Route> = files
        .iter()
        .map(|file| processor.process_route_file(file))
        .map(Route::from)
        .collect();

    // if an out_dir is provided, compute JS file paths for each route based on source_file_path
    if let Some(out) = out_dir {
        // determine source root
        let src_root = if let Some(sr) = source_root {
            std::path::PathBuf::from(sr)
        } else {
            std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from(".")).join("src")
        };

        for r in &mut routes.iter_mut() {
            let src_path = std::path::Path::new(&r.source_file_path);
            if let Ok(rel) = src_path.strip_prefix(&src_root) {
                let mut out_path = std::path::Path::new(&out).join(rel);
                out_path.set_extension("js");
                r.file_path = out_path.to_string_lossy().to_string();
            } else {
                // fallback: make JS path under out using original relative file path
                let mut out_path = std::path::Path::new(&out).join(&r.file_path);
                out_path.set_extension("js");
                r.file_path = out_path.to_string_lossy().to_string();
            }
        }
    }

    let json = serde_json::to_string_pretty(&routes)
        .map_err(|e| napi::Error::from_reason(format!("Failed to serialize routes: {}", e)))?;

    let output_path = output_file.unwrap_or_else(|| "routes.json".to_string());
    fs::write(&output_path, json)
        .map_err(|e| napi::Error::from_reason(format!("Failed to write file: {}", e)))?;

    Ok(routes)
}
