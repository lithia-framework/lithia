use super::compiler::TypeScriptCompiler;
use super::tsconfig::TsConfigOptions;
use std::fs;
use swc_ecma_ast::EsVersion;
use tempfile::TempDir;

#[test]
fn test_compile_with_paths() {
    let dir = TempDir::new().unwrap();
    let root = dir.path();
    
    let src = root.join("src");
    fs::create_dir(&src).unwrap();
    
    let services = src.join("services");
    fs::create_dir(&services).unwrap();
    
    // Define target file that the alias points to
    fs::write(services.join("user-service.ts"), "export class UserService {}").unwrap();
    
    // Define source file interacting with alias
    let input_path = src.join("main.ts");
    fs::write(&input_path, "import { UserService } from '@/services/user-service'; console.log(UserService);").unwrap();
    
    let dist = root.join("dist");
    fs::create_dir(&dist).unwrap();
    let output_path = dist.join("main.js");

    // Setup compiler with path mapping
    // Mapping: "@/*" -> ["./src/*"]
    // BaseUrl: root
    let ts_config = TsConfigOptions {
        emit_sourcemap: false,
        target: EsVersion::Es2020,
        base_url: Some(root.to_path_buf()),
        paths: vec![("@/*".to_string(), vec!["./src/*".to_string()])],
    };

    let compiler = TypeScriptCompiler::new(ts_config);
    
    // Compile
    compiler.compile_file(&input_path, &output_path).expect("compile failed");
    
    // Check output based on behavior
    let js = fs::read_to_string(&output_path).unwrap();
    
    assert!(js.contains(r#"require("./services/user-service")"#), "Output JS did not contain expected relative require. Got:\n{}", js);
}

#[test]
fn test_compile_no_paths() {
     let dir = TempDir::new().unwrap();
     let root = dir.path();
     let src = root.join("src");
     fs::create_dir(&src).unwrap();
     
     let input_path = src.join("index.ts");
     // Normal relative import shouldn't change
     fs::write(&input_path, "import { x } from './utils'; console.log(x);").unwrap();
     fs::write(src.join("utils.ts"), "export const x = 1;").unwrap();
     
     let dist = root.join("dist");
     fs::create_dir(&dist).unwrap();
     let output_path = dist.join("index.js");

     let ts_config = TsConfigOptions {
         emit_sourcemap: false,
         target: EsVersion::Es2020,
         base_url: None,
         paths: vec![],
     };

     let compiler = TypeScriptCompiler::new(ts_config);
     compiler.compile_file(&input_path, &output_path).expect("compile failed");
     
     let js = fs::read_to_string(&output_path).unwrap();
     assert!(js.contains(r#"require("./utils")"#));
}
