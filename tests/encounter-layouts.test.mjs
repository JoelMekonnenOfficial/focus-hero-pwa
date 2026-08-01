import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const index = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const mirror = fs.readFileSync(path.join(ROOT, "focus-hero.html"), "utf8");

test("all four encounter presentation choices are visible and mirrored", () => {
  assert.equal(index, mirror);
  const controls = [...index.matchAll(/data-encounter-layout="(hidden|status|journey|minimal)"/g)].map(match => match[1]);
  assert.deepEqual(new Set(controls), new Set(["hidden", "status", "journey", "minimal"]));
  assert.match(index, /data-encounter-layout="hidden"[^>]*>[\s\S]*?No permanent card/);
  assert.match(index, /data-encounter-layout="status"[^>]*>[\s\S]*?Status ribbon/);
  assert.match(index, /data-encounter-layout="journey"[^>]*>[\s\S]*?Journey strip/);
  assert.match(index, /data-encounter-layout="minimal"[^>]*>[\s\S]*?Text pulse/);
});

test("status ribbon is compact and removes permanent character art", () => {
  assert.match(index, /\.encounter-stage\[data-layout="status"\][^{]*\{[^}]*border-radius:999px/);
  assert.match(index, /\.encounter-stage\[data-layout="status"\] \.arena-model,[\s\S]*?\.encounter-stage\[data-layout="status"\] \.arena-caption\{display:none\}/);
  assert.match(index, /\.encounter-stage\[data-layout="status"\] \.arena-row\{[^}]*grid-template-columns:minmax\(0,1fr\) 30px minmax\(0,1fr\)/);
});

test("journey strip has its own route, compact models, and directional renderer", () => {
  assert.match(index, /\.encounter-stage\[data-layout="journey"\]::before\{[^}]*repeating-linear-gradient/);
  assert.match(index, /animation:fhJourneyRoute/);
  assert.match(index, /\.encounter-stage\[data-layout="journey"\] \.arena-model\{width:52px;height:52px\}/);
  assert.match(index, /vs\.textContent = layout === "journey" \? "→"/);
  assert.match(index, /"Progressing toward objective"/);
});

test("text pulse is text-only and hidden remains genuinely hidden", () => {
  assert.match(index, /\.encounter-stage\[data-layout="minimal"\] \.arena-row\{display:none\}/);
  assert.match(index, /\.encounter-stage\[data-layout="minimal"\] \.arena-caption::before\{[^}]*animation:fhTextPulse/);
  assert.match(index, /if \(layout === "minimal"\)\{[\s\S]*?caption\.textContent = running/);
  assert.match(index, /const allowedLayouts = \["hidden","status","journey","minimal"\]/);
  assert.match(index, /stage\.hidden = layout === "hidden"/);
  assert.match(index, /layout === "hidden" \? "Session visual hidden"/);
});
