/**
 * @fileoverview Path Transformer (Native).
 * Performs the heavy lifting of converting file-system naming conventions
 * into URI-compatible paths and executable Regular Expressions.
 */
use regex::Regex;

pub trait PathTransformer {
    fn transform_file_path(&self, path: &str) -> String;
    fn normalize_path(&self, path: &str, global_prefix: &str) -> String;
    fn is_dynamic_route(&self, path: &str) -> bool;
    fn generate_route_regex(&self, path: &str) -> String;
    fn clone_box(&self) -> Box<dyn PathTransformer>;
}

/// Helper to combine a base prefix with a path segment safely.
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

/// Helper to ensure a path starts with a single forward slash.
fn with_leading_slash(path: &str) -> String {
    if path.starts_with('/') {
        path.to_string()
    } else {
        format!("/{}", path)
    }
}

/// Helper to strip trailing slashes, unless the path is just "/".
fn without_trailing_slash(path: &str) -> String {
    if path.ends_with('/') && path.len() > 1 {
        path.trim_end_matches('/').to_string()
    } else {
        path.to_string()
    }
}

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
    pub fn new() -> Self {
        Self {
            remove_ext: Regex::new(r"\.(mts|mjs|ts|js)$").unwrap(),
            remove_groups: Regex::new(r"\(([^(/\\]+)\)[/\\]").unwrap(),
            // Matches [...name]
            catch_all_named: Regex::new(r"\[\.\.\.(\w+)\]").unwrap(),
            // Matches [...]
            catch_all: Regex::new(r"\[\.\.\.\]").unwrap(),
            // Matches [id]
            dynamic: Regex::new(r"\[([^/\]]+)\]").unwrap(),
            // Checks for :id presence
            dynamic_detector: Regex::new(r":\w+").unwrap(),
            // Extracts name from :id
            route_param: Regex::new(r":(\w+)").unwrap(),
        }
    }
}

impl PathTransformer for NativePathTransformer {
    /**
     * Converts a raw file path to a clean route string.
     * Example: "(admin)/[...slug].mts" -> "**:slug"
     */
    fn transform_file_path(&self, path: &str) -> String {
        let mut result = path.to_string();

        result = self.remove_ext.replace(&result, "").to_string();
        result = self.remove_groups.replace(&result, "").to_string();

        // Convert Catch-all named: [...slug] -> **:slug
        result = self
            .catch_all_named
            .replace_all(&result, "**:$1")
            .to_string();
        // Convert Catch-all unnamed: [...] -> **
        result = self.catch_all.replace_all(&result, "**").to_string();
        // Convert Dynamic: [id] -> :id
        result = self.dynamic.replace_all(&result, ":$1").to_string();

        result.replace('\\', "/")
    }

    /**
     * Finalizes the path by applying prefixes and cleaning slashes.
     */
    fn normalize_path(&self, path: &str, global_prefix: &str) -> String {
        let combined = with_base(path, global_prefix);
        let no_trailing = without_trailing_slash(&combined);
        with_leading_slash(&no_trailing)
    }

    fn is_dynamic_route(&self, path: &str) -> bool {
        self.dynamic_detector.is_match(path)
    }

    /**
     * Generates a Regex string that can match the URL.
     * Example: "/users/:id" -> "^/users/([^/]+)$"
     */
    fn generate_route_regex(&self, path: &str) -> String {
        let mut escaped = path.replace('/', r"\/");

        // Named catch-all: **:slug -> (.*)
        let catch_all_named_rx = Regex::new(r"\*\*:(\w+)").unwrap();
        escaped = catch_all_named_rx
            .replace_all(&escaped, r"(.*)")
            .to_string();

        // Unnamed catch-all: ** -> (.*)
        escaped = escaped.replace("**", "(.*)");

        // Standard dynamic: :id -> ([^/]+) (matches everything except slashes)
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
