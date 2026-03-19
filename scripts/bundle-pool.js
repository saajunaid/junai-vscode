#!/usr/bin/env node
/**
 * bundle-pool.js
 * ──────────────
 * Syncs the junai agent pool into the extension's pool/ directory before packaging.
 *
 * Usage:
 *   node scripts/bundle-pool.js
 *
 * Source resolution (first match wins):
 *   1. JUNAI_SOURCE env var (explicit path to a .github/ directory)
 *   2. ../agent-sandbox/.github  (sibling repo on dev machine)
 *   3. ../junai                  (fallback sibling repo)
 *
 * If no source is found the existing pool/ content is left untouched.
 */

const fs   = require('fs');
const path = require('path');

// ── Directories + root files to bundle ────────────────────────────────────────
const POOL_DIRS = [
    'agents',
    'skills',
    'prompts',
    'instructions',
    'agent-docs',
    'plans',
    'handoffs',
    'tools',
];
const POOL_FILES = [
    'project-config.md',
];
const SKIP = new Set(['.git', 'node_modules', '__pycache__', '.DS_Store', '.venv']);

// Skill sub-folders excluded from the marketplace bundle.
// These are internal/proprietary skills not intended for public distribution.
const SKIP_SKILLS = new Set(['vmie']);

// ── Paths ─────────────────────────────────────────────────────────────────────
const ROOT    = path.resolve(__dirname, '..');
const poolDir = path.join(ROOT, 'pool');

function resolveSource() {
    if (process.env.JUNAI_SOURCE) {
        const env = path.resolve(process.env.JUNAI_SOURCE);
        if (fs.existsSync(env)) { return env; }
        console.warn(`⚠  JUNAI_SOURCE set but not found: ${env}`);
    }
    const candidates = [
        path.resolve(ROOT, '..', 'agent-sandbox', '.github'),
        path.resolve(ROOT, '..', 'junai'),
    ];
    for (const c of candidates) {
        if (fs.existsSync(c)) { return c; }
    }
    return null;
}

function copyDirSync(src, dest, extraSkip = null) {
    if (!fs.existsSync(src)) {
        console.warn(`  ⚠  Not found, skipping: ${path.relative(ROOT, src)}`);
        return 0;
    }
    fs.mkdirSync(dest, { recursive: true });
    // The immediate parent folder name — used to skip accidentally-nested duplicates
    // e.g. skills/skills/, prompts/prompts/ created by errant sync operations.
    const parentName = path.basename(dest);
    let count = 0;
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
        if (SKIP.has(entry.name)) { continue; }
        if (extraSkip && extraSkip.has(entry.name)) { continue; }
        // Guard: skip any subfolder whose name matches its immediate parent
        // (e.g. skills/skills, prompts/prompts — these are always accidental nesting)
        if (entry.isDirectory() && entry.name === parentName) {
            console.warn(`  ⚠  Skipping accidental nesting: ${path.relative(ROOT, src)}/${entry.name}/`);
            continue;
        }
        const srcPath  = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
            count += copyDirSync(srcPath, destPath, extraSkip);
        } else {
            fs.copyFileSync(srcPath, destPath);
            count++;
        }
    }
    return count;
}

// ── Main ──────────────────────────────────────────────────────────────────────
console.log('\n🔧  Bundling agent pool → pool/');

const source = resolveSource();
if (!source) {
    console.warn('⚠  No source found. pool/ content left as-is.\n');
    console.warn('   Set JUNAI_SOURCE=<path-to-.github> to specify source explicitly.\n');
    process.exit(0);
}
console.log(`   Source : ${source}\n`);

// Clear pool/ before copying to remove stale content from previous bundles
if (fs.existsSync(poolDir)) {
    fs.rmSync(poolDir, { recursive: true, force: true });
}
fs.mkdirSync(poolDir, { recursive: true });

let total = 0;

for (const dir of POOL_DIRS) {
    const extraSkip = dir === 'skills' ? SKIP_SKILLS : null;
    const count = copyDirSync(path.join(source, dir), path.join(poolDir, dir), extraSkip);
    if (count > 0) {
        console.log(`  ✓  ${dir.padEnd(20)} ${count} files`);
    }
    total += count;
}

for (const file of POOL_FILES) {
    const src = path.join(source, file);
    if (fs.existsSync(src)) {
        fs.copyFileSync(src, path.join(poolDir, file));
        console.log(`  ✓  ${file}`);
        total++;
    }
}

// Write version marker — used by extension to detect when workspace pool is stale
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
fs.writeFileSync(path.join(poolDir, 'POOL_VERSION'), pkg.version, 'utf8');

console.log(`\n✅  Pool bundled — ${total} files written to pool/  [pool version: ${pkg.version}]\n`);
