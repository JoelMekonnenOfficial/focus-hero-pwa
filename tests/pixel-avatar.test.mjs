import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = fs.readFileSync(path.join(ROOT, "pixel-avatar.js"), "utf8");
const PRESETS = [
  "compact_cozy", "quest_classic", "arcade_guardian", "vanguard_heavy"
];
const HAIR_IDS = [
  "short", "buzz", "crop", "wavy", "curly", "coily", "afro",
  "short_afro", "full_afro", "coils", "taper_fade", "low_fade", "high_fade",
  "waves", "waves_360", "braids", "box_braids", "cornrows", "twists",
  "two_strand_twists", "locs_short", "short_locs", "dreadlocks", "long_locs",
  "ponytail", "topknot", "bantu_knots", "long_straight", "long_curly",
  "mohawk", "spiked", "bald"
];
const HAIR_ALIASES = {
  shaved: "buzz",
  long: "long_straight"
};

function loadRenderer(documentRef) {
  const window = {};
  if (documentRef) window.document = documentRef;
  const context = vm.createContext({ window });
  vm.runInContext(SOURCE, context, { filename: "pixel-avatar.js" });
  return window.FHPixelAvatar;
}

function equippedSpec(visualStyle = "compact_cozy") {
  return {
    visualStyle,
    cls: "ranger",
    className: "Ranger",
    scene: "fighting",
    action: "Power Strike",
    running: true,
    traits: {
      race: "elf",
      body: "balanced",
      hair: "box_braids",
      faceShape: "round",
      eyeShape: "sharp",
      helm: "closed",
      face: "scar"
    },
    colors: {
      skin: "#75422E",
      hair: "#16100D",
      eye: "#9D74D9",
      armorMid: "#3F6B3A",
      armorHigh: "#72A35E",
      armorDark: "#203B24",
      accent: "#C2B280",
      cloak: "#284A2A"
    },
    equipped: {
      weapon: {
        id: "moon-bow",
        name: "Moon Bow",
        tier: "epic",
        metal: "#DDE7F2",
        gem: "#C084FC"
      },
      helmet: { id: "trail-helm", tier: "rare" },
      armor: { id: "weald-mail", tier: "epic" },
      pet: { id: "study-owl", tier: "rare", gem: "#22D3EE" }
    },
    mount: {
      id: "griffin-saddle",
      family: "bird",
      tier: "legendary",
      colors: ["#B45309", "#FDE68A", "#F59E0B"]
    }
  };
}

function groupInner(svg, className) {
  const startToken = "<g class=\"" + className + "\"";
  const start = svg.indexOf(startToken);
  if (start < 0) return "";
  const openEnd = svg.indexOf(">", start);
  let position = openEnd + 1;
  let depth = 1;
  while (depth > 0) {
    const nextOpen = svg.indexOf("<g", position);
    const nextClose = svg.indexOf("</g>", position);
    if (nextClose < 0) return "";
    if (nextOpen >= 0 && nextOpen < nextClose) {
      depth += 1;
      position = svg.indexOf(">", nextOpen) + 1;
    } else {
      depth -= 1;
      if (depth === 0) return svg.slice(openEnd + 1, nextClose);
      position = nextClose + 4;
    }
  }
  return "";
}

function rectangles(markup) {
  return [...markup.matchAll(/<rect\b([^>]*)\/>/g)].map((match) => {
    const attrs = match[1];
    const result = {};
    for (const name of ["x", "y", "width", "height"]) {
      const value = attrs.match(new RegExp(name + "=\"(-?\\d+)\""))?.[1];
      assert.ok(value, "missing " + name + " on " + match[0]);
      result[name] = Number(value);
    }
    return result;
  });
}

function geometrySignature(markup) {
  return rectangles(markup)
    .map((item) => [item.x, item.y, item.width, item.height].join(","))
    .sort()
    .join("|");
}

function bounds(markup) {
  const items = rectangles(markup);
  assert.ok(items.length > 0, "expected authored pixel rectangles");
  const x = Math.min(...items.map((item) => item.x));
  const y = Math.min(...items.map((item) => item.y));
  const x2 = Math.max(...items.map((item) => item.x + item.width));
  const y2 = Math.max(...items.map((item) => item.y + item.height));
  return { x, y, x2, y2, width: x2 - x, height: y2 - y };
}

function assertPixelSafe(svg) {
  assert.match(svg, /^<svg\b/);
  assert.match(svg, /viewBox="0 0 64 64"/);
  assert.match(svg, /shape-rendering="crispEdges"/);
  assert.match(svg, /image-rendering:pixelated/);
  assert.doesNotMatch(svg, /<(?:path|circle|ellipse|polygon|polyline|image|foreignObject)\b/);
  const items = rectangles(svg);
  assert.ok(items.length >= 45, "avatar should remain visibly authored");
  for (const item of items) {
    assert.ok(Number.isInteger(item.x));
    assert.ok(Number.isInteger(item.y));
    assert.ok(Number.isInteger(item.width));
    assert.ok(Number.isInteger(item.height));
    assert.ok(item.x >= 0 && item.y >= 0, "pixels must begin inside the viewBox");
    assert.ok(item.width > 0 && item.height > 0, "pixels need positive dimensions");
    assert.ok(item.x + item.width <= 64, "pixel exceeds viewBox width");
    assert.ok(item.y + item.height <= 64, "pixel exceeds viewBox height");
  }
}

function bareSpec(overrides = {}) {
  return {
    visualStyle: "compact_cozy",
    cls: "knight",
    className: "Knight",
    traits: {
      race: "human",
      body: "balanced",
      hair: "short",
      faceShape: "square",
      eyeShape: "focused",
      helm: "open",
      face: "calm",
      ...(overrides.traits || {})
    },
    equipped: {},
    ...overrides,
    traits: {
      race: "human",
      body: "balanced",
      hair: "short",
      faceShape: "square",
      eyeShape: "focused",
      helm: "open",
      face: "calm",
      ...(overrides.traits || {})
    }
  };
}

test("exports the frozen v1.2 preset API without data or network dependencies", () => {
  const api = loadRenderer();
  assert.ok(api);
  assert.equal(api.version, "fh-pixel-avatar-1.2.0");
  assert.equal(api.styleId, "fh-pixel-avatar-styles");
  assert.equal(api.defaultPreset, "compact_cozy");
  assert.deepEqual(Array.from(api.presetIds), PRESETS);
  assert.equal(Object.isFrozen(api), true);
  assert.equal(Object.isFrozen(api.presetIds), true);
  assert.equal(typeof api.render, "function");
  assert.equal(typeof api.installStyles, "function");
  assert.equal(typeof api.styles, "string");
  assert.equal(api.installStyles(), false);

  for (const forbidden of [
    /\blocalStorage\b/,
    /\bsessionStorage\b/,
    /\bindexedDB\b/,
    /\bdocument\.cookie\b/,
    /\bfetch\s*\(/,
    /\bXMLHttpRequest\b/,
    /\bWebSocket\b/,
    /\bcaches\./,
    /\bCacheStorage\b/
  ]) {
    assert.doesNotMatch(SOURCE, forbidden);
  }
});

test("render stays deterministic, non-mutating, escaped, and on the integer pixel grid", () => {
  const api = loadRenderer();
  const spec = equippedSpec();
  const before = JSON.stringify(spec);
  const first = api.render(spec);
  const second = api.render(spec);

  assert.equal(first, second);
  assert.equal(JSON.stringify(spec), before);
  assertPixelSafe(first);
  assert.match(first, /data-pixel-style="compact_cozy"/);
  assert.match(first, /data-face-shape="round"/);
  assert.match(first, /data-eye-shape="sharp"/);
  assert.match(first, /data-hair="box_braids"/);
  assert.match(first, /class="fhpx-hair" data-hair-art="box_braids"/);
  assert.match(first, /#75422E/i, "explicit complexion must remain authoritative");
});

test("the four runtime presets have genuinely different geometry and proportions", () => {
  const api = loadRenderer();
  const signatures = new Set();
  const heroBounds = {};
  const bodyBounds = {};
  const faceBounds = {};

  for (const visualStyle of PRESETS) {
    const svg = api.render(bareSpec({ visualStyle }));
    assert.match(svg, new RegExp("data-pixel-style=\"" + visualStyle + "\""));
    const hero = groupInner(svg, "fhpx-hero");
    const body = groupInner(svg, "fhpx-body");
    const face = groupInner(svg, "fhpx-face");
    signatures.add(geometrySignature(hero));
    heroBounds[visualStyle] = bounds(hero);
    bodyBounds[visualStyle] = bounds(body);
    faceBounds[visualStyle] = bounds(face);
    assertPixelSafe(svg);
  }

  assert.equal(signatures.size, PRESETS.length, "presets must differ geometrically, not by color");
  assert.deepEqual(heroBounds.compact_cozy, {
    x: 16, y: 17, x2: 48, y2: 55, width: 32, height: 38
  });
  assert.deepEqual(heroBounds.quest_classic, {
    x: 18, y: 14, x2: 46, y2: 55, width: 28, height: 41
  });
  assert.deepEqual(heroBounds.arcade_guardian, {
    x: 16, y: 15, x2: 48, y2: 55, width: 32, height: 40
  });
  assert.deepEqual(heroBounds.vanguard_heavy, {
    x: 11, y: 18, x2: 54, y2: 55, width: 43, height: 37
  });
  assert.ok(faceBounds.arcade_guardian.width > faceBounds.quest_classic.width);
  assert.ok(bodyBounds.vanguard_heavy.width > bodyBounds.compact_cozy.width);
  assert.ok(heroBounds.quest_classic.height > heroBounds.compact_cozy.height);

  const fallback = api.render(bareSpec({ visualStyle: "not-a-real-preset" }));
  assert.match(fallback, /data-pixel-style="compact_cozy"/);
});

test("all requested hair IDs have distinct pixel geometry and compatibility aliases are explicit", () => {
  const api = loadRenderer();
  const signatures = new Map();

  for (const hair of HAIR_IDS) {
    const svg = api.render(bareSpec({ traits: { hair } }));
    assert.match(svg, new RegExp("data-hair=\"" + hair + "\""));
    assert.match(svg, new RegExp("class=\"fhpx-hair\" data-hair-art=\"" + hair + "\""));
    const signature = geometrySignature(groupInner(svg, "fhpx-hair"));
    assert.equal(signatures.has(signature), false, hair + " duplicated " + signatures.get(signature));
    signatures.set(signature, hair);
    assertPixelSafe(svg);
  }
  assert.equal(signatures.size, HAIR_IDS.length);

  for (const [alias, canonical] of Object.entries(HAIR_ALIASES)) {
    const svg = api.render(bareSpec({ traits: { hair: alias } }));
    assert.match(svg, new RegExp("data-hair=\"" + alias + "\""));
    assert.match(svg, new RegExp("class=\"fhpx-hair\" data-hair-art=\"" + canonical + "\""));
    assert.equal(
      geometrySignature(groupInner(svg, "fhpx-hair")),
      geometrySignature(groupInner(
        api.render(bareSpec({ traits: { hair: canonical } })),
        "fhpx-hair"
      )),
      alias + " must be an explicit alias of " + canonical
    );
  }
});

test("body, face shape, and eye shape inputs alter geometry instead of metadata alone", () => {
  const api = loadRenderer();

  const bodySignatures = new Set();
  const bodyWidths = {};
  for (const body of ["lean", "compact", "balanced", "broad", "round"]) {
    const svg = api.render(bareSpec({ traits: { body, hair: "bald" } }));
    const art = groupInner(svg, "fhpx-body");
    assert.match(svg, new RegExp("data-body=\"" + body + "\""));
    bodySignatures.add(geometrySignature(art));
    bodyWidths[body] = bounds(art).width;
  }
  assert.equal(bodySignatures.size, 5);
  assert.ok(bodyWidths.lean < bodyWidths.compact);
  assert.ok(bodyWidths.compact < bodyWidths.balanced);
  assert.ok(bodyWidths.balanced < bodyWidths.broad);
  assert.ok(bodyWidths.broad < bodyWidths.round);

  const faceSignatures = new Set();
  for (const faceShape of ["oval", "round", "square", "heart", "long", "angular", "diamond"]) {
    const svg = api.render(bareSpec({ traits: { faceShape, hair: "bald" } }));
    assert.match(svg, new RegExp("data-face-shape=\"" + faceShape + "\""));
    faceSignatures.add(geometrySignature(groupInner(svg, "fhpx-face")));
  }
  assert.equal(faceSignatures.size, 7);

  const eyeSignatures = new Set();
  for (const eyeShape of ["focused", "round", "sharp", "wide", "sleepy"]) {
    const svg = api.render(bareSpec({ traits: { eyeShape, hair: "bald" } }));
    assert.match(svg, new RegExp("data-eye-shape=\"" + eyeShape + "\""));
    eyeSignatures.add(geometrySignature(groupInner(svg, "fhpx-eyes")));
  }
  assert.equal(eyeSignatures.size, 5);
});

test("class and species features remain geometric across every preset", () => {
  const api = loadRenderer();

  for (const visualStyle of PRESETS) {
    const classSignatures = new Set();
    for (const cls of ["knight", "mage", "ranger", "rogue"]) {
      const svg = api.render(bareSpec({ visualStyle, cls, className: cls }));
      assert.match(svg, new RegExp("data-class=\"" + cls + "\""));
      classSignatures.add(geometrySignature(groupInner(svg, "fhpx-class-mark")));
    }
    assert.equal(classSignatures.size, 4);

    const speciesSignatures = new Set();
    for (const race of ["human", "elf", "dwarf", "orc", "demon"]) {
      const svg = api.render(bareSpec({ visualStyle, traits: { race, hair: "bald" } }));
      assert.match(svg, new RegExp("data-race=\"" + race + "\""));
      speciesSignatures.add(geometrySignature(groupInner(svg, "fhpx-race-features")));
      assertPixelSafe(svg);
    }
    assert.equal(speciesSignatures.size, 5);
  }
});

test("equipment, mounts, pets, scenes, and actions remain supported by every preset", () => {
  const api = loadRenderer();

  for (const visualStyle of PRESETS) {
    const svg = api.render(equippedSpec(visualStyle));
    for (const expected of [
      "data-weapon=\"moon-bow\"",
      "data-helmet=\"trail-helm\"",
      "data-armor=\"weald-mail\"",
      "data-mount=\"griffin-saddle\"",
      "data-pet=\"study-owl\"",
      "data-mounted=\"1\"",
      "class=\"fhpx-weapon fhpx-slot-weapon\"",
      "class=\"fhpx-slot-helmet\"",
      "class=\"fhpx-slot-armor\"",
      "class=\"fhpx-mount\"",
      "class=\"fhpx-pet fhpx-slot-pet\"",
      "data-mount-family=\"bird\"",
      "data-scene=\"fighting\"",
      "data-action=\"power_strike\"",
      "data-running=\"1\""
    ]) {
      assert.ok(svg.includes(expected), visualStyle + " missing " + expected);
    }
    assertPixelSafe(svg);
  }

  const bare = api.render(bareSpec());
  for (const slot of ["weapon", "helmet", "armor", "mount", "pet"]) {
    assert.match(bare, new RegExp("data-" + slot + "=\"none\""));
  }
  assert.match(bare, /data-mounted="0"/);
  assert.doesNotMatch(bare, /fhpx-slot-(?:weapon|helmet|armor|pet)/);
});

test("animation remains restrained, step-based, and reduced-motion safe", () => {
  const api = loadRenderer();
  assert.match(api.styles, /steps\(2,end\)/);
  assert.match(api.styles, /steps\(3,end\)/);
  assert.match(api.styles, /prefers-reduced-motion:reduce/);
  assert.match(api.styles, /animation:none!important/);
  assert.match(api.styles, /--fhpx-hero-ox/);
  assert.match(api.styles, /--fhpx-weapon-ox/);
  assert.doesNotMatch(api.styles, /flash|strobe|opacity:\s*0[^}]*opacity:\s*1/i);

  const unknown = api.render({ scene: "not a real scene", action: "Quiet Work" });
  assert.match(unknown, /data-scene="resting"/);
  assert.match(unknown, /data-action="quiet_work"/);
});

test("style installation remains idempotent", () => {
  const nodes = new Map();
  let appends = 0;
  const documentRef = {
    head: {
      appendChild(node) {
        appends += 1;
        nodes.set(node.id, node);
      }
    },
    documentElement: null,
    createElement(tag) {
      assert.equal(tag, "style");
      return {};
    },
    getElementById(id) {
      return nodes.get(id) || null;
    }
  };

  const api = loadRenderer(documentRef);
  assert.equal(appends, 1);
  assert.equal(nodes.get(api.styleId).textContent, api.styles);
  assert.equal(api.installStyles(documentRef), true);
  assert.equal(appends, 1);
});

test("untrusted labels, identifiers, style IDs, feature IDs, and colors cannot inject markup or CSS", () => {
  const api = loadRenderer();
  const svg = api.render({
    visualStyle: "compact_cozy\" onload=\"bad",
    cls: "mage\" onclick=\"bad",
    className: "Mage\"><script>bad()</script>",
    scene: "fighting",
    action: "Slash\" onload=\"bad",
    traits: {
      hair: "afro\" onclick=\"bad",
      faceShape: "round\" onload=\"bad",
      eyeShape: "sharp\" onload=\"bad"
    },
    colors: {
      armorMid: "red\";background:url(bad)",
      accent: "#fff\"><script>bad()</script>"
    },
    equipped: {
      weapon: { id: "blade\"><script>bad()</script>", name: "Blade" }
    }
  });

  assert.doesNotMatch(svg, /<script\b/i);
  assert.doesNotMatch(svg, /\sonclick=|\sonload=/i);
  assert.doesNotMatch(svg, /background:url/i);
  assert.match(svg, /data-pixel-style="compact_cozy"/);
  assert.match(svg, /data-class="mage_onclick_bad"/);
  assert.match(svg, /data-action="slash_onload_bad"/);
  assert.match(svg, /data-weapon="blade_script_bad_script"/);
  assert.match(svg, /Mage&quot;&gt;&lt;script&gt;bad\(\)&lt;\/script&gt; pixel hero/);
});
