import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const focus = fs.readFileSync(path.join(ROOT, "focus-hero.html"), "utf8");
const index = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");

function between(source, start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  assert.ok(from >= 0 && to > from, "missing source boundary: " + start);
  return source.slice(from, to);
}

function loadAppearanceHelpers() {
  const context = vm.createContext({
    DEFAULTS: { hero: { appearance: {
      visualStyle:"compact_cozy", hairStyle:"legacy", skinTone:"warm", bodyStyle:"compact", faceShape:"oval",
      armor:"steel", accent:"gold", helm:"closed", cloak:"royal", race:"human", body:"balanced", skin:"warm", hair:"short",
      hairColor:"espresso", eyeShape:"focused", eyeColor:"azure", face:"calm"
    } } },
    deepClone: value => JSON.parse(JSON.stringify(value)),
    state: { hero: {} }
  });
  const catalogs = between(focus, "const APPEARANCE_OPTIONS = {", "const GEAR_EFFECTS = {");
  const helpers = between(focus, "function appearanceOption(group, id){", "function ensureHeroCosmeticsShape");
  vm.runInContext(catalogs + "\nthis.catalogs = APPEARANCE_OPTIONS;", context);
  vm.runInContext(helpers + "\nthis.normalize = normalizedHeroAppearance; this.readAppearance = readHeroAppearance; this.ensureAppearance = ensureHeroAppearanceShape;", context);
  return context;
}

test("the two app entrypoints remain byte-identical", () => {
  assert.equal(focus, index);
});

test("diverse customization catalogs are modular and independent", () => {
  const { catalogs } = loadAppearanceHelpers();
  assert.deepEqual(Array.from(catalogs.visualStyle, option => option.id), [
    "compact_cozy", "quest_classic", "arcade_guardian", "vanguard_heavy"
  ]);
  for (const id of ["porcelain","fair","light","warm","golden","bronze","chestnut","umber","deep","ebony"]) {
    assert.ok(catalogs.skinTone.some(option => option.id === id), "missing skin tone " + id);
  }
  for (const id of ["short","buzz","crop","wavy","curly","braids","ponytail","topknot","long_straight","long_curly","mohawk","spiked","bald","dreadlocks","low_fade","high_fade","taper_fade","waves_360","short_afro","full_afro","coils","two_strand_twists","short_locs","long_locs","cornrows","box_braids","bantu_knots"]) {
    assert.ok(catalogs.hairStyle.some(option => option.id === id), "missing hairstyle " + id);
  }
  assert.deepEqual(Array.from(catalogs.bodyStyle, option => option.id), ["legacy","compact","lean","balanced","broad","round"]);
  assert.deepEqual(Array.from(catalogs.faceShape, option => option.id), ["oval","round","square","heart","long","angular","diamond"]);
});

test("legacy appearances migrate without losing hairstyle, tone, or unknown future fields", () => {
  const context = loadAppearanceHelpers();
  for (const legacyHair of ["wavy", "dreadlocks", "long", "shaved"]) {
    const legacy = { hair:legacyHair, skinIdx:3, body:"broad", customFutureField:"keep-me" };
    const normalized = context.normalize(legacy, true);
    assert.equal(normalized.hair, legacyHair);
    assert.equal(normalized.hairStyle, "legacy");
    assert.equal(normalized.skinTone, "species");
    assert.equal(normalized.bodyStyle, "legacy");
    assert.equal(normalized.customFutureField, "keep-me");
  }
});

test("new profiles get inclusive defaults while read-only normalization never mutates source", () => {
  const context = loadAppearanceHelpers();
  const fresh = context.normalize(null, false);
  assert.equal(fresh.visualStyle, "compact_cozy");
  assert.equal(fresh.skinTone, "warm");
  assert.equal(fresh.bodyStyle, "compact");

  const source = { hair:"curly", skinIdx:2, extra:{ nested:true } };
  const before = JSON.stringify(source);
  const read = context.readAppearance({ appearance:source });
  assert.equal(JSON.stringify(source), before);
  assert.notEqual(read, source);
  assert.equal(read.hair, "curly");
  assert.equal(read.skinTone, "species");
});

test("Character Studio exposes only the additive override controls", () => {
  const renderControls = between(focus, "function renderAppearanceControls(){", "function setHeroAppearance(group, value){");
  assert.match(renderControls, /groups:\["visualStyle"\]/);
  assert.match(renderControls, /groups:\["race","bodyStyle","skinTone","faceShape","face"\]/);
  assert.match(renderControls, /groups:\["hairStyle","hairColor","eyeShape","eyeColor"\]/);
  assert.doesNotMatch(renderControls, /groups:\["race","body","skin","face"\]/);
  assert.doesNotMatch(renderControls, /groups:\["hair","hairColor"/);
});
