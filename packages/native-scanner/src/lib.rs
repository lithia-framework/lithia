use napi_derive::napi;

use std::{io, path::Path};

#[napi(object)]
#[derive(Debug, Clone)]
pub struct FileInfo {
    /**
     * Relative path from the scanned directory
     */
    pub path: String,

    /**
     * Absolute path from the filesystem root
     */
    pub full_path: String,
}

#[napi]
pub fn scan_files(
    path_components: Vec<String>,
    ignore: Option<Vec<String>>,
) -> Result<Vec<FileInfo>, napi::Error> {
    let scanner = NativeFileScanner::new();
    scanner
        .scan(&path_components, ignore.as_deref())
        .map_err(|e| napi::Error::from_reason(e.to_string()))
}

pub trait FileScanner {
    fn scan(
        &self,
        path_components: &[String],
        ignore: Option<&[String]>,
    ) -> io::Result<Vec<FileInfo>>;
}

#[derive(Debug, Clone)]
pub struct NativeFileScanner;

impl NativeFileScanner {
    pub fn new() -> Self {
        Self
    }

    pub fn scan_dir(&self, root: &Path, ignore: Option<&[String]>) -> io::Result<Vec<FileInfo>> {
        let mut file_infos: Vec<FileInfo> = Vec::new();

        for entry in walkdir::WalkDir::new(root)
            .into_iter()
            .filter_map(|e| e.ok())
            .filter(|e| e.file_type().is_file())
        {
            let path = entry.path();

            if !path.extension().map_or(false, |ext| ext == "ts") {
                continue;
            }

            let file_name = path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or_default();

            if let Some(ignore) = ignore {
                if ignore.iter().any(|s| file_name.ends_with(s)) {
                    continue;
                }
            }

            let full_path = path.to_path_buf();

            let relative = path
                .strip_prefix(root)
                .unwrap_or(path)
                .to_string_lossy()
                .replace('\\', "/")
                .to_string();

            file_infos.push(FileInfo {
                full_path: full_path.to_string_lossy().to_string(),
                path: relative,
            })
        }

        file_infos.sort_by(|a, b| a.path.cmp(&b.path));

        Ok(file_infos)
    }
}

impl FileScanner for NativeFileScanner {
    fn scan(
        &self,
        path_components: &[String],
        ignore: Option<&[String]>,
    ) -> io::Result<Vec<FileInfo>> {
        let cwd = std::env::current_dir()?;
        let mut target_path = cwd;

        for part in path_components {
            target_path = target_path.join(part);
        }

        if !target_path.exists() {
            return Err(io::Error::new(
                io::ErrorKind::NotFound,
                format!("Target directory {:?} does not exist", target_path),
            ));
        }

        self.scan_dir(&target_path, ignore)
    }
}

#[cfg(test)]
mod tests {
    use std::{
        fs::{self, File},
        io::Write,
        path::PathBuf,
    };

    use tempfile::TempDir;

    use super::*;

    fn setup_test_dir() -> io::Result<(TempDir, PathBuf)> {
        let cwd = std::env::current_dir()?;
        let temp_dir = TempDir::new_in(&cwd)?;
        let root = temp_dir.path().to_path_buf();

        let routes = root.join("routes");
        let posts = routes.join("posts");
        fs::create_dir(&routes)?;
        fs::create_dir(&posts)?;
        fs::create_dir(posts.join("[id]"))?;

        File::create(routes.join("route.ts"))?.write_all(b"// base route")?;
        File::create(posts.join("route.ts"))?.write_all(b"// posts route")?;
        File::create(posts.join("[id]/route.ts"))?.write_all(b"// dynamic route")?;
        File::create(posts.join("route.test.ts"))?.write_all(b"// test")?;
        File::create(posts.join("route.spec.ts"))?.write_all(b"// spec")?;
        File::create(routes.join("ignore.txt"))?;

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
    fn finds_only_ts_files_excluding_tests() -> io::Result<()> {
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
            assert!(Path::new(&file.full_path).starts_with(&root));
            assert!(Path::new(&file.full_path).exists());
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
        assert_eq!(err.kind(), io::ErrorKind::NotFound);
    }

    #[test]
    fn handles_empty_directory_gracefully() -> io::Result<()> {
        let cwd = std::env::current_dir()?;
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
}
