use super::types::BuildResult;

/// Print build summary with statistics
#[allow(dead_code)]
pub fn print_build_summary(result: &BuildResult) {
    println!(
        "Built {} files in {:.2}ms",
        result.files_compiled, result.total_duration_ms,
    );
}
