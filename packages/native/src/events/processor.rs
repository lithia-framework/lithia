//!
//! @fileoverview Event Processor (Native).
//! Analyzes file paths to determine event naming, namespaces, and special types.
//! Converts physical FileInfo into logical Event metadata.
//!

use crate::events::convention::{EventConvention, NativeEventConvention};
use crate::events::transformer::{NativeEventTransformer, PathTransformer};
use crate::events::Event;
use crate::scanner::FileInfo;

/// Contract for processing scanned files into the Event domain model.
pub trait EventProcessor {
    fn process_event_file(&self, file: &FileInfo) -> Event;
}

pub struct NativeEventProcessor {
    transformer: Box<dyn PathTransformer>,
    convention: Box<dyn EventConvention>,
}

impl NativeEventProcessor {
    /**
     * Creates a new processor with optional overrides for path logic.
     */
    pub fn new(
        opt_transformer: Option<Box<dyn PathTransformer>>,
        opt_convention: Option<Box<dyn EventConvention>>,
    ) -> Self {
        let transformer =
            opt_transformer.unwrap_or_else(|| Box::new(NativeEventTransformer::new()));

        // Ensure the convention uses a clone of the same transformer for consistency
        let convention = opt_convention
            .unwrap_or_else(|| Box::new(NativeEventConvention::new(Some(transformer.clone_box()))));

        Self {
            transformer,
            convention,
        }
    }

    /// Batch processes a slice of files into a vector of Events.
    pub fn process(&self, files: &[FileInfo]) -> Vec<Event> {
        files.iter().map(|f| self.process_event_file(f)).collect()
    }
}

impl EventProcessor for NativeEventProcessor {
    /**
     * The core logic for path-to-event mapping.
     * Example: "app/events/billing/webhook.mjs" -> name: "billing:webhook", namespace: "billing"
     */
    fn process_event_file(&self, file: &FileInfo) -> Event {
        // 1. Convention stripping (removes "app/events/")
        let intermediate = self.convention.transform_path(&file.path);

        // 2. Transformer normalization (removes extensions, handles casing)
        let normalized = self.transformer.normalize_path(&intermediate, "");

        // 3. Split path into parts to build the hierarchy
        let parts: Vec<&str> = normalized
            .trim_start_matches('/')
            .split('/')
            .filter(|s| !s.is_empty())
            .collect();

        // 4. Generate the logical event name
        let event_name = if parts.is_empty() {
            "".to_string()
        } else if parts.len() == 1 {
            parts[0].to_string()
        } else {
            let last = parts.last().unwrap();

            // Special cases: connection/disconnect usually don't want a prefix in many socket patterns
            if *last == "connection" || *last == "disconnect" {
                last.to_string()
            } else {
                // Join directories with colons for the event name
                format!("{}:{}", parts[..parts.len() - 1].join(":"), last)
            }
        };

        // 5. Extract the namespace (the first part of the colon-separated name)
        let namespace = if event_name.contains(':') {
            event_name.split(':').next().map(|s| s.to_string())
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
            "app/events/chat/message.mjs",
            "/out/app/events/chat/message.mjs",
        );
        let e = p.process_event_file(&f);

        // Verifies the "dir/file" -> "dir:file" transformation
        assert_eq!(e.name, "chat:message");
        assert_eq!(e.namespace.unwrap(), "chat");
    }
}
