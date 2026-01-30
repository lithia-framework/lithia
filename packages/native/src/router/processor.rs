//!
//! @fileoverview Route Processor (Native).
//! Coordinates the transformation of file system paths into internal
//! RouteCore objects, including RegEx generation and dynamic segment detection.
//!

use crate::router::{
    convention::{NativeRouteConvention, RouteConvention},
    transformer::{NativePathTransformer, PathTransformer},
    RouteCore,
};
use crate::scanner::FileInfo;

pub trait RouteProcessor {
    fn process_route_file(&self, file: &FileInfo) -> RouteCore;
}

pub struct NativeRouteProcessor {
    transformer: Box<dyn PathTransformer>,
    convention: Box<dyn RouteConvention>,
}

impl NativeRouteProcessor {
    /// Initializes a processor with default Lithia transformers and conventions.
    pub fn new(
        opt_transformer: Option<Box<dyn PathTransformer>>,
        opt_convention: Option<Box<dyn RouteConvention>>,
    ) -> Self {
        let transformer = opt_transformer.unwrap_or_else(|| Box::new(NativePathTransformer::new()));

        // We ensure the convention uses a cloned box of the transformer to keep logic in sync
        let convention = opt_convention
            .unwrap_or_else(|| Box::new(NativeRouteConvention::new(Some(transformer.clone_box()))));

        Self {
            transformer,
            convention,
        }
    }
}

impl RouteProcessor for NativeRouteProcessor {
    /**
     * Orchestrates the full transformation pipeline for a single file.
     * 1. Extract Method (route.post.mts -> POST)
     * 2. Transform Path (app/routes/users/[id] -> /users/:id)
     * 3. Detect Dynamics & Generate RegEx
     */
    fn process_route_file(&self, file: &FileInfo) -> RouteCore {
        // Step 1: Handle method extraction (GET, POST, etc)
        let extracted = self.convention.extract_method(&file.path);

        // Step 2: Clean up the path (remove route.ts, handle groups like (auth))
        let mut path = self.convention.transform_path(&extracted.updated_path);

        // Step 3: Normalize leading/trailing slashes
        path = self.transformer.normalize_path(&path, "");

        // Step 4: Analyze for dynamic segments ([id] -> :id)
        let dynamic = self.transformer.is_dynamic_route(&path);

        // Step 5: Generate the actual matching regex for the runtime
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
