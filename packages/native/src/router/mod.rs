//! Router core types and interop structures.
//!
//! This module defines the small set of types used by the router and the
//! native build pipeline to represent discovered routes and the manifest
//! exported to the host environment (Node). It exposes:
//! - `Route`: serializable representation exposed to JavaScript via N-API.
//! - `RoutesManifest`: top-level manifest object sent to the host.
//! - `RouteCore`: internal representation used inside the Rust codebase.

use napi_derive::napi;
use serde::Serialize;

use crate::router::convention::MatchedMethodSuffix;

pub mod convention;
pub mod processor;
pub mod transformer;

/// Serializable route representation sent to the host (N-API).
/// Fields are camel-cased to be idiomatic on the JavaScript side.
#[napi(object)]
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Route {
    /// Uppercase HTTP method name, e.g. `GET` or `POST`, when present.
    pub method: Option<String>,

    /// Normalized route path (always starting with `/`).
    pub path: String,

    /// True when the route contains dynamic segments.
    pub dynamic: bool,

    /// Absolute filesystem path to the source file backing the route.
    pub file_path: String,

    /// Generated route matching regex as a string.
    pub regex: String,
}

/// Manifest containing all discovered routes, serializable to the host.
#[napi(object)]
#[derive(Serialize)]
pub struct RoutesManifest {
    /// Manifest version string.
    pub version: String,

    /// List of routes.
    pub routes: Vec<Route>,
}

/// Internal representation of a route used within Rust code.
/// `RouteCore` contains a typed `MatchedMethodSuffix` for internal routing
/// logic; it is converted to the exported `Route` when communicating with the
/// host.
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
