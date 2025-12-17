#!/usr/bin/env node

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineCommand, runMain } from 'citty';
import prompts from 'prompts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface Project {
  name: string;
  displayName: string;
  path: string;
  description: string;
}

interface PackageJson {
  description?: string;
  [key: string]: unknown;
}

function scanExamples(): Project[] {
  const examplesDir = __dirname;
  const projects: Project[] = [];

  try {
    const items = fs.readdirSync(examplesDir, { withFileTypes: true });

    for (const item of items) {
      if (item.isDirectory() && item.name.match(/^\d+-/)) {
        const projectPath = path.join(examplesDir, item.name);
        const packageJsonPath = path.join(projectPath, 'package.json');

        if (fs.existsSync(packageJsonPath)) {
          try {
            const packageJson: PackageJson = JSON.parse(
              fs.readFileSync(packageJsonPath, 'utf8'),
            );
            projects.push({
              name: item.name,
              displayName: item.name
                .replace(/^\d+-/, '')
                .replace(/-/g, ' ')
                .replace(/\b\w/g, (l) => l.toUpperCase()),
              path: projectPath,
              description: packageJson.description || 'Lithia example',
            });
          } catch (error) {
            console.warn(
              `Error reading package.json from ${item.name}:`,
              error instanceof Error ? error.message : String(error),
            );
          }
        }
      }
    }

    projects.sort((a, b) => {
      const numA = Number.parseInt(a.name.match(/^(\d+)-/)?.[1] || '0', 10);
      const numB = Number.parseInt(b.name.match(/^(\d+)-/)?.[1] || '0', 10);
      return numA - numB;
    });
  } catch (error) {
    console.error(
      'Error scanning examples folder:',
      error instanceof Error ? error.message : String(error),
    );
    process.exit(1);
  }

  return projects;
}

function runServer(project: Project): void {
  const child = spawn('npm', ['run', 'dev'], {
    cwd: project.path,
    stdio: 'inherit',
    shell: true,
  });

  const cleanup = () => {
    child.kill('SIGTERM');
    process.exit(0);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  child.on('error', (error) => {
    console.error('Error running server:', error.message);
    process.exit(1);
  });

  child.on('exit', (code) => {
    if (code !== 0) {
      console.error(`Server exited with code ${code}`);
      process.exit(code || 1);
    }
  });
}

const main = defineCommand({
  meta: {
    name: 'lithia-examples',
    description: 'Run Lithia examples',
    version: '1.0.0',
  },
  args: {
    example: {
      type: 'positional',
      description: 'Name of the example to run directly',
      required: false,
    },
    list: {
      type: 'boolean',
      description: 'List all available examples',
      alias: 'l',
    },
  },
  async run({ args }) {
    const projects = scanExamples();

    if (projects.length === 0) {
      console.log('No projects found in examples/ folder');
      console.log('Make sure projects follow the pattern: 1-project-name');
      process.exit(1);
    }

    if (args.list) {
      console.log('Available examples:\n');
      for (const project of projects) {
        console.log(`  ${project.name}`);
        console.log(`    ${project.displayName}`);
        console.log(`    ${project.path}`);
        console.log(`    ${project.description}\n`);
      }
      return;
    }

    let selectedProject: Project | undefined;

    if (args.example) {
      selectedProject = projects.find(
        (p) =>
          p.name === args.example ||
          p.name.includes(args.example) ||
          p.displayName.toLowerCase().includes(args.example.toLowerCase()),
      );

      if (!selectedProject) {
        console.log(`Example "${args.example}" not found`);
        console.log('Available examples:');
        for (const p of projects) {
          console.log(`  - ${p.name} (${p.displayName})`);
        }
        process.exit(1);
      }
    } else if (projects.length === 1) {
      selectedProject = projects[0];
      console.log(
        `Running the only available example: ${selectedProject.displayName}`,
      );
    } else {
      console.log('Select an example to run:\n');

      const response = await prompts({
        type: 'select',
        name: 'project',
        message: 'Which example do you want to run?',
        choices: projects.map((project) => ({
          title: `${project.name} - ${project.displayName}`,
          value: project,
          description: project.description,
        })),
      });

      if (!response.project) {
        console.log('No project selected');
        process.exit(0);
      }

      selectedProject = response.project;
    }

    if (!selectedProject) {
      console.log('No project selected');
      process.exit(1);
    }

    const nodeModulesPath = path.join(selectedProject.path, 'node_modules');
    if (!fs.existsSync(nodeModulesPath)) {
      console.log('Installing dependencies...');
      const installProcess = spawn('npm', ['install'], {
        cwd: selectedProject.path,
        stdio: 'inherit',
        shell: true,
      });

      installProcess.on('exit', (code) => {
        if (code === 0 && selectedProject) {
          runServer(selectedProject);
        } else {
          console.error('Error installing dependencies');
          process.exit(1);
        }
      });
    } else {
      runServer(selectedProject);
    }
  },
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught error:', error.message);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason);
  process.exit(1);
});

runMain(main);
