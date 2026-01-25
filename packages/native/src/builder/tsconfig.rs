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
}

fn normalize_target(s: &str) -> String {
    s.trim().to_lowercase().replace('-', "").replace('_', "")
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
        target: EsVersion::EsNext,
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

    let mut emit_sourcemap = true;
    let mut target = EsVersion::Es5;

    if let Some(opts) = v.get("compilerOptions") {
        if let Some(sm) = opts.get("sourceMap").and_then(|v| v.as_bool()) {
            emit_sourcemap = sm;
        }

        if let Some(t) = opts.get("target") {
            if let Some(s) = t.as_str() {
                target = ts_target_to_esversion(s);
            } else if let Some(n) = t.as_i64() {
                // numeric year or ES version
                target = match n {
                    3 => EsVersion::Es3,
                    5 => EsVersion::Es5,
                    2015 => EsVersion::Es2015,
                    2016 => EsVersion::Es2016,
                    2017 => EsVersion::Es2017,
                    2018 => EsVersion::Es2018,
                    2019 => EsVersion::Es2019,
                    2020 => EsVersion::Es2020,
                    2021 => EsVersion::Es2021,
                    2022 => EsVersion::Es2022,
                    2023 => EsVersion::Es2023,
                    _ => EsVersion::Es5,
                }
            }
        }
    }

    Ok(TsConfigOptions {
        emit_sourcemap,
        target,
    })
}

/// Convert a TypeScript `compilerOptions.target` value into SWC's `EsVersion`.
/// The input may be a string (e.g. `"ES2020"`, `"esnext"`) or a numeric
/// value (e.g. `2015`). The function performs normalization before matching
/// known variants and falls back to the default `EsVersion` when the input is
/// unknown.
pub fn ts_target_to_esversion<S: AsRef<str>>(input: S) -> EsVersion {
    let s = normalize_target(input.as_ref());

    match s.as_str() {
        "es3" => EsVersion::Es3,
        "es5" => EsVersion::Es5,
        "es2015" => EsVersion::Es2015,
        "es2016" => EsVersion::Es2016,
        "es2017" => EsVersion::Es2017,
        "es2018" => EsVersion::Es2018,
        "es2019" => EsVersion::Es2019,
        "es2020" => EsVersion::Es2020,
        "es2021" => EsVersion::Es2021,
        "es2022" => EsVersion::Es2022,
        "es2023" => EsVersion::Es2023,
        "es2024" => EsVersion::Es2024,
        "esnext" => EsVersion::EsNext,
        _ => Default::default(),
    }
}
