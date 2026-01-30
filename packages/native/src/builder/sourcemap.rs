//!
//! @fileoverview Source Map Utility (Native).
//! Handles the persistence of compiled code and its corresponding source map,
//! ensuring the 'sourceMappingURL' comment is correctly appended.
//!

use std::fs;
use std::path::Path;

/**
 * Writes the compiled code and its source map to the file system.
 * Appends the necessary linking comment to the bottom of the code file.
 * * @param output The path to the destination .mjs file.
 * @param code The generated JavaScript code.
 * @param source_map The JSON string representation of the source map.
 */
pub fn write_sourcemap_and_code(
    output: &Path,
    code: &str,
    source_map: Option<String>,
) -> Result<(), String> {
    // 1. Determine the source map filename (e.g., "index.mjs" -> "index.mjs.map")
    let file_name = output
        .file_name()
        .ok_or_else(|| format!("Invalid output path: {}", output.display()))?
        .to_string_lossy();

    let map_file_name = format!("{}.map", file_name);

    // 2. Prepare the code with the source map comment if applicable
    let code_with_map = match source_map {
        Some(_) => format!(
            "{}\n//# sourceMappingURL={}\n",
            code.trim_end(),
            map_file_name
        ),
        None => code.to_string(),
    };

    // 3. Write the compiled JavaScript file
    fs::write(output, code_with_map).map_err(|e| {
        format!(
            "IO Error: Failed to write output file {}: {}",
            output.display(),
            e
        )
    })?;

    // 4. Write the source map file if it exists
    if let Some(map_content) = source_map {
        let map_path = output.with_extension(format!(
            "{}.map",
            output.extension().and_then(|e| e.to_str()).unwrap_or("mjs")
        ));

        fs::write(&map_path, map_content).map_err(|e| {
            format!(
                "IO Error: Failed to write sourcemap {}: {}",
                map_path.display(),
                e
            )
        })?;
    }

    Ok(())
}
