/**
 * @fileoverview High-performance File Scanner (Native).
 * Uses recursive directory walking and glob-based filtering to identify
 * source files for the compilation pipeline.
 */

use globset::{Glob, GlobSetBuilder, GlobSet};
use napi_derive::napi;
use std::io;

/// Metadata about a discovered file.
#[napi(object)]
#[derive(Debug, Clone)]
pub struct FileInfo {
    /// Path relative to the scan root (e.g., "src/index.mts").
    pub path: String,
    /// Absolute path on the local disk.
    pub full_path: String,
}

/// Configuration for the scanner's filtering logic.
#[napi(object)]
#[derive(Debug, Clone, Default)]
pub struct ScanOptions {
    /// List of glob patterns to include.
    pub include: Option<Vec<String>>,
    /// List of glob patterns to exclude.
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

    /// Internal helper to compile a list of strings into a high-performance GlobSet.
    fn compile_glob_set(patterns: &[String]) -> io::Result<GlobSet> {
        let mut builder = GlobSetBuilder::new();
        for pattern in patterns {
            let glob = Glob::new(pattern).map_err(|e| {
                io::Error::new(
                    io::ErrorKind::InvalidInput,
                    format!("Invalid glob pattern '{}': {}", pattern, e),
                )
            })?;
            builder.add(glob);
        }
        builder.build().map_err(|e| {
            io::Error::new(io::ErrorKind::InvalidInput, format!("GlobSet build error: {}", e))
        })
    }
}

impl FileScanner for NativeFileScanner {
    /**
     * Recursively scans a directory for files matching the provided criteria.
     * @param path_components Parts of the directory path to join (root-relative or absolute).
     * @param options Inclusion/Exclusion rules.
     */
    fn scan_dir(
        &self,
        path_components: &[String],
        options: Option<ScanOptions>,
    ) -> io::Result<Vec<FileInfo>> {
        // 1. Resolve target directory
        let mut target_path = std::env::current_dir()?;
        for part in path_components {
            target_path = target_path.join(part);
        }

        if !target_path.exists() {
            return Err(io::Error::new(
                io::ErrorKind::NotFound,
                format!("Directory not found: {}", target_path.display()),
            ));
        }

        let options = options.unwrap_or_default();

        // 2. Prepare Matchers (If no include patterns, return empty list)
        let include_matcher = match options.include {
            Some(patterns) if !patterns.is_empty() => Self::compile_glob_set(&patterns)?,
            _ => return Ok(Vec::new()),
        };

        let ignore_matcher = options.ignore
            .map(|patterns| Self::compile_glob_set(&patterns))
            .transpose()?;

        let mut file_infos: Vec<FileInfo> = Vec::new();

        // 3. Walk the directory tree
        for entry in walkdir::WalkDir::new(&target_path)
            .into_iter()
            .filter_map(|e| e.ok())
            .filter(|e| e.file_type().is_file())
        {
            let path = entry.path();
            
            // Normalize path to Unix-style relative string for glob matching
            let relative = path
                .strip_prefix(&target_path)
                .unwrap_or(path)
                .to_string_lossy()
                .replace('\\', "/");

            // Filter logic
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

        // 4. Deterministic sorting (important for incremental build consistency)
        file_infos.sort_by(|a, b| a.path.cmp(&b.path));

        Ok(file_infos)
    }
}