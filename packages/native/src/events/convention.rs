//!
//! @fileoverview Event Convention Logic (Native).
//! Defines how file system paths are mapped to internal event identifiers.
//!

use crate::events::transformer::{NativeEventTransformer, PathTransformer};

/// Trait defining the contract for event path transformations.
pub trait EventConvention {
    fn transform_path(&self, path: &str) -> String;
}

/// The default Lithia implementation for event naming conventions.
pub struct NativeEventConvention {
    /// Pluggable transformer to handle path normalization logic.
    transformer: Box<dyn PathTransformer>,
}

impl NativeEventConvention {
    /**
     * Creates a new convention instance.
     * @param transformer Optional custom transformer; defaults to NativeEventTransformer.
     */
    pub fn new(transformer: Option<Box<dyn PathTransformer>>) -> Self {
        let transformer = transformer.unwrap_or_else(|| Box::new(NativeEventTransformer::new()));
        Self { transformer }
    }
}

impl EventConvention for NativeEventConvention {
    /**
     * Transforms a source file path into a clean event identifier.
     * 1. Strips the framework's event root prefix.
     * 2. Normalizes naming (case, extensions).
     * 3. Ensures cross-platform forward-slash separators.
     */
    fn transform_path(&self, path: &str) -> String {
        // Strip the standard directory prefix
        let mut p = path.trim_start_matches("app/events/").to_string();

        // Apply the normalization logic (e.g., removing .mts extensions)
        p = self.transformer.normalize(&p);

        // Ensure standard URL/identifier format
        p.replace('\\', "/")
    }
}
