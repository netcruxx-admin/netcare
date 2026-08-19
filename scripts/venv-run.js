#!/usr/bin/env node
'use strict';
/**
 * Runs a binary from the Python venv — cross-platform.
 *
 * Usage:   node scripts/venv-run.js <binary> [args...]
 * Example: node scripts/venv-run.js uvicorn app.main:app --reload --port 8000
 *          node scripts/venv-run.js alembic upgrade head
 *
 * On macOS/Linux: looks in  apps/api/venv/bin/
 * On Windows:     looks in  apps/api/venv/Scripts/
 */
const { spawn } = require('child_process');
const path      = require('path');

const isWin  = process.platform === 'win32';
const apiDir = path.resolve(__dirname, '..', 'apps', 'api');
const binDir = isWin
  ? path.join(apiDir, 'venv', 'Scripts')
  : path.join(apiDir, 'venv', 'bin');

const [, , bin, ...args] = process.argv;

if (!bin) {
  console.error('Usage: node scripts/venv-run.js <binary> [args...]');
  process.exit(1);
}

const exe   = path.join(binDir, isWin ? `${bin}.exe` : bin);
const child = spawn(exe, args, { stdio: 'inherit', cwd: apiDir });

child.on('error', (err) => {
  console.error(`\n❌  Could not start "${bin}": ${err.message}`);
  console.error('    Run "npm run setup" first to create the virtual environment.\n');
  process.exit(1);
});

// Forward the exit code / signal so the caller (e.g. concurrently) sees it.
child.on('exit', (code, signal) => {
  if (signal) { try { process.kill(process.pid, signal); } catch {} }
  process.exit(code ?? 0);
});
