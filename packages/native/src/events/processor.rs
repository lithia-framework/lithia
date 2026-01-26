//! Event file processor utilities mirroring the router processor design.
//!
//! Converts scanned `FileInfo` entries for `app/events` into `Event`
//! structures suitable for serialization into `events.json`.

use crate::scanner::FileInfo;

use crate::events::convention::{EventConvention, NativeEventConvention};
use crate::events::transformer::{NativeEventTransformer, PathTransformer};
use crate::events::Event;

/// Trait that converts a discovered `FileInfo` into an `Event` structure.
pub trait EventProcessor {
    fn process_event_file(&self, file: &FileInfo) -> Event;
}

/// Native implementation of `EventProcessor` that composes a
/// `PathTransformer` and an `EventConvention` similar to the route
/// processor.
pub struct NativeEventProcessor {
    transformer: Box<dyn PathTransformer>,
    convention: Box<dyn EventConvention>,
}

impl NativeEventProcessor {
    /// Create a new `NativeEventProcessor`.
    /// Optional components may be provided for testing.
    pub fn new(
        opt_transformer: Option<Box<dyn PathTransformer>>,
        opt_convention: Option<Box<dyn EventConvention>>,
    ) -> Self {
        let transformer =
            opt_transformer.unwrap_or_else(|| Box::new(NativeEventTransformer::new()));
        let convention = opt_convention
            .unwrap_or_else(|| Box::new(NativeEventConvention::new(Some(transformer.clone_box()))));

        Self {
            transformer,
            convention,
        }
    }

    /// Convenience: process a collection of files into events.
    pub fn process(&self, files: &Vec<FileInfo>) -> Vec<Event> {
        files.iter().map(|f| self.process_event_file(f)).collect()
    }
}

impl EventProcessor for NativeEventProcessor {
    fn process_event_file(&self, file: &FileInfo) -> Event {
        // Convert the scanned file path into a normalized event path using
        // the convention and then apply the PathTransformer normalization
        // (mirrors the route processor pipeline).
        let intermediate = self.convention.transform_path(&file.path);
        let normalized = self.transformer.normalize_path(&intermediate, "");

        // Build event name: `a/b/c` -> `a:b:c` except for standalone names
        let parts: Vec<&str> = normalized
            .trim_start_matches('/')
            .split('/')
            .filter(|s| !s.is_empty())
            .collect();
        let event_name = if parts.is_empty() {
            "".to_string()
        } else if parts.len() == 1 {
            parts[0].to_string()
        } else {
            let last = parts.last().unwrap();
            if *last == "connection" || *last == "disconnect" {
                last.to_string()
            } else {
                format!("{}:{}", parts[..parts.len() - 1].join(":"), last)
            }
        };

        let namespace = if event_name.contains(":") {
            Some(event_name.split(':').next().unwrap().to_string())
        } else {
            None
        };

        Event {
            name: event_name,
            file_path: file.full_path.clone(),
            namespace,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::scanner::FileInfo;

    fn file_info(path: &str, full: &str) -> FileInfo {
        FileInfo {
            path: path.to_string(),
            full_path: full.to_string(),
        }
    }

    #[test]
    fn processor_creates_event() {
        let p = NativeEventProcessor::new(None, None);
        let f = file_info(
            "app/events/chat/message.js",
            "/out/app/events/chat/message.js",
        );
        let e = p.process_event_file(&f);
        assert_eq!(e.name, "chat:message");
        assert_eq!(e.namespace.unwrap(), "chat");
    }
}
