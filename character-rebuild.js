/* ================================================================
 * Focus Hero - v8.4 CHARACTER + MOUNT-ECOSYSTEM + EDIT-UX rebuild
 *
 * Companion to index.html. Loaded with <script src>.
 *
 *   1. CHARACTER: kills the v82 "robot" portrait. Layered SVG with
 *      10 species (Human, Elf, Dwarf, Orc, Goblin, Beastfolk x3,
 *      Undead, Demon, Fae) and 8 classes (Warrior, Mage, Rogue,
 *      Ranger, Cleric, Bard, Druid, Knight). Hair (14 styles), hair
 *      color (12), eye color (8), skin tone (palette per species).
 *
 *   2. MOUNTS: a real 84-entry ecosystem organised into 14 families.
 *      Pity thresholds calibrated for a long-term-grind player:
 *          common     50h
 *          uncommon  100h
 *          rare      200h
 *          epic      400h
 *          legendary 750h
 *          mythic   1500h
 *      Plus an RNG layer: ~0.5% per qualifying session for an
 *      above-tier surprise drop, scaling with session length.
 *      Adds a Stable/Bestiary tab with family cards, completion %,
 *      and "Master of X" titles for collecting a full family.
 *
 *   3. EDIT UX: post-session "Edit time" popup now accepts a delta
 *      input (+5/-5/+15/-15 quick buttons + custom number field).
 *      Underlying applySessionEdit() unchanged - still receives an
 *      absolute target minutes value.
 *
 * Migration: DATA_VERSION 11 -> 12, additive only.
 *   - state.loot.mountProgress = 0
 *   - state.loot.mountFamilies = {}  (per-family completion tracking)
 *
 * Contract: data-safety preservation. Every existing field bitwise.
 * ================================================================ */

(function(){
  "use strict";

  /* ---------- SPECIES + CLASSES + LOOK ---------- */

  var CR_SPECIES = {
    human:    { label:"Human",    skinTones:["#F6D7C3","#E2B894","#D99B73","#B86E47","#75422E","#52301F"], earShape:"round", trait:"none",      baseHeight:1.0,  faceWidth:1.0 },
    elf:      { label:"Elf",      skinTones:["#FFE6D5","#F0D5BC","#D9B59A","#A87B5F"],                    earShape:"pointed_long", trait:"none", baseHeight:1.05, faceWidth:0.92 },
    dwarf:    { label:"Dwarf",    skinTones:["#F5C7A2","#D49D71","#A67250"],                               earShape:"round", trait:"beard",    baseHeight:0.85, faceWidth:1.15 },
    orc:      { label:"Orc",      skinTones:["#6F995F","#5C8550","#4E7044","#3B5836"],                    earShape:"pointed_back", trait:"tusks", baseHeight:1.1,  faceWidth:1.18 },
    goblin:   { label:"Goblin",   skinTones:["#A8C36A","#86A852","#658B3E"],                               earShape:"pointed_huge", trait:"snaggle", baseHeight:0.78, faceWidth:0.95 },
    beastfolk_cat:   { label:"Beastfolk (Cat)",   skinTones:["#E8C99A","#C49560","#8A623A","#3B2A1E"], earShape:"cat",   trait:"muzzle_cat",   baseHeight:1.0,  faceWidth:1.05 },
    beastfolk_wolf:  { label:"Beastfolk (Wolf)",  skinTones:["#A89A86","#7A6D58","#4F4434","#2A2218"], earShape:"wolf",  trait:"muzzle_wolf",  baseHeight:1.05, faceWidth:1.05 },
    beastfolk_lizard:{ label:"Beastfolk (Lizard)",skinTones:["#5DA672","#3F8556","#2C6342","#23A0B5"], earShape:"frill", trait:"snout_lizard", baseHeight:1.0,  faceWidth:1.0  },
    undead:   { label:"Undead",   skinTones:["#C8C8C8","#9CA0A0","#6A6E72","#454952"],                    earShape:"round", trait:"sunken",   baseHeight:1.0,  faceWidth:1.0 },
    demon:    { label:"Demon",    skinTones:["#9C2B2B","#7A1F1F","#54151D","#2A1010"],                    earShape:"pointed_long", trait:"horns", baseHeight:1.08, faceWidth:1.05 },
    fae:      { label:"Fae",      skinTones:["#F5E6FF","#E5C5F7","#C4A0DB","#8E70B5"],                    earShape:"pointed_long", trait:"glow",  baseHeight:0.95, faceWidth:0.9 }
  };

  var CR_CLASSES = {
    warrior: { label:"Warrior", primary:"#A23B3B", secondary:"#F6CB6E", emblem:"sword",  weapon:"sword", outfit:"plate"   },
    mage:    { label:"Mage",    primary:"#5B4FCF", secondary:"#A8C0FF", emblem:"orb",    weapon:"staff", outfit:"robe"    },
    rogue:   { label:"Rogue",   primary:"#2C3E55", secondary:"#7DB48C", emblem:"dagger", weapon:"dagger",outfit:"leather" },
    ranger:  { label:"Ranger",  primary:"#3F6B3A", secondary:"#C2B280", emblem:"bow",    weapon:"bow",   outfit:"leather" },
    cleric:  { label:"Cleric",  primary:"#F0E6C0", secondary:"#D4B45C", emblem:"chalice",weapon:"mace",  outfit:"robe"    },
    bard:    { label:"Bard",    primary:"#C04A7E", secondary:"#F8C8DC", emblem:"lute",   weapon:"lute",  outfit:"motley"  },
    druid:   { label:"Druid",   primary:"#5E8B3F", secondary:"#C8A36A", emblem:"leaf",   weapon:"staff", outfit:"woven"   },
    knight:  { label:"Knight",  primary:"#465E80", secondary:"#E5E7EB", emblem:"shield", weapon:"sword", outfit:"plate"   },
    monk:    { label:"Monk",    primary:"#F97316", secondary:"#FED7AA", emblem:"sun",    weapon:"wraps", outfit:"cloth"   },
    alchemist:{ label:"Alchemist", primary:"#14B8A6", secondary:"#FDE047", emblem:"flask", weapon:"flask", outfit:"coat"  },
    sentinel:{ label:"Sentinel", primary:"#0284C7", secondary:"#FCD34D", emblem:"tower", weapon:"shield", outfit:"plate"  },
    shadowmancer:{ label:"Shadowmancer", primary:"#7C3AED", secondary:"#F472B6", emblem:"moon", weapon:"sickle", outfit:"robe" }
  };

  var CR_HAIR_STYLES = ["short","buzz","crop","wavy","curly","braids","ponytail","topknot","long_straight","long_curly","mohawk","spiked","bald","dreadlocks"];
  var CR_HAIR_LABELS = { short:"Short", buzz:"Buzz", crop:"Crop", wavy:"Wavy", curly:"Curly", braids:"Braids", ponytail:"Ponytail", topknot:"Topknot", long_straight:"Long Straight", long_curly:"Long Curly", mohawk:"Mohawk", spiked:"Spiked", bald:"Bald", dreadlocks:"Dreadlocks" };
  var CR_HAIR_COLORS = { raven:"#1E1B2A", espresso:"#3D2417", brown:"#6B4423", chestnut:"#8B5A2B", auburn:"#A6403B", blonde:"#D6B25A", platinum:"#E8DCC0", silver:"#B8BEC8", crimson:"#C1272D", violet:"#7B4FA0", cobalt:"#3B5BA8", mint:"#7DCEA0" };
  var CR_EYE_COLORS = { amber:"#D89A2F", azure:"#3DA8E0", emerald:"#3FB970", violet:"#9D74D9", crimson:"#C03A40", onyx:"#1A1A22", gold:"#E6B941", silver:"#C8CFD8" };

  /* ---------- MOUNT ECOSYSTEM ----------
     14 families. ~85 mounts total. Each mount has:
       id, name, sym (emoji glyph), family, tier, effect, lore.
     Tier distribution roughly matches Joel's spec:
       common 25, uncommon 20, rare 15, epic 12, legendary 8, mythic 5.
  */

  var CR_FAMILIES = {
    horse:     { label:"Horses",         icon:"🐎", lore:"Sturdy steeds for the long road." },
    wolf:      { label:"Wolves",         icon:"🐺", lore:"Loyal companions and feral predators." },
    cat:       { label:"Big Cats",       icon:"🦁", lore:"Striped, spotted, and lethal." },
    bear:      { label:"Bears",          icon:"🐻", lore:"Heavyweights of the wilds." },
    bird:      { label:"Birds of Prey",  icon:"🦅", lore:"Sky-claimers." },
    reptile:   { label:"Reptiles",       icon:"🦎", lore:"Cold-blooded armor on legs." },
    dragon:    { label:"Dragons",        icon:"🐉", lore:"Endgame fire." },
    mythical:  { label:"Mythical",       icon:"🦄", lore:"Legends made flesh." },
    forest:    { label:"Woodland",       icon:"🦌", lore:"Born of glade and bramble." },
    cattle:    { label:"Cattle",         icon:"🐂", lore:"Beasts of burden, hooves of stone." },
    undead:    { label:"Undead",         icon:"💀", lore:"Re-saddled from the grave." },
    elemental: { label:"Elemental",      icon:"🌪️", lore:"Bound to stone, storm, or flame." },
    insect:    { label:"Insectoid",      icon:"🕷️", lore:"Eight legs or six wings." },
    small:     { label:"Small & Whimsical", icon:"🐇", lore:"Tiny mounts, big personality." }
  };

  /* Pity ladder (focused-minutes since last mount of >= that tier). */
  var CR_MOUNT_PITY = {
    common:    3000,    // 50 h
    uncommon:  6000,    // 100 h
    rare:     12000,    // 200 h
    epic:     24000,    // 400 h
    legendary:45000,    // 750 h
    mythic:   90000     // 1500 h
  };

  /* RNG layer: per-session chance of an above-pity-tier surprise drop. */
  var CR_RNG_BASE_RATE = 0.005;          // 0.5% baseline per qualifying session
  var CR_RNG_QUALIFYING_MIN = 60;        // only sessions >= 60 min qualify
  var CR_RNG_PER_HOUR_BONUS = 0.002;     // +0.2% per hour over the qualifier

  /* The roster. Distribution: common 25, uncommon 20, rare 15, epic 12, legendary 8, mythic 5 = 85 mounts. */
  var CR_MOUNTS_FULL = [
    // ---- HORSES (15) ----
    { id:"mount_thoroughbred",  name:"Thoroughbred",  sym:"🐎", family:"horse",  tier:"common",    effect:{ coinPct:4,  label:"+4% coins" } },
    { id:"mount_mustang",       name:"Mustang",       sym:"🐎", family:"horse",  tier:"common",    effect:{ coinPct:5,  label:"+5% coins" } },
    { id:"mount_pinto",         name:"Pinto",         sym:"🐎", family:"horse",  tier:"common",    effect:{ coinPct:5,  label:"+5% coins" } },
    { id:"mount_palomino",      name:"Palomino",      sym:"🐎", family:"horse",  tier:"common",    effect:{ coinPct:5,  label:"+5% coins" } },
    { id:"mount_arabian",       name:"Arabian",       sym:"🐎", family:"horse",  tier:"uncommon",  effect:{ coinPct:7,  label:"+7% coins" } },
    { id:"mount_appaloosa",     name:"Appaloosa",     sym:"🐎", family:"horse",  tier:"uncommon",  effect:{ coinPct:7,  label:"+7% coins" } },
    { id:"mount_friesian",      name:"Friesian",      sym:"🐎", family:"horse",  tier:"uncommon",  effect:{ coinPct:8,  label:"+8% coins" } },
    { id:"mount_andalusian",    name:"Andalusian",    sym:"🐎", family:"horse",  tier:"uncommon",  effect:{ coinPct:8,  label:"+8% coins" } },
    { id:"mount_shire",         name:"Shire",         sym:"🐎", family:"horse",  tier:"rare",      effect:{ coinPct:11, label:"+11% coins" } },
    { id:"mount_clydesdale",    name:"Clydesdale",    sym:"🐎", family:"horse",  tier:"rare",      effect:{ coinPct:11, label:"+11% coins" } },
    { id:"mount_akhal_teke",    name:"Akhal-Teke",    sym:"🐎", family:"horse",  tier:"rare",      effect:{ xpPct:7,    label:"+7% XP" } },
    { id:"mount_lipizzaner",    name:"Lipizzaner",    sym:"🐎", family:"horse",  tier:"epic",      effect:{ xpPct:11,   label:"+11% XP" } },
    { id:"mount_black_stallion",name:"Black Stallion",sym:"🐎", family:"horse",  tier:"epic",      effect:{ coinPct:16, label:"+16% coins" } },
    { id:"mount_white_charger", name:"White Charger", sym:"🐎", family:"horse",  tier:"legendary", effect:{ xpPct:15,   label:"+15% XP" } },
    { id:"mount_nightmare",     name:"Nightmare",     sym:"🐴", family:"horse",  tier:"legendary", effect:{ coinPct:22, label:"+22% coins" } },

    // ---- WOLVES (8) ----
    { id:"mount_grey_wolf",     name:"Grey Wolf",     sym:"🐺", family:"wolf",   tier:"common",    effect:{ coinPct:5,  label:"+5% coins" } },
    { id:"mount_timber_wolf",   name:"Timber Wolf",   sym:"🐺", family:"wolf",   tier:"common",    effect:{ coinPct:5,  label:"+5% coins" } },
    { id:"mount_red_wolf",      name:"Red Wolf",      sym:"🐺", family:"wolf",   tier:"uncommon",  effect:{ coinPct:8,  label:"+8% coins" } },
    { id:"mount_arctic_wolf",   name:"Arctic Wolf",   sym:"🐺", family:"wolf",   tier:"uncommon",  effect:{ energySave:1, label:"-1 energy" } },
    { id:"mount_direwolf",      name:"Direwolf",      sym:"🐺", family:"wolf",   tier:"rare",      effect:{ xpPct:9,    label:"+9% XP" } },
    { id:"mount_frost_wolf",    name:"Frost Wolf",    sym:"🐺", family:"wolf",   tier:"rare",      effect:{ energySave:2, label:"-2 energy" } },
    { id:"mount_shadow_wolf",   name:"Shadow Wolf",   sym:"🐺", family:"wolf",   tier:"epic",      effect:{ xpPct:13,   label:"+13% XP" } },
    { id:"mount_hellhound",     name:"Hellhound",     sym:"🐺", family:"wolf",   tier:"legendary", effect:{ xpPct:18,   label:"+18% XP" } },

    // ---- BIG CATS (9) ----
    { id:"mount_lioness",       name:"Lioness",       sym:"🐆", family:"cat",    tier:"uncommon",  effect:{ coinPct:8,  label:"+8% coins" } },
    { id:"mount_lion",          name:"Lion",          sym:"🦁", family:"cat",    tier:"rare",      effect:{ xpPct:10,   label:"+10% XP" } },
    { id:"mount_bengal_tiger",  name:"Bengal Tiger",  sym:"🐅", family:"cat",    tier:"rare",      effect:{ coinPct:12, label:"+12% coins" } },
    { id:"mount_siberian_tiger",name:"Siberian Tiger",sym:"🐅", family:"cat",    tier:"epic",      effect:{ coinPct:15, label:"+15% coins" } },
    { id:"mount_white_tiger",   name:"White Tiger",   sym:"🐅", family:"cat",    tier:"epic",      effect:{ xpPct:14,   label:"+14% XP" } },
    { id:"mount_black_panther", name:"Black Panther", sym:"🐆", family:"cat",    tier:"epic",      effect:{ energySave:3, label:"-3 energy" } },
    { id:"mount_snow_leopard",  name:"Snow Leopard",  sym:"🐆", family:"cat",    tier:"rare",      effect:{ xpPct:9,    label:"+9% XP" } },
    { id:"mount_cheetah",       name:"Cheetah",       sym:"🐆", family:"cat",    tier:"rare",      effect:{ xpPct:8,    label:"+8% XP" } },
    { id:"mount_sabertooth",    name:"Sabertooth",    sym:"🐅", family:"cat",    tier:"legendary", effect:{ xpPct:18,   label:"+18% XP" } },

    // ---- BEARS (6) ----
    { id:"mount_black_bear",    name:"Black Bear",    sym:"🐻", family:"bear",   tier:"common",    effect:{ coinPct:5,  label:"+5% coins" } },
    { id:"mount_brown_bear",    name:"Brown Bear",    sym:"🐻", family:"bear",   tier:"common",    effect:{ coinPct:6,  label:"+6% coins" } },
    { id:"mount_grizzly",       name:"Grizzly",       sym:"🐻", family:"bear",   tier:"uncommon",  effect:{ coinPct:9,  label:"+9% coins" } },
    { id:"mount_polar_bear",    name:"Polar Bear",    sym:"🐻‍❄️", family:"bear",   tier:"rare",      effect:{ energySave:2, label:"-2 energy" } },
    { id:"mount_cave_bear",     name:"Cave Bear",     sym:"🐻", family:"bear",   tier:"epic",      effect:{ xpPct:12,   label:"+12% XP" } },
    { id:"mount_spirit_bear",   name:"Spirit Bear",   sym:"🐻", family:"bear",   tier:"legendary", effect:{ xpPct:16,   label:"+16% XP" } },

    // ---- BIRDS OF PREY (8) ----
    { id:"mount_hawk",          name:"Hawk",          sym:"🦅", family:"bird",   tier:"uncommon",  effect:{ xpPct:6,    label:"+6% XP" } },
    { id:"mount_falcon",        name:"Falcon",        sym:"🦅", family:"bird",   tier:"uncommon",  effect:{ xpPct:6,    label:"+6% XP" } },
    { id:"mount_owl",           name:"Owl",           sym:"🦉", family:"bird",   tier:"uncommon",  effect:{ xpPct:7,    label:"+7% XP" } },
    { id:"mount_eagle",         name:"Eagle",         sym:"🦅", family:"bird",   tier:"rare",      effect:{ xpPct:10,   label:"+10% XP" } },
    { id:"mount_bald_eagle",    name:"Bald Eagle",    sym:"🦅", family:"bird",   tier:"rare",      effect:{ xpPct:11,   label:"+11% XP" } },
    { id:"mount_golden_eagle",  name:"Golden Eagle",  sym:"🦅", family:"bird",   tier:"epic",      effect:{ coinPct:14, label:"+14% coins" } },
    { id:"mount_phoenix",       name:"Phoenix",       sym:"🔥", family:"bird",   tier:"legendary", effect:{ xpPct:20,   label:"+20% XP" } },
    { id:"mount_roc",           name:"Roc",           sym:"🦅", family:"bird",   tier:"mythic",    effect:{ coinPct:28, label:"+28% coins" } },

    // ---- REPTILES (4) ----
    { id:"mount_giant_tortoise",name:"Giant Tortoise",sym:"🐢", family:"reptile",tier:"common",    effect:{ energySave:1, label:"-1 energy" } },
    { id:"mount_giant_iguana",  name:"Giant Iguana",  sym:"🦎", family:"reptile",tier:"uncommon",  effect:{ coinPct:7,  label:"+7% coins" } },
    { id:"mount_komodo_dragon", name:"Komodo Dragon", sym:"🦎", family:"reptile",tier:"rare",      effect:{ xpPct:9,    label:"+9% XP" } },
    { id:"mount_crocodile",     name:"Crocodile",     sym:"🐊", family:"reptile",tier:"epic",      effect:{ coinPct:14, label:"+14% coins" } },

    // ---- DRAGONS (8) ----
    { id:"mount_wyvern",        name:"Wyvern",        sym:"🐲", family:"dragon", tier:"epic",      effect:{ xpPct:13,   label:"+13% XP" } },
    { id:"mount_drake",         name:"Young Drake",   sym:"🐲", family:"dragon", tier:"epic",      effect:{ coinPct:14, label:"+14% coins" } },
    { id:"mount_eastern_dragon",name:"Eastern Dragon",sym:"🐉", family:"dragon", tier:"legendary", effect:{ xpPct:18,   label:"+18% XP" } },
    { id:"mount_red_dragon",    name:"Red Dragon",    sym:"🐉", family:"dragon", tier:"legendary", effect:{ coinPct:22, label:"+22% coins" } },
    { id:"mount_blue_dragon",   name:"Blue Dragon",   sym:"🐉", family:"dragon", tier:"legendary", effect:{ xpPct:20,   label:"+20% XP" } },
    { id:"mount_green_dragon",  name:"Green Dragon",  sym:"🐉", family:"dragon", tier:"legendary", effect:{ coinPct:24, label:"+24% coins" } },
    { id:"mount_black_dragon",  name:"Black Dragon",  sym:"🐉", family:"dragon", tier:"mythic",    effect:{ energySave:4, label:"-4 energy" } },
    { id:"mount_storm_dragon",  name:"Storm Dragon",  sym:"🐉", family:"dragon", tier:"mythic",    effect:{ xpPct:30,   label:"+30% XP" } },

    // ---- MYTHICAL (7) ----
    { id:"mount_pegasus",       name:"Pegasus",       sym:"🦄", family:"mythical",tier:"epic",     effect:{ xpPct:12,   label:"+12% XP" } },
    { id:"mount_griffin",       name:"Griffin",       sym:"🦅", family:"mythical",tier:"epic",     effect:{ coinPct:15, label:"+15% coins" } },
    { id:"mount_hippogriff",    name:"Hippogriff",    sym:"🦅", family:"mythical",tier:"epic",     effect:{ xpPct:13,   label:"+13% XP" } },
    { id:"mount_unicorn",       name:"Unicorn",       sym:"🦄", family:"mythical",tier:"legendary",effect:{ xpPct:20,   label:"+20% XP" } },
    { id:"mount_manticore",     name:"Manticore",     sym:"🦁", family:"mythical",tier:"legendary",effect:{ coinPct:22, label:"+22% coins" } },
    { id:"mount_kirin",         name:"Kirin",         sym:"🐉", family:"mythical",tier:"mythic",   effect:{ xpPct:32,   label:"+32% XP" } },
    { id:"mount_sphinx",        name:"Sphinx",        sym:"🐱", family:"mythical",tier:"mythic",   effect:{ coinPct:30, label:"+30% coins" } },

    // ---- WOODLAND / FOREST (8) ----
    { id:"mount_reindeer",      name:"Reindeer",      sym:"🦌", family:"forest", tier:"common",    effect:{ coinPct:5,  label:"+5% coins" } },
    { id:"mount_caribou",       name:"Caribou",       sym:"🦌", family:"forest", tier:"common",    effect:{ coinPct:6,  label:"+6% coins" } },
    { id:"mount_stag",          name:"Stag",          sym:"🦌", family:"forest", tier:"uncommon",  effect:{ xpPct:6,    label:"+6% XP" } },
    { id:"mount_elk",           name:"Elk",           sym:"🦌", family:"forest", tier:"uncommon",  effect:{ coinPct:8,  label:"+8% coins" } },
    { id:"mount_moose",         name:"Moose",         sym:"🫎", family:"forest", tier:"uncommon",  effect:{ energySave:1, label:"-1 energy" } },
    { id:"mount_mountain_goat", name:"Mountain Goat", sym:"🐐", family:"forest", tier:"common",    effect:{ energySave:1, label:"-1 energy" } },
    { id:"mount_tusked_boar",   name:"Tusked Boar",   sym:"🐗", family:"forest", tier:"rare",      effect:{ coinPct:11, label:"+11% coins" } },
    { id:"mount_ram",           name:"Battle Ram",    sym:"🐏", family:"forest", tier:"rare",      effect:{ coinPct:11, label:"+11% coins" } },

    // ---- CATTLE / BURDEN (5) ----
    { id:"mount_ox",            name:"Ox",            sym:"🐂", family:"cattle", tier:"common",    effect:{ coinPct:5,  label:"+5% coins" } },
    { id:"mount_bull",          name:"Bull",          sym:"🐂", family:"cattle", tier:"common",    effect:{ coinPct:6,  label:"+6% coins" } },
    { id:"mount_bison",         name:"Bison",         sym:"🦬", family:"cattle", tier:"uncommon",  effect:{ coinPct:8,  label:"+8% coins" } },
    { id:"mount_yak",           name:"Yak",           sym:"🐃", family:"cattle", tier:"uncommon",  effect:{ energySave:2, label:"-2 energy" } },
    { id:"mount_auroch",        name:"Auroch",        sym:"🐂", family:"cattle", tier:"rare",      effect:{ coinPct:12, label:"+12% coins" } },

    // ---- UNDEAD (5) ----
    { id:"mount_skeletal_horse",name:"Skeletal Horse",sym:"💀", family:"undead", tier:"rare",      effect:{ energySave:2, label:"-2 energy" } },
    { id:"mount_skeletal_wolf", name:"Skeletal Wolf", sym:"💀", family:"undead", tier:"rare",      effect:{ xpPct:9,    label:"+9% XP" } },
    { id:"mount_wraith_steed",  name:"Wraith Steed",  sym:"👻", family:"undead", tier:"epic",      effect:{ coinPct:15, label:"+15% coins" } },
    { id:"mount_bone_drake",    name:"Bone Drake",    sym:"🐲", family:"undead", tier:"legendary", effect:{ xpPct:17,   label:"+17% XP" } },
    { id:"mount_lich_mount",    name:"Lich Mount",    sym:"☠️", family:"undead", tier:"mythic",    effect:{ xpPct:28,   label:"+28% XP" } },

    // ---- ELEMENTAL (6) ----
    { id:"mount_magma_lizard",  name:"Magma Lizard",  sym:"🦎", family:"elemental",tier:"rare",    effect:{ xpPct:9,    label:"+9% XP" } },
    { id:"mount_crystal_stag",  name:"Crystal Stag",  sym:"🦌", family:"elemental",tier:"epic",    effect:{ coinPct:14, label:"+14% coins" } },
    { id:"mount_sand_wyrm",     name:"Sand Wyrm",     sym:"🐍", family:"elemental",tier:"epic",    effect:{ xpPct:13,   label:"+13% XP" } },
    { id:"mount_storm_serpent", name:"Storm Serpent", sym:"🐍", family:"elemental",tier:"legendary",effect:{ xpPct:17,   label:"+17% XP" } },
    { id:"mount_frost_mammoth", name:"Frost Mammoth", sym:"🦣", family:"elemental",tier:"legendary",effect:{ coinPct:22, label:"+22% coins" } },
    { id:"mount_treant_steed",  name:"Treant Steed",  sym:"🌳", family:"elemental",tier:"epic",    effect:{ energySave:3, label:"-3 energy" } },

    // ---- INSECTOID (4) ----
    { id:"mount_giant_beetle",  name:"Giant Beetle",  sym:"🪲", family:"insect", tier:"uncommon",  effect:{ coinPct:7,  label:"+7% coins" } },
    { id:"mount_mantis",        name:"Giant Mantis",  sym:"🦗", family:"insect", tier:"rare",      effect:{ xpPct:9,    label:"+9% XP" } },
    { id:"mount_giant_scorpion",name:"Giant Scorpion",sym:"🦂", family:"insect", tier:"rare",      effect:{ coinPct:11, label:"+11% coins" } },
    { id:"mount_giant_spider",  name:"Giant Spider",  sym:"🕷️", family:"insect", tier:"epic",      effect:{ coinPct:14, label:"+14% coins" } },

    // ---- AQUATIC (3) ----
    { id:"mount_giant_otter",   name:"Giant Otter",   sym:"🦦", family:"aquatic",tier:"common",    effect:{ coinPct:5,  label:"+5% coins" } },
    { id:"mount_hippocampus",   name:"Hippocampus",   sym:"🐴", family:"aquatic",tier:"rare",      effect:{ xpPct:9,    label:"+9% XP" } },
    { id:"mount_sea_serpent",   name:"Sea Serpent",   sym:"🐍", family:"aquatic",tier:"legendary", effect:{ coinPct:22, label:"+22% coins" } },

    // ---- SMALL / WHIMSICAL (3) ----
    { id:"mount_giant_rabbit",  name:"Giant Rabbit",  sym:"🐇", family:"small",  tier:"common",    effect:{ coinPct:4,  label:"+4% coins" } },
    { id:"mount_capybara",      name:"Capybara",      sym:"🐹", family:"small",  tier:"common",    effect:{ energySave:1, label:"-1 energy" } },
    { id:"mount_donkey",        name:"Donkey",        sym:"🫏", family:"horse",  tier:"common",    effect:{ coinPct:4,  label:"+4% coins" } },
    { id:"mount_pony",          name:"Pony",          sym:"🐎", family:"horse",  tier:"common",    effect:{ coinPct:4,  label:"+4% coins" } },
    { id:"mount_llama",         name:"Llama",         sym:"🦙", family:"cattle", tier:"common",    effect:{ coinPct:5,  label:"+5% coins" } },
    { id:"mount_alpaca",        name:"Alpaca",        sym:"🦙", family:"cattle", tier:"common",    effect:{ coinPct:5,  label:"+5% coins" } },
    { id:"mount_pack_mule",     name:"Pack Mule",     sym:"🫏", family:"cattle", tier:"common",    effect:{ coinPct:6,  label:"+6% coins" } },
    { id:"mount_riding_boar",   name:"Riding Boar",   sym:"🐗", family:"forest", tier:"common",    effect:{ coinPct:5,  label:"+5% coins" } },
    { id:"mount_sheepdog",      name:"Herder Dog",    sym:"🐕", family:"wolf",   tier:"common",    effect:{ coinPct:4,  label:"+4% coins" } },
    { id:"mount_riding_goat",   name:"Riding Goat",   sym:"🐐", family:"small",  tier:"common",    effect:{ coinPct:5,  label:"+5% coins" } },
    // v9.7 — extra visual mount chase targets.
    { id:"mount_moon_moth",     name:"Moon Moth Glider", sym:"🦋", family:"insect", tier:"rare",      effect:{ xpPct:7,    label:"+7% XP" } },
    { id:"mount_amber_raptor",  name:"Amber Raptor",     sym:"🦖", family:"reptile",tier:"rare",      effect:{ xpPct:8,    label:"+8% XP" } },
    { id:"mount_chrome_rhino",  name:"Chrome Rhino",     sym:"🦏", family:"cattle", tier:"epic",      effect:{ energySave:3, coinPct:8, label:"-3 energy, +8% coins" } },
    { id:"mount_reef_shark",    name:"Reef Shark Saddle",sym:"🦈", family:"aquatic",tier:"epic",      effect:{ coinPct:11, label:"+11% coins" } },
    { id:"mount_neon_kitsune",  name:"Neon Kitsune",     sym:"🦊", family:"mythical",tier:"legendary",effect:{ xpPct:12, coinPct:12, label:"+12% XP, +12% coins" } },
    { id:"mount_jade_cloud_drake", name:"Jade Cloud Drake", sym:"🐉", family:"dragon",tier:"legendary",effect:{ xpPct:14, coinPct:10, label:"+14% XP, +10% coins" } },
    { id:"mount_glass_jelly",   name:"Glass Jelly Ray",  sym:"🪼", family:"aquatic",tier:"mythic",    effect:{ energySave:5, xpPct:12, label:"+12% XP, -5 energy" } },
    { id:"mount_eclipse_pegasus", name:"Eclipse Pegasus", sym:"🦄", family:"mythical",tier:"mythic",  effect:{ xpPct:26, coinPct:12, label:"+26% XP, +12% coins" } }
  ];

  /* Index by tier for quick rolls. */
  var CR_MOUNTS_BY_TIER = (function(){
    var t = { common:[], uncommon:[], rare:[], epic:[], legendary:[], mythic:[] };
    CR_MOUNTS_FULL.forEach(function(m){ t[m.tier] = t[m.tier] || []; t[m.tier].push(m); });
    return t;
  })();

  /* Index by family. */
  var CR_MOUNTS_BY_FAMILY = (function(){
    var f = {};
    CR_MOUNTS_FULL.forEach(function(m){ (f[m.family] = f[m.family] || []).push(m); });
    return f;
  })();

  if (typeof window !== "undefined"){
    window.CR_SPECIES = CR_SPECIES;
    window.CR_CLASSES = CR_CLASSES;
    window.CR_HAIR_STYLES = CR_HAIR_STYLES;
    window.CR_HAIR_LABELS = CR_HAIR_LABELS;
    window.CR_HAIR_COLORS = CR_HAIR_COLORS;
    window.CR_EYE_COLORS = CR_EYE_COLORS;
    window.CR_MOUNTS_FULL = CR_MOUNTS_FULL;
    window.CR_MOUNTS_BY_TIER = CR_MOUNTS_BY_TIER;
    window.CR_MOUNTS_BY_FAMILY = CR_MOUNTS_BY_FAMILY;
    window.CR_FAMILIES = CR_FAMILIES;
    window.CR_MOUNT_PITY = CR_MOUNT_PITY;
  }

  /* ---------- COLOR HELPERS ---------- */
  function lighten(hex, amt){ var c=hexToRgb(hex); return rgbToHex({ r:Math.round(c.r+(255-c.r)*amt), g:Math.round(c.g+(255-c.g)*amt), b:Math.round(c.b+(255-c.b)*amt) }); }
  function darken(hex, amt){ var c=hexToRgb(hex); return rgbToHex({ r:Math.round(c.r*(1-amt)), g:Math.round(c.g*(1-amt)), b:Math.round(c.b*(1-amt)) }); }
  function hexToRgb(h){ h=String(h||"#000000").replace("#",""); if (h.length===3) h=h.split("").map(function(c){return c+c;}).join(""); return { r:parseInt(h.slice(0,2),16)||0, g:parseInt(h.slice(2,4),16)||0, b:parseInt(h.slice(4,6),16)||0 }; }
  function rgbToHex(c){ var t=function(n){ var s=Math.max(0,Math.min(255,n|0)).toString(16); return s.length<2?"0"+s:s; }; return "#"+t(c.r)+t(c.g)+t(c.b); }
  function clampi(v, lo, hi){ v = v|0; return v < lo ? lo : v > hi ? hi : v; }

  /* ---------- LAYERED CHARACTER SVG ---------- */

  function crCharacterPortraitSvg(appearance, equippedMountId){
    var a = appearance || {};
    var species = CR_SPECIES[a.species] || CR_SPECIES[a.race] || CR_SPECIES.human;
    var klass = CR_CLASSES[a.classKey] || CR_CLASSES[a.cls] || CR_CLASSES.warrior;
    var skin = species.skinTones[clampi(a.skinIdx|0, 0, species.skinTones.length-1)] || species.skinTones[0];
    var hairStyle = CR_HAIR_STYLES.indexOf(a.hair) >= 0 ? a.hair : "short";
    var hairColor = CR_HAIR_COLORS[a.hairColor] || CR_HAIR_COLORS.espresso;
    var eyeColor = CR_EYE_COLORS[a.eyeColor] || CR_EYE_COLORS.amber;
    var faceFx = a.face || "calm";
    var bgGradId = "cr-bg-" + (a.classKey||a.cls||"warrior");
    return '<svg class="cr-portrait" data-species="' + (a.species||a.race||"human") + '" data-class="' + (a.classKey||a.cls||"warrior") + '" viewBox="0 0 200 220" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="' + species.label + ' ' + klass.label + ' portrait">' +
      '<defs>' +
        '<linearGradient id="' + bgGradId + '" x2="0" y2="1">' +
          '<stop stop-color="' + lighten(klass.primary, 0.2) + '" stop-opacity="0.35"/>' +
          '<stop offset="1" stop-color="' + darken(klass.primary, 0.6) + '" stop-opacity="0.6"/>' +
        '</linearGradient>' +
        '<radialGradient id="cr-glow-fae" cx="0.5" cy="0.35" r="0.6"><stop stop-color="#E5C5F7" stop-opacity="0.6"/><stop offset="1" stop-color="#E5C5F7" stop-opacity="0"/></radialGradient>' +
      '</defs>' +
      '<rect width="200" height="220" rx="12" fill="#101325"/>' +
      '<rect width="200" height="220" rx="12" fill="url(#' + bgGradId + ')"/>' +
      '<path d="M40 200 Q100 60 160 200 Z" fill="' + darken(klass.primary, 0.3) + '" opacity="0.25"/>' +
      '<ellipse cx="100" cy="204" rx="58" ry="8" fill="#05080F" opacity="0.7"/>' +
      (species.trait === "glow" ? '<circle cx="100" cy="80" r="50" fill="url(#cr-glow-fae)"/>' : "") +
      crBodySvg(species, klass, skin) +
      crOutfitSvg(klass, species) +
      crCloakSvg(klass) +
      crHeadSvg(species, skin) +
      crSpeciesFeaturesSvg(species, skin) +
      crFaceSvg(species, skin, eyeColor, faceFx) +
      crHairSvg(hairStyle, hairColor, species) +
      crEmblemSvg(klass) +
      crWeaponSvg(klass) +
      (equippedMountId ? crMountBadgeSvg(equippedMountId) : "") +
    '</svg>';
  }

  function crBodySvg(species, klass, skin){
    var torsoW = 36 * (species.faceWidth || 1);
    var torsoX1 = 100 - torsoW/2, torsoX2 = 100 + torsoW/2;
    var shoulderY = 118, waistY = 168;
    return '<g class="cr-body">' +
      '<rect x="92" y="105" width="16" height="15" fill="' + skin + '" stroke="#000" stroke-width="1.2" opacity="0.95"/>' +
      '<path d="M' + torsoX1 + ' ' + shoulderY + ' Q100 110 ' + torsoX2 + ' ' + shoulderY + ' L' + (torsoX2+4) + ' ' + waistY + ' Q100 ' + (waistY+8) + ' ' + (torsoX1-4) + ' ' + waistY + ' Z" fill="' + skin + '" stroke="#000" stroke-width="1.2"/>' +
      '<path d="M' + (torsoX1-2) + ' ' + (shoulderY+2) + ' Q' + (torsoX1-18) + ' 140 ' + (torsoX1-12) + ' 178 L' + (torsoX1-4) + ' 178 Q' + (torsoX1+2) + ' 150 ' + (torsoX1+4) + ' ' + (shoulderY+4) + ' Z" fill="' + skin + '" stroke="#000" stroke-width="1.2"/>' +
      '<path d="M' + (torsoX2+2) + ' ' + (shoulderY+2) + ' Q' + (torsoX2+18) + ' 140 ' + (torsoX2+12) + ' 178 L' + (torsoX2+4) + ' 178 Q' + (torsoX2-2) + ' 150 ' + (torsoX2-4) + ' ' + (shoulderY+4) + ' Z" fill="' + skin + '" stroke="#000" stroke-width="1.2"/>' +
      '<circle cx="' + (torsoX1-10) + '" cy="183" r="5" fill="' + skin + '" stroke="#000" stroke-width="1.2"/>' +
      '<circle cx="' + (torsoX2+10) + '" cy="183" r="5" fill="' + skin + '" stroke="#000" stroke-width="1.2"/>' +
    '</g>';
  }

  function crOutfitSvg(klass, species){
    var p = klass.primary, s = klass.secondary;
    if (klass.outfit === "plate"){
      return '<g class="cr-outfit-plate">' +
        '<path d="M68 122 Q100 113 132 122 L138 168 Q100 178 62 168 Z" fill="' + p + '" stroke="#000" stroke-width="2"/>' +
        '<path d="M70 124 Q100 118 130 124 L132 138 Q100 142 68 138 Z" fill="' + lighten(p, 0.25) + '" opacity="0.55"/>' +
        '<rect x="62" y="158" width="76" height="9" fill="#3D2C1C" stroke="#000" stroke-width="1.5"/>' +
        '<rect x="93" y="159" width="14" height="7" fill="' + s + '" stroke="#000" stroke-width="1.2"/>' +
        '<ellipse cx="64" cy="124" rx="10" ry="9" fill="' + p + '" stroke="#000" stroke-width="2"/>' +
        '<ellipse cx="136" cy="124" rx="10" ry="9" fill="' + p + '" stroke="#000" stroke-width="2"/>' +
        '<path d="M58 121 Q64 116 70 121" fill="none" stroke="' + s + '" stroke-width="2"/>' +
        '<path d="M130 121 Q136 116 142 121" fill="none" stroke="' + s + '" stroke-width="2"/>' +
      '</g>';
    }
    if (klass.outfit === "robe"){
      return '<g class="cr-outfit-robe">' +
        '<path d="M60 122 Q100 116 140 122 L148 198 Q100 206 52 198 Z" fill="' + p + '" stroke="#000" stroke-width="2"/>' +
        '<path d="M95 122 Q100 118 105 122 L107 196 L93 196 Z" fill="' + s + '" stroke="#000" stroke-width="1.4"/>' +
        '<path d="M62 152 Q100 160 138 152 L137 164 Q100 172 63 164 Z" fill="' + darken(p, 0.3) + '" stroke="#000" stroke-width="1.4"/>' +
        '<path d="M58 124 Q48 154 60 178 L72 176 Q70 152 78 126 Z" fill="' + p + '" stroke="#000" stroke-width="1.4"/>' +
        '<path d="M142 124 Q152 154 140 178 L128 176 Q130 152 122 126 Z" fill="' + p + '" stroke="#000" stroke-width="1.4"/>' +
      '</g>';
    }
    if (klass.outfit === "leather"){
      return '<g class="cr-outfit-leather">' +
        '<path d="M68 122 Q100 116 132 122 L136 174 Q100 182 64 174 Z" fill="' + p + '" stroke="#000" stroke-width="2"/>' +
        '<path d="M82 124 L78 174" stroke="' + darken(p, 0.4) + '" stroke-width="2.5" fill="none"/>' +
        '<path d="M118 124 L122 174" stroke="' + darken(p, 0.4) + '" stroke-width="2.5" fill="none"/>' +
        '<rect x="76" y="148" width="6" height="5" fill="' + s + '" stroke="#000" stroke-width="1"/>' +
        '<rect x="118" y="148" width="6" height="5" fill="' + s + '" stroke="#000" stroke-width="1"/>' +
        '<rect x="64" y="164" width="72" height="8" fill="#3D2C1C" stroke="#000" stroke-width="1.5"/>' +
      '</g>';
    }
    if (klass.outfit === "motley"){
      return '<g class="cr-outfit-motley">' +
        '<path d="M68 122 Q100 116 132 122 L136 178 Q100 184 64 178 Z" fill="' + p + '" stroke="#000" stroke-width="2"/>' +
        '<path d="M100 116 L100 184" stroke="#000" stroke-width="1.5"/>' +
        '<path d="M100 116 Q117 117 132 122 L136 178 Q117 182 100 184 Z" fill="' + s + '" opacity="0.95"/>' +
        '<circle cx="92" cy="138" r="2" fill="' + s + '"/>' +
        '<circle cx="92" cy="150" r="2" fill="' + s + '"/>' +
        '<circle cx="108" cy="138" r="2" fill="' + p + '"/>' +
        '<circle cx="108" cy="150" r="2" fill="' + p + '"/>' +
      '</g>';
    }
    if (klass.outfit === "woven"){
      return '<g class="cr-outfit-woven">' +
        '<path d="M64 122 Q100 116 136 122 L142 192 Q100 200 58 192 Z" fill="' + p + '" stroke="#000" stroke-width="2"/>' +
        '<path d="M70 130 Q100 140 130 130 M68 150 Q100 160 132 150 M70 170 Q100 178 130 170" stroke="' + s + '" stroke-width="1.5" fill="none"/>' +
        '<path d="M82 138 Q86 134 90 138 Q86 142 82 138 Z" fill="' + s + '"/>' +
        '<path d="M114 158 Q118 154 122 158 Q118 162 114 158 Z" fill="' + s + '"/>' +
      '</g>';
    }
    return "";
  }

  function crCloakSvg(klass){
    if (klass.outfit !== "plate" && klass.outfit !== "leather" && klass.outfit !== "robe") return "";
    var c = darken(klass.primary, 0.35);
    return '<g class="cr-cloak" opacity="0.85">' +
      '<path d="M58 116 Q100 110 142 116 L156 196 Q100 204 44 196 Z" fill="' + c + '" stroke="#000" stroke-width="1.5"/>' +
      '<path d="M100 116 L100 200" stroke="' + darken(c, 0.3) + '" stroke-width="2" opacity="0.5"/>' +
    '</g>';
  }

  function crHeadSvg(species, skin){
    var w = 42 * species.faceWidth;
    var h = 48 * species.baseHeight;
    var cx = 100, cy = 78;
    return '<g class="cr-head">' +
      '<path d="M' + (cx-w/2) + ' ' + cy + ' Q' + cx + ' ' + (cy-h/2) + ' ' + (cx+w/2) + ' ' + cy + ' Q' + (cx+w/2-2) + ' ' + (cy+h/2) + ' ' + cx + ' ' + (cy+h/2+4) + ' Q' + (cx-w/2+2) + ' ' + (cy+h/2) + ' ' + (cx-w/2) + ' ' + cy + ' Z" fill="' + skin + '" stroke="#000" stroke-width="1.4"/>' +
      '<path d="M' + (cx-w/2+6) + ' ' + (cy-4) + ' Q' + cx + ' ' + (cy-h/2+4) + ' ' + (cx+w/2-6) + ' ' + (cy-4) + ' Q' + cx + ' ' + (cy-4) + ' ' + (cx-w/2+6) + ' ' + (cy-4) + ' Z" fill="' + lighten(skin, 0.12) + '" opacity="0.45"/>' +
    '</g>';
  }

  function crSpeciesFeaturesSvg(species, skin){
    var out = "";
    var ear = species.earShape;
    if (ear === "round"){
      out += '<ellipse cx="76" cy="80" rx="5" ry="7" fill="' + skin + '" stroke="#000" stroke-width="1.2"/>';
      out += '<ellipse cx="124" cy="80" rx="5" ry="7" fill="' + skin + '" stroke="#000" stroke-width="1.2"/>';
    } else if (ear === "pointed_long"){
      out += '<path d="M77 84 L66 66 L80 78 Z" fill="' + skin + '" stroke="#000" stroke-width="1.2"/>';
      out += '<path d="M123 84 L134 66 L120 78 Z" fill="' + skin + '" stroke="#000" stroke-width="1.2"/>';
    } else if (ear === "pointed_back"){
      out += '<path d="M76 82 L62 86 L78 90 Z" fill="' + skin + '" stroke="#000" stroke-width="1.2"/>';
      out += '<path d="M124 82 L138 86 L122 90 Z" fill="' + skin + '" stroke="#000" stroke-width="1.2"/>';
    } else if (ear === "pointed_huge"){
      out += '<path d="M77 78 L56 56 L80 82 Z" fill="' + skin + '" stroke="#000" stroke-width="1.2"/>';
      out += '<path d="M123 78 L144 56 L120 82 Z" fill="' + skin + '" stroke="#000" stroke-width="1.2"/>';
    } else if (ear === "cat"){
      out += '<path d="M78 60 L84 50 L88 62 Z" fill="' + skin + '" stroke="#000" stroke-width="1.2"/>';
      out += '<path d="M122 60 L116 50 L112 62 Z" fill="' + skin + '" stroke="#000" stroke-width="1.2"/>';
      out += '<path d="M81 58 L84 53 L86 60 Z" fill="' + darken(skin, 0.3) + '"/>';
      out += '<path d="M119 58 L116 53 L114 60 Z" fill="' + darken(skin, 0.3) + '"/>';
    } else if (ear === "wolf"){
      out += '<path d="M76 62 L80 48 L88 64 Z" fill="' + skin + '" stroke="#000" stroke-width="1.2"/>';
      out += '<path d="M124 62 L120 48 L112 64 Z" fill="' + skin + '" stroke="#000" stroke-width="1.2"/>';
      out += '<path d="M80 60 L82 52 L86 62 Z" fill="' + darken(skin, 0.3) + '"/>';
      out += '<path d="M120 60 L118 52 L114 62 Z" fill="' + darken(skin, 0.3) + '"/>';
    } else if (ear === "frill"){
      out += '<path d="M74 70 L62 64 L70 74 L60 78 L72 82 L62 90 L78 88 Z" fill="' + skin + '" stroke="#000" stroke-width="1.2"/>';
      out += '<path d="M126 70 L138 64 L130 74 L140 78 L128 82 L138 90 L122 88 Z" fill="' + skin + '" stroke="#000" stroke-width="1.2"/>';
    }
    if (species.trait === "horns"){
      out += '<path d="M82 56 Q78 42 88 36 Q86 48 90 58 Z" fill="#3A1F1F" stroke="#000" stroke-width="1.2"/>';
      out += '<path d="M118 56 Q122 42 112 36 Q114 48 110 58 Z" fill="#3A1F1F" stroke="#000" stroke-width="1.2"/>';
    }
    if (species.trait === "tusks"){
      out += '<path d="M92 96 L90 104 L94 104 Z" fill="#F2EAD0" stroke="#000" stroke-width="0.8"/>';
      out += '<path d="M108 96 L110 104 L106 104 Z" fill="#F2EAD0" stroke="#000" stroke-width="0.8"/>';
    }
    if (species.trait === "snaggle"){
      out += '<path d="M97 97 L96 103 L99 99 Z" fill="#F2EAD0" stroke="#000" stroke-width="0.6"/>';
    }
    if (species.trait === "muzzle_cat"){
      out += '<ellipse cx="100" cy="92" rx="10" ry="6" fill="' + lighten(skin, 0.1) + '" stroke="#000" stroke-width="1"/>';
      out += '<path d="M97 94 L100 99 L103 94 Z" fill="#2A1A12"/>';
      out += '<line x1="78" y1="93" x2="92" y2="94" stroke="#000" stroke-width="0.6"/>';
      out += '<line x1="78" y1="98" x2="92" y2="96" stroke="#000" stroke-width="0.6"/>';
      out += '<line x1="108" y1="94" x2="122" y2="93" stroke="#000" stroke-width="0.6"/>';
      out += '<line x1="108" y1="96" x2="122" y2="98" stroke="#000" stroke-width="0.6"/>';
    }
    if (species.trait === "muzzle_wolf"){
      out += '<path d="M88 90 Q100 86 112 90 L108 102 Q100 106 92 102 Z" fill="' + lighten(skin, 0.08) + '" stroke="#000" stroke-width="1"/>';
      out += '<ellipse cx="100" cy="92" rx="4" ry="3" fill="#1A1410"/>';
    }
    if (species.trait === "snout_lizard"){
      out += '<path d="M92 90 Q100 88 108 90 L106 100 Q100 104 94 100 Z" fill="' + lighten(skin, 0.1) + '" stroke="#000" stroke-width="1"/>';
      out += '<circle cx="96" cy="93" r="1.4" fill="#000"/>';
      out += '<circle cx="104" cy="93" r="1.4" fill="#000"/>';
    }
    if (species.trait === "beard"){
      out += '<path d="M82 94 Q100 122 118 94 Q116 112 100 116 Q84 112 82 94 Z" fill="' + darken(skin, 0.55) + '" stroke="#000" stroke-width="1.2"/>';
    }
    return out;
  }

  function crFaceSvg(species, skin, eyeColor, faceFx){
    var out = "";
    var trait = species.trait;
    if (trait !== "snout_lizard" && trait !== "muzzle_wolf"){
      var eyeY = 78;
      out += '<ellipse cx="89" cy="' + eyeY + '" rx="5" ry="3.5" fill="#FFF" stroke="#000" stroke-width="1"/>';
      out += '<ellipse cx="111" cy="' + eyeY + '" rx="5" ry="3.5" fill="#FFF" stroke="#000" stroke-width="1"/>';
      out += '<circle cx="89" cy="' + (eyeY+0.5) + '" r="2.4" fill="' + eyeColor + '"/>';
      out += '<circle cx="111" cy="' + (eyeY+0.5) + '" r="2.4" fill="' + eyeColor + '"/>';
      out += '<circle cx="89" cy="' + (eyeY-0.5) + '" r="0.9" fill="#000"/>';
      out += '<circle cx="111" cy="' + (eyeY-0.5) + '" r="0.9" fill="#000"/>';
      if (trait === "sunken"){
        out += '<path d="M82 76 Q89 80 96 76" stroke="#1F1F2A" stroke-width="2" fill="none" opacity="0.6"/>';
        out += '<path d="M104 76 Q111 80 118 76" stroke="#1F1F2A" stroke-width="2" fill="none" opacity="0.6"/>';
      }
      out += '<path d="M82 71 Q89 69 96 71" stroke="#1A1410" stroke-width="2" fill="none" opacity="0.85"/>';
      out += '<path d="M104 71 Q111 69 118 71" stroke="#1A1410" stroke-width="2" fill="none" opacity="0.85"/>';
    }
    if (trait !== "muzzle_cat" && trait !== "muzzle_wolf" && trait !== "snout_lizard"){
      if (faceFx === "smile"){
        out += '<path d="M93 95 Q100 100 107 95" stroke="#3A1F1F" stroke-width="1.4" fill="none"/>';
      } else if (faceFx === "warpaint"){
        out += '<path d="M82 88 L88 100" stroke="#A23B3B" stroke-width="2" opacity="0.8"/>';
        out += '<path d="M118 88 L112 100" stroke="#A23B3B" stroke-width="2" opacity="0.8"/>';
        out += '<line x1="93" y1="95" x2="107" y2="95" stroke="#3A1F1F" stroke-width="1.4"/>';
      } else if (faceFx === "scar"){
        out += '<path d="M97 70 L102 84" stroke="#7A2F2F" stroke-width="1.2"/>';
        out += '<line x1="93" y1="95" x2="107" y2="95" stroke="#3A1F1F" stroke-width="1.4"/>';
      } else {
        out += '<line x1="94" y1="95" x2="106" y2="95" stroke="#3A1F1F" stroke-width="1.4"/>';
      }
    }
    return out;
  }

  function crHairSvg(style, color, species){
    if (style === "bald") return "";
    var h;
    switch(style){
      case "buzz":          h = '<path d="M76 60 Q100 50 124 60 L122 64 Q100 60 78 64 Z" fill="' + color + '" stroke="#000" stroke-width="1.2"/>'; break;
      case "short":         h = '<path d="M76 60 Q100 38 124 60 Q124 76 118 70 Q100 60 82 70 Q76 76 76 60 Z" fill="' + color + '" stroke="#000" stroke-width="1.2"/>'; break;
      case "crop":          h = '<path d="M78 62 Q100 42 122 62 L120 76 Q100 70 80 76 Z" fill="' + color + '" stroke="#000" stroke-width="1.2"/>'; break;
      case "wavy":          h = '<path d="M76 60 Q86 38 100 50 Q114 38 124 60 Q122 78 116 72 Q108 68 100 72 Q92 68 84 72 Q78 78 76 60 Z" fill="' + color + '" stroke="#000" stroke-width="1.2"/>'; break;
      case "curly":         h = '<g fill="' + color + '" stroke="#000" stroke-width="1.2"><circle cx="80" cy="62" r="9"/><circle cx="92" cy="54" r="9"/><circle cx="100" cy="50" r="9"/><circle cx="108" cy="54" r="9"/><circle cx="120" cy="62" r="9"/></g>'; break;
      case "braids":        h = '<path d="M76 60 Q100 38 124 60 L122 76 Q100 70 78 76 Z" fill="' + color + '" stroke="#000" stroke-width="1.2"/>' +
                                '<path d="M74 76 Q72 110 80 130 L86 130 Q82 110 80 80 Z" fill="' + color + '" stroke="#000" stroke-width="1.2"/>' +
                                '<path d="M126 76 Q128 110 120 130 L114 130 Q118 110 120 80 Z" fill="' + color + '" stroke="#000" stroke-width="1.2"/>'; break;
      case "ponytail":      h = '<path d="M76 60 Q100 38 124 60 L122 76 Q100 70 78 76 Z" fill="' + color + '" stroke="#000" stroke-width="1.2"/>' +
                                '<path d="M124 72 Q142 90 132 120 L126 118 Q132 95 120 76 Z" fill="' + color + '" stroke="#000" stroke-width="1.2"/>'; break;
      case "topknot":       h = '<path d="M82 62 Q100 50 118 62 L116 74 Q100 70 84 74 Z" fill="' + color + '" stroke="#000" stroke-width="1.2"/>' +
                                '<ellipse cx="100" cy="48" rx="6" ry="8" fill="' + color + '" stroke="#000" stroke-width="1.2"/>'; break;
      case "long_straight": h = '<path d="M76 60 Q100 38 124 60 L130 130 L120 130 L122 80 Q100 70 78 80 L80 130 L70 130 Z" fill="' + color + '" stroke="#000" stroke-width="1.2"/>'; break;
      case "long_curly":    h = '<path d="M76 60 Q100 38 124 60 L132 100 Q126 110 130 130 L116 130 Q118 110 122 80 Q100 70 78 80 Q82 110 84 130 L70 130 Q74 110 68 100 Z" fill="' + color + '" stroke="#000" stroke-width="1.2"/>'; break;
      case "mohawk":        h = '<path d="M88 76 Q100 40 112 76 L110 78 Q100 56 90 78 Z" fill="' + color + '" stroke="#000" stroke-width="1.2"/>'; break;
      case "spiked":        h = '<g fill="' + color + '" stroke="#000" stroke-width="1.2">' +
                                '<path d="M80 64 L78 44 L88 60 Z"/><path d="M92 60 L92 40 L100 58 Z"/><path d="M108 58 L108 40 L116 60 Z"/><path d="M120 64 L122 44 L114 60 Z"/>' +
                                '<path d="M78 62 Q100 50 122 62 L120 72 Q100 66 80 72 Z"/></g>'; break;
      case "dreadlocks":    h = '<path d="M76 60 Q100 38 124 60 L122 76 Q100 70 78 76 Z" fill="' + color + '" stroke="#000" stroke-width="1.2"/>' +
                                '<g fill="' + color + '" stroke="#000" stroke-width="1">' +
                                '<rect x="74" y="72" width="6" height="38" rx="3"/>' +
                                '<rect x="82" y="74" width="6" height="42" rx="3"/>' +
                                '<rect x="112" y="74" width="6" height="42" rx="3"/>' +
                                '<rect x="120" y="72" width="6" height="38" rx="3"/></g>'; break;
      default:              h = '<path d="M76 60 Q100 38 124 60 L122 76 Q100 70 78 76 Z" fill="' + color + '" stroke="#000" stroke-width="1.2"/>';
    }
    return '<g class="cr-hair">' + h + '</g>';
  }

  function crEmblemSvg(klass){
    var s = klass.secondary;
    var cx = 100, cy = 144;
    var inner;
    switch(klass.emblem){
      case "sword":   inner = '<path d="M' + cx + ' ' + (cy-7) + ' L' + (cx+3) + ' ' + (cy+5) + ' L' + cx + ' ' + (cy+8) + ' L' + (cx-3) + ' ' + (cy+5) + ' Z" fill="' + s + '"/>'; break;
      case "orb":     inner = '<circle cx="' + cx + '" cy="' + cy + '" r="5" fill="' + s + '"/><circle cx="' + (cx-1.5) + '" cy="' + (cy-1.5) + '" r="1.6" fill="#FFF" opacity="0.7"/>'; break;
      case "dagger":  inner = '<path d="M' + cx + ' ' + (cy-7) + ' L' + (cx+2) + ' ' + (cy+4) + ' L' + cx + ' ' + (cy+6) + ' L' + (cx-2) + ' ' + (cy+4) + ' Z" fill="' + s + '"/>'; break;
      case "bow":     inner = '<path d="M' + (cx-5) + ' ' + (cy-6) + ' Q' + cx + ' ' + cy + ' ' + (cx-5) + ' ' + (cy+6) + '" stroke="' + s + '" stroke-width="1.6" fill="none"/><line x1="' + (cx-5) + '" y1="' + (cy-6) + '" x2="' + (cx-5) + '" y2="' + (cy+6) + '" stroke="' + s + '" stroke-width="0.8" stroke-dasharray="2 1"/>'; break;
      case "chalice": inner = '<path d="M' + (cx-4) + ' ' + (cy-5) + ' L' + (cx+4) + ' ' + (cy-5) + ' L' + (cx+2) + ' ' + cy + ' L' + (cx-2) + ' ' + cy + ' Z" fill="' + s + '"/><rect x="' + (cx-1) + '" y="' + cy + '" width="2" height="4" fill="' + s + '"/>'; break;
      case "lute":    inner = '<ellipse cx="' + cx + '" cy="' + (cy+1) + '" rx="5" ry="4" fill="' + s + '"/><rect x="' + (cx-1) + '" y="' + (cy-7) + '" width="2" height="8" fill="' + s + '"/>'; break;
      case "leaf":    inner = '<path d="M' + cx + ' ' + (cy-6) + ' Q' + (cx+5) + ' ' + cy + ' ' + cx + ' ' + (cy+6) + ' Q' + (cx-5) + ' ' + cy + ' ' + cx + ' ' + (cy-6) + ' Z" fill="' + s + '"/>'; break;
      case "shield":  inner = '<path d="M' + (cx-5) + ' ' + (cy-5) + ' L' + (cx+5) + ' ' + (cy-5) + ' L' + (cx+4) + ' ' + (cy+3) + ' L' + cx + ' ' + (cy+7) + ' L' + (cx-4) + ' ' + (cy+3) + ' Z" fill="' + s + '"/>'; break;
      default:        inner = '<circle cx="' + cx + '" cy="' + cy + '" r="5" fill="' + s + '"/>';
    }
    return '<g class="cr-emblem"><circle cx="' + cx + '" cy="' + cy + '" r="9" fill="#1B1F2E" stroke="' + s + '" stroke-width="1.5"/>' + inner + '</g>';
  }

  function crWeaponSvg(klass){
    switch(klass.weapon){
      case "sword":   return '<g class="cr-w-sword"><path d="M150 110 L150 175 L156 178 L156 110 Z" fill="#D6DAE3" stroke="#000" stroke-width="1.4"/><rect x="146" y="178" width="14" height="5" fill="#5C3A1B" stroke="#000" stroke-width="1.2"/><rect x="152" y="183" width="2" height="10" fill="#3A2410"/></g>';
      case "staff":   return '<g class="cr-w-staff"><line x1="153" y1="120" x2="153" y2="200" stroke="#5C3A1B" stroke-width="3"/><circle cx="153" cy="116" r="6" fill="#A8C0FF" stroke="#000" stroke-width="1.2"/><circle cx="153" cy="116" r="2.5" fill="#FFF" opacity="0.7"/></g>';
      case "dagger":  return '<g class="cr-w-dagger"><path d="M150 158 L150 178 L155 180 L155 158 Z" fill="#D6DAE3" stroke="#000" stroke-width="1.2"/><rect x="146" y="180" width="13" height="4" fill="#3A2410"/></g>';
      case "bow":     return '<g class="cr-w-bow"><path d="M48 130 Q40 168 48 198" stroke="#5C3A1B" stroke-width="3" fill="none"/><line x1="48" y1="130" x2="48" y2="198" stroke="#D6DAE3" stroke-width="0.8" stroke-dasharray="3 2"/></g>';
      case "mace":    return '<g class="cr-w-mace"><line x1="153" y1="130" x2="153" y2="200" stroke="#5C3A1B" stroke-width="3"/><circle cx="153" cy="124" r="7" fill="#9E8550" stroke="#000" stroke-width="1.2"/></g>';
      case "lute":    return '<g class="cr-w-lute"><ellipse cx="50" cy="172" rx="14" ry="11" fill="#A2774A" stroke="#000" stroke-width="1.2"/><rect x="46" y="148" width="2" height="24" fill="#5C3A1B"/></g>';
      default:        return "";
    }
  }

  function crMountBadgeSvg(mountId){
    var m = CR_MOUNTS_FULL.filter(function(x){ return x.id === mountId; })[0];
    var sym = m ? m.sym : "🐎";
    return '<g class="cr-mount-badge"><circle cx="170" cy="200" r="14" fill="#0F1322" stroke="#A8C0FF" stroke-width="1.5"/><text x="170" y="206" font-size="18" text-anchor="middle">' + sym + '</text></g>';
  }

  /* ---------- MOUNT PITY + RNG ---------- */

  function crEnsureMountState(s){
    s = s || window.state;
    if (!s || !s.loot) return s;
    if (typeof s.loot.mountProgress !== "number" || !(s.loot.mountProgress >= 0)) s.loot.mountProgress = 0;
    if (!s.loot.mountFamilies || typeof s.loot.mountFamilies !== "object") s.loot.mountFamilies = {};
    return s;
  }

  /* Returns the highest tier the player can guarantee given the current
     mount progress. The progress counter accumulates and gates each tier
     in sequence. */
  function crCurrentMountTier(progress){
    if (progress >= CR_MOUNT_PITY.mythic) return "mythic";
    if (progress >= CR_MOUNT_PITY.legendary) return "legendary";
    if (progress >= CR_MOUNT_PITY.epic) return "epic";
    if (progress >= CR_MOUNT_PITY.rare) return "rare";
    if (progress >= CR_MOUNT_PITY.uncommon) return "uncommon";
    if (progress >= CR_MOUNT_PITY.common) return "common";
    return null;
  }

  /* Tier above the current pity tier (for RNG surprise drops). */
  function crNextTierAbove(progress){
    var cur = crCurrentMountTier(progress);
    var order = ["common","uncommon","rare","epic","legendary","mythic"];
    if (cur === null) return "common";
    var idx = order.indexOf(cur);
    if (idx < 0 || idx >= order.length - 1) return "mythic";
    return order[idx + 1];
  }

  /* Advance the mount-progress counter by `minutes`. If a NEW pity
     threshold is crossed (one we haven't credited yet for this hour
     bracket), returns the rarity of the guaranteed mount drop.
     Otherwise returns null. The caller commits the grant via crGrantMount. */
  function crAdvanceMountProgress(s, minutes){
    s = crEnsureMountState(s);
    if (!s || !s.loot) return null;
    var before = s.loot.mountProgress|0;
    s.loot.mountProgress = before + Math.max(0, minutes|0);
    var after = s.loot.mountProgress|0;
    var order = ["common","uncommon","rare","epic","legendary","mythic"];
    // Check which tier threshold(s) were crossed by this advancement.
    // Each threshold gets credited exactly once per crossing.
    for (var i=0; i<order.length; i++){
      var t = order[i];
      var th = CR_MOUNT_PITY[t];
      if (before < th && after >= th) return t;
    }
    return null;
  }

  /* RNG layer: probability of a surprise-drop of crNextTierAbove(progress)
     this session. Returns the tier to grant, or null. */
  function crRollMountRng(s, sessionMinutes){
    s = crEnsureMountState(s);
    if (!s || !s.loot) return null;
    if (sessionMinutes < CR_RNG_QUALIFYING_MIN) return null;
    var hoursOver = (sessionMinutes - CR_RNG_QUALIFYING_MIN) / 60;
    var p = CR_RNG_BASE_RATE + CR_RNG_PER_HOUR_BONUS * hoursOver;
    if (Math.random() < p) return crNextTierAbove(s.loot.mountProgress|0);
    return null;
  }

  /* Pick a mount from the v8.4 roster by rarity. */
  function crPickMountByRarity(rarity){
    var pool = CR_MOUNTS_BY_TIER[rarity] || [];
    if (!pool.length){
      var TT = window.LOOT_TABLE || [];
      var legacy = TT.filter(function(it){ return it[2] === rarity && it[4] === "mount"; });
      if (legacy.length){
        var l = legacy[Math.floor(Math.random() * legacy.length)];
        return {
          id: window.lootId ? window.lootId(l) : String(l[1]).toLowerCase(),
          name: l[1], sym: l[0], family: "legacy", tier: l[2],
          effect: (window.GEAR_EFFECTS||{})[window.lootId? window.lootId(l):""] || null
        };
      }
      return null;
    }
    return pool[Math.floor(Math.random() * pool.length)];
  }

  /* Grant a guaranteed mount (instance + lootOwned + drops log entry). */
  function crGrantMount(s, rarity, sessionId, reason){
    s = crEnsureMountState(s);
    if (!s) return null;
    var m = crPickMountByRarity(rarity);
    if (!m) return null;
    var iid = (window.uid ? window.uid() : Math.random().toString(36).slice(2,10));
    var aff = null;
    if (m.effect){
      var k = Object.keys(m.effect)[0];
      // skip "label" keys
      if (k === "label") k = Object.keys(m.effect)[1] || null;
      if (k) aff = { id:k, tier:"major", value:m.effect[k], fixed:true };
    }
    var instance = {
      iid: iid, lootId: m.id, tier: m.tier, level: 0,
      affixes: aff ? [aff] : [], sockets: [], dyeId: null,
      createdAt: window.now ? window.now() : Date.now(),
      source: { kind:"mount_grant", reason: reason || "pity", rarity:rarity },
      locked: false
    };
    if (!s.lootInstances) s.lootInstances = {};
    s.lootInstances[iid] = instance;
    if (!s.lootOwned) s.lootOwned = {};
    s.lootOwned[m.id] = (s.lootOwned[m.id]|0) + 1;
    // Bestiary family tracking
    var fam = m.family;
    if (!s.loot.mountFamilies[fam]) s.loot.mountFamilies[fam] = { collected: {} };
    s.loot.mountFamilies[fam].collected[m.id] = 1;
    // Drop log
    if (!s.loot.drops) s.loot.drops = [];
    s.loot.drops.push({
      id: window.uid ? window.uid() : Math.random().toString(36).slice(2,10),
      at: window.now ? window.now() : Date.now(),
      sessionId: sessionId || null,
      iid: iid, templateId: m.id, rarity: m.tier,
      sourceAction: "Mount" + (reason === "rng" ? "Rng" : "Pity"),
      enemyId: null,
      odds: { rolled: 1, total: 1, ratio: 1 },
      pity: { tier: m.tier, sinceLast: 0, bumped: true },
      fromMonsterTable: false, mountGrant: true, mountReason: reason || "pity"
    });
    if (s.loot.drops.length > 200) s.loot.drops.shift();
    return { instance: instance, mount: m };
  }

  /* ---------- STABLE (FAMILY BESTIARY) UI ---------- */

  function crRenderStable(){
    var host = document.getElementById("stable-panel");
    if (!host) return;
    var s = window.state; if (!s) return;
    crEnsureMountState(s);
    var owned = s.lootOwned || {};
    var totalCount = CR_MOUNTS_FULL.length;
    var ownedCount = CR_MOUNTS_FULL.filter(function(m){ return (owned[m.id]|0) > 0; }).length;
    var p = s.loot.mountProgress|0;
    var nextTh, nextTier;
    var order = ["common","uncommon","rare","epic","legendary","mythic"];
    for (var i=0; i<order.length; i++){
      if (p < CR_MOUNT_PITY[order[i]]){ nextTh = CR_MOUNT_PITY[order[i]]; nextTier = order[i]; break; }
    }
    if (!nextTier){ nextTh = CR_MOUNT_PITY.mythic; nextTier = "max"; }
    var pct = nextTier === "max" ? 100 : Math.max(0, Math.min(100, Math.round((p / nextTh) * 100)));
    var header = '<div class="stable-header">' +
      '<div class="stable-progress">' +
        '<div class="stable-progress-label">' +
          '<b>Mount progress</b><span>' + p + 'm / ' + nextTh + 'm' + (nextTier === "max" ? " (collected all tiers)" : (" - next: " + nextTier)) + '</span>' +
        '</div>' +
        '<div class="stable-progress-track"><div class="stable-progress-fill" style="width:' + pct + '%"></div></div>' +
        '<div class="stable-progress-tiers">' +
          '<span>50h common</span><span>100h uncommon</span><span>200h rare</span><span>400h epic</span><span>750h legendary</span><span>1500h mythic</span>' +
        '</div>' +
      '</div>' +
      '<div class="stable-collected"><b>' + ownedCount + ' / ' + totalCount + '</b> mounts collected</div>' +
    '</div>';
    var famHtml = Object.keys(CR_FAMILIES).map(function(fk){
      var fam = CR_FAMILIES[fk];
      var mounts = (CR_MOUNTS_BY_FAMILY[fk] || []).slice();
      mounts.sort(function(a,b){ return order.indexOf(a.tier) - order.indexOf(b.tier); });
      var collected = mounts.filter(function(m){ return (owned[m.id]|0) > 0; }).length;
      var famPct = mounts.length ? Math.round((collected / mounts.length) * 100) : 0;
      var complete = collected === mounts.length && mounts.length > 0;
      return '<div class="stable-family' + (complete ? ' complete' : '') + '">' +
        '<div class="stable-fam-head">' +
          '<span class="stable-fam-icon">' + fam.icon + '</span>' +
          '<b>' + fam.label + '</b>' +
          '<span class="stable-fam-count">' + collected + '/' + mounts.length + '</span>' +
          (complete ? '<span class="stable-fam-title">Master of ' + fam.label + '</span>' : '') +
        '</div>' +
        '<div class="stable-fam-bar"><div style="width:' + famPct + '%"></div></div>' +
        '<div class="stable-fam-mounts">' + mounts.map(function(m){
          var have = (owned[m.id]|0) > 0;
          /* v8.8: render the real sprite (frame A only — animation kicks in on click-to-preview) */
          var spriteHtml = '';
          if (have && typeof window.drawMount === "function"){
            try {
              var fake = { lootId: m.id, tier: m.tier };
              var svgInner = window.drawMount(fake, { outline:"#0F1322", trim:"#FBBF24" });
              spriteHtml = '<svg viewBox="0 0 32 32" class="stable-mount-svg" preserveAspectRatio="xMidYMid meet">'+svgInner+'</svg>';
            } catch(e){ spriteHtml = '<div class="stable-mount-sym">' + m.sym + '</div>'; }
          } else {
            spriteHtml = '<div class="stable-mount-sym ' + (have ? '' : 'unowned') + '">' + (have ? m.sym : "?") + '</div>';
          }
          return '<div class="stable-mount tier-' + m.tier + (have ? '' : ' locked') + '" data-stable-mount-id="' + m.id + '" title="' + m.name + (have ? ' — tap to preview' : ' (not collected)') + '">' +
            spriteHtml +
            '<div class="stable-mount-name">' + (have ? m.name : "???") + '</div>' +
            '<div class="stable-mount-tier">' + m.tier + '</div>' +
          '</div>';
        }).join("") + '</div>' +
      '</div>';
    }).join("");
    host.innerHTML = header + '<div class="stable-families">' + famHtml + '</div>';
    /* v8.8: click any owned mount to open the preview modal (animated, large, with info) */
    if (!host.dataset.v88PreviewBound){
      host.dataset.v88PreviewBound = "1";
      host.addEventListener("click", function(ev){
        var card = ev.target.closest("[data-stable-mount-id]");
        if (!card) return;
        if (card.classList.contains("locked")) return;
        var mid = card.getAttribute("data-stable-mount-id");
        if (typeof window.crOpenMountPreview === "function") window.crOpenMountPreview(mid);
      });
    }
  }

  /* v8.8: large animated preview modal for a single mount.
     Renders both frame A and frame B with the same CSS animation classes
     drawMount produces, so the preview lifecycle just works. */
  function crOpenMountPreview(mountId){
    var mount = CR_MOUNTS_FULL.filter(function(m){ return m.id === mountId; })[0];
    if (!mount) return;
    var owned = (window.state && window.state.lootOwned && (window.state.lootOwned[mount.id]|0) > 0);
    var equipped = window.state && window.state.hero && window.state.hero.equipped &&
                   window.state.hero.equipped.mount && window.state.hero.equipped.mount.lootId === mount.id;
    var fake = { lootId: mount.id, tier: mount.tier };
    var spriteSvg = '';
    if (typeof window.drawMount === "function"){
      try { spriteSvg = window.drawMount(fake, { outline:"#0F1322", trim:"#FBBF24" }); }
      catch(e){ spriteSvg = ''; }
    }
    var effectLabel = (mount.effect && mount.effect.label) ? mount.effect.label : "";
    var familyLabel = CR_FAMILIES && CR_FAMILIES[mount.family] ? CR_FAMILIES[mount.family].label : mount.family;
    var familyIcon = CR_FAMILIES && CR_FAMILIES[mount.family] ? CR_FAMILIES[mount.family].icon : "";

    // Build modal DOM
    var existing = document.getElementById("cr-mount-preview-modal");
    if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
    var modal = document.createElement("div");
    modal.id = "cr-mount-preview-modal";
    modal.className = "cr-mount-preview-backdrop";
    modal.innerHTML =
      '<div class="cr-mount-preview-card tier-' + mount.tier + '">' +
        '<button type="button" class="cr-mount-preview-close" aria-label="Close">✕</button>' +
        '<div class="cr-mount-preview-stage">' +
          '<svg class="fh-mount cr-mount-preview-svg" viewBox="0 0 32 32" preserveAspectRatio="xMidYMid meet">' + spriteSvg + '</svg>' +
        '</div>' +
        '<div class="cr-mount-preview-info">' +
          '<div class="cr-mount-preview-name">' + mount.name + '</div>' +
          '<div class="cr-mount-preview-meta">' +
            '<span class="cr-mount-preview-fam">' + familyIcon + ' ' + familyLabel + '</span>' +
            '<span class="cr-mount-preview-tier tier-' + mount.tier + '">' + mount.tier + '</span>' +
          '</div>' +
          (effectLabel ? '<div class="cr-mount-preview-effect">' + effectLabel + '</div>' : '') +
          '<div class="cr-mount-preview-status">' +
            (equipped ? '<span class="cr-mount-preview-equipped">✓ Equipped</span>'
                      : '<button type="button" class="cr-mount-preview-equip" data-equip-mount="' + mount.id + '" data-equip-tier="' + mount.tier + '">Equip</button>') +
          '</div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(modal);
    function close(){ if (modal && modal.parentNode) modal.parentNode.removeChild(modal); }
    modal.addEventListener("click", function(ev){
      if (ev.target === modal) close();
      if (ev.target.classList.contains("cr-mount-preview-close")) close();
      var equip = ev.target.closest("[data-equip-mount]");
      if (equip){
        var id = equip.getAttribute("data-equip-mount");
        var tier = equip.getAttribute("data-equip-tier");
        if (typeof window.setEquipped === "function"){
          window.setEquipped("mount", id, tier);
          if (typeof window.toast === "function") window.toast("Equipped: " + mount.name, "good");
          if (typeof window.logActivity === "function") window.logActivity({category:"character", action:"equip_mount", taskId:null, before:null, after:{id:id, name:mount.name}, source:"stable_preview"});
          if (typeof window.saveState === "function") window.saveState();
          if (typeof window.renderHero === "function") window.renderHero();
          if (typeof window.renderAvatar === "function") window.renderAvatar();
          close();
        }
      }
    });
    document.addEventListener("keydown", function escHandler(e){
      if (e.key === "Escape"){ close(); document.removeEventListener("keydown", escHandler); }
    });
  }
  window.crOpenMountPreview = crOpenMountPreview;

  /* ---------- MOUNT PROGRESS BAR (HERO CARD) ---------- */

  function crRenderMountProgressBar(){
    /* v8.6.5: visible mount progress bar removed per Joel's request — the
       grind is meant to feel mysterious. The internal pity counter
       (s.loot.mountProgress) still advances normally via the session-end
       hook below, so guaranteed mount drops still fire at the right
       thresholds. We also clean up any previously-rendered bar so existing
       sessions don't leave a stale element on the Hero card after upgrade. */
    try {
      var stale = document.querySelector(".cr-mount-progress");
      if (stale && stale.parentNode) stale.parentNode.removeChild(stale);
    } catch(_){}
    return;
  }

  /* ---------- HOOK INTO SESSION-END LOOT PIPELINE ----------
     After every focus session, advance mount progress by the session
     minutes and check for a pity threshold cross OR an RNG roll. If
     either fires, grant a mount and append to the drop log. */

  function crInstallSessionHook(){
    if (typeof window.lrSessionEndLootPipeline !== "function") {
      setTimeout(crInstallSessionHook, 100);
      return;
    }
    if (window.lrSessionEndLootPipeline._crHooked) return;
    var original = window.lrSessionEndLootPipeline;
    window.lrSessionEndLootPipeline = function(action, minutes, sessionId){
      var result = original.apply(this, arguments);
      try {
        var s = window.state;
        if (s && s.loot){
          // Advance pity
          var tier = crAdvanceMountProgress(s, minutes);
          if (tier){
            var grant = crGrantMount(s, tier, sessionId, "pity");
            if (grant && result && Array.isArray(result.drops)){
              // Append the mount grant to the result drops so the post-session
              // breakdown UI surfaces it.
              var lastEntry = s.loot.drops[s.loot.drops.length - 1];
              if (lastEntry) result.drops.push(lastEntry);
              if (typeof window.toast === "function") window.toast(grant.mount.sym + " Mount unlocked: " + grant.mount.name + " (" + tier + ")", "good");
            }
          }
          // RNG roll
          var rngTier = crRollMountRng(s, minutes);
          if (rngTier){
            var rg = crGrantMount(s, rngTier, sessionId, "rng");
            if (rg){
              var le = s.loot.drops[s.loot.drops.length - 1];
              if (le && result && Array.isArray(result.drops)) result.drops.push(le);
              if (typeof window.toast === "function") window.toast("✨ RARE FIND: " + rg.mount.sym + " " + rg.mount.name + " (" + rngTier + ")", "good");
            }
          }
          if (typeof window.saveState === "function") window.saveState();
          crRenderMountProgressBar();
        }
      } catch(e){ console.warn("mount hook:", e); }
      return result;
    };
    window.lrSessionEndLootPipeline._crHooked = true;
  }

  /* ---------- DELTA-EDIT UX ---------- */

  function crWireDeltaEdit(){
    setInterval(function(){
      var ed = document.querySelector("#xp-breakdown-slot .editor");
      if (!ed) return;
      if (ed.dataset.crDelta === "1") return;
      ed.dataset.crDelta = "1";
      var input = ed.querySelector("#xp-edit-input");
      if (!input) return;
      var max = Number(input.max) || 0;
      var current = Number(input.value) || 0;
      var label = ed.querySelector(".label");
      if (label) label.textContent = "Adjust this session's logged minutes. Tap a quick button or type a delta. Current: " + current + "m of cap " + max + "m.";
      var rowEl = ed.querySelector(".row");
      var quickEl = ed.querySelector(".quick");
      if (!rowEl || !quickEl) return;
      /* Keep the original input node: openSessionEndEditTime attached its
         preview/save-state listener to this exact element. Replacing it made
         the delta UI look functional while leaving Save permanently disabled. */
      input.type = "hidden";
      rowEl.innerHTML =
        '<input type="number" id="xp-edit-delta-input" step="1" placeholder="+/- min" inputmode="numeric" aria-label="Delta to apply">' +
        '<span class="max"> -> <b id="xp-edit-delta-preview">' + current + 'm</b> after</span>';
      rowEl.appendChild(input);
      quickEl.innerHTML =
        '<button type="button" data-delta="-15">-15m</button>' +
        '<button type="button" data-delta="-10">-10m</button>' +
        '<button type="button" data-delta="-5">-5m</button>' +
        '<button type="button" data-delta="5">+5m</button>' +
        '<button type="button" data-delta="10">+10m</button>' +
        '<button type="button" data-delta="15">+15m</button>' +
        '<button type="button" data-zero="1">Zero</button>';
      var deltaInput = ed.querySelector("#xp-edit-delta-input");
      var preview = ed.querySelector("#xp-edit-delta-preview");
      var hidden = input;
      var applyDelta = function(d){
        var v = current + (d|0);
        if (v < 0) v = 0;
        if (v > max) v = max;
        hidden.value = String(v);
        preview.textContent = v + "m";
        var ev = new Event("input", { bubbles:true });
        hidden.dispatchEvent(ev);
        /* The base editor owns the Save handler, but this enhancement owns the
           replacement controls. Keep Save usable even in browsers that discard
           the detached input's listener while rowEl is rebuilt. */
        var save = ed.querySelector("#xp-edit-save");
        if (save) save.disabled = (v === current);
        var basePreview = ed.querySelector("#xp-edit-preview");
        if (basePreview && v !== current && basePreview.textContent === "No change."){
          basePreview.textContent = "Will adjust this session to " + v + "m.";
        }
      };
      deltaInput.addEventListener("input", function(){ applyDelta(Number(deltaInput.value) || 0); });
      Array.prototype.forEach.call(quickEl.querySelectorAll("button[data-delta]"), function(b){
        b.addEventListener("click", function(){
          var d = Number(b.getAttribute("data-delta")) || 0;
          applyDelta(d);
          deltaInput.value = (d > 0 ? "+" : "") + d;
        });
      });
      var zeroBtn = quickEl.querySelector("[data-zero]");
      if (zeroBtn) zeroBtn.addEventListener("click", function(){
        applyDelta(-current);
        deltaInput.value = String(-current);
      });
    }, 400);
  }

  /* ---------- PORTRAIT OVERRIDE ---------- */

  function crInstallPortraitOverride(){
    if (typeof window.characterPortraitSvg !== "function"){
      setTimeout(crInstallPortraitOverride, 100);
      return;
    }
    if (window.characterPortraitSvg._crOverridden) return;
    var original = window.characterPortraitSvg;
    window.characterPortraitSvg = function(palette, eq){
      var a = (window.state && window.state.hero && window.state.hero.appearance) || {};
      var mountId = eq && eq.mount ? eq.mount.id : null;
      try { return crCharacterPortraitSvg(a, mountId); }
      catch(e){ try { return original.apply(this, arguments); } catch(_){ return ""; } }
    };
    window.characterPortraitSvg._crOverridden = true;
  }

  /* ---------- APPEARANCE OPTIONS EXTENSION ---------- */

  function crExtendAppearanceOptions(){
    if (!window.APPEARANCE_OPTIONS){ setTimeout(crExtendAppearanceOptions, 100); return; }
    var AO = window.APPEARANCE_OPTIONS;
    AO.race = [
      { id:"human", label:"Human" },
      { id:"elf", label:"Elf" },
      { id:"orc", label:"Orc" },
      { id:"dwarf", label:"Dwarf" },
      { id:"goblin", label:"Goblin" },
      { id:"beastfolk_cat", label:"Beastfolk (Cat)" },
      { id:"beastfolk_wolf", label:"Beastfolk (Wolf)" },
      { id:"beastfolk_lizard", label:"Beastfolk (Lizard)" },
      { id:"undead", label:"Undead" },
      { id:"demon", label:"Demon" },
      { id:"fae", label:"Fae" }
    ];
    AO.hair = CR_HAIR_STYLES.map(function(id){ return { id:id, label:CR_HAIR_LABELS[id] || id }; });
    AO.hairColor = Object.keys(CR_HAIR_COLORS).map(function(id){ return { id:id, label: id.charAt(0).toUpperCase()+id.slice(1), color: CR_HAIR_COLORS[id] }; });
    AO.eyeColor = Object.keys(CR_EYE_COLORS).map(function(id){ return { id:id, label: id.charAt(0).toUpperCase()+id.slice(1), color: CR_EYE_COLORS[id] }; });
  }

  /* ---------- BOOT ---------- */

  function crBoot(){
    crEnsureMountState(window.state);
    crExtendAppearanceOptions();
    crInstallPortraitOverride();
    crInstallSessionHook();
    crWireDeltaEdit();
    setTimeout(crRenderMountProgressBar, 250);
    setInterval(crRenderMountProgressBar, 4000);
    // Stable tab refresh
    var bar = document.querySelector(".tabs[role='tablist']");
    if (bar && !bar.dataset.crStableBound){
      bar.dataset.crStableBound = "1";
      bar.addEventListener("click", function(ev){
        var btn = ev.target.closest("[data-tab]");
        if (btn && btn.getAttribute("data-tab") === "stable") setTimeout(crRenderStable, 0);
      });
    }
  }

  /* ---------- PUBLIC API ---------- */
  window.crCharacterPortraitSvg = crCharacterPortraitSvg;
  window.crAdvanceMountProgress = crAdvanceMountProgress;
  window.crRollMountRng = crRollMountRng;
  window.crPickMountByRarity = crPickMountByRarity;
  window.crGrantMount = crGrantMount;
  window.crEnsureMountState = crEnsureMountState;
  window.crRenderMountProgressBar = crRenderMountProgressBar;
  window.crRenderStable = crRenderStable;
  window.crCurrentMountTier = crCurrentMountTier;

  /* ---------- SMOKE TESTS ---------- */
  window.__crSmokeTests = function(){
    var results = [];
    var add = function(name, ok, msg){ results.push({ name:name, ok:!!ok, msg:msg||"" }); };
    add("character: 11 species defined", Object.keys(CR_SPECIES).length === 11);
    add("character: 12 classes defined", Object.keys(CR_CLASSES).length === 12);
    add("character: 14 hair styles", CR_HAIR_STYLES.length === 14);
    add("character: 12 hair colors", Object.keys(CR_HAIR_COLORS).length === 12);
    add("character: 8 eye colors", Object.keys(CR_EYE_COLORS).length === 8);
    add("mounts: 80+ mounts in roster", CR_MOUNTS_FULL.length >= 80);
    add("mounts: 14 families", Object.keys(CR_FAMILIES).length === 14);
    // Tier distribution sanity
    add("mounts: at least 25 common", CR_MOUNTS_BY_TIER.common.length >= 25);
    add("mounts: at least 15 uncommon", CR_MOUNTS_BY_TIER.uncommon.length >= 15);
    add("mounts: at least 12 rare", CR_MOUNTS_BY_TIER.rare.length >= 12);
    add("mounts: at least 10 epic", CR_MOUNTS_BY_TIER.epic.length >= 10);
    add("mounts: at least 6 legendary", CR_MOUNTS_BY_TIER.legendary.length >= 6);
    add("mounts: at least 4 mythic", CR_MOUNTS_BY_TIER.mythic.length >= 4);
    // Horse family completeness (15 spec)
    var horses = CR_MOUNTS_BY_FAMILY.horse || [];
    add("mounts: 15+ horse breeds", horses.length >= 15);
    // Pity ladder
    add("mount pity: common = 3000m (50h)", CR_MOUNT_PITY.common === 3000);
    add("mount pity: uncommon = 6000m (100h)", CR_MOUNT_PITY.uncommon === 6000);
    add("mount pity: rare = 12000m (200h)", CR_MOUNT_PITY.rare === 12000);
    add("mount pity: epic = 24000m (400h)", CR_MOUNT_PITY.epic === 24000);
    add("mount pity: legendary = 45000m (750h)", CR_MOUNT_PITY.legendary === 45000);
    add("mount pity: mythic = 90000m (1500h)", CR_MOUNT_PITY.mythic === 90000);
    // Progress advancement
    var fake = { loot: { mountProgress: 0, drops: [], mountFamilies:{} }, lootInstances:{}, lootOwned:{} };
    var r1 = crAdvanceMountProgress(fake, 2999);
    add("mount advance: 2999m below common threshold returns null", r1 === null && fake.loot.mountProgress === 2999);
    var r2 = crAdvanceMountProgress(fake, 1);
    add("mount advance: crossing 3000m yields common", r2 === "common");
    var fake2 = { loot: { mountProgress: 5999, drops: [], mountFamilies:{} }, lootInstances:{}, lootOwned:{} };
    var r3 = crAdvanceMountProgress(fake2, 1);
    add("mount advance: crossing 6000m yields uncommon", r3 === "uncommon");
    // Grant
    var fake3 = { loot: { mountProgress: 3000, drops: [], mountFamilies:{} }, lootInstances:{}, lootOwned:{} };
    var g = crGrantMount(fake3, "common", "test", "pity");
    add("mount grant: creates instance", g && g.instance && !!fake3.lootInstances[g.instance.iid]);
    add("mount grant: bumps lootOwned", g && (fake3.lootOwned[g.mount.id]|0) === 1);
    add("mount grant: family tracked", g && fake3.loot.mountFamilies[g.mount.family]);
    add("mount grant: appends to drops log", fake3.loot.drops.length === 1 && fake3.loot.drops[0].mountGrant === true);
    // RNG layer sanity
    var fake4 = { loot: { mountProgress: 0, drops: [], mountFamilies:{} }, lootInstances:{}, lootOwned:{} };
    var rngSamples = 0;
    for (var i=0; i<2000; i++){ if (crRollMountRng(fake4, 60)) rngSamples++; }
    var pctRng = rngSamples / 2000;
    add("mount RNG: 60-min session has roughly base rate (0.3-0.8%)", pctRng >= 0.001 && pctRng <= 0.02, "observed=" + pctRng.toFixed(4));
    var fake5 = { loot: { mountProgress: 0, drops: [], mountFamilies:{} }, lootInstances:{}, lootOwned:{} };
    var r0 = crRollMountRng(fake5, 30);
    add("mount RNG: <60-min session never RNG-drops", r0 === null);
    // Portrait SVG
    var svg = "";
    try { svg = crCharacterPortraitSvg({ species:"elf", classKey:"mage", hair:"long_straight", hairColor:"silver", eyeColor:"violet", skinIdx:1, face:"calm" }, null); } catch(e){}
    add("character: portrait SVG generates", svg.indexOf("<svg") >= 0 && svg.length > 500);
    add("character: portrait SVG has species data", svg.indexOf('data-species="elf"') >= 0);
    add("character: portrait SVG has class data", svg.indexOf('data-class="mage"') >= 0);
    // Color helpers
    add("color: lighten by 1.0 -> white", lighten("#000000", 1.0).toUpperCase() === "#FFFFFF");
    add("color: darken by 1.0 -> black", darken("#FFFFFF", 1.0).toUpperCase() === "#000000");
    return results;
  };

  if (document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", crBoot, { once:true });
  } else {
    setTimeout(crBoot, 0);
  }

})();
