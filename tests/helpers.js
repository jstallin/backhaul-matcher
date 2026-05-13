// Shared test helpers — imported by spec files to keep path handling consistent.

import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// TEST_BASE_URL should be the full URL to the app, e.g.:
//   https://haulmonitor.cloud/app   (production)
//   http://localhost:5173/app.html  (local dev — the default)
const TEST_BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:5173/app.html';

const parsed = new URL(TEST_BASE_URL);

export const origin = parsed.origin;                          // e.g. https://haulmonitor.cloud
export const appPath = parsed.pathname;                       // e.g. /app or /app.html
export const resetPath = `${parsed.origin}/reset-password`;  // always at domain root

// Path to saved auth storage state — defined here so spec files never need to
// import from auth.setup.js (Playwright forbids test files importing setup files).
export const STORAGE_STATE = path.join(__dirname, '.auth/user.json');
