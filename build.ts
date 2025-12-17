import { spawn } from 'node:child_process';
import { access, cp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { build } from 'tsup';

/**
 * Build pipeline steps for better organization and logging.
 */
enum BuildStep {
  BUILD_LITHIA_CORE = 'Build Lithia Core',
  PROCESS_DIST_FILES = 'Process Distribution Files',
  INSTALL_STUDIO_DEPS = 'Install Studio Dependencies',
  BUILD_STUDIO_UI = 'Build Studio UI',
  COPY_STUDIO_DIST = 'Copy Studio Dist Files',
  FINALIZE = 'Finalize Build',
}

const subpaths = ['cli', 'config', 'core', 'meta', 'studio', 'types'];

/**
 * Logs a build step start.
 */
function logStepStart(step: BuildStep): void {
  console.log(`${step}...`);
}

/**
 * Logs a build step completion.
 */
function logStepComplete(step: BuildStep): void {
  console.log(`${step} completed`);
}

/**
 * Logs a build step error.
 */
function logStepError(step: BuildStep, error: string): void {
  console.error(`${step} failed: ${error}`);
}

/**
 * Executes a build step with proper logging and error handling.
 */
async function executeStep<T>(
  step: BuildStep,
  stepFunction: () => Promise<T>,
): Promise<T> {
  logStepStart(step);
  try {
    const result = await stepFunction();
    logStepComplete(step);
    return result;
  } catch (error) {
    logStepError(step, error instanceof Error ? error.message : String(error));
    throw error;
  }
}

/**
 * Checks if the Studio directory exists and has a package.json.
 */
async function studioExists(): Promise<boolean> {
  try {
    const studioDir = join(process.cwd(), 'studio');
    const packageJsonPath = join(studioDir, 'package.json');
    await access(packageJsonPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Executes a command in a child process with proper error handling.
 * Uses shell: true with command as string to avoid security warnings on Windows.
 * On Unix-like systems, uses spawn without shell for better security.
 */
function execCommand(
  command: string,
  args: string[],
  cwd: string,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const isWindows = process.platform === 'win32';

    if (isWindows) {
      // On Windows, construct command as a single string to avoid the security warning
      // This is safe because we control the command and arguments
      const escapedArgs = args.map((arg) => {
        // Escape arguments that contain spaces or special characters
        if (
          arg.includes(' ') ||
          arg.includes('"') ||
          arg.includes("'") ||
          arg.includes('&') ||
          arg.includes('|')
        ) {
          return `"${arg.replace(/"/g, '\\"')}"`;
        }
        return arg;
      });
      const commandStr = `${command} ${escapedArgs.join(' ')}`;

      const childProcess = spawn(commandStr, {
        cwd,
        stdio: 'inherit',
        shell: true,
        env: { ...process.env },
      });

      childProcess.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Command failed with code ${code}`));
        }
      });

      childProcess.on('error', (error) => {
        reject(error);
      });
    } else {
      // On Unix-like systems, use spawn without shell for better security
      const childProcess = spawn(command, args, {
        cwd,
        stdio: 'inherit',
        shell: false,
        env: { ...process.env },
      });

      childProcess.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Command failed with code ${code}`));
        }
      });

      childProcess.on('error', (error) => {
        reject(error);
      });
    }
  });
}

/**
 * Installs Studio dependencies.
 */
async function installStudioDeps(): Promise<void> {
  // Check if studio directory exists and has package.json
  const exists = await studioExists();
  if (!exists) {
    return;
  }

  const studioDir = join(process.cwd(), 'studio');
  await execCommand('npm', ['ci'], studioDir);
}

/**
 * Builds the Studio UI using Next.js.
 */
async function buildStudio(): Promise<void> {
  // Check if studio directory exists and has package.json
  const exists = await studioExists();
  if (!exists) {
    return;
  }

  const studioDir = join(process.cwd(), 'studio');
  await execCommand('npm', ['run', 'build'], studioDir);
}

/**
 * Copies the Studio dist files to the dist directory.
 */
async function copyStudioDist() {
  const studioOutDir = join(process.cwd(), 'studio', 'out');

  // Check if studio out directory exists
  try {
    await access(studioOutDir);
  } catch {
    return;
  }

  await rm(join(process.cwd(), 'dist', 'studio', 'app'), {
    recursive: true,
    force: true,
  });

  await cp(studioOutDir, join(process.cwd(), 'dist', 'studio', 'app'), {
    recursive: true,
  });
}

/**
 * Builds the Lithia package using tsup.
 */
async function buildLithia() {
  await build({
    name: 'lithia',
    entry: [
      ...subpaths.map((subpath) => `src/${subpath}/index.ts`),
      'src/index.ts',
    ],
    target: 'esnext',
    platform: 'node',
    bundle: true,
    external: [...subpaths.map((subpath) => `lithia/${subpath}`)],
    dts: true,
    minify: false,
    treeshake: { preset: 'recommended' },
    format: ['cjs'],
    clean: true,
  });
}

/**
 * Processes all files in the `dist` directory to update import paths.
 */
async function processDistFiles() {
  const files = await readdir(join(process.cwd(), 'dist'), {
    withFileTypes: true,
    recursive: true,
  });

  for (const file of files) {
    if (!file.isFile()) continue;

    await updateImportPaths(join(file.parentPath, file.name));
  }
}

/**
 * Updates import paths in a file to resolve Lithia subpaths correctly.
 * @param {string} fullPath - The absolute path of the file to process.
 */
async function updateImportPaths(fullPath: string) {
  const content = await readFile(fullPath, 'utf-8');

  let updatedContent = '';

  if (fullPath.endsWith('.js')) {
    updatedContent = content.replace(
      /require\(['"](lithia(?:\/[a-zA-Z0-9_-]+)?)['"]\)/g,
      (items, lithiaPath) => {
        const pathMap: Record<string, string> = {
          'lithia/cli': './cli',
          'lithia/config': './config',
          'lithia/core': './core',
          'lithia/meta': './meta',
          'lithia/studio': './studio',
          'lithia/types': './types',
        };

        const resolvedPath = pathMap[lithiaPath];
        if (!resolvedPath) return items;

        let relativePath = relative(
          dirname(fullPath),
          join(process.cwd(), 'dist', resolvedPath, 'index.js'),
        ).replace(/\\/g, '/');

        if (relativePath[0] !== '.') {
          relativePath = `./${relativePath}`;
        }

        return `require("${relativePath}")`;
      },
    );
  } else {
    updatedContent = content.replace(
      /(import|export)\s*\{([a-zA-Z0-9_,\s$]*)\}\s*from\s*['"](lithia(?:\/[a-zA-Z0-9_-]+)?)['"]/g,
      (match, type, items, lithiaPath) => {
        const pathMap: Record<string, string> = {
          'lithia/cli': './cli',
          'lithia/config': './config',
          'lithia/core': './core',
          'lithia/meta': './meta',
          'lithia/studio': './studio',
          'lithia/types': './types',
        };

        const resolvedPath = pathMap[lithiaPath];
        if (!resolvedPath) return match;

        let relativePath = relative(
          dirname(fullPath),
          join(process.cwd(), 'dist', resolvedPath, 'index.js'),
        ).replace(/\\/g, '/');

        if (relativePath[0] !== '.') {
          relativePath = `./${relativePath}`;
        }

        return `${type} {${items}} from "${relativePath}"`;
      },
    );
  }
  await writeFile(fullPath, updatedContent);
}

/**
 * Main function to orchestrate the build process.
 */
async function main() {
  try {
    // Build Lithia core
    await executeStep(BuildStep.BUILD_LITHIA_CORE, buildLithia);

    // Process distribution files
    await executeStep(BuildStep.PROCESS_DIST_FILES, processDistFiles);

    // Install Studio dependencies
    await executeStep(BuildStep.INSTALL_STUDIO_DEPS, installStudioDeps);

    // Build Studio UI (after Lithia is ready and deps installed)
    await executeStep(BuildStep.BUILD_STUDIO_UI, buildStudio);

    // Copy Studio dist files
    await executeStep(BuildStep.COPY_STUDIO_DIST, copyStudioDist);
  } catch (error) {
    console.error(
      'Build failed:',
      error instanceof Error ? error.message : String(error),
    );
    process.exit(1);
  }
}

// Execute the build process
main();
