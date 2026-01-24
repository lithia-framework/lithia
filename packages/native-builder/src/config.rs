use std::path::PathBuf;

use crate::tsconfig::{parse_tsconfig, TsConfigOptions};

/// Build configuration for the TypeScript compiler
#[derive(Clone, Debug)]
pub struct BuildConfig {
    pub source_root: PathBuf,
    pub out_root: PathBuf,
    pub ts_config: TsConfigOptions,
    pub ignore_patterns: Vec<String>,
}

impl BuildConfig {
    pub fn new(source_dir: Option<String>, out_dir: Option<String>) -> Result<Self, String> {
        let source_root = PathBuf::from(source_dir.unwrap_or_else(|| "src".to_string()));
        let out_root = PathBuf::from(out_dir.unwrap_or_else(|| "dist".to_string()));

        let tsconfig_path = source_root.join("tsconfig.json");
        let ts_config = parse_tsconfig(Some(&tsconfig_path))?;

        Ok(Self {
            source_root,
            out_root,
            ts_config,
            ignore_patterns: vec![".test.ts".to_string(), ".spec.ts".to_string()],
        })
    }

    pub fn source_root_str(&self) -> String {
        self.source_root.to_string_lossy().to_string()
    }

    pub fn output_path_str(&self) -> String {
        self.out_root.to_string_lossy().to_string()
    }

    pub fn compute_output_path(&self, input_relative: &str) -> PathBuf {
        let mut out_path = self.out_root.clone();
        out_path.push(input_relative);
        out_path.set_extension("js");
        out_path
    }
}
