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
    'copilot-instructions.md',
    'project-config.md',
];
const SKIP = new Set(['.git', 'node_modules', '__pycache__', '.DS_Store', '.venv']);

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

function copyDirSync(src, dest) {
    if (!fs.existsSync(src)) {
        console.warn(`  ⚠  Not found, skipping: ${path.relative(ROOT, src)}`);
        return 0;
    }
    fs.mkdirSync(dest, { recursive: true });
    let count = 0;
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
        if (SKIP.has(entry.name)) { continue; }
        const srcPath  = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
            count += copyDirSync(srcPath, destPath);
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
    const count = copyDirSync(path.join(source, dir), path.join(poolDir, dir));
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

console.log(`\n✅  Pool bundled — ${total} files written to pool/\n`);
