use crate::scanner::FileInfo;

use crate::events::convention::{EventConvention, NativeEventConvention};
use crate::events::transformer::{NativeEventTransformer, PathTransformer};
use crate::events::Event;

pub trait EventProcessor {
    fn process_event_file(&self, file: &FileInfo) -> Event;
}

pub struct NativeEventProcessor {
    transformer: Box<dyn PathTransformer>,
    convention: Box<dyn EventConvention>,
}

impl NativeEventProcessor {
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

    pub fn process(&self, files: &[FileInfo]) -> Vec<Event> {
        files.iter().map(|f| self.process_event_file(f)).collect()
    }
}

impl EventProcessor for NativeEventProcessor {
    fn process_event_file(&self, file: &FileInfo) -> Event {
        let intermediate = self.convention.transform_path(&file.path);
        let normalized = self.transformer.normalize_path(&intermediate, "");

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
            "app/events/chat/message.mjs",
            "/out/app/events/chat/message.mjs",
        );
        let e = p.process_event_file(&f);
        assert_eq!(e.name, "chat:message");
        assert_eq!(e.namespace.unwrap(), "chat");
    }
}
