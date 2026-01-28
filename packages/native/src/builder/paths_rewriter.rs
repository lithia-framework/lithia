use std::path::{Path, PathBuf};

use swc_atoms::Wtf8Atom;
use swc_ecma_ast::{CallExpr, Callee, Expr, ExprOrSpread, Lit, Module, ModuleDecl, ModuleItem};
use swc_ecma_visit::{VisitMut, VisitMutWith};

pub(crate) struct PathsRewriter {
    pub(crate) base_url: PathBuf,
    pub(crate) paths: Vec<(String, Vec<String>)>,
    pub(crate) file_dir: PathBuf,
}

impl PathsRewriter {
    pub(crate) fn resolve_using_paths(&self, spec: &str) -> Option<String> {
        if spec.starts_with('.') || spec.starts_with('/') {
            return None;
        }

        for (from, to_list) in &self.paths {
            if from.contains('*') {
                if let Some(res) = self.resolve_wildcard(from, to_list, spec) {
                    return Some(res);
                }
            } else {
                if let Some(res) = self.resolve_exact(from, to_list, spec) {
                    return Some(res);
                }
            }
        }

        self.resolve_base_url(spec)
    }

    fn resolve_wildcard(&self, from: &str, to_list: &Vec<String>, spec: &str) -> Option<String> {
        if from.as_bytes().iter().filter(|&&c| c == b'*').count() != 1 {
            return None;
        }
        let pos = from.find('*').unwrap();
        let prefix = &from[..pos];
        if !spec.starts_with(prefix) {
            return None;
        }
        let extra = &spec[prefix.len()..];

        for target in to_list {
            let replaced = target.replace('*', extra);

            if let Some(abs_found) = try_find_file_on_disk(&self.base_url.join(&replaced)) {
                let rel = make_relative_or_prefixed(&self.file_dir, &abs_found);
                return Some(rel);
            }

            if let Some(abs_found) =
                try_find_file_on_disk(&self.base_url.join(format!("./{}", replaced)))
            {
                let rel = make_relative_or_prefixed(&self.file_dir, &abs_found);
                return Some(rel);
            }

            if to_list.len() == 1 && !prefix.is_empty() {
                let mut replaced_for_import = replaced.clone();
                if !replaced_for_import.starts_with("./") && !replaced_for_import.starts_with('/') {
                    replaced_for_import = format!("./{}", replaced_for_import);
                }
                return Some(replaced_for_import);
            }
        }

        None
    }

    fn resolve_exact(&self, from: &str, to_list: &Vec<String>, spec: &str) -> Option<String> {
        if spec != from {
            return None;
        }
        let target = &to_list[0];
        let tp = Path::new(target);
        if tp.is_absolute() {
            if let Some(abs_found) = try_find_file_on_disk(tp) {
                let rel = make_relative_or_prefixed(&self.file_dir, &abs_found);
                return Some(rel);
            }
            return Some(target.clone());
        }

        if let Some(abs_found) = try_find_file_on_disk(&self.base_url.join(target)) {
            let rel = make_relative_or_prefixed(&self.file_dir, &abs_found);
            return Some(rel);
        }

        let mut replaced_for_import = target.clone();
        if !replaced_for_import.starts_with("./") && !replaced_for_import.starts_with('/') {
            replaced_for_import = format!("./{}", replaced_for_import);
        }
        Some(replaced_for_import)
    }

    fn resolve_base_url(&self, spec: &str) -> Option<String> {
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
                stmt.visit_mut_children_with(self);
            }
        }
    }

    fn visit_mut_expr(&mut self, n: &mut Expr) {
        if let Expr::Call(CallExpr { callee, args, .. }) = n {
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

        n.visit_mut_children_with(self);
    }
}

pub(crate) fn try_find_file_on_disk(candidate: &Path) -> Option<PathBuf> {
    if candidate.exists() && candidate.is_file() {
        return Some(std::fs::canonicalize(candidate).unwrap_or_else(|_| candidate.to_path_buf()));
    }
        static EXTS: [&str; 2] = ["mts", "mjs"];

        if let Some(orig_ext_os) = candidate.extension() {
            if let Some(orig_ext) = orig_ext_os.to_str() {
                for ext in &EXTS {
                    if ext == &orig_ext {
                        continue;
                    }
                    let mut p = candidate.to_path_buf();
                    p.set_extension(ext);
                    if p.exists() && p.is_file() {
                        return Some(std::fs::canonicalize(&p).unwrap_or(p));
                    }
                }
            }
        } else {
            for ext in &EXTS {
                let mut p = candidate.to_path_buf();
                if candidate.extension().is_some() {
                    continue;
                }
                p.set_extension(ext);
                if p.exists() && p.is_file() {
                    return Some(std::fs::canonicalize(&p).unwrap_or(p));
                }
            }
        }

    if candidate.is_dir() {
        for ext in &["mts", "mjs"] {
            let mut idx = candidate.to_path_buf();
            idx.push(format!("index.{}", ext));
            if idx.exists() && idx.is_file() {
                return Some(std::fs::canonicalize(&idx).unwrap_or(idx));
            }
        }
    }

    None
}

pub(crate) fn make_relative_or_prefixed(file_dir: &Path, target: &Path) -> String {
    let target_abs = std::fs::canonicalize(target).unwrap_or_else(|_| target.to_path_buf());
    let file_dir_abs = std::fs::canonicalize(file_dir).unwrap_or_else(|_| file_dir.to_path_buf());

    let rel = pathdiff::diff_paths(&target_abs, &file_dir_abs).unwrap_or_else(|| target_abs.clone());

    let mut s = rel.to_string_lossy().to_string().replace('\\', "/");

    if !s.starts_with('.') && !s.starts_with('/') {
        s = format!("./{}", s);
    }

    if s.ends_with(".mts") {
        s.truncate(s.len() - 4);
        s.push_str(".mjs");
    }

    s
}
