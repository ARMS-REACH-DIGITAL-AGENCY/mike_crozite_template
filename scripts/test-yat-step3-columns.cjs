// YAT ID key transition, step 3 (docs/yat-key-transition.md): every live
// table gets a YAT ID column that is filled, indexed and kept current by a
// trigger, and the undo file removes each one. Fails the build if a table is
// half-done or the undo is missing.
const fs = require("fs");
const path = require("path");
const assert = require("assert");
const dir = path.join(__dirname, "..", "migrations");
const up = fs.readFileSync(path.join(dir, "20261118_yat_step3_yatid_columns.sql"), "utf8");
const down = fs.readFileSync(path.join(dir, "20261118_yat_step3_yatid_columns_down.sql"), "utf8");
const tables = [...up.matchAll(/^ALTER TABLE public\.(\w+) ADD COLUMN/gm)].map((m) => m[1]);
assert(tables.length >= 44, `expected 44 tables, found ${tables.length}`);
for (const t of tables) {
  assert(new RegExp(`UPDATE public\\.${t} SET \\w*yatid\\w* = public\\.yat_id_for`).test(up), `${t}: no fill`);
  assert(new RegExp(`ON public\\.${t}\\(\\w*yatid\\w*\\)`).test(up), `${t}: no index`);
  assert(new RegExp(`CREATE TRIGGER trg_${t}_yatid `).test(up), `${t}: no trigger`);
  assert(new RegExp(`DROP TRIGGER IF EXISTS trg_${t}_yatid ON public\\.${t};\\nALTER TABLE public\\.${t} DROP COLUMN`).test(down), `${t}: undo missing`);
}
assert(/CREATE OR REPLACE FUNCTION public\.yat_id_for\(p text\)/.test(up), "resolver missing");
console.log(`yat step 3 OK: ${tables.length} tables`);
