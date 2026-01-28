use crate::events::transformer::{NativeEventTransformer, PathTransformer};

pub trait EventConvention {
    fn transform_path(&self, path: &str) -> String;
}

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
        let mut p = path.trim_start_matches("app/events/").to_string();
        p = self.transformer.normalize(&p);
        p.replace('\\', "/")
    }
}
