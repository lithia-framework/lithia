use lithia_native_router::processor::{NativeRouteProcessor, RouteProcessor};
use lithia_native_router::Route;
use lithia_native_scanner::{scan_files_with_globs, ScanOptions};
use regex::Regex;
use std::io::Write;
use std::{env, fs};
use tempfile::TempDir;

fn scan_and_process_routes(path_components: Vec<String>) -> Result<Vec<Route>, String> {
    // Se path_components tem apenas um elemento e não é um caminho absoluto,
    // assume que é relativo ao cwd
    let components = if path_components.len() == 1 && !path_components[0].starts_with('/') {
        // Converte "temp_dir/routes" em ["temp_dir", "routes"]
        path_components[0]
            .split('/')
            .map(|s| s.to_string())
            .collect()
    } else {
        path_components
    };

    let files = scan_files_with_globs(
        components,
        Some(ScanOptions {
            include: Some(vec!["**/*.ts".to_string()]),
            ignore: None,
        }),
    )
    .map_err(|e| e.to_string())?;

    let processor = NativeRouteProcessor::new(None, None);
    let routes: Vec<Route> = files
        .iter()
        .map(|file| processor.process_route_file(file))
        .map(Route::from)
        .collect();

    Ok(routes)
}

fn setup_routes_dir() -> std::io::Result<(TempDir, std::path::PathBuf)> {
    let cwd = env::current_dir()?;
    let temp_dir = TempDir::new_in(&cwd)?;
    let root = temp_dir.path().to_path_buf();

    let routes = root.join("routes");
    fs::create_dir(&routes)?;

    // Static route
    std::fs::File::create(routes.join("route.ts"))?.write_all(b"export default {}")?;

    // Users routes
    let users = routes.join("users");
    fs::create_dir(&users)?;
    std::fs::File::create(users.join("route.get.ts"))?.write_all(b"export default {}")?;
    std::fs::File::create(users.join("route.post.ts"))?.write_all(b"export default {}")?;

    // Dynamic route
    let user_id = users.join("[id]");
    fs::create_dir(&user_id)?;
    std::fs::File::create(user_id.join("route.get.ts"))?.write_all(b"export default {}")?;
    std::fs::File::create(user_id.join("route.delete.ts"))?.write_all(b"export default {}")?;

    // Route with groups
    let api = routes.join("(api)");
    fs::create_dir(&api)?;
    let health = api.join("health");
    fs::create_dir(&health)?;
    std::fs::File::create(health.join("route.ts"))?.write_all(b"export default {}")?;

    Ok((temp_dir, root))
}

fn get_temp_name(temp_dir: &TempDir) -> String {
    temp_dir
        .path()
        .file_name()
        .unwrap()
        .to_string_lossy()
        .to_string()
}

#[test]
fn scan_and_process_creates_routes_manifest() -> std::io::Result<()> {
    let (temp_dir, _root) = setup_routes_dir()?;
    let temp_name = get_temp_name(&temp_dir);

    let routes_dir = format!("{}/routes", temp_name);
    let result = scan_and_process_routes(vec![routes_dir]);

    if let Err(e) = &result {
        eprintln!("Error: {:?}", e);
    }
    assert!(result.is_ok());

    let routes = result.unwrap();
    assert!(!routes.is_empty());

    Ok(())
}

#[test]
fn processes_all_route_types() -> std::io::Result<()> {
    let (temp_dir, _) = setup_routes_dir()?;
    let temp_name = get_temp_name(&temp_dir);

    let routes_dir = format!("{}/routes", temp_name);
    let result = scan_and_process_routes(vec![routes_dir]);

    assert!(result.is_ok());
    let routes = result.unwrap();

    // Should have: /, /users (GET), /users (POST), /users/:id (GET), /users/:id (DELETE), /health
    assert_eq!(routes.len(), 6);

    // Check root route
    let root_route = routes.iter().find(|r| r.path == "/");
    assert!(root_route.is_some());
    assert_eq!(root_route.unwrap().method, None);
    assert!(!root_route.unwrap().dynamic);

    // Check GET /users
    let users_get = routes
        .iter()
        .find(|r| r.path == "/users" && r.method == Some("GET".to_string()));
    assert!(users_get.is_some());

    // Check POST /users
    let users_post = routes
        .iter()
        .find(|r| r.path == "/users" && r.method == Some("POST".to_string()));
    assert!(users_post.is_some());

    // Check dynamic route
    let user_by_id = routes.iter().find(|r| r.path == "/users/:id");
    assert!(user_by_id.is_some());
    assert!(user_by_id.unwrap().dynamic);

    // Check route groups removed
    let health_route = routes.iter().find(|r| r.path == "/health");
    assert!(health_route.is_some());
    assert_eq!(health_route.unwrap().file_path, "(api)/health/route.ts");

    Ok(())
}

#[test]
fn generates_correct_regex_patterns() -> std::io::Result<()> {
    let (temp_dir, _) = setup_routes_dir()?;
    let temp_name = get_temp_name(&temp_dir);

    let routes_dir = format!("{}/routes", temp_name);
    let result = scan_and_process_routes(vec![routes_dir]);

    assert!(result.is_ok());
    let routes = result.unwrap();

    // Static route regex
    let root_route = routes.iter().find(|r| r.path == "/").unwrap();
    assert_eq!(root_route.regex, r"^\/$");

    // Dynamic route regex
    let dynamic_route = routes.iter().find(|r| r.path == "/users/:id").unwrap();
    assert_eq!(dynamic_route.regex, r"^\/users\/([^\/]+)$");

    Ok(())
}

#[test]
fn returns_routes_array() -> std::io::Result<()> {
    let (temp_dir, _root) = setup_routes_dir()?;
    let temp_name = get_temp_name(&temp_dir);

    let routes_dir = format!("{}/routes", temp_name);
    let result = scan_and_process_routes(vec![routes_dir]);

    assert!(result.is_ok());
    let routes = result.unwrap();

    // Should return array of routes
    assert!(!routes.is_empty());
    assert_eq!(routes.len(), 6);

    Ok(())
}

#[test]
fn returns_error_for_nonexistent_directory() {
    let result = scan_and_process_routes(vec!["nonexistent_dir".to_string()]);
    assert!(result.is_err());
}

fn setup_specific_routes() -> std::io::Result<(TempDir, std::path::PathBuf)> {
    let cwd = env::current_dir()?;
    let temp_dir = TempDir::new_in(&cwd)?;
    let root = temp_dir.path().to_path_buf();

    let routes = root.join("routes");
    fs::create_dir(&routes)?;

    // /health route
    let health = routes.join("health");
    fs::create_dir(&health)?;
    std::fs::File::create(health.join("route.get.ts"))?.write_all(b"export default {}")?;

    // /hello route
    let hello = routes.join("hello");
    fs::create_dir(&hello)?;
    std::fs::File::create(hello.join("route.get.ts"))?.write_all(b"export default {}")?;

    // /users/:id route
    let users = routes.join("users");
    fs::create_dir(&users)?;
    let user_id = users.join("[id]");
    fs::create_dir(&user_id)?;
    std::fs::File::create(user_id.join("route.get.ts"))?.write_all(b"export default {}")?;

    Ok((temp_dir, root))
}

#[test]
fn validates_regex_patterns_match_expected_format() -> std::io::Result<()> {
    let (temp_dir, _) = setup_specific_routes()?;
    let temp_name = get_temp_name(&temp_dir);

    let routes_dir = format!("{}/routes", temp_name);
    let result = scan_and_process_routes(vec![routes_dir]);

    assert!(result.is_ok());
    let routes = result.unwrap();

    // Find each route and validate regex
    let health_route = routes
        .iter()
        .find(|r| r.path == "/health")
        .expect("Missing /health route");
    assert_eq!(health_route.method, Some("GET".to_string()));
    assert!(!health_route.dynamic);
    assert_eq!(health_route.regex, "^\\/health$");

    let hello_route = routes
        .iter()
        .find(|r| r.path == "/hello")
        .expect("Missing /hello route");
    assert_eq!(hello_route.method, Some("GET".to_string()));
    assert!(!hello_route.dynamic);
    assert_eq!(hello_route.regex, "^\\/hello$");

    let users_id_route = routes
        .iter()
        .find(|r| r.path == "/users/:id")
        .expect("Missing /users/:id route");
    assert_eq!(users_id_route.method, Some("GET".to_string()));
    assert!(users_id_route.dynamic);
    assert_eq!(users_id_route.regex, "^\\/users\\/([^\\/]+)$");

    Ok(())
}

#[test]
fn regex_patterns_actually_match_correct_urls() -> std::io::Result<()> {
    let (temp_dir, _) = setup_specific_routes()?;
    let temp_name = get_temp_name(&temp_dir);

    let routes_dir = format!("{}/routes", temp_name);
    let result = scan_and_process_routes(vec![routes_dir]);

    assert!(result.is_ok());
    let routes = result.unwrap();

    // Test /health regex
    let health_route = routes.iter().find(|r| r.path == "/health").unwrap();
    let health_regex = Regex::new(&health_route.regex).expect("Invalid regex for /health");

    assert!(health_regex.is_match("/health"), "/health should match");
    assert!(
        !health_regex.is_match("/health/extra"),
        "/health/extra should NOT match"
    );
    assert!(
        !health_regex.is_match("/healthz"),
        "/healthz should NOT match"
    );
    assert!(
        !health_regex.is_match("health"),
        "health (without /) should NOT match"
    );

    // Test /hello regex
    let hello_route = routes.iter().find(|r| r.path == "/hello").unwrap();
    let hello_regex = Regex::new(&hello_route.regex).expect("Invalid regex for /hello");

    assert!(hello_regex.is_match("/hello"), "/hello should match");
    assert!(
        !hello_regex.is_match("/hello/world"),
        "/hello/world should NOT match"
    );

    // Test /users/:id regex
    let users_id_route = routes.iter().find(|r| r.path == "/users/:id").unwrap();
    let users_id_regex = Regex::new(&users_id_route.regex).expect("Invalid regex for /users/:id");

    assert!(
        users_id_regex.is_match("/users/123"),
        "/users/123 should match"
    );
    assert!(
        users_id_regex.is_match("/users/abc"),
        "/users/abc should match"
    );
    assert!(
        users_id_regex.is_match("/users/user-123"),
        "/users/user-123 should match"
    );

    assert!(
        !users_id_regex.is_match("/users"),
        "/users (no id) should NOT match"
    );
    assert!(
        !users_id_regex.is_match("/users/"),
        "/users/ (empty id) should NOT match"
    );
    assert!(
        !users_id_regex.is_match("/users/123/extra"),
        "/users/123/extra should NOT match"
    );

    // Test capturing group
    if let Some(captures) = users_id_regex.captures("/users/my-user-123") {
        assert_eq!(
            captures.get(1).unwrap().as_str(),
            "my-user-123",
            "Should capture the ID parameter"
        );
    } else {
        panic!("Regex should capture the ID parameter");
    }

    Ok(())
}
