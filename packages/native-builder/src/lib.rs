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
use swc_ecma_codegen::to_code_default;
use swc_ecma_parser::{lexer::Lexer, Parser, StringInput, Syntax, TsSyntax};
use swc_ecma_transforms_base::{fixer::fixer, hygiene::hygiene, resolver};
use swc_ecma_transforms_typescript::strip;

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
    let results: Vec<Result<(), String>> = ts_files
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

            match compile_ts_to_js(input, &output) {
                Ok(_) => Ok(()),
                Err(e) => Err(e),
            }
        })
        .collect();
    let compile_duration = compile_start.elapsed();

    let failures: Vec<String> = results.into_iter().filter_map(|r| r.err()).collect();

    println!(
        "Built {} files in {:.2}ms ({} failures)",
        ts_files.len(),
        compile_duration.as_secs_f64() * 1000.0,
        failures.len()
    );

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

        let code = to_code_default(cm, Some(&comments), &program);

        std::fs::write(output, code).map_err(|e| format!("write error {}: {}", output, e))?;

        Ok::<(), String>(())
    });

    match res {
        Ok(v) => Ok(v),
        Err(e) => Err(format!("swc error: {:?}", e)),
    }
}