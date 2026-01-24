use std::path::Path;
use std::io::Write;

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

use super::sourcemap::{generate_sourcemap, write_sourcemap_and_code};
use super::tsconfig::TsConfigOptions;

/// Buffer writer that captures error messages
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

/// TypeScript to JavaScript compiler using SWC
pub struct TypeScriptCompiler {
    ts_config: TsConfigOptions,
}

impl TypeScriptCompiler {
    pub fn new(ts_config: TsConfigOptions) -> Self {
        Self { ts_config }
    }

    /// Compile a single TypeScript file to JavaScript
    pub fn compile_file(&self, input: &Path, output: &Path) -> Result<(), String> {
        let cm: Lrc<SourceMap> = Default::default();
        
        // Capture errors in a buffer instead of printing to stderr
        let error_buffer = ErrorBuffer::new();
        let error_buffer_clone = error_buffer.clone();
        
        let emitter = EmitterWriter::new(
            Box::new(error_buffer),
            Some(cm.clone()),
            false,
            true,
        );
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
            
            // Get error message from buffer
            let error_msg = error_buffer_clone.get_content();
            if error_msg.is_empty() {
                format!("Failed to parse {}", input.display())
            } else {
                error_msg
            }
        })?;

        // Apply transformations and generate code
        let globals = Globals::default();
        let code = GLOBALS
            .set(&globals, || {
                self.transform_and_generate(module, &cm, &comments)
            })
            .map_err(|e| format!("Transformation error: {:?}", e))?;

        // Write output with optional sourcemap
        if self.ts_config.emit_sourcemap {
            let source_content = std::fs::read_to_string(input)
                .map_err(|e| format!("Failed to read source for sourcemap: {}", e))?;

            let source_map = generate_sourcemap(input, output, &source_content)?;
            write_sourcemap_and_code(output, code, source_map)?;
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
    ) -> Result<String, String> {
        let unresolved_mark = Mark::new();
        let top_level_mark = Mark::new();

        let module = module.apply(resolver(unresolved_mark, top_level_mark, true));
        let module = module.apply(strip(unresolved_mark, top_level_mark));
        let module = module.apply(hygiene());
        let program = module.apply(fixer(Some(comments)));

        Ok(to_code_default(cm.clone(), Some(comments), &program))
    }
}
