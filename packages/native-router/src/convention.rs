use regex::Regex;

use crate::transformer::{NativePathTransformer, PathTransformer};

pub trait RouteConvention {
    fn transform_path(&self, path: &str) -> String;
    fn extract_method(&self, path: &str) -> ExtractedMethod;
}

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

#[derive(Debug)]
pub struct ExtractedMethod {
    pub method: Option<MatchedMethodSuffix>,
    pub updated_path: String,
}

pub struct NativeRouteConvention {
    route_regex: Regex,
    transformer: Box<dyn PathTransformer>,
}

impl NativeRouteConvention {
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

            return ExtractedMethod {
                method,
                updated_path,
            };
        }

        let mut updated_path = path.to_string();

        // Ensure leading slash
        if !updated_path.starts_with('/') {
            updated_path = format!("/{}", updated_path);
        }

        ExtractedMethod {
            method: None,
            updated_path,
        }
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
