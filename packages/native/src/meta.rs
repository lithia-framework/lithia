use napi_derive::napi;


#[napi]
pub fn schema_version() -> &'static str {
  env!("CARGO_PKG_VERSION")
}