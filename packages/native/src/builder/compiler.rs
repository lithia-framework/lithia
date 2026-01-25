use std::io::Write;
use std::path::Path;

use swc_common::{
    comments::SingleThreadedComments,
    errors::{EmitterWriter, Handler},
    source_map::SourceMapGenConfig,
    sync::Lrc,
    BytePos, FileName, Globals, LineCol, Mark, SourceMap, GLOBALS,
};
use swc_ecma_codegen::{text_writer::JsWriter, Emitter as CodegenEmitter};
use swc_ecma_parser::{lexer::Lexer, Parser, StringInput, Syntax, TsSyntax};
use swc_ecma_transforms_base::{fixer::fixer, hygiene::hygiene, resolver};
use swc_ecma_transforms_module::{common_js, path::Resolver};
use swc_ecma_transforms_typescript::strip;

use crate::builder::sourcemap::write_sourcemap_and_code;

use super::tsconfig::TsConfigOptions;

/// Simple, thread-safe buffer used to capture diagnostics emitted by SWC.
///
/// The `ErrorBuffer` implements `std::io::Write` and stores emitted bytes
/// in a shared `Arc<Mutex<Vec<u8>>>`. The native builder uses this buffer to
/// capture human-readable error output from SWC and return it to the host
/// instead of writing directly to stderr.
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
            .map_err(|_| std::io::Error::new(std::io::ErrorKind::Other, "Lock failed"))?
            .write(buf)
    }

    fn flush(&mut self) -> std::io::Result<()> {
        self.buffer
            .lock()
            .map_err(|_| std::io::Error::new(std::io::ErrorKind::Other, "Lock failed"))?
            .flush()
    }
}

/// Small `SourceMapGenConfig` implementation used when emitting source maps.
///
/// It provides basic filename resolution and enables inlining the original
/// sources content into the generated `.map` file. Keeping the original
/// content in `sourcesContent` simplifies debugging in the runtime where the
/// physical source files may not be available.
struct SourceMapConfigImpl;

impl SourceMapGenConfig for SourceMapConfigImpl {
    fn file_name_to_source(&self, f: &FileName) -> String {
        f.to_string()
    }

    fn inline_sources_content(&self, _: &FileName) -> bool {
        true
    }
}

/// TypeScript to JavaScript compiler backed by SWC.
///
/// `TypeScriptCompiler` wraps SWC parsing, transforms and codegen to produce
/// JavaScript output and an optional source map. It is configured using
/// `TsConfigOptions` so the host can control whether source maps are
/// emitted and which ECMAScript target is selected.
pub struct TypeScriptCompiler {
    ts_config: TsConfigOptions,
}

impl TypeScriptCompiler {
    /// Create a new compiler configured by `ts_config`.
    pub fn new(ts_config: TsConfigOptions) -> Self {
        Self { ts_config }
    }

    /// Compile a single TypeScript file to JavaScript.
    ///
    /// `input` is the path to the `.ts` source file and `output` is the
    /// desired destination for the emitted `.js` file. When source maps are
    /// enabled in `ts_config`, a `.js.map` file will also be written next to
    /// the emitted code. Errors are returned as `Err(String)` with a
    /// human-readable message captured from SWC's diagnostics.
    pub fn compile_file(&self, input: &Path, output: &Path) -> Result<(), String> {
        let cm: Lrc<SourceMap> = Default::default();

        // Capture errors in a buffer instead of printing to stderr
        let error_buffer = ErrorBuffer::new();
        let error_buffer_clone = error_buffer.clone();

        let emitter = EmitterWriter::new(Box::new(error_buffer), Some(cm.clone()), false, true);
        let handler = Handler::with_emitter(true, false, Box::new(emitter));

        let fm = cm
            .load_file(input)
            .map_err(|e| format!("Failed to load input {}: {}", input.display(), e))?;

        let comments = SingleThreadedComments::default();

        // Parse TypeScript (no TSX support - backend only)
        let lexer = Lexer::new(
            Syntax::Typescript(TsSyntax {
                tsx: false,
                ..Default::default()
            }),
            self.ts_config.target,
            StringInput::from(&*fm),
            Some(&comments),
        );

        let mut parser = Parser::new_from(lexer);

        for e in parser.take_errors() {
            e.into_diagnostic(&handler).emit();
        }

        let module = parser.parse_program().map_err(|e| {
            e.into_diagnostic(&handler).emit();

            // Get error message from buffer and format it properly
            let error_msg = error_buffer_clone.get_content();
            if error_msg.is_empty() {
                format!("Failed to parse {}", input.display())
            } else {
                // Return error without escaping - it will be displayed properly
                format!("\n{}", error_msg.trim())
            }
        })?;

        // Apply transformations and generate code + optional sourcemap
        let globals = Globals::default();
        let (code, map_opt) = GLOBALS
            .set(&globals, || {
                self.transform_and_generate(module, &cm, &comments)
            })
            .map_err(|e| format!("Transformation error: {:?}", e))?;

        // Write output with optional sourcemap
        if self.ts_config.emit_sourcemap {
            if let Some(map) = map_opt {
                write_sourcemap_and_code(output, &code, Some(map))?;
            } else {
                // No source map generated (e.g., empty file) - just write the code
                std::fs::write(output, code)
                    .map_err(|e| format!("Failed to write output {}: {}", output.display(), e))?;
            }
        } else {
            std::fs::write(output, code)
                .map_err(|e| format!("Failed to write output {}: {}", output.display(), e))?;
        }

        Ok(())
    }

    /// Apply SWC transforms (resolver, strip, CommonJS conversion, hygiene)
    /// and perform code generation.
    ///
    /// Returns a tuple `(code, optional_source_map)` where `code` contains the
    /// emitted JavaScript and the optional string contains the JSON source
    /// map when mappings were produced.
    fn transform_and_generate(
        &self,
        module: swc_ecma_ast::Program,
        cm: &Lrc<SourceMap>,
        comments: &SingleThreadedComments,
    ) -> Result<(String, Option<String>), String> {
        let unresolved_mark = Mark::new();
        let top_level_mark = Mark::new();

        // transforms (como você já tinha)
        let module = module.apply(resolver(unresolved_mark, top_level_mark, true));
        let module = module.apply(strip(unresolved_mark, top_level_mark));
        let module = module.apply(common_js(
            Resolver::Default,
            unresolved_mark,
            swc_ecma_transforms_module::util::Config::default(),
            swc_ecma_transforms_module::common_js::FeatureFlag::default(),
        ));
        let module = module.apply(hygiene());
        let program = module.apply(fixer(Some(comments)));

        // NOTE: buffer de mappings como Vec<(BytePos, LineCol)> para sua versão do SWC
        let mut src_map_buf: Vec<(BytePos, LineCol)> = Vec::new();
        let mut code_buf: Vec<u8> = Vec::new();

        {
            let js_writer = JsWriter::new(cm.clone(), "\n", &mut code_buf, Some(&mut src_map_buf));
            let mut emitter = CodegenEmitter {
                cfg: Default::default(),
                cm: cm.clone(),
                comments: Some(comments),
                wr: Box::new(js_writer),
            };

            emitter
                .emit_program(&program)
                .map_err(|e| format!("codegen emit error: {:?}", e))?;
        }

        let code = String::from_utf8(code_buf).map_err(|e| format!("code not utf8: {:?}", e))?;

        let map = if !src_map_buf.is_empty() {
            // build_source_map aceita &[(BytePos, LineCol)] para sua versão
            let sm = cm.build_source_map(&src_map_buf, None, SourceMapConfigImpl);
            let mut s = Vec::new();
            sm.to_writer(&mut s)
                .map_err(|e| format!("failed to write source map file: {:?}", e))?;
            Some(String::from_utf8(s).map_err(|e| format!("source map not utf8: {:?}", e))?)
        } else {
            None
        };

        Ok((code, map))
    }
}
