#[cfg(test)]
mod tests {
    use super::super::processor::NativeEventProcessor;
    use crate::{events::processor::EventProcessor, scanner::FileInfo};
    use std::fs;
    use tempfile::TempDir;

    #[test]
    fn processor_generates_event_manifest_items() {
        let temp = TempDir::new().unwrap();
        let src_root = temp.path().join("src");
        let out_root = temp.path().join("out");
        fs::create_dir_all(&src_root).unwrap();
        fs::create_dir_all(&out_root).unwrap();

        // create a dummy tsconfig so BuildConfig::new can parse
        fs::write(temp.path().join("tsconfig.json"), "{}").unwrap();

        // Create a sample event file path entry
        // Use compiled JS path as the processor expects files from the output
        let relative = "app/events/chat/message.js".to_string();
        let full = out_root.join(&relative).to_string_lossy().to_string();

        // touch the compiled file on disk
        fs::create_dir_all(std::path::Path::new(&full).parent().unwrap()).unwrap();
        fs::write(&full, "module.exports = {};").unwrap();

        let file_info = FileInfo {
            path: relative.clone(),
            full_path: full.clone(),
        };

        let processor = NativeEventProcessor::new(None, None);
        let e = processor.process_event_file(&file_info);

        assert_eq!(e.name, "chat:message");
        assert_eq!(e.namespace.as_ref().unwrap(), "chat");
        assert!(e.file_path.ends_with("message.js"));
        assert_eq!(e.file_path, full);
    }
}
