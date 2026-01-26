use crate::events::transformer::{NativeEventTransformer, PathTransformer};

/// Trait that defines how filesystem event filenames are converted into a
/// normalized event identifier used by the runtime.
pub trait EventConvention {
    /// Transform a filesystem path (relative, may include `app/events/...`)
    /// into a normalized event path (no extension, forward slashes).
    fn transform_path(&self, path: &str) -> String;
}

/// Native event convention implementation that reuses the router's
/// `PathTransformer` for common filesystem transformations and then
/// returns a normalized path used to derive the event name.
pub struct NativeEventConvention {
    transformer: Box<dyn PathTransformer>,
}

impl NativeEventConvention {
    pub fn new(transformer: Option<Box<dyn PathTransformer>>) -> Self {
        let transformer = transformer.unwrap_or_else(|| Box::new(NativeEventTransformer::new()));
        Self { transformer }
    }
}

impl EventConvention for NativeEventConvention {
    fn transform_path(&self, path: &str) -> String {
        // Remove leading prefix if present
        let mut p = path.trim_start_matches("app/events/").to_string();

        // Delegate file -> normalized path transformations to the event transformer
        p = self.transformer.normalize(&p);

        // Ensure forward slashes
        p.replace('\\', "/")
    }
}
