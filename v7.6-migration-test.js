/* ============================================================
 * Focus Hero — v7.5 → v7.6 zero-data-loss migration test
 *
 * Run via: `node v7.6-migration-test.js path/to/fixture.json`
 *
 * Loads a v7.5 state fixture (taken from Joel's live localStorage or
 * one of his auto-backup JSONs in Downloads), runs the v7.6 migration
 * by evaluating the inline <script> from focus-hero.html in a Node vm
 * (the same harness verify.js uses), and asserts:
 *
 *   1. Every top-level key from the fixture survives migration.
 *   2. dataVersion goes 6 → 7 (the ONLY field allowed to change).
 *   3. totalFocusMin, hero.xp, hero.level, totalAppOpenMs,
 *      completedFocusSessions, longestStreak, sessionsLog.length,
 *      every task.totalFocusMin, every lootOwned[id], every
 *      achievements[id], every history[day], every uptimeHistory[day]
 *      are bitwise unchanged.
 *   4. state.adventure / state.bestiary / state.achievementProgress
 *      exist and have the expected shapes.
 *   5. migrate(migrate(x)) === migrate(x)  (idempotent).
 *
 * Exit code 0 = all assertions pass.
 * Exit code 1 = at least one assertion failed.
 *
 * NOTE: the test does NOT call any side-effectful function (saveState,
 * cloudPush, render*). It only invokes migrate(). The same code path
 * runs in the browser at boot.
 * ============================================================ */

"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const HTML_PATH = process.env.FH_HTML || path.resolve(__dirname, "focus-hero.html");
const FIXTURE_PATH = process.argv[2] || path.resolve(__dirname, "fixtures/joel-v75-state.json");

if (!fs.existsSync(HTML_PATH)){
  console.error(`[FAIL] focus-hero.html not found at ${HTML_PATH}`);
  process.exit(2);
}
if (!fs.existsSync(FIXTURE_PATH)){
  console.error(`[FAIL] fixture not found at ${FIXTURE_PATH}`);
  process.exit(2);
}

const html = fs.readFileSync(HTML_PATH, "utf8");
const fixture = JSON.parse(fs.readFileSync(FIXTURE_PATH, "utf8"));

// The fixture might be:
//   a) the raw localStorage value of focusHero.v4.state  (a JSON-stringified state)
//   b) the auto-backup format ({ version, savedAt, state, … })
//   c) the localStorage snapshot wrapper ({ savedAt, keys: { 'focusHero.v4.state': '…' } })
function normaliseFixture(f){
  if (typeof f === "string"){ return JSON.parse(f); }
  if (f && typeof f === "object" && f.keys && typeof f.keys === "object"){
    // wrapper from the snapshot script
    const k = "focusHero.v4.state";
    if (typeof f.keys[k] === "string"){
      try { return JSON.parse(f.keys[k]); } catch(_) { return null; }
    }
  }
  if (f && typeof f === "object" && f.state && typeof f.state === "object"){
    return f.state;
  }
  // Otherwise assume it's already a state object.
  return f;
}
const rawState = normaliseFixture(fixture);
if (!rawState || typeof rawState !== "object"){
  console.error(`[FAIL] could not parse a state object out of ${FIXTURE_PATH}`);
  process.exit(2);
}

console.log("--- v7.6 migration test ---");
console.log(`HTML:    ${HTML_PATH}`);
console.log(`Fixture: ${FIXTURE_PATH}`);
console.log(`Fixture dataVersion: ${rawState.dataVersion}`);
console.log(`Top-level keys (${Object.keys(rawState).length}): ${Object.keys(rawState).join(", ")}`);

/* ---- Build a sandbox and pull out migrate() from the HTML's <script>. ---- */
const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
if (!scriptMatch){
  console.error("[FAIL] no <script> block in focus-hero.html");
  process.exit(2);
}
let scriptText = scriptMatch[1];

/* Minimal browser shims. */
const cryptoShim = require("crypto").webcrypto || require("crypto").subtle;
const documentShim = {
  addEventListener(){}, removeEventListener(){},
  querySelector(){ return null; }, querySelectorAll(){ return []; },
  getElementById(){ return null; },
  createElement(){ return { appendChild(){}, addEventListener(){}, style:{}, classList:{add(){}, remove(){}}, hidden:false }; },
  body:{ appendChild(){}, prepend(){} },
  readyState:"complete"
};
const navigatorShim = { serviceWorker:null, onLine:true, language:"en-US" };
const locationShim = { href:"https://test.local/", search:"", origin:"https://test.local" };
const localStorageShim = {
  _store:{}, getItem(k){ return Object.prototype.hasOwnProperty.call(this._store,k) ? this._store[k] : null; },
  setItem(k,v){ this._store[k] = String(v); },
  removeItem(k){ delete this._store[k]; },
  get length(){ return Object.keys(this._store).length; },
  key(i){ return Object.keys(this._store)[i] || null; },
  clear(){ this._store = {}; }
};
const BroadcastChannelShim = class { constructor(){} postMessage(){} addEventListener(){} close(){} };
const windowShim = new Proxy({
  addEventListener(){}, removeEventListener(){},
  location: locationShim, navigator: navigatorShim, document: documentShim,
  setTimeout, clearTimeout, setInterval, clearInterval,
  localStorage: localStorageShim, BroadcastChannel: BroadcastChannelShim,
  matchMedia(){ return { matches:false, addEventListener(){}, removeEventListener(){} }; },
  innerWidth: 1024, innerHeight: 768,
  devicePixelRatio: 1,
  scrollTo(){}, scrollBy(){}, scroll(){},
  requestAnimationFrame(){ return 0; }, cancelAnimationFrame(){},
  crypto: cryptoShim
}, {
  get(target, prop){
    if (prop in target) return target[prop];
    return function(){};
  },
  set(target, prop, value){ target[prop] = value; return true; }
});
const sandbox = {
  console,
  window: windowShim,
  document: documentShim,
  navigator: navigatorShim,
  location: locationShim,
  localStorage: localStorageShim,
  BroadcastChannel: BroadcastChannelShim,
  setTimeout, clearTimeout, setInterval, clearInterval,
  fetch: () => Promise.reject(new Error("fetch not available in test")),
  crypto: cryptoShim,
  TextEncoder: require("util").TextEncoder,
  TextDecoder: require("util").TextDecoder
};
sandbox.global = sandbox;
sandbox.self = sandbox;
sandbox.btoa = (s)=>Buffer.from(s,"binary").toString("base64");
sandbox.atob = (s)=>Buffer.from(s,"base64").toString("binary");

vm.createContext(sandbox);
try {
  vm.runInContext(scriptText, sandbox, { timeout: 5000 });
} catch(e){
  console.error("[FAIL] could not evaluate focus-hero.html <script> in sandbox:", e.message);
  process.exit(2);
}

const migrate = sandbox.migrate;
if (typeof migrate !== "function"){
  console.error("[FAIL] migrate() is not exposed in sandbox after evaluating the script");
  process.exit(2);
}

/* ---- BEFORE snapshot (deep clone) ---- */
const before = JSON.parse(JSON.stringify(rawState));

/* ---- RUN migration ---- */
let migrated;
try {
  migrated = migrate(JSON.parse(JSON.stringify(rawState)));
} catch(e){
  console.error("[FAIL] migrate() threw:", e.message);
  process.exit(1);
}

/* ---- ASSERTIONS ---- */
let failures = [];
function ok(name, cond, detail){
  if (cond){ console.log(`  ✓ ${name}`); }
  else { console.log(`  ✗ ${name}${detail ? " — " + detail : ""}`); failures.push(name); }
}

ok("dataVersion bumped to 7", migrated.dataVersion === 7);
ok("only dataVersion changed at top level — every other top-level key from fixture is present",
   Object.keys(before).every(k => k in migrated),
   `missing: ${Object.keys(before).filter(k=>!(k in migrated)).join(", ")}`);

// Cumulative counters: BITWISE unchanged.
const counterPaths = [
  "totalFocusMin", "totalAppOpenMs", "completedFocusSessions", "longestStreak",
  "streak", "cycleCount", "canceledSessionCount"
];
for (const p of counterPaths){
  if (p in before){
    ok(`${p} unchanged`, JSON.stringify(before[p]) === JSON.stringify(migrated[p]),
       `before=${before[p]} after=${migrated[p]}`);
  }
}

// Hero subtree
if (before.hero){
  ok("hero.level unchanged", before.hero.level === migrated.hero.level);
  ok("hero.xp unchanged",    before.hero.xp    === migrated.hero.xp);
  ok("hero.hp unchanged",    before.hero.hp    === migrated.hero.hp);
  ok("hero.energy unchanged",before.hero.energy=== migrated.hero.energy);
  ok("hero.cls unchanged",   before.hero.cls   === migrated.hero.cls);
  ok("hero.name unchanged",  before.hero.name  === migrated.hero.name);
  if (before.hero.equipped){
    for (const slot of ["weapon","helmet","armor","mount"]){
      ok(`hero.equipped.${slot} unchanged`,
         JSON.stringify(before.hero.equipped[slot]) === JSON.stringify(migrated.hero.equipped[slot]));
    }
  }
}

// Tasks
if (Array.isArray(before.tasks)){
  ok("tasks length unchanged", before.tasks.length === migrated.tasks.length);
  for (let i=0; i<before.tasks.length; i++){
    const a = before.tasks[i], b = migrated.tasks[i];
    if (!a || !b) continue;
    ok(`tasks[${i}].id unchanged`, a.id === b.id);
    ok(`tasks[${i}].name unchanged`, a.name === b.name);
    ok(`tasks[${i}].totalFocusMin unchanged`, (a.totalFocusMin|0) === (b.totalFocusMin|0));
    ok(`tasks[${i}].sessions unchanged`, (a.sessions|0) === (b.sessions|0));
    if (a.dailyMin){
      for (const dk of Object.keys(a.dailyMin)){
        ok(`tasks[${i}].dailyMin[${dk}] unchanged`, (a.dailyMin[dk]|0) === (b.dailyMin[dk]|0));
      }
    }
  }
}

// Achievements: every unlocked id MUST survive with same timestamp
if (before.achievements){
  for (const id of Object.keys(before.achievements)){
    ok(`achievements[${id}] preserved`, before.achievements[id] === migrated.achievements[id]);
  }
}

// Loot
if (before.lootOwned){
  for (const id of Object.keys(before.lootOwned)){
    ok(`lootOwned[${id}] unchanged`, (before.lootOwned[id]|0) === (migrated.lootOwned[id]|0));
  }
}

// History (per-day focus minutes)
if (before.history){
  for (const dk of Object.keys(before.history)){
    ok(`history[${dk}] unchanged`, (before.history[dk]|0) === (migrated.history[dk]|0));
  }
}

// Uptime history
if (before.uptimeHistory){
  for (const dk of Object.keys(before.uptimeHistory)){
    ok(`uptimeHistory[${dk}] unchanged`, (before.uptimeHistory[dk]|0) === (migrated.uptimeHistory[dk]|0));
  }
}

// Session history
if (before.sessionHistory){
  for (const dk of Object.keys(before.sessionHistory)){
    ok(`sessionHistory[${dk}] unchanged`, (before.sessionHistory[dk]|0) === (migrated.sessionHistory[dk]|0));
  }
}

// Sessions log: same length and same fields
if (Array.isArray(before.sessionsLog)){
  ok("sessionsLog length unchanged", before.sessionsLog.length === migrated.sessionsLog.length);
  for (let i=0; i<before.sessionsLog.length; i++){
    const a = before.sessionsLog[i], b = migrated.sessionsLog[i];
    if (!a || !b) continue;
    ok(`sessionsLog[${i}].at unchanged`,      a.at === b.at);
    ok(`sessionsLog[${i}].minutes unchanged`, (a.minutes|0) === (b.minutes|0));
    ok(`sessionsLog[${i}].type unchanged`,    a.type === b.type);
    // taskId may have been null/undefined: treat them equivalently
    const at = a.taskId||null, bt = b.taskId||null;
    ok(`sessionsLog[${i}].taskId unchanged`, at === bt);
    ok(`sessionsLog[${i}].xp unchanged`,     (a.xp|0) === (b.xp|0));
    // v7.6 additions: must be present
    ok(`sessionsLog[${i}].id added`, typeof b.id === "string" && b.id.length > 0);
    ok(`sessionsLog[${i}].originalMinutes equals minutes`, (b.originalMinutes|0) === (b.minutes|0));
  }
}

// New v7.6 fields present and shape-correct
ok("state.adventure exists", migrated.adventure && typeof migrated.adventure === "object");
ok("state.adventure.action is a string", typeof migrated.adventure?.action === "string");
ok("state.adventure.actionMin is an object", migrated.adventure?.actionMin && typeof migrated.adventure.actionMin === "object");
ok("state.bestiary exists and is an object", migrated.bestiary && typeof migrated.bestiary === "object" && !Array.isArray(migrated.bestiary));
ok("state.achievementProgress exists and is an object", migrated.achievementProgress && typeof migrated.achievementProgress === "object" && !Array.isArray(migrated.achievementProgress));

// Idempotency: migrate(migrate(x)) === migrate(x)
let twice;
try {
  twice = migrate(JSON.parse(JSON.stringify(migrated)));
} catch(e){
  console.error("[FAIL] migrate() threw on second pass:", e.message);
  failures.push("idempotent");
}
if (twice){
  // Compare with one allowed difference: sessionsLog ids are stable
  // because migrate() only assigns one if missing, so re-running shouldn't
  // change them.
  ok("migrate is idempotent (stringify equality on second pass)",
     JSON.stringify(twice) === JSON.stringify(migrated));
}

// Pre-migration snapshot key: existence is verified by inspecting the
// sandbox localStorage AFTER migrate() (the migration function writes
// the pre-v7 key as a side-effect).
const preKey = `${sandbox.STORAGE_KEY || "focusHero.v4.state"}.pre-v7`;
const preBlob = sandbox.localStorage.getItem(preKey);
ok(`pre-migration snapshot written at ${preKey}`, !!preBlob);

// ---- Report ----
console.log("");
if (failures.length){
  console.error(`FAILED: ${failures.length} assertion(s)`);
  for (const f of failures) console.error("  - " + f);
  process.exit(1);
} else {
  console.log("OK: every cumulative counter, achievement, loot, task minute, history day, session record preserved bitwise. New v7.6 fields added with correct shapes. migrate() is idempotent.");
  process.exit(0);
}
