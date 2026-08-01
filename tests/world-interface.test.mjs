import assert from "node:assert/strict";
import fs from "node:fs/promises";

const source = await fs.readFile(new URL("../progression-hub.js", import.meta.url), "utf8");

assert.match(source, /class="world-command"/);
assert.match(source, /class="world-command-hero"/);
assert.match(source, /class="world-route"/);
assert.match(source, /data-zone-preview=/);
assert.match(source, /Fight roster/);
assert.match(source, /Regional boss/);
assert.match(source, /Mount families/);
assert.match(source, /Loot signals/);
assert.match(source, /Only the explicit Fight action activates combat/);
assert.match(source, /every other action remain peaceful/);
assert.doesNotMatch(source, /Fight and Hunt encounters happen/);
assert.match(source, /Set as Fight zone/);
assert.match(source, /worldPreviewZone = change\.dataset\.zoneSwitch/);

console.log("ok - World presents a previewable route, honest Fight-only rules, and useful zone intelligence");
