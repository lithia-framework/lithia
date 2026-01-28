use std::path::Path;

pub fn write_sourcemap_and_code(output: &Path, code: &str, source_map: Option<String>) -> Result<(), String> {
    let map_file_name = format!(
        "{}.map",
        output
            .file_name()
            .ok_or("Invalid output file name")?
            .to_string_lossy()
    );

    let code_with_map = if source_map.is_some() {
        format!("{}\n//# sourceMappingURL={}\n", code, map_file_name)
    } else {
        code.to_string()
    };

    std::fs::write(output, code_with_map)
        .map_err(|e| format!("Failed to write output file: {}", e))?;

    if let Some(map) = source_map {
        let ext = output
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("mjs");
        let map_ext = format!("{}.map", ext);
        let map_path = output.with_extension(map_ext);
        std::fs::write(&map_path, map)
            .map_err(|e| format!("Failed to write sourcemap file: {}", e))?;
    }

    Ok(())
}
