use lithia_native_scanner::FileInfo;

use crate::{
    convention::{NativeRouteConvention, RouteConvention},
    transformer::{NativePathTransformer, PathTransformer},
    RouteCore,
};

pub trait RouteProcessor {
    fn process_route_file(&self, file: &FileInfo) -> RouteCore;
}

pub struct NativeRouteProcessor {
    transformer: Box<dyn PathTransformer>,
    convention: Box<dyn RouteConvention>,
}

impl NativeRouteProcessor {
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
            file_path: file.path.clone(),
            source_file_path: file.full_path.clone(),
            regex,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::convention::MatchedMethodSuffix;

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
    fn process_simple_route() {
        let p = processor();
        let file = file_info("users/route.ts", "/project/src/users/route.ts");
        let route = p.process_route_file(&file);

        assert_eq!(route.path, "/users");
        assert_eq!(route.method, None);
        assert!(!route.dynamic);
        assert_eq!(route.file_path, "users/route.ts");
        assert_eq!(route.source_file_path, "/project/src/users/route.ts");
    }

    #[test]
    fn process_route_with_method() {
        let p = processor();
        let file = file_info("users/route.post.ts", "/project/src/users/route.post.ts");
        let route = p.process_route_file(&file);

        assert_eq!(route.path, "/users");
        assert_eq!(route.method, Some(MatchedMethodSuffix::Post));
        assert!(!route.dynamic);
        assert_eq!(route.file_path, "users/route.post.ts");
    }

    #[test]
    fn process_dynamic_route() {
        let p = processor();
        let file = file_info("users/[id]/route.ts", "/project/src/users/[id]/route.ts");
        let route = p.process_route_file(&file);

        assert_eq!(route.path, "/users/:id");
        assert_eq!(route.method, None);
        assert!(route.dynamic);
        assert_eq!(route.file_path, "users/[id]/route.ts");
    }

    #[test]
    fn process_nested_dynamic_route() {
        let p = processor();
        let file = file_info(
            "users/[userId]/posts/[postId]/route.get.ts",
            "/project/src/users/[userId]/posts/[postId]/route.get.ts",
        );

        let route = p.process_route_file(&file);

        assert_eq!(route.path, "/users/:userId/posts/:postId");
        assert_eq!(route.method, Some(MatchedMethodSuffix::Get));
        assert!(route.dynamic);
        assert_eq!(route.file_path, "users/[userId]/posts/[postId]/route.get.ts");
    }

    #[test]
    fn process_index_route() {
        let p = processor();
        let file = file_info("index/route.ts", "/project/src/index/route.ts");
        let route = p.process_route_file(&file);

        assert_eq!(route.path, "/");
        assert_eq!(route.method, None);
        assert!(!route.dynamic);
        assert_eq!(route.file_path, "index/route.ts");
    }

    #[test]
    fn process_nested_index_route() {
        let p = processor();
        let file = file_info("users/index/route.ts", "/project/src/users/index/route.ts");
        let route = p.process_route_file(&file);

        assert_eq!(route.path, "/users");
        assert_eq!(route.method, None);
        assert!(!route.dynamic);
        assert_eq!(route.file_path, "users/index/route.ts");
    }

    #[test]
    fn process_route_with_groups() {
        let p = processor();
        let file = file_info("(v1)/users/route.ts", "/project/src/(v1)/users/route.ts");
        let route = p.process_route_file(&file);

        assert_eq!(route.path, "/users");
        assert!(!route.dynamic);
        assert_eq!(route.file_path, "(v1)/users/route.ts");
    }

    #[test]
    fn process_route_removes_route_groups_and_handles_method() {
        let p = processor();
        let file = file_info(
            "(api)/users/[id]/route.delete.ts",
            "/project/src/(api)/users/[id]/route.delete.ts",
        );
        let route = p.process_route_file(&file);

        assert_eq!(route.path, "/users/:id");
        assert_eq!(route.method, Some(MatchedMethodSuffix::Delete));
        assert!(route.dynamic);
        assert_eq!(route.file_path, "(api)/users/[id]/route.delete.ts");
    }

    #[test]
    fn process_windows_path() {
        let p = processor();
        let file = file_info(
            r"users\[id]\route.ts",
            r"C:\project\src\users\[id]\route.ts",
        );
        let route = p.process_route_file(&file);

        assert_eq!(route.path, "/users/:id");
        assert!(route.dynamic);
        assert_eq!(route.file_path, r"users\[id]\route.ts");
    }

    #[test]
    fn process_generates_correct_regex_for_static_route() {
        let p = processor();
        let file = file_info("about/route.ts", "/project/src/about/route.ts");
        let route = p.process_route_file(&file);

        assert_eq!(route.regex, r"^\/about$");
    }

    #[test]
    fn process_generates_correct_regex_for_dynamic_route() {
        let p = processor();
        let file = file_info("users/[id]/route.ts", "/project/src/users/[id]/route.ts");
        let route = p.process_route_file(&file);

        assert_eq!(route.regex, r"^\/users\/([^\/]+)$");
    }
}
