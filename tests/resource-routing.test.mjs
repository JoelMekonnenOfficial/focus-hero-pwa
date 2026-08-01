import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = name => fs.readFileSync(path.join(ROOT, name), "utf8");

test("resource names expose one unambiguous earn/use route without changing storage keys", () => {
  const economy = read("focus-economy.js");
  const forge = read("loot-rework.js");
  const shop = read("shop-rework.js");
  const hub = read("progression-hub.js");

  assert.match(economy, /1 Orb per 25m/);
  assert.match(economy, /8 Arcane Dust \+ 1 Forge Shard/);
  assert.match(economy, /Only choosing Fight starts encounters/);
  assert.match(economy, /data-fhe-open="challenges"/);
  assert.match(economy, /data-fhe-open="forge"/);

  assert.match(forge, /Arcane Dust/);
  assert.match(forge, /Forge Shards/);
  assert.match(forge, /Forge resources are separate from World Shards/);
  assert.doesNotMatch(forge, /mat-name">Crystal Shards/);

  assert.match(shop, /var dust = forgeMaterials\.dust \| 0/);
  assert.match(shop, /World Shards/);
  assert.match(shop, /Arcane Dust/);
  assert.match(shop, /legacy Crafting Dust is preserved separately/);
  assert.doesNotMatch(hub, /Crystal Shards/);
});

test("mirrored entry files keep the organized target, combat, Forge, and trophy copy", () => {
  const index = read("index.html");
  const mirror = read("focus-hero.html");
  assert.equal(index, mirror);
  assert.match(index, /First Light Standard/);
  assert.match(index, /Bearer of the First Thousand/);
  assert.match(index, /automatic XP \+ loot/);
  assert.doesNotMatch(index, /Choose your session path|Only Fight starts combat/);
  assert.match(index, /Upgrade spends <b>Forge Shards<\/b>/);
});
