/// Result information for a single compiled file.
/// `CompileResult` contains small statistics about an individual compilation
/// unit such as the `output_path` produced and the time taken in
/// milliseconds. Fields are public to allow the caller to serialize or log
/// results as needed.
#[derive(Debug, Clone)]
pub struct CompileResult {
    #[allow(dead_code)]
    /// Absolute or relative filesystem path to the compiled output.
    pub output_path: String,
    #[allow(dead_code)]
    /// Duration of the compilation in milliseconds.
    pub duration_ms: f64,
}

/// Overall build result with statistics.
/// `BuildResult` aggregates per-file `CompileResult` entries and provides a
/// simple API to inspect whether failures occurred, and totals such as the
/// number of files compiled and total duration.
#[derive(Debug)]
pub struct BuildResult {
    /// Number of files that were processed during the build.
    pub files_compiled: usize,

    /// Collected failure messages for files that failed to compile.
    pub failures: Vec<String>,

    /// Timeline entries for successful compilations.
    pub timings: Vec<CompileResult>,

    /// Total elapsed build time in milliseconds.
    pub total_duration_ms: f64,
}

impl BuildResult {
    pub fn new(total_duration_ms: f64) -> Self {
        Self {
            files_compiled: 0,
            failures: Vec::new(),
            timings: Vec::new(),
            total_duration_ms,
        }
    }

    pub fn has_failures(&self) -> bool {
        !self.failures.is_empty()
    }

    #[allow(dead_code)]
    pub fn success_count(&self) -> usize {
        self.files_compiled - self.failures.len()
    }
}
