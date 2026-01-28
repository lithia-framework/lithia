use regex::Regex;

pub trait PathTransformer {
    fn normalize(&self, path: &str) -> String;
    fn normalize_path(&self, path: &str, global_prefix: &str) -> String;
    fn clone_box(&self) -> Box<dyn PathTransformer>;
}

#[derive(Clone)]
pub struct NativeEventTransformer {
    remove_ext: Regex,
    remove_groups: Regex,
}

impl NativeEventTransformer {
    pub fn new() -> Self {
        Self {
            remove_ext: Regex::new(r"\.(mts|mjs)$").unwrap(),
            remove_groups: Regex::new(r"\(([^(/\\]+)\)[/\\]").unwrap(),
        }
    }
}

impl PathTransformer for NativeEventTransformer {
    /// Normalize an event file path: remove extension, remove groups and
    /// normalize separators to `/`.
    fn normalize(&self, path: &str) -> String {
        let mut s = path.to_string();
        s = self.remove_ext.replace(&s, "").to_string();
        s = self.remove_groups.replace_all(&s, "").to_string();
        s.replace('\\', "/")
    }

    /// Normalize a path and apply an optional global prefix, returning a
    /// value that always starts with a leading slash.
    fn normalize_path(&self, path: &str, global_prefix: &str) -> String {
        let combined = if global_prefix.is_empty() {
            path.to_string()
        } else {
            format!("{}/{}", global_prefix.trim_end_matches('/'), path.trim_start_matches('/'))
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
        assert_eq!(t.normalize("app/events/chat/message.mts"), "app/events/chat/message");
        assert_eq!(t.normalize("(v1)/events/connection.mts"), "events/connection");
    }
}
