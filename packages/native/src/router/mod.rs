use napi_derive::napi;
use serde::Serialize;

use crate::router::convention::MatchedMethodSuffix;

pub mod convention;
pub mod processor;
pub mod transformer;

#[napi(object)]
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Route {
    pub method: Option<String>,
    pub path: String,
    pub dynamic: bool,
    pub file_path: String,
    pub regex: String,
}

#[napi(object)]
#[derive(Serialize)]
pub struct RoutesManifest {
    pub version: String,
    pub routes: Vec<Route>,
}

pub struct RouteCore {
    pub method: Option<MatchedMethodSuffix>,
    pub path: String,
    pub dynamic: bool,
    pub file_path: String,
    pub regex: String,
}

impl From<RouteCore> for Route {
    fn from(core: RouteCore) -> Self {
        Self {
            method: core.method.map(|m| m.as_str().to_string()),
            path: core.path,
            dynamic: core.dynamic,
            file_path: core.file_path,
            regex: core.regex,
        }
    }
}
