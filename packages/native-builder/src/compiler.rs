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

use crate::sourcemap::{generate_sourcemap, write_sourcemap_and_code};
use crate::tsconfig::TsConfigOptions;

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
        let emitter = EmitterWriter::new(Box::new(std::io::stderr()), Some(cm.clone()), false, true);
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
            format!("Failed to parse {}", input.display())
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
