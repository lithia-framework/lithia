/**
 * @fileoverview TypeScript Compiler Engine (Native).
 * Uses SWC to perform high-speed TypeScript stripping and path remapping.
 */
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use swc_common::{
    comments::SingleThreadedComments,
    errors::{EmitterWriter, Handler},
    source_map::SourceMapGenConfig,
    sync::Lrc,
    FileName, Globals, Mark, SourceMap, GLOBALS,
};
use swc_ecma_codegen::{text_writer::JsWriter, Emitter as CodegenEmitter};
use swc_ecma_parser::{lexer::Lexer, Parser, StringInput, Syntax, TsSyntax};
use swc_ecma_transforms_base::helpers::{Helpers, HELPERS};
use swc_ecma_transforms_base::{fixer::fixer, hygiene::hygiene, resolver};
use swc_ecma_transforms_typescript::strip;
use swc_ecma_visit::VisitMutWith;

use super::tsconfig::TsConfigOptions;
use crate::builder::paths_rewriter::PathsRewriter;
use crate::builder::sourcemap::write_sourcemap_and_code;

/// Thread-safe buffer for capturing SWC diagnostic messages.
#[derive(Clone)]
struct ErrorBuffer {
    buffer: Arc<Mutex<Vec<u8>>>,
}

impl ErrorBuffer {
    fn new() -> Self {
        Self {
            buffer: Arc::new(Mutex::new(Vec::new())),
        }
    }

    fn get_content(&self) -> String {
        self.buffer
            .lock()
            .map(|buf| String::from_utf8_lossy(&buf).into_owned())
            .unwrap_or_default()
    }
}

impl Write for ErrorBuffer {
    fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
        self.buffer.lock().unwrap().write(buf)
    }

    fn flush(&mut self) -> std::io::Result<()> {
        self.buffer.lock().unwrap().flush()
    }
}

struct SourceMapConfigImpl;

impl SourceMapGenConfig for SourceMapConfigImpl {
    fn file_name_to_source(&self, f: &FileName) -> String {
        f.to_string()
    }

    fn inline_sources_content(&self, _: &FileName) -> bool {
        true
    }
}

pub struct TypeScriptCompiler {
    ts_config: TsConfigOptions,
}

impl TypeScriptCompiler {
    pub fn new(ts_config: TsConfigOptions) -> Self {
        Self { ts_config }
    }

    /// Compiles a single TypeScript file into JavaScript.
    pub fn compile_file(&self, input: &Path, output: &Path) -> Result<(), String> {
        let cm: Lrc<SourceMap> = Default::default();
        let error_buffer = ErrorBuffer::new();

        // Setup the diagnostic handler to capture errors into our buffer
        let emitter = EmitterWriter::new(
            Box::new(error_buffer.clone()),
            Some(cm.clone()),
            false,
            true,
        );
        let handler = Handler::with_emitter(true, false, Box::new(emitter));

        let globals = Globals::default();
        let (code, map_opt) = GLOBALS.set(&globals, || {
            let fm = cm
                .load_file(input)
                .map_err(|e| format!("IO Error: Failed to load {}: {}", input.display(), e))?;

            let comments = SingleThreadedComments::default();
            let lexer = Lexer::new(
                Syntax::Typescript(TsSyntax {
                    tsx: false,
                    ..Default::default()
                }),
                swc_ecma_ast::EsVersion::EsNext,
                StringInput::from(&*fm),
                Some(&comments),
            );

            let mut parser = Parser::new_from(lexer);

            // Emit parsing errors to the handler
            for e in parser.take_errors() {
                e.into_diagnostic(&handler).emit();
            }

            let program = parser.parse_program().map_err(|e| {
                e.into_diagnostic(&handler).emit();
                let diag = error_buffer.get_content();
                if diag.is_empty() {
                    format!("Syntax Error: Failed to parse {}", input.display())
                } else {
                    format!("\n{}", diag.trim())
                }
            })?;

            self.transform_and_generate(program, &cm, &comments, input)
        })?;

        // Write the final artifacts
        if let Some(map) = map_opt {
            write_sourcemap_and_code(output, &code, Some(map))?;
        } else {
            std::fs::write(output, code)
                .map_err(|e| format!("IO Error: Failed to write {}: {}", output.display(), e))?;
        }

        Ok(())
    }

    fn transform_and_generate(
        &self,
        mut program: swc_ecma_ast::Program,
        cm: &Lrc<SourceMap>,
        comments: &SingleThreadedComments,
        input: &Path,
    ) -> Result<(String, Option<String>), String> {
        let unresolved_mark = Mark::new();
        let top_level_mark = Mark::new();

        // 1. Rewrite module paths (alias resolution)
        if !self.ts_config.paths.is_empty() {
            let mut rewriter = PathsRewriter {
                base_url: PathBuf::from("."),
                paths: self.ts_config.paths.clone(),
                file_dir: input
                    .parent()
                    .map(PathBuf::from)
                    .unwrap_or_else(|| PathBuf::from(".")),
            };
            program.visit_mut_with(&mut rewriter);
        }

        HELPERS.set(&Helpers::new(true), || {
            // 2. Transform Pipeline: Resolve -> Strip Types -> Hygiene -> Fixer
            let program = program.apply(resolver(unresolved_mark, top_level_mark, true));
            let program = program.apply(strip(unresolved_mark, top_level_mark));
            let program = program.apply(hygiene());
            let program = program.apply(fixer(Some(comments)));

            // 3. Code Generation
            let mut src_map_buf = Vec::new();
            let mut code_buf = Vec::new();

            {
                let js_writer =
                    JsWriter::new(cm.clone(), "\n", &mut code_buf, Some(&mut src_map_buf));
                let mut emitter = CodegenEmitter {
                    cfg: swc_ecma_codegen::Config::default()
                        .with_target(swc_ecma_ast::EsVersion::EsNext),
                    cm: cm.clone(),
                    comments: Some(comments),
                    wr: Box::new(js_writer),
                };

                emitter
                    .emit_program(&program)
                    .map_err(|e| format!("Codegen Error: {:?}", e))?;
            }

            let code =
                String::from_utf8(code_buf).map_err(|e| format!("UTF-8 Error in code: {:?}", e))?;

            // 4. Source Map Generation
            let map = if !src_map_buf.is_empty() {
                let sm = cm.build_source_map(&src_map_buf, None, SourceMapConfigImpl);
                let mut s = Vec::new();
                sm.to_writer(&mut s)
                    .map_err(|e| format!("SourceMap Write Error: {:?}", e))?;
                Some(String::from_utf8(s).unwrap_or_default())
            } else {
                None
            };

            Ok((code, map))
        })
    }
}
