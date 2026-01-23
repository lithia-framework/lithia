use napi_derive::napi;
use rayon::prelude::*;
use std::path::PathBuf;
use std::time::Instant;

use lithia_native_scanner::FileInfo;

use std::path::Path;

use swc_common::{
    comments::SingleThreadedComments,
    errors::{EmitterWriter, Handler},
    sync::Lrc,
    Globals, Mark, SourceMap, GLOBALS,
};
use swc_ecma_parser::{lexer::Lexer, Parser, StringInput, Syntax, TsSyntax};
use swc_ecma_transforms_base::{fixer::fixer, hygiene::hygiene, resolver};
use swc_ecma_transforms_typescript::strip;
use swc_ecma_codegen::to_code_default;
use serde_json::json;

#[napi]
pub fn build_project(source_dir: String, out_dir: Option<String>) -> napi::Result<()> {
    let start = Instant::now();

    let files = lithia_native_scanner::scan_files(vec![source_dir.clone()], None)
        .map_err(|e| napi::Error::from_reason(format!("scan failed: {}", e)))?;

    let ts_files: Vec<FileInfo> = files
        .into_iter()
        .filter(|f| f.path.ends_with(".ts"))
        .collect();

    let out_root = out_dir.unwrap_or_else(|| ".lithia".to_string());

    let compile_start = Instant::now();
    let results: Vec<Result<(String, f64), String>> = ts_files
        .par_iter()
        .map(|file| {
            let relative = PathBuf::from(&file.path);
            let mut out_path = PathBuf::from(&out_root);
            out_path.push(relative);
            out_path.set_extension("js");

            if let Some(parent) = out_path.parent() {
                std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }

            let input = &file.full_path;
            let output = out_path.to_string_lossy().to_string();

            let file_start = Instant::now();
            match compile_ts_to_js(input, &output) {
                Ok(_) => {
                    let dur_ms = file_start.elapsed().as_secs_f64() * 1000.0;
                    Ok((output.clone(), dur_ms))
                }
                Err(e) => Err(e),
            }
        })
        .collect();
    let compile_duration = compile_start.elapsed();

    let mut failures: Vec<String> = Vec::new();
    let mut timings: Vec<(String, f64)> = Vec::new();
    for r in results {
        match r {
            Ok((path, ms)) => timings.push((path, ms)),
            Err(e) => failures.push(e),
        }
    }

    println!(
        "Built {} files in {:.2}ms ({} failures)",
        ts_files.len(),
        compile_duration.as_secs_f64() * 1000.0,
        failures.len()
    );

    // print per-file timings
    for (p, ms) in &timings {
        println!("  {}: {:.2}ms", p, ms);
    }

    if !failures.is_empty() {
        return Err(napi::Error::from_reason(format!(
            "Build completed with {} failures: {:?}",
            failures.len(),
            failures.iter().take(5).collect::<Vec<_>>()
        )));
    }

    let total = start.elapsed();
    println!("Total build time: {:.2}ms", total.as_secs_f64() * 1000.0);

    Ok(())
}

fn compile_ts_to_js(input: &str, output: &str) -> Result<(), String> {
    let cm: Lrc<SourceMap> = Default::default();
    let emitter = EmitterWriter::new(Box::new(std::io::stderr()), Some(cm.clone()), false, true);
    let handler = Handler::with_emitter(true, false, Box::new(emitter));

    let fm = cm
        .load_file(Path::new(input))
        .map_err(|e| format!("failed to load input {}: {}", input, e))?;

    let comments = SingleThreadedComments::default();

    let lexer = Lexer::new(
        Syntax::Typescript(TsSyntax {
            tsx: input.ends_with(".tsx"),
            ..Default::default()
        }),
        Default::default(),
        StringInput::from(&*fm),
        Some(&comments),
    );

    let mut parser = Parser::new_from(lexer);

    for e in parser.take_errors() {
        e.into_diagnostic(&handler).emit();
    }

    let module = parser.parse_program().map_err(|e| {
        e.into_diagnostic(&handler).emit();
        format!("failed to parse {}", input)
    })?;

    let globals = Globals::default();
    let res: Result<(), _> = GLOBALS.set(&globals, || {
        let unresolved_mark = Mark::new();
        let top_level_mark = Mark::new();

        let module = module.apply(resolver(unresolved_mark, top_level_mark, true));
        let module = module.apply(strip(unresolved_mark, top_level_mark));
        let module = module.apply(hygiene());

        let program = module.apply(fixer(Some(&comments)));

        // generate code (using existing helper)
        let code = to_code_default(cm, Some(&comments), &program);

        // create a minimal source map (no precise mappings) to allow tools to show original source
        let input_file_name = std::path::Path::new(input).file_name().unwrap().to_string_lossy();
        let output_file_name = std::path::Path::new(output).file_name().unwrap().to_string_lossy();
        let src_content = std::fs::read_to_string(input).map_err(|e| format!("read source {}: {}", input, e))?;

        let map = json!({
            "version": 3,
            "file": output_file_name,
            "sources": [input_file_name],
            "sourcesContent": [src_content],
            "names": [],
            "mappings": ""
        })
        .to_string();

        // write JS + sourceMappingURL (map filename is output filename + .map)
        let map_file_name = format!("{}.map", std::path::Path::new(output).file_name().unwrap().to_string_lossy());
        let code_with_map = format!("{}\n//# sourceMappingURL={}\n", code, map_file_name);

        std::fs::write(output, code_with_map).map_err(|e| format!("write error {}: {}", output, e))?;

        // write map alongside output
        let map_path = format!("{}.map", output);
        std::fs::write(&map_path, map).map_err(|e| format!("write map error {}: {}", map_path, e))?;

        Ok::<(), String>(())
    });

    match res {
        Ok(v) => Ok(v),
        Err(e) => Err(format!("swc error: {:?}", e)),
    }
}