//! Route filename conventions and helpers.
//!
//! This module defines how route filenames are interpreted by the framework.
//! It provides:
//! - `RouteConvention` trait used to normalize filesystem paths and extract
//!   optional HTTP method suffixes.
//! - `NativeRouteConvention` default implementation that follows the project's
//!   filename conventions (e.g. `route.get.ts`, route groups, dynamic
//!   segments).
//!
//! The convention is intentionally small and pluggable so the routing
//! behaviour can be adapted for different project layouts.

use regex::Regex;

use crate::router::transformer::{NativePathTransformer, PathTransformer};

/// Trait that defines how filenames are converted into runtime route paths.
/// Implementors should remove route-specific filename suffixes and perform
/// any normalization required before the `PathTransformer` is applied.
pub trait RouteConvention {
    /// Transform a filesystem location into a normalized route path.
    ///
    /// The returned path should include a leading `/`.
    fn transform_path(&self, path: &str) -> String;

    /// Extract an optional HTTP method suffix from a filename and return the
    /// sanitized path alongside the detected method.
    fn extract_method(&self, path: &str) -> ExtractedMethod;
}

/// Supported HTTP method suffixes that can be encoded in filenames.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MatchedMethodSuffix {
    Delete,
    Get,
    Head,
    Options,
    Patch,
    Post,
    Put,
}

impl MatchedMethodSuffix {
    /// Parse a method name (case-insensitive) into a `MatchedMethodSuffix`.
    pub fn from_str(method: &str) -> Option<Self> {
        match method.to_lowercase().as_str() {
            "delete" => Some(MatchedMethodSuffix::Delete),
            "get" => Some(MatchedMethodSuffix::Get),
            "head" => Some(MatchedMethodSuffix::Head),
            "options" => Some(MatchedMethodSuffix::Options),
            "patch" => Some(MatchedMethodSuffix::Patch),
            "post" => Some(MatchedMethodSuffix::Post),
            "put" => Some(MatchedMethodSuffix::Put),
            _ => None,
        }
    }

    /// Return the uppercase HTTP method string (e.g. `GET`).
    pub fn as_str(&self) -> &'static str {
        match self {
            MatchedMethodSuffix::Delete => "DELETE",
            MatchedMethodSuffix::Get => "GET",
            MatchedMethodSuffix::Head => "HEAD",
            MatchedMethodSuffix::Options => "OPTIONS",
            MatchedMethodSuffix::Patch => "PATCH",
            MatchedMethodSuffix::Post => "POST",
            MatchedMethodSuffix::Put => "PUT",
        }
    }
}

/// Result of extracting an optional method suffix from a filename.
#[derive(Debug)]
pub struct ExtractedMethod {
    /// Detected method if the filename contained a method suffix.
    pub method: Option<MatchedMethodSuffix>,

    /// The sanitized path with the method suffix removed. Always starts with
    /// a leading `/`.
    pub updated_path: String,
}

/// Default route filename convention implementation.
/// Recognizes filenames like `/users/route.ts` and `/users/route.post.ts` and
/// removes the convention-specific suffixes. It delegates general path
/// transformations (groups, dynamic segments, extension removal) to a
/// `PathTransformer`.
pub struct NativeRouteConvention {
    route_regex: Regex,
    transformer: Box<dyn PathTransformer>,
}

impl NativeRouteConvention {
    /// Create a new `NativeRouteConvention`.
    /// `transformer` can be used to inject a custom `PathTransformer`; if
    /// omitted the default `NativePathTransformer` is used.
    pub fn new(transformer: Option<Box<dyn PathTransformer>>) -> Self {
        Self {
            route_regex: Regex::new(r"/route(\.(delete|get|head|options|patch|post|put))?\.(ts|js)$")
                .unwrap(),
            transformer: transformer.unwrap_or_else(|| Box::new(NativePathTransformer::new())),
        }
    }
}

impl RouteConvention for NativeRouteConvention {
    fn transform_path(&self, path: &str) -> String {
        let mut result = path.to_string();

        // Normalize to use forward slashes first
        result = result.replace('\\', "/");

        // Remove /route.ts and /route.{method}.ts (convention-specific)
        result = self.route_regex.replace(&result, "").to_string();

        // Delegate generic transformations to transformer
        result = self.transformer.transform_file_path(&result);

        // Ensure leading slash
        if !result.starts_with('/') {
            result = format!("/{}", result);
        }

        result
    }

    fn extract_method(&self, path: &str) -> ExtractedMethod {
        if let Some(caps) = self.route_regex.captures(path) {
            let method = caps
                .get(2)
                .and_then(|m| MatchedMethodSuffix::from_str(m.as_str()));

            let mut updated_path = self.route_regex.replace(path, "").to_string();

            // Ensure leading slash
            if !updated_path.starts_with('/') {
                updated_path = format!("/{}", updated_path);
            }

            return ExtractedMethod { method, updated_path };
        }

        let mut updated_path = path.to_string();

        // Ensure leading slash
        if !updated_path.starts_with('/') {
            updated_path = format!("/{}", updated_path);
        }

        ExtractedMethod { method: None, updated_path }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn convention() -> NativeRouteConvention {
        NativeRouteConvention::new(None)
    }

    #[test]
    fn transform_removes_route_ts() {
        let c = convention();
        assert_eq!(c.transform_path("users/route.ts"), "/users");
    }

    #[test]
    fn transform_removes_method_suffix() {
        let c = convention();
        assert_eq!(c.transform_path("users/route.get.ts"), "/users");
    }

    #[test]
    fn transform_removes_route_groups() {
        let c = convention();
        assert_eq!(c.transform_path("(v1)/users/route.ts"), "/users");
    }

    #[test]
    fn transform_dynamic_segments() {
        let c = convention();
        assert_eq!(c.transform_path("users/[id]/route.ts"), "/users/:id");
    }

    #[test]
    fn transform_normalizes_windows_separators() {
        let c = convention();
        assert_eq!(c.transform_path(r"users\[id]\route.ts"), "/users/:id");
    }

    #[test]
    fn transform_ensures_leading_slash() {
        let c = convention();
        assert_eq!(c.transform_path("users/route.ts"), "/users");
    }

    #[test]
    fn extract_method_from_route_filename() {
        let c = convention();
        let extracted = c.extract_method("users/route.post.ts");
        assert_eq!(extracted.method, Some(MatchedMethodSuffix::Post));
        assert_eq!(extracted.updated_path, "/users");
    }

    #[test]
    fn extract_method_without_method_suffix() {
        let c = convention();
        let extracted = c.extract_method("users/route.ts");
        assert_eq!(extracted.method, None);
        assert_eq!(extracted.updated_path, "/users");
    }

    #[test]
    fn extract_then_transform_produces_clean_route() {
        let c = convention();

        let extracted = c.extract_method("/(auth)/users/[id]/route.put.ts");
        let path = c.transform_path(&extracted.updated_path);

        assert_eq!(extracted.method, Some(MatchedMethodSuffix::Put));
        assert_eq!(path, "/users/:id");
    }

    #[test]
    fn full_static_route_pipeline() {
        let c = convention();

        let extracted = c.extract_method("/health/route.ts");
        let path = c.transform_path(&extracted.updated_path);

        assert_eq!(extracted.method, None);
        assert_eq!(path, "/health");
    }
}
