use serde_json::Value;
use std::path::Path;
#[derive(Debug, Clone)]
pub struct TsConfigOptions {
    pub paths: Vec<(String, Vec<String>)>,
}

pub fn parse_tsconfig(path: Option<&Path>) -> Result<TsConfigOptions, String> {
    let default_config = TsConfigOptions {
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
        return Ok(default_config);
    }

    let s = std::fs::read_to_string(&path)
        .map_err(|e| format!("failed to read tsconfig {}: {}", path.display(), e))?;

    let v: Value = serde_json::from_str(&s)
        .map_err(|e| format!("failed to parse tsconfig {}: {}", path.display(), e))?;

    // Hardcoded options as per requirements
    let mut paths = Vec::new();

    if let Some(opts) = v.get("compilerOptions") {
        if let Some(p) = opts.get("paths").and_then(|v| v.as_object()) {
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
        paths,
    })
}
