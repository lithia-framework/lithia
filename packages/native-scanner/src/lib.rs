use napi_derive::napi;
use globset::{Glob, GlobSetBuilder};

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

#[napi(object)]
#[derive(Debug, Clone, Default)]
pub struct ScanOptions {
    pub include: Option<Vec<String>>,
    pub ignore: Option<Vec<String>>,
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

#[napi]
pub fn scan_files_with_globs(
    path_components: Vec<String>,
    options: Option<ScanOptions>,
) -> Result<Vec<FileInfo>, napi::Error> {
    let scanner = NativeFileScanner::new();
    scanner
        .scan_with_globs(&path_components, options)
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

    pub fn scan_with_globs(
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

        // Se não houver patterns de include, retorna vazio
        let include_patterns = match options.include {
            Some(patterns) if !patterns.is_empty() => patterns,
            _ => return Ok(Vec::new()),
        };

        // Build include matcher
        let mut include_builder = GlobSetBuilder::new();
        for pattern in &include_patterns {
            let glob = Glob::new(pattern)
                .map_err(|e| io::Error::new(io::ErrorKind::InvalidInput, format!("Invalid include glob pattern '{}': {}", pattern, e)))?;
            include_builder.add(glob);
        }
        let include_matcher = include_builder.build()
            .map_err(|e| io::Error::new(io::ErrorKind::InvalidInput, format!("Failed to build include matcher: {}", e)))?;

        // Build ignore matcher (if provided)
        let ignore_matcher = if let Some(ignore_patterns) = options.ignore {
            let mut ignore_builder = GlobSetBuilder::new();
            for pattern in &ignore_patterns {
                let glob = Glob::new(pattern)
                    .map_err(|e| io::Error::new(io::ErrorKind::InvalidInput, format!("Invalid ignore glob pattern '{}': {}", pattern, e)))?;
                ignore_builder.add(glob);
            }
            Some(ignore_builder.build()
                .map_err(|e| io::Error::new(io::ErrorKind::InvalidInput, format!("Failed to build ignore matcher: {}", e)))?)
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

            // Check if matches include patterns
            if !include_matcher.is_match(&relative) {
                continue;
            }

            // Check if matches ignore patterns
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
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    fn create_test_files(dir: &Path) -> io::Result<()> {
        fs::create_dir_all(dir.join("src"))?;
        fs::create_dir_all(dir.join("dist"))?;
        fs::create_dir_all(dir.join("tests"))?;

        // TypeScript files
        fs::write(dir.join("src/index.ts"), "export default {}")?;
        fs::write(dir.join("src/utils.ts"), "export const util = 1")?;
        
        // JavaScript files
        fs::write(dir.join("src/legacy.js"), "module.exports = {}")?;
        
        // Test files
        fs::write(dir.join("tests/index.test.ts"), "test('works', () => {})")?;
        
        // JSON files
        fs::write(dir.join("package.json"), "{}")?;
        fs::write(dir.join("tsconfig.json"), "{}")?;
        
        // Build output
        fs::write(dir.join("dist/index.js"), "console.log('built')")?;

        Ok(())
    }

    #[test]
    fn test_scan_with_default_ts_pattern() {
        let temp_dir = TempDir::new().unwrap();
        create_test_files(temp_dir.path()).unwrap();

        let scanner = NativeFileScanner::new();
        let result = scanner.scan_with_globs(
            &[temp_dir.path().to_string_lossy().to_string()],
            None,
        ).unwrap();

        // Sem include patterns, não deve retornar nada
        assert_eq!(result.len(), 0);
    }

    #[test]
    fn test_scan_typescript_files() {
        let temp_dir = TempDir::new().unwrap();
        create_test_files(temp_dir.path()).unwrap();

        let scanner = NativeFileScanner::new();
        let result = scanner.scan_with_globs(
            &[temp_dir.path().to_string_lossy().to_string()],
            Some(ScanOptions {
                include: Some(vec!["**/*.ts".to_string()]),
                ignore: None,
            }),
        ).unwrap();

        // Deve encontrar apenas .ts files
        let paths: Vec<_> = result.iter().map(|f| f.path.as_str()).collect();
        assert_eq!(paths.len(), 3);
        assert!(paths.contains(&"src/index.ts"));
        assert!(paths.contains(&"src/utils.ts"));
        assert!(paths.contains(&"tests/index.test.ts"));
    }

    #[test]
    fn test_scan_with_custom_include_patterns() {
        let temp_dir = TempDir::new().unwrap();
        create_test_files(temp_dir.path()).unwrap();

        let scanner = NativeFileScanner::new();
        let result = scanner.scan_with_globs(
            &[temp_dir.path().to_string_lossy().to_string()],
            Some(ScanOptions {
                include: Some(vec!["**/*.ts".to_string(), "**/*.js".to_string()]),
                ignore: None,
            }),
        ).unwrap();

        let paths: Vec<_> = result.iter().map(|f| f.path.as_str()).collect();
        assert_eq!(paths.len(), 5); // 3 .ts + 2 .js files
        assert!(paths.contains(&"src/legacy.js"));
        assert!(paths.contains(&"dist/index.js"));
    }

    #[test]
    fn test_scan_with_ignore_patterns() {
        let temp_dir = TempDir::new().unwrap();
        create_test_files(temp_dir.path()).unwrap();

        let scanner = NativeFileScanner::new();
        let result = scanner.scan_with_globs(
            &[temp_dir.path().to_string_lossy().to_string()],
            Some(ScanOptions {
                include: Some(vec!["**/*.ts".to_string(), "**/*.js".to_string()]),
                ignore: Some(vec!["**/*.test.ts".to_string(), "**/dist/**".to_string()]),
            }),
        ).unwrap();

        let paths: Vec<_> = result.iter().map(|f| f.path.as_str()).collect();
        // Should exclude test files and dist folder
        assert_eq!(paths.len(), 3);
        assert!(paths.contains(&"src/index.ts"));
        assert!(paths.contains(&"src/utils.ts"));
        assert!(paths.contains(&"src/legacy.js"));
        assert!(!paths.contains(&"tests/index.test.ts"));
        assert!(!paths.contains(&"dist/index.js"));
    }

    #[test]
    fn test_scan_json_files_only() {
        let temp_dir = TempDir::new().unwrap();
        create_test_files(temp_dir.path()).unwrap();

        let scanner = NativeFileScanner::new();
        let result = scanner.scan_with_globs(
            &[temp_dir.path().to_string_lossy().to_string()],
            Some(ScanOptions {
                include: Some(vec!["**/*.json".to_string()]),
                ignore: None,
            }),
        ).unwrap();

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
        let result = scanner.scan_with_globs(
            &[temp_dir.path().to_string_lossy().to_string()],
            Some(ScanOptions {
                include: Some(vec!["src/**/*.ts".to_string()]),
                ignore: None,
            }),
        ).unwrap();

        let paths: Vec<_> = result.iter().map(|f| f.path.as_str()).collect();
        // Only src/ directory .ts files
        assert_eq!(paths.len(), 2);
        assert!(paths.contains(&"src/index.ts"));
        assert!(paths.contains(&"src/utils.ts"));
        assert!(!paths.contains(&"tests/index.test.ts"));
    }
}
