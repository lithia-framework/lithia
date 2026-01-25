//! Route file processor utilities.
//!
//! This module exposes the `RouteProcessor` trait and a concrete
//! `NativeRouteProcessor` implementation. The processor is responsible for
//! converting a scanned filesystem `FileInfo` (a file that follows the route
//! file conventions) into a `RouteCore` structure used by the router.
//!
//! Behaviour highlights:
//! - Extracts optional HTTP method suffix (e.g. `route.post.ts`).
//! - Transforms filesystem path patterns into normalized runtime paths
//!   (e.g. `users/[id]/route.ts` -> `/users/:id`).
//! - Removes trailing `/index` segments and ensures leading slash.
//! - Produces a regex string for route matching and indicates whether a
//!   route is dynamic.

use crate::scanner::FileInfo;
use crate::router::{
    convention::{NativeRouteConvention, RouteConvention},
    transformer::{NativePathTransformer, PathTransformer},
    RouteCore,
};

/// Trait that converts a discovered `FileInfo` into framework `RouteCore`.
/// Implementations encapsulate how filenames and paths are interpreted as
/// runtime routes.
pub trait RouteProcessor {
    /// Process a scanned `file` and return a `RouteCore` describing the
    /// route's HTTP method (if any), normalized path, whether it's dynamic,
    /// the original file path and the generated regex.
    fn process_route_file(&self, file: &FileInfo) -> RouteCore;
}

/// Native implementation of `RouteProcessor` used by the default router.
/// `NativeRouteProcessor` composes a `PathTransformer` and a
/// `RouteConvention` to implement the file -> route conversion logic. Both
/// components are replaceable for testing or customization.
pub struct NativeRouteProcessor {
    transformer: Box<dyn PathTransformer>,
    convention: Box<dyn RouteConvention>,
}

impl NativeRouteProcessor {
    /// Create a new `NativeRouteProcessor`.
    /// `opt_transformer` and `opt_convention` are optional boxed trait
    /// instances. When omitted, default native implementations are used.
    pub fn new(
        opt_transformer: Option<Box<dyn PathTransformer>>,
        opt_convention: Option<Box<dyn RouteConvention>>,
    ) -> Self {
        let transformer = opt_transformer.unwrap_or_else(|| Box::new(NativePathTransformer::new()));
        let convention = opt_convention
            .unwrap_or_else(|| Box::new(NativeRouteConvention::new(Some(transformer.clone_box()))));

        Self {
            transformer,
            convention,
        }
    }
}

impl RouteProcessor for NativeRouteProcessor {
    /// Convert a filesystem `FileInfo` into a `RouteCore`.
    /// Steps:
    /// 1. Use the `RouteConvention` to extract any method suffix and the
    ///    canonical path.
    /// 2. Normalize the path (apply prefix, remove trailing `/index`, ensure
    ///    leading slash).
    /// 3. Determine whether the route is dynamic and generate the route regex.
    fn process_route_file(&self, file: &FileInfo) -> RouteCore {
        let extracted = self.convention.extract_method(&file.path);
        let mut path = self.convention.transform_path(&extracted.updated_path);

        path = self.transformer.normalize_path(&path, "");
        path = self.transformer.remove_index_suffix(&path);

        let dynamic = self.transformer.is_dynamic_route(&path);
        let regex = self.transformer.generate_route_regex(&path);

        RouteCore {
            method: extracted.method,
            path,
            dynamic,
            file_path: file.full_path.clone(),
            regex,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::router::convention::MatchedMethodSuffix;

    fn processor() -> NativeRouteProcessor {
        NativeRouteProcessor::new(None, None)
    }

    fn file_info(path: &str, full_path: &str) -> FileInfo {
        FileInfo {
            path: path.to_string(),
            full_path: full_path.to_string(),
        }
    }

    #[test]
    fn processes_static_routes_with_methods() {
        let p = processor();
        
        // Simple route without method
        let route = p.process_route_file(&file_info("users/route.ts", "/project/src/users/route.ts"));
        assert_eq!(route.path, "/users");
        assert_eq!(route.method, None);
        assert!(!route.dynamic);
        assert_eq!(route.file_path, "/project/src/users/route.ts");
        assert_eq!(route.regex, r"^\/users$");

        // Route with POST method
        let route = p.process_route_file(&file_info("users/route.post.ts", "/project/src/users/route.post.ts"));
        assert_eq!(route.path, "/users");
        assert_eq!(route.method, Some(MatchedMethodSuffix::Post));
        assert!(!route.dynamic);
        assert_eq!(route.file_path, "/project/src/users/route.post.ts");

        // Route with GET method
        let route = p.process_route_file(&file_info("about/route.get.ts", "/project/src/about/route.get.ts"));
        assert_eq!(route.path, "/about");
        assert_eq!(route.method, Some(MatchedMethodSuffix::Get));
        assert_eq!(route.regex, r"^\/about$");
    }

    #[test]
    fn processes_dynamic_routes() {
        let p = processor();
        
        // Single dynamic segment
        let route = p.process_route_file(&file_info("users/[id]/route.ts", "/project/src/users/[id]/route.ts"));
        assert_eq!(route.path, "/users/:id");
        assert_eq!(route.method, None);
        assert!(route.dynamic);
        assert_eq!(route.file_path, "/project/src/users/[id]/route.ts");
        assert_eq!(route.regex, r"^\/users\/([^\/]+)$");

        // Multiple dynamic segments with method
        let route = p.process_route_file(&file_info(
            "users/[userId]/posts/[postId]/route.get.ts",
            "/project/src/users/[userId]/posts/[postId]/route.get.ts",
        ));
        assert_eq!(route.path, "/users/:userId/posts/:postId");
        assert_eq!(route.method, Some(MatchedMethodSuffix::Get));
        assert!(route.dynamic);
        assert_eq!(route.file_path, "/project/src/users/[userId]/posts/[postId]/route.get.ts");
        assert_eq!(route.regex, r"^\/users\/([^\/]+)\/posts\/([^\/]+)$");
    }

    #[test]
    fn processes_index_routes() {
        let p = processor();
        
        // Root index
        let route = p.process_route_file(&file_info("index/route.ts", "/project/src/index/route.ts"));
        assert_eq!(route.path, "/");
        assert_eq!(route.method, None);
        assert!(!route.dynamic);
        assert_eq!(route.file_path, "/project/src/index/route.ts");

        // Nested index
        let route = p.process_route_file(&file_info("users/index/route.ts", "/project/src/users/index/route.ts"));
        assert_eq!(route.path, "/users");
        assert_eq!(route.method, None);
        assert_eq!(route.file_path, "/project/src/users/index/route.ts");
    }

    #[test]
    fn processes_route_groups() {
        let p = processor();
        
        // Simple group
        let route = p.process_route_file(&file_info("(v1)/users/route.ts", "/project/src/(v1)/users/route.ts"));
        assert_eq!(route.path, "/users");
        assert!(!route.dynamic);
        assert_eq!(route.file_path, "/project/src/(v1)/users/route.ts");

        // Group with dynamic route and method
        let route = p.process_route_file(&file_info(
            "(api)/users/[id]/route.delete.ts",
            "/project/src/(api)/users/[id]/route.delete.ts",
        ));
        assert_eq!(route.path, "/users/:id");
        assert_eq!(route.method, Some(MatchedMethodSuffix::Delete));
        assert!(route.dynamic);
        assert_eq!(route.file_path, "/project/src/(api)/users/[id]/route.delete.ts");
    }

    #[test]
    fn handles_windows_paths() {
        let p = processor();
        let route = p.process_route_file(&file_info(
            r"users\[id]\route.ts",
            r"C:\project\src\users\[id]\route.ts",
        ));
        assert_eq!(route.path, "/users/:id");
        assert!(route.dynamic);
        assert_eq!(route.file_path, r"C:\project\src\users\[id]\route.ts");
    }
}
