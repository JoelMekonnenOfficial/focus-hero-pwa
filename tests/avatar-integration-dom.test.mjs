import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = fs.readFileSync(path.join(ROOT, "focus-hero.html"), "utf8");

function between(source, start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  assert.ok(from >= 0 && to > from, "missing source boundary: " + start);
  return source.slice(from, to);
}

function adapterHarness(appearance) {
  const state = { hero:{ cls:"knight", level:8 }, timer:{ running:false } };
  const equipment = {
    weapon:{ id:"test-blade", lootId:"test-blade", tier:"rare", slot:"weapon", item:["◇","Test Blade","rare"] },
    helmet:null, armor:null,
    mount:{ id:"test-mount", lootId:"test-mount", tier:"rare", slot:"mount", item:["◇","Test Mount","rare"] },
    pet:{ id:"test-pet", lootId:"test-pet", tier:"rare", slot:"pet", item:["◇","Test Pet","rare"] }
  };
  let currentAppearance = JSON.parse(JSON.stringify(appearance));
  const context = vm.createContext({
    window:{
      CR_SPECIES:{ human:{ skinTones:["#F6D7C3","#E2B894","#75422E","#3A241C"] } },
      CR_CLASSES:{ knight:{ label:"Knight", primary:"#465E80", secondary:"#E5E7EB", cape:"#2563EB" } },
      CR_HAIR_COLORS:{ espresso:"#3D2417" },
      CR_EYE_COLORS:{ azure:"#3DA8E0" },
      V86_SPECIES_PROFILES:{ human:{ widthScale:1, stockiness:1, heightScale:1 } },
      V86_CLASS_OVERLAYS:{}, AVATAR_TIER_ART:{ rare:{ metal:"#E5E7EB", gem:"#22D3EE", glow:2 } }
    },
    state,
    AVATAR_TIER_ART:{ rare:{ metal:"#E5E7EB", gem:"#22D3EE", glow:2 } },
    readHeroAppearance:()=>JSON.parse(JSON.stringify(currentAppearance)),
    readHeroEquipped:()=>JSON.parse(JSON.stringify(equipment)),
    avatarEquipment:()=>JSON.parse(JSON.stringify(equipment)),
    currentAdventureSpec:()=>({ scene:"resting", id:"Rest" }),
    document:{ querySelector:()=>null }
  });
  vm.runInContext(between(html, "const APPEARANCE_OPTIONS = {", "const GEAR_EFFECTS = {") + "\nthis.appearanceOptions = APPEARANCE_OPTIONS;", context);
  vm.runInContext(between(html, "function appearanceOption(group, id){", "function normalizedHeroAppearance"), context);
  vm.runInContext(between(html, "function avatarHexRgb", "function legacyAvatarFallbackSvg(opts={}){") + "\nthis.visualSpec = avatarVisualSpec;", context);
  return { context, state, equipment, setAppearance:value=>{ currentAppearance = JSON.parse(JSON.stringify(value)); } };
}

const baseAppearance = {
  visualStyle:"arcade_guardian", hairStyle:"box_braids", skinTone:"deep", bodyStyle:"round", faceShape:"broad",
  armor:"crimson", accent:"gold", helm:"open", cloak:"forest", race:"human", body:"balanced", skin:"warm", hair:"short",
  hairColor:"espresso", eyeShape:"round", eyeColor:"azure", face:"smile", skinIdx:0
};

test("adapter passes exact tone, style, build, hair, and facial geometry without mutation", () => {
  const harness = adapterHarness(baseAppearance);
  const beforeState = JSON.stringify(harness.state);
  const beforeAppearance = JSON.stringify(baseAppearance);
  const spec = harness.context.visualSpec({ studio:true, characterOnly:false, scene:"studio" });
  assert.equal(spec.colors.skin, "#5B3828");
  assert.equal(spec.visualStyle, "arcade_guardian");
  assert.equal(spec.traits.visualStyle, "arcade_guardian");
  assert.equal(spec.traits.body, "round");
  assert.equal(spec.traits.hair, "box_braids");
  assert.equal(spec.traits.faceShape, "broad");
  assert.equal(spec.traits.eyeShape, "round");
  assert.equal(spec.colors.armorMid, "#B91C1C");
  assert.equal(spec.colors.accent, "#FBBF24");
  assert.equal(JSON.stringify(harness.state), beforeState);
  assert.equal(JSON.stringify(baseAppearance), beforeAppearance);
});

test("legacy compatibility modes preserve the previously rendered choices", () => {
  const legacy = { ...baseAppearance, hair:"wavy", hairStyle:"legacy", skinTone:"species", skinIdx:2, body:"broad", bodyStyle:"legacy" };
  const harness = adapterHarness(legacy);
  const spec = harness.context.visualSpec({ studio:true });
  assert.equal(spec.colors.skin, "#75422E");
  assert.equal(spec.traits.hair, "wavy");
  assert.equal(spec.traits.body, "broad");
});

test("character-only preview hides companions without changing equipped state", () => {
  const harness = adapterHarness(baseAppearance);
  const before = JSON.stringify(harness.equipment);
  const spec = harness.context.visualSpec({ studio:true, characterOnly:true });
  assert.equal(spec.equipped.pet, null);
  assert.equal(spec.mount, null);
  assert.ok(spec.equipped.weapon);
  assert.equal(JSON.stringify(harness.equipment), before);
});
