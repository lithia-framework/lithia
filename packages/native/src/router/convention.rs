//!
//! @fileoverview Route Convention Engine (Native).
//! Handles the logic for converting file paths into RESTful routes.
//! Supports method-specific routing via filenames (e.g., route.post.mts).
//!

use crate::router::transformer::{NativePathTransformer, PathTransformer};
use regex::Regex;

/// Contract for turning a file system path into a web route.
pub trait RouteConvention {
    fn transform_path(&self, path: &str) -> String;
    fn extract_method(&self, path: &str) -> ExtractedMethod;
}

/// HTTP methods supported by the Lithia file-naming convention.
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
    /// Maps a string suffix to an enum variant.
    pub fn from_str(method: &str) -> Option<Self> {
        match method.to_lowercase().as_str() {
            "delete" => Some(Self::Delete),
            "get" => Some(Self::Get),
            "head" => Some(Self::Head),
            "options" => Some(Self::Options),
            "patch" => Some(Self::Patch),
            "post" => Some(Self::Post),
            "put" => Some(Self::Put),
            _ => None,
        }
    }

    /// Returns the standard uppercase HTTP verb.
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Delete => "DELETE",
            Self::Get => "GET",
            Self::Head => "HEAD",
            Self::Options => "OPTIONS",
            Self::Patch => "PATCH",
            Self::Post => "POST",
            Self::Put => "PUT",
        }
    }
}

/// The result of parsing a path, containing the method and the cleaned URL path.
#[derive(Debug)]
pub struct ExtractedMethod {
    pub method: Option<MatchedMethodSuffix>,
    pub updated_path: String,
}

pub struct NativeRouteConvention {
    /// Regex to identify 'route' files and extract optional methods.
    /// Captures: (1) separator, (2) full method suffix, (3) method name, (4) extension.
    route_regex: Regex,
    transformer: Box<dyn PathTransformer>,
}

impl NativeRouteConvention {
    pub fn new(transformer: Option<Box<dyn PathTransformer>>) -> Self {
        Self {
            // Matches: route.ts, route.get.mts, /route.post.mjs, etc.
            route_regex: Regex::new(
                r"(^|/)route(\.(delete|get|head|options|patch|post|put))?\.(mts|mjs)$",
            )
            .unwrap(),
            transformer: transformer.unwrap_or_else(|| Box::new(NativePathTransformer::new())),
        }
    }

    /// Internal helper to ensure paths are clean and start with a slash.
    fn ensure_leading_slash(&self, path: &str) -> String {
        let cleaned = path.replace('\\', "/");
        if cleaned.starts_with('/') {
            cleaned
        } else {
            format!("/{}", cleaned)
        }
    }
}

impl RouteConvention for NativeRouteConvention {
    /**
     * Transforms a file path into a clean URL path.
     * Example: "admin/(auth)/users/[id]/route.get.mts" -> "/admin/users/:id"
     */
    fn transform_path(&self, path: &str) -> String {
        let mut result = path.to_string();

        // 1. Normalize separators
        result = result.replace('\\', "/");

        // 2. Remove the "route.method.ext" part
        result = self.route_regex.replace(&result, "").to_string();

        // 3. Delegate to transformer for Groups (auth) and Params [id]
        result = self.transformer.transform_file_path(&result);

        self.ensure_leading_slash(&result)
    }

    /**
     * Extracts the HTTP method from the filename if present.
     */
    fn extract_method(&self, path: &str) -> ExtractedMethod {
        let (method, raw_path) = if let Some(caps) = self.route_regex.captures(path) {
            let m = caps
                .get(3)
                .and_then(|m| MatchedMethodSuffix::from_str(m.as_str()));
            let p = self.route_regex.replace(path, "").to_string();
            (m, p)
        } else {
            (None, path.to_string())
        };

        ExtractedMethod {
            method,
            updated_path: self.ensure_leading_slash(&raw_path),
        }
    }
}
