use napi_derive::napi;
use serde::Serialize;

use crate::builder::config::BuildConfig;
use crate::scanner::FileScanner;
use crate::schema_version;
use std::fs;

pub mod convention;
pub mod processor;
pub mod transformer;

/// Serializable event representation sent to the host (N-API).
#[napi(object)]
#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Event {
    /// Event name (e.g., "chat:message" or "connection")
    pub name: String,

    /// Absolute filesystem path to the compiled handler (JS) file.
    pub file_path: String,

    /// Optional namespace (e.g., "chat" for "chat:message").
    pub namespace: Option<String>,
}

/// Manifest containing all discovered events, serializable to the host.
#[napi(object)]
#[derive(Serialize, Debug)]
pub struct EventsManifest {
    /// Manifest version string.
    pub version: String,

    /// List of events.
    pub events: Vec<Event>,
}

/// Generate and write `events.json` manifest based on scanned TypeScript files.
///
/// Uses the already-scanned `ts_files` (source files) and the provided
/// `BuildConfig` to map source files to their compiled output and produce the
/// final manifest next to `routes.json`.
pub fn write_events_manifest(config: &BuildConfig) -> Result<(), String> {
    let events_path = config.out_root.join("app").join("events");
    if !events_path.exists() {
        return Ok(());
    }

    let event_files = crate::scanner::NativeFileScanner::new()
        .scan_dir(
            &[
                config.output_path_str(),
                "app".to_string(),
                "events".to_string(),
            ],
            Some(crate::scanner::ScanOptions {
                include: Some(vec!["**/*.js".to_string()]),
                ignore: None,
            }),
        )
        .map_err(|e| format!("scan failed: {}", e))?;

    let processor = processor::NativeEventProcessor::new(None, None);
    let events = processor.process(&event_files);

    if events.is_empty() {
        return Ok(());
    }

    let manifest = EventsManifest {
        version: schema_version().to_string(),
        events,
    };

    let json = serde_json::to_string(&manifest)
        .map_err(|e| format!("Failed to serialize events: {}", e))?;

    let out = config.out_root.join("events.json");
    fs::write(&out, json)
        .map_err(|e| format!("Failed to write events manifest {}: {}", out.display(), e))?;

    Ok(())
}

#[cfg(test)]
mod tests;
