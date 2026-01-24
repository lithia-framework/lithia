use serde_json::json;
use std::path::Path;

/// Generate a minimal source map for debugging
pub fn generate_sourcemap(
    input_path: &Path,
    output_path: &Path,
    source_content: &str,
) -> Result<String, String> {
    let input_file_name = input_path
        .file_name()
        .ok_or("Invalid input file name")?
        .to_string_lossy();

    let output_file_name = output_path
        .file_name()
        .ok_or("Invalid output file name")?
        .to_string_lossy();

    let map = json!({
        "version": 3,
        "file": output_file_name,
        "sources": [input_file_name],
        "sourcesContent": [source_content],
        "names": [],
        "mappings": ""
    });

    serde_json::to_string(&map).map_err(|e| format!("Failed to serialize sourcemap: {}", e))
}

/// Write source map file and add sourceMappingURL to code
pub fn write_sourcemap_and_code(
    output_path: &Path,
    code: String,
    source_map: String,
) -> Result<(), String> {
    let map_file_name = format!(
        "{}.map",
        output_path
            .file_name()
            .ok_or("Invalid output file name")?
            .to_string_lossy()
    );

    let code_with_map = format!("{}\n//# sourceMappingURL={}\n", code, map_file_name);

    std::fs::write(output_path, code_with_map)
        .map_err(|e| format!("Failed to write output file: {}", e))?;

    let map_path = output_path.with_extension("js.map");
    std::fs::write(&map_path, source_map)
        .map_err(|e| format!("Failed to write sourcemap file: {}", e))?;

    Ok(())
}
