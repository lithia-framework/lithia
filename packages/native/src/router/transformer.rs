use regex::Regex;

pub trait PathTransformer {
    fn transform_file_path(&self, path: &str) -> String;
    fn normalize_path(&self, path: &str, global_prefix: &str) -> String;
    fn is_dynamic_route(&self, path: &str) -> bool;
    fn generate_route_regex(&self, path: &str) -> String;
    fn clone_box(&self) -> Box<dyn PathTransformer>;
}

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

fn with_leading_slash(path: &str) -> String {
    if path.starts_with('/') {
        path.to_string()
    } else {
        format!("/{}", path)
    }
}

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
            remove_ext: Regex::new(r"\.(mts|mjs)$").unwrap(),
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
        let mut escaped = path.replace('/', r"\/");

        let catch_all_named = Regex::new(r"\*\*:(\w+)").unwrap();
        escaped = catch_all_named.replace_all(&escaped, r"(.*)").to_string();

        escaped = escaped.replace("**", "(.*)");

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
        assert_eq!(t.transform_file_path("users/route.mts"), "users/route")
    }

    #[test]
    fn transform_file_path_removes_route_groups() {
        let t = transformer();
        assert_eq!(t.transform_file_path("(v1)/users/route.mts"), "users/route")
    }

    #[test]
    fn transform_file_path_dynamic_segments() {
        let t = transformer();
        assert_eq!(
            t.transform_file_path("users/[id]/route.mts"),
            "users/:id/route"
        )
    }

    #[test]
    fn transform_file_path_multiple_dynamic_segments() {
        let t = transformer();
        assert_eq!(
            t.transform_file_path("users/[userId]/posts/[postId]/route.mts"),
            "users/:userId/posts/:postId/route"
        )
    }

    #[test]
    fn transform_file_path_catch_all_named() {
        let t = transformer();
        assert_eq!(
            t.transform_file_path("files/[...path]/route.mts"),
            "files/**:path/route"
        )
    }

    #[test]
    fn transform_file_path_catch_all_unnamed() {
        let t = transformer();
        assert_eq!(
            t.transform_file_path("files/[...]/route.mts"),
            "files/**/route"
        )
    }

    #[test]
    fn transform_file_path_normalizes_windows_separators() {
        let t = transformer();
        assert_eq!(
            t.transform_file_path(r"users\[id]\route.mts"),
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
