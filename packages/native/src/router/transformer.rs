//! Utilities to transform filesystem route file paths into normalized HTTP
//! route paths and regular expressions used by the router.
//!
//! This module exposes the `PathTransformer` trait which defines the
//! transformations required to convert a filesystem-style route (for example
//! `users/[id]/route.ts`) into a normalized runtime path (`/users/:id/route`),
//! a route regex and helper utilities. The `NativePathTransformer` implements
//! the trait with the typical behaviour expected by the framework.
//!
//! Public API:
//! - `PathTransformer` trait: abstraction used across the codebase to convert
//!   and normalize paths.
//! - `NativePathTransformer`: default implementation used by the native router.

use regex::Regex;

/// Trait that defines path transformation utilities used by the router.
/// Implementors convert filesystem file paths into normalized route paths,
/// detect dynamic segments, and produce regular expressions suitable for
/// matching incoming requests.
pub trait PathTransformer {
    /// Transform a filesystem file path into a normalized route-like path.
    ///
    /// Example: `users/[id]/route.ts` -> `users/:id/route`.
    fn transform_file_path(&self, path: &str) -> String;

    /// Normalize a route path applying a global prefix, ensuring a leading
    /// slash and removing trailing slashes where appropriate.
    ///
    /// Example: `("/users", "/api")` -> `/api/users`.
    fn normalize_path(&self, path: &str, global_prefix: &str) -> String;

    /// Return true when the supplied path contains dynamic segments (e.g.
    /// `:id`).
    fn is_dynamic_route(&self, path: &str) -> bool;

    /// Generate a regular expression string from a normalized route path.
    ///
    /// Example: `/users/:id` -> `^/users/([^\/]+)$`.
    fn generate_route_regex(&self, path: &str) -> String;

    /// Clone the transformer as a boxed trait object.
    fn clone_box(&self) -> Box<dyn PathTransformer>;
}

/// Join `base` and `path`, ensuring there is at most one separator between
/// them. If `base` is empty, `path` is returned unchanged.
fn with_base(path: &str, base: &str) -> String {
    if base.is_empty() {
        path.to_string()
    } else {
        format!(
            "{}/{}",
            base.trim_end_matches('/'),
            path.trim_start_matches('/')
        )
    }
}

/// Ensure the provided `path` starts with a leading slash.
fn with_leading_slash(path: &str) -> String {
    if path.starts_with('/') {
        path.to_string()
    } else {
        format!("/{}", path)
    }
}

/// Remove a trailing slash from `path` except when the path is `/`.
fn without_trailing_slash(path: &str) -> String {
    if path.ends_with('/') && path.len() > 1 {
        path.trim_end_matches('/').to_string()
    } else {
        path.to_string()
    }
}

/// Default `PathTransformer` implementation used by the native router.
/// It converts filesystem route file names and patterns (including dynamic
/// segments like `[id]` and catch-all `[...path]`) into normalized runtime
/// path templates and regexes.
#[derive(Clone)]
pub struct NativePathTransformer {
    remove_ext: Regex,
    remove_groups: Regex,
    catch_all_named: Regex,
    catch_all: Regex,
    dynamic: Regex,
    dynamic_detector: Regex,
    route_param: Regex,
}

impl NativePathTransformer {
    /// Construct a new `NativePathTransformer` with precompiled regular
    /// expressions tuned for route syntax used by the framework.
    pub fn new() -> Self {
        Self {
            remove_ext: Regex::new(r"\.[A-Za-z]+$").unwrap(),
            remove_groups: Regex::new(r"\(([^(/\\]+)\)[/\\]").unwrap(),
            catch_all_named: Regex::new(r"\[\.\.\.(\w+)\]").unwrap(),
            catch_all: Regex::new(r"\[\.\.\.]").unwrap(),
            dynamic: Regex::new(r"\[([^/\]]+)\]").unwrap(),
            dynamic_detector: Regex::new(r":\w+").unwrap(),
            route_param: Regex::new(r":(\w+)").unwrap(),
        }
    }
}

impl PathTransformer for NativePathTransformer {
    fn transform_file_path(&self, path: &str) -> String {
        let mut result = path.to_string();

        result = self.remove_ext.replace(&result, "").to_string();
        result = self.remove_groups.replace(&result, "").to_string();
        result = self
            .catch_all_named
            .replace_all(&result, "**:$1")
            .to_string();
        result = self.catch_all.replace_all(&result, "**").to_string();
        result = self.dynamic.replace_all(&result, ":$1").to_string();
        result = result.replace('\\', "/");

        result
    }

    fn normalize_path(&self, path: &str, global_prefix: &str) -> String {
        let combined = with_base(path, global_prefix);
        let no_trailing = without_trailing_slash(&combined);
        with_leading_slash(&no_trailing)
    }

    fn is_dynamic_route(&self, path: &str) -> bool {
        self.dynamic_detector.is_match(path)
    }

    fn generate_route_regex(&self, path: &str) -> String {
        let escaped = path.replace('/', r"\/");

        let regex_body = self
            .route_param
            .replace_all(&escaped, r"([^\/]+)")
            .to_string();

        format!("^{}$", regex_body)
    }

    fn clone_box(&self) -> Box<dyn PathTransformer> {
        Box::new(self.clone())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use regex::Regex;

    fn transformer() -> NativePathTransformer {
        NativePathTransformer::new()
    }

    #[test]
    fn transform_file_path_removes_extension() {
        let t = transformer();
        assert_eq!(t.transform_file_path("users/route.ts"), "users/route")
    }

    #[test]
    fn transform_file_path_removes_route_groups() {
        let t = transformer();
        assert_eq!(t.transform_file_path("(v1)/users/route.ts"), "users/route")
    }

    #[test]
    fn transform_file_path_dynamic_segments() {
        let t = transformer();
        assert_eq!(
            t.transform_file_path("users/[id]/route.ts"),
            "users/:id/route"
        )
    }

    #[test]
    fn transform_file_path_multiple_dynamic_segments() {
        let t = transformer();
        assert_eq!(
            t.transform_file_path("users/[userId]/posts/[postId]/route.ts"),
            "users/:userId/posts/:postId/route"
        )
    }

    #[test]
    fn transform_file_path_catch_all_named() {
        let t = transformer();
        assert_eq!(
            t.transform_file_path("files/[...path]/route.ts"),
            "files/**:path/route"
        )
    }

    #[test]
    fn transform_file_path_catch_all_unnamed() {
        let t = transformer();
        assert_eq!(
            t.transform_file_path("files/[...]/route.ts"),
            "files/**/route"
        )
    }

    #[test]
    fn transform_file_path_normalizes_windows_separators() {
        let t = transformer();
        assert_eq!(
            t.transform_file_path(r"users\[id]\route.ts"),
            "users/:id/route"
        )
    }

    #[test]
    fn normalize_path_applies_global_prefix() {
        let t = transformer();
        assert_eq!(t.normalize_path("/users", "/api"), "/api/users")
    }

    #[test]
    fn normalize_path_removes_trailing_slash() {
        let t = transformer();
        assert_eq!(t.normalize_path("/users/", ""), "/users")
    }

    #[test]
    fn normalize_path_ensures_leading_slash() {
        let t = transformer();
        assert_eq!(t.normalize_path("users", ""), "/users")
    }

    #[test]
    fn detects_dynamic_route() {
        let t = transformer();
        assert!(t.is_dynamic_route("/users/:id"));
    }

    #[test]
    fn detects_static_route() {
        let t = transformer();
        assert!(!t.is_dynamic_route("/about"));
    }

    #[test]
    fn generate_route_regex_static() {
      let t = transformer();
      let regex_str = t.generate_route_regex("/about");
      let regex = Regex::new(&regex_str).unwrap();

      assert!(regex.is_match("/about"));
      assert!(!regex.is_match("/about/us"));
    }

    #[test]
    fn generate_route_regex_dynamic() {
      let t = transformer();
      let regex_str = t.generate_route_regex("/users/:id");
      let regex = Regex::new(&regex_str).unwrap();

      assert!(regex.is_match("/users/123"));
      assert!(regex.is_match("/users/abc"));
      assert!(!regex.is_match("/users/"));
      assert!(!regex.is_match("/users/123/profile"));
    }

    #[test]
    fn generate_route_regex_nested_dynamic() {
      let t = transformer();
      let regex_str = t.generate_route_regex("/users/:userId/posts/:postId");
      let regex = Regex::new(&regex_str).unwrap();

      assert!(regex.is_match("/users/42/posts/100"));
      assert!(regex.is_match("/users/john/posts/abc"));
      assert!(!regex.is_match("/users/42/posts/"));
      assert!(!regex.is_match("/users/42/posts/100/comments"));
    }
}
