use std::io::Write;
use std::path::{Path, PathBuf};

use swc_common::{
    comments::SingleThreadedComments,
    errors::{EmitterWriter, Handler},
    source_map::SourceMapGenConfig,
    sync::Lrc,
    BytePos, FileName, Globals, LineCol, Mark, SourceMap, GLOBALS,
};
use swc_ecma_codegen::{text_writer::JsWriter, Emitter as CodegenEmitter};
use swc_ecma_parser::{lexer::Lexer, Parser, StringInput, Syntax, TsSyntax};
use swc_ecma_transforms_base::helpers::{Helpers, HELPERS};
use swc_ecma_transforms_base::{fixer::fixer, hygiene::hygiene, resolver};
use swc_ecma_transforms_typescript::strip;

use swc_ecma_visit::VisitMutWith;

use crate::builder::paths_rewriter::PathsRewriter;
use crate::builder::sourcemap::write_sourcemap_and_code;

use super::tsconfig::TsConfigOptions;

#[derive(Clone)]
struct ErrorBuffer {
    buffer: std::sync::Arc<std::sync::Mutex<Vec<u8>>>,
}

impl ErrorBuffer {
    fn new() -> Self {
        Self {
            buffer: std::sync::Arc::new(std::sync::Mutex::new(Vec::new())),
        }
    }

    fn get_content(&self) -> String {
        self.buffer
            .lock()
            .ok()
            .and_then(|buf| String::from_utf8(buf.clone()).ok())
            .unwrap_or_default()
    }
}

impl Write for ErrorBuffer {
    fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
        self.buffer
            .lock()
            .map_err(|_| std::io::Error::other("Lock failed"))?
            .write(buf)
    }

    fn flush(&mut self) -> std::io::Result<()> {
        self.buffer
            .lock()
            .map_err(|_| std::io::Error::other("Lock failed"))?
            .flush()
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

    pub fn compile_file(&self, input: &Path, output: &Path) -> Result<(), String> {
        let cm: Lrc<SourceMap> = Default::default();

        let error_buffer = ErrorBuffer::new();
        let error_buffer_clone = error_buffer.clone();

        let emitter = EmitterWriter::new(Box::new(error_buffer), Some(cm.clone()), false, true);
        let handler = Handler::with_emitter(true, false, Box::new(emitter));

        let globals = Globals::default();
        let (code, map_opt) = GLOBALS
            .set(&globals, || {
                let fm = cm
                    .load_file(input)
                    .map_err(|e| format!("Failed to load input {}: {}", input.display(), e))?;

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

                for e in parser.take_errors() {
                    e.into_diagnostic(&handler).emit();
                }

                let module = parser.parse_program().map_err(|e| {
                    e.into_diagnostic(&handler).emit();

                    let error_msg = error_buffer_clone.get_content();
                    if error_msg.is_empty() {
                        format!("Failed to parse {}", input.display())
                    } else {
                        format!("\n{}", error_msg.trim())
                    }
                })?;

                self.transform_and_generate(module, &cm, &comments, input)
            })
            .map_err(|e| format!("Transformation error: {:?}", e))?;

        if let Some(map) = map_opt {
            write_sourcemap_and_code(output, &code, Some(map))?;
        } else {
            std::fs::write(output, code)
                .map_err(|e| format!("Failed to write output {}: {}", output.display(), e))?;
        }

        Ok(())
    }

    fn transform_and_generate(
        &self,
        module: swc_ecma_ast::Program,
        cm: &Lrc<SourceMap>,
        comments: &SingleThreadedComments,
        input: &Path,
    ) -> Result<(String, Option<String>), String> {
        let unresolved_mark = Mark::new();
        let top_level_mark = Mark::new();

        let mut program = module;

        let compiled_paths = &self.ts_config.paths;
        if !compiled_paths.is_empty() {
            let rewriter = PathsRewriter {
                base_url: PathBuf::from("."),
                paths: compiled_paths.clone(),
                file_dir: input
                    .parent()
                    .map(PathBuf::from)
                    .unwrap_or_else(|| PathBuf::from(".")),
            };

            let mut rewriter = rewriter;
            program.visit_mut_with(&mut rewriter);
        }

        HELPERS.set(&Helpers::new(true), || {
            let module = program.apply(resolver(unresolved_mark, top_level_mark, true));
            let module = module.apply(strip(unresolved_mark, top_level_mark));

            let module = module;

            let module = module.apply(hygiene());
            let program = module.apply(fixer(Some(comments)));

            let mut src_map_buf: Vec<(BytePos, LineCol)> = Vec::new();
            let mut code_buf: Vec<u8> = Vec::new();

            {
                let js_writer =
                    JsWriter::new(cm.clone(), "\n", &mut code_buf, Some(&mut src_map_buf));

                let cfg = swc_ecma_codegen::Config::default()
                    .with_target(swc_ecma_ast::EsVersion::EsNext);

                let mut emitter = CodegenEmitter {
                    cfg,
                    cm: cm.clone(),
                    comments: Some(comments),
                    wr: Box::new(js_writer),
                };

                emitter
                    .emit_program(&program)
                    .map_err(|e| format!("codegen emit error: {:?}", e))?;
            }

            let code =
                String::from_utf8(code_buf).map_err(|e| format!("code not utf8: {:?}", e))?;

            let map = if !src_map_buf.is_empty() {
                let sm = cm.build_source_map(&src_map_buf, None, SourceMapConfigImpl);
                let mut s = Vec::new();
                sm.to_writer(&mut s)
                    .map_err(|e| format!("failed to write source map file: {:?}", e))?;
                Some(String::from_utf8(s).map_err(|e| format!("source map not utf8: {:?}", e))?)
            } else {
                None
            };

            Ok((code, map))
        })
    }
}
