/* ================================================================
 * Focus Hero v8.5.0 - SHOP REWORK
 *
 * Loaded after world-depth.js. Replaces the v8.0 single-column shop
 * with a real RPG vendor UI:
 *
 *   - Category tabs: Weapons / Armor / Mounts / Consumables /
 *     Cosmetics / Crafting / Special
 *   - Sortable + filterable grid (rarity / price / slot / owned)
 *   - Daily Featured carousel (3 rotating slots, deterministic seed
 *     from today's date - same items for everyone today)
 *   - Weekly Mystery Box (Crystal Shards, guaranteed Epic+)
 *   - Currency HUD: Coins + Crystal Shards + Crafting Dust
 *   - Item preview on tap/hover (stats, lore, set membership)
 *   - Purchase confirmation modal
 *   - Bargain ±15% daily variance (seeded by date so it's stable)
 *   - Owned ownership badges
 *
 * The runtime hooks into the existing #tab-store / #store-panel
 * elements - if those don't exist (graceful degradation) it falls
 * back to the legacy renderStore.
 * ================================================================ */

(function(){
  "use strict";

  /* ---------- CATEGORIES ---------- */

  var SR_CATEGORIES = [
    { id:"weapons",    label:"Weapons",     icon:"⚔️", filter: function(it){ return it.slot === "weapon"; } },
    { id:"armor",      label:"Armor",       icon:"🛡️", filter: function(it){ return ["helmet","armor","cloak","gloves","boots","legs","belt"].indexOf(it.slot) >= 0; } },
    { id:"mounts",     label:"Mounts",      icon:"🐎", filter: function(it){ return it.slot === "mount" || it.category === "mount"; } },
    { id:"consumables",label:"Consumables", icon:"🧪", filter: function(it){ return it.category === "consumable" || (it.id || "").indexOf("boost_") === 0 || (it.id || "").indexOf("cons_") === 0; } },
    { id:"cosmetics",  label:"Cosmetics",   icon:"🎨", filter: function(it){ return it.category === "cosmetic" || it.dye; } },
    { id:"crafting",   label:"Crafting",    icon:"🔥", filter: function(it){ return it.category === "crafting" || it.reagent; } },
    { id:"special",    label:"Special",     icon:"✨", filter: function(it){ return it.category === "special" || it.tier === "artifact" || it.tier === "cursed" || it.id === "mystery_box_v85"; } }
  ];

  /* ---------- DETERMINISTIC DAILY RNG ---------- */

  function srHash(str){
    var h = 2166136261 >>> 0;
    for (var i=0; i<str.length; i++){ h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h >>> 0;
  }
  function srMulberry32(seed){
    var a = (seed|0) >>> 0;
    return function(){
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function srTodayKey(){
    var d = new Date();
    return d.getFullYear() + "-" + (d.getMonth()+1) + "-" + d.getDate();
  }

  /* ---------- INVENTORY SOURCING ----------
     The shop draws from:
       - LOOT_TABLE gear items (from inline script)
       - STORE_CONSUMABLES (from inline script)
       - WD_RELICS, WD_CHARMS, WD_KEYS (v8.5 catalog)
       - CR_MOUNTS_FULL (v8.4 mount roster, where buyable)
       - Mystery Box pseudo-item
       - Crafting reagents (WD_REAGENTS)
  */

  function srBaseInventory(){
    var inv = [];
    // Gear from LOOT_TABLE
    if (typeof window !== "undefined" && Array.isArray(window.LOOT_TABLE)){
      window.LOOT_TABLE.forEach(function(it){
        if (!window.isEquippableSlot || !window.isEquippableSlot(it[4])) return;
        var id = window.lootId ? window.lootId(it) : String(it[1]).toLowerCase().replace(/\W+/g,"_");
        inv.push({
          id: "gear_" + id, lootSlug: id,
          name: it[1], sym: it[0], rarity: it[2], slot: it[4],
          priceBase: SR_PRICE_BY_RARITY[it[2]] || 100,
          category: "gear",
          effectText: (window.GEAR_EFFECTS && window.GEAR_EFFECTS[id]) ? window.GEAR_EFFECTS[id].label : "Cosmetic"
        });
      });
    }
    // Consumables from inline STORE_CONSUMABLES
    if (typeof window !== "undefined" && Array.isArray(window.STORE_CONSUMABLES)){
      window.STORE_CONSUMABLES.forEach(function(c){
        inv.push({
          id: c.id, name: c.name, sym: c.sym, rarity: "uncommon",
          slot: "consumable", priceBase: c.price,
          category: "consumable", effectText: c.desc
        });
      });
    }
    // v8.5 catalog - relics
    if (typeof window !== "undefined" && Array.isArray(window.WD_RELICS)){
      window.WD_RELICS.forEach(function(r){
        if (r.tier === "artifact") return; // artifacts not buyable
        inv.push({
          id: r.id, name: r.name, sym: r.sym, rarity: r.tier,
          slot: "relic", priceBase: SR_PRICE_BY_RARITY[r.tier] || 100,
          category: "gear", lore: r.lore,
          effectText: r.effect ? srEffectText(r.effect) : ""
        });
      });
    }
    if (typeof window !== "undefined" && Array.isArray(window.WD_CHARMS)){
      window.WD_CHARMS.forEach(function(c){
        inv.push({
          id: c.id, name: c.name, sym: c.sym, rarity: c.tier,
          slot: "charm", priceBase: SR_PRICE_BY_RARITY[c.tier] || 60,
          category: "gear", effectText: c.effect ? srEffectText(c.effect) : ""
        });
      });
    }
    if (typeof window !== "undefined" && Array.isArray(window.WD_KEYS)){
      window.WD_KEYS.forEach(function(k){
        if (k.tier === "artifact") return;
        inv.push({
          id: k.id, name: k.name, sym: k.sym, rarity: k.tier,
          slot: "key", priceBase: SR_PRICE_BY_RARITY[k.tier] || 40,
          category: "special", effectText: "Opens a " + k.chestTier + " chest"
        });
      });
    }
    if (typeof window !== "undefined" && Array.isArray(window.WD_REAGENTS)){
      window.WD_REAGENTS.forEach(function(r){
        inv.push({
          id: r.id, name: r.name, sym: r.sym, rarity: r.tier,
          slot: "reagent", priceBase: SR_PRICE_BY_RARITY[r.tier] || 25,
          category: "crafting", reagent: true,
          effectText: "Crafting reagent"
        });
      });
    }
    // Mythic Mystery Box - Crystal Shards
    inv.push({
      id: "mystery_box_v85", name: "Weekly Mystery Box", sym: "🎁",
      rarity: "epic", slot: "consumable", priceBase: 100,
      currency: "shards", category: "special",
      effectText: "Guaranteed Epic+ drop. Limited 1/week.",
      mysteryBox: true
    });
    return inv;
  }

  var SR_PRICE_BY_RARITY = {
    common:    50,
    uncommon:  120,
    rare:      300,
    epic:      900,
    legendary: 3000,
    mythic:    9000,
    cursed:    2500,
    artifact:  20000
  };

  function srEffectText(effect){
    if (!effect) return "";
    var parts = [];
    if (effect.label) return effect.label;
    Object.keys(effect).forEach(function(k){
      if (k === "label") return;
      parts.push(k + "+" + effect[k]);
    });
    return parts.join(", ");
  }

  /* Daily variance: ±15% jitter, deterministic per item per day */
  function srPriceForToday(item, rng){
    var base = item.priceBase || 100;
    var jitter = (rng() - 0.5) * 0.30; // ±15%
    return Math.max(1, Math.round(base * (1 + jitter)));
  }

  /* ---------- FEATURED ITEMS ---------- */

  function srFeaturedToday(inventory){
    var key = srTodayKey();
    var rng = srMulberry32(srHash("featured-" + key));
    // Bias toward rare+ items
    var pool = inventory.filter(function(it){
      var idx = ["common","uncommon","rare","epic","legendary","mythic"].indexOf(it.rarity);
      return idx >= 1; // uncommon+
    });
    if (!pool.length) return [];
    var picks = [];
    var seenIds = {};
    while (picks.length < 3 && Object.keys(seenIds).length < pool.length){
      var idx = Math.floor(rng() * pool.length);
      var it = pool[idx];
      if (seenIds[it.id]) continue;
      seenIds[it.id] = 1;
      // Featured discount: 20-30% off, jittered
      var priceTodayRng = srMulberry32(srHash(it.id + "-" + key));
      var basePrice = srPriceForToday(it, priceTodayRng);
      var discountPct = Math.floor(20 + (rng() * 10));
      var featuredPrice = Math.max(1, Math.round(basePrice * (1 - discountPct/100)));
      picks.push({ item: it, price: featuredPrice, originalPrice: basePrice, discountPct: discountPct });
    }
    return picks;
  }

  /* ---------- RENDER ----------

     Selected state lives on window._srState (not persisted in main
     state - just UI state). */

  if (typeof window !== "undefined") window._srState = window._srState || {
    category: "weapons",
    sortKey: "rarity_desc",
    filterOwned: "all", // all | owned | unowned
    searchText: "",
    selectedItemId: null
  };

  function srRender(){
    var host = document.getElementById("store-panel");
    if (!host) return; // graceful fallback
    var s = window.state;
    if (!s) return;
    var inv = srBaseInventory();
    var ui = window._srState;
    var owned = (s.lootOwned) || {};
    var coins = s.coins | 0;
    var shards = s.crystalShards | 0;
    var dust = s.craftingDust | 0;

    // Currency HUD
    var hud = '<div class="sr-hud">' +
      '<div class="sr-coin"><span class="sr-coin-sym">🪙</span> <b>' + coins.toLocaleString() + '</b> coins</div>' +
      '<div class="sr-coin sr-shard"><span class="sr-coin-sym">💎</span> <b>' + shards.toLocaleString() + '</b> shards</div>' +
      '<div class="sr-coin sr-dust"><span class="sr-coin-sym">✨</span> <b>' + dust.toLocaleString() + '</b> dust</div>' +
    '</div>';

    // Featured carousel
    var featured = srFeaturedToday(inv);
    var featuredHtml = featured.length ? '<div class="sr-featured">' +
      '<div class="sr-section-title">⭐ Today\'s Featured Items</div>' +
      '<div class="sr-featured-grid">' +
      featured.map(function(f){
        var have = (owned[f.item.lootSlug || f.item.id] | 0) > 0;
        return '<div class="sr-featured-card rar-' + f.item.rarity + (have ? ' owned' : '') + '">' +
          '<div class="sr-feat-sym">' + (f.item.sym || "❓") + '</div>' +
          '<div class="sr-feat-name">' + escSr(f.item.name) + '</div>' +
          '<div class="sr-feat-eff">' + escSr(f.item.effectText || "") + '</div>' +
          '<div class="sr-feat-price">' +
            '<span class="sr-price-old">' + f.originalPrice + '</span> ' +
            '<span class="sr-price-new">' + f.price + ' 🪙</span> ' +
            '<span class="sr-discount-badge">-' + f.discountPct + '%</span>' +
          '</div>' +
          (have ? '<div class="sr-owned-badge">OWNED</div>' :
            '<button type="button" class="sr-buy-btn" data-sr-buy="' + escSr(f.item.id) + '" data-sr-price="' + f.price + '">Buy</button>') +
        '</div>';
      }).join("") +
      '</div>' +
    '</div>' : "";

    // Category tabs
    var catTabs = '<div class="sr-cat-tabs" role="tablist">' +
      SR_CATEGORIES.map(function(c){
        return '<button type="button" role="tab" class="sr-cat-tab' + (ui.category === c.id ? " active" : "") + '" data-sr-cat="' + c.id + '" aria-pressed="' + (ui.category === c.id ? "true" : "false") + '">' +
          '<span class="sr-cat-icon">' + c.icon + '</span> ' + c.label +
        '</button>';
      }).join("") +
    '</div>';

    // Filters
    var filtersHtml = '<div class="sr-filters">' +
      '<input type="search" class="sr-search" placeholder="Search items..." value="' + escSr(ui.searchText) + '" data-sr-search>' +
      '<select class="sr-sort" data-sr-sort>' +
        '<option value="rarity_desc"' + (ui.sortKey === "rarity_desc" ? " selected" : "") + '>Rarity: high to low</option>' +
        '<option value="rarity_asc"' + (ui.sortKey === "rarity_asc" ? " selected" : "") + '>Rarity: low to high</option>' +
        '<option value="price_asc"' + (ui.sortKey === "price_asc" ? " selected" : "") + '>Price: low to high</option>' +
        '<option value="price_desc"' + (ui.sortKey === "price_desc" ? " selected" : "") + '>Price: high to low</option>' +
        '<option value="name_asc"' + (ui.sortKey === "name_asc" ? " selected" : "") + '>Name: A → Z</option>' +
      '</select>' +
      '<select class="sr-owned-filter" data-sr-owned>' +
        '<option value="all"' + (ui.filterOwned === "all" ? " selected" : "") + '>All items</option>' +
        '<option value="owned"' + (ui.filterOwned === "owned" ? " selected" : "") + '>Owned only</option>' +
        '<option value="unowned"' + (ui.filterOwned === "unowned" ? " selected" : "") + '>Unowned only</option>' +
      '</select>' +
    '</div>';

    // Filter + sort the inventory for current category
    var cat = SR_CATEGORIES.filter(function(c){ return c.id === ui.category; })[0] || SR_CATEGORIES[0];
    var filtered = inv.filter(cat.filter);
    if (ui.searchText){
      var q = ui.searchText.toLowerCase();
      filtered = filtered.filter(function(it){ return (it.name || "").toLowerCase().indexOf(q) >= 0; });
    }
    if (ui.filterOwned === "owned"){
      filtered = filtered.filter(function(it){ return (owned[it.lootSlug || it.id] | 0) > 0; });
    } else if (ui.filterOwned === "unowned"){
      filtered = filtered.filter(function(it){ return (owned[it.lootSlug || it.id] | 0) === 0; });
    }
    // Compute price for today + sort
    filtered.forEach(function(it){
      var prng = srMulberry32(srHash(it.id + "-" + srTodayKey()));
      it._priceToday = srPriceForToday(it, prng);
    });
    var rarityRank = { common:1, uncommon:2, rare:3, epic:4, legendary:5, mythic:6, cursed:7, artifact:8 };
    filtered.sort(function(a, b){
      switch(ui.sortKey){
        case "rarity_desc": return (rarityRank[b.rarity] || 0) - (rarityRank[a.rarity] || 0);
        case "rarity_asc":  return (rarityRank[a.rarity] || 0) - (rarityRank[b.rarity] || 0);
        case "price_asc":   return a._priceToday - b._priceToday;
        case "price_desc":  return b._priceToday - a._priceToday;
        case "name_asc":    return (a.name || "").localeCompare(b.name || "");
      }
      return 0;
    });

    // Grid
    var gridHtml = '<div class="sr-grid">' +
      (filtered.length === 0 ?
        '<div class="sr-empty">No items match these filters.</div>' :
        filtered.map(function(it){
          var have = (owned[it.lootSlug || it.id] | 0) > 0;
          var afford = it.currency === "shards" ? (shards >= it._priceToday) : (coins >= it._priceToday);
          var disabled = (have && it.category === "gear") || !afford;
          var currencyIcon = it.currency === "shards" ? "💎" : "🪙";
          return '<div class="sr-grid-card rar-' + it.rarity + (have ? " owned" : "") + '" data-sr-item="' + escSr(it.id) + '">' +
            '<div class="sr-card-sym">' + (it.sym || "❓") + '</div>' +
            '<div class="sr-card-name">' + escSr(it.name) + '</div>' +
            '<div class="sr-card-meta">' + it.rarity + ' · ' + (it.slot || "") + '</div>' +
            '<div class="sr-card-eff">' + escSr(it.effectText || "") + '</div>' +
            '<div class="sr-card-price">' + it._priceToday.toLocaleString() + ' ' + currencyIcon + '</div>' +
            (have && it.category === "gear" ?
              '<div class="sr-owned-badge">OWNED</div>' :
              '<button type="button" class="sr-buy-btn"' + (disabled ? " disabled" : "") + ' data-sr-buy="' + escSr(it.id) + '" data-sr-price="' + it._priceToday + '" data-sr-currency="' + (it.currency || "coins") + '">Buy</button>') +
          '</div>';
        }).join("")) +
    '</div>';

    host.innerHTML = hud + featuredHtml + catTabs + filtersHtml + gridHtml;

    // Wire interactions
    host.querySelectorAll("[data-sr-cat]").forEach(function(b){
      b.addEventListener("click", function(){
        window._srState.category = b.getAttribute("data-sr-cat");
        srRender();
      });
    });
    var searchEl = host.querySelector("[data-sr-search]");
    if (searchEl) searchEl.addEventListener("input", function(){
      window._srState.searchText = searchEl.value;
      // Debounce re-render
      clearTimeout(window._srSearchTimer);
      window._srSearchTimer = setTimeout(srRender, 200);
    });
    var sortEl = host.querySelector("[data-sr-sort]");
    if (sortEl) sortEl.addEventListener("change", function(){
      window._srState.sortKey = sortEl.value;
      srRender();
    });
    var ownEl = host.querySelector("[data-sr-owned]");
    if (ownEl) ownEl.addEventListener("change", function(){
      window._srState.filterOwned = ownEl.value;
      srRender();
    });
    host.querySelectorAll("[data-sr-buy]").forEach(function(b){
      b.addEventListener("click", function(){
        var id = b.getAttribute("data-sr-buy");
        var price = parseInt(b.getAttribute("data-sr-price"), 10) || 0;
        var currency = b.getAttribute("data-sr-currency") || "coins";
        srShowPurchaseConfirm(id, price, currency);
      });
    });
  }

  /* ---------- PURCHASE CONFIRMATION ---------- */

  function srShowPurchaseConfirm(itemId, price, currency){
    // Create a small modal inline (or reuse the existing modal infra)
    var inv = srBaseInventory();
    var item = inv.filter(function(x){ return x.id === itemId; })[0];
    if (!item) return;
    var modal = document.getElementById("sr-purchase-modal");
    if (!modal){
      modal = document.createElement("div");
      modal.id = "sr-purchase-modal";
      modal.className = "modal-backdrop sr-modal";
      modal.innerHTML = '<div class="modal sr-modal-inner" role="dialog" aria-modal="true">' +
        '<button class="close" data-sr-close>✕</button>' +
        '<h3>Confirm purchase</h3>' +
        '<div id="sr-modal-body"></div>' +
      '</div>';
      document.body.appendChild(modal);
      modal.addEventListener("click", function(e){
        if (e.target === modal || e.target.matches("[data-sr-close]")) modal.hidden = true;
      });
    }
    var body = modal.querySelector("#sr-modal-body");
    var currencyIcon = currency === "shards" ? "💎" : "🪙";
    body.innerHTML =
      '<div class="sr-confirm-card rar-' + item.rarity + '">' +
        '<div class="sr-confirm-sym">' + (item.sym || "❓") + '</div>' +
        '<div>' +
          '<div class="sr-confirm-name">' + escSr(item.name) + '</div>' +
          '<div class="sr-confirm-meta">' + item.rarity + ' · ' + (item.slot || "") + '</div>' +
          '<div class="sr-confirm-eff">' + escSr(item.effectText || "") + '</div>' +
          (item.lore ? '<div class="sr-confirm-lore">"' + escSr(item.lore) + '"</div>' : '') +
        '</div>' +
      '</div>' +
      '<div class="sr-confirm-price">Price: <b>' + price.toLocaleString() + ' ' + currencyIcon + '</b></div>' +
      '<div class="sr-confirm-actions">' +
        '<button type="button" class="sr-confirm-cancel">Cancel</button>' +
        '<button type="button" class="sr-confirm-buy">Confirm</button>' +
      '</div>';
    modal.hidden = false;
    body.querySelector(".sr-confirm-cancel").addEventListener("click", function(){ modal.hidden = true; });
    body.querySelector(".sr-confirm-buy").addEventListener("click", function(){
      var result = srExecutePurchase(item, price, currency);
      modal.hidden = true;
      if (result.ok){
        if (typeof window.toast === "function") window.toast("Purchased " + item.name, "good");
        srRender();
      } else {
        if (typeof window.toast === "function") window.toast("Purchase failed: " + result.reason, "warn");
      }
    });
  }

  function srExecutePurchase(item, price, currency){
    var s = window.state;
    if (!s) return { ok:false, reason:"no_state" };
    if (currency === "shards"){
      if ((s.crystalShards|0) < price) return { ok:false, reason:"insufficient_shards" };
      s.crystalShards -= price;
      s.crystalShardsSpent = (s.crystalShardsSpent|0) + price;
    } else {
      if ((s.coins|0) < price) return { ok:false, reason:"insufficient_coins" };
      s.coins -= price;
      s.coinsSpent = (s.coinsSpent|0) + price;
    }
    // Apply item effect
    if (item.mysteryBox){
      /* v8.6.3 fix: previously double-charged shards. The shop deducted
         `price` (above), then wdOpenMysteryBox internally called
         wdSpendShards("mystery_box") which deducted ANOTHER 100. A user
         buying a "100 shard" box actually paid 200 shards.
         Fix: refund the shop's deduction, let wdOpenMysteryBox do the
         single canonical 100-shard spend. Honor featured discount. */
      if (typeof window.wdOpenMysteryBox === "function"){
        var BOX_COST = 100; // matches WD_SHARD_COSTS.mystery_box
        if (currency === "shards"){
          s.crystalShards = (s.crystalShards|0) + price;
          s.crystalShardsSpent = Math.max(0, (s.crystalShardsSpent|0) - price);
        }
        var box = window.wdOpenMysteryBox(s);
        if (box && box.ok){
          if (currency === "shards" && price < BOX_COST){
            var discount = BOX_COST - price;
            s.crystalShards = (s.crystalShards|0) + discount;
            s.crystalShardsSpent = Math.max(0, (s.crystalShardsSpent|0) - discount);
          }
          if (s.world){ s.world.mysteryBoxesOpened = (s.world.mysteryBoxesOpened|0) + 1; }
          if (typeof window.toast === "function") window.toast("Mystery Box: " + box.name + " (" + box.rarity + ")!", "good");
          if (typeof window.saveState === "function") window.saveState();
          return { ok:true };
        } else {
          if (typeof window.toast === "function") window.toast("Mystery Box: " + ((box && box.reason) || "open_failed"), "warn");
          return { ok:false, reason: (box && box.reason) || "open_failed" };
        }
      }
      if (currency === "shards"){
        s.crystalShards = (s.crystalShards|0) + price;
        s.crystalShardsSpent = Math.max(0, (s.crystalShardsSpent|0) - price);
      } else {
        s.coins = (s.coins|0) + price;
        s.coinsSpent = Math.max(0, (s.coinsSpent|0) - price);
      }
      return { ok:false, reason:"wdOpenMysteryBox_missing" };
    }
    if (item.category === "gear"){
      var slug = item.lootSlug || item.id;
      if (!s.lootOwned) s.lootOwned = {};
      s.lootOwned[slug] = (s.lootOwned[slug]|0) + 1;
    } else if (item.category === "consumable"){
      // Consumables go into store boosts (existing) OR loot.consumables for new ones
      if ((item.id || "").indexOf("boost_") === 0 && typeof window.buyStoreItem === "function"){
        // The existing buy flow handles this - but we already paid. We re-add the coins
        // and let buyStoreItem run, to maintain compatibility with the legacy boost system.
        s.coins += price;
        s.coinsSpent -= price;
        return window.buyStoreItem(item.id);
      } else if ((item.id || "").indexOf("cons_") === 0){
        if (!s.loot) s.loot = {};
        if (!s.loot.consumables) s.loot.consumables = {};
        s.loot.consumables[item.id] = (s.loot.consumables[item.id]|0) + 1;
      }
    } else if (item.category === "crafting" || item.reagent){
      if (!s.lootOwned) s.lootOwned = {};
      s.lootOwned[item.id] = (s.lootOwned[item.id]|0) + 1;
    } else if (item.category === "special"){
      // Keys
      if (!s.lootOwned) s.lootOwned = {};
      s.lootOwned[item.id] = (s.lootOwned[item.id]|0) + 1;
    }
    if (typeof window.saveState === "function") window.saveState();
    return { ok:true };
  }

  function escSr(s){
    if (typeof window !== "undefined" && typeof window.escapeHtml === "function") return window.escapeHtml(s);
    return String(s || "").replace(/[&<>"']/g, function(c){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"})[c]; });
  }

  /* ---------- BOOT ---------- */

  function srBoot(){
    // Override the inline renderStore so the store tab routes here
    if (typeof window !== "undefined" && typeof window.renderStore === "function"){
      var origRender = window.renderStore;
      window.renderStore = function(){
        try { srRender(); } catch(e){ console.warn("shop-rework:", e); origRender.apply(this, arguments); }
      };
    }
    // Tab refresh hook
    var bar = document.querySelector(".tabs[role='tablist']");
    if (bar && !bar.dataset.srBound){
      bar.dataset.srBound = "1";
      bar.addEventListener("click", function(ev){
        var btn = ev.target.closest("[data-tab]");
        if (btn && btn.getAttribute("data-tab") === "store"){
          setTimeout(srRender, 0);
        }
      });
    }
    // Initial render
    setTimeout(srRender, 250);
  }
  if (typeof document !== "undefined"){
    if (document.readyState === "loading"){
      document.addEventListener("DOMContentLoaded", srBoot, { once:true });
    } else {
      setTimeout(srBoot, 0);
    }
  }

  /* Public surface */
  window.srRender = srRender;
  window.srBaseInventory = srBaseInventory;
  window.srFeaturedToday = srFeaturedToday;
  window.srExecutePurchase = srExecutePurchase;
  window.SR_CATEGORIES = SR_CATEGORIES;
  window.SR_PRICE_BY_RARITY = SR_PRICE_BY_RARITY;

  /* Smoke tests */
  window.__srSmokeTests = function(){
    var results = [];
    var add = function(name, ok, msg){ results.push({ name:name, ok:!!ok, msg:msg||"" }); };
    add("categories: 7 defined", SR_CATEGORIES.length === 7);
    add("categories: weapons/armor/mounts/consumables/cosmetics/crafting/special",
        SR_CATEGORIES.map(function(c){ return c.id; }).join(",") === "weapons,armor,mounts,consumables,cosmetics,crafting,special");
    add("price by rarity: 8 tiers", Object.keys(SR_PRICE_BY_RARITY).length === 8);
    add("price by rarity: artifact most expensive",
        SR_PRICE_BY_RARITY.artifact > SR_PRICE_BY_RARITY.mythic);
    // Deterministic featured items
    var inv = srBaseInventory();
    add("base inventory has 50+ items", inv.length >= 50, "actual=" + inv.length);
    var f1 = srFeaturedToday(inv);
    var f2 = srFeaturedToday(inv);
    add("featured items: 3 picks", f1.length === 3);
    add("featured items: deterministic per day",
        f1.length === f2.length &&
        f1.every(function(p, i){ return p.item.id === f2[i].item.id; }));
    // Mystery box present
    var mb = inv.filter(function(it){ return it.id === "mystery_box_v85"; })[0];
    add("mystery box: present in inventory", !!mb && mb.currency === "shards");
    return results;
  };

})();
