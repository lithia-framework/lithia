//!
//! @fileoverview Path Transformer (Native).
//! Handles string manipulation for event names, including extension stripping,
//! route group removal, and path prefixing.
//!

use regex::Regex;

/// Contract for transforming and normalizing paths.
pub trait PathTransformer {
    fn normalize(&self, path: &str) -> String;
    fn normalize_path(&self, path: &str, global_prefix: &str) -> String;
    fn clone_box(&self) -> Box<dyn PathTransformer>;
}

#[derive(Clone)]
pub struct NativeEventTransformer {
    /// Regex to strip TypeScript/JavaScript extensions.
    remove_ext: Regex,
    /// Regex to strip organizational groups like (auth) or (v1).
    remove_groups: Regex,
}

impl NativeEventTransformer {
    pub fn new() -> Self {
        Self {
            // Matches .mts or .mjs at the end of the string.
            remove_ext: Regex::new(r"\.(mts|mjs)$").unwrap(),
            // Matches segments in parentheses followed by a slash: (group)/
            remove_groups: Regex::new(r"\(([^(/\\]+)\)[/\\]").unwrap(),
        }
    }
}

impl PathTransformer for NativeEventTransformer {
    /**
     * Cleans a path for internal event identification.
     * Example: "(api)/v1/user.mts" -> "v1/user"
     */
    fn normalize(&self, path: &str) -> String {
        let mut s = path.to_string();

        // 1. Remove extensions
        s = self.remove_ext.replace(&s, "").to_string();

        // 2. Remove group folders like (v1)
        s = self.remove_groups.replace_all(&s, "").to_string();

        // 3. Unify separators to forward slashes
        s.replace('\\', "/")
    }

    /**
     * Normalizes a path and ensures a consistent leading slash.
     * Prevents double slashes and handles global prefixes.
     */
    fn normalize_path(&self, path: &str, global_prefix: &str) -> String {
        let combined = if global_prefix.is_empty() {
            path.to_string()
        } else {
            format!(
                "{}/{}",
                global_prefix.trim_end_matches('/'),
                path.trim_start_matches('/')
            )
        };

        let no_trailing = if combined.ends_with('/') && combined.len() > 1 {
            combined.trim_end_matches('/').to_string()
        } else {
            combined
        };

        if no_trailing.starts_with('/') {
            no_trailing
        } else {
            format!("/{}", no_trailing)
        }
    }

    fn clone_box(&self) -> Box<dyn PathTransformer> {
        Box::new(self.clone())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_basic() {
        let t = NativeEventTransformer::new();
        // Standard file
        assert_eq!(
            t.normalize("app/events/chat/message.mts"),
            "app/events/chat/message"
        );
        // Group folder stripping
        assert_eq!(
            t.normalize("(v1)/events/connection.mts"),
            "events/connection"
        );
    }

    #[test]
    fn normalize_path_leading_slash() {
        let t = NativeEventTransformer::new();
        assert_eq!(t.normalize_path("users", "/api"), "/api/users");
        assert_eq!(t.normalize_path("/users/", ""), "/users");
    }
}
