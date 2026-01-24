/// Result of compiling a single TypeScript file
#[derive(Debug, Clone)]
pub struct CompileResult {
    pub output_path: String,
    pub duration_ms: f64,
}

/// Overall build result with statistics
#[derive(Debug)]
pub struct BuildResult {
    pub files_compiled: usize,
    pub failures: Vec<String>,
    pub timings: Vec<CompileResult>,
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
