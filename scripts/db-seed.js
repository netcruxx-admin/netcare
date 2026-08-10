#!/usr/bin/env node
'use strict';
/**
 * Seeds the database with demo data — cross-platform.
 *
 * Avoids shell-quoting issues by passing the Python snippet as an array
 * argument rather than a shell string, so it works identically on Windows,
 * macOS, and Linux.
 *
 * Run with:  npm run db:seed
 */
const { execFileSync } = require('child_process');
const path = require('path');

const isWin  = process.platform === 'win32';
const apiDir = path.resolve(__dirname, '..', 'apps', 'api');
const binDir = isWin ? path.join(apiDir, 'venv', 'Scripts') : path.join(apiDir, 'venv', 'bin');
const python = path.join(binDir, isWin ? 'python.exe' : 'python');

try {
  execFileSync(
    python,
    [
      '-c',
      [
        'from app.seed import seed_database',
        'from app.database import SessionLocal',
        'db = SessionLocal()',
        'seed_database(db)',
      ].join('; '),
    ],
    { stdio: 'inherit', cwd: apiDir },
  );
} catch (err) {
  process.exit(err.status ?? 1);
}
