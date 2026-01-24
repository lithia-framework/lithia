use lithia_native_router::scan_and_process_routes;
use regex::Regex;
use std::{fs, env};
use std::io::Write;
use tempfile::TempDir;

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
    let (temp_dir, root) = setup_routes_dir()?;
    let temp_name = get_temp_name(&temp_dir);
    let output_file = root.join("test-manifest.json");

    let routes_dir = format!("{}/routes", temp_name);
    let result = scan_and_process_routes(routes_dir, Some(output_file.to_string_lossy().to_string()), None, None);

    assert!(result.is_ok());
    assert!(output_file.exists());

    let content = fs::read_to_string(&output_file)?;
    let parsed: Vec<serde_json::Value> = serde_json::from_str(&content)?;

    assert!(!parsed.is_empty());

    Ok(())
}

#[test]
fn processes_all_route_types() -> std::io::Result<()> {
    let (temp_dir, root) = setup_routes_dir()?;
    let temp_name = get_temp_name(&temp_dir);
    let output_file = root.join("routes-manifest.json");

    let routes_dir = format!("{}/routes", temp_name);
    let result = scan_and_process_routes(routes_dir, Some(output_file.to_string_lossy().to_string()), None, None);

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
    let users_get = routes.iter().find(|r| r.path == "/users" && r.method == Some("GET".to_string()));
    assert!(users_get.is_some());

    // Check POST /users
    let users_post = routes.iter().find(|r| r.path == "/users" && r.method == Some("POST".to_string()));
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
    let (temp_dir, root) = setup_routes_dir()?;
    let temp_name = get_temp_name(&temp_dir);
    let output_file = root.join("regex-test.json");

    let routes_dir = format!("{}/routes", temp_name);
    let result = scan_and_process_routes(routes_dir, Some(output_file.to_string_lossy().to_string()), None, None);

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
fn uses_default_output_filename() -> std::io::Result<()> {
    let (temp_dir, _root) = setup_routes_dir()?;
    let temp_name = get_temp_name(&temp_dir);

    let routes_dir = format!("{}/routes", temp_name);
    let result = scan_and_process_routes(routes_dir, None, None, None);

    assert!(result.is_ok());

    // Check default file was created
    let default_path = std::path::Path::new("routes.json");
    assert!(default_path.exists());

    // Cleanup
    fs::remove_file(default_path)?;

    Ok(())
}

#[test]
fn returns_error_for_nonexistent_directory() {
    let result = scan_and_process_routes("nonexistent_dir".to_string(), None, None, None);
    assert!(result.is_err());
}

#[test]
fn json_output_matches_expected_format() -> std::io::Result<()> {
    let (temp_dir, root) = setup_routes_dir()?;
    let temp_name = get_temp_name(&temp_dir);
    let output_file = root.join("format-test.json");

    let routes_dir = format!("{}/routes", temp_name);
    let result = scan_and_process_routes(routes_dir, Some(output_file.to_string_lossy().to_string()), None, None);

    assert!(result.is_ok());

    let content = fs::read_to_string(&output_file)?;
    let json: serde_json::Value = serde_json::from_str(&content)?;
    let array = json.as_array().expect("JSON should be an array");

    assert!(!array.is_empty());

    // Validate first route structure
    let first_route = &array[0];
    
    // Check all required fields exist with correct casing
    assert!(first_route.get("path").is_some(), "Missing 'path' field");
    assert!(first_route.get("dynamic").is_some(), "Missing 'dynamic' field");
    assert!(first_route.get("filePath").is_some(), "Missing 'filePath' field (should be camelCase)");
    assert!(first_route.get("sourceFilePath").is_some(), "Missing 'sourceFilePath' field (should be camelCase)");
    assert!(first_route.get("regex").is_some(), "Missing 'regex' field");

    // Validate snake_case fields don't exist
    assert!(first_route.get("file_path").is_none(), "Should use 'filePath', not 'file_path'");
    assert!(first_route.get("source_file_path").is_none(), "Should use 'sourceFilePath', not 'source_file_path'");

    // Validate types
    assert!(first_route["path"].is_string());
    assert!(first_route["dynamic"].is_boolean());
    assert!(first_route["filePath"].is_string());
    assert!(first_route["sourceFilePath"].is_string());
    assert!(first_route["regex"].is_string());

    // Method can be null or string
    if let Some(method) = first_route.get("method") {
        assert!(method.is_null() || method.is_string());
    }

    // Find a route with method to validate format
    let route_with_method = array.iter().find(|r| r.get("method").and_then(|m| m.as_str()).is_some());
    if let Some(route) = route_with_method {
        let method = route["method"].as_str().unwrap();
        // Method should be uppercase
        assert!(method == method.to_uppercase());
    }

    Ok(())
}

// regex validation tests
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
    let (temp_dir, root) = setup_specific_routes()?;
    let temp_name = get_temp_name(&temp_dir);
    let output_file = root.join("validation-test.json");

    let routes_dir = format!("{}/routes", temp_name);
    let result = scan_and_process_routes(routes_dir, Some(output_file.to_string_lossy().to_string()), None, None);

    assert!(result.is_ok());
    let routes = result.unwrap();

    // Find each route and validate regex
    let health_route = routes.iter().find(|r| r.path == "/health").expect("Missing /health route");
    assert_eq!(health_route.method, Some("GET".to_string()));
    assert!(!health_route.dynamic);
    assert_eq!(health_route.regex, "^\\/health$");

    let hello_route = routes.iter().find(|r| r.path == "/hello").expect("Missing /hello route");
    assert_eq!(hello_route.method, Some("GET".to_string()));
    assert!(!hello_route.dynamic);
    assert_eq!(hello_route.regex, "^\\/hello$");

    let users_id_route = routes.iter().find(|r| r.path == "/users/:id").expect("Missing /users/:id route");
    assert_eq!(users_id_route.method, Some("GET".to_string()));
    assert!(users_id_route.dynamic);
    assert_eq!(users_id_route.regex, "^\\/users\\/([^\\/]+)$");

    Ok(())
}

#[test]
fn regex_patterns_actually_match_correct_urls() -> std::io::Result<()> {
    let (temp_dir, root) = setup_specific_routes()?;
    let temp_name = get_temp_name(&temp_dir);
    let output_file = root.join("regex-match-test.json");

    let routes_dir = format!("{}/routes", temp_name);
    let result = scan_and_process_routes(routes_dir, Some(output_file.to_string_lossy().to_string()), None, None);

    assert!(result.is_ok());
    let routes = result.unwrap();

    // Test /health regex
    let health_route = routes.iter().find(|r| r.path == "/health").unwrap();
    let health_regex = Regex::new(&health_route.regex).expect("Invalid regex for /health");
    
    assert!(health_regex.is_match("/health"), "/health should match");
    assert!(!health_regex.is_match("/health/extra"), "/health/extra should NOT match");
    assert!(!health_regex.is_match("/healthz"), "/healthz should NOT match");
    assert!(!health_regex.is_match("health"), "health (without /) should NOT match");

    // Test /hello regex
    let hello_route = routes.iter().find(|r| r.path == "/hello").unwrap();
    let hello_regex = Regex::new(&hello_route.regex).expect("Invalid regex for /hello");
    
    assert!(hello_regex.is_match("/hello"), "/hello should match");
    assert!(!hello_regex.is_match("/hello/world"), "/hello/world should NOT match");

    // Test /users/:id regex
    let users_id_route = routes.iter().find(|r| r.path == "/users/:id").unwrap();
    let users_id_regex = Regex::new(&users_id_route.regex).expect("Invalid regex for /users/:id");
    
    assert!(users_id_regex.is_match("/users/123"), "/users/123 should match");
    assert!(users_id_regex.is_match("/users/abc"), "/users/abc should match");
    assert!(users_id_regex.is_match("/users/user-123"), "/users/user-123 should match");
    
    assert!(!users_id_regex.is_match("/users"), "/users (no id) should NOT match");
    assert!(!users_id_regex.is_match("/users/"), "/users/ (empty id) should NOT match");
    assert!(!users_id_regex.is_match("/users/123/extra"), "/users/123/extra should NOT match");
    
    // Test capturing group
    if let Some(captures) = users_id_regex.captures("/users/my-user-123") {
        assert_eq!(captures.get(1).unwrap().as_str(), "my-user-123", "Should capture the ID parameter");
    } else {
        panic!("Regex should capture the ID parameter");
    }

    Ok(())
}
