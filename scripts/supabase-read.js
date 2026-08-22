#!/usr/bin/env node
// ─── Read-only Supabase query helper ───────────────────────────────────────
//
// Why this exists: Claude Code sessions repeatedly need to see the LIVE state
// of the database (which collections actually exist, whether a column is
// populated, how many rows a table really has) before proposing a migration.
// Several past migrations in supabase/migrations/ cite exactly this — "verified
// live via the REST API" — but there was no committed, repeatable way to do it,
// so every new chat had to re-improvise one and re-request permission.
//
// Two deliberate properties:
//
//   1. READ-ONLY BY CONSTRUCTION. This script only ever issues GET. There is no
//      code path here that can POST/PATCH/DELETE, so granting Claude permission
//      to run it is not granting permission to write to the database. That
//      matters because TCC's RLS policies are all `FOR ALL USING (true)` —
//      the anon key CAN write, and the project's standing rule is that no
//      durable write happens without human approval. Migrations still go to
//      Kristen to run by hand in the SQL Editor; nothing here changes that.
//
//   2. CREDENTIALS STAY IN .env. This script reads VITE_SUPABASE_URL and
//      VITE_SUPABASE_ANON_KEY itself. They are never pasted into a chat and
//      never appear in Claude's context — only query RESULTS do.
//
// Usage:
//   node scripts/supabase-read.js --columns collections
//       Show one table's columns, inferred from a sample row.
//
//   node scripts/supabase-read.js --probe collections sparks keywords
//       For each named table: does it exist, and how many rows does it have.
//
//   node scripts/supabase-read.js "collections?select=name,chapter,status&order=name"
//       Any PostgREST query string. Full syntax:
//       https://postgrest.org/en/stable/references/api/tables_views.html
//
//   node scripts/supabase-read.js "products?select=*&limit=3" --count
//       --count adds an exact row count for the (unlimited) query.
//
// Note on the anon key: it is the client-exposed key already bundled into every
// production build of this app. It is not a secret. It is still subject to RLS.

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

// Walk up from scripts/ looking for an env file. .env.local wins over .env,
// matching Vite's own precedence, so a worktree-local override behaves here
// exactly like it does in the dev server.
function loadEnv() {
  let dir = resolve(HERE, '..');
  for (let i = 0; i < 5; i++) {
    for (const name of ['.env.local', '.env']) {
      const path = join(dir, name);
      if (!existsSync(path)) continue;
      const vars = {};
      for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/i);
        if (!m) continue;
        vars[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
      }
      if (vars.VITE_SUPABASE_URL && vars.VITE_SUPABASE_ANON_KEY) {
        return { ...vars, _from: path };
      }
    }
    dir = resolve(dir, '..');
  }
  return null;
}

const env = loadEnv();
if (!env) {
  console.error('Could not find VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY in any .env or .env.local walking up from scripts/.');
  process.exit(1);
}

const BASE = env.VITE_SUPABASE_URL.replace(/\/+$/, '');
const KEY = env.VITE_SUPABASE_ANON_KEY;

// The ONLY request function in this file. GET is hardcoded, not a parameter.
// Returns ok:false rather than exiting, so callers that probe many tables
// aren't killed by the first 404.
async function get(path, extraHeaders = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'GET',
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, ...extraHeaders },
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, statusText: res.statusText, text, headers: res.headers };
}

// NOTE: PostgREST's OpenAPI document at the API root (/rest/v1/) would give
// full column types for every table in one call, but Supabase now rejects that
// endpoint for anon/publishable keys ("Secret API key required"). Confirmed
// live 2026-08-21. So column discovery here samples one real row and reads its
// keys instead. The tradeoff is real and worth knowing: a column that is NULL
// in the sampled row still appears (PostgREST returns every column as a JSON
// key regardless of value), but a table with ZERO rows yields nothing at all,
// and JSON gives no SQL types. For authoritative types, read the migration
// files in supabase/migrations/ — this is for "what's actually there right now".
async function sampleColumns(table) {
  const { ok, text, status, statusText } = await get(`/rest/v1/${table}?select=*&limit=1`);
  if (!ok) return { error: `HTTP ${status} ${statusText}: ${text}` };
  const rows = JSON.parse(text);
  if (!rows.length) return { empty: true };
  return { columns: Object.entries(rows[0]).map(([k, v]) => ({ column: k, sample: v })) };
}

function describeSample(v) {
  if (v === null) return 'null in sampled row';
  if (Array.isArray(v)) return `array (${v.length})`;
  if (typeof v === 'object') return 'json';
  const s = String(v);
  return s.length > 48 ? `${typeof v}: ${s.slice(0, 48)}…` : `${typeof v}: ${s}`;
}

const args = process.argv.slice(2);
const wantCount = args.includes('--count');
const positional = args.filter(a => !a.startsWith('--'));

if (args.includes('--columns')) {
  const table = positional[0];
  if (!table) { console.error('Usage: --columns <table>'); process.exitCode = 1; }
  else {
    const r = await sampleColumns(table);
    if (r.error) { console.error(r.error); process.exitCode = 1; }
    else if (r.empty) console.log(`${table} exists but has 0 rows — no columns can be sampled. See supabase/migrations/ for its definition.`);
    else {
      console.log(`${table}  (${r.columns.length} columns, inferred from one sampled row)\n`);
      for (const c of r.columns) console.log(`  ${c.column.padEnd(34)} ${describeSample(c.sample)}`);
    }
  }
}

else if (args.includes('--probe')) {
  if (!positional.length) { console.error('Usage: --probe <table> [table...]'); process.exitCode = 1; }
  for (const table of positional) {
    const { ok, status, headers, text } = await get(`/rest/v1/${table}?select=*&limit=0`, { Prefer: 'count=exact' });
    if (!ok) { console.log(`${table.padEnd(34)} MISSING (HTTP ${status}) ${text.slice(0, 80)}`); continue; }
    console.log(`${table.padEnd(34)} ${(headers.get('content-range') || '?').split('/')[1]} rows`);
  }
}

else {

  const query = positional[0];
  if (!query) {
    console.error('Usage:\n  node scripts/supabase-read.js --columns <table>\n  node scripts/supabase-read.js --probe <table> [table...]\n  node scripts/supabase-read.js "<postgrest query>" [--count]');
    process.exitCode = 1;
  } else {
    const { ok, status, statusText, text, headers } = await get(
      `/rest/v1/${query.replace(/^\/+/, '')}`,
      wantCount ? { Prefer: 'count=exact' } : {},
    );
    if (!ok) {
      console.error(`HTTP ${status} ${statusText}\n${text}`);
      process.exitCode = 1;
    } else {
      try { console.log(JSON.stringify(JSON.parse(text), null, 2)); }
      catch { console.log(text); }
      const range = wantCount && headers.get('content-range');
      if (range) console.log(`\n-- total rows matching (ignoring limit): ${range.split('/')[1]}`);
    }
  }
}
