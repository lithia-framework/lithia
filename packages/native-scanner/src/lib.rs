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
