#!/usr/bin/env node

/**
 * This script automates versioning and publishing.
 * It will:
 * 1. Read the current version from package.json
 * 2. Determine the next version based on conventional commits
 * 3. Update package.json
 * 4. Create a git tag
 * 5. Push to GitHub
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Get the path to package.json
const packageJsonPath = path.resolve(__dirname, '../package.json');

// Read the current package.json
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const currentVersion = packageJson.version;
console.log(`Current version: ${currentVersion}`);

// Get the commit messages since the last tag
let commitMessages;
try {
  const lastTag = execSync('git describe --tags --abbrev=0').toString().trim();
  console.log(`Last tag: ${lastTag}`);
  commitMessages = execSync(`git log ${lastTag}..HEAD --pretty=format:"%s"`).toString().trim();
} catch (error) {
  // No tags exist yet, get all commit messages
  console.log('No previous tags found, using all commits');
  commitMessages = execSync('git log --pretty=format:"%s"').toString().trim();
}

// Determine bump type from commit messages
const hasMajor = /BREAKING CHANGE:|feat!:|fix!:|refactor!:|perf!:/.test(commitMessages);
const hasFeature = /feat:/.test(commitMessages);
const hasFix = /fix:/.test(commitMessages);

let bumpType = 'patch'; // Default bump type
if (hasMajor) {
  bumpType = 'major';
} else if (hasFeature) {
  bumpType = 'minor';
} else if (hasFix) {
  bumpType = 'patch';
}

console.log(`Bump type: ${bumpType}`);

// Calculate new version
const [major, minor, patch] = currentVersion.split('.').map(Number);
let newVersion;

switch (bumpType) {
  case 'major':
    newVersion = `${major + 1}.0.0`;
    break;
  case 'minor':
    newVersion = `${major}.${minor + 1}.0`;
    break;
  case 'patch':
    newVersion = `${major}.${minor}.${patch + 1}`;
    break;
}

console.log(`New version: ${newVersion}`);

// Update package.json
packageJson.version = newVersion;
fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');

// Create a commit for the version bump
execSync(`git add ${packageJsonPath}`);
execSync(`git commit -m "chore: bump version to ${newVersion}"`);

// Create a tag for the new version
execSync(`git tag v${newVersion}`);

// Push changes and tags to GitHub
execSync('git push');
execSync('git push --tags');

console.log(`Version ${newVersion} has been created and pushed to GitHub.`);