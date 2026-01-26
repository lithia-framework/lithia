use serde_json::Value;
use std::path::Path;

use swc_ecma_ast::EsVersion;

/// Parsed TypeScript configuration options relevant for the native builder.
/// This struct captures only the small subset of `tsconfig.json` that the
/// builder needs: whether to emit source maps and the target ECMAScript
/// version.
#[derive(Debug, Clone)]
pub struct TsConfigOptions {
    /// Whether to generate source maps during compilation.
    pub emit_sourcemap: bool,

    /// SWC `EsVersion` target inferred from `compilerOptions.target`.
    pub target: EsVersion,

    /// Base URL for non-relative module resolution.
    pub base_url: Option<std::path::PathBuf>,

    /// Path mappings for module resolution.
    pub paths: Vec<(String, Vec<String>)>,
}

/// Parse a `tsconfig.json` file from `path` (optional) and return
/// `TsConfigOptions` used by the builder.
/// 
/// If `path` is `None`, the function will attempt to read `tsconfig.json`
/// from the current working directory. If the file does not exist or cannot be
/// parsed, reasonable defaults are returned and an `Ok` result is produced
/// (the builder treats missing or invalid config as non-fatal by design).
pub fn parse_tsconfig(path: Option<&Path>) -> Result<TsConfigOptions, String> {
    let default_config = TsConfigOptions {
        emit_sourcemap: true,
        target: EsVersion::Es2022,
        base_url: None,
        paths: Vec::new(),
    };

    let path = match path {
        Some(p) => p.to_path_buf(),
        None => {
            let cwd = std::env::current_dir().unwrap();
            cwd.join("tsconfig.json")
        }
    };

    if !path.exists() {
        // do not print from native side; using default config
        return Ok(default_config);
    }

    let s = std::fs::read_to_string(&path)
        .map_err(|e| format!("failed to read tsconfig {}: {}", path.display(), e))?;

    let v: Value = serde_json::from_str(&s)
        .map_err(|e| format!("failed to parse tsconfig {}: {}", path.display(), e))?;

    // Hardcoded options as per requirements
    let emit_sourcemap = true;
    let target = EsVersion::Es2022;
    
    let mut base_url = None;
    let mut paths = Vec::new();

    if let Some(opts) = v.get("compilerOptions") {
        // Enforce sourceMap and target:
        // We do *not* read sourceMap or target from tsconfig anymore.
        // They are always true and ES2022 respectively.

        if let Some(base) = opts.get("baseUrl").and_then(|v| v.as_str()) {
             let tsconfig_dir = path.parent().unwrap_or_else(|| Path::new("."));
             base_url = Some(tsconfig_dir.join(base));
        }

        if let Some(p) = opts.get("paths").and_then(|v| v.as_object()) {
            // implicit baseUrl if paths are present but baseUrl is missing
            if base_url.is_none() {
                 let tsconfig_dir = path.parent().unwrap_or_else(|| Path::new("."));
                 base_url = Some(tsconfig_dir.to_path_buf());
            }

            for (k, v) in p {
                let targets = if let Some(arr) = v.as_array() {
                    arr.iter().filter_map(|x| x.as_str().map(|s| s.to_string())).collect()
                } else {
                    vec![]
                };
                paths.push((k.clone(), targets));
            }
        }
    }

    Ok(TsConfigOptions {
        emit_sourcemap,
        target,
        base_url,
        paths,
    })
}
