mod builder;
mod router;
mod scanner;

// Re-export builder function
pub use builder::build_project;

// Re-export router types (Route is already marked with #[napi(object)])
pub use router::Route;
