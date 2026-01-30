/**
 * @fileoverview Build Configuration (Native).
 * Manages the environment settings for the compiler, including root directories,
 * tsconfig options, and file exclusion patterns.
 */

use std::path::{Path, PathBuf};
use super::tsconfig::{parse_tsconfig, TsConfigOptions};

#[derive(Clone, Debug)]
pub struct BuildConfig {
    /// The absolute or relative path to the TypeScript source files.
    pub source_root: PathBuf,
    /// The target directory where compiled JavaScript files will be placed.
    pub out_root: PathBuf,
    /// Parsed options from the project's tsconfig.json.
    pub ts_config: TsConfigOptions,
    /// File patterns that should be skipped during the build process.
    pub ignore_patterns: Vec<String>,
}

impl BuildConfig {
    /// Initializes a new Build Configuration by parsing the local tsconfig.
    pub fn new(source_root: String, out_root: String) -> Result<Self, String> {
        // We look for tsconfig.json in the current working directory
        let tsconfig_path = PathBuf::from("tsconfig.json");
        let ts_config = parse_tsconfig(Some(&tsconfig_path))?;

        Ok(Self {
            source_root: PathBuf::from(source_root),
            out_root: PathBuf::from(out_root),
            ts_config,
            // Default ignore patterns for testing files
            ignore_patterns: vec![
                ".test.mts".to_string(), 
                ".spec.mts".to_string(),
                ".test.ts".to_string(),
                ".spec.ts".to_string(),
            ],
        })
    }

    /// Returns the source root path as a lossy string.
    pub fn source_root_str(&self) -> String {
        self.source_root.to_string_lossy().into_owned()
    }

    /// Returns the output root path as a lossy string.
    pub fn output_path_str(&self) -> String {
        self.out_root.to_string_lossy().into_owned()
    }

    /// Computes the destination path for a given input file relative to the source root.
    /// Changes the extension to .mjs to ensure ESM compatibility in Node.js.
    pub fn compute_output_path(&self, input_relative: &Path) -> PathBuf {
        let mut out_path = self.out_root.clone();
        out_path.push(input_relative);
        
        // Ensure the output is always treated as an ES Module (.mjs)
        out_path.set_extension("mjs");
        out_path
    }
}