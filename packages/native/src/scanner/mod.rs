//! Utilities for scanning project directories and matching files using glob patterns.
//!
//! This module exposes a small, focused file scanner implemented in Rust that is
//! used by the native builder to discover route files and other project
//! artifacts. It provides a simple `FileScanner` trait and a `NativeFileScanner`
//! concrete implementation that walks directories, applies include/ignore glob
//! patterns and returns structured `FileInfo` results.
//!
//! The scanner intentionally keeps behaviour minimal and deterministic:
//! - Includes are required: if no include patterns are provided, an empty list
//!   is returned.
//! - Ignore patterns are optional and applied after include matching.
//! - Returned file paths are sorted by their relative path to ensure stable
//!   ordering across runs.

use globset::{Glob, GlobSetBuilder};
use napi_derive::napi;

use std::io;

/// Information about a discovered file.
/// - `path` is the path relative to the scanned directory (using `/` as
///   separator on all platforms).
/// - `full_path` is the absolute filesystem path to the file.
#[napi(object)]
#[derive(Debug, Clone)]
pub struct FileInfo {
    /// Relative path from the scanned directory
    pub path: String,

    /// Absolute path from the filesystem root
    pub full_path: String,
}

/// Options controlling scanning behaviour.
/// - `include`: list of glob patterns that select files to include. If
///   omitted or empty, the scanner returns an empty result set.
/// - `ignore`: optional list of glob patterns used to exclude matching files
///   from the previously included set.
#[napi(object)]
#[derive(Debug, Clone, Default)]
pub struct ScanOptions {
    /// Glob patterns to include files.
    pub include: Option<Vec<String>>,

    /// Glob patterns to ignore (applied after include matching).
    pub ignore: Option<Vec<String>>,
}

/// Trait that abstracts a directory scanner used by the native build system.
/// Implementors must return a list of `FileInfo` entries corresponding to the
/// files discovered under the provided `path_components` directory. This trait
/// is intentionally small to make testing and mocking straightforward in
/// higher-level code.
pub trait FileScanner {
    /// Scan a directory described by `path_components` and return matching
    /// `FileInfo` entries.
    /// `path_components` is a slice of path segments that will be joined onto
    /// the current working directory to form the target scanning directory.
    /// `options` may contain include/ignore glob patterns.
    fn scan_dir(
        &self,
        path_components: &[String],
        options: Option<ScanOptions>,
    ) -> io::Result<Vec<FileInfo>>;
}

/// Native `FileScanner` implementation that walks the filesystem using
/// `walkdir` and matches paths against glob patterns using `globset`.
/// This scanner is fast enough for typical project sizes and deterministic
/// because it sorts results by relative path before returning them.
#[derive(Debug, Clone)]
pub struct NativeFileScanner;

impl NativeFileScanner {
    /// Create a new `NativeFileScanner` instance.
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
                    include: Some(vec!["**/*.ts".to_string()]),
                    ignore: None,
                }),
            )
            .unwrap();

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
        let result = scanner
            .scan_dir(
                &[temp_dir.path().to_string_lossy().to_string()],
                Some(ScanOptions {
                    include: Some(vec!["**/*.ts".to_string(), "**/*.js".to_string()]),
                    ignore: None,
                }),
            )
            .unwrap();

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
        let result = scanner
            .scan_dir(
                &[temp_dir.path().to_string_lossy().to_string()],
                Some(ScanOptions {
                    include: Some(vec!["**/*.ts".to_string(), "**/*.js".to_string()]),
                    ignore: Some(vec!["**/*.test.ts".to_string(), "**/dist/**".to_string()]),
                }),
            )
            .unwrap();

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
                    include: Some(vec!["src/**/*.ts".to_string()]),
                    ignore: None,
                }),
            )
            .unwrap();

        let paths: Vec<_> = result.iter().map(|f| f.path.as_str()).collect();
        // Only src/ directory .ts files
        assert_eq!(paths.len(), 2);
        assert!(paths.contains(&"src/index.ts"));
        assert!(paths.contains(&"src/utils.ts"));
        assert!(!paths.contains(&"tests/index.test.ts"));
    }
}
