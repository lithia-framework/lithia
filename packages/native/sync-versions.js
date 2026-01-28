#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

if (process.env.CI !== '1') {
  return;
}

function die(msg) {
  console.error(msg);
  process.exit(1);
}

const pkgPath = path.join(__dirname, 'package.json');
const cargoPath = path.join(__dirname, 'Cargo.toml');

if (!fs.existsSync(pkgPath)) die(`package.json not found at ${pkgPath}`);
if (!fs.existsSync(cargoPath)) die(`Cargo.toml not found at ${cargoPath}`);

let pkg;
try {
  pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
} catch (err) {
  die(`Failed to read/parse package.json: ${err.message}`);
}

const version = pkg.version;
if (!version) die('No `version` field in package.json');

let cargo = fs.readFileSync(cargoPath, 'utf8');

function replaceVersionInPackageSection(cargoContent, newVersion) {
  const pkgHeaderIndex = cargoContent.indexOf('[package]');
  if (pkgHeaderIndex === -1) return null;

  const afterHeader = cargoContent.slice(pkgHeaderIndex);
  const nextSectionMatch = afterHeader.match(/\n\s*\[/);
  const sectionEnd = nextSectionMatch ? pkgHeaderIndex + nextSectionMatch.index + 1 : cargoContent.length;
  const packageSection = cargoContent.slice(pkgHeaderIndex, sectionEnd);

  if (/^\s*version\s*=\s*".*"/m.test(packageSection)) {
    const replaced = packageSection.replace(/(^\s*version\s*=\s*")[^"]*(")/m, `$1${newVersion}$2`);
    return cargoContent.slice(0, pkgHeaderIndex) + replaced + cargoContent.slice(sectionEnd);
  }

  // No version line in [package] section — insert it after the header line
  const lines = packageSection.split(/\r?\n/);
  // Find header line index (first line of section)
  let headerLineIndex = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim().startsWith('[package]')) { headerLineIndex = i; break; }
  }
  lines.splice(headerLineIndex + 1, 0, `version = "${newVersion}"`);
  const newSection = lines.join('\n');
  return cargoContent.slice(0, pkgHeaderIndex) + newSection + cargoContent.slice(sectionEnd);
}

let newCargo = replaceVersionInPackageSection(cargo, version);
if (newCargo === null) {
  // fallback: global replace of first version = "..." occurrence
  if (/^\s*version\s*=\s*".*"/m.test(cargo)) {
    newCargo = cargo.replace(/(^\s*version\s*=\s*")[^"]*(")/m, `$1${version}$2`);
  } else {
    // add a [package] section at top
    newCargo = `[package]\nversion = "${version}"\n\n` + cargo;
  }
}

if (newCargo === cargo) {
  console.log(`Cargo.toml already at version ${version}`);
  process.exit(0);
}

try {
  fs.writeFileSync(cargoPath, newCargo, 'utf8');
  console.log(`Updated Cargo.toml => version ${version}`);
} catch (err) {
  die(`Failed to write Cargo.toml: ${err.message}`);
}
