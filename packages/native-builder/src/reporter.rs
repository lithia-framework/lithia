use crate::types::BuildResult;

/// Print build summary with statistics
#[allow(dead_code)]
pub fn print_build_summary(result: &BuildResult) {
    println!(
        "Built {} files in {:.2}ms ({} failures)",
        result.files_compiled,
        result.total_duration_ms,
        result.failures.len()
    );
}

/// Print per-file compilation timings
pub fn print_timings(result: &BuildResult) {
    for timing in &result.timings {
        println!("  {}: {:.2}ms", timing.output_path, timing.duration_ms);
    }
}

/// Print route manifest generation status
#[allow(dead_code)]
pub fn print_manifest_status(manifest_path: &str, success: bool) {
    if success {
        println!("Wrote route manifest: {}", manifest_path);
    } else {
        eprintln!("Failed to generate route manifest");
    }
}
