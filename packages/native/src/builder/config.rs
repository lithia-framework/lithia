use std::path::PathBuf;

use super::tsconfig::{parse_tsconfig, TsConfigOptions};

/// Build configuration for the TypeScript compiler.
///
/// `BuildConfig` holds paths and parsed TypeScript options used by the
/// native builder. It also provides convenient helpers to compute output
/// locations and string representations used in other modules.
#[derive(Clone, Debug)]
pub struct BuildConfig {
    /// Root directory containing the source files to compile.
    pub source_root: PathBuf,

    /// Output root directory where compiled assets will be written.
    pub out_root: PathBuf,

    /// Parsed tsconfig options used to configure the compiler.
    pub ts_config: TsConfigOptions,

    /// Glob patterns that should be ignored when scanning source files.
    pub ignore_patterns: Vec<String>,
}

impl BuildConfig {
    /// Create a new `BuildConfig` from `source_root` and `out_root` strings.
    ///
    /// This function attempts to parse `tsconfig.json` in the current
    /// working directory to populate compiler options. It returns an error
    /// string when parsing fails.
    pub fn new(source_root: String, out_root: String) -> Result<Self, String> {
        let tsconfig_path = PathBuf::from("tsconfig.json");
        let ts_config = parse_tsconfig(Some(&tsconfig_path))?;

        let source_root = PathBuf::from(source_root);
        let out_root = PathBuf::from(out_root);

        Ok(Self {
            source_root,
            out_root,
            ts_config,
            ignore_patterns: vec![".test.ts".to_string(), ".spec.ts".to_string()],
        })
    }

    /// Return the `source_root` as a UTF-8 lossily converted `String`.
    pub fn source_root_str(&self) -> String {
        self.source_root.to_string_lossy().to_string()
    }

    /// Return the `out_root` as a UTF-8 lossily converted `String`.
    pub fn output_path_str(&self) -> String {
        self.out_root.to_string_lossy().to_string()
    }

    /// Compute the output path for a given input relative path.
    ///
    /// The function appends `input_relative` to the `out_root` and changes
    /// the extension to `.js` (e.g. `src/users/route.ts` ->
    /// `<out_root>/src/users/route.js`).
    pub fn compute_output_path(&self, input_relative: &str) -> PathBuf {
        let mut out_path = self.out_root.clone();
        out_path.push(input_relative);
        out_path.set_extension("js");
        out_path
    }
}
