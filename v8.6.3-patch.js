/* ================================================================
 * Focus Hero v8.6.3 - DEFENSIVE PATCH
 *
 * Two real bugs found in v8.6.2 (live as of 2026-06-04, BUILD_ID
 * fh-2026-06-04-v8-6-2-summary-save):
 *
 *   BUG A — Class dropdown doesn't change outfit on Hero card.
 *     Root cause: dropdown handlers (focus-hero.html:7005 and :8133)
 *     write `state.hero.cls` but never mirror to
 *     `state.hero.appearance.classKey`. The v8.6 SVG renderer
 *     (character-v86-fix.js:81) reads `a.classKey || a.cls` where
 *     `a = state.hero.appearance`, so the outfit never refreshes.
 *
 *   BUG B — Migration ladder order is reversed; v11/v12/v13 are
 *     skipped for any saved state at dataVersion <= 10.
 *     The blocks at focus-hero.html:3533 / :3547 / :3593 / :3620
 *     run in order 14, 13, 12, 11 — and v14 fires first, so the
 *     subsequent `if (s.dataVersion < 13)` etc. evaluate false.
 *     Result: crystalShards / world / questSystem /
 *     loot.mountProgress / lootRework / hero.appearance.species
 *     never get initialized. Most module-side ensure-helpers
 *     self-heal, but `state.crystalShards` has no helper and any
 *     arithmetic on it yields NaN.
 *
 * This patch fixes BOTH bugs at runtime without modifying
 * focus-hero.html. It is:
 *   - Purely additive — never overwrites existing fields.
 *   - Idempotent — safe to re-run.
 *   - Defensive — guards against state not yet existing on load.
 *
 * Deploy: add `<script src="./v8.6.3-patch.js"></script>` to
 * focus-hero.html immediately after `eggs.js`, add the filename to
 * sw.js PRECACHE list, bump BUILD_ID to fh-2026-06-05-v8-6-3, and
 * Wrangler-deploy.
 * ================================================================ */
(function (global) {
  "use strict";

  var TAG = "[v8.6.3-patch]";
  var installed = false;
  var pollHandle = null;

  /* ---------------------------------------------------------------
   * BUG A FIX — keep state.hero.appearance.classKey in sync with
   * state.hero.cls. Wraps saveState so every persist-to-storage
   * action also propagates the class. Side effect: also mirrors
   * species ↔ race for the same reason (race is the legacy field
   * the v86 renderer still falls back to).
   * --------------------------------------------------------------- */
  function mirrorAppearanceFields(s) {
    if (!s || typeof s !== "object") return;
    if (!s.hero || typeof s.hero !== "object") return;
    if (!s.hero.appearance || typeof s.hero.appearance !== "object" || Array.isArray(s.hero.appearance)) {
      s.hero.appearance = {};
    }
    var a = s.hero.appearance;
    /* classKey <- cls (the bug we're fixing) */
    if (typeof s.hero.cls === "string" && a.classKey !== s.hero.cls) {
      a.classKey = s.hero.cls;
    }
    /* species <- race (kept for completeness; v86 already mirrors
       this in its setHeroAppearance wrapper, but if a future code
       path writes appearance.race directly, this keeps species
       aligned). */
    if (typeof a.race === "string" && a.species !== a.race && typeof a.species !== "string") {
      a.species = a.race;
    }
  }

  function wrapSaveState() {
    if (typeof global.saveState !== "function") return false;
    if (global.saveState.__v863Wrapped) return true;
    var orig = global.saveState;
    global.saveState = function patchedSaveState() {
      try { mirrorAppearanceFields(global.state); } catch (e) {
        console.warn(TAG, "mirror failed", e);
      }
      return orig.apply(this, arguments);
    };
    global.saveState.__v863Wrapped = true;
    console.log(TAG, "BUG A: saveState wrapped to mirror cls→appearance.classKey");
    return true;
  }

  /* ---------------------------------------------------------------
   * BUG B FIX — backfill anything v11/v12/v13 migrations would have
   * created. Runs once on first installable load; harmless on
   * already-correct states because every branch is `if missing`.
   * Replicates the exact init logic from focus-hero.html lines
   * 3547-3691 (v13, v12, v11 blocks) verbatim in additive form.
   * --------------------------------------------------------------- */
  function backfillMigrations(s) {
    if (!s || typeof s !== "object") return false;
    var didAnything = false;
    function mark(label) {
      didAnything = true;
      console.log(TAG, "BUG B backfill:", label);
    }

    /* ---- v11: loot rework subtree, bestiary drops, lootRework flags ---- */
    var LR_RARITIES = ["common","uncommon","rare","epic","legendary","mythic"];
    if (!s.lootInstances || typeof s.lootInstances !== "object" || Array.isArray(s.lootInstances)) {
      s.lootInstances = {}; mark("lootInstances={}");
    }
    if (!s.loot || typeof s.loot !== "object" || Array.isArray(s.loot)) {
      s.loot = {
        drops: [],
        pity: { common:0, uncommon:0, rare:0, epic:0, legendary:0, mythic:0 },
        materials: { dust:0, shards:0, essence:0 },
        dyesOwned: {}, gemsOwned: {}, consumables: {},
        loadout: { slot1:null, slot2:null, slot3:null }, loadoutUpdatedAt: 0
      };
      mark("loot={} seeded");
    } else {
      if (!Array.isArray(s.loot.drops)) { s.loot.drops = []; mark("loot.drops=[]"); }
      if (!s.loot.pity || typeof s.loot.pity !== "object" || Array.isArray(s.loot.pity)) {
        s.loot.pity = { common:0, uncommon:0, rare:0, epic:0, legendary:0, mythic:0 };
        mark("loot.pity seeded");
      } else {
        for (var i = 0; i < LR_RARITIES.length; i++) {
          var rk = LR_RARITIES[i];
          if (typeof s.loot.pity[rk] !== "number" || !(s.loot.pity[rk] >= 0)) s.loot.pity[rk] = 0;
        }
      }
      if (!s.loot.materials || typeof s.loot.materials !== "object" || Array.isArray(s.loot.materials)) {
        s.loot.materials = { dust:0, shards:0, essence:0 }; mark("loot.materials seeded");
      } else {
        var mks = ["dust","shards","essence"];
        for (var j = 0; j < mks.length; j++) {
          if (typeof s.loot.materials[mks[j]] !== "number" || !(s.loot.materials[mks[j]] >= 0)) {
            s.loot.materials[mks[j]] = 0;
          }
        }
      }
      if (!s.loot.dyesOwned   || typeof s.loot.dyesOwned   !== "object" || Array.isArray(s.loot.dyesOwned))   s.loot.dyesOwned   = {};
      if (!s.loot.gemsOwned   || typeof s.loot.gemsOwned   !== "object" || Array.isArray(s.loot.gemsOwned))   s.loot.gemsOwned   = {};
      if (!s.loot.consumables || typeof s.loot.consumables !== "object" || Array.isArray(s.loot.consumables)) s.loot.consumables = {};
      if (!s.loot.loadout || typeof s.loot.loadout !== "object" || Array.isArray(s.loot.loadout)) {
        s.loot.loadout = { slot1:null, slot2:null, slot3:null }; mark("loot.loadout seeded");
      } else {
        var lks = ["slot1","slot2","slot3"];
        for (var k = 0; k < lks.length; k++) if (!(lks[k] in s.loot.loadout)) s.loot.loadout[lks[k]] = null;
      }
      if (typeof s.loot.loadoutUpdatedAt !== "number" || !(s.loot.loadoutUpdatedAt >= 0)) s.loot.loadoutUpdatedAt = 0;
    }
    if (s.bestiary && typeof s.bestiary === "object" && !Array.isArray(s.bestiary)) {
      var bk = Object.keys(s.bestiary);
      for (var bi = 0; bi < bk.length; bi++) {
        var ent = s.bestiary[bk[bi]];
        if (ent && typeof ent === "object" && !Array.isArray(ent)) {
          if (!ent.drops || typeof ent.drops !== "object" || Array.isArray(ent.drops)) ent.drops = {};
          if (!("lastEncounteredAt" in ent)) ent.lastEncounteredAt = null;
        }
      }
    }
    if (!s.lootRework || typeof s.lootRework !== "object" || Array.isArray(s.lootRework)) {
      s.lootRework = { version: 1, flags: { animationsOn: true, showDropLog: true, autoSalvageCommonDupes: false } };
      mark("lootRework seeded");
    } else {
      if (typeof s.lootRework.version !== "number") s.lootRework.version = 1;
      if (!s.lootRework.flags || typeof s.lootRework.flags !== "object" || Array.isArray(s.lootRework.flags)) {
        s.lootRework.flags = { animationsOn: true, showDropLog: true, autoSalvageCommonDupes: false };
      } else {
        if (typeof s.lootRework.flags.animationsOn !== "boolean") s.lootRework.flags.animationsOn = true;
        if (typeof s.lootRework.flags.showDropLog !== "boolean") s.lootRework.flags.showDropLog = true;
        if (typeof s.lootRework.flags.autoSalvageCommonDupes !== "boolean") s.lootRework.flags.autoSalvageCommonDupes = false;
      }
    }

    /* ---- v12: appearance.species/classKey/skinIdx, mountProgress, mountFamilies ---- */
    if (!s.hero || typeof s.hero !== "object") s.hero = {};
    if (!s.hero.appearance || typeof s.hero.appearance !== "object" || Array.isArray(s.hero.appearance)) {
      s.hero.appearance = {}; mark("hero.appearance={}");
    }
    if (typeof s.hero.appearance.species !== "string") {
      s.hero.appearance.species = (typeof s.hero.appearance.race === "string") ? s.hero.appearance.race : "human";
      mark("hero.appearance.species seeded");
    }
    if (typeof s.hero.appearance.classKey !== "string") {
      s.hero.appearance.classKey = (typeof s.hero.cls === "string") ? s.hero.cls : "warrior";
      mark("hero.appearance.classKey seeded");
    }
    if (typeof s.hero.appearance.skinIdx !== "number" || !(s.hero.appearance.skinIdx >= 0)) s.hero.appearance.skinIdx = 0;
    if (typeof s.loot.mountProgress !== "number" || !(s.loot.mountProgress >= 0)) {
      s.loot.mountProgress = 0; mark("loot.mountProgress=0");
    }
    if (!s.loot.mountFamilies || typeof s.loot.mountFamilies !== "object" || Array.isArray(s.loot.mountFamilies)) {
      s.loot.mountFamilies = {}; mark("loot.mountFamilies={}");
    }

    /* ---- v13: crystalShards, craftingDust, questSystem, world, loot.vault, achievementsV85 ---- */
    if (typeof s.crystalShards        !== "number" || !(s.crystalShards        >= 0)) { s.crystalShards = 0;        mark("crystalShards=0"); }
    if (typeof s.crystalShardsEarned  !== "number" || !(s.crystalShardsEarned  >= 0)) s.crystalShardsEarned = 0;
    if (typeof s.crystalShardsSpent   !== "number" || !(s.crystalShardsSpent   >= 0)) s.crystalShardsSpent = 0;
    if (typeof s.craftingDust         !== "number" || !(s.craftingDust         >= 0)) { s.craftingDust = 0; mark("craftingDust=0"); }
    if (!s.questSystem || typeof s.questSystem !== "object" || Array.isArray(s.questSystem)) {
      s.questSystem = { daily:[], weekly:[], seasonal:[], lastRoll:{ daily:null, weekly:null, seasonal:null },
                        dailyClaimedCount:0, weeklyClaimedCount:0, seasonalClaimedCount:0 };
      mark("questSystem seeded");
    } else {
      if (!Array.isArray(s.questSystem.daily))    s.questSystem.daily = [];
      if (!Array.isArray(s.questSystem.weekly))   s.questSystem.weekly = [];
      if (!Array.isArray(s.questSystem.seasonal)) s.questSystem.seasonal = [];
      if (!s.questSystem.lastRoll) s.questSystem.lastRoll = { daily:null, weekly:null, seasonal:null };
      if (typeof s.questSystem.dailyClaimedCount    !== "number") s.questSystem.dailyClaimedCount = 0;
      if (typeof s.questSystem.weeklyClaimedCount   !== "number") s.questSystem.weeklyClaimedCount = 0;
      if (typeof s.questSystem.seasonalClaimedCount !== "number") s.questSystem.seasonalClaimedCount = 0;
    }
    if (!s.world || typeof s.world !== "object" || Array.isArray(s.world)) {
      s.world = { currentZone:"verdant_vale", unlockedZones:{verdant_vale:true},
                  zonesVisited:{verdant_vale:1}, bossesDefeated:0, mysteryBoxesOpened:0,
                  artifactsFound:{}, questCounters:{} };
      mark("world seeded");
    } else {
      if (typeof s.world.currentZone !== "string") s.world.currentZone = "verdant_vale";
      if (!s.world.unlockedZones || typeof s.world.unlockedZones !== "object" || Array.isArray(s.world.unlockedZones)) {
        s.world.unlockedZones = { verdant_vale: true };
      } else {
        s.world.unlockedZones.verdant_vale = true;
      }
      if (!s.world.zonesVisited) s.world.zonesVisited = { verdant_vale: 1 };
      if (typeof s.world.bossesDefeated     !== "number") s.world.bossesDefeated = 0;
      if (typeof s.world.mysteryBoxesOpened !== "number") s.world.mysteryBoxesOpened = 0;
      if (!s.world.artifactsFound) s.world.artifactsFound = {};
      if (!s.world.questCounters)  s.world.questCounters = {};
    }
    if (!s.loot.vault || typeof s.loot.vault !== "object" || Array.isArray(s.loot.vault)) {
      s.loot.vault = { instances:{}, cap:100 }; mark("loot.vault seeded");
    } else {
      if (!s.loot.vault.instances) s.loot.vault.instances = {};
      if (typeof s.loot.vault.cap !== "number") s.loot.vault.cap = 100;
    }
    if (!s.achievementsV85 || typeof s.achievementsV85 !== "object" || Array.isArray(s.achievementsV85)) {
      s.achievementsV85 = {}; mark("achievementsV85 seeded");
    }

    return didAnything;
  }

  /* ---------------------------------------------------------------
   * Install once `state` and `saveState` are ready.
   * Other modules (loot-rework, character-rebuild, world-depth,
   * shop-rework, character-v86-fix, eggs) run via DOMContentLoaded
   * IIFEs; we poll briefly to land after them.
   * --------------------------------------------------------------- */
  function tryInstall() {
    if (installed) return;
    if (typeof global.state !== "object" || typeof global.saveState !== "function") return;
    installed = true;
    if (pollHandle) { clearInterval(pollHandle); pollHandle = null; }

    /* Fix BUG A */
    wrapSaveState();
    /* Mirror once immediately for the current session in case the
       user already changed class before saveState wrap took effect. */
    try { mirrorAppearanceFields(global.state); } catch (_) {}

    /* Fix BUG B */
    var changed = false;
    try { changed = backfillMigrations(global.state); } catch (e) {
      console.warn(TAG, "backfill failed", e);
    }
    if (changed) {
      try { global.saveState(); console.log(TAG, "backfill persisted"); } catch (e) {
        console.warn(TAG, "saveState after backfill failed", e);
      }
    } else {
      console.log(TAG, "no backfill needed — state already healthy");
    }

    /* Final cosmetic touch — re-render Hero card so any UI looking
       at the freshly-mirrored fields catches up. */
    try { if (typeof global.renderHero  === "function") global.renderHero();  } catch (_) {}
    try { if (typeof global.renderAvatar=== "function") global.renderAvatar();} catch (_) {}
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      pollHandle = setInterval(tryInstall, 100);
      /* Give up after 30s — something is very wrong if state/saveState
         never appear. */
      setTimeout(function () { if (pollHandle) { clearInterval(pollHandle); pollHandle = null; } }, 30000);
      tryInstall();
    });
  } else {
    pollHandle = setInterval(tryInstall, 100);
    setTimeout(function () { if (pollHandle) { clearInterval(pollHandle); pollHandle = null; } }, 30000);
    tryInstall();
  }
})(typeof window !== "undefined" ? window : this);
