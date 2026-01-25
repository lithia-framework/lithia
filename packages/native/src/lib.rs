use napi_derive::napi;

mod builder;
mod meta;
mod router;
mod scanner;

pub use builder::build_project;
pub use router::{Route, RoutesManifest};
pub use scanner::{FileInfo, ScanOptions};

use crate::scanner::FileScanner;

#[napi]
pub fn scan_dir(
    path_components: Vec<String>,
    options: Option<ScanOptions>,
) -> napi::Result<Vec<FileInfo>> {
    let scanner = scanner::NativeFileScanner::new();
    scanner
        .scan_dir(&path_components, options)
        .map_err(|e| napi::Error::from_reason(format!("scan failed: {}", e)))
}
