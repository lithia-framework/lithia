use std::io::Write;
use std::path::{Path, PathBuf};

use swc_atoms::Wtf8Atom;
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
use swc_ecma_transforms_module::{common_js, path::Resolver as PathResolverEnum};
use swc_ecma_transforms_typescript::strip;

use swc_ecma_ast::{CallExpr, Callee, Expr, ExprOrSpread, Lit, Module, ModuleDecl, ModuleItem};
use swc_ecma_visit::{VisitMut, VisitMutWith};

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

/// Visitor that rewrites import/require/import() specifiers according to
/// base_url + paths mapping (simple implementation).
struct PathsRewriter {
    base_url: PathBuf,
    // Vec of (from_pattern, to_targets)
    paths: Vec<(String, Vec<String>)>,
    // directory of current file being compiled (for generating relative specifiers)
    file_dir: PathBuf,
}

impl PathsRewriter {
    fn resolve_using_paths(&self, spec: &str) -> Option<String> {
        // If spec is relative or absolute, don't touch
        if spec.starts_with('.') || spec.starts_with('/') {
            return None;
        }

        // Try each mapping
        for (from, to_list) in &self.paths {
            if from.contains('*') {
                // wildcard pattern
                // support exactly one '*' (like the real resolver)
                if from.as_bytes().iter().filter(|&&c| c == b'*').count() != 1 {
                    continue;
                }
                let pos = from.find('*').unwrap();
                let prefix = &from[..pos];
                if !spec.starts_with(prefix) {
                    continue;
                }
                let extra = &spec[prefix.len()..];

                for target in to_list {
                    let replaced = target.replace('*', extra);
                    // Candidate paths to check on disk
                    // 1) base_url / replaced
                    // 2) base_url / ./replaced
                    // Also try common extensions
                    if let Some(abs_found) = try_find_file_on_disk(&self.base_url.join(&replaced)) {
                        // produce a path relative from file_dir to abs_found
                        let rel = make_relative_or_prefixed(&self.file_dir, &abs_found);
                        return Some(rel);
                    }

                    if let Some(abs_found) =
                        try_find_file_on_disk(&self.base_url.join(format!("./{}", replaced)))
                    {
                        let rel = make_relative_or_prefixed(&self.file_dir, &abs_found);
                        return Some(rel);
                    }

                    // As fallback, if single target and prefix not empty, mimic SWC's behavior:
                    // return "./replaced" even if file not found (matches JS tests expectation).
                    if to_list.len() == 1 && !prefix.is_empty() {
                        let mut replaced_for_import = replaced.clone();
                        if !replaced_for_import.starts_with("./")
                            && !replaced_for_import.starts_with('/')
                        {
                            replaced_for_import = format!("./{}", replaced_for_import);
                        }
                        return Some(replaced_for_import);
                    }
                }
            } else {
                // exact match
                if spec != from {
                    continue;
                }
                // to_list must have exactly one entry (TypeScript rule)
                let target = &to_list[0];
                let tp = Path::new(target);
                if tp.is_absolute() {
                    if let Some(abs_found) = try_find_file_on_disk(tp) {
                        let rel = make_relative_or_prefixed(&self.file_dir, &abs_found);
                        return Some(rel);
                    }
                    // absolute but not found, still return as-is
                    return Some(target.clone());
                }

                // relative to base_url
                if let Some(abs_found) = try_find_file_on_disk(&self.base_url.join(target)) {
                    let rel = make_relative_or_prefixed(&self.file_dir, &abs_found);
                    return Some(rel);
                }

                // fallback: return "./target"
                let mut replaced_for_import = target.clone();
                if !replaced_for_import.starts_with("./") && !replaced_for_import.starts_with('/') {
                    replaced_for_import = format!("./{}", replaced_for_import);
                }
                return Some(replaced_for_import);
            }
        }

        // If no mapping matched, try baseUrl + spec (baseUrl resolution)
        let candidate = self.base_url.join(spec);
        if let Some(abs_found) = try_find_file_on_disk(&candidate) {
            let rel = make_relative_or_prefixed(&self.file_dir, &abs_found);
            return Some(rel);
        }

        None
    }
}

impl VisitMut for PathsRewriter {
    fn visit_mut_module(&mut self, n: &mut Module) {
        // Walk module items and rewrite specifiers where applicable
        n.visit_mut_children_with(self);
    }

    fn visit_mut_module_item(&mut self, n: &mut ModuleItem) {
        match n {
            ModuleItem::ModuleDecl(decl) => match decl {
                ModuleDecl::Import(import_decl) => {
                    let orig = import_decl.src.value.to_string_lossy().to_string();
                    if let Some(new_spec) = self.resolve_using_paths(&orig) {
                        import_decl.src.value = Wtf8Atom::from(new_spec);
                        import_decl.src.raw = None;
                    }
                }
                ModuleDecl::ExportAll(export_all) => {
                    let orig = export_all.src.value.to_string_lossy().to_string();
                    if let Some(new_spec) = self.resolve_using_paths(&orig) {
                        export_all.src.value = Wtf8Atom::from(new_spec);
                        export_all.src.raw = None;
                    }
                }
                ModuleDecl::ExportDecl(_) => {}
                ModuleDecl::ExportNamed(named) => {
                    if let Some(src) = &mut named.src {
                        let orig = src.value.to_string_lossy().to_string();
                        if let Some(new_spec) = self.resolve_using_paths(&orig) {
                            src.value = Wtf8Atom::from(new_spec);
                            src.raw = None;
                        }
                    }
                }
                _ => {}
            },
            ModuleItem::Stmt(stmt) => {
                // For statements, we still need to inspect call expressions (require)
                stmt.visit_mut_children_with(self);
            }
        }
    }

    fn visit_mut_expr(&mut self, n: &mut Expr) {
        // dynamic import: import("x")
        if let Expr::Call(CallExpr { callee, args, .. }) = n {
            // CommonJS require: require("x")
            #[allow(clippy::collapsible_match)]
            if let Callee::Expr(callee_expr) = callee {
                if let Expr::Ident(ident) = &**callee_expr {
                    if &*ident.sym == "require" {
                        if let Some(ExprOrSpread { expr, .. }) = args.get_mut(0) {
                            if let Expr::Lit(Lit::Str(s)) = &mut **expr {
                                let orig = s.value.to_string_lossy().to_string();
                                if let Some(new_spec) = self.resolve_using_paths(&orig) {
                                    s.value = Wtf8Atom::from(new_spec);
                                    s.raw = None;
                                }
                            }
                        }
                    }
                }
            }
        }

        // For other expressions, recurse
        n.visit_mut_children_with(self);
    }
}

/// Try to find a file on disk for a candidate path. We try:
/// - the exact path
/// - path + .ts, .tsx, .js, .jsx, .d.ts
fn try_find_file_on_disk(candidate: &Path) -> Option<PathBuf> {
    if candidate.exists() && candidate.is_file() {
        return Some(std::fs::canonicalize(candidate).unwrap_or_else(|_| candidate.to_path_buf()));
    }

    static EXTS: [&str; 5] = ["ts", "tsx", "js", "jsx", "d.ts"];
    for ext in &EXTS {
        let mut p = candidate.to_path_buf();
        // if candidate already has an extension, skip adding another
        if candidate.extension().is_some() {
            // already has extension and didn't exist, skip
            continue;
        }
        p.set_extension(ext);
        if p.exists() && p.is_file() {
            return Some(std::fs::canonicalize(&p).unwrap_or(p));
        }
    }

    // try index files if candidate is a directory
    if candidate.is_dir() {
        for ext in &["ts", "tsx", "js", "jsx"] {
            let mut idx = candidate.to_path_buf();
            idx.push(format!("index.{}", ext));
            if idx.exists() && idx.is_file() {
                return Some(std::fs::canonicalize(&idx).unwrap_or(idx));
            }
        }
    }

    None
}

/// Produce a specifier string to use in imports:
/// - If target is inside file_dir parent, produce a relative path (e.g., "./sub/foo")
/// - Otherwise produce a path prefixed with "./" and the path relative to base (fallback).
fn make_relative_or_prefixed(file_dir: &Path, target: &Path) -> String {
    // Canonicalize both paths where possible so diff_paths returns a clean relative path
    let target_abs = std::fs::canonicalize(target).unwrap_or_else(|_| target.to_path_buf());
    let file_dir_abs = std::fs::canonicalize(file_dir).unwrap_or_else(|_| file_dir.to_path_buf());

    // Try to compute a relative path from file_dir to target
    let rel =
        pathdiff::diff_paths(&target_abs, &file_dir_abs).unwrap_or_else(|| target_abs.clone());

    let mut s = rel.to_string_lossy().to_string().replace('\\', "/");

    // Ensure relative paths start with ./
    if !s.starts_with('.') && !s.starts_with('/') {
        s = format!("./{}", s);
    }

    // Strip common source extensions (keep behaviour consistent with TS/SWC expectations)
    if s.ends_with(".d.ts") {
        s.truncate(s.len() - 5);
    } else if s.ends_with(".tsx") || s.ends_with(".jsx") {
        s.truncate(s.len() - 4);
    } else if s.ends_with(".ts") || s.ends_with(".js") {
        s.truncate(s.len() - 3);
    }

    s
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
    pub fn compile_file(&self, input: &Path, output: &Path) -> Result<(), String> {
        let cm: Lrc<SourceMap> = Default::default();

        // Capture errors in a buffer instead of printing to stderr
        let error_buffer = ErrorBuffer::new();
        let error_buffer_clone = error_buffer.clone();

        let emitter = EmitterWriter::new(Box::new(error_buffer), Some(cm.clone()), false, true);
        let handler = Handler::with_emitter(true, false, Box::new(emitter));

        // Apply transformations and generate code + optional sourcemap
        // SWC uses scoped thread-locals internally; ensure `GLOBALS` is set
        // for the entire parse -> transform -> codegen pipeline.
        let globals = Globals::default();
        let (code, map_opt) = GLOBALS
            .set(&globals, || {
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

        // Write output with optional sourcemap
        if self.ts_config.emit_sourcemap {
            if let Some(map) = map_opt {
                write_sourcemap_and_code(output, &code, Some(map))?;
            } else {
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
    /// Now accepts `input` to compute relative paths when rewriting imports.
    fn transform_and_generate(
        &self,
        module: swc_ecma_ast::Program,
        cm: &Lrc<SourceMap>,
        comments: &SingleThreadedComments,
        input: &Path,
    ) -> Result<(String, Option<String>), String> {
        let unresolved_mark = Mark::new();
        let top_level_mark = Mark::new();

        // Start from Program (owned)
        let mut program = module;

        // If ts_config defines base_url or paths, run our paths rewriter
        if let Some(base_url) = &self.ts_config.base_url {
            let compiled_paths = &self.ts_config.paths; // Used direct field access
            if !compiled_paths.is_empty() {
                let rewriter = PathsRewriter {
                    base_url: base_url.clone(),
                    paths: compiled_paths.clone(),
                    file_dir: input
                        .parent()
                        .map(PathBuf::from)
                        .unwrap_or_else(|| PathBuf::from(".")),
                };

                // visit mutably to rewrite specifiers
                let mut rewriter = rewriter;
                program.visit_mut_with(&mut rewriter);
            }
        }

        // agora aplique as transforms normais dentro do escopo de `HELPERS`
        // Helpers controla a injeção de helpers como `_extends` e deve ser
        // configurado via `HELPERS.set(...)` antes de executar transforms
        // que dependam dele.
        HELPERS.set(&Helpers::new(true), || {
            let module = program.apply(resolver(unresolved_mark, top_level_mark, true));
            let module = module.apply(strip(unresolved_mark, top_level_mark));
            let module = module.apply(common_js(
                PathResolverEnum::Default,
                unresolved_mark,
                swc_ecma_transforms_module::util::Config {
                    no_interop: true,
                    strict: true,
                    ..Default::default()
                },
                swc_ecma_transforms_module::common_js::FeatureFlag::default(),
            ));
            let module = module.apply(hygiene());
            let program = module.apply(fixer(Some(comments)));

            // NOTE: buffer de mappings como Vec<(BytePos, LineCol)>
            let mut src_map_buf: Vec<(BytePos, LineCol)> = Vec::new();
            let mut code_buf: Vec<u8> = Vec::new();

            {
                let js_writer =
                    JsWriter::new(cm.clone(), "\n", &mut code_buf, Some(&mut src_map_buf));
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
