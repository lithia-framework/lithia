use std::{fs, env};
use std::io::Write;
use tempfile::TempDir;

use lithia_native_scanner::{NativeFileScanner, FileScanner};

fn setup_test_dir() -> std::io::Result<(TempDir, std::path::PathBuf)> {
    let cwd = env::current_dir()?;
    let temp_dir = TempDir::new_in(&cwd)?;
    let root = temp_dir.path().to_path_buf();

    let routes = root.join("routes");
    let posts = routes.join("posts");
    fs::create_dir(&routes)?;
    fs::create_dir(&posts)?;
    fs::create_dir(posts.join("[id]"))?;

    std::fs::File::create(routes.join("route.ts"))?.write_all(b"// base route")?;
    std::fs::File::create(posts.join("route.ts"))?.write_all(b"// posts route")?;
    std::fs::File::create(posts.join("[id]/route.ts"))?.write_all(b"// dynamic route")?;
    std::fs::File::create(posts.join("route.test.ts"))?.write_all(b"// test")?;
    std::fs::File::create(posts.join("route.spec.ts"))?.write_all(b"// spec")?;
    std::fs::File::create(routes.join("ignore.txt"))?;

    Ok((temp_dir, root))
}

fn get_temp_name(temp_dir: &TempDir) -> String {
    temp_dir
        .path()
        .file_name()
        .unwrap()
        .to_string_lossy()
        .to_string()
}

#[test]
fn finds_only_ts_files_excluding_tests() -> std::io::Result<()> {
    let (temp_dir, root) = setup_test_dir()?;
    let temp_name = get_temp_name(&temp_dir);

    let scanner = NativeFileScanner::new();
    let files = scanner.scan(
        &[temp_name, "routes".to_string()],
        Some(&[".test.ts".to_string(), ".spec.ts".to_string()]),
    )?;

    assert!(!files.is_empty());

    let paths: Vec<String> = files.iter().map(|f| f.path.clone()).collect();

    assert!(paths.contains(&"route.ts".to_string()));
    assert!(paths.contains(&"posts/route.ts".to_string()));
    assert!(paths.contains(&"posts/[id]/route.ts".to_string()));

    assert!(!paths.iter().any(|p| p.ends_with(".test.ts")));
    assert!(!paths.iter().any(|p| p.ends_with(".spec.ts")));

    let mut sorted = paths.clone();
    sorted.sort();
    assert_eq!(paths, sorted, "Files should be sorted");

    for file in &files {
        assert!(std::path::Path::new(&file.full_path).starts_with(&root));
        assert!(std::path::Path::new(&file.full_path).exists());
    }

    Ok(())
}

#[test]
fn returns_error_when_directory_does_not_exist() {
    let scanner = NativeFileScanner::new();

    let result = scanner.scan(&["non_existent_directory".to_string()], None);

    assert!(
        result.is_err(),
        "Should return an error for non-existent directory"
    );
    let err = result.unwrap_err();
    assert_eq!(err.kind(), std::io::ErrorKind::NotFound);
}

#[test]
fn handles_empty_directory_gracefully() -> std::io::Result<()> {
    let cwd = env::current_dir()?;
    let temp_dir = TempDir::new_in(&cwd)?;
    let temp_name = temp_dir
        .path()
        .file_name()
        .unwrap()
        .to_string_lossy()
        .to_string();

    let scanner = NativeFileScanner::new();
    let files = scanner.scan(&[temp_name], None)?;

    assert!(files.is_empty());

    Ok(())
}
