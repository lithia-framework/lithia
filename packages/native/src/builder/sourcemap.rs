use std::path::Path;

/// Write compiled `code` and its optional `source_map` to disk.
///
/// When `source_map` is `Some`, this function writes both the `.js` file and
/// the corresponding `.js.map` alongside it. The `.js` file will include a
/// `//# sourceMappingURL=<file>.map` comment so runtimes and devtools can
/// automatically discover the map. If `source_map` is `None`, only the
/// `.js` file is written.
pub fn write_sourcemap_and_code(output: &Path, code: &str, source_map: Option<String>) -> Result<(), String> {
    let map_file_name = format!(
        "{}.map",
        output
            .file_name()
            .ok_or("Invalid output file name")?
            .to_string_lossy()
    );

    // When a sourcemap is present, append the sourceMappingURL comment.
    let code_with_map = if source_map.is_some() {
        format!("{}\n//# sourceMappingURL={}\n", code, map_file_name)
    } else {
        code.to_string()
    };

    std::fs::write(output, code_with_map)
        .map_err(|e| format!("Failed to write output file: {}", e))?;

    if let Some(map) = source_map {
        let map_path = output.with_extension("js.map");
        std::fs::write(&map_path, map)
            .map_err(|e| format!("Failed to write sourcemap file: {}", e))?;
    }

    Ok(())
}
