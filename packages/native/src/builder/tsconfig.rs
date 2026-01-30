//!
//! @fileoverview TsConfig Parser (Native).
//! Extracts path aliases from the project's TypeScript configuration.
//! Supports standard JSON and attempts to handle common configuration structures.
//!

use serde_json::Value;
use std::path::Path;

/// Relevant TypeScript configuration options for the Lithia compiler.
#[derive(Debug, Clone)]
pub struct TsConfigOptions {
    /// Mapping of path aliases, e.g., ("@/*", ["src/*"])
    pub paths: Vec<(String, Vec<String>)>,
}

/**
 * Parses a tsconfig.json file to extract path mapping information.
 * * @param path Optional path to the config file; defaults to 'tsconfig.json' in CWD.
 * @returns A result containing the parsed options or an error message.
 */
pub fn parse_tsconfig(path: Option<&Path>) -> Result<TsConfigOptions, String> {
    let default_config = TsConfigOptions { paths: Vec::new() };

    let target_path = match path {
        Some(p) => p.to_path_buf(),
        None => std::env::current_dir()
            .map(|cwd| cwd.join("tsconfig.json"))
            .map_err(|e| format!("Failed to determine current directory: {}", e))?,
    };

    // If no config exists, we fall back to defaults (no aliases)
    if !target_path.exists() {
        return Ok(default_config);
    }

    let raw_content = std::fs::read_to_string(&target_path)
        .map_err(|e| format!("IO Error: Failed to read {}: {}", target_path.display(), e))?;

    // Note: Some tsconfigs contain comments or trailing commas.
    // In a production environment, you might want to use a JSONC parser.
    let json: Value = serde_json::from_str(&raw_content).map_err(|e| {
        format!(
            "Parse Error: Invalid JSON in {}: {}",
            target_path.display(),
            e
        )
    })?;

    let mut paths = Vec::new();

    // Navigate the JSON tree: compilerOptions -> paths
    if let Some(compiler_options) = json.get("compilerOptions") {
        if let Some(paths_obj) = compiler_options.get("paths").and_then(|v| v.as_object()) {
            for (alias, targets_val) in paths_obj {
                let targets = if let Some(arr) = targets_val.as_array() {
                    arr.iter()
                        .filter_map(|val| val.as_str().map(|s| s.to_string()))
                        .collect()
                } else if let Some(single_str) = targets_val.as_str() {
                    // Support non-array single string targets if they exist
                    vec![single_str.to_string()]
                } else {
                    vec![]
                };

                paths.push((alias.clone(), targets));
            }
        }
    }

    Ok(TsConfigOptions { paths })
}
