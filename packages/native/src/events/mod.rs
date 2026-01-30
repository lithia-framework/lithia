//!
//! @fileoverview Event Manifest Generator (Native).
//! Scans the compiled build artifacts to create a registry of all discovered events,
//! enabling fast event-to-handler lookups during runtime.
//!

use napi_derive::napi;
use serde::Serialize;
use std::fs;

use crate::builder::config::BuildConfig;
use crate::scanner::{FileScanner, NativeFileScanner, ScanOptions};
use crate::schema_version;

pub mod convention;
pub mod processor;
pub mod transformer;

/// Represents an individual event discovered in the project.
#[napi(object)]
#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Event {
    /// The logical name of the event (e.g., "user.signup").
    pub name: String,
    /// The physical path to the compiled .mjs handler file.
    pub file_path: String,
    /// Optional grouping for logical event isolation.
    pub namespace: Option<String>,
}

/// The final structure of the generated events.json file.
#[napi(object)]
#[derive(Serialize, Debug)]
pub struct EventsManifest {
    /// Schema version for compatibility checks.
    pub version: String,
    /// Flat list of all registered events.
    pub events: Vec<Event>,
}

/**
 * Scans the output directory and generates a metadata manifest for events.
 * * @param config The active build configuration.
 */
pub fn write_events_manifest(config: &BuildConfig) -> Result<(), String> {
    let events_output_dir = config.out_root.join("app").join("events");

    // If no events directory exists in the build output, there's nothing to manifest.
    if !events_output_dir.exists() {
        return Ok(());
    }

    // 1. Scan for compiled JavaScript event handlers (.mjs)
    let event_files = NativeFileScanner::new()
        .scan_dir(
            &[
                config.output_path_str(),
                "app".to_string(),
                "events".to_string(),
            ],
            Some(ScanOptions {
                include: Some(vec!["**/*.mjs".to_string(), "**/*.js".to_string()]),
                ignore: None,
            }),
        )
        .map_err(|e| format!("Discovery Scan Error: {}", e))?;

    // 2. Process discovered files into Event objects
    // The processor handles naming conventions and namespace extraction.
    let processor = processor::NativeEventProcessor::new(None, None);
    let events = processor.process(&event_files);

    if events.is_empty() {
        return Ok(());
    }

    // 3. Assemble the Manifest
    let manifest = EventsManifest {
        version: schema_version().to_string(),
        events,
    };

    // 4. Serialize to JSON and write to the root of the output directory
    let json = serde_json::to_string_pretty(&manifest)
        .map_err(|e| format!("Serialization Error: {}", e))?;

    let out_file = config.out_root.join("events.json");
    fs::write(&out_file, json)
        .map_err(|e| format!("IO Error: Failed to write event manifest: {}", e))?;

    Ok(())
}

#[cfg(test)]
mod tests;
