import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = fs.readFileSync(path.join(ROOT, "focus-hero.html"), "utf8");
const pixel = fs.readFileSync(path.join(ROOT, "pixel-avatar.js"), "utf8");

function between(source, start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  assert.ok(from >= 0 && to > from, "missing source boundary: " + start);
  return source.slice(from, to);
}

test("avatar renderer remains presentation-only", () => {
  for (const forbidden of [
    /localStorage/, /sessionStorage/, /indexedDB/, /document\.cookie/, /fetch\s*\(/,
    /XMLHttpRequest/, /WebSocket/, /caches\./, /syncCode/i, /cloudSave/i, /playerData/i
  ]) assert.doesNotMatch(pixel, forbidden);
});

test("all avatar render paths use non-mutating readers", () => {
  const adapter = between(html, "function avatarVisualSpec(opts={}){", "function legacyAvatarFallbackSvg(opts={}){");
  assert.match(adapter, /readHeroAppearance\(\)/);
  assert.match(adapter, /readHeroEquipped\(\)/);
  assert.doesNotMatch(adapter, /ensureHeroAppearanceShape|ensureEquippedShape|saveState\(|localStorage/);

  const panel = between(html, "function renderCharacterPanel(){", "function renderAppearanceControls(){");
  const controls = between(html, "function renderAppearanceControls(){", "function setHeroAppearance(group, value){");
  const picker = between(html, "function renderEquipmentPicker(){", "function applyDesignVariant(){");
  assert.doesNotMatch(panel + controls + picker, /ensureHeroAppearanceShape|ensureEquippedShape/);
});

test("the live avatar selector matches the active renderer metadata", () => {
  assert.match(html, /\.hero-card \.avatar\[data-avatar-version="pixel-v1"\]/);
  assert.doesNotMatch(html, /\.hero-card \.avatar\[data-avatar-version="v98"\]/);
});

test("customization work does not embed recovery, cloud, or deployment controls in the renderer", () => {
  assert.doesNotMatch(pixel, /restore|rollback|deploy|credential|token|backup|vault/i);
});
