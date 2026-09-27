/* ================================================================
 * Life XP - UI SHELL v11
 * Imported public baseline: 133,721 bytes, SHA-256
 * 7a7086f2b031ac436c9cd9b6223272bc6a78143ff00849ee3f8d612eb5514b48
 * (recorded before the v10.9.11 hardening edits).
 *
 * Companion to index.html. Loaded with <script src>, after the
 * other companion modules.
 *
 *   1. PERSISTENT EXITS: modal close buttons currently live inside
 *      the scrolling box (.modal is max-height:90vh; overflow:auto)
 *      and are float:right, so on any long menu they scroll off the
 *      top and you have to scroll back up to leave. They now pin to
 *      the top-right of the menu and stay there at every scroll
 *      position. Also adds Escape-to-close and backdrop-click-to-
 *      close for any menu that lacks them.
 *
 *   2. SWIPE TO DISMISS: drag a menu down (or right) to throw it
 *      away, the way a native sheet behaves. The panel tracks your
 *      finger 1:1, rubber-bands when dragged the wrong way, and
 *      commits on either distance or flick velocity.
 *      >>> SHIPS DISABLED. <<< Per instruction, this is not live
 *      until it has been felt and approved. Turn it on at runtime
 *      with:  FH_UI11.enable('swipeToDismiss')
 *
 *   3. TO-DOS -> QUESTS: renames the one-off goal list's heading.
 *      That list is already `state.quests` / #quest-list internally;
 *      only its visible label still said "To-dos". Deliberately
 *      scoped to that one heading - see the note above renameTodos()
 *      for why renaming "Tasks" would be the wrong feature.
 *
 *   4. TASK FOLDERS: collapsible groups for the Tasks list, so it
 *      stops being one endless scroll. Purely additive storage -
 *      task objects are never mutated, and removing a folder frees
 *      its tasks rather than deleting them.
 *
 * DATA SCOPE: enabled interactive features use the app's saveState()
 * for additive folder, clock, deadline and preference fields. The
 * multi-character migration remains build-disabled and its public
 * mutation APIs fail closed. Existing disabled-feature fields are
 * preserved but never created, merged, moved or deleted on boot.
 * ================================================================ */
(function () {
  "use strict";

  if (window.FH_UI11) return;

  var FLAGS = {
    persistentExits: true,    // 1 - live
    swipeToDismiss: false,    // 2 - OFF until approved
    renameQuests: true,       // 3 - live
    taskFolders: true,        // 4 - live
    clickClockToPause: true,  // 5 - live
    preserveLogs: true,       // 7 - live
    multiClock: true,         // 8 - live
    renameSessions: true,     // 10 - live
    characters: false,        // 11 - OFF: creates per-character vaults in the
                              //     same localStorage entry as the live save.
                              //     Joel's real save is ~650KB; enable only when
                              //     it can be watched. FH_UI11.enable('characters')
    questDeadlines: true,     // 13 - live
    accountAchievements: true,// 14 - live
    renameTasks: true,        // 15 - live
    achViews: true,           // 16 - live
    compactSkills: true       // 17 - live; UI-only preference, never player data
  };
  var CHARACTERS_BUILD_ENABLED = false;

  /* Let the smoke-test harness disable us the same way the rest of
     the app is disabled, so automated runs stay clean. */
  if (window.__focusHeroBrowserSmokeDisabled) {
    FLAGS.persistentExits = false;
    FLAGS.renameQuests = false;
  }

  /* ============================================================
   * 1. PERSISTENT EXITS
   * ==========================================================*/

  var EXIT_CSS = [
    /* The close control sticks to the top of the modal's own scroll
       box. top is pulled up by the modal's 22px padding so it hugs
       the real top edge instead of floating below it. */
    '.modal{position:relative}',
    '.modal > .close,.modal .close{',
    '  position:sticky;',
    '  top:-22px;',
    '  float:right;',
    '  z-index:40;',
    '  margin-top:-6px;',
    '  margin-right:-6px;',
    '  min-width:34px;min-height:34px;',
    '  display:inline-flex;align-items:center;justify-content:center;',
    '  border-radius:10px;',
    '  background:var(--panel,#141829);',
    '  box-shadow:0 2px 10px rgba(0,0,0,.45);',
    '  cursor:pointer;',
    '}',
    '.modal > .close:hover,.modal .close:hover{filter:brightness(1.35)}',
    '.modal > .close:focus-visible,.modal .close:focus-visible{',
    '  outline:2px solid var(--accent,#7ee0c8);outline-offset:2px}',

    /* Padding at 16px on small screens, so match the offset there. */
    '@media (max-width:640px){',
    '  .modal > .close,.modal .close{top:-16px}',
    '}',

    /* Fallback exit we inject into menus that ship without a close
       button of their own. */
    '.fh11-exit{',
    '  position:sticky;top:-22px;float:right;z-index:41;',
    '  min-width:34px;min-height:34px;',
    '  display:inline-flex;align-items:center;justify-content:center;',
    '  margin-top:-6px;margin-right:-6px;',
    '  border:1px solid var(--border-strong,rgba(255,255,255,.18));',
    '  border-radius:10px;',
    '  background:var(--panel,#141829);',
    '  color:var(--fg,#e8ecff);',
    '  font-size:18px;line-height:1;cursor:pointer;',
    '  box-shadow:0 2px 10px rgba(0,0,0,.45);',
    '}',
    '.fh11-exit:hover{filter:brightness(1.35)}',

    /* Swipe support - transform is driven from JS. */
    '.fh11-swiping .modal{transition:none!important;will-change:transform}',
    '.fh11-settling .modal{transition:transform .22s cubic-bezier(.2,.8,.2,1),opacity .22s ease!important}',
    '.fh11-grip{',
    '  display:block;width:38px;height:4px;border-radius:99px;',
    '  margin:-8px auto 10px;',
    '  background:var(--border-strong,rgba(255,255,255,.22));',
    '}'
  ].join("\n");

  function injectCss() {
    if (document.getElementById("fh11-css")) return;
    var el = document.createElement("style");
    el.id = "fh11-css";
    el.textContent = EXIT_CSS + "\n" + FOLDER_CSS + "\n" + CLOCK_CSS + "\n" + CLOCK_STRIP_CSS + "\n" + SETTINGS_CSS + "\n" + CHAR_CSS + "\n" + DUE_CSS + "\n" + ACHVIEW_CSS;
    (document.head || document.documentElement).appendChild(el);
  }

  function isOpen(backdrop) {
    return backdrop && !backdrop.hasAttribute("hidden") &&
           backdrop.style.display !== "none";
  }

  function openBackdrops() {
    var all = document.querySelectorAll(".modal-backdrop");
    var out = [];
    for (var i = 0; i < all.length; i++) if (isOpen(all[i])) out.push(all[i]);
    return out;
  }

  function topBackdrop() {
    var open = openBackdrops();
    return open.length ? open[open.length - 1] : null;
  }

  /* A data-locked modal represents unfinished accounting work. Generic
     convenience exits must never bypass the app's own completion path. */
  function dismissLocked(backdrop) {
    return !!(backdrop && backdrop.hasAttribute("data-locked") &&
      backdrop.getAttribute("data-locked") !== "false");
  }

  /* Close a menu the way the app itself would, preferring the
     app's own handler so its cleanup logic still runs. */
  function closeBackdrop(backdrop) {
    if (!backdrop || dismissLocked(backdrop)) return false;
    var own = backdrop.querySelector(".close, .fh11-exit");
    if (own && !own.classList.contains("fh11-exit")) {
      own.click();
      return true;
    }
    backdrop.setAttribute("hidden", "");
    return true;
  }

  /* Give every open menu without a close control one of its own. */
  function ensureExit(backdrop) {
    if (dismissLocked(backdrop)) return;
    var modal = backdrop.querySelector(".modal");
    if (!modal) return;
    if (modal.querySelector(".close") || modal.querySelector(".fh11-exit")) return;

    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "fh11-exit";
    btn.setAttribute("aria-label", "Close");
    btn.title = "Close";
    btn.textContent = "×";
    btn.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      backdrop.setAttribute("hidden", "");
    });
    modal.insertBefore(btn, modal.firstChild);
  }

  function wireGlobalExits() {
    /* Escape closes the top-most menu. */
    document.addEventListener("keydown", function (e) {
      if (!FLAGS.persistentExits) return;
      if (e.key !== "Escape" && e.key !== "Esc") return;
      var b = topBackdrop();
      if (!b || dismissLocked(b)) return;
      /* Don't steal Escape from a field the user is typing in. */
      var a = document.activeElement;
      if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && a.value) return;
      e.preventDefault();
      closeBackdrop(b);
    }, true);

    /* Clicking the dimmed area closes it. Only when the press both
       started and ended on the backdrop, so a text selection that
       drifts outside the panel doesn't nuke the menu. */
    var downOnBackdrop = null;
    document.addEventListener("pointerdown", function (e) {
      downOnBackdrop = e.target.classList &&
        e.target.classList.contains("modal-backdrop") ? e.target : null;
    }, true);
    document.addEventListener("click", function (e) {
      if (!FLAGS.persistentExits) return;
      if (!downOnBackdrop) return;
      var t = e.target;
      if (t === downOnBackdrop && t.classList.contains("modal-backdrop")) {
        closeBackdrop(t);
      }
      downOnBackdrop = null;
    }, true);
  }

  /* ============================================================
   * 2. SWIPE TO DISMISS   (disabled by default)
   * ==========================================================*/

  var COMMIT_DISTANCE = 96;   // px before a slow drag counts as dismiss
  var COMMIT_VELOCITY = 0.55; // px/ms flick that dismisses at any distance
  var RUBBER = 0.32;          // resistance factor dragging the wrong way

  function rubber(d) { return Math.sign(d) * Math.pow(Math.abs(d), 0.85) * RUBBER; }

  function attachSwipe() {
    var active = null;

    function begin(e) {
      if (!FLAGS.swipeToDismiss) return;
      if (e.pointerType === "mouse") return;      // touch/pen only
      var backdrop = e.target.closest && e.target.closest(".modal-backdrop");
      if (!backdrop || !isOpen(backdrop) || dismissLocked(backdrop)) return;
      var modal = backdrop.querySelector(".modal");
      if (!modal) return;

      /* Never hijack a drag that starts on something interactive or
         on a region the user is scrolling. */
      if (e.target.closest("input,textarea,select,button,a,[contenteditable]")) return;

      active = {
        backdrop: backdrop, modal: modal,
        x0: e.clientX, y0: e.clientY,
        t0: performance.now(),
        lastY: e.clientY, lastT: performance.now(),
        v: 0, axis: null,
        scrollTop: modal.scrollTop,
        captured: false
      };
    }

    function move(e) {
      if (!active) return;
      var dx = e.clientX - active.x0;
      var dy = e.clientY - active.y0;

      if (!active.axis) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        active.axis = Math.abs(dy) > Math.abs(dx) ? "y" : "x";
        /* A downward drag inside a menu that is scrolled away from
           the top belongs to the scroller, not to us. */
        if (active.axis === "y" && active.scrollTop > 0) { active = null; return; }
        if (active.axis === "x" && dx < 0) { active = null; return; }
        active.backdrop.classList.add("fh11-swiping");
        active.captured = true;
        try { active.modal.setPointerCapture(e.pointerId); } catch (_) {}
      }

      var now = performance.now();
      var dt = now - active.lastT;
      if (dt > 0) {
        var travel = active.axis === "y" ? (e.clientY - active.lastY) : dx;
        active.v = travel / dt;
      }
      active.lastY = e.clientY; active.lastT = now;

      var offset = active.axis === "y" ? dy : dx;
      var shown = offset >= 0 ? offset : rubber(offset);
      var prop = active.axis === "y" ? "translateY" : "translateX";
      active.modal.style.transform = prop + "(" + shown + "px)";
      active.modal.style.opacity = String(
        Math.max(0.35, 1 - Math.abs(shown) / (COMMIT_DISTANCE * 3))
      );
      if (e.cancelable) e.preventDefault();
    }

    function end(e) {
      if (!active) return;
      var a = active; active = null;
      if (!a.captured) return;

      a.backdrop.classList.remove("fh11-swiping");
      a.backdrop.classList.add("fh11-settling");

      var dx = e.clientX - a.x0, dy = e.clientY - a.y0;
      var offset = a.axis === "y" ? dy : dx;
      var dismiss = offset > COMMIT_DISTANCE || a.v > COMMIT_VELOCITY;

      function cleanup() {
        a.modal.style.transform = "";
        a.modal.style.opacity = "";
        a.backdrop.classList.remove("fh11-settling");
        a.modal.removeEventListener("transitionend", cleanup);
      }

      if (dismiss) {
        var away = a.axis === "y" ? "translateY(110%)" : "translateX(110%)";
        a.modal.style.transform = away;
        a.modal.style.opacity = "0";
        setTimeout(function () { closeBackdrop(a.backdrop); cleanup(); }, 200);
      } else {
        a.modal.style.transform = "translate(0,0)";
        a.modal.style.opacity = "1";
        a.modal.addEventListener("transitionend", cleanup);
        setTimeout(cleanup, 320);
      }
    }

    document.addEventListener("pointerdown", begin, true);
    document.addEventListener("pointermove", move, { capture: true, passive: false });
    document.addEventListener("pointerup", end, true);
    document.addEventListener("pointercancel", end, true);
  }

  function ensureGrip(backdrop) {
    if (!FLAGS.swipeToDismiss) return;
    var modal = backdrop.querySelector(".modal");
    if (!modal || modal.querySelector(".fh11-grip")) return;
    var grip = document.createElement("span");
    grip.className = "fh11-grip";
    grip.setAttribute("aria-hidden", "true");
    modal.insertBefore(grip, modal.firstChild);
  }

  /* ============================================================
   * 3. TASKS -> QUESTS  (display vocabulary only)
   * ==========================================================*/

  /* IMPORTANT SCOPING NOTE
   *
   * This app has three separate concepts and they are easy to
   * confuse:
   *
   *   state.tasks   / #task-list   -> "Tasks": time-tracking
   *                                   categories that accumulate
   *                                   focused minutes forever.
   *   state.quests  / #quest-list  -> shown as "To-dos": one-off
   *                                   goals you tick for XP. Already
   *                                   named `quests` internally.
   *   #tab-quests-v85              -> daily/weekly/seasonal reward
   *                                   quests.
   *
   * The requested rename is To-dos -> Quests, which touches the
   * SECOND one only. Renaming Tasks would both hit the wrong
   * feature and collide with the third. So this is deliberately a
   * one-label change, not a global sweep. */

  function renameTodos() {
    if (!FLAGS.renameQuests) return;
    var h = document.getElementById("quest-heading");
    if (!h) return;
    for (var i = 0; i < h.childNodes.length; i++) {
      var n = h.childNodes[i];
      if (n.nodeType === 3 && /to-?do/i.test(n.nodeValue)) {
        n.nodeValue = n.nodeValue
          .replace(/To-?dos/g, "Quests").replace(/To-?do/g, "Quest")
          .replace(/to-?dos/g, "quests").replace(/to-?do/g, "quest");
      }
    }
  }

  function sweep() { renameTodos(); }

  /* ============================================================
   * 4. TASK FOLDERS
   *
   * Groups the Tasks list into collapsible folders so it stops
   * being one endless scroll.
   *
   * Storage is additive and non-destructive: task objects are NEVER
   * mutated. Folders live in two new state keys, and a task with no
   * entry simply renders ungrouped exactly as it does today.
   *
   *   state.taskFolders   = [{id, name, collapsed, createdAt, updatedAt}]
   *   state.taskFolderMap = { taskId: folderId }
   *   state.taskFolderUpdatedAt = { folderId: timestamp }
   *   state.taskFolderTombstones = { folderId: timestamp }
   *   state.taskFolderAssignmentUpdatedAt = { taskId: timestamp }
   *
   * sanitizeForExport() deep-clones the whole state with no
   * whitelist, so all folder keys are picked up by backups, exports and
   * cloud sync automatically. Deleting a folder never deletes a
   * task - its tasks fall back to ungrouped.
   * ==========================================================*/

  var FOLDER_CSS = [
    /* The dashboard Skills card starts as a concise summary instead of
       stretching a narrow desktop column down the page. The full list is
       still one button away and, when open on desktop, scrolls inside the
       card rather than making the whole dashboard an endless black rail. */
    '#section-tasks.fh11-skills-compact{min-height:0!important;align-self:start}',
    '#section-tasks.fh11-skills-compact .card-head{align-items:flex-start;flex-wrap:wrap;margin-bottom:4px}',
    '#section-tasks.fh11-skills-compact #tasks-heading{flex:1 1 150px;min-width:0;margin:0}',
    '#section-tasks.fh11-skills-compact #tasks-heading>.muted{display:none}',
    '.fh11-skills-actions{display:flex;align-items:center;justify-content:flex-end;gap:6px;flex:0 0 auto}',
    '.fh11-skills-toggle{min-height:36px;padding:.38rem .66rem;font-size:.72rem;font-weight:750}',
    '.fh11-skills-toggle:focus-visible{outline:2px solid var(--accent,#7ee0c8);outline-offset:2px}',
    '.fh11-skills-summary{min-width:0;margin:2px 0 0;color:var(--ink-dim,#aeb7cc);font-size:.76rem;line-height:1.35;overflow-wrap:anywhere}',
    '.fh11-skills-summary strong{color:var(--ink,#f3f6ff);font-weight:700}',
    '.fh11-skills-body{margin-top:10px}',
    '.fh11-skills-body[hidden]{display:none!important}',
    '#section-tasks.fh11-skills-collapsed{padding-top:14px;padding-bottom:14px}',
    '@media (min-width:861px){',
    '  #section-tasks.fh11-skills-compact:not(.fh11-skills-collapsed) #task-list{',
    '    max-height:min(56vh,640px);overflow:auto;overscroll-behavior:contain;',
    '    scrollbar-gutter:stable;padding-right:3px}',
    '}',
    '@media (max-width:520px){',
    '  .fh11-skills-actions{width:100%;display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}',
    '  .fh11-skills-actions button{width:100%;min-height:44px;white-space:normal}',
    '  .fh11-skills-summary{font-size:.78rem}',
    '}',
    '@media (hover:none),(pointer:coarse){.fh11-folder-tools{opacity:1}}',

    '.fh11-folder{margin:8px 0 4px}',
    '.fh11-folder-head{',
    '  display:flex;align-items:center;gap:8px;width:100%;',
    '  padding:7px 10px;cursor:pointer;text-align:left;',
    '  background:rgba(255,255,255,.045);',
    '  border:1px solid var(--border,rgba(255,255,255,.10));',
    '  border-radius:10px;color:var(--fg,#e8ecff);',
    '  font-size:.78rem;letter-spacing:.06em;text-transform:uppercase;',
    '}',
    '.fh11-folder-head:hover{background:rgba(255,255,255,.085)}',
    '.fh11-caret{transition:transform .18s ease;opacity:.75;font-size:.7rem}',
    '.fh11-folder.collapsed .fh11-caret{transform:rotate(-90deg)}',
    '.fh11-folder-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.fh11-folder-count{opacity:.6;font-variant-numeric:tabular-nums}',
    '.fh11-folder-body{padding-left:8px;border-left:2px solid rgba(255,255,255,.07);margin-left:6px}',
    '.fh11-folder.collapsed .fh11-folder-body{display:none}',
    '.fh11-folder-tools{display:flex;gap:4px;opacity:0;transition:opacity .15s}',
    '.fh11-folder-head:hover .fh11-folder-tools{opacity:1}',
    '.fh11-folder-tools button{',
    '  background:none;border:none;color:inherit;cursor:pointer;',
    '  padding:2px 5px;border-radius:6px;font-size:.8rem;opacity:.8}',
    '.fh11-folder-tools button:hover{background:rgba(255,255,255,.12);opacity:1}',
    '.fh11-newfolder{',
    '  margin:8px 0 2px;padding:6px 10px;width:100%;cursor:pointer;',
    '  background:none;border:1px dashed var(--border,rgba(255,255,255,.18));',
    '  border-radius:10px;color:var(--fg,#e8ecff);opacity:.62;font-size:.76rem;',
    '  text-transform:uppercase;letter-spacing:.06em}',
    '.fh11-newfolder:hover{opacity:1;background:rgba(255,255,255,.05)}',
    '.task .fh11-move{opacity:.75}',
    '.task .fh11-move:hover{opacity:1}',

    /* --- pre-existing bug fix ---------------------------------
     * .task .name is flex:1;min-width:0, so in the narrow Tasks
     * column the emoji + "Edit minutes" button + 5 action buttons
     * consume the whole row and the NAME COLLAPSES TO 0px WIDE -
     * measured on the unpatched build too, so this is not caused
     * by the folder button. Guarantee the name a floor and let the
     * rest wrap instead of crushing it. */
    '.task{flex-wrap:wrap}',
    '.task .name{min-width:96px;flex:1 1 96px}',
    '.task .total{flex:0 1 auto;min-width:0}',
    '.task .actions{flex:0 1 auto;min-width:0;flex-wrap:wrap;justify-content:flex-end}'
  ].join("\n");

  function S() { return window.state; }
  function persist() { if (typeof window.saveState === "function") window.saveState(); }

  function folders() {
    var s = S();
    if (!s) return [];
    if (!Array.isArray(s.taskFolders)) s.taskFolders = [];
    return s.taskFolders;
  }

  function folderMap() {
    var s = S();
    if (!s) return {};
    if (!s.taskFolderMap || typeof s.taskFolderMap !== "object") s.taskFolderMap = {};
    return s.taskFolderMap;
  }

  function folderMetadata(key) {
    var s = S();
    if (!s) return {};
    if (!s[key] || typeof s[key] !== "object" || Array.isArray(s[key])) s[key] = {};
    return s[key];
  }

  function nextFolderMutationAt(map, id) {
    var prior = Number(map && map[id]);
    return Math.max(Date.now(), Number.isFinite(prior) && prior > 0 ? Math.floor(prior) + 1 : 0);
  }

  function newId() {
    return "fld_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function createFolder(name) {
    name = (name || "").trim();
    if (!name) return null;
    var createdAt = Date.now();
    var f = { id: newId(), name: name.slice(0, 40), collapsed: false, createdAt: createdAt, updatedAt: createdAt };
    folders().push(f);
    folderMetadata("taskFolderUpdatedAt")[f.id] = createdAt;
    delete folderMetadata("taskFolderTombstones")[f.id];
    persist();
    return f;
  }

  function renameFolder(id) {
    var f = folders().filter(function (x) { return x.id === id; })[0];
    if (!f) return;
    var next = window.prompt("Rename folder", f.name);
    if (next === null) return;
    next = next.trim();
    if (next) {
      var updates = folderMetadata("taskFolderUpdatedAt");
      var updatedAt = nextFolderMutationAt(updates, id);
      f.name = next.slice(0, 40);
      f.updatedAt = updatedAt;
      updates[id] = updatedAt;
      persist(); rerender();
    }
  }

  /* Deleting a folder frees its tasks. It never deletes a task. */
  function deleteFolder(id) {
    var s = S(); if (!s) return;
    var map = folderMap();
    var assignmentUpdates = folderMetadata("taskFolderAssignmentUpdatedAt");
    var tombstones = folderMetadata("taskFolderTombstones");
    var deletedAt = nextFolderMutationAt(tombstones, id);
    tombstones[id] = deletedAt;
    var freed = 0;
    for (var k in map) if (map[k] === id) {
      delete map[k];
      assignmentUpdates[k] = Math.max(deletedAt, Number(assignmentUpdates[k]) || 0);
      freed++;
    }
    s.taskFolders = folders().filter(function (x) { return x.id !== id; });
    persist(); rerender();
    if (typeof window.toast === "function") {
      window.toast(freed
        ? "Folder removed — " + freed + " task" + (freed === 1 ? "" : "s") + " moved out, none deleted."
        : "Folder removed.", "good");
    }
  }

  function toggleFolder(id) {
    var f = folders().filter(function (x) { return x.id === id; })[0];
    if (!f) return;
    f.collapsed = !f.collapsed;
    persist(); rerender();
  }

  function assignTask(taskId, folderId) {
    var map = folderMap();
    var updates = folderMetadata("taskFolderAssignmentUpdatedAt");
    updates[taskId] = nextFolderMutationAt(updates, taskId);
    if (folderId) map[taskId] = folderId; else delete map[taskId];
    persist(); rerender();
  }

  /* Small inline picker so a task can be filed without drag-and-drop
     (which is unreliable inside a scrolling panel on touch). */
  function openMovePicker(taskId, anchor) {
    var existing = document.querySelector(".fh11-picker");
    if (existing) existing.remove();

    var map = folderMap();
    var cur = map[taskId] || "";
    var box = document.createElement("div");
    box.className = "fh11-picker";
    box.style.cssText = [
      "position:fixed", "z-index:200", "min-width:190px", "padding:6px",
      "background:var(--panel,#141829)",
      "border:1px solid var(--border-strong,rgba(255,255,255,.18))",
      "border-radius:12px", "box-shadow:0 10px 34px rgba(0,0,0,.55)",
      "font-size:.85rem", "max-height:280px", "overflow:auto"
    ].join(";");

    function opt(label, fid) {
      var b = document.createElement("button");
      b.type = "button";
      b.textContent = (fid === cur ? "✓ " : "   ") + label;
      b.style.cssText = "display:block;width:100%;text-align:left;padding:7px 9px;" +
        "background:none;border:none;color:inherit;cursor:pointer;border-radius:8px";
      b.onmouseenter = function () { b.style.background = "rgba(255,255,255,.10)"; };
      b.onmouseleave = function () { b.style.background = "none"; };
      b.onclick = function (e) {
        e.stopPropagation();
        box.remove();
        if (fid === "__new") {
          var nm = window.prompt("New folder name");
          var f = createFolder(nm);
          if (f) assignTask(taskId, f.id);
          return;
        }
        assignTask(taskId, fid || null);
      };
      box.appendChild(b);
    }

    opt("No folder", "");
    folders().forEach(function (f) { opt(f.name, f.id); });
    var sep = document.createElement("div");
    sep.style.cssText = "height:1px;background:rgba(255,255,255,.12);margin:5px 4px";
    box.appendChild(sep);
    opt("New folder…", "__new");

    document.body.appendChild(box);
    var r = anchor.getBoundingClientRect();
    var top = Math.min(r.bottom + 6, window.innerHeight - box.offsetHeight - 10);
    var left = Math.min(r.left, window.innerWidth - box.offsetWidth - 10);
    box.style.top = Math.max(8, top) + "px";
    box.style.left = Math.max(8, left) + "px";

    setTimeout(function () {
      document.addEventListener("pointerdown", function away(e) {
        if (!box.contains(e.target)) { box.remove(); document.removeEventListener("pointerdown", away, true); }
      }, true);
    }, 0);
  }

  function hoursLabel(mins) {
    if (typeof window.formatHours === "function") return window.formatHours(mins);
    return (Math.round((mins / 60) * 10) / 10) + "h";
  }

  /* ============================================================
   * 4A. COMPACT SKILLS CARD
   *
   * This is presentation state, not player state. It deliberately
   * does not use saveState(), state.settings, state.tasks, folder
   * objects or the cloud payload. One tiny standalone key remembers
   * the choice; sessionStorage keeps it working for the current tab
   * when a full localStorage quota refuses the persistent write.
   * ==========================================================*/

  var SKILLS_PREF_KEY = "focusHero.ui.skillsExpanded.v1";
  var skillsExpanded = null;
  var skillsDeepLinkWired = false;

  function readSkillsPreference() {
    var raw = null;
    try { raw = window.localStorage.getItem(SKILLS_PREF_KEY); } catch (_) {}
    if (raw === null) {
      try { raw = window.sessionStorage.getItem(SKILLS_PREF_KEY); } catch (_) {}
    }
    return raw === "1";
  }

  function rememberSkillsPreference(expanded) {
    var value = expanded ? "1" : "0";
    try { window.localStorage.setItem(SKILLS_PREF_KEY, value); } catch (_) {}
    try { window.sessionStorage.setItem(SKILLS_PREF_KEY, value); } catch (_) {}
  }

  function skillSummary() {
    var s = S();
    var tasks = s && Array.isArray(s.tasks) ? s.tasks : [];
    var minutes = tasks.reduce(function (sum, task) {
      var n = Number(task && task.totalFocusMin);
      return sum + (Number.isFinite(n) && n > 0 ? n : 0);
    }, 0);
    var activeId = s && (s.timer && s.timer.activeTaskId || s.activeTaskId);
    var active = activeId && tasks.filter(function (task) { return task && task.id === activeId; })[0];
    var globalMinutes = Number(s && s.totalFocusMin);
    if (!Number.isFinite(globalMinutes) || globalMinutes < 0) globalMinutes = 0;
    return {
      count: tasks.length,
      minutes: minutes,
      globalMinutes: globalMinutes,
      active: active && String(active.name || "").trim()
    };
  }

  function refreshSkillsSummary() {
    var el = document.querySelector("#section-tasks .fh11-skills-summary");
    if (!el) return;
    var info = skillSummary();
    var label = !info.count
      ? "No skills yet · Open to add your first"
      : info.count + " skill" + (info.count === 1 ? "" : "s") +
        " · " + hoursLabel(info.minutes) + " assigned to current skills" +
        (info.globalMinutes !== info.minutes ? " · Global focus: " + hoursLabel(info.globalMinutes) : "") +
        (info.active ? " · Active: " + info.active : "");
    /* Avoid retriggering our broad MutationObserver when nothing changed. */
    if (el.textContent !== label) el.textContent = label;
  }

  function applySkillsExpanded() {
    var section = document.getElementById("section-tasks");
    if (!section) return false;
    var body = document.getElementById("fh11-skills-body");
    var toggle = section.querySelector(".fh11-skills-toggle");
    var open = !!skillsExpanded;
    section.classList.toggle("fh11-skills-collapsed", !open);
    section.setAttribute("data-skills-expanded", open ? "true" : "false");
    if (body && body.hidden === open) body.hidden = !open;
    if (toggle) {
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      toggle.textContent = open ? "Close skills" : "Open skills";
      toggle.title = open ? "Collapse the Skills list" : "Open the Skills list";
    }
    return true;
  }

  function setSkillsExpanded(expanded, remember) {
    var body = document.getElementById("fh11-skills-body");
    var toggle = document.querySelector("#section-tasks .fh11-skills-toggle");
    if (!expanded && body && body.contains(document.activeElement) && toggle) toggle.focus();
    skillsExpanded = !!expanded;
    if (remember) rememberSkillsPreference(skillsExpanded);
    applySkillsExpanded();
    refreshSkillsSummary();
    return skillsExpanded;
  }

  function wireSkillsDeepLinks() {
    if (skillsDeepLinkWired) return;
    skillsDeepLinkWired = true;
    document.addEventListener("click", function (event) {
      var target = event.target && event.target.closest && event.target.closest(
        "#btn-all-tasks-add, #all-tasks-body [data-act='edit']"
      );
      if (target) setSkillsExpanded(true, true);
    }, true);
  }

  function ensureCompactSkills() {
    if (!FLAGS.compactSkills) return false;
    var section = document.getElementById("section-tasks");
    var head = section && section.querySelector(".card-head");
    var list = document.getElementById("task-list");
    var addRow = section && section.querySelector(".task-add-row");
    if (!section || !head || !list || !addRow) return false;

    section.classList.add("fh11-skills-compact");

    var body = document.getElementById("fh11-skills-body");
    if (!body) {
      body = document.createElement("div");
      body.id = "fh11-skills-body";
      body.className = "fh11-skills-body";
      head.insertAdjacentElement("afterend", body);
      body.appendChild(list);
      body.appendChild(addRow);
    }

    var summary = section.querySelector(".fh11-skills-summary");
    if (!summary) {
      summary = document.createElement("div");
      summary.className = "fh11-skills-summary";
      summary.setAttribute("role", "status");
      summary.setAttribute("aria-live", "polite");
      head.insertAdjacentElement("afterend", summary);
    }

    var actions = section.querySelector(".fh11-skills-actions");
    if (!actions) {
      actions = document.createElement("div");
      actions.className = "fh11-skills-actions";
      head.appendChild(actions);
    }

    var toggle = actions.querySelector(".fh11-skills-toggle");
    if (!toggle) {
      toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "mini-command fh11-skills-toggle";
      toggle.setAttribute("aria-controls", body.id);
      toggle.addEventListener("click", function () {
        setSkillsExpanded(!skillsExpanded, true);
      });
      actions.appendChild(toggle);
    }
    var showAll = document.getElementById("btn-show-all-tasks");
    if (showAll && showAll.parentNode !== actions) actions.appendChild(showAll);

    if (skillsExpanded === null) skillsExpanded = readSkillsPreference();
    applySkillsExpanded();
    refreshSkillsSummary();
    wireSkillsDeepLinks();
    return true;
  }

  /* Rebuild #task-list into folder sections. Runs AFTER the app's own
     renderTasks(), so the app stays the single source of truth for
     row markup and behaviour - we only move existing rows around. */
  function applyFolders() {
    var list = document.getElementById("task-list");
    var s = S();
    if (!list || !s || !Array.isArray(s.tasks)) return;
    ensureCompactSkills();
    refreshSkillsSummary();
    if (list.querySelector(".fh11-folder, .fh11-newfolder")) return; // already applied

    var rows = Array.prototype.slice.call(list.querySelectorAll(".task[data-task-id]"));

    /* Add a "file this task" button to each row. */
    rows.forEach(function (row) {
      var actions = row.querySelector(".actions");
      if (!actions || actions.querySelector(".fh11-move")) return;
      var b = document.createElement("button");
      b.type = "button";
      b.className = "fh11-move";
      b.title = "Move to folder";
      b.setAttribute("aria-label", "Move to folder");
      b.textContent = "🗂";
      b.addEventListener("click", function (e) {
        e.preventDefault(); e.stopPropagation();
        openMovePicker(row.getAttribute("data-task-id"), b);
      });
      actions.appendChild(b);
    });

    var fs = folders();
    var map = folderMap();
    var byId = {};
    s.tasks.forEach(function (t) { byId[t.id] = t; });

    /* Nothing to do if the user has no folders yet - but still offer
       the create affordance. */
    if (fs.length) {
      var grouped = {};
      fs.forEach(function (f) { grouped[f.id] = []; });
      var loose = [];
      rows.forEach(function (row) {
        var id = row.getAttribute("data-task-id");
        var fid = map[id];
        if (fid && grouped[fid]) grouped[fid].push(row); else loose.push(row);
      });

      fs.forEach(function (f) {
        var kids = grouped[f.id];
        var wrap = document.createElement("div");
        wrap.className = "fh11-folder" + (f.collapsed ? " collapsed" : "");

        var mins = kids.reduce(function (acc, row) {
          var t = byId[row.getAttribute("data-task-id")];
          return acc + ((t && t.totalFocusMin) || 0);
        }, 0);

        var head = document.createElement("div");
        head.className = "fh11-folder-head";
        head.setAttribute("role", "button");
        head.setAttribute("tabindex", "0");
        head.innerHTML =
          '<span class="fh11-caret">▼</span>' +
          '<span class="fh11-folder-name"></span>' +
          '<span class="fh11-folder-count"></span>' +
          '<span class="fh11-folder-tools">' +
          '<button data-f="rename" title="Rename folder">✎</button>' +
          '<button data-f="del" title="Remove folder (keeps tasks)">✕</button>' +
          '</span>';
        head.querySelector(".fh11-folder-name").textContent = f.name;
        head.querySelector(".fh11-folder-count").textContent =
          kids.length + " · " + hoursLabel(mins);

        head.addEventListener("click", function (e) {
          var t = e.target.closest("button[data-f]");
          if (t) {
            e.stopPropagation();
            if (t.dataset.f === "rename") renameFolder(f.id);
            else deleteFolder(f.id);
            return;
          }
          toggleFolder(f.id);
        });
        head.addEventListener("keydown", function (e) {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleFolder(f.id); }
        });

        var body = document.createElement("div");
        body.className = "fh11-folder-body";
        kids.forEach(function (r) { body.appendChild(r); });

        wrap.append(head, body);
        list.appendChild(wrap);
      });

      loose.forEach(function (r) { list.appendChild(r); });
    }

    var add = document.createElement("button");
    add.type = "button";
    add.className = "fh11-newfolder";
    add.textContent = "＋ New folder";
    add.addEventListener("click", function () {
      var nm = window.prompt("New folder name");
      if (createFolder(nm)) rerender();
    });
    list.appendChild(add);
  }

  /* ============================================================
   * 5. CLICK THE CLOCK TO PAUSE / RESUME
   *
   * Second way to control the timer so you never have to scroll to
   * reach Start/Pause. The Start button keeps working exactly as it
   * does now - this is additive.
   *
   * It deliberately DELEGATES to #btn-start rather than calling
   * pauseTimer()/startTimer() itself. The app's real toggle is
   *     state.timer.running ? pauseTimer() : startTimer()
   * and it handles focus, breaks, stopwatch, keepalive and wake
   * lock. Re-implementing that here would mean two sources of truth
   * that could drift apart; clicking the button means the clock can
   * never disagree with it.
   *
   * A11Y: the clock keeps role="timer" + aria-live and gets NO
   * tabindex on purpose. It is a redundant pointer shortcut for a
   * button that is already keyboard reachable, so adding a second
   * tab stop announcing the same control would be noise for screen
   * reader and keyboard users.
   * ==========================================================*/

  var CLOCK_CSS = [
    '#timer-display.fh11-clickable{cursor:pointer;user-select:none;-webkit-user-select:none;',
    '  transition:transform .12s ease,text-shadow .18s ease;-webkit-tap-highlight-color:transparent}',
    '#timer-display.fh11-clickable:hover{text-shadow:0 6px 46px rgba(var(--accent-rgb),.42)}',
    '#timer-display.fh11-clickable:active{transform:scale(.985)}',
    '@media (prefers-reduced-motion:reduce){',
    '  #timer-display.fh11-clickable{transition:none}',
    '  #timer-display.fh11-clickable:active{transform:none}}',
    /* one-shot pulse confirming the tap registered */
    '#timer-display.fh11-pulse{animation:fh11-pulse .28s ease-out}',
    '@keyframes fh11-pulse{0%{opacity:.55}100%{opacity:1}}',
    '@media (prefers-reduced-motion:reduce){#timer-display.fh11-pulse{animation:none}}'
  ].join("\n");

  function wireClock() {
    if (!FLAGS.clickClockToPause) return false;
    var clock = document.getElementById("timer-display");
    var btn = document.getElementById("btn-start");
    if (!clock || !btn) return false;
    if (clock.__fh11Clock) return true;
    clock.__fh11Clock = true;

    clock.classList.add("fh11-clickable");

    function refreshHint() {
      var running = !!(window.state && window.state.timer && window.state.timer.running);
      clock.title = running ? "Click to pause" : "Click to start";
    }
    refreshHint();

    /* Don't hijack a genuine text selection or a drag. */
    var downX = 0, downY = 0, downT = 0;
    clock.addEventListener("pointerdown", function (e) {
      downX = e.clientX; downY = e.clientY; downT = Date.now();
    });

    clock.addEventListener("click", function (e) {
      if (e.button && e.button !== 0) return;
      if (Math.abs(e.clientX - downX) > 8 || Math.abs(e.clientY - downY) > 8) return;
      if (Date.now() - downT > 700) return;              // long-press, not a tap
      var sel = window.getSelection && window.getSelection();
      if (sel && String(sel).length > 0 && !sel.isCollapsed) return;

      e.preventDefault();
      btn.click();                                        // single source of truth

      clock.classList.remove("fh11-pulse");
      void clock.offsetWidth;                             // restart the animation
      clock.classList.add("fh11-pulse");
      setTimeout(refreshHint, 0);
    });

    /* Keep the tooltip honest when the timer changes by any route. */
    try {
      new MutationObserver(refreshHint).observe(btn, {
        childList: true, characterData: true, subtree: true
      });
    } catch (e) {}

    return true;
  }

  /* ============================================================
   * 6. STORAGE HEADROOM (iOS / Safari)
   *
   * Measured on the real build before writing this:
   *
   *   whole saved state ...... 8,379 bytes
   *   one sessionsLog entry ..... 171 bytes
   *   data-guard ring ......... 14 full state copies (IndexedDB)
   *
   * Against a conservative 5 MB localStorage budget that is roughly
   * 30,000 sessions of headroom - years of daily use - so there is
   * no imminent cliff. Two things still matter:
   *
   * (a) EVICTION, not quota, is the real iOS risk. Safari can throw
   *     away "best-effort" storage under pressure. The app never
   *     asked for persistent storage, so we request it here. This is
   *     the single highest-value line in this file for data safety.
   *
   * (b) sessionsLog is the one unbounded array NOT covered by
   *     FH_LOG_CAPS, so the existing quota relief cannot shrink it.
   *     We do NOT trim it - those are the user's real hours. We
   *     monitor it and warn early instead.
   *
   * The rule that keeps this safe as features land: never store
   * generated art or derived data in state. Character/item visuals
   * must be rendered from IDs by code in the bundle, which is served
   * and HTTP-cached and costs zero origin storage.
   * ==========================================================*/

  var STORAGE = { persisted: null, asked: false };

  function requestPersistence() {
    if (STORAGE.asked) return;
    STORAGE.asked = true;
    try {
      if (!navigator.storage || !navigator.storage.persist) return;
      navigator.storage.persisted().then(function (already) {
        if (already) { STORAGE.persisted = true; return; }
        return navigator.storage.persist().then(function (granted) {
          STORAGE.persisted = !!granted;
          /* A browser-capability probe is not a player-data event.  In
             particular, logLine() schedules a full save in the host app,
             which can mark cloud sync pending during an otherwise read-only
             boot.  Keep the result module-local and diagnostic-only. */
          if (window.console && typeof window.console.info === "function") {
            window.console.info("[fh11] persistent storage " +
              (granted ? "granted" : "not granted"));
          }
        });
      }).catch(function () {});
    } catch (e) {}
  }

  function bytesOf(obj) {
    try { return new Blob([JSON.stringify(obj)]).size; } catch (e) { return 0; }
  }

  function fmtBytes(n) {
    if (n < 1024) return n + " B";
    if (n < 1048576) return (n / 1024).toFixed(1) + " KB";
    return (n / 1048576).toFixed(2) + " MB";
  }

  /* Report headroom. Returns a promise so navigator.storage.estimate()
     can be included where the browser supports it. */
  function storageReport() {
    var s = S();
    var stateBytes = s ? bytesOf(s) : 0;
    var sessions = (s && s.sessionsLog && s.sessionsLog.length) || 0;
    var perEntry = 171;                       // measured on this build
    var LS_BUDGET = 5 * 1024 * 1024;          // conservative Safari localStorage figure
    var report = {
      stateBytes: stateBytes,
      stateHuman: fmtBytes(stateBytes),
      sessionsLogged: sessions,
      persisted: STORAGE.persisted,
      localStorageBudget: LS_BUDGET,
      pctOfBudget: +((stateBytes / LS_BUDGET) * 100).toFixed(3),
      sessionsOfHeadroom: Math.max(0, Math.floor((LS_BUDGET - stateBytes) / perEntry)),
      snapshotRingEstimate: fmtBytes(stateBytes * 14)
    };
    if (navigator.storage && navigator.storage.estimate) {
      return navigator.storage.estimate().then(function (est) {
        report.originUsage = est.usage;
        report.originQuota = est.quota;
        report.originUsageHuman = fmtBytes(est.usage || 0);
        report.originQuotaHuman = fmtBytes(est.quota || 0);
        report.originPct = est.quota ? +((est.usage / est.quota) * 100).toFixed(3) : null;
        return report;
      }).catch(function () { return report; });
    }
    return Promise.resolve(report);
  }

  /* Warn well before anything breaks, once per session. */
  var warned = false;
  function checkHeadroom() {
    if (warned) return;
    storageReport().then(function (r) {
      var tight = (r.pctOfBudget > 70) ||
                  (r.originPct !== null && r.originPct !== undefined && r.originPct > 70);
      if (!tight) return;
      warned = true;
      if (typeof window.toast === "function") {
        window.toast("Storage is at " + Math.round(Math.max(r.pctOfBudget, r.originPct || 0)) +
                     "% — export a backup before adding more data.", "warn");
      }
      if (charactersEnabled()) {
        try { reclaim(); } catch (e) {}
      }
      if (false) {
      }
      console.warn("[fh11] storage headroom", r);
    });
  }

  /* ============================================================
   * 7. LOG PRESERVATION
   *
   * WHAT IS ACTUALLY HAPPENING TODAY (measured, not assumed):
   *
   * The app contradicts itself about log retention.
   *
   *   Push-time intent (generous):
   *     LOG_RETENTION_DAYS = 180
   *     APP_LOG_CAP = 10000, ACTIVITY_LOG_CAP = 10000,
   *     BATTLE_LOG_CAP = 5000
   *
   *   Save-time reality (severe), line 6479, runs on EVERY save,
   *   not only under quota pressure:
   *     fhTrimLogs(state, { activityLog:200, appLog:60, battleLog:60 })
   *
   * So the battle log is capped at SIXTY entries permanently. The
   * 180-day / 5000-entry intent never takes effect, because every
   * single save cuts it straight back down. History is being lost
   * continuously right now - not just in some future emergency.
   *
   * THE FIX, in two parts:
   *
   *   (a) DO NOT TRIM. IndexedDB is asynchronous while
   *       fhTrimLogs() is synchronous, so it is impossible to prove a
   *       durable archive before returning from the trim call. Overflow
   *       therefore remains in the live state. No speculative duplicate
   *       is written, and an archive failure can never become data loss.
   *       IndexedDB is used deliberately: it keeps the localStorage
   *       save file (and therefore the 14-day snapshot ring, which
   *       copies it 14 times) small and fast.
   *
   *   (b) RAISE THE EVERYDAY CAPS. At 86 bytes per battle entry and
   *       148 per app entry, with the save file at 8.3 KB and a
   *       5 MB budget, caps of 60 are far more conservative than the
   *       numbers justify. Warm caps go up ~10x, which is still a
   *       rounding error against headroom.
   *
   * A genuine quota emergency fails closed: the core save rolls back and
   * reports the full device instead of silently deleting history before an
   * asynchronous archive has been verified.
   * ==========================================================*/

  /* Retained for an explicitly enabled character build's vault compaction.
     Live diagnostic arrays are not trimmed by this module. */
  var WARM_CAPS = { activityLog: 300, appLog: 150, battleLog: 250 };
  var DB_NAME = "fh11-log-archive", DB_VER = 1, STORE = "entries";
  var dbP = null, queue = [], flushing = false;

  function openDb() {
    if (dbP) return dbP;
    dbP = new Promise(function (res, rej) {
      try {
        var rq = indexedDB.open(DB_NAME, DB_VER);
        rq.onupgradeneeded = function () {
          var db = rq.result;
          if (!db.objectStoreNames.contains(STORE)) {
            var os = db.createObjectStore(STORE, { keyPath: "k" });
            os.createIndex("byType", "type");
            os.createIndex("byAt", "at");
          }
        };
        rq.onsuccess = function () { res(rq.result); };
        rq.onerror = function () { rej(rq.error); };
      } catch (e) { rej(e); }
    }).catch(function () { return null; });
    return dbP;
  }

  function keyFor(type, e) {
    if (!e || typeof e !== "object") return null;
    var base = e.id != null ? String(e.id)
      : String(e.at || e.timestamp || "") + "|" + String(e.text || e.action || "").slice(0, 48);
    return type + ":" + base;
  }

  /* Never throws, never blocks the save path. */
  function flush() {
    if (flushing || !queue.length) return;
    flushing = true;
    var batch = queue; queue = [];
    openDb().then(function (db) {
      if (!db) { flushing = false; return; }
      try {
        var tx = db.transaction(STORE, "readwrite");
        var os = tx.objectStore(STORE);
        batch.forEach(function (rec) { try { os.put(rec); } catch (e) {} });
        tx.oncomplete = tx.onerror = tx.onabort = function () {
          flushing = false;
          if (queue.length) flush();
        };
      } catch (e) { flushing = false; }
    }).catch(function () { flushing = false; });
  }

  function archiveOverflow(s, effectiveCaps) {
    for (var k in effectiveCaps) {
      var arr = s && s[k];
      if (!Array.isArray(arr)) continue;
      var over = arr.length - effectiveCaps[k];
      if (over <= 0) continue;
      var dropped = arr.slice(0, over);          // oldest, the ones slice(-cap) discards
      for (var i = 0; i < dropped.length; i++) {
        var e = dropped[i];
        var key = keyFor(k, e);
        if (!key) continue;
        queue.push({
          k: key, type: k,
          at: (e && (e.at || Date.parse(e.timestamp || "") || 0)) || 0,
          entry: e
        });
      }
    }
    if (queue.length) setTimeout(flush, 0);
  }

  function hookTrimLogs() {
    if (typeof window.fhTrimLogs !== "function") return false;
    if (window.fhTrimLogs.__fh11) return true;
    var orig = window.fhTrimLogs;
    var wrapped = function (s, caps) {
      if (FLAGS.preserveLogs) {
        return 0;
      }
      return orig(s, caps);
    };
    wrapped.__fh11 = true;
    window.fhTrimLogs = wrapped;
    return true;
  }

  /* Read archived history back out. */
  function history(type, limit) {
    limit = limit || 500;
    return openDb().then(function (db) {
      if (!db) return [];
      return new Promise(function (res) {
        var out = [];
        try {
          var tx = db.transaction(STORE, "readonly");
          var os = tx.objectStore(STORE);
          var rq = os.openCursor();
          rq.onsuccess = function () {
            var c = rq.result;
            if (!c || out.length >= limit) { res(out); return; }
            if (!type || c.value.type === type) out.push(c.value.entry);
            c.continue();
          };
          rq.onerror = function () { res(out); };
        } catch (e) { res(out); }
      });
    });
  }

  function archiveStats() {
    return openDb().then(function (db) {
      if (!db) return { available: false };
      return new Promise(function (res) {
        var counts = {};
        try {
          var tx = db.transaction(STORE, "readonly");
          var rq = tx.objectStore(STORE).openCursor();
          rq.onsuccess = function () {
            var c = rq.result;
            if (!c) { res({ available: true, archived: counts }); return; }
            counts[c.value.type] = (counts[c.value.type] || 0) + 1;
            c.continue();
          };
          rq.onerror = function () { res({ available: true, archived: counts }); };
        } catch (e) { res({ available: false }); }
      });
    });
  }

  /* Download everything ever archived, as JSON. */
  function exportHistory() {
    return history(null, 1e9).then(function (all) {
      var blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), entries: all }, null, 2)],
        { type: "application/json" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "focus-hero-log-archive.json";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
      return all.length;
    });
  }

  /* ============================================================
   * 8. MULTI-CLOCK  (up to 5)
   *
   * THE DESIGN, and why it is safe:
   *
   * Only ONE clock is ever live in the app's timer engine at a
   * time - the existing state.timer, completely untouched. The
   * other clocks are PARKED SNAPSHOTS: a frozen copy of the run
   * (mode, remaining ms, task, workout flag, stopwatch fields and
   * runDetails). Switching clocks pauses the live one, files it as
   * a snapshot, and thaws the chosen one back into state.timer.
   *
   * This gives the requested behaviour - park a clock mid-run,
   * start another, come back later and it is exactly where you left
   * it, without ever ending the original task - while making the
   * "overlapping minutes count once" rule structurally true rather
   * than something enforced by arithmetic. One engine can only
   * credit one minute per minute. There is no path where five
   * clocks inflate XP, task totals or mount pity, because four of
   * them are frozen data, not running timers.
   *
   * It also means ZERO new timer engine, zero new crediting code,
   * and no second source of truth about elapsed time. Everything
   * that awards minutes is still the app's own tested pipeline.
   *
   * Storage: one additive key, state.fh11Clocks, ~300 bytes per
   * parked clock.
   * ==========================================================*/

  var MAX_CLOCKS = 5;

  /* Fields that fully describe an in-flight run. */
  var RUN_FIELDS = ["mode", "msLeft", "plannedMs", "workoutMode", "priorityRun", "activeTaskId",
    "activeTaskNameAtStart", "runDetails", "swAccumulatedMs", "swLaps",
    "swSessionStartedAt", "swWorkoutMode", "liveAdjustedAt"];
  var RUN_DEFAULTS = {
    mode: "stopwatch", msLeft: 0, plannedMs: 0, workoutMode: false, priorityRun: false,
    activeTaskId: null, activeTaskNameAtStart: null, runDetails: null,
    swAccumulatedMs: 0, swLaps: [], swSessionStartedAt: 0,
    swWorkoutMode: false, liveAdjustedAt: 0
  };
  /* Only choices that affect this run belong to a parked clock. Theme,
     account settings and past session records remain outside the snapshot. */
  var CLOCK_SESSION_SETTINGS = ["gameMode", "priorityMode", "lockedInXpPct"];

  var CLOCK_STRIP_CSS = [
    '#fh11-clocks{display:flex;flex-wrap:wrap;gap:6px;justify-content:center;',
    '  align-items:center;margin:10px auto 2px;max-width:620px}',
    '.fh11-chip{display:inline-flex;align-items:center;gap:7px;padding:6px 10px;',
    '  border-radius:999px;cursor:pointer;font-size:.78rem;line-height:1;',
    '  border:1px solid var(--border,rgba(255,255,255,.14));',
    '  background:var(--panel-2,rgba(255,255,255,.04));color:var(--fg,#e8ecff);',
    '  transition:border-color .15s ease,background .15s ease;max-width:210px}',
    '.fh11-chip:hover{background:rgba(255,255,255,.09)}',
    '.fh11-chip.live{border-color:var(--accent,#7ee0c8);',
    '  box-shadow:0 0 0 2px rgba(var(--accent-rgb,126,224,200),.16)}',
    '.fh11-chip .t{font-variant-numeric:tabular-nums;font-weight:700;letter-spacing:.01em}',
    '.fh11-chip .n{opacity:.72;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:96px}',
    '.fh11-chip .x{opacity:.45;padding:0 1px;border:none;background:none;',
    '  color:inherit;cursor:pointer;font-size:.9rem;line-height:1}',
    '.fh11-chip .x:hover{opacity:1;color:#ff8a8a}',
    '.fh11-chip .dot{width:6px;height:6px;border-radius:50%;background:var(--accent,#7ee0c8);flex:none}',
    '.fh11-chip.parked .dot{background:rgba(255,255,255,.28)}',
    '.fh11-addclock{padding:6px 11px;border-radius:999px;cursor:pointer;font-size:.78rem;',
    '  background:none;border:1px dashed var(--border,rgba(255,255,255,.2));',
    '  color:var(--fg,#e8ecff);opacity:.6}',
    '.fh11-addclock:hover{opacity:1;background:rgba(255,255,255,.05)}',
    '.fh11-addclock[disabled]{opacity:.25;cursor:not-allowed}'
  ].join("\n");

  function clocks() {
    var s = S();
    if (!s) return { slots: [] };
    if (!s.fh11Clocks || typeof s.fh11Clocks !== "object") s.fh11Clocks = { slots: [] };
    if (!Array.isArray(s.fh11Clocks.slots)) s.fh11Clocks.slots = [];
    /* Clocks are intentionally device-local. Legacy shelves are preserved
       byte-for-byte; addClock enforces MAX_CLOCKS for every new addition. */
    return s.fh11Clocks;
  }

  function persistClocks() {
    var opts = { deferCloudTransfer: true, suppressImmediateCloudTransfer: true, source: "device-local-clocks" };
    if (typeof window.saveStateDurable === "function") return window.saveStateDurable(opts);
    if (typeof window.saveState === "function") return window.saveState(opts);
    return false;
  }

  function persistClocksInBackground() {
    var out;
    try { out = persistClocks(); }
    catch (error) { console.warn("[fh11] device-local clock save failed", error); return false; }
    if (out && typeof out.catch === "function") out.catch(function (error) {
      console.warn("[fh11] device-local clock save failed", error);
    });
    return out;
  }

  function snapshotLive() {
    var t = S() && S().timer;
    if (!t) return null;
    var snap = { id: newId().replace("fld_", "clk_"), label: "", savedAt: Date.now() };
    RUN_FIELDS.forEach(function (f) {
      try { snap[f] = JSON.parse(JSON.stringify(t[f] === undefined ? null : t[f])); }
      catch (e) { snap[f] = null; }
    });
    snap.activeTaskId = effectiveTaskId();
    snap.sessionSettings = {};
    CLOCK_SESSION_SETTINGS.forEach(function (key) {
      var value = S().settings && S().settings[key];
      if (value !== undefined) snap.sessionSettings[key] = JSON.parse(JSON.stringify(value));
    });
    if (S().adventure && typeof S().adventure.action === "string") snap.adventureAction = S().adventure.action;
    return snap;
  }

  function thaw(slot) {
    var s = S(); if (!s || !slot) return;
    var t = s.timer;
    /* Mode first, with resetRun:false so remaining time is preserved. */
    try {
      if (typeof window.setMode === "function" && slot.mode && slot.mode !== t.mode) {
        window.setMode(slot.mode, { resetRun: false, persistState: false });
      }
    } catch (e) {}
    RUN_FIELDS.forEach(function (f) {
      var value = Object.prototype.hasOwnProperty.call(slot, f) ? slot[f] : RUN_DEFAULTS[f];
      if (value === undefined || value === null) value = RUN_DEFAULTS[f];
      try { t[f] = JSON.parse(JSON.stringify(value)); }
      catch (e) { t[f] = JSON.parse(JSON.stringify(RUN_DEFAULTS[f])); }
    });
    /* Older parked clocks have no settings snapshot. Leave those unknown
       choices unchanged rather than inventing or migrating their history. */
    var choices = slot.sessionSettings;
    if (choices && typeof choices === "object" && s.settings) {
      CLOCK_SESSION_SETTINGS.forEach(function (key) {
        if (Object.prototype.hasOwnProperty.call(choices, key)) s.settings[key] = choices[key];
      });
    }
    if ((!choices || typeof choices.priorityMode !== "boolean") && typeof slot.priorityRun === "boolean" && s.settings) s.settings.priorityMode=slot.priorityRun;
    if ((!choices || typeof choices.gameMode !== "boolean") && typeof window.toast === "function") window.toast("This older clock did not save Locked In; check it once.","info");
    if (typeof slot.adventureAction === "string" && s.adventure) s.adventure.action = slot.adventureAction;
    t.running = false; t.endAt = 0; t.pausedAt = Date.now();
    try {
      s.activeTaskId = t.activeTaskId || null;   // idle-state truth, including explicit clear
    } catch (e) {}
    try { if (typeof window.renderTimer === "function") window.renderTimer(); } catch (e) {}
    try { if (typeof window.renderModeTabs === "function") window.renderModeTabs(); } catch (e) {}
    try { if (typeof window.renderActiveTaskRow === "function") window.renderActiveTaskRow(); } catch (e) {}
    try { if (typeof window.renderTasks === "function") window.renderTasks(); } catch (e) {}
    try { if (typeof window.updateGameModeIndicator === "function") window.updateGameModeIndicator(); } catch (e) {}
    try { if (typeof window.renderWorkoutModeUi === "function") window.renderWorkoutModeUi(); } catch (e) {}
    try { if (typeof window.fhUpdatePriorityUi === "function") window.fhUpdatePriorityUi({invalidatePending:true}); } catch (e) {}
    try { if (typeof window.renderActionPicker === "function") window.renderActionPicker(); } catch (e) {}
  }

  function pauseLiveIfRunning() {
    var s = S();
    if (s && s.timer && s.timer.running) {
      if (typeof window.pauseTimer === "function") window.pauseTimer({ persistState: false });
      else {
        var btn = document.getElementById("btn-start");
        if (btn) btn.click();
      }
    }
  }

  /* The app only writes timer.activeTaskId while a run is IN FLIGHT
     (see setActiveTask). When paused/idle, state.activeTaskId is the
     truth. Reading timer.activeTaskId unconditionally shows a stale
     task from a previous run - which is exactly what it did. */
  function effectiveTaskId(src) {
    var s = S(); if (!s) return null;
    var t = src || s.timer || {};
    var inFlight = !!(t.running || t.runDetails || Number(t.swAccumulatedMs) > 0);
    if (inFlight && t.activeTaskId) return t.activeTaskId;
    return (src ? (src.activeTaskId || null) : (s.activeTaskId || null));
  }

  function taskNameFor(id) {
    var s = S();
    if (!s || !id || !Array.isArray(s.tasks)) return "";
    var t = s.tasks.filter(function (x) { return x.id === id; })[0];
    return t ? t.name : "";
  }

  /* ------------------------------------------------------------
   * Stopwatch-correct time for a clock.
   *
   * BUG THIS FIXES: the chips originally read msLeft, which is the
   * COUNTDOWN remainder and is permanently 0 in stopwatch mode. For
   * a stopwatch-only user every chip would have read 0:00 - the
   * feature would have looked broken on the only mode actually
   * used. Stopwatch time is swAccumulatedMs plus, while running,
   * the time since swStartedAt.
   * ----------------------------------------------------------*/
  function clockMs(src, isLive) {
    var t = src || (S() && S().timer);
    if (!t) return 0;
    if (t.mode === "stopwatch") {
      if (isLive && typeof window.stopwatchElapsedMs === "function") {
        return Math.max(0, Number(window.stopwatchElapsedMs(t, Date.now())) || 0);
      }
      var acc = Math.max(0, Number(t.swAccumulatedMs) || 0);
      if (isLive && t.running && t.swStartedAt) acc += Math.max(0, Date.now() - Number(t.swStartedAt));
      return acc;
    }
    if (isLive && t.running && t.endAt) return Math.max(0, t.endAt - Date.now());
    return Math.max(0, t.msLeft | 0);
  }

  function fmtMs(ms) {
    ms = Math.max(0, Number(ms) || 0);
    var total = Math.floor(ms / 1000);
    var m = Math.floor(total / 60), sec = total % 60;
    if (m >= 60) return Math.floor(m / 60) + "h" + String(m % 60).padStart(2, "0");
    return m + ":" + String(sec).padStart(2, "0");
  }

  /* Park the live clock and start a fresh one in its place. */
  function addClock() {
    var s = S(); if (!s) return;
    var c = clocks();
    if (c.slots.length + 1 >= MAX_CLOCKS) return;
    /* Was it actually running before we parked it? If concurrent
       clocks are enabled, "start another clock" must NOT quietly
       stop this one - it keeps running as a shadow clock. Only when
       concurrency is off does parking imply pausing, because then
       there is nowhere for it to keep running. */
    var wasRunning = !!(s.timer && s.timer.running);
    var concurrent = CONCURRENCY_ENABLED && settings().fh11ConcurrentClocks === true;

    pauseLiveIfRunning();
    var snap = snapshotLive();
    if (snap) {
      snap.label = taskNameFor(snap.activeTaskId) || ("Clock " + (c.slots.length + 1));
      if (wasRunning && concurrent && CONCURRENCY_ENABLED) {
        snap.ticking = true;
        snap.tickFrom = Date.now();
      }
      c.slots.push(snap);
    }
    /* Fresh run in the live engine.
     *
     * CRITICAL: startTimer binds the task with
     *     if (!state.timer.activeTaskId) state.timer.activeTaskId = state.activeTaskId
     * i.e. only when it is EMPTY. The clock we just parked left its
     * task id sitting there, so without clearing it the new clock
     * would silently credit its minutes to the PREVIOUS clock's
     * task. Clearing the per-run binding makes startTimer rebind to
     * whatever task is actually selected now. */
    try {
      if (typeof window.setMode === "function") window.setMode(s.timer.mode, { resetRun: true, persistState: false });
    } catch (e) {}
    s.timer.activeTaskId = null;
    s.timer.activeTaskNameAtStart = null;
    s.timer.runDetails = null;
    s.timer.swAccumulatedMs = 0;
    s.timer.swLaps = [];
    s.timer.swSessionStartedAt = 0;
    if (anyTicking()) startTicker();
    var seed = document.getElementById("fh11-addclock-seed");
    if (seed) seed.remove();
    persistClocksInBackground(); renderClocks();
    if (typeof window.toast === "function") {
      window.toast(snap && snap.ticking
        ? snap.label + " is still running alongside — minutes still count once."
        : "Clock parked on this device — " + (snap ? snap.label : "clock") + " is saved exactly where you left it.",
        "good");
    }
  }

  /* Swap a parked clock into the engine; the current one takes its slot. */
  function activateSlot(id) {
    var c = clocks();
    var idx = -1;
    for (var i = 0; i < c.slots.length; i++) if (c.slots[i].id === id) idx = i;
    if (idx < 0) return;
    pauseLiveIfRunning();
    var incoming = c.slots[idx];
    var outgoing = snapshotLive();
    if (outgoing) {
      outgoing.label = taskNameFor(outgoing.activeTaskId) || "Clock";
      c.slots[idx] = outgoing;          // swap in place, order stays stable
    } else {
      c.slots.splice(idx, 1);
    }
    thaw(incoming);
    persistClocksInBackground(); renderClocks();
  }

  function discardSlot(id, ev) {
    if (ev) ev.stopPropagation();
    var c = clocks();
    var slot = c.slots.filter(function (x) { return x.id === id; })[0];
    var name = slot ? (slot.label || "clock") : "clock";
    c.slots = c.slots.filter(function (x) { return x.id !== id; });
    persistClocksInBackground(); renderClocks(); ensureClockAffordance();
    if (typeof window.toast === "function") {
      window.toast("Discarded " + name + " — no minutes were logged.", "warn");
    }
  }

  function stripHost() {
    return document.getElementById("session-mode-strip") ||
           document.getElementById("timer-display");
  }

  function renderClocks() {
    if (!FLAGS.multiClock) return;
    var host = stripHost(); if (!host || !host.parentNode) return;
    var s = S(); if (!s || !s.timer) return;
    var c = clocks();

    var el = document.getElementById("fh11-clocks");
    /* Stay invisible until the feature is actually used. */
    if (!c.slots.length) { if (el) el.remove(); ensureClockAffordance(); return; }

    if (!el) {
      el = document.createElement("div");
      el.id = "fh11-clocks";
      el.setAttribute("role", "group");
      el.setAttribute("aria-label", "Clocks saved on this device");
      host.parentNode.insertBefore(el, host.nextSibling);
    }
    el.innerHTML = "";

    function chip(opts) {
      var b = document.createElement("div");
      b.className = "fh11-chip" + (opts.live ? " live" : " parked") +
                    (opts.ticking ? " ticking" : "");
      if (opts.id) b.setAttribute("data-slot", opts.id);
      b.setAttribute("role", "button");
      b.setAttribute("tabindex", "0");
      b.title = opts.live ? "This clock is loaded" : "Switch to this clock";
      var dot = document.createElement("span"); dot.className = "dot";
      var t = document.createElement("span"); t.className = "t"; t.textContent = opts.time;
      var n = document.createElement("span"); n.className = "n"; n.textContent = opts.name;
      b.append(dot, t, n);
      if (!opts.live && CONCURRENCY_ENABLED && settings().fh11ConcurrentClocks) {
        var go = document.createElement("button");
        go.className = "go"; go.type = "button";
        go.textContent = opts.ticking ? "❙❙" : "▶";
        go.title = opts.ticking ? "Stop tracking this clock" : "Run this clock alongside";
        go.setAttribute("aria-label", (opts.ticking ? "Stop " : "Run ") + opts.name);
        go.addEventListener("click", function (e) { toggleTicking(opts.id, e); });
        b.appendChild(go);
      }
      if (!opts.live) {
        var x = document.createElement("button");
        x.className = "x"; x.type = "button"; x.textContent = "×";
        x.title = "Discard this clock";
        x.setAttribute("aria-label", "Discard " + opts.name);
        x.addEventListener("click", function (e) { discardSlot(opts.id, e); });
        b.appendChild(x);
        b.addEventListener("click", function () { activateSlot(opts.id); });
        b.addEventListener("keydown", function (e) {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); activateSlot(opts.id); }
        });
      }
      el.appendChild(b);
    }

    chip({
      live: true,
      time: fmtMs(clockMs(s.timer, true)),
      name: taskNameFor(effectiveTaskId()) || "Live"
    });
    c.slots.forEach(function (sl) {
      chip({ id: sl.id, live: false, ticking: !!CONCURRENCY_ENABLED&&!!sl.ticking,
             time: fmtMs(clockMs(sl, false) + Math.max(0,Number(sl.shadowMs)||0)),
             name: sl.label || taskNameFor(sl.activeTaskId) || "Clock" });
    });

    var add = document.createElement("button");
    add.type = "button";
    add.className = "fh11-addclock";
    add.textContent = "＋ Clock";
    add.title = "Park this clock on this device and start a new one";
    if (c.slots.length + 1 >= MAX_CLOCKS) {
      add.disabled = true;
      add.title = "Maximum of " + MAX_CLOCKS + " clocks on this device";
    }
    add.addEventListener("click", addClock);
    el.appendChild(add);
  }

  /* Keep the live chip's time honest without adding a second ticker:
     piggyback on the app's own renderTimer. */
  function hookRenderTimer() {
    if (typeof window.renderTimer !== "function") return false;
    if (window.renderTimer.__fh11) return true;
    var orig = window.renderTimer;
    var w = function () {
      var out = orig.apply(this, arguments);
      try {
        if (FLAGS.multiClock && document.getElementById("fh11-clocks")) {
          var s = S();
          var chipEl = document.querySelector("#fh11-clocks .fh11-chip.live .t");
          if (chipEl && s && s.timer) {
            chipEl.textContent = fmtMs(clockMs(s.timer, true));
          }
          /* The live chip's TASK can change without any clock being
             added or swapped (plain task switch), so refresh the
             name here too - not just the time. */
          var nameEl = document.querySelector("#fh11-clocks .fh11-chip.live .n");
          if (nameEl) {
            var nm = taskNameFor(effectiveTaskId()) || "Live";
            if (nameEl.textContent !== nm) nameEl.textContent = nm;
          }
        }
      } catch (e) {}
      return out;
    };
    w.__fh11 = true;
    window.renderTimer = w;
    return true;
  }

  /* A plain task switch changes the live clock's label but calls
     renderActiveTaskRow, not renderTimer - so hook it directly
     rather than leaving the chip showing a stale task name. */
  function hookSetActiveTask() {
    if (typeof window.setActiveTask !== "function") return false;
    if (window.setActiveTask.__fh11) return true;
    var orig = window.setActiveTask;
    var w = function () {
      var out = orig.apply(this, arguments);
      try {
        if (FLAGS.multiClock && document.getElementById("fh11-clocks")) {
          var nameEl = document.querySelector("#fh11-clocks .fh11-chip.live .n");
          if (nameEl) {
            var nm = taskNameFor(effectiveTaskId()) || "Live";
            if (nameEl.textContent !== nm) nameEl.textContent = nm;
          }
        }
      } catch (e) {}
      return out;
    };
    w.__fh11 = true;
    window.setActiveTask = w;
    return true;
  }

  /* A logged live clock is finished, not a reusable empty chip. Promote the
     oldest parked clock (paused) and remove the completed one from the strip.
     With no parked clocks the normal + Clock seed is restored immediately. */
  function retireLoggedLiveClock() {
    var s=S(),c=clocks();
    var beforeClocks=s?JSON.parse(JSON.stringify(s.fh11Clocks||{slots:[]})):{slots:[]};
    var beforeTimer=s&&s.timer?JSON.parse(JSON.stringify(s.timer)):null;
    var beforeActiveTaskId=s?s.activeTaskId:null;
    var sessionChoices=function(){return CLOCK_SESSION_SETTINGS.map(function(key){return s&&s.settings&&s.settings[key];}).concat([s&&s.adventure&&s.adventure.action]);};
    var beforeSettings=sessionChoices();
    if(c.slots.length){
      var incoming=c.slots.shift();
      thaw(incoming);
    }
    renderClocks();ensureClockAffordance();
    var installedTimer=s&&s.timer,installedClocks=s&&s.fh11Clocks;
    var installedRaw=JSON.stringify([installedTimer,installedClocks,s&&s.activeTaskId,sessionChoices()]);
    var rollback=function(error){
      if(S()===s&&s.timer===installedTimer&&s.fh11Clocks===installedClocks&&
         JSON.stringify([s.timer,s.fh11Clocks,s.activeTaskId,sessionChoices()])===installedRaw){
        s.fh11Clocks=beforeClocks;if(beforeTimer)s.timer=beforeTimer;s.activeTaskId=beforeActiveTaskId;
        CLOCK_SESSION_SETTINGS.forEach(function(key,index){if(beforeSettings[index]!==undefined)s.settings[key]=beforeSettings[index];});
        if (s.adventure && beforeSettings[CLOCK_SESSION_SETTINGS.length] !== undefined) s.adventure.action = beforeSettings[CLOCK_SESSION_SETTINGS.length];
      }
      try{renderClocks();ensureClockAffordance();if(typeof window.renderTimer==="function")window.renderTimer();}catch(_){}
      throw error;
    };
    var saved;
    try{saved=persistClocks();}catch(error){return Promise.reject().catch(function(){return rollback(error);});}
    return Promise.resolve(saved).then(function(ok){
      if(ok===false)return rollback(new Error("Device-local clock retirement could not be saved."));
      return true;
    },rollback);
  }
  function hookFinalizeStopwatch(){
    if(typeof window.finalizeStopwatch!=="function")return false;
    if(window.finalizeStopwatch.__fh11ClockLifecycle)return true;
    /* The focus-economy accounting boundary is the persistence receipt for a
       logged session. Wrapping an earlier synchronous layer would retire the
       clock before IndexedDB confirms the command, so fail closed until the
       outer durable boundary exists. */
    if(!window.finalizeStopwatch.__fhAccountingBoundary)return false;
    var orig=window.finalizeStopwatch;
    var wrapped=function(){
      var s=S(),before=s?Number(s.completedFocusSessions)||0:0;
      var expectedState,expectedTimer,expectedClockRaw;
      var clockReceipt=function(live){return JSON.stringify([live&&live.timer,live&&live.fh11Clocks,live&&live.activeTaskId,
        CLOCK_SESSION_SETTINGS.map(function(key){return live&&live.settings&&live.settings[key];}),live&&live.adventure&&live.adventure.action]);};
      var finish=function(result){
        var live=S();
        var loggedRecord=result&&result.logged&&result.sessionId&&live&&
          (live.sessionsLog||[]).some(function(row){return row&&row.id===result.sessionId;});
        var done=function(){
          if(result&&result.ok!==false&&result.subMinute&&typeof window.toast==="function")window.toast(result.seconds+"s logged — under a minute, so no XP, loot or session credit.","info");
          return result;
        };
        if(!(result&&(result.ok===false||result.noChange||result.duplicate))&&live&&(loggedRecord||(Number(live.completedFocusSessions)||0)>before)&&
           (clocks().slots.length||document.getElementById("fh11-clocks"))){
          /* Another run, clock switch, or primary-state replacement may arrive
             while the durable accounting receipt is pending. It owns the live
             engine now; this completed run must not promote over it. */
          if(live!==expectedState||live.timer!==expectedTimer||clockReceipt(live)!==expectedClockRaw){
            if(typeof window.toast==="function")window.toast("The session was saved. Your newer clock choices were kept.","info");
            return Object.assign({},result||{ok:true,logged:true},{clockChangedWhileSaving:true});
          }
          return Promise.resolve(retireLoggedLiveClock()).then(done,function(){
            if(typeof window.toast==="function")window.toast("The session was saved, but the next-clock change could not be confirmed. Your remaining clocks were kept.","warn");
            return Object.assign({},result||{ok:true,logged:true},{clockRetirementPending:true});
          });
        }
        return done();
      };
      var out=orig.apply(this,arguments);
      expectedState=S();expectedTimer=expectedState&&expectedState.timer;expectedClockRaw=clockReceipt(expectedState);
      return out&&typeof out.then==="function"?out.then(finish):finish(out);
    };
    wrapped.__fh11ClockLifecycle=true;
    wrapped.__fhAccountingBoundary=true;
    wrapped.__fhAccountingInner=orig;
    window.finalizeStopwatch=wrapped;
    if(window.__FocusHero&&window.__FocusHero.finalizeStopwatch===orig)window.__FocusHero.finalizeStopwatch=wrapped;
    return true;
  }

  /* Entry point for creating the first extra clock even before the
     strip exists (nothing is shown until then). */
  function ensureClockAffordance() {
    if (!FLAGS.multiClock) return;
    var c = clocks();
    if (c.slots.length) { renderClocks(); return; }
    var host = stripHost();
    if (!host || !host.parentNode) return;
    if (document.getElementById("fh11-addclock-seed")) return;
    var b = document.createElement("button");
    b.id = "fh11-addclock-seed";
    b.type = "button";
    b.className = "fh11-addclock";
    b.style.cssText = "display:block;margin:10px auto 0";
    b.textContent = "＋ Clock";
    b.title = "Park this clock on this device and start a second one";
    b.addEventListener("click", function () {
      addClock();
      var seed = document.getElementById("fh11-addclock-seed");
      if (seed) seed.remove();
    });
    host.parentNode.insertBefore(b, host.nextSibling);
  }

  /* ============================================================
   * 9. SESSION-TYPE SETTINGS + CONCURRENT CLOCKS
   *
   * (a) STOPWATCH ONLY. The countdown modes (Focus / Short break /
   *     Long break) are hidden by default because they are unused.
   *     Nothing is deleted - setMode, modeMinutes and every session
   *     type still exist untouched, so flipping the setting back on
   *     restores them instantly with no migration. Locked In,
   *     Priority and Workout are modifiers, not session types, and
   *     are deliberately left alone.
   *
   * (b) CONCURRENT CLOCKS. Off by default. When on, a parked clock
   *     can genuinely run at the same time as the live one.
   *
   *     HOW "COUNTS ONCE" IS GUARANTEED:
   *     A concurrently-running clock accumulates into `shadowMs`,
   *     a field the app's crediting pipeline has never heard of.
   *     Display time = real time + shadowMs, so the chip ticks up
   *     the way you'd expect. Credited time = real time ONLY. The
   *     live engine is still the single thing that awards minutes,
   *     so one real minute produces one credited minute no matter
   *     how many clocks are moving. Swapping a shadow-tracked clock
   *     in later cannot smuggle those minutes into XP, task totals
   *     or mount pity, because shadowMs is never merged into
   *     swAccumulatedMs.
   *
   *     That is the "one clock counts for both" behaviour: the
   *     others show you the elapsed time, the live one does the
   *     earning.
   * ==========================================================*/

  var SETTINGS_CSS = [
    '.fh11-chip.ticking{border-style:dashed;border-color:rgba(var(--accent-rgb,126,224,200),.55)}',
    '.fh11-chip.ticking .dot{background:rgba(var(--accent-rgb,126,224,200),.85);',
    '  animation:fh11-blink 1.6s ease-in-out infinite}',
    '@keyframes fh11-blink{0%,100%{opacity:1}50%{opacity:.25}}',
    '@media (prefers-reduced-motion:reduce){.fh11-chip.ticking .dot{animation:none}}',
    '.fh11-chip .go{opacity:.55;padding:0 1px;border:none;background:none;color:inherit;',
    '  cursor:pointer;font-size:.72rem;line-height:1}',
    '.fh11-chip .go:hover{opacity:1}',
    '.fh11-shadow{font-size:.62rem;opacity:.5;margin-left:1px}'
  ].join("\n");

  function settings() {
    var s = S();
    if (!s) return {};
    if (!s.settings || typeof s.settings !== "object") s.settings = {};
    if (typeof s.settings.fh11StopwatchOnly !== "boolean") s.settings.fh11StopwatchOnly = true;
    /* Concurrent clocks were built, tested, then removed at your
       request. The code path below is left intact but unreachable so
       nothing had to be surgically ripped out of a working module.
       Flip CONCURRENCY_ENABLED to true to bring it back. */
    s.settings.fh11ConcurrentClocks = false;
    return s.settings;
  }

  var COUNTDOWN_MODES = ["focus", "short", "long"];

  function applyStopwatchOnly() {
    var cfg = settings();
    var on = cfg.fh11StopwatchOnly === true;
    var s = S();
    var currentMode = s && s.timer ? s.timer.mode : null;
    var tabs = document.querySelectorAll('.mode-tabs button[data-mode]');
    if (!tabs.length) return;
    for (var i = 0; i < tabs.length; i++) {
      var m = tabs[i].getAttribute("data-mode");
      /* Never hide the mode that owns an active or paused run. More
         importantly, presentation code never calls setMode/resetRun. */
      if (COUNTDOWN_MODES.indexOf(m) >= 0) tabs[i].hidden = on && m !== currentMode;
    }

    /* WHY THIS BLOCK EXISTS.

       "Stopwatch only" is on by default, and yet a countdown tab was still
       showing - because a brand new profile starts on mode "focus", the
       countdown, and this function refuses to hide the mode you are currently
       sitting in. So the one clock a stopwatch-only owner never asked for was
       the one they were parked on, wearing the label "Pomodoro".

       Hiding it is not enough; you would still be IN it. So when the setting
       is on and the countdown is genuinely idle, the clock is moved to the
       stopwatch. "Idle" is strict on purpose: not running, no paused run, and
       nothing part-way through. A session in progress is never touched, which
       keeps the old rule this file already had - presentation code must not
       destroy a run - intact. */
    if (!on || !s || !s.timer) return;
    if (COUNTDOWN_MODES.indexOf(currentMode) < 0) return;
    if (s.timer.running) return;
    if (finite(s.timer.pausedAt) > 0) return;
    var planned = finite(s.timer.plannedMs);
    var left = finite(s.timer.msLeft);
    var full = planned > 0 ? planned : 25 * 60 * 1000;
    /* Part-way through means the remaining time has moved off its full value. */
    if (left > 0 && left < full) return;
    if (typeof window.setMode !== "function") return;
    try { window.setMode("stopwatch", { resetRun: false, persistState: true }); }
    catch (_) { return; }
    applyStopwatchOnly();
  }

  function finite(v) {
    var n = Number(v);
    return isFinite(n) ? n : 0;
  }

  /* ---- concurrent ticking -------------------------------------
     One shared 1s interval drives every shadow clock. No per-clock
     timers, so five running chips cost one interval. */
  var CONCURRENCY_ENABLED = false;   // removed from the UI by request
  var ticker = null;

  function tickShadows() {
    if(!CONCURRENCY_ENABLED){stopTicker();return;}
    var c = clocks();
    var any = false, now = Date.now();
    for (var i = 0; i < c.slots.length; i++) {
      var sl = c.slots[i];
      if (!sl.ticking) continue;
      any = true;
      var from = sl.tickFrom || now;
      sl.shadowMs = Math.max(0,Number(sl.shadowMs)||0) + Math.max(0, now - from);
      sl.tickFrom = now;
    }
    if (!any) { stopTicker(); return; }
    paintChipTimes();
  }

  function startTicker() {
    if(!CONCURRENCY_ENABLED)return;
    if (ticker) return;
    ticker = setInterval(tickShadows, 1000);
  }
  function stopTicker() {
    if (!ticker) return;
    clearInterval(ticker); ticker = null;
  }

  function anyTicking() {
    return !!CONCURRENCY_ENABLED&&clocks().slots.some(function (x) { return !!x.ticking; });
  }

  function toggleTicking(id, ev) {
    if (ev) ev.stopPropagation();
    if(!CONCURRENCY_ENABLED)return;
    var c = clocks();
    var sl = c.slots.filter(function (x) { return x.id === id; })[0];
    if (!sl) return;
    sl.ticking = !sl.ticking;
    sl.tickFrom = sl.ticking ? Date.now() : 0;
    if (anyTicking()) startTicker(); else stopTicker();
    persist(); renderClocks();
    if (typeof window.toast === "function") {
      window.toast(sl.ticking
        ? (sl.label || "Clock") + " is tracking alongside — minutes still count once."
        : (sl.label || "Clock") + " paused.", "info");
    }
  }

  /* Repaint just the numbers, no DOM rebuild. */
  function paintChipTimes() {
    var strip = document.getElementById("fh11-clocks");
    if (!strip) return;
    var s = S(); if (!s) return;
    var liveT = strip.querySelector(".fh11-chip.live .t");
    if (liveT) liveT.textContent = fmtMs(clockMs(s.timer, true));
    var c = clocks();
    c.slots.forEach(function (sl) {
      var el = strip.querySelector('.fh11-chip[data-slot="' + sl.id + '"] .t');
      if (el) el.textContent = fmtMs(clockMs(sl, false) + Math.max(0,Number(sl.shadowMs)||0));
    });
  }

  /* ---- settings rows ------------------------------------------ */

  function makeRow(id, label, title, checked, onChange) {
    var row = document.createElement("div");
    row.className = "form-row";
    var l = document.createElement("label");
    l.textContent = label; l.title = title;
    var val = document.createElement("div");
    val.className = "val";
    var b = document.createElement("button");
    b.className = "toggle"; b.id = id; b.type = "button";
    b.setAttribute("aria-checked", checked ? "true" : "false");
    b.setAttribute("aria-label", label);
    b.addEventListener("click", function () {
      var next = b.getAttribute("aria-checked") !== "true";
      b.setAttribute("aria-checked", next ? "true" : "false");
      onChange(next);
      persist();
    });
    val.appendChild(b);
    row.append(l, val);
    return row;
  }

  function injectSettings() {
    var modal = document.querySelector("#settings-modal .modal");
    if (!modal || document.getElementById("fh11-settings-block")) return;
    var cfg = settings();

    var wrap = document.createElement("div");
    wrap.id = "fh11-settings-block";
    var hr = document.createElement("hr");
    var h = document.createElement("h4");
    h.style.cssText = "margin:.25rem 0 .25rem;font-size:.82rem;color:var(--ink-dim);" +
                      "text-transform:uppercase;letter-spacing:.1em";
    h.textContent = "Session types & clocks";
    wrap.append(hr, h);

    wrap.appendChild(makeRow(
      "fh11-tog-stopwatch-only",
      "Stopwatch only",
      "Hides the Focus / Short break / Long break countdown modes. Nothing is deleted — turn this off any time to get them back. Locked In, Priority and Workout are unaffected.",
      cfg.fh11StopwatchOnly,
      function (v) { cfg.fh11StopwatchOnly = v; applyStopwatchOnly(); }
    ));

    /* Put it just above the Backups block so it reads naturally. */
    var backups = modal.querySelector("#btn-backup-now");
    var anchor = backups ? backups.closest(".row") : null;
    var beforeNode = anchor ? anchor.previousElementSibling : null;
    while (beforeNode && beforeNode.previousElementSibling &&
           beforeNode.tagName !== "HR") beforeNode = beforeNode.previousElementSibling;
    if (beforeNode && beforeNode.parentNode === modal) modal.insertBefore(wrap, beforeNode);
    else modal.appendChild(wrap);
  }

  /* ============================================================
   * 10. SESSION VOCABULARY
   *
   * "Stopwatch" is the only session type actually used, so calling
   * it Stopwatch is noise - it should just be the thing you do.
   * The count-up mode becomes "Focus", and the count-DOWN mode that
   * used to own that word becomes "Pomodoro", which is what it
   * actually is. No collision, and the countdown is hidden by
   * default anyway.
   *
   * Scoped by ELEMENT, never by a global text sweep - that mistake
   * was made once already in this file's history (renaming Tasks
   * when To-dos was meant) and is not repeated. Only these exact
   * nodes are touched:
   *   .mode-tabs button[data-mode="stopwatch"]  -> "Focus"
   *   .mode-tabs button[data-mode="focus"]      -> "Pomodoro"
   *   #btn-quick-stopwatch                      -> "Focus"
   *
   * The underlying mode VALUES ("stopwatch", "focus") are untouched,
   * so state, saves, migrations and every isStopwatch() check keep
   * working exactly as before.
   * ==========================================================*/

  var VOCAB = { stopwatch: "Focus", focus: "Pomodoro" };

  function applyVocabulary() {
    if (!FLAGS.renameSessions) return;
    var sw = document.querySelector('.mode-tabs button[data-mode="stopwatch"]');
    if (sw && sw.textContent.trim() !== VOCAB.stopwatch) {
      sw.textContent = VOCAB.stopwatch;
      sw.title = "Open-ended focus session that counts up (Shift+S)";
    }
    var fo = document.querySelector('.mode-tabs button[data-mode="focus"]');
    if (fo && fo.textContent.trim() !== VOCAB.focus) {
      fo.textContent = VOCAB.focus;
      fo.title = "Fixed-length countdown session";
    }
    var q = document.getElementById("btn-quick-stopwatch");
    if (q && q.textContent.trim() !== VOCAB.stopwatch) q.textContent = VOCAB.stopwatch;
  }


  /* ============================================================
   * 11. CHARACTERS (multi-profile)
   *
   * "Kind of like WoW, you can make new characters with reset
   *  progress. MAKE SURE ABSOLUTELY NOTHING IS LOST OR CHANGED
   *  FROM OTHER PROFILES/CHARACTERS."
   *
   * That instruction drives every design decision below.
   *
   * WHAT IS SHARED vs PER-CHARACTER
   * Your save has 57 top-level keys. Seven are app-level and stay
   * GLOBAL, so themes, preferences and cloud sync are the same no
   * matter who you play:
   *     settings, sync, dataVersion, appLog,
   *     totalAppOpenMs, uptimeHistory, v87HygieneFixApplied
   * The other 50 are progress and are PER-CHARACTER: hours, XP,
   * streak, coins, loot, mounts, bestiary, tasks, quests, history,
   * achievements, timer, folders - everything you earn.
   *
   * Any key added in future defaults to PER-CHARACTER, because a
   * new gameplay key wrongly shared is a corruption bug, while a
   * new app key wrongly siloed is only a mild annoyance.
   *
   * HOW A SWITCH CANNOT LOSE DATA
   * Switching is verify-then-commit, never fire-and-forget:
   *   1. the raw save string is snapshotted to IndexedDB first
   *   2. the outgoing character is copied into its vault
   *   3. the vault is deep-compared against the live values and the
   *      switch ABORTS if even one key differs
   *   4. only then is the incoming character written in
   *   5. the save is written and read BACK from localStorage and
   *      re-verified
   *   6. if that read-back disagrees, the original raw save is
   *      restored and the switch is abandoned
   * Only after all six steps does the page reload. A reload is used
   * deliberately instead of re-rendering 50 keys of live UI - the
   * app boots cleanly from storage the same way it does every day,
   * so there is no half-swapped screen state to get wrong.
   *
   * NEW CHARACTERS are seeded from a template captured from the
   * app's own loadState() default path (dataVersion 16), not from
   * hand-written guesses about what an empty hero or bestiary looks
   * like. If the app's dataVersion ever moves past the template,
   * seeding refuses to run rather than create a malformed save.
   * ==========================================================*/

  var STORAGE_KEY = "focusHero.v4.state";
  var SEED_DATA_VERSION = 16;

  function charactersEnabled() { return CHARACTERS_BUILD_ENABLED === true && FLAGS.characters === true; }

  var GLOBAL_KEYS = ["settings", "sync", "dataVersion", "appLog",
    "totalAppOpenMs", "uptimeHistory", "v87HygieneFixApplied", "fh11Profiles",
    /* account-wide by request - see sections 12 and 14 */
    "achievements", "achievementProgress", "achievementsBy"];

  var PROFILE_SEED_JSON = "{\"hero\":{\"name\":\"Hero\",\"cls\":\"knight\",\"level\":1,\"xp\":0,\"hp\":100,\"energy\":100,\"appearance\":{\"visualStyle\":\"compact_cozy\",\"hairStyle\":\"legacy\",\"skinTone\":\"warm\",\"bodyStyle\":\"compact\",\"faceShape\":\"oval\",\"armor\":\"steel\",\"accent\":\"gold\",\"helm\":\"closed\",\"cloak\":\"royal\",\"race\":\"human\",\"body\":\"balanced\",\"skin\":\"warm\",\"hair\":\"short\",\"hairColor\":\"espresso\",\"eyeShape\":\"focused\",\"eyeColor\":\"azure\",\"face\":\"calm\",\"classKey\":\"knight\",\"species\":\"human\",\"skinIdx\":0},\"appearanceUpdatedAt\":0,\"cosmetics\":{\"hair\":[],\"outfit\":[],\"mount\":[]},\"equipped\":{\"weapon\":null,\"helmet\":null,\"armor\":null,\"mount\":null,\"pet\":null}},\"timer\":{\"mode\":\"stopwatch\",\"endAt\":0,\"pausedAt\":0,\"running\":false,\"msLeft\":0,\"activeTaskId\":null,\"activeTaskNameAtStart\":null,\"plannedMs\":0,\"liveAdjustedAt\":0,\"swStartedAt\":0,\"swAccumulatedMs\":0,\"swSessionStartedAt\":0,\"swLaps\":[],\"workoutMode\":false,\"swWorkoutMode\":false,\"runDetails\":null,\"priorityRun\":false},\"cycleCount\":0,\"totalFocusMin\":0,\"completedFocusSessions\":0,\"canceledSessionCount\":0,\"streak\":0,\"longestStreak\":0,\"lastFocusDate\":null,\"combo\":{\"count\":0,\"date\":null},\"tasks\":[],\"activeTaskId\":null,\"quests\":[],\"activeQuestId\":null,\"daily\":{\"date\":\"2026-08-15\",\"items\":[{\"id\":\"d_focus2\",\"text\":\"Complete 2 focus sessions\",\"target\":2,\"kind\":\"focus\",\"xp\":40,\"progress\":0,\"done\":false},{\"id\":\"d_focus4\",\"text\":\"Complete 4 focus sessions\",\"target\":4,\"kind\":\"focus\",\"xp\":80,\"progress\":0,\"done\":false},{\"id\":\"d_quest3\",\"text\":\"Complete 3 quests\",\"target\":3,\"kind\":\"quests\",\"xp\":80,\"progress\":0,\"done\":false}]},\"lootOwned\":{},\"achievements\":{},\"focusMilestones\":{\"version\":1,\"claimedThrough\":0,\"announcedThrough\":0},\"history\":{},\"sessionHistory\":{},\"sessionsLog\":[],\"sessionTombstones\":{},\"pendingFocusClaim\":null,\"activityLog\":[],\"battleLog\":[],\"adventure\":{\"action\":\"Travel\",\"actionMin\":{\"Travel\":0,\"Rest\":0,\"Hunt\":0,\"Loot\":0,\"Fight\":0,\"Craft\":0,\"Meditate\":0},\"actionsTriedSinceV76\":{}},\"fitness\":{\"version\":2,\"trackingStartedAt\":0,\"sessionModeStartedAt\":0,\"workoutTasks\":{},\"sessionModes\":{},\"updatedAt\":0},\"crystalShards\":0,\"crystalShardsEarned\":0,\"crystalShardsSpent\":0,\"craftingDust\":0,\"questSystem\":{\"daily\":[{\"id\":\"qd_drop_rare\",\"label\":\"Find 1 rare-or-better drop\",\"target\":1,\"kind\":\"rare_drop\",\"xp\":80,\"shards\":5,\"coins\":60,\"progress\":0,\"completed\":false,\"claimed\":false,\"rolledAt\":1786825410771},{\"id\":\"qd_combo\",\"label\":\"Hit a 3+ session combo\",\"target\":3,\"kind\":\"combo\",\"xp\":60,\"shards\":2,\"coins\":50,\"progress\":0,\"completed\":false,\"claimed\":false,\"rolledAt\":1786825410771},{\"id\":\"qd_focus_2\",\"label\":\"Complete 2 focus sessions\",\"target\":2,\"kind\":\"sessions\",\"xp\":40,\"shards\":2,\"coins\":30,\"progress\":0,\"completed\":false,\"claimed\":false,\"rolledAt\":1786825410771}],\"weekly\":[{\"id\":\"qw_zones_2\",\"label\":\"Visit 2 different zones\",\"target\":2,\"kind\":\"zones_visited\",\"xp\":300,\"shards\":20,\"coins\":200,\"progress\":1,\"completed\":false,\"claimed\":false,\"rolledAt\":1786825410771},{\"id\":\"qw_drop_epic\",\"label\":\"Find 1 epic-or-better drop\",\"target\":1,\"kind\":\"epic_drop\",\"xp\":400,\"shards\":30,\"coins\":300,\"progress\":0,\"completed\":false,\"claimed\":false,\"rolledAt\":1786825410771},{\"id\":\"qw_sessions\",\"label\":\"Complete 20 sessions in a week\",\"target\":20,\"kind\":\"sessions\",\"xp\":400,\"shards\":25,\"coins\":400,\"progress\":0,\"completed\":false,\"claimed\":false,\"rolledAt\":1786825410771}],\"seasonal\":[{\"id\":\"qs_zones_all\",\"label\":\"Unlock all 6 zones\",\"target\":6,\"kind\":\"zones_unlocked\",\"xp\":5000,\"shards\":500,\"coins\":5000,\"progress\":1,\"completed\":false,\"claimed\":false,\"rolledAt\":1786825410771}],\"lastRoll\":{\"daily\":\"2026-08-15\",\"weekly\":\"2026-W33\",\"seasonal\":\"2026-M08\"},\"dailyClaimedCount\":0,\"weeklyClaimedCount\":0,\"seasonalClaimedCount\":0},\"world\":{\"currentZone\":\"verdant_vale\",\"currentZoneUpdatedAt\":0,\"unlockedZones\":{\"verdant_vale\":true},\"zonesVisited\":{\"verdant_vale\":1},\"bossesDefeated\":0,\"mysteryBoxesOpened\":0,\"artifactsFound\":{},\"questCounters\":{},\"bossSessionRewards\":{}},\"achievementsV85\":{},\"bestiary\":{\"slime\":{\"unlocked\":false,\"firstSeenAt\":null,\"kills\":0},\"rat\":{\"unlocked\":false,\"firstSeenAt\":null,\"kills\":0},\"scrub_raider\":{\"unlocked\":false,\"firstSeenAt\":null,\"kills\":0},\"wolf\":{\"unlocked\":false,\"firstSeenAt\":null,\"kills\":0},\"bandit\":{\"unlocked\":false,\"firstSeenAt\":null,\"kills\":0},\"wraith\":{\"unlocked\":false,\"firstSeenAt\":null,\"kills\":0},\"bog_brute\":{\"unlocked\":false,\"firstSeenAt\":null,\"kills\":0},\"hag\":{\"unlocked\":false,\"firstSeenAt\":null,\"kills\":0},\"drake\":{\"unlocked\":false,\"firstSeenAt\":null,\"kills\":0},\"minotaur\":{\"unlocked\":false,\"firstSeenAt\":null,\"kills\":0},\"revenant\":{\"unlocked\":false,\"firstSeenAt\":null,\"kills\":0},\"griffin\":{\"unlocked\":false,\"firstSeenAt\":null,\"kills\":0},\"dragon\":{\"unlocked\":false,\"firstSeenAt\":null,\"kills\":0},\"lich\":{\"unlocked\":false,\"firstSeenAt\":null,\"kills\":0},\"voidhorror\":{\"unlocked\":false,\"firstSeenAt\":null,\"kills\":0}},\"eggs\":{\"owned\":[],\"incubating\":[],\"hatched\":[],\"quarantined\":[],\"processedSessionIds\":[],\"slotCap\":3,\"systemVersion\":2},\"achievementProgress\":{\"first_focus\":0,\"first_task\":0,\"first_quest\":0,\"first_loot\":0,\"first_levelup\":1,\"first_combo\":0,\"sessions_10\":0,\"sessions_50\":0,\"sessions_100\":0,\"sessions_500\":0,\"sessions_1000\":0,\"hours_1\":0,\"hours_10\":0,\"hours_50\":0,\"hours_100\":0,\"hours_500\":0,\"hours_1000\":0,\"level_5\":1,\"level_10\":1,\"level_25\":1,\"level_50\":1,\"level_100\":1,\"streak_3\":0,\"streak_7\":0,\"streak_30\":0,\"streak_100\":0,\"every_action\":0,\"early_riser\":0,\"night_owl\":0,\"deep_diver\":0,\"marathon\":0,\"perfect_week\":0,\"iron_will\":0,\"rarity_full\":0,\"set_complete\":0,\"bestiary_half\":0,\"bestiary_full\":0,\"secret_konami\":0,\"secret_palindrome\":0,\"secret_pi\":0,\"secret_silentnight\":0,\"secret_meta\":0,\"tasks_5\":0,\"quests_25\":0,\"combo_4\":0,\"streak_14\":0,\"streak_50\":0,\"level_75\":1,\"day_360\":0,\"session_240\":0,\"loot_50\":0,\"loot_150\":0,\"coins_1000\":0,\"coins_10000\":0},\"coins\":0,\"coinsEarned\":0,\"coinsSpent\":0,\"store\":{\"purchased\":[],\"boosts\":[],\"unlockedThemes\":[]},\"focusEconomy\":{\"version\":1,\"grants\":{},\"spends\":[],\"harvests\":[],\"plots\":[{\"id\":\"plot1\",\"crop\":null,\"plantedAt\":0,\"updatedAt\":0},{\"id\":\"plot2\",\"crop\":null,\"plantedAt\":0,\"updatedAt\":0},{\"id\":\"plot3\",\"crop\":null,\"plantedAt\":0,\"updatedAt\":0}],\"unlockedPlots\":2,\"installedAt\":1786825411015},\"lootInstances\":{},\"loot\":{\"drops\":[],\"pity\":{\"common\":0,\"uncommon\":0,\"rare\":0,\"epic\":0,\"legendary\":0,\"mythic\":0},\"materials\":{\"dust\":0,\"shards\":0,\"essence\":0},\"dyesOwned\":{},\"gemsOwned\":{},\"consumables\":{},\"loadout\":{\"slot1\":null,\"slot2\":null,\"slot3\":null},\"loadoutUpdatedAt\":0,\"instanceTombstones\":{},\"dropTombstones\":{},\"sessionRewardReceipts\":{},\"sessionRewardReceiptTombstones\":{},\"mountProgress\":0,\"mountFamilies\":{},\"vault\":{\"instances\":{},\"locations\":{},\"cap\":100}},\"lootRework\":{\"version\":1,\"flags\":{\"animationsOn\":true,\"showDropLog\":true,\"autoSalvageCommonDupes\":false,\"autoSalvageDupes\":true}},\"editLog\":[],\"fh11Clocks\":{\"slots\":[]},\"taskFolders\":[],\"taskFolderMap\":{},\"targets\":{\"mode\":\"adaptive\",\"daily\":{\"date\":\"2026-08-15\",\"easy\":30,\"medium\":60,\"hard\":90,\"claimed\":{\"easy\":false,\"medium\":false,\"hard\":false}},\"weekly\":{\"week\":\"2026-08-10\",\"easy\":180,\"medium\":300,\"hard\":420,\"claimed\":{\"easy\":false,\"medium\":false,\"hard\":false}},\"__init\":true}}";

  function isGlobalKey(k) { return GLOBAL_KEYS.indexOf(k) >= 0; }

  function perCharacterKeys() {
    var s = S(); if (!s) return [];
    return Object.keys(s).filter(function (k) { return !isGlobalKey(k); });
  }

  function profiles() {
    if (!charactersEnabled()) return null;
    var s = S();
    if (!s) return null;
    if (!s.fh11Profiles || typeof s.fh11Profiles !== "object") {
      s.fh11Profiles = { activeId: null, list: [], vaults: {} };
    }
    var P = s.fh11Profiles;
    if (!Array.isArray(P.list)) P.list = [];
    if (!P.vaults || typeof P.vaults !== "object") P.vaults = {};
    /* First run: adopt the existing save as character #1. Nothing is
       copied, moved or reset - it simply gets a name. */
    if (!P.list.length) {
      var name = (s.hero && s.hero.name) || "Hero";
      var id = "chr_" + Date.now().toString(36);
      P.list.push({ id: id, name: name, createdAt: Date.now(), lastPlayedAt: Date.now() });
      P.activeId = id;
    }
    if (!P.activeId && P.list.length) P.activeId = P.list[0].id;
    return P;
  }

  function activeProfile() {
    var P = profiles(); if (!P) return null;
    return P.list.filter(function (x) { return x.id === P.activeId; })[0] || null;
  }

  /* Copy the live per-character keys out, then prove the copy is
     faithful before anyone relies on it. */
  function buildVault() {
    var s = S(); if (!s) return null;
    var vault = {}, keys = perCharacterKeys();
    for (var i = 0; i < keys.length; i++) {
      try { vault[keys[i]] = JSON.parse(JSON.stringify(s[keys[i]])); }
      catch (e) { return { __error: "could not serialise " + keys[i] }; }
    }
    for (var j = 0; j < keys.length; j++) {
      var k = keys[j];
      if (JSON.stringify(vault[k]) !== JSON.stringify(s[k])) {
        return { __error: "verification failed on " + k };
      }
    }
    return vault;
  }

  function applyVault(vault) {
    var s = S(); if (!s || !vault) return false;
    /* Remove current per-character keys, then write the incoming
       ones, so a key absent from the vault does not linger. */
    perCharacterKeys().forEach(function (k) { delete s[k]; });
    Object.keys(vault).forEach(function (k) {
      if (isGlobalKey(k)) return;
      try { s[k] = JSON.parse(JSON.stringify(vault[k])); } catch (e) {}
    });
    return true;
  }

  function freshSeed() {
    var s = S();
    if (s && s.dataVersion > SEED_DATA_VERSION) return null;   // refuse to guess
    try { return JSON.parse(PROFILE_SEED_JSON); } catch (e) { return null; }
  }

  /* Keep a raw pre-switch copy outside the save itself. */
  function snapshotRaw(label) {
    var raw = null;
    try { raw = localStorage.getItem(STORAGE_KEY); } catch (e) {}
    if (!raw) return null;
    queue.push({ k: "profile-snapshot:" + label + ":" + Date.now(),
                 type: "profileSnapshot", at: Date.now(),
                 entry: { label: label, raw: raw } });
    setTimeout(flush, 0);
    return raw;
  }

  function commitAndReload(rawBefore, expectKeyVals) {
    try {
      if (localStorage.getItem("focusHero.primary.v1.activation") !== null) {
        if (typeof window.toast === "function") window.toast("Legacy character switching is disabled with durable primary storage.", "warn");
        return false;
      }
    } catch (_) { return false; }
    var ok = false;
    try { if (typeof window.saveState === "function") window.saveState(); } catch (e) {}
    try {
      var back = localStorage.getItem(STORAGE_KEY);
      var parsed = back ? JSON.parse(back) : null;
      ok = !!parsed;
      if (ok && expectKeyVals) {
        Object.keys(expectKeyVals).forEach(function (k) {
          if (JSON.stringify(parsed[k]) !== JSON.stringify(expectKeyVals[k])) ok = false;
        });
      }
    } catch (e) { ok = false; }

    if (!ok) {
      try { if (rawBefore) localStorage.setItem(STORAGE_KEY, rawBefore); } catch (e) {}
      if (typeof window.toast === "function") {
        window.toast("Switch aborted — your save was restored untouched.", "bad");
      }
      return false;
    }
    setTimeout(function () { location.reload(); }, 120);
    return true;
  }

  function switchCharacter(id) {
    var s = S(); var P = profiles();
    if (!s || !P || id === P.activeId) return false;
    var target = P.list.filter(function (x) { return x.id === id; })[0];
    if (!target) return false;
    var incoming = P.vaults[id];
    if (!incoming) {
      if (typeof window.toast === "function") window.toast("That character has no saved data.", "bad");
      return false;
    }
    /* If this character's bulk history was moved to IndexedDB by
       reclaim(), pull it back before loading, then re-enter. */
    if (incoming.__heavyInIdb) {
      rehydrateVault(id, incoming).then(function () { switchCharacter(id); });
      return "pending";
    }

    var rawBefore = snapshotRaw("pre-switch");
    var vault = buildVault();
    if (!vault || vault.__error) {
      if (typeof window.toast === "function") {
        window.toast("Switch cancelled — " + ((vault && vault.__error) || "could not verify your data"), "bad");
      }
      return false;
    }

    P.vaults[P.activeId] = vault;
    var outgoingId = P.activeId;
    applyVault(incoming);
    delete P.vaults[id];
    P.activeId = id;
    target.lastPlayedAt = Date.now();

    /* Re-read after the write: the outgoing vault must still hold
       what we captured, and the incoming data must be live. */
    return commitAndReload(rawBefore, {
      fh11Profiles: s.fh11Profiles,
      totalFocusMin: s.totalFocusMin
    }) || (function () {
      /* rollback in memory too, so a failed switch leaves no trace */
      applyVault(P.vaults[outgoingId] || {});
      P.activeId = outgoingId;
      P.vaults[id] = incoming;
      return false;
    })();
  }

  function createCharacter(name) {
    var s = S(); var P = profiles();
    if (!s || !P) return false;
    if (P.list.length >= 8) {
      if (typeof window.toast === "function") window.toast("Maximum of 8 characters.", "warn");
      return false;
    }
    name = String(name || "").trim().slice(0, 24);
    if (!name) return false;

    var seed = freshSeed();
    if (!seed) {
      if (typeof window.toast === "function") {
        window.toast("Cannot create a character on this app version safely — nothing was changed.", "bad");
      }
      return false;
    }

    var rawBefore = snapshotRaw("pre-create");
    var vault = buildVault();
    if (!vault || vault.__error) {
      if (typeof window.toast === "function") {
        window.toast("Cancelled — " + ((vault && vault.__error) || "could not verify your data"), "bad");
      }
      return false;
    }

    P.vaults[P.activeId] = vault;              // current character filed away intact
    var id = "chr_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    P.list.push({ id: id, name: name, createdAt: Date.now(), lastPlayedAt: Date.now() });
    P.activeId = id;
    applyVault(seed);
    if (s.hero && typeof s.hero === "object") s.hero.name = name;

    return commitAndReload(rawBefore, { fh11Profiles: s.fh11Profiles });
  }

  function renameCharacter(id, name) {
    var P = profiles(); if (!P) return false;
    var c = P.list.filter(function (x) { return x.id === id; })[0];
    if (!c) return false;
    name = String(name || "").trim().slice(0, 24);
    if (!name) return false;
    c.name = name;
    if (id === P.activeId) { var s = S(); if (s && s.hero) s.hero.name = name; }
    persist(); renderCharacterBar();
    return true;
  }

  /* Deleting a character is the only destructive action here, so it
     demands the name typed back and keeps a snapshot regardless. */
  function deleteCharacter(id) {
    var P = profiles(); if (!P) return false;
    if (id === P.activeId) {
      if (typeof window.toast === "function") window.toast("Switch to another character first.", "warn");
      return false;
    }
    var c = P.list.filter(function (x) { return x.id === id; })[0];
    if (!c) return false;
    var typed = window.prompt('Type "' + c.name + '" to permanently delete this character. This cannot be undone.');
    if (typed !== c.name) {
      if (typeof window.toast === "function") window.toast("Deletion cancelled — nothing changed.", "info");
      return false;
    }
    snapshotRaw("pre-delete-" + c.name);
    delete P.vaults[id];
    P.list = P.list.filter(function (x) { return x.id !== id; });
    persist(); renderCharacterBar();
    if (typeof window.toast === "function") window.toast(c.name + " deleted. A snapshot was archived first.", "warn");
    return true;
  }

  var CHAR_CSS = [
    '#fh11-charbar{display:flex;align-items:center;gap:8px;margin:8px 0 2px}',
    '#fh11-charbar .who{flex:1;min-width:0;font-size:.76rem;letter-spacing:.06em;',
    '  text-transform:uppercase;opacity:.72;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '#fh11-charbar button{padding:5px 10px;border-radius:9px;cursor:pointer;font-size:.74rem;',
    '  background:var(--panel-2,rgba(255,255,255,.05));color:var(--fg,#e8ecff);',
    '  border:1px solid var(--border,rgba(255,255,255,.14))}',
    '#fh11-charbar button:hover{background:rgba(255,255,255,.1)}',
    '.fh11-charrow{display:flex;align-items:center;gap:9px;padding:9px 11px;margin-bottom:6px;',
    '  border-radius:11px;border:1px solid var(--border,rgba(255,255,255,.13));',
    '  background:var(--panel-2,rgba(255,255,255,.035))}',
    '.fh11-charrow.active{border-color:var(--accent,#7ee0c8);',
    '  box-shadow:0 0 0 2px rgba(var(--accent-rgb,126,224,200),.14)}',
    '.fh11-charrow .nm{flex:1;min-width:0;font-weight:700;overflow:hidden;',
    '  text-overflow:ellipsis;white-space:nowrap}',
    '.fh11-charrow .meta{opacity:.55;font-size:.74rem;font-variant-numeric:tabular-nums}',
    '.fh11-charrow button{border:none;background:none;color:inherit;cursor:pointer;',
    '  opacity:.65;padding:3px 6px;border-radius:7px;font-size:.8rem}',
    '.fh11-charrow button:hover{opacity:1;background:rgba(255,255,255,.1)}',
    '.fh11-charrow button.danger:hover{color:#ff8a8a}'
  ].join("\n");

  function vaultHours(v) {
    if (!v) return null;
    var m = v.totalFocusMin;
    return typeof m === "number" ? m : null;
  }

  function hoursText(min) {
    if (min === null || min === undefined) return "";
    return (Math.round((min / 60) * 10) / 10) + "h";
  }

  function renderCharacterBar() {
    if (!FLAGS.characters) return;
    var s = S(); if (!s) return;
    var anchor = document.getElementById("hero-heading");
    if (!anchor || !anchor.parentNode) return;
    var P = profiles(); if (!P) return;

    var bar = document.getElementById("fh11-charbar");
    if (!bar) {
      bar = document.createElement("div");
      bar.id = "fh11-charbar";
      anchor.parentNode.insertBefore(bar, anchor.nextSibling);
    }
    var cur = activeProfile();
    bar.innerHTML = "";
    var who = document.createElement("div");
    who.className = "who";
    who.textContent = (cur ? cur.name : "Hero") +
      (P.list.length > 1 ? "  ·  " + P.list.length + " characters" : "");
    var btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = P.list.length > 1 ? "Switch" : "Characters";
    btn.title = "Manage characters";
    btn.addEventListener("click", openCharacterModal);
    bar.append(who, btn);
  }

  function openCharacterModal() {
    var existing = document.getElementById("fh11-char-modal");
    if (existing) existing.remove();
    var s = S(); var P = profiles(); if (!s || !P) return;

    var back = document.createElement("div");
    back.className = "modal-backdrop";
    back.id = "fh11-char-modal";
    var modal = document.createElement("div");
    modal.className = "modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");

    var close = document.createElement("button");
    close.className = "close"; close.type = "button";
    close.setAttribute("aria-label", "Close"); close.textContent = "✕";
    close.addEventListener("click", function () { back.remove(); });

    var h = document.createElement("h3");
    h.textContent = "Characters";
    var note = document.createElement("div");
    note.className = "muted";
    note.style.cssText = "font-size:.8rem;margin-bottom:10px";
    note.textContent = "Each character keeps its own hours, XP, loot and quests. " +
                       "Themes and settings are shared. Switching saves your current character first.";

    var list = document.createElement("div");
    P.list.forEach(function (c) {
      var row = document.createElement("div");
      row.className = "fh11-charrow" + (c.id === P.activeId ? " active" : "");
      var nm = document.createElement("div");
      nm.className = "nm"; nm.textContent = c.name;
      var meta = document.createElement("span");
      meta.className = "meta";
      meta.textContent = c.id === P.activeId
        ? hoursText(s.totalFocusMin) + " · playing"
        : hoursText(vaultHours(P.vaults[c.id]));
      row.append(nm, meta);

      if (c.id !== P.activeId) {
        var go = document.createElement("button");
        go.type = "button"; go.textContent = "Play"; go.title = "Switch to this character";
        go.addEventListener("click", function () { switchCharacter(c.id); });
        row.appendChild(go);
      }
      var ren = document.createElement("button");
      ren.type = "button"; ren.textContent = "✎"; ren.title = "Rename";
      ren.addEventListener("click", function () {
        var n = window.prompt("Rename character", c.name);
        if (n) { renameCharacter(c.id, n); back.remove(); openCharacterModal(); }
      });
      row.appendChild(ren);
      if (c.id !== P.activeId) {
        var del = document.createElement("button");
        del.type = "button"; del.className = "danger"; del.textContent = "✕"; del.title = "Delete";
        del.addEventListener("click", function () {
          if (deleteCharacter(c.id)) { back.remove(); openCharacterModal(); }
        });
        row.appendChild(del);
      }
      list.appendChild(row);
    });

    var add = document.createElement("button");
    add.type = "button";
    add.className = "primary";
    add.style.cssText = "margin-top:10px";
    add.textContent = "＋ New character";
    add.addEventListener("click", function () {
      var n = window.prompt("Name your new character");
      if (n) createCharacter(n);
    });

    modal.append(close, h, note, list, add);
    back.appendChild(modal);
    back.addEventListener("click", function (e) { if (e.target === back) back.remove(); });
    document.body.appendChild(back);
  }


  /* ============================================================
   * 12. ACHIEVEMENTS ARE ACCOUNT-WIDE
   *
   * Moved out of per-character storage at your request: an
   * achievement is something the ACCOUNT has done, so making a new
   * character should not blank your trophy cabinet.
   *
   * Because characters created before this change already have
   * achievements sitting inside their vaults, this merges rather
   * than picks a winner - otherwise switching characters would
   * appear to "lose" trophies the other one had earned:
   *
   *   achievements {id: earnedAtMs} -> union, EARLIEST wins
   *                (the first time you did it is the truth)
   *
   * Runs once, then strips the key from every vault so there is only
   * one copy of the truth afterwards.
   *
   * WHY achievementProgress IS *NOT* ALSO GLOBAL:
   * It looks like it belongs here, and I first moved it too - then
   * testing showed a new character reset it to zeros anyway. The
   * reason is that it is DERIVED, not stored: the app rebuilds it
   * from the active character's hours, sessions, level and streak
   * (defaultAchievementProgress + the progress pass). Marking it
   * global would have been a label that storage quietly ignored, so
   * it stays per-character and honestly shows the current hero's
   * progress toward the next trophy.
   *
   * The earned trophies themselves DO carry across, which is the
   * part that matters - checkAchievements() starts with
   *     if (state.achievements[id]) return;
   * so a trophy already unlocked is never re-evaluated, never
   * re-awarded, and never lost when you switch or create a hero.
   * ==========================================================*/

  var ACCOUNT_WIDE = ["achievements"];

  function mergeAchievementsToAccount() {
    if (!charactersEnabled()) return { merged: 0, vaultsCleaned: 0, disabled: true };
    var s = S(); if (!s) return { merged: 0, vaultsCleaned: 0 };
    var P = s.fh11Profiles;
    if (!P || !P.vaults) return { merged: 0, vaultsCleaned: 0 };

    if (!s.achievements || typeof s.achievements !== "object") s.achievements = {};
    if (!s.achievementProgress || typeof s.achievementProgress !== "object") s.achievementProgress = {};

    var merged = 0, cleaned = 0;
    Object.keys(P.vaults).forEach(function (vid) {
      var v = P.vaults[vid];
      if (!v || typeof v !== "object") return;
      var touched = false;

      if (v.achievements && typeof v.achievements === "object") {
        Object.keys(v.achievements).forEach(function (k) {
          var incoming = v.achievements[k];
          var have = s.achievements[k];
          if (have === undefined || have === null) { s.achievements[k] = incoming; merged++; }
          else if (typeof incoming === "number" && typeof have === "number" && incoming < have) {
            s.achievements[k] = incoming;              // earliest earn wins
          }
        });
        delete v.achievements; touched = true;
      }

      if (touched) cleaned++;
    });
    return { merged: merged, vaultsCleaned: cleaned };
  }

  /* ============================================================
   * 13. QUEST DEADLINES
   *
   * Quests (the one-off goal list - what used to be labelled
   * "To-dos") get an optional due date.
   *
   * Additive only: a quest object gains `dueAt` (ms) and nothing
   * else. Quests without one behave exactly as they do today, and
   * removing this module leaves the field harmlessly unread.
   *
   * Overdue is judged against END of the due day, not the moment
   * it was set, so a quest due today is not marked late at 09:00.
   * ==========================================================*/

  var DUE_CSS = [
    '.fh11-due{display:inline-flex;align-items:center;gap:4px;padding:2px 7px;',
    '  border-radius:999px;font-size:.68rem;white-space:nowrap;cursor:pointer;',
    '  border:1px solid var(--border,rgba(255,255,255,.14));',
    '  background:rgba(255,255,255,.04);color:var(--fg,#e8ecff);opacity:.8}',
    '.fh11-due:hover{opacity:1;background:rgba(255,255,255,.09)}',
    '.fh11-due.soon{border-color:rgba(255,196,0,.5);color:#ffd479}',
    '.fh11-due.late{border-color:rgba(255,107,107,.55);color:#ff9b9b;',
    '  background:rgba(255,107,107,.09)}',
    '.fh11-due.none{opacity:.35;border-style:dashed}',
    '.fh11-due.none:hover{opacity:.9}',
    '.quest.done .fh11-due{opacity:.3;text-decoration:line-through}'
  ].join("\n");

  function endOfDay(ms) {
    var d = new Date(ms);
    d.setHours(23, 59, 59, 999);
    return d.getTime();
  }

  function dueState(q) {
    if (!q || !q.dueAt) return "none";
    if (q.done) return "done";
    var limit = endOfDay(q.dueAt);
    var now = Date.now();
    if (now > limit) return "late";
    if (limit - now <= 48 * 3600 * 1000) return "soon";
    return "ok";
  }

  function dueLabel(q) {
    if (!q.dueAt) return "＋ due";
    var d = new Date(q.dueAt);
    var today = new Date(); today.setHours(0, 0, 0, 0);
    var day = new Date(q.dueAt); day.setHours(0, 0, 0, 0);
    var diff = Math.round((day - today) / 86400000);
    if (diff === 0) return "today";
    if (diff === 1) return "tomorrow";
    if (diff === -1) return "yesterday";
    if (diff < 0) return Math.abs(diff) + "d late";
    if (diff <= 6) return "in " + diff + "d";
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  function toInputDate(ms) {
    var d = new Date(ms);
    return d.getFullYear() + "-" +
      String(d.getMonth() + 1).padStart(2, "0") + "-" +
      String(d.getDate()).padStart(2, "0");
  }

  function setQuestDue(id, ms) {
    var s = S(); if (!s || !Array.isArray(s.quests)) return;
    var q = s.quests.filter(function (x) { return x.id === id; })[0];
    if (!q) return;
    if (ms === null) delete q.dueAt; else q.dueAt = ms;
    /* Stamp the edit. Without this the sync merge has nothing to arbitrate
       with: both devices hold a quest with the same creation time, the
       tiebreak compares creation times, neither side wins, and each device
       silently keeps its own due date forever. Setting a deadline on the
       phone then simply never appeared on the PC. */
    q.updatedAt = Date.now();
    persist();
    try { if (typeof window.renderQuests === "function") window.renderQuests(); } catch (e) {}
  }

  try { window.FH11 = Object.assign(window.FH11 || {}, { setQuestDue: setQuestDue }); } catch (e) {}

  function openDuePicker(q, anchor) {
    var old = document.querySelector(".fh11-duepick");
    if (old) old.remove();

    var box = document.createElement("div");
    box.className = "fh11-duepick";
    box.style.cssText = [
      "position:fixed", "z-index:220", "padding:10px",
      "background:var(--panel,#141829)",
      "border:1px solid var(--border-strong,rgba(255,255,255,.18))",
      "border-radius:12px", "box-shadow:0 10px 34px rgba(0,0,0,.55)",
      "display:flex", "flex-direction:column", "gap:7px", "min-width:190px"
    ].join(";");

    var input = document.createElement("input");
    input.type = "date";
    input.style.cssText = "padding:6px 8px;border-radius:8px;" +
      "border:1px solid var(--border,rgba(255,255,255,.16));" +
      "background:var(--panel-2,rgba(255,255,255,.05));color:inherit";
    if (q.dueAt) input.value = toInputDate(q.dueAt);
    input.addEventListener("change", function () {
      if (!input.value) return;
      var parts = input.value.split("-");
      var d = new Date(+parts[0], +parts[1] - 1, +parts[2], 12, 0, 0, 0);
      setQuestDue(q.id, d.getTime());
      box.remove();
    });

    var quick = document.createElement("div");
    quick.style.cssText = "display:flex;gap:5px;flex-wrap:wrap";
    [["Today", 0], ["Tomorrow", 1], ["+1 week", 7]].forEach(function (pair) {
      var bq = document.createElement("button");
      bq.type = "button"; bq.textContent = pair[0];
      bq.style.cssText = "flex:1;padding:5px 7px;border-radius:8px;cursor:pointer;font-size:.72rem;" +
        "border:1px solid var(--border,rgba(255,255,255,.16));" +
        "background:var(--panel-2,rgba(255,255,255,.05));color:inherit";
      bq.addEventListener("click", function () {
        var d = new Date(); d.setHours(12, 0, 0, 0);
        d.setDate(d.getDate() + pair[1]);
        setQuestDue(q.id, d.getTime());
        box.remove();
      });
      quick.appendChild(bq);
    });

    box.append(input, quick);

    if (q.dueAt) {
      var clr = document.createElement("button");
      clr.type = "button"; clr.textContent = "Clear deadline";
      clr.style.cssText = "padding:5px 7px;border-radius:8px;cursor:pointer;font-size:.72rem;" +
        "border:1px solid var(--border,rgba(255,255,255,.16));background:none;color:inherit;opacity:.75";
      clr.addEventListener("click", function () { setQuestDue(q.id, null); box.remove(); });
      box.appendChild(clr);
    }

    document.body.appendChild(box);
    var r = anchor.getBoundingClientRect();
    box.style.top = Math.max(8, Math.min(r.bottom + 6, window.innerHeight - box.offsetHeight - 10)) + "px";
    box.style.left = Math.max(8, Math.min(r.left - 40, window.innerWidth - box.offsetWidth - 10)) + "px";
    setTimeout(function () {
      document.addEventListener("pointerdown", function away(e) {
        if (!box.contains(e.target)) { box.remove(); document.removeEventListener("pointerdown", away, true); }
      }, true);
    }, 0);
  }

  function decorateQuests() {
    if (!FLAGS.questDeadlines) return;
    var s = S(); if (!s || !Array.isArray(s.quests)) return;
    var list = document.getElementById("quest-list"); if (!list) return;
    var rows = list.querySelectorAll(".quest");
    if (!rows.length) return;

    for (var i = 0; i < rows.length && i < s.quests.length; i++) {
      var row = rows[i], q = s.quests[i];
      if (!q || row.querySelector(".fh11-due")) continue;
      var st = dueState(q);
      var chip = document.createElement("button");
      chip.type = "button";
      chip.className = "fh11-due " + (st === "none" ? "none" : st);
      chip.textContent = dueLabel(q);
      chip.title = q.dueAt
        ? "Due " + new Date(q.dueAt).toLocaleDateString() + " — click to change"
        : "Set a deadline";
      (function (qq, el) {
        el.addEventListener("click", function (e) {
          e.preventDefault(); e.stopPropagation();
          openDuePicker(qq, el);
        });
      })(q, chip);
      var del = row.querySelector("button.icon-btn");
      if (del) row.insertBefore(chip, del); else row.appendChild(chip);
    }
  }

  function hookRenderQuests() {
    if (typeof window.renderQuests !== "function") return false;
    if (window.renderQuests.__fh11) return true;
    var orig = window.renderQuests;
    var w = function () {
      var out = orig.apply(this, arguments);
      try { decorateQuests(); } catch (e) { console.warn("[fh11] due", e); }
      return out;
    };
    w.__fh11 = true;
    window.renderQuests = w;
    return true;
  }


  /* ============================================================
   * 14. ACCOUNT-WIDE ACHIEVEMENT PROGRESS
   *
   * You want "reach N hours" to count EVERY character's hours, not
   * just the one you are currently playing. Storing the progress
   * field globally was not enough - the numbers are recomputed from
   * whoever is active, so they still read as one hero's totals.
   *
   * The real fix is one function. _achCtx() builds the context
   * object that feeds all three consumers:
   *     _condMet()      - has this been unlocked?
   *     _condProgress() - how far along is it?
   *     renderAchievements() - what the panel shows
   * Wrapping _achCtx() therefore makes unlocks, progress bars and
   * the UI account-wide in one place, with no duplicated logic and
   * nothing for the app and this module to disagree about.
   *
   * HOW EACH STAT COMBINES, and why:
   *   SUMMED  - hours, sessions, quests done, skills/quests created,
   *             loot count, coins earned, minutes today.
   *             Effort accumulates: two heroes each doing 30h means
   *             the account has done 60h.
   *   BEST-OF - streak, level, longest session, bestiary %, perfect
   *             week, iron will.
   *             A 40-day streak is not "80 days" because a second
   *             hero also had 40; the account's record is 40.
   *   EVER    - every-action, full equip set, all rarities.
   *             Booleans are true if ANY character has done it.
   *
   * achievementProgress goes back to being GLOBAL, because with an
   * account-wide context it now genuinely holds account-wide
   * numbers rather than a label storage ignores.
   * ==========================================================*/

  function vaultList() {
    if (!charactersEnabled()) return [];
    var s = S();
    var P = s && s.fh11Profiles;
    if (!P || !P.vaults) return [];
    return Object.keys(P.vaults).map(function (k) { return P.vaults[k]; })
      .filter(function (v) { return v && typeof v === "object"; });
  }

  function sumLoot(owned) {
    if (!owned || typeof owned !== "object") return 0;
    var t = 0;
    Object.keys(owned).forEach(function (k) { t += (owned[k] | 0); });
    return t;
  }

  function maxSessionOf(v) {
    var logs = (v && v.sessionsLog) || [];
    var m = 0;
    for (var i = 0; i < logs.length; i++) {
      var r = logs[i];
      if (r && r.type === "focus" && (r.minutes | 0) > m) m = r.minutes | 0;
    }
    return m;
  }

  function todayKeySafe() {
    try { if (typeof window.todayKey === "function") return window.todayKey(); } catch (e) {}
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") +
           "-" + String(d.getDate()).padStart(2, "0");
  }

  /* Contribution from every character that is NOT currently loaded. */
  function otherCharacterTotals() {
    var tk = todayKeySafe();
    var acc = {
      sessions: 0, min: 0, questsDone: 0, questsCreated: 0, tasksCreated: 0,
      loot: 0, coinsEarned: 0, dayMin: 0,
      maxStreak: 0, maxLevel: 0, maxSession: 0, maxBestiary: 0,
      everyAction: false, slotSet: false
    };
    vaultList().forEach(function (v) {
      acc.sessions      += (v.completedFocusSessions | 0);
      acc.min           += (v.totalFocusMin | 0);
      acc.questsCreated += ((v.quests && v.quests.length) | 0);
      acc.tasksCreated  += ((v.tasks && v.tasks.length) | 0);
      acc.loot          += sumLoot(v.lootOwned);
      acc.coinsEarned   += (v.coinsEarned | 0);
      acc.dayMin        += ((v.history && v.history[tk]) | 0);
      if (Array.isArray(v.quests)) {
        acc.questsDone += v.quests.filter(function (q) { return q && q.done; }).length;
      }
      acc.maxStreak  = Math.max(acc.maxStreak, v.streak | 0, v.longestStreak | 0);
      acc.maxLevel   = Math.max(acc.maxLevel, (v.hero && v.hero.level) | 0);
      acc.maxSession = Math.max(acc.maxSession, maxSessionOf(v));
      try {
        var am = (v.adventure && v.adventure.actionMin) || null;
        if (am && Object.keys(am).length &&
            Object.keys(am).every(function (k) { return (am[k] | 0) > 0; })) acc.everyAction = true;
      } catch (e) {}
      try {
        var eq = v.hero && v.hero.equipped;
        if (eq && Object.keys(eq).length &&
            Object.keys(eq).every(function (k) { return eq[k] && eq[k].lootId; })) acc.slotSet = true;
      } catch (e) {}
    });
    return acc;
  }

  function hookAchievementContext() {
    if (!charactersEnabled()) return false;
    if (typeof window._achCtx !== "function") return false;
    if (window._achCtx.__fh11) return true;
    var orig = window._achCtx;
    var w = function () {
      var c = orig.apply(this, arguments);
      if (!FLAGS.accountAchievements || achCtxMode === "character") return c;
      try {
        var o = otherCharacterTotals();
        /* summed - effort accumulates across heroes */
        c.totalSessions  = (c.totalSessions | 0)  + o.sessions;
        c.totalMin       = (c.totalMin | 0)       + o.min;
        c.quests         = (c.quests | 0)         + o.questsDone;
        c.questsCreated  = (c.questsCreated | 0)  + o.questsCreated;
        c.tasksCreated   = (c.tasksCreated | 0)   + o.tasksCreated;
        c.lootCount      = (c.lootCount | 0)      + o.loot;
        c.coinsEarned    = (c.coinsEarned | 0)    + o.coinsEarned;
        c.dayMin         = (c.dayMin | 0)         + o.dayMin;
        /* best-of - a record is not the sum of records */
        c.streak         = Math.max(c.streak | 0, o.maxStreak);
        c.level          = Math.max(c.level | 0, o.maxLevel);
        c.maxSessionMin  = Math.max(c.maxSessionMin | 0, o.maxSession);
        /* ever - true if any character managed it */
        if (o.everyAction) c.everyAction = true;
        if (o.slotSet) c.slotSet = true;
      } catch (e) { /* fall back to this character's own numbers */ }
      return c;
    };
    w.__fh11 = true;
    window._achCtx = w;
    return true;
  }

  /* Force a recount so the panel reflects the account immediately
     after this module loads or a character is switched. */
  function refreshAchievements() {
    if (!charactersEnabled()) return false;
    try { if (typeof window.checkAchievementsV76 === "function") window.checkAchievementsV76(); }
    catch (e) {}
    return true;
  }

  /* ============================================================
   * 15. "TASKS" -> "SKILLS"
   *
   * Time categories you pour hours into and watch climb are skills,
   * not chores - and "Skills" reads as a game screen without
   * colliding with Quests (one-off goals) or the daily/weekly quest
   * board. The word was effectively unused in the app beforehand.
   *
   * Display only, scoped by element. state.tasks, activeTaskId,
   * createTask and every stored field keep their names, so saves,
   * backups and migrations are untouched.
   * ==========================================================*/

  var TASK_WORD = { one: "Skill", many: "Skills" };

  function renameTasks() {
    if (!FLAGS.renameTasks) return;

    var heading = document.getElementById("tasks-heading") ||
      document.getElementById("task-heading") ||
      (function () {
        var hs = document.querySelectorAll("h2, h3");
        for (var i = 0; i < hs.length; i++) {
          if (/^\s*Tasks\b/i.test(hs[i].textContent)) return hs[i];
        }
        return null;
      })();
    if (heading) {
      for (var i = 0; i < heading.childNodes.length; i++) {
        var n = heading.childNodes[i];
        if (n.nodeType === 3 && /Tasks/i.test(n.nodeValue)) {
          n.nodeValue = n.nodeValue.replace(/Tasks/g, TASK_WORD.many).replace(/Task\b/g, TASK_WORD.one);
        }
      }
    }

    var all = document.getElementById("btn-all-tasks");
    if (all && /task/i.test(all.textContent)) all.textContent = "All " + TASK_WORD.many.toLowerCase();

    var input = document.querySelector('#task-form input, input[placeholder*="New task"]');
    if (input && /new task/i.test(input.placeholder || "")) {
      input.placeholder = "New skill… (e.g. Study)";
      input.setAttribute("aria-label", "New skill");
    }

    /* The heading's muted hint span is a sibling node, not part of
       the heading text node handled above. */
    if (heading) {
      var hint = heading.querySelector("span");
      if (hint && /per task/i.test(hint.textContent)) {
        hint.textContent = hint.textContent.replace(/per task/gi, "per skill");
      }
    }

    /* The add button has no id, so match it by its own label rather
       than sweeping every button on the page. */
    var addBtn = document.getElementById("btn-new-task") ||
                 document.getElementById("btn-add-task");
    if (!addBtn) {
      var cands = document.querySelectorAll("#task-form button, .task-add button, button");
      for (var a = 0; a < cands.length; a++) {
        if (/^\s*Add task\s*$/i.test(cands[a].textContent)) { addBtn = cands[a]; break; }
      }
    }
    if (addBtn && /add task/i.test(addBtn.textContent)) {
      addBtn.textContent = "Add " + TASK_WORD.one.toLowerCase();
      addBtn.title = "Add skill (A)";
    }

    /* layout picker + any tab that lists the panel by name */
    var tabs = document.querySelectorAll('[data-tab], .tabs button, .layout-tabs button');
    for (var j = 0; j < tabs.length; j++) {
      if (tabs[j].textContent.trim() === "Tasks") tabs[j].textContent = TASK_WORD.many;
    }
  }


  /* ============================================================
   * 16. TWO ACHIEVEMENT VIEWS: ACCOUNT vs THIS CHARACTER
   *
   * Account view (default) - every character's effort combined.
   * Character view - only what THIS hero has done and earned.
   *
   * The hard part is the second one. Trophies live in a single
   * account-wide store, so a naive per-character view would still
   * show every trophy as unlocked no matter who earned it. To make
   * the split truthful, unlocks are now attributed:
   *
   *     state.achievementsBy = { achievementId: characterId }
   *
   * stamped by wrapping _achUnlock() at the moment of unlock.
   * Trophies earned before this existed are backfilled to whoever
   * is active when it first runs - the only honest option, since
   * that history was never recorded.
   *
   * Rendering reuses the app's own renderAchievements() rather than
   * cloning it, so the two views can never drift apart in styling
   * or content. Character view simply:
   *   - tells the context hook to stop combining characters, and
   *   - temporarily masks state.achievements to this hero's own
   * then restores both immediately. Nothing is persisted while
   * masked, so a render can never write a partial trophy list back
   * to disk.
   * ==========================================================*/

  var achView = "account";          // "account" | "character"
  var achCtxMode = "account";       // read by the _achCtx hook

  var ACHVIEW_CSS = [
    '#fh11-achview{display:flex;align-items:center;gap:6px;margin:0 0 10px;flex-wrap:wrap}',
    '#fh11-achview .seg{display:inline-flex;border-radius:999px;overflow:hidden;',
    '  border:1px solid var(--border,rgba(255,255,255,.14))}',
    '#fh11-achview .seg button{padding:6px 13px;border:none;cursor:pointer;font-size:.75rem;',
    '  letter-spacing:.05em;text-transform:uppercase;background:transparent;',
    '  color:var(--fg,#e8ecff);opacity:.6}',
    '#fh11-achview .seg button:hover{opacity:.95;background:rgba(255,255,255,.06)}',
    '#fh11-achview .seg button[aria-pressed="true"]{opacity:1;',
    '  background:rgba(var(--accent-rgb,126,224,200),.18);',
    '  color:var(--accent,#7ee0c8);font-weight:700}',
    '#fh11-achview .tally{margin-left:auto;font-size:.74rem;opacity:.62;',
    '  font-variant-numeric:tabular-nums}',
    '#fh11-achview .hint{flex-basis:100%;font-size:.72rem;opacity:.5;margin-top:-2px}'
  ].join("\n");

  function achievementsBy() {
    var s = S(); if (!s) return {};
    if (!s.achievementsBy || typeof s.achievementsBy !== "object") s.achievementsBy = {};
    return s.achievementsBy;
  }

  /* Attribute any pre-existing trophy to the character that is
     active the first time this runs. Runs once. */
  function backfillAttribution() {
    if (!charactersEnabled()) return 0;
    var s = S(); if (!s || !s.achievements) return 0;
    var P = profiles(); if (!P) return 0;
    var by = achievementsBy();
    var n = 0;
    Object.keys(s.achievements).forEach(function (id) {
      if (!by[id]) { by[id] = P.activeId; n++; }
    });
    return n;
  }

  function hookAchievementUnlock() {
    if (!charactersEnabled()) return false;
    if (typeof window._achUnlock !== "function") return false;
    if (window._achUnlock.__fh11) return true;
    var orig = window._achUnlock;
    var w = function (id) {
      var was = orig.apply(this, arguments);
      if (was) {
        try {
          var P = profiles();
          if (P) achievementsBy()[id] = P.activeId;
        } catch (e) {}
      }
      return was;
    };
    w.__fh11 = true;
    window._achUnlock = w;
    return true;
  }

  function ownedByActive() {
    if (!charactersEnabled()) return {};
    var s = S(); var P = profiles();
    var by = achievementsBy();
    var out = {};
    if (!s || !P || !s.achievements) return out;
    Object.keys(s.achievements).forEach(function (id) {
      if (by[id] === P.activeId) out[id] = s.achievements[id];
    });
    return out;
  }

  function achTally() {
    var s = S();
    var total = 0;
    try { total = (window.ACHIEVEMENTS_V76 || []).length; } catch (e) {}
    if (!total) {
      var g = document.getElementById("ach-grid");
      total = g ? g.children.length : 0;
    }
    var acct = s && s.achievements ? Object.keys(s.achievements).length : 0;
    var mine = Object.keys(ownedByActive()).length;
    return { total: total, account: acct, character: mine };
  }

  function injectAchToggle() {
    if (!charactersEnabled()) return;
    var grid = document.getElementById("ach-grid");
    if (!grid || !grid.parentNode) return;
    var bar = document.getElementById("fh11-achview");
    if (!bar) {
      bar = document.createElement("div");
      bar.id = "fh11-achview";
      grid.parentNode.insertBefore(bar, grid);
    }
    var P = profiles();
    var cur = activeProfile();
    var t = achTally();

    bar.innerHTML = "";
    var seg = document.createElement("div");
    seg.className = "seg";
    seg.setAttribute("role", "group");
    seg.setAttribute("aria-label", "Achievement view");

    [["account", "All characters"], ["character", cur ? cur.name : "This character"]]
      .forEach(function (pair) {
        var b = document.createElement("button");
        b.type = "button";
        b.textContent = pair[1];
        b.setAttribute("aria-pressed", achView === pair[0] ? "true" : "false");
        b.addEventListener("click", function () {
          if (achView === pair[0]) return;
          achView = pair[0];
          try { window.renderAchievements(); } catch (e) {}
        });
        seg.appendChild(b);
      });

    var tally = document.createElement("span");
    tally.className = "tally";
    tally.textContent = (achView === "account" ? t.account : t.character) +
                        (t.total ? " / " + t.total : "") + " unlocked";

    bar.append(seg, tally);

    if (P && P.list.length > 1) {
      var hint = document.createElement("div");
      hint.className = "hint";
      hint.textContent = achView === "account"
        ? "Every character's hours, sessions and coins counted together."
        : "Only what " + (cur ? cur.name : "this hero") + " has earned and done.";
      bar.appendChild(hint);
    }
  }

  function hookRenderAchievements() {
    if (!charactersEnabled()) return false;
    if (typeof window.renderAchievements !== "function") return false;
    if (window.renderAchievements.__fh11) return true;
    var orig = window.renderAchievements;
    var w = function () {
      var s = S();
      if (achView !== "character" || !s) {
        var out = orig.apply(this, arguments);
        try { injectAchToggle(); } catch (e) {}
        return out;
      }
      /* Character view: un-combine the context and show only this
         hero's trophies, then put everything back. */
      var realAch = s.achievements;
      achCtxMode = "character";
      s.achievements = ownedByActive();
      var res;
      try { res = orig.apply(this, arguments); }
      finally {
        s.achievements = realAch;
        achCtxMode = "account";
      }
      try { injectAchToggle(); } catch (e) {}
      return res;
    };
    w.__fh11 = true;
    window.renderAchievements = w;
    return true;
  }


  /* ============================================================
   * 17. STORAGE REGRESSION FIX  (urgent)
   *
   * WHAT I BROKE
   * Two changes in this module compound on a real, long-lived save:
   *
   *  a) Section 7 raised the everyday log caps roughly 10x
   *     (activityLog 200->1500, battleLog 60->800). On a heavy save
   *     that is ~180 KB of logs sitting in localStorage.
   *  b) Section 11 stores each parked character as a FULL copy of
   *     its 50 keys - including those same logs and its entire
   *     sessionsLog - inside the same localStorage entry.
   *
   * Measured on a simulated two-year save:
   *     one character ........ 417 KB   (sessionsLog 226, logs 181)
   *     each parked vault .... 414 KB
   *     four characters .... 1,660 KB
   *     data-guard ring x14 .. 22.7 MB
   * The snapshot ring is what actually fills the device.
   *
   * THE FIX
   * Bulk history does not belong in the hot save. For every parked
   * character the heavy arrays move to IndexedDB and are restored
   * on the way back in, so a vault drops from ~414 KB to ~8 KB
   * while losing nothing. Live diagnostic arrays remain untouched.
   *
   * Nothing is discarded at any point: heavy data is written to
   * IndexedDB and READ BACK for verification before it is removed
   * from the save. If the read-back fails, the data stays put and
   * the reclaim aborts.
   * ==========================================================*/

  var HEAVY_KEYS = ["sessionsLog", "activityLog", "battleLog", "editLog", "sessionHistory"];
  var VSTORE = "entries";

  function heavyKeyFor(charId) { return "charheavy:" + charId; }

  function putHeavy(charId, payload) {
    return openDb().then(function (db) {
      if (!db) return false;
      return new Promise(function (res) {
        try {
          var tx = db.transaction(VSTORE, "readwrite");
          tx.objectStore(VSTORE).put({
            k: heavyKeyFor(charId), type: "charHeavy",
            at: Date.now(), entry: payload
          });
          tx.oncomplete = function () { res(true); };
          tx.onerror = tx.onabort = function () { res(false); };
        } catch (e) { res(false); }
      });
    }).catch(function () { return false; });
  }

  function getHeavy(charId) {
    return openDb().then(function (db) {
      if (!db) return null;
      return new Promise(function (res) {
        try {
          var tx = db.transaction(VSTORE, "readonly");
          var rq = tx.objectStore(VSTORE).get(heavyKeyFor(charId));
          rq.onsuccess = function () { res(rq.result ? rq.result.entry : null); };
          rq.onerror = function () { res(null); };
        } catch (e) { res(null); }
      });
    }).catch(function () { return null; });
  }

  function bytesOfObj(o) {
    try { return new Blob([JSON.stringify(o)]).size; } catch (e) { return 0; }
  }

  /* Move heavy arrays out of every parked vault. Verified: written
     to IndexedDB and read back before removal from the save. */
  function reclaim() {
    if (!charactersEnabled()) return Promise.resolve({ ok: false, reason: "characters disabled" });
    var s = S(); var P = profiles();
    if (!s || !P) return Promise.resolve({ ok: false, reason: "no state" });

    var before = bytesOfObj(s);
    var ids = Object.keys(P.vaults || {});
    var moved = 0, skipped = 0;

    var chain = Promise.resolve();
    ids.forEach(function (id) {
      chain = chain.then(function () {
        var v = P.vaults[id];
        if (!v || typeof v !== "object") return;
        var heavy = {}, has = false;
        HEAVY_KEYS.forEach(function (k) {
          if (v[k] !== undefined) { heavy[k] = v[k]; has = true; }
        });
        if (!has) return;

        return getHeavy(id).then(function (existing) {
          /* Merge with anything already parked so repeated reclaims
             never drop earlier history. */
          if (existing && typeof existing === "object") {
            HEAVY_KEYS.forEach(function (k) {
              if (heavy[k] === undefined && existing[k] !== undefined) heavy[k] = existing[k];
              else if (Array.isArray(heavy[k]) && Array.isArray(existing[k]) &&
                       existing[k].length > heavy[k].length) heavy[k] = existing[k];
            });
          }
          return putHeavy(id, heavy);
        }).then(function (wrote) {
          if (!wrote) { skipped++; return; }
          return getHeavy(id).then(function (back) {          // verify before deleting
            if (!back) { skipped++; return; }
            var okAll = HEAVY_KEYS.every(function (k) {
              if (heavy[k] === undefined) return true;
              return JSON.stringify(back[k]) === JSON.stringify(heavy[k]);
            });
            if (!okAll) { skipped++; return; }
            HEAVY_KEYS.forEach(function (k) { delete P.vaults[id][k]; });
            P.vaults[id].__heavyInIdb = true;
            moved++;
          });
        });
      });
    });

    return chain.then(function () {
      /* The preservation wrapper returns without trimming live logs. */
      WARM_CAPS = { activityLog: 300, appLog: 150, battleLog: 250 };
      try { if (typeof window.fhTrimLogs === "function") window.fhTrimLogs(s, WARM_CAPS); } catch (e) {}
      try { if (typeof window.saveState === "function") window.saveState(); } catch (e) {}
      var after = bytesOfObj(s);
      var res = { ok: true, charactersCompacted: moved, skipped: skipped,
                  beforeBytes: before, afterBytes: after,
                  freed: before - after, freedHuman: fmtBytes(Math.max(0, before - after)) };
      if (typeof window.toast === "function") {
        window.toast("Reclaimed " + res.freedHuman + " — nothing was deleted.", "good");
      }
      return res;
    });
  }

  /* Run automatically on boot when the save has grown past a safe
     size, so a full device recovers without the user having to know
     any of this exists. Non-destructive and verified, so running it
     when it was not strictly needed costs nothing. */
  var AUTO_RECLAIM_BYTES = 150 * 1024;

  function autoReclaimIfNeeded() {
    if (!charactersEnabled()) return;
    var s = S(); if (!s) return;
    var P = s.fh11Profiles;
    var hasParked = P && P.vaults && Object.keys(P.vaults).some(function (k) {
      var v = P.vaults[k];
      return v && HEAVY_KEYS.some(function (h) { return v[h] !== undefined; });
    });
    if (!hasParked) return;
    if (bytesOfObj(s) < AUTO_RECLAIM_BYTES) return;
    reclaim().then(function (r) {
      if (r && r.ok && r.freed > 0) {
        console.info("[fh11] auto-reclaimed " + r.freedHuman + " from parked characters");
      }
    }).catch(function () {});
  }

  /* A vault whose heavy arrays live in IndexedDB must get them back
     before it becomes the live character. */
  function rehydrateVault(id, vault) {
    if (!vault || !vault.__heavyInIdb) return Promise.resolve(vault);
    return getHeavy(id).then(function (heavy) {
      if (heavy && typeof heavy === "object") {
        HEAVY_KEYS.forEach(function (k) {
          if (heavy[k] !== undefined) vault[k] = heavy[k];
        });
      }
      delete vault.__heavyInIdb;
      return vault;
    }).catch(function () { return vault; });
  }

  function rerender() {
    if (typeof window.renderTasks === "function") window.renderTasks();
    else applyFolders();
  }

  /* Wrap the app's renderTasks so folders survive every re-render. */
  function hookRenderTasks() {
    if (typeof window.renderTasks !== "function") return false;
    if (window.renderTasks.__fh11) return true;
    var orig = window.renderTasks;
    var wrapped = function () {
      var out = orig.apply(this, arguments);
      try { if (FLAGS.taskFolders) applyFolders(); } catch (e) { console.warn("[fh11] folders", e); }
      return out;
    };
    wrapped.__fh11 = true;
    window.renderTasks = wrapped;
    return true;
  }

  /* ============================================================
   * BOOT
   * ==========================================================*/

  var observer = null;

  function processOpenMenus() {
    var open = openBackdrops();
    for (var i = 0; i < open.length; i++) {
      if (FLAGS.persistentExits) ensureExit(open[i]);
      ensureGrip(open[i]);
    }
  }

  function start() {
    injectCss();
    wireGlobalExits();
    attachSwipe();
    sweep();
    processOpenMenus();

    /* The app defines renderTasks in a later script, and boots
       asynchronously, so poll briefly rather than assuming it is
       there the moment we run. */
    requestPersistence();
    hookTrimLogs();
    /* focus-economy installs its durable accounting wrapper just after the
       primary-ready event. Retry this hook independently of task rendering so
       an already-rendered Skills list cannot end the wait too early. */
    (function waitForDurableStopLog(tries){
      if(hookFinalizeStopwatch())return;
      if(tries>0)setTimeout(function(){waitForDurableStopLog(tries-1);},250);
    })(80);
    (function waitForApp(tries) {
      wireClock();
      hookTrimLogs();
      hookRenderTimer();
      hookSetActiveTask();
      try { applyStopwatchOnly(); injectSettings(); applyVocabulary(); } catch (e) {}
      try { hookRenderQuests(); decorateQuests(); } catch (e) {}
      if (charactersEnabled()) {
        try { renderCharacterBar(); } catch (e) {}
        try { mergeAchievementsToAccount(); } catch (e) {}
        try {
          hookAchievementContext();
          hookAchievementUnlock();
          backfillAttribution();
          hookRenderAchievements();
          refreshAchievements();
          injectAchToggle();
        } catch (e) {}
      }
      try { renameTasks(); } catch (e) {}
      try { ensureCompactSkills(); } catch (e) {}
      try { if (anyTicking()) startTicker(); } catch (e) {}
      if (hookRenderTasks()) {
        if (FLAGS.taskFolders) { try { applyFolders(); } catch (e) {} }
        try { ensureClockAffordance(); } catch (e) {}
        if (charactersEnabled()) {
          setTimeout(function () { try { autoReclaimIfNeeded(); } catch (e) {} }, 1500);
        }
        setTimeout(checkHeadroom, 4000);
        return;
      }
      if (tries > 0) setTimeout(function () { waitForApp(tries - 1); }, 250);
    })(40);

    /* The app re-renders panels constantly, so re-apply on change.
       Batched into a frame so a burst of mutations costs one pass. */
    var queued = false;
    observer = new MutationObserver(function () {
      if (queued) return;
      queued = true;
      requestAnimationFrame(function () {
        queued = false;
        sweep();
        processOpenMenus();
        try { applyVocabulary(); renameTasks(); } catch (e) {}
        try { ensureCompactSkills(); } catch (e) {}
        /* If something re-rendered the list without going through
           renderTasks, re-apply grouping. applyFolders() is a no-op
           when it is already in place. */
        if (FLAGS.taskFolders) { try { applyFolders(); } catch (e) {} }
      });
    });

    observer.observe(document.body, {
      childList: true, subtree: true,
      attributes: true, attributeFilter: ["hidden"]
    });
  }

  /* ============================================================
   * PUBLIC HANDLE
   * ==========================================================*/

  window.FH_UI11 = {
    version: "11.0.0",
    flags: Object.freeze(Object.assign({}, FLAGS, { characters:false })),
    enable: function (k) {
      /* Character switching is a build-time decision. A console call or
         injected script must not activate player-data migrations. */
      if (k === "characters") return Object.freeze(Object.assign({}, FLAGS, { characters:false }));
      FLAGS[k] = true; injectCss(); processOpenMenus(); return FLAGS;
    },
    disable: function (k) { FLAGS[k] = false; return FLAGS; },
    resweep: function () { sweep(); processOpenMenus(); wireClock(); ensureCompactSkills(); rerender(); },
    folders: folders,
    skillsExpanded: function (expanded) {
      if (typeof expanded === "boolean") return setSkillsExpanded(expanded, true);
      return !!skillsExpanded;
    },
    storage: storageReport,
    history: history,
    archiveStats: archiveStats,
    exportHistory: exportHistory,
    clocks: function () { return clocks().slots; },
    characters: function () { return charactersEnabled() ? profiles() : null; },
    createCharacter: function (name) { return charactersEnabled() ? createCharacter(name) : false; },
    switchCharacter: function (id) { return charactersEnabled() ? switchCharacter(id) : false; },
    perCharacterKeys: function () { return charactersEnabled() ? perCharacterKeys() : []; },
    mergeAchievements: function () {
      return charactersEnabled() ? mergeAchievementsToAccount() :
        { merged: 0, vaultsCleaned: 0, disabled: true };
    },
    accountTotals: otherCharacterTotals,
    reclaim: function () {
      return charactersEnabled() ? reclaim() :
        Promise.resolve({ ok: false, reason: "characters disabled" });
    },
    refreshAchievements: function () { return charactersEnabled() ? refreshAchievements() : false; },
    achView: function (v) {
      if (!charactersEnabled()) return null;
      if (v) { achView = v; try { window.renderAchievements(); } catch (e) {} }
      return achView;
    },
    achTally: achTally,
    globalKeys: function () { return GLOBAL_KEYS.slice(); },
    settings: settings,
    applyStopwatchOnly: applyStopwatchOnly,
    addClock: addClock,
    persisted: function () { return STORAGE.persisted; },
    /* Tuning handles for dialling the swipe feel in live. */
    tune: function (o) {
      if (o && typeof o.distance === "number") COMMIT_DISTANCE = o.distance;
      if (o && typeof o.velocity === "number") COMMIT_VELOCITY = o.velocity;
      return { distance: COMMIT_DISTANCE, velocity: COMMIT_VELOCITY };
    }
  };

  if (typeof window.FH_onPrimaryReady === "function") window.FH_onPrimaryReady(start);
  else if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();

/* asset content-type refresh — v10.32.0 */
