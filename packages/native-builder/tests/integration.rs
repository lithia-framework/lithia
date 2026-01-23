use std::{env, fs};

use tempfile::TempDir;

use lithia_native_builder::build_project;

#[test]
fn builds_simple_ts_files() -> Result<(), Box<dyn std::error::Error>> {
    let cwd = env::current_dir()?;
    let temp = TempDir::new_in(&cwd)?;
    let temp_name = temp
        .path()
        .file_name()
        .unwrap()
        .to_string_lossy()
        .to_string();

    let src = temp.path().join("src");
    fs::create_dir_all(&src)?;

    fs::write(src.join("index.ts"), "export const x: number = 1;")?;

    let out = temp.path().join("out");

    let res = build_project(format!("{}/src", temp_name), Some(out.to_string_lossy().to_string()));
    assert!(res.is_ok());

    let out_file = out.join("index.js");
    assert!(out_file.exists(), "Expected compiled file at {:?}", out_file);

    Ok(())
}

#[test]
fn fails_on_invalid_ts() -> Result<(), Box<dyn std::error::Error>> {
    let cwd = env::current_dir()?;
    let temp = TempDir::new_in(&cwd)?;
    let temp_name = temp
        .path()
        .file_name()
        .unwrap()
        .to_string_lossy()
        .to_string();

    let src = temp.path().join("src");
    fs::create_dir_all(&src)?;

    fs::write(src.join("bad.ts"), "export const = ;")?;

    let out = temp.path().join("out");

    let res = build_project(format!("{}/src", temp_name), Some(out.to_string_lossy().to_string()));
    assert!(res.is_err(), "Expected build to fail for invalid TypeScript");

    Ok(())
}
