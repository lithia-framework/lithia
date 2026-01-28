use napi_derive::napi;
use serde::Serialize;

use crate::builder::config::BuildConfig;
use crate::scanner::FileScanner;
use crate::schema_version;
use std::fs;

pub mod convention;
pub mod processor;
pub mod transformer;

#[napi(object)]
#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Event {
    pub name: String,
    pub file_path: String,
    pub namespace: Option<String>,
}

#[napi(object)]
#[derive(Serialize, Debug)]
pub struct EventsManifest {
    pub version: String,
    pub events: Vec<Event>,
}

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
                include: Some(vec!["**/*.mjs".to_string()]),
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

    let json = serde_json::to_string_pretty(&manifest)
        .map_err(|e| format!("Failed to serialize events: {}", e))?;

    let out = config.out_root.join("events.json");
    fs::write(&out, json)
        .map_err(|e| format!("Failed to write events manifest {}: {}", out.display(), e))?;

    Ok(())
}

#[cfg(test)]
mod tests;
