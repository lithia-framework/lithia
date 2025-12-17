# Contributing to Lithia

First off, thank you for considering contributing to Lithia! We're building something special here, and we'd love for you to be part of it from the beginning.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Branch Strategy](#branch-strategy)
- [How Can I Contribute?](#how-can-i-contribute)
- [Development Setup](#development-setup)
- [Pull Request Process](#pull-request-process)
- [Coding Standards](#coding-standards)
- [Commit Guidelines](#commit-guidelines)
- [Project Structure](#project-structure)
- [Testing](#testing)
- [Documentation](#documentation)

## Code of Conduct

This project and everyone participating in it is governed by respect, professionalism, and inclusivity. By participating, you are expected to uphold these values. Please report unacceptable behavior to [support@lithiajs.com](mailto:support@lithiajs.com).

## Branch Strategy

Lithia uses a **canary development model** with release branches:

### Branch Overview

```
canary (default) → Active development, bleeding edge features
  ↓
v*.*.* → Release branches (e.g., v4.0.4)
  ↓
v*.*.* → Stable releases (tags)
```

### Branches Explained

- **`canary`** (default branch)
  - All active development happens here
  - All PRs should target this branch
  - Contains latest features and fixes
  - May contain bugs or breaking changes
  - Published as `lithia@canary` on npm

- **`v*.*.*`** (release branches)
  - Stable, production-ready code
  - Created from `canary` during releases
  - Used for final testing and bug fixes before release
  - Example: `v4.0.4` branch for version 4.0.4

- **`v*.*.*`** (tags)
  - Final stable releases
  - Created from release branches
  - Published as `lithia@latest` on npm
  - This is what users install by default

### For Contributors

**Always work from the `canary` branch:**

```bash
# Clone and switch to canary
git clone https://github.com/your-username/lithia.git
cd lithia
git checkout canary

# Create your feature branch from canary
git checkout -b feat/amazing-feature

# All PRs go to canary
```

### For Users

**Install stable version (recommended):**

```bash
npm install lithia
```

**Install canary version (for testing latest features):**

```bash
npm install lithia@canary
```

⚠️ **Warning:** Canary builds are experimental. Use in production at your own risk.

### Release Process

1. Development happens on `canary`
2. Features are tested by early adopters using `lithia@canary`
3. When stable, a release branch is created from `canary` (e.g., `v4.0.4`)
4. Final testing and bug fixes happen on the release branch
5. A tag is created from the release branch (e.g., `v4.0.4`)
6. The tagged version is published to npm as `lithia@latest`
7. Users get the update via `npm install lithia@latest`

## How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check the [existing issues](https://github.com/lithia-framework/lithia/issues) to avoid duplicates.

When creating a bug report, include:

- **Clear and descriptive title**
- **Steps to reproduce** the behavior
- **Expected behavior** vs **actual behavior**
- **Environment details** (OS, Node version, Lithia version)
- **Code samples** or repository links if possible
- **Screenshots** if applicable
- **Which version** you're using (stable or canary)

**Example:**

```markdown
**Bug**: Hot reload doesn't trigger when modifying middleware files

**Steps to Reproduce:**

1. Start server with `lithia dev`
2. Modify `src/middlewares/auth.ts`
3. Save the file

**Expected:** Server should reload automatically
**Actual:** No reload happens, manual restart required

**Environment:**

- OS: Ubuntu 22.04
- Node: v20.10.0
- Lithia: v3.1.0 (or canary)
- Package Manager: npm 8.15.0
```

### Suggesting Enhancements

Enhancement suggestions are tracked as [GitHub issues](https://github.com/lithia-framework/lithia/issues).

When creating an enhancement suggestion, include:

- **Clear and descriptive title**
- **Detailed description** of the proposed functionality
- **Use cases** and **examples** of how it would be used
- **Possible implementation** approach (optional)
- **Alternatives considered** (if any)

### First-Time Contributors

Look for issues labeled with:

- `good first issue` - Easy issues perfect for newcomers
- `help wanted` - Issues where we need community help
- `documentation` - Documentation improvements

Don't be afraid to ask questions! We're here to help.

## Development Setup

### Prerequisites

- **Node.js** 18.x or higher
- **npm** 8.x or higher
- **Git**

### Clone and Install

```bash
# Fork the repository on GitHub first, then:

# Clone your fork
git clone https://github.com/your-username/lithia.git
cd lithia

# Switch to canary (development branch)
git checkout canary

# Add upstream remote
git remote add upstream https://github.com/lithia-framework/lithia.git

# Install dependencies
npm install

# Install Studio dependencies
cd studio
npm install
cd ..
```

### Build the Project

```bash
# Build Lithia core and Studio
npm run build
```

### Run Examples

```bash
# Navigate to an example
cd examples/1-basic-api

# Install dependencies
npm install

# Run in development mode
npm run dev
```

### Development Workflow

```bash
# Make sure you're on canary
git checkout canary
git pull upstream canary

# Create your feature branch
git checkout -b feat/my-feature

# Make changes to src/

# Build to test changes
npm run build

# Test with examples
cd examples/1-basic-api
npm run dev

# Check code quality
npm run lint
npm run format:check
```

### Testing Your Changes with npm link

```bash
# In the lithia directory
npm run build
npm link

# In your test project
npm link lithia

# Now your test project uses your local lithia version
```

## Pull Request Process

1. **Ensure you're working from `canary`:**

   ```bash
   git checkout canary
   git pull upstream canary
   git checkout -b feature/amazing-feature
   ```

2. **Make your changes** following our [coding standards](#coding-standards)

3. **Test your changes** thoroughly:

   ```bash
   # Run linter
   npm run lint

   # Check formatting
   npm run format:check

   # Run type checking
   npm run type-check

   # Test with examples
   cd examples/1-basic-api && npm run dev
   ```

4. **Commit your changes** following [commit guidelines](#commit-guidelines)

5. **Push to your fork**:

   ```bash
   git push origin feature/amazing-feature
   ```

6. **Open a Pull Request** against **`canary`** (the main development branch!)

7. **Wait for review** - maintainers will review your PR and may request changes

### Pull Request Requirements

- **Target `canary` branch** - All PRs must go to canary (the main development branch)
- **Clear description** of what the PR does
- **Reference related issues** (e.g., "Fixes #123")
- **All checks passing** (lint, format, type-check)
- **No breaking changes** without discussion (or clearly marked)
- **Updated documentation** if needed
- **Tested with example projects**

### Pull Request Template

```markdown
## Description

Brief description of what this PR does

## Type of Change

- [ ] Bug fix (non-breaking change which fixes an issue)
- [ ] New feature (non-breaking change which adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Documentation update

## Related Issue

Fixes #(issue number)

## How Has This Been Tested?

Describe the tests you ran and how to reproduce them:

- [ ] Tested with `examples/1-basic-api`
- [ ] Tested hot reload functionality
- [ ] Tested Lithia Studio integration
- [ ] Tested with `lithia@canary` in a real project

## Checklist

- [ ] My code follows the style guidelines of this project
- [ ] I have performed a self-review of my own code
- [ ] I have commented my code, particularly in hard-to-understand areas
- [ ] I have made corresponding changes to the documentation
- [ ] My changes generate no new warnings
- [ ] I have tested this with the example projects
- [ ] My PR targets the `canary` branch
```

## Coding Standards

### TypeScript

- **Use TypeScript** - No `any` types unless absolutely necessary
- **Strong typing** - Define interfaces for all data structures
- **No implicit any** - Always specify types

**Good:**

```typescript
interface User {
  id: string;
  name: string;
  email: string;
}

async function getUser(id: string): Promise<User> {
  // implementation
}
```

**Bad:**

```typescript
async function getUser(id) {
  // implementation
}
```

### Code Style

We use **ESLint** for linting and **Prettier** for formatting:

```bash
# Format code
npm run format

# Check formatting
npm run format:check

# Lint
npm run lint

# Fix linting issues
npm run lint:fix
```

### Best Practices

- **Self-explanatory code** - Code should be clear without excessive comments
- **Descriptive variable names** - Use clear, meaningful names
- **Small functions** - Each function should do one thing well
- **Error handling** - Always handle errors appropriately
- **Async/await** - Use async/await over promises
- **Immutability** - Prefer const over let, avoid mutations when possible

**Good:**

```typescript
async function getUserById(userId: string): Promise<User | null> {
  try {
    const user = await database.users.findById(userId);
    return user;
  } catch (error) {
    logger.error('Failed to fetch user', { userId, error });
    return null;
  }
}
```

**Bad:**

```typescript
function getUser(id) {
  return db.users
    .find(id)
    .then((u) => u)
    .catch((e) => null);
}
```

### File Naming Conventions

- **kebab-case** for file names: `http-server-manager.ts`
- **PascalCase** for class names: `HttpServerManager`
- **camelCase** for functions and variables: `getUserById`
- **SCREAMING_SNAKE_CASE** for constants: `MAX_BODY_SIZE`

## Commit Guidelines

We follow [Conventional Commits](https://www.conventionalcommits.org/) specification.

### Commit Format

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

### Types

- **feat**: New feature
- **fix**: Bug fix
- **docs**: Documentation changes
- **style**: Code style changes (formatting, semicolons, etc.)
- **refactor**: Code refactoring (no functional changes)
- **perf**: Performance improvements
- **test**: Adding or updating tests
- **chore**: Maintenance tasks (dependencies, build, etc.)
- **ci**: CI/CD changes

### Examples

```bash
# New feature
git commit -m "feat(routing): add support for catch-all routes"

# Bug fix
git commit -m "fix(hot-reload): correctly detect file changes in nested directories"

# Documentation
git commit -m "docs(readme): update installation instructions"

# Breaking change
git commit -m "feat(server)!: change default port to 3000

BREAKING CHANGE: The default server port has changed from 8080 to 3000.
Users need to update their configurations or explicitly set the port."

# Multiple changes
git commit -m "chore: update dependencies and fix linting issues"
```

### Scope Guidelines

Common scopes:

- `core` - Core framework functionality
- `routing` - Routing system
- `server` - HTTP server
- `studio` - Lithia Studio
- `cli` - Command-line interface
- `build` - Build system
- `types` - TypeScript types
- `docs` - Documentation
- `examples` - Example projects
- `config` - Configuration system
- `hooks` - Hooks system
- `middleware` - Middleware system

## Project Structure

```
lithia/
├── src/                      # Source code
│   ├── cli/                  # CLI commands
│   ├── core/                 # Core framework
│   │   ├── build/           # Build system
│   │   ├── config/          # Configuration
│   │   ├── log/             # Logging
│   │   ├── routing/         # Routing system
│   │   └── server/          # HTTP server
│   ├── studio/              # Lithia Studio server
│   └── types/               # TypeScript types
├── studio/                   # Studio UI (Next.js app)
├── examples/                 # Example projects
├── dist/                     # Built files (git ignored)
└── build.ts                 # Build script
```

### Key Files

- `src/core/lithia.ts` - Main Lithia instance
- `src/core/routing/convention.ts` - Routing conventions
- `src/core/server/http-server-manager.ts` - HTTP server
- `src/studio/lithia-studio.ts` - Studio server
- `src/types/index.ts` - Public type exports
- `build.ts` - Build pipeline

## Testing

### Manual Testing

We currently rely on manual testing with example projects:

```bash
# Test with basic example
cd examples/1-basic-api
npm install
npm run dev

# Test features:
# - Create new routes
# - Test hot reload
# - Test Lithia Studio (http://localhost:8473)
# - Test different HTTP methods
# - Test dynamic routes
# - Test middleware system
```

### Testing Checklist

Before submitting a PR, test:

- [ ] Hot reload works with file changes
- [ ] New routes are detected automatically
- [ ] Lithia Studio displays correctly at `http://localhost:8473`
- [ ] CLI commands work (`dev`, `build`, `start`)
- [ ] TypeScript types are correct
- [ ] No console errors or warnings
- [ ] Examples run without issues
- [ ] Middleware executes in correct order
- [ ] Dynamic routes work with parameters
- [ ] Method-specific routes work correctly

### Testing with Real Projects

For significant changes, test with a real project:

```bash
# In lithia directory
npm run build
npm link

# In your test project
npm link lithia
npm run dev

# Test all functionality
```

## Documentation

### Code Documentation

- **JSDoc for public APIs** - Document all exported functions and classes
- **Type definitions** - Use TypeScript types as documentation
- **Clear naming** - Use self-explanatory names

**Example:**

````typescript
/**
 * Creates a new Lithia instance with the provided configuration.
 *
 * @param config - Lithia configuration object
 * @param opts - Configuration loading options
 * @param logger - Optional custom logger instance
 * @returns Promise resolving to configured Lithia instance
 *
 * @example
 * ```typescript
 * const lithia = await createLithia({
 *   server: { port: 3000 }
 * });
 * ```
 */
export async function createLithia(
  config: LithiaConfig = {},
  opts: LoadConfigOptions = {},
  logger?: Logger,
): Promise<Lithia> {
  // implementation
}
````

### Documentation Updates

When adding features or making changes, update:

- **README.md** - If feature is user-facing
- **Type definitions** - Keep types accurate
- **Examples** - Add examples for new features
- **CHANGELOG.md** - Document changes (maintainers handle this)
- **Migration guides** - For breaking changes

### Documentation Style

- Use clear, simple language
- Provide code examples
- Include "why" not just "how"
- Keep it up to date with code changes

## Getting Help

- **GitHub Discussions**: [Ask questions](https://github.com/lithia-framework/lithia/discussions)
- **GitHub Issues**: For bug reports and feature requests
- **Email**: [support@lithiajs.com](mailto:support@lithiajs.com)

Don't hesitate to ask for help! We're all learning together.

## Recognition

Contributors are recognized in:

- **GitHub Contributors page**
- **Release notes** (for significant contributions)
- **Special thanks** in README (for major features)
- **OpenCollective** (for financial contributors)

## Development Tips

### Quick Commands Reference

```bash
# Development
npm run build              # Build the project
npm run dev                # Start with watch mode (if available)
npm run lint               # Run ESLint
npm run lint:fix           # Fix linting issues
npm run format             # Format code with Prettier
npm run format:check       # Check code formatting
npm run type-check         # Run TypeScript type checking

# Testing
cd examples/1-basic-api && npm run dev

# Branch management
git checkout canary         # Switch to canary
git pull upstream canary    # Update from upstream
git checkout -b feat/new    # Create feature branch
```

### Common Issues

**Build fails with TypeScript errors:**

- Make sure you're on the latest `canary` branch
- Run `npm install` to ensure dependencies are up to date
- Check that your Node.js version is 18.x or higher

**Examples don't work:**

- Rebuild the main project: `npm run build`
- Reinstall example dependencies: `cd examples/1-basic-api && npm install`
- Clear any cached builds: `rm -rf dist`

**Hot reload not working:**

- Check file watcher limits on Linux: `echo fs.inotify.max_user_watches=524288 | sudo tee -a /etc/sysctl.conf && sudo sysctl -p`
- Restart the dev server

## License

By contributing to Lithia, you agree that your contributions will be licensed under the [MIT License](LICENSE).

---

**Thank you for contributing to Lithia!** 🚀

Every contribution, no matter how small, helps make Lithia better for everyone. We appreciate your time and effort in making this project great.

**Remember:** All PRs go to `canary` - the main development branch!
