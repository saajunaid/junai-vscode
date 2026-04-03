#!/usr/bin/env node
/**
 * bundle-pool.js
 * ──────────────
 * Builds and syncs the junai runtime bundles into the extension's pool/ directory before packaging.
 *
 * Usage:
 *   node scripts/bundle-pool.js
 *
 * Source resolution (first match wins):
 *   1. JUNAI_SOURCE env var (explicit path to a repo root or .github/ directory)
 *   2. ../agent-sandbox      (sibling repo on dev machine)
 *   3. ../junai              (fallback sibling repo)
 *
 * If no source is found the existing pool/ content is left untouched.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const SKIP = new Set(['.git', 'node_modules', '__pycache__', '.DS_Store', '.venv']);

const ROOT = path.resolve(__dirname, '..');
const poolDir = path.join(ROOT, 'pool');

function normalizeRepoRoot(candidate) {
    if (!candidate) {
        return null;
    }
    const resolved = path.resolve(candidate);
    return path.basename(resolved) === '.github' ? path.dirname(resolved) : resolved;
}

function resolveSourceRoot() {
    if (process.env.JUNAI_SOURCE) {
        const env = normalizeRepoRoot(process.env.JUNAI_SOURCE);
        if (env && fs.existsSync(env)) {
            return env;
        }
        console.warn(`⚠  JUNAI_SOURCE set but not found: ${process.env.JUNAI_SOURCE}`);
    }

    const candidates = [
        path.resolve(ROOT, '..', 'agent-sandbox'),
        path.resolve(ROOT, '..', 'junai'),
    ];

    for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
            return candidate;
        }
    }

    return null;
}

function runExporter(sourceRoot) {
    const exporter = path.join(sourceRoot, 'export_runtime_resources.py');
    if (!fs.existsSync(exporter)) {
        console.warn(`⚠  Exporter not found, skipping runtime export: ${exporter}`);
        return false;
    }

    const candidates = [
        { cmd: path.join(sourceRoot, '.venv', 'Scripts', 'python.exe'), args: [exporter] },
        { cmd: 'python', args: [exporter] },
        { cmd: 'py', args: ['-3', exporter] },
    ];

    for (const candidate of candidates) {
        if (candidate.cmd.includes(path.sep) && !fs.existsSync(candidate.cmd)) {
            continue;
        }

        const result = spawnSync(candidate.cmd, candidate.args, {
            cwd: sourceRoot,
            encoding: 'utf8',
            stdio: 'pipe',
        });

        if (result.status === 0) {
            const output = [result.stdout, result.stderr].filter(Boolean).join('').trim();
            if (output) {
                console.log(output);
            }
            return true;
        }
    }

    console.warn('⚠  Failed to build runtime exports. pool/ content left as-is.');
    return false;
}

function copyDirSync(src, dest) {
    if (!fs.existsSync(src)) {
        console.warn(`  ⚠  Not found, skipping: ${path.relative(ROOT, src)}`);
        return 0;
    }

    fs.mkdirSync(dest, { recursive: true });
    const parentName = path.basename(dest);
    let count = 0;

    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
        if (SKIP.has(entry.name)) {
            continue;
        }
        if (entry.isDirectory() && entry.name === parentName) {
            console.warn(`  ⚠  Skipping accidental nesting: ${path.relative(ROOT, src)}/${entry.name}/`);
            continue;
        }

        const srcPath = path.join(src, entry.name);
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

console.log('\n🔧  Bundling runtime resources → pool/');

const sourceRoot = resolveSourceRoot();
if (!sourceRoot) {
    console.warn('⚠  No source found. pool/ content left as-is.\n');
    console.warn('   Set JUNAI_SOURCE=<path-to-repo-root-or-.github> to specify source explicitly.\n');
    process.exit(0);
}
console.log(`   Source : ${sourceRoot}\n`);

if (!runExporter(sourceRoot)) {
    process.exit(0);
}

const runtimeRoot = path.join(sourceRoot, 'dist', 'runtime-resources');
if (!fs.existsSync(runtimeRoot)) {
    console.warn(`⚠  Runtime export output not found: ${runtimeRoot}`);
    process.exit(0);
}

if (fs.existsSync(poolDir)) {
    fs.rmSync(poolDir, { recursive: true, force: true });
}
fs.mkdirSync(poolDir, { recursive: true });

let total = 0;
const runtimes = [
    { name: 'copilot', folder: '.github' },
    { name: 'claude', folder: '.claude' },
    { name: 'codex', folder: '.codex' },
];

for (const runtime of runtimes) {
    const src = path.join(runtimeRoot, runtime.name, runtime.folder);
    const dest = path.join(poolDir, runtime.folder);
    if (!fs.existsSync(src)) {
        console.warn(`  ⚠  Missing runtime folder, skipped: ${runtime.name}/${runtime.folder}`);
        continue;
    }
    const count = copyDirSync(src, dest);
    console.log(`  ✓  ${runtime.folder.padEnd(20)} ${count} files`);
    total += count;
}

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
fs.writeFileSync(path.join(poolDir, 'POOL_VERSION'), pkg.version, 'utf8');

console.log(`\n✅  Pool bundled — ${total} files written to pool/  [pool version: ${pkg.version}]\n`);
