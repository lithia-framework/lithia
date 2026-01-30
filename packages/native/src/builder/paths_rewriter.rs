//!
//! @fileoverview AST Path Rewriter (Native).
//! Visits the SWC AST to find import/export declarations and 'require' calls,
//! replacing TypeScript path aliases (@/*) with relative physical paths.
//!

use std::path::{Path, PathBuf};
use swc_atoms::Wtf8Atom;
use swc_ecma_ast::{CallExpr, Callee, Expr, ExprOrSpread, Lit, ModuleDecl, ModuleItem, Str};
use swc_ecma_visit::{VisitMut, VisitMutWith};

pub(crate) struct PathsRewriter {
    /// Base URL from tsconfig.json (usually project root).
    pub(crate) base_url: PathBuf,
    /// Mapping of aliases (e.g., "@/*" -> ["src/*"]).
    pub(crate) paths: Vec<(String, Vec<String>)>,
    /// Directory of the file currently being processed.
    pub(crate) file_dir: PathBuf,
}

impl PathsRewriter {
    /// Entry point for resolving a module specifier using configured aliases.
    pub(crate) fn resolve_using_paths(&self, spec: &str) -> Option<String> {
        // We don't touch relative or absolute imports
        if spec.starts_with('.') || spec.starts_with('/') {
            return None;
        }

        for (from, to_list) in &self.paths {
            if from.contains('*') {
                if let Some(res) = self.resolve_wildcard(from, to_list, spec) {
                    return Some(res);
                }
            } else if let Some(res) = self.resolve_exact(from, to_list, spec) {
                return Some(res);
            }
        }

        self.resolve_base_url(spec)
    }

    fn resolve_wildcard(&self, from: &str, to_list: &[String], spec: &str) -> Option<String> {
        let pos = from.find('*')?;
        let prefix = &from[..pos];
        if !spec.starts_with(prefix) {
            return None;
        }
        let extra = &spec[prefix.len()..];

        for target in to_list {
            let replaced = target.replace('*', extra);

            if let Some(abs_found) = try_find_file_on_disk(&self.base_url.join(&replaced)) {
                return Some(make_relative_or_prefixed(&self.file_dir, &abs_found));
            }
        }
        None
    }

    fn resolve_exact(&self, from: &str, to_list: &[String], spec: &str) -> Option<String> {
        if spec != from {
            return None;
        }
        let target = &to_list[0];
        let target_path = Path::new(target);

        let abs_path = if target_path.is_absolute() {
            target_path.to_path_buf()
        } else {
            self.base_url.join(target)
        };

        try_find_file_on_disk(&abs_path)
            .map(|found| make_relative_or_prefixed(&self.file_dir, &found))
    }

    fn resolve_base_url(&self, spec: &str) -> Option<String> {
        try_find_file_on_disk(&self.base_url.join(spec))
            .map(|found| make_relative_or_prefixed(&self.file_dir, &found))
    }

    /// Internal helper to update a String Literal in the AST
    fn rewrite_str_lit(&self, s: &mut Str) {
        let orig = s.value.to_string_lossy();
        if let Some(new_spec) = self.resolve_using_paths(&orig) {
            s.value = Wtf8Atom::from(new_spec);
            s.raw = None;
        }
    }
}

impl VisitMut for PathsRewriter {
    fn visit_mut_module_item(&mut self, n: &mut ModuleItem) {
        if let ModuleItem::ModuleDecl(decl) = n {
            match decl {
                ModuleDecl::Import(i) => self.rewrite_str_lit(&mut i.src),
                ModuleDecl::ExportAll(e) => self.rewrite_str_lit(&mut e.src),
                ModuleDecl::ExportNamed(e) => {
                    if let Some(src) = &mut e.src {
                        self.rewrite_str_lit(src);
                    }
                }
                _ => {}
            }
        }
        n.visit_mut_children_with(self);
    }

    fn visit_mut_expr(&mut self, n: &mut Expr) {
        if let Expr::Call(CallExpr { callee, args, .. }) = n {
            if let Callee::Expr(callee_expr) = callee {
                if let Expr::Ident(ident) = &**callee_expr {
                    if ident.sym == *"require" {
                        if let Some(ExprOrSpread { expr, .. }) = args.get_mut(0) {
                            if let Expr::Lit(Lit::Str(s)) = &mut **expr {
                                self.rewrite_str_lit(s);
                            }
                        }
                    }
                }
            }
        }
        n.visit_mut_children_with(self);
    }
}

// --- File System Utilities ---

pub(crate) fn try_find_file_on_disk(candidate: &Path) -> Option<PathBuf> {
    if candidate.is_file() {
        return Some(candidate.to_path_buf());
    }

    // Probing for extensions
    for ext in &["mts", "mjs", "ts", "js"] {
        let mut p = candidate.to_path_buf();
        p.set_extension(ext);
        if p.is_file() {
            return Some(p);
        }
    }

    // Probing for index files
    if candidate.is_dir() {
        for ext in &["mts", "mjs", "ts", "js"] {
            let mut idx = candidate.to_path_buf();
            idx.push(format!("index.{}", ext));
            if idx.is_file() {
                return Some(idx);
            }
        }
    }

    None
}

pub(crate) fn make_relative_or_prefixed(file_dir: &Path, target: &Path) -> String {
    // Canonicalize to resolve any symlinks/dots for accurate diffing
    let target_abs = std::fs::canonicalize(target).unwrap_or_else(|_| target.to_path_buf());
    let file_dir_abs = std::fs::canonicalize(file_dir).unwrap_or_else(|_| file_dir.to_path_buf());

    let rel =
        pathdiff::diff_paths(&target_abs, &file_dir_abs).unwrap_or_else(|| target_abs.clone());
    let mut s = rel.to_string_lossy().to_string().replace('\\', "/");

    if !s.starts_with('.') && !s.starts_with('/') {
        s = format!("./{}", s);
    }

    // Rewrite TS extensions to JS extensions for Node.js ESM
    // if s.ends_with(".mts") || s.ends_with(".ts") {
    //     let pos = s.rfind('.').unwrap();
    //     s.truncate(pos);
    //     s.push_str(".js");
    // }

    if s.ends_with(".ts") {
        let pos = s.rfind('.').unwrap();
        s.truncate(pos);
        s.push_str(".js");
    } else if s.ends_with(".mts") {
        let pos = s.rfind('.').unwrap();
        s.truncate(pos);
        s.push_str(".mjs");
    }

    s
}
