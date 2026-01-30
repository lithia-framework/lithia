/**
 * @fileoverview Build Telemetry Types (Native).
 * Defines structures for tracking compilation metrics, success rates,
 * and error logs across the build lifecycle.
 */

/// Represents the result of a single file compilation.
#[derive(Debug, Clone)]
pub struct CompileResult {
    /// The final location of the generated .mjs file.
    #[allow(dead_code)]
    pub output_path: String,
    /// Time taken to compile this specific file in milliseconds.
    #[allow(dead_code)]
    pub duration_ms: f64,
}

/// Aggregated results for the entire project build.
#[derive(Debug)]
pub struct BuildResult {
    /// Total number of files processed by the scanner.
    pub files_compiled: usize,
    /// Collection of error messages encountered during the build.
    pub failures: Vec<String>,
    /// Individual timing data for each successfully compiled file.
    pub timings: Vec<CompileResult>,
    /// Total wall-clock time for the entire build process.
    #[allow(dead_code)]
    pub total_duration_ms: f64,
}

impl BuildResult {
    /// Initializes a new build result with the starting duration.
    pub fn new(total_duration_ms: f64) -> Self {
        Self {
            files_compiled: 0,
            failures: Vec::new(),
            timings: Vec::new(),
            total_duration_ms,
        }
    }

    /// Returns true if any errors occurred during the build.
    pub fn has_failures(&self) -> bool {
        !self.failures.is_empty()
    }

    /// Calculates the number of files that were successfully transformed.
    #[allow(dead_code)]
    pub fn success_count(&self) -> usize {
        self.files_compiled.saturating_sub(self.failures.len())
    }

    /// Calculates the average compilation time per file.
    #[allow(dead_code)]
    pub fn average_time_ms(&self) -> f64 {
        if self.files_compiled == 0 {
            0.0
        } else {
            self.total_duration_ms / self.files_compiled as f64
        }
    }
}
