//! N-API bindings exported by the native crate.
//!
//! This module exposes a small surface area to the host (Node) so JavaScript
//! code can invoke the native builder and scanner implemented in Rust.
//! Prefer using the higher-level functions exported here rather than calling
//! into the modules directly from the host.

use napi_derive::napi;

mod builder;
mod router;
mod scanner;
mod events;

/// Compile the project and emit artifacts.
///
/// This re-export exposes the native `build_project` entrypoint implemented
/// in the `builder` module. The function is intended to be invoked from the
/// host via N-API and performs scanning, compilation and manifest emission.
pub use builder::build_project;

/// Route and manifest types produced by the native router processor.
pub use router::{Route, RoutesManifest};

/// Scanner types returned by `scan_dir`.
pub use scanner::{FileInfo, ScanOptions};

use crate::scanner::FileScanner;

/// Scan a directory tree for files matching the provided `path_components`.
///
/// `path_components` is a vector of path segments used as roots for the
/// scanner (for example `["examples/1-basic-api"]`). `options` may include
/// include/ignore globs. Returns a list of `FileInfo` describing discovered
/// files or an error which is converted into a `napi::Error` for the host.
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

/// Return the native crate version embedded at compile time.
///
/// This returns the value of `CARGO_PKG_VERSION` so the host can verify the
/// native binary version matches expectations.
#[napi]
pub fn schema_version() -> &'static str {
  env!("CARGO_PKG_VERSION")
}
