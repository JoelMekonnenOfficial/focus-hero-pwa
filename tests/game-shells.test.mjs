import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";

const source = await fs.readFile(new URL("../game-shells.js", import.meta.url), "utf8");

function loadApi() {
  const sandbox = {
    window: {},
    console: { warn() {} }
  };
  vm.runInNewContext(source, sandbox, { filename: "game-shells.js" });
  return sandbox.window.FHGameShells;
}

test("four genuinely different game shells share one presentation-only API", () => {
  const api = loadApi();
  assert.ok(api);
  assert.deepEqual(
    Array.from(Object.keys(api.shells)),
    ["arcane", "frontier", "tactical", "classic"]
  );
  assert.equal(api.defaultShell, "classic");
  assert.equal(api.normalizeShell("frontier"), "frontier");
  assert.equal(api.normalizeShell("not-a-shell"), "classic");

  const attributes = new Map();
  const root = {
    setAttribute(name, value) {
      attributes.set(name, value);
    }
  };
  assert.equal(api.applyToRoot(root, "tactical"), "tactical");
  assert.equal(attributes.get("data-game-shell"), "tactical");
  assert.equal(attributes.get("data-game-shell-label"), "Tactical Ops");
});

test("shells materially change chrome, panels, navigation, typography, and texture", () => {
  const api = loadApi();
  const css = api.styleText;

  for (const shell of ["arcane", "frontier", "tactical"]) {
    assert.match(css, new RegExp(`data-game-shell="${shell}"`));
  }

  assert.match(css, /ARCANE PATH/);
  assert.match(css, /FIELD WORKBENCH/);
  assert.match(css, /OPS \/\/ SYSTEM READY/);
  assert.match(css, /html\[data-game-shell="frontier"\] \.app-nav[\s\S]*flex-direction:column/);
  assert.match(css, /html\[data-game-shell="tactical"\] \.app-nav[\s\S]*flex-direction:column/);
  assert.match(
    css,
    /html\[data-game-shell="frontier"\] \.app-nav,\s*html\[data-game-shell="tactical"\] \.app-nav\{\s*display:flex!important;\s*position:fixed!important;/
  );
  assert.match(css, /font-family:Georgia/);
  assert.match(css, /font-family:"Trebuchet MS"/);
  assert.match(css, /font-family:Bahnschrift/);
  assert.match(css, /repeating-linear-gradient/);
  assert.match(css, /clip-path:polygon/);
  assert.match(css, /@media \(prefers-reduced-motion:reduce\)/);
  assert.match(css, /@media \(max-width:720px\)/);
});

test("chooser is accessible and persists only the display preference", () => {
  assert.match(source, /document\.createElement\("fieldset"\)/);
  assert.match(source, /legend\.textContent = "Game presentation"/);
  assert.match(source, /input\.type = "radio"/);
  assert.match(source, /options\.setAttribute\("role", "radiogroup"\)/);
  assert.match(source, /aria-live/);
  assert.match(source, /state\.settings\.gameShell/);
  assert.match(source, /presentationOnly: true/);

  assert.doesNotMatch(source, /\blocalStorage\b/);
  assert.doesNotMatch(source, /\bindexedDB\b/);
  assert.doesNotMatch(source, /\bfetch\s*\(/);
  assert.doesNotMatch(source, /state\.(?:hero|loot|world|history|sessionsLog|totalFocusMin|coins)/);
});
