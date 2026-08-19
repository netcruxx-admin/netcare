#!/usr/bin/env node
'use strict';
/**
 * Cross-platform setup — works on macOS, Linux, and Windows.
 *
 * Replaces the Unix-only shell chain in package.json:
 *   cd apps/api && python3 -m venv ... && ./venv/bin/pip ... && cp -n ... && ./venv/bin/alembic ...
 *
 * Run with:  npm run setup
 */
const { execSync, execFileSync } = require('child_process');
const fs   = require('fs');
const path = require('path');

const isWin  = process.platform === 'win32';
const root   = path.resolve(__dirname, '..');
const apiDir = path.join(root, 'apps', 'api');
const binDir = isWin
  ? path.join(apiDir, 'venv', 'Scripts')
  : path.join(apiDir, 'venv', 'bin');

/** Full path to a binary inside the venv. */
function venvBin(name) {
  return path.join(binDir, isWin ? `${name}.exe` : name);
}

function step(msg) { console.log(`\n${msg}`); }

function run(file, args = [], cwd = root) {
  console.log(`  $ ${path.basename(file)} ${args.join(' ')}`);
  execFileSync(file, args, { stdio: 'inherit', cwd });
}

// ── 1. Node.js dependencies ──────────────────────────────────────────────────
step('📦  Installing Node.js dependencies...');
execSync('npm install', { stdio: 'inherit', cwd: root });

// ── 2. Python virtual environment ────────────────────────────────────────────
step('🐍  Creating Python virtual environment...');
const python = (() => {
  for (const cmd of ['python3', 'python']) {
    try { execSync(`${cmd} --version`, { stdio: 'ignore' }); return cmd; } catch {}
  }
  console.error('\n❌  Python not found. Install Python 3.9+ and add it to your PATH.');
  process.exit(1);
})();
execSync(`${python} -m venv venv`, { stdio: 'inherit', cwd: apiDir });

// ── 3. pip + requirements ─────────────────────────────────────────────────────
step('📚  Installing Python packages...');
run(venvBin('pip'), ['install', '-q', '--upgrade', 'pip'], apiDir);
run(venvBin('pip'), ['install', '-r', 'requirements.txt'], apiDir);

// ── 4. .env file ──────────────────────────────────────────────────────────────
step('⚙️   Setting up environment file...');
const envSrc  = path.join(apiDir, '.env.example');
const envDest = path.join(apiDir, '.env');
if (!fs.existsSync(envDest)) {
  fs.copyFileSync(envSrc, envDest);
  console.log('  Created apps/api/.env');
  console.log('  ✏️  Edit DATABASE_URL and JWT_SECRET before starting the server.');
} else {
  console.log('  apps/api/.env already exists — skipping.');
}

// ── 5. Database migrations ────────────────────────────────────────────────────
step('🗄️   Running database migrations...');
run(venvBin('alembic'), ['upgrade', 'head'], apiDir);

// ── Done ──────────────────────────────────────────────────────────────────────
console.log('\n✅  Setup complete!');
console.log('    npm run dev:all   — start frontend + backend together');
console.log('    npm run dev       — frontend only  (http://localhost:3000)');
console.log('    npm run dev:api   — backend only   (http://localhost:8000)\n');
