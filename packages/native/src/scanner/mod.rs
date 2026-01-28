use globset::{Glob, GlobSetBuilder};
use napi_derive::napi;

use std::io;

#[napi(object)]
#[derive(Debug, Clone)]
pub struct FileInfo {
    pub path: String,
    pub full_path: String,
}

#[napi(object)]
#[derive(Debug, Clone, Default)]
pub struct ScanOptions {
    pub include: Option<Vec<String>>,
    pub ignore: Option<Vec<String>>,
}

pub trait FileScanner {
    fn scan_dir(
        &self,
        path_components: &[String],
        options: Option<ScanOptions>,
    ) -> io::Result<Vec<FileInfo>>;
}

#[derive(Debug, Clone)]
pub struct NativeFileScanner;

impl NativeFileScanner {
    pub fn new() -> Self {
        Self
    }
}

impl FileScanner for NativeFileScanner {
    fn scan_dir(
        &self,
        path_components: &[String],
        options: Option<ScanOptions>,
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

        let options = options.unwrap_or_default();

        let include_patterns = match options.include {
            Some(patterns) if !patterns.is_empty() => patterns,
            _ => return Ok(Vec::new()),
        };

        let mut include_builder = GlobSetBuilder::new();
        for pattern in &include_patterns {
            let glob = Glob::new(pattern).map_err(|e| {
                io::Error::new(
                    io::ErrorKind::InvalidInput,
                    format!("Invalid include glob pattern '{}': {}", pattern, e),
                )
            })?;
            include_builder.add(glob);
        }
        let include_matcher = include_builder.build().map_err(|e| {
            io::Error::new(
                io::ErrorKind::InvalidInput,
                format!("Failed to build include matcher: {}", e),
            )
        })?;

        let ignore_matcher = if let Some(ignore_patterns) = options.ignore {
            let mut ignore_builder = GlobSetBuilder::new();
            for pattern in &ignore_patterns {
                let glob = Glob::new(pattern).map_err(|e| {
                    io::Error::new(
                        io::ErrorKind::InvalidInput,
                        format!("Invalid ignore glob pattern '{}': {}", pattern, e),
                    )
                })?;
                ignore_builder.add(glob);
            }
            Some(ignore_builder.build().map_err(|e| {
                io::Error::new(
                    io::ErrorKind::InvalidInput,
                    format!("Failed to build ignore matcher: {}", e),
                )
            })?)
        } else {
            None
        };

        let mut file_infos: Vec<FileInfo> = Vec::new();

        for entry in walkdir::WalkDir::new(&target_path)
            .into_iter()
            .filter_map(|e| e.ok())
            .filter(|e| e.file_type().is_file())
        {
            let path = entry.path();
            let relative = path
                .strip_prefix(&target_path)
                .unwrap_or(path)
                .to_string_lossy()
                .replace('\\', "/");

            if !include_matcher.is_match(&relative) {
                continue;
            }

            if let Some(ref ignore) = ignore_matcher {
                if ignore.is_match(&relative) {
                    continue;
                }
            }

            file_infos.push(FileInfo {
                full_path: path.to_string_lossy().to_string(),
                path: relative,
            });
        }

        file_infos.sort_by(|a, b| a.path.cmp(&b.path));

        Ok(file_infos)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{fs, path::Path};
    use tempfile::TempDir;

    fn create_test_files(dir: &Path) -> io::Result<()> {
        fs::create_dir_all(dir.join("src"))?;
        fs::create_dir_all(dir.join("dist"))?;
        fs::create_dir_all(dir.join("tests"))?;

        // TypeScript module files
        fs::write(dir.join("src/index.mts"), "export default {}")?;
        fs::write(dir.join("src/utils.mts"), "export const util = 1")?;


        // Test files
        fs::write(dir.join("tests/index.test.mts"), "test('works', () => {})")?;

        // JSON files
        fs::write(dir.join("package.json"), "{}")?;
        fs::write(dir.join("tsconfig.json"), "{}")?;

        // (No JavaScript build output in MTS-only mode)

        Ok(())
    }

    #[test]
    fn test_scan_with_default_ts_pattern() {
        let temp_dir = TempDir::new().unwrap();
        create_test_files(temp_dir.path()).unwrap();

        let scanner = NativeFileScanner::new();
        let result = scanner
            .scan_dir(&[temp_dir.path().to_string_lossy().to_string()], None)
            .unwrap();

        // Sem include patterns, não deve retornar nada
        assert_eq!(result.len(), 0);
    }

    #[test]
    fn test_scan_typescript_files() {
        let temp_dir = TempDir::new().unwrap();
        create_test_files(temp_dir.path()).unwrap();

        let scanner = NativeFileScanner::new();
        let result = scanner
            .scan_dir(
                &[temp_dir.path().to_string_lossy().to_string()],
                Some(ScanOptions {
                    include: Some(vec!["**/*.mts".to_string()]),
                    ignore: None,
                }),
            )
            .unwrap();

        // Should find only .mts files (including tests)
        let paths: Vec<_> = result.iter().map(|f| f.path.as_str()).collect();
        assert_eq!(paths.len(), 3);
        assert!(paths.contains(&"src/index.mts"));
        assert!(paths.contains(&"src/utils.mts"));
        assert!(paths.contains(&"tests/index.test.mts"));
    }

    #[test]
    fn test_scan_with_custom_include_patterns() {
        let temp_dir = TempDir::new().unwrap();
        create_test_files(temp_dir.path()).unwrap();

        let scanner = NativeFileScanner::new();
        let result = scanner
            .scan_dir(
                &[temp_dir.path().to_string_lossy().to_string()],
                Some(ScanOptions {
                    include: Some(vec!["**/*.mts".to_string()]),
                    ignore: None,
                }),
            )
            .unwrap();

        let paths: Vec<_> = result.iter().map(|f| f.path.as_str()).collect();
        assert_eq!(paths.len(), 3);
        assert!(paths.contains(&"src/index.mts"));
        assert!(paths.contains(&"src/utils.mts"));
        assert!(paths.contains(&"tests/index.test.mts"));
    }

    #[test]
    fn test_scan_with_ignore_patterns() {
        let temp_dir = TempDir::new().unwrap();
        create_test_files(temp_dir.path()).unwrap();

        let scanner = NativeFileScanner::new();
        let result = scanner
            .scan_dir(
                &[temp_dir.path().to_string_lossy().to_string()],
                Some(ScanOptions {
                    include: Some(vec!["**/*.mts".to_string()]),
                    ignore: Some(vec!["**/*.test.mts".to_string(), "**/dist/**".to_string()]),
                }),
            )
            .unwrap();

        let paths: Vec<_> = result.iter().map(|f| f.path.as_str()).collect();
        // Should exclude test files and dist folder
        assert_eq!(paths.len(), 2);
        assert!(paths.contains(&"src/index.mts"));
        assert!(paths.contains(&"src/utils.mts"));
        assert!(!paths.contains(&"tests/index.test.mts"));
    }

    #[test]
    fn test_scan_json_files_only() {
        let temp_dir = TempDir::new().unwrap();
        create_test_files(temp_dir.path()).unwrap();

        let scanner = NativeFileScanner::new();
        let result = scanner
            .scan_dir(
                &[temp_dir.path().to_string_lossy().to_string()],
                Some(ScanOptions {
                    include: Some(vec!["**/*.json".to_string()]),
                    ignore: None,
                }),
            )
            .unwrap();

        let paths: Vec<_> = result.iter().map(|f| f.path.as_str()).collect();
        assert_eq!(paths.len(), 2);
        assert!(paths.contains(&"package.json"));
        assert!(paths.contains(&"tsconfig.json"));
    }

    #[test]
    fn test_scan_specific_directory_with_globs() {
        let temp_dir = TempDir::new().unwrap();
        create_test_files(temp_dir.path()).unwrap();

        let scanner = NativeFileScanner::new();
        let result = scanner
            .scan_dir(
                &[temp_dir.path().to_string_lossy().to_string()],
                Some(ScanOptions {
                        include: Some(vec!["src/**/*.mts".to_string()]),
                        ignore: None,
                    }),
            )
            .unwrap();

        let paths: Vec<_> = result.iter().map(|f| f.path.as_str()).collect();
        // Only src/ directory .mts files
        assert_eq!(paths.len(), 2);
        assert!(paths.contains(&"src/index.mts"));
        assert!(paths.contains(&"src/utils.mts"));
        assert!(!paths.contains(&"tests/index.test.mts"));
    }
}
