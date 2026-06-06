/* ============================================================================
 * Focus Hero — FH3D : 3D character / mount / gear system  (added v8.4)
 * ----------------------------------------------------------------------------
 * Progressive enhancement layer. Renders a stylized, game-quality 3D hero
 * (procedural Three.js — no external art assets) driven entirely by a plain
 * "spec" object the app hands in via FH3D.sync(spec).
 *
 * DESIGN CONTRACT
 *  - FH3D NEVER reads app state, localStorage, or cloud sync. It only knows
 *    about the spec object passed to sync(). The app is the single source of
 *    truth for data; FH3D is a pure renderer. (Keeps focus hours / XP / sync
 *    completely untouched.)
 *  - If THREE or WebGL is unavailable, FH3D.available stays false and the app
 *    keeps its existing SVG avatar. Nothing breaks.
 *  - One WebGLRenderer / one canvas, moved between the home card and the
 *    Character Studio modal. Cheap, battery-friendly (pauses when hidden).
 *
 * SPEC SHAPE (see fh3dSpec() in focus-hero.html):
 *   {
 *     cls, className, palette:[mid,high,dark,trim], level, running,
 *     colors:{ skin, hair, eye, armorMid, armorHigh, armorDark, accent, cloak },
 *     traits:{ race, body, hair, helm, face, eyeShape },
 *     equipped:{ weapon|null, helmet|null, armor|null, pet|null },   // {id,tier,metal,gem,glow}
 *     mount: null | { id, tier, colors:[body,accent,detail] }
 *   }
 * ==========================================================================*/
(function () {
  "use strict";

  var FH3D = (window.FH3D = window.FH3D || {});
  FH3D.available = false;
  FH3D.version = "fh3d-1.0";

  var THREE = window.THREE;

  /* ---- capability check ------------------------------------------------- */
  function webglSupported() {
    try {
      if (!THREE) return false;
      var c = document.createElement("canvas");
      return !!(c.getContext("webgl2") || c.getContext("webgl") || c.getContext("experimental-webgl"));
    } catch (e) { return false; }
  }

  /* ---- small helpers ---------------------------------------------------- */
  function col(hex, fallback) {
    try { return new THREE.Color(hex || fallback || "#888888"); }
    catch (e) { return new THREE.Color(fallback || "#888888"); }
  }
  function lighten(hex, amt) {
    var c = col(hex); c.offsetHSL(0, 0, amt); return c;
  }
  function darken(hex, amt) {
    var c = col(hex); c.offsetHSL(0, 0, -amt); return c;
  }

  /* =========================================================================
   * Engine singleton
   * =======================================================================*/
  var R = {
    renderer: null, scene: null, camera: null,
    root: null,            // everything that spins
    heroRig: null,         // the character group
    mountGroup: null,      // current mount (or null)
    petGroup: null,
    pedestal: null,
    disposables: [],       // geometries/materials to free on rebuild
    raf: 0, last: 0, clock: 0,
    yaw: 0, targetYaw: 0, autoSpin: true, dragging: false, lastPointerX: 0,
    pitch: 0, targetPitch: 0,
    mode: "home",          // "home" | "studio"
    mounted: false,
    running: false,
    sig: "",               // last spec signature (skip rebuild if unchanged)
    container: null,
    ro: null,              // ResizeObserver
    io: null,              // IntersectionObserver
    visible: true,
    initialized: false
  };

  /* ---- lifecycle -------------------------------------------------------- */
  function initEngine() {
    if (R.initialized) return true;
    if (!webglSupported()) return false;
    try {
      var renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      if ("outputColorSpace" in renderer) renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.12;
      renderer.domElement.className = "fh3d-canvas";
      renderer.domElement.setAttribute("aria-hidden", "true");
      // self-contained sizing: don't depend on external CSS being present
      var cs = renderer.domElement.style;
      cs.position = "absolute"; cs.left = "0"; cs.top = "0";
      cs.width = "100%"; cs.height = "100%"; cs.display = "block";
      cs.borderRadius = "inherit"; cs.touchAction = "pan-y";

      var scene = new THREE.Scene();
      scene.background = makeBackdrop("#1b2742", "#0a0f1d");

      var camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
      camera.position.set(0, 1.25, 4.2);

      // --- lighting: hemi fill + warm key (shadow) + cool rim ---
      var hemi = new THREE.HemisphereLight(0xbcd4ff, 0x3a2f29, 1.15);
      scene.add(hemi);

      var key = new THREE.DirectionalLight(0xfff1d8, 2.7);
      key.position.set(3.2, 5.4, 3.6);
      key.castShadow = true;
      key.shadow.mapSize.set(1024, 1024);
      key.shadow.camera.near = 1; key.shadow.camera.far = 18;
      key.shadow.camera.left = -3.2; key.shadow.camera.right = 3.2;
      key.shadow.camera.top = 3.6; key.shadow.camera.bottom = -2.2;
      key.shadow.bias = -0.0009; key.shadow.normalBias = 0.02;
      scene.add(key);

      var fill = new THREE.DirectionalLight(0x9fc4ff, 0.7);
      fill.position.set(-4, 2.4, 1.8);
      scene.add(fill);

      var rim = new THREE.DirectionalLight(0xbfe0ff, 1.1);
      rim.position.set(-1.5, 3.0, -4.2);
      scene.add(rim);

      var root = new THREE.Group();
      scene.add(root);

      // pedestal + shadow catcher
      var pedMat = new THREE.MeshStandardMaterial({ color: 0x222c44, roughness: 0.85, metalness: 0.1 });
      var pedTopMat = new THREE.MeshStandardMaterial({ color: 0x33406a, roughness: 0.6, metalness: 0.25 });
      var ped = new THREE.Group();
      var disc = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.05, 0.16, 48), pedMat);
      disc.position.y = -0.08; disc.receiveShadow = true; ped.add(disc);
      var ring = new THREE.Mesh(new THREE.CylinderGeometry(0.86, 0.86, 0.04, 48), pedTopMat);
      ring.position.y = 0.01; ring.receiveShadow = true; ped.add(ring);
      var floor = new THREE.Mesh(new THREE.CircleGeometry(2.4, 48), new THREE.ShadowMaterial({ opacity: 0.32 }));
      floor.rotation.x = -Math.PI / 2; floor.position.y = -0.001; floor.receiveShadow = true; ped.add(floor);
      root.add(ped);
      R.pedestal = ped;

      R.renderer = renderer; R.scene = scene; R.camera = camera; R.root = root;
      R.initialized = true;
      FH3D.available = true;

      // input + visibility wiring
      wirePointer(renderer.domElement);
      document.addEventListener("visibilitychange", function () {
        if (document.hidden) stopLoop(); else startLoop();
      });
      return true;
    } catch (e) {
      console.warn("[FH3D] init failed, falling back to 2D avatar:", e);
      FH3D.available = false;
      return false;
    }
  }

  /* radial gradient backdrop as a scene background texture */
  function makeBackdrop(inner, outer) {
    var c = document.createElement("canvas");
    c.width = c.height = 256;
    var g = c.getContext("2d");
    var grad = g.createRadialGradient(128, 96, 20, 128, 150, 240);
    grad.addColorStop(0, inner);
    grad.addColorStop(1, outer);
    g.fillStyle = grad; g.fillRect(0, 0, 256, 256);
    var tex = new THREE.CanvasTexture(c);
    if ("colorSpace" in tex) tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  /* ---- mesh helpers ----------------------------------------------------- */
  function track(obj) {
    if (obj.geometry) R.disposables.push(obj.geometry);
    if (obj.material) R.disposables.push(obj.material);
    return obj;
  }
  function mesh(geo, mat, x, y, z) {
    var m = new THREE.Mesh(geo, mat);
    if (x !== undefined) m.position.set(x, y, z);
    m.castShadow = true; m.receiveShadow = true;
    R.disposables.push(geo); // materials are shared+tracked separately
    return m;
  }
  function capsule(r, len, mat) { return mesh(new THREE.CapsuleGeometry(r, len, 6, 14), mat); }
  function ball(r, mat) { return mesh(new THREE.SphereGeometry(r, 22, 18), mat); }
  function box(w, h, d, mat) { return mesh(new THREE.BoxGeometry(w, h, d), mat); }

  function disposeGroup(g) {
    if (!g) return;
    g.traverse(function (o) {
      if (o.geometry) o.geometry.dispose();
    });
  }
  function flushDisposables() {
    for (var i = 0; i < R.disposables.length; i++) {
      try { R.disposables[i].dispose(); } catch (e) {}
    }
    R.disposables.length = 0;
  }

  /* =========================================================================
   * Character construction
   * =======================================================================*/
  function buildMaterials(spec) {
    var c = spec.colors;
    var M = {};
    M.skin = new THREE.MeshStandardMaterial({ color: col(c.skin, "#d99b73"), roughness: 0.72, metalness: 0.02 });
    M.armor = new THREE.MeshStandardMaterial({ color: col(c.armorMid, "#64748b"), roughness: 0.38, metalness: 0.62 });
    M.armorHi = new THREE.MeshStandardMaterial({ color: col(c.armorHigh, "#cbd5e1"), roughness: 0.3, metalness: 0.66 });
    M.armorDk = new THREE.MeshStandardMaterial({ color: col(c.armorDark, "#1f2937"), roughness: 0.5, metalness: 0.5 });
    M.trim = new THREE.MeshStandardMaterial({ color: col(c.accent, "#fbbf24"), roughness: 0.28, metalness: 0.85 });
    M.cloak = new THREE.MeshStandardMaterial({ color: col(c.cloak, "#2563eb"), roughness: 0.92, metalness: 0.0, side: THREE.DoubleSide });
    M.hair = new THREE.MeshStandardMaterial({ color: col(c.hair, "#332117"), roughness: 0.78, metalness: 0.05 });
    M.boot = new THREE.MeshStandardMaterial({ color: darken(c.armorDark || "#1f2937", 0.04), roughness: 0.6, metalness: 0.35 });
    M.eye = new THREE.MeshStandardMaterial({ color: col(c.eye, "#7fe9ff"), roughness: 0.25, metalness: 0.0, emissive: col(c.eye, "#7fe9ff").multiplyScalar(0.35) });
    M.eyeWhite = new THREE.MeshStandardMaterial({ color: 0xf3f6ff, roughness: 0.4 });
    M.dark = new THREE.MeshStandardMaterial({ color: 0x121621, roughness: 0.6 });
    M.mouth = new THREE.MeshStandardMaterial({ color: 0x6b2f2a, roughness: 0.7 });
    for (var k in M) R.disposables.push(M[k]);
    return M;
  }

  function buildHero(spec) {
    var M = buildMaterials(spec);
    var t = spec.traits || {};
    var body = t.body || "balanced";
    var rig = new THREE.Group();

    // proportions tuned by build
    var chestW = body === "broad" ? 0.62 : body === "lean" ? 0.48 : 0.55;
    var chestDepth = body === "broad" ? 0.4 : 0.34;

    // --- hips / pelvis ---
    var hips = box(chestW * 0.82, 0.26, chestDepth * 0.9, M.armorDk); hips.position.y = 0.92; rig.add(hips);

    // --- torso (tapered): lower belt + chest ---
    var torso = new THREE.Group(); torso.position.y = 1.16; rig.add(torso);
    var chest = mesh(new THREE.CylinderGeometry(chestW * 0.5, chestW * 0.44, 0.5, 18), M.armor);
    chest.scale.z = chestDepth / (chestW * 0.5); chest.castShadow = true; torso.add(chest);
    // chest plate highlight + trim emblem
    var plate = mesh(new THREE.SphereGeometry(chestW * 0.4, 18, 14, 0, Math.PI * 2, 0, Math.PI * 0.62), M.armorHi);
    plate.position.set(0, 0.02, chestDepth * 0.52); plate.scale.set(1, 1.1, 0.5); torso.add(plate);
    var emblem = mesh(new THREE.OctahedronGeometry(0.07, 0), M.trim);
    emblem.position.set(0, 0.06, chestDepth * 0.72); torso.add(emblem);
    var belt = mesh(new THREE.TorusGeometry(chestW * 0.46, 0.045, 8, 24), M.trim);
    belt.rotation.x = Math.PI / 2; belt.position.y = -0.26; belt.scale.z = chestDepth / (chestW * 0.46); torso.add(belt);
    // shoulder pauldrons
    var pL = mesh(new THREE.SphereGeometry(0.16, 16, 12), M.armorHi); pL.position.set(-chestW * 0.5 - 0.02, 0.2, 0); pL.scale.y = 0.8; torso.add(pL);
    var pR = pL.clone(); pR.position.x = chestW * 0.5 + 0.02; torso.add(pR);

    // --- neck ---
    var neck = capsule(0.08, 0.08, M.skin); neck.position.y = 1.5; rig.add(neck);

    // --- head group ---
    var headG = new THREE.Group(); headG.position.y = 1.66; rig.add(headG);
    var head = ball(0.27, M.skin); head.scale.set(1, 1.06, 0.96); headG.add(head);

    var helm = t.helm || "closed";
    var helmetGearId = spec.equipped && spec.equipped.helmet ? spec.equipped.helmet.id : null;
    var fullHelm = helm === "closed";

    if (fullHelm) {
      // metal helmet dome + visor slit + nose guard
      var dome = mesh(new THREE.SphereGeometry(0.285, 22, 16, 0, Math.PI * 2, 0, Math.PI * 0.62), M.armorHi);
      dome.position.y = 0.04; headG.add(dome);
      var band = mesh(new THREE.TorusGeometry(0.27, 0.03, 8, 26), M.trim);
      band.rotation.x = Math.PI / 2; band.position.y = -0.01; headG.add(band);
      var visor = box(0.42, 0.07, 0.06, M.dark); visor.position.set(0, 0.0, 0.235); headG.add(visor);
      var nose = box(0.05, 0.18, 0.06, M.armor); nose.position.set(0, -0.08, 0.25); headG.add(nose);
      // glowing eye slit
      var slit = box(0.34, 0.03, 0.02, M.eye); slit.position.set(0, 0.0, 0.27); headG.add(slit);
    } else {
      // face: eyes, brows, mouth
      var eyeR = t.eyeShape === "round" ? 0.05 : t.eyeShape === "sharp" ? 0.036 : 0.044;
      var eL = ball(0.052, M.eyeWhite); eL.position.set(-0.1, 0.02, 0.235); eL.scale.set(1, 0.85, 0.6); headG.add(eL);
      var eR = eL.clone(); eR.position.x = 0.1; headG.add(eR);
      var iL = ball(eyeR, M.eye); iL.position.set(-0.1, 0.02, 0.27); iL.scale.set(1, 1.1, 0.5); headG.add(iL);
      var iR = iL.clone(); iR.position.x = 0.1; headG.add(iR);
      var pLp = ball(0.018, M.dark); pLp.position.set(-0.1, 0.02, 0.285); headG.add(pLp);
      var pRp = pLp.clone(); pRp.position.x = 0.1; headG.add(pRp);
      // brows
      var bL = box(0.09, 0.018, 0.02, M.hair); bL.position.set(-0.1, 0.1, 0.255); bL.rotation.z = 0.12; headG.add(bL);
      var bR = bL.clone(); bR.position.x = 0.1; bR.rotation.z = -0.12; headG.add(bR);
      // mouth / face variant
      if (t.face === "smile") {
        var sm = mesh(new THREE.TorusGeometry(0.06, 0.012, 6, 12, Math.PI), M.mouth);
        sm.rotation.z = Math.PI; sm.position.set(0, -0.13, 0.245); headG.add(sm);
      } else {
        var mo = box(0.08, 0.014, 0.02, M.mouth); mo.position.set(0, -0.13, 0.25); headG.add(mo);
      }
      if (t.face === "scar") { var sc = box(0.012, 0.12, 0.02, new THREE.MeshStandardMaterial({ color: 0x9a4839, roughness: .7 })); R.disposables.push(sc.material); sc.position.set(0.08, 0.0, 0.255); sc.rotation.z = 0.3; headG.add(sc); }
      if (t.face === "warpaint") {
        var wp = new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: .7 }); R.disposables.push(wp);
        var wL = box(0.06, 0.02, 0.02, wp); wL.position.set(-0.1, -0.04, 0.25); headG.add(wL);
        var wR = wL.clone(); wR.position.x = 0.1; headG.add(wR);
      }

      // ears by race
      if (t.race === "elf" || t.race === "fae") {
        var earL = mesh(new THREE.ConeGeometry(0.05, 0.18, 8), M.skin);
        earL.position.set(-0.26, 0.05, 0); earL.rotation.z = Math.PI / 2.2; earL.rotation.y = 0.3; headG.add(earL);
        var earR = earL.clone(); earR.position.x = 0.26; earR.rotation.z = -Math.PI / 2.2; earR.rotation.y = -0.3; headG.add(earR);
      }
      if (t.race === "orc") {
        var tu = new THREE.MeshStandardMaterial({ color: 0xf5e7d0, roughness: .5 }); R.disposables.push(tu);
        var tL = mesh(new THREE.ConeGeometry(0.022, 0.09, 6), tu); tL.position.set(-0.06, -0.18, 0.22); headG.add(tL);
        var tR = tL.clone(); tR.position.x = 0.06; headG.add(tR);
      }
      if (t.race === "dwarf") {
        var beard = mesh(new THREE.SphereGeometry(0.2, 16, 12, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.5), M.hair);
        beard.position.set(0, -0.16, 0.06); beard.scale.set(1, 1.3, 0.8); headG.add(beard);
      }

      // hair
      addHair(headG, t.hair || "short", M.hair);

      // open-helm band / crest plume
      if (helm === "open" || helm === "crest") {
        var ob = mesh(new THREE.TorusGeometry(0.27, 0.028, 8, 26), M.trim);
        ob.rotation.x = Math.PI / 2; ob.position.y = 0.16; headG.add(ob);
      }
      if (helm === "crest") {
        var crest = mesh(new THREE.BoxGeometry(0.04, 0.16, 0.34), M.trim);
        crest.position.set(0, 0.34, -0.02); headG.add(crest);
      }
    }

    // --- arms ---
    var shoulderY = 1.38, armX = chestW * 0.55 + 0.04;
    var armL = makeArm(M, true); armL.position.set(-armX, shoulderY, 0); armL.rotation.z = 0.14; rig.add(armL);
    var armR = makeArm(M, false); armR.position.set(armX, shoulderY, 0); armR.rotation.z = -0.14; rig.add(armR);
    rig.userData.armL = armL; rig.userData.armR = armR;

    // --- legs ---
    var legL = makeLeg(M); legL.position.set(-0.16, 0.92, 0); rig.add(legL);
    var legR = makeLeg(M); legR.position.set(0.16, 0.92, 0); rig.add(legR);
    rig.userData.legL = legL; rig.userData.legR = legR;

    // --- cloak ---
    if (spec.colors.cloak) {
      var cloakGeo = new THREE.PlaneGeometry(0.66, 0.95, 6, 8);
      // gentle curve
      var pos = cloakGeo.attributes.position;
      for (var i = 0; i < pos.count; i++) {
        var x = pos.getX(i);
        pos.setZ(i, -Math.cos(x * 2.4) * 0.12 - 0.04);
      }
      cloakGeo.computeVertexNormals();
      R.disposables.push(cloakGeo);
      var cloak = new THREE.Mesh(cloakGeo, M.cloak);
      cloak.castShadow = true;
      cloak.position.set(0, 1.28, -chestDepth * 0.55);
      rig.add(cloak);
      rig.userData.cloak = cloak;
      // clasp
      var clasp = mesh(new THREE.SphereGeometry(0.05, 12, 8), M.trim); clasp.position.set(0, 1.46, -0.02); rig.add(clasp);
    }

    // --- gear overlays ---
    addArmorGear(rig, spec, M, torso);
    addHelmetGear(headG, helmetGearId, spec, M);
    addWeapon(rig.userData.armR, spec, M);

    rig.userData.torso = torso;
    rig.userData.headG = headG;
    rig.scale.setScalar(1.0);
    return rig;
  }

  function addHair(headG, style, hairMat) {
    if (style === "shaved") return;
    if (style === "mohawk") {
      var mh = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.2, 0.36), hairMat); R.disposables.push(mh.geometry);
      mh.position.set(0, 0.22, -0.02); mh.castShadow = true; headG.add(mh); return;
    }
    var cap = new THREE.Mesh(new THREE.SphereGeometry(0.29, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.55), hairMat);
    R.disposables.push(cap.geometry); cap.position.y = 0.05; cap.castShadow = true; headG.add(cap);
    if (style === "long") {
      var back = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.4, 0.18), hairMat); R.disposables.push(back.geometry);
      back.position.set(0, -0.06, -0.18); back.castShadow = true; headG.add(back);
    }
    if (style === "braids") {
      var brL = new THREE.Mesh(new THREE.CapsuleGeometry(0.04, 0.26, 4, 8), hairMat); R.disposables.push(brL.geometry);
      brL.position.set(-0.24, -0.16, 0.02); headG.add(brL);
      var brR = brL.clone(); brR.position.x = 0.24; headG.add(brR);
    }
  }

  function makeArm(M, left) {
    var g = new THREE.Group();
    var upper = capsule(0.082, 0.28, M.armor); upper.position.y = -0.18; g.add(upper);
    var elbow = ball(0.085, M.armorHi); elbow.position.y = -0.36; g.add(elbow);
    var fore = capsule(0.072, 0.24, M.skin); fore.position.y = -0.54; g.add(fore);
    var hand = ball(0.09, M.skin); hand.position.y = -0.72; g.add(hand);
    g.userData.hand = hand;
    g.userData.upper = upper;
    return g;
  }
  function makeLeg(M) {
    var g = new THREE.Group();
    var thigh = capsule(0.1, 0.3, M.armorDk); thigh.position.y = -0.2; g.add(thigh);
    var knee = ball(0.095, M.armor); knee.position.y = -0.4; g.add(knee);
    var shin = capsule(0.085, 0.3, M.armorDk); shin.position.y = -0.6; g.add(shin);
    var boot = box(0.18, 0.12, 0.3, M.boot); boot.position.set(0, -0.82, 0.06); g.add(boot);
    g.userData.thigh = thigh;
    return g;
  }

  /* ---- gear ------------------------------------------------------------- */
  function gearMetalMat(g, fallback) {
    var m = new THREE.MeshStandardMaterial({ color: col(g && g.metal, fallback || "#cbd5e1"), roughness: 0.25, metalness: 0.9 });
    R.disposables.push(m); return m;
  }
  function gearGemMat(g, fallback) {
    var c = col(g && g.gem, fallback || "#22d3ee");
    var m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.15, metalness: 0.1, emissive: c.clone().multiplyScalar(0.5) });
    R.disposables.push(m); return m;
  }

  function addWeapon(armR, spec, M) {
    var w = spec.equipped && spec.equipped.weapon;
    if (!armR) return;
    var hand = armR.userData.hand;
    var metal = gearMetalMat(w, "#dde7f2");
    var gem = gearGemMat(w, "#9fd8ff");
    var id = w ? w.id : null;

    function sword(scale) {
      var s = new THREE.Group();
      var blade = mesh(new THREE.BoxGeometry(0.06, 0.62, 0.02), metal); blade.position.y = 0.42; s.add(blade);
      var tip = mesh(new THREE.ConeGeometry(0.04, 0.12, 4), metal); tip.position.y = 0.79; s.add(tip);
      var guard = mesh(new THREE.BoxGeometry(0.22, 0.04, 0.05), M.trim); guard.position.y = 0.1; s.add(guard);
      var grip = mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.16, 8), M.armorDk); grip.position.y = 0.0; s.add(grip);
      var pommel = mesh(new THREE.SphereGeometry(0.04, 10, 8), gem); pommel.position.y = -0.09; s.add(pommel);
      s.scale.setScalar(scale || 1);
      return s;
    }

    if (!id) return; // empty hand
    if (id === "dualblade") {
      var s1 = sword(0.82); s1.position.set(0, -0.74, 0.05); s1.rotation.x = -0.2; armR.add(s1);
      // second blade on left handled separately via spec? keep both on right for simplicity
      var s2 = sword(0.82); s2.position.set(0.0, -0.74, -0.08); s2.rotation.x = -0.2; s2.rotation.z = 0.2; armR.add(s2);
    } else if (id === "whetstone_blade") {
      var sw = sword(1.0); sw.position.set(0, -0.78, 0.05); sw.rotation.x = -0.15; armR.add(sw);
    } else {
      // generic blade for any other weapon id
      var sg = sword(0.95); sg.position.set(0, -0.78, 0.05); sg.rotation.x = -0.15; armR.add(sg);
    }
    if (hand) hand.rotation.x = 0.2;
  }

  function addHelmetGear(headG, id, spec, M) {
    if (!id) return;
    var g = spec.equipped.helmet;
    var metal = gearMetalMat(g, "#fbbf24");
    var gem = gearGemMat(g, "#38bdf8");
    if (id === "crown_of_flow") {
      var base = mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.06, 12, 1, true), metal); base.position.y = 0.28; headG.add(base);
      for (var i = 0; i < 6; i++) {
        var a = (i / 6) * Math.PI * 2;
        var spike = mesh(new THREE.ConeGeometry(0.03, 0.12, 4), metal);
        spike.position.set(Math.cos(a) * 0.2, 0.36, Math.sin(a) * 0.2); headG.add(spike);
      }
      var jewel = mesh(new THREE.OctahedronGeometry(0.05, 0), gem); jewel.position.set(0, 0.33, 0.2); headG.add(jewel);
    } else if (id === "tome_of_tomorrow") {
      // floating circlet + small rune
      var circ = mesh(new THREE.TorusGeometry(0.27, 0.022, 8, 24), gem); circ.rotation.x = Math.PI / 2; circ.position.y = 0.34; headG.add(circ);
    } else {
      var ring = mesh(new THREE.TorusGeometry(0.24, 0.025, 8, 20), metal); ring.rotation.x = Math.PI / 2; ring.position.y = 0.26; headG.add(ring);
    }
  }

  function addArmorGear(rig, spec, M, torso) {
    var a = spec.equipped && spec.equipped.armor;
    if (!a) return;
    if (a.id === "moonplate_vest") {
      var c = col(a.gem, "#c4b5fd");
      var glowMat = new THREE.MeshStandardMaterial({ color: c, roughness: 0.3, metalness: 0.4, emissive: c.clone().multiplyScalar(0.4) });
      R.disposables.push(glowMat);
      var vest = mesh(new THREE.SphereGeometry(0.3, 18, 14, 0, Math.PI * 2, 0, Math.PI * 0.6), glowMat);
      vest.position.set(0, 0.0, 0.18); vest.scale.set(1, 1.2, 0.55); torso.add(vest);
    }
  }

  /* ---- pet -------------------------------------------------------------- */
  function buildPet(spec) {
    var p = spec.equipped && spec.equipped.pet;
    if (!p) return null;
    var g = new THREE.Group();
    var c = col(p.gem, "#c084fc");
    var bodyMat = new THREE.MeshStandardMaterial({ color: c, roughness: 0.5, metalness: 0.2, emissive: c.clone().multiplyScalar(0.25) });
    R.disposables.push(bodyMat);
    var pbody = ball(0.13, bodyMat); g.add(pbody);
    var earMat = bodyMat;
    if (p.id === "study_owl") {
      var beL = mesh(new THREE.ConeGeometry(0.04, 0.08, 4), earMat); beL.position.set(-0.06, 0.13, 0); g.add(beL);
      var beR = beL.clone(); beR.position.x = 0.06; g.add(beR);
      var eyM = new THREE.MeshStandardMaterial({ color: 0xfff7cc, emissive: 0x886600, roughness: .4 }); R.disposables.push(eyM);
      var eL = ball(0.05, eyM); eL.position.set(-0.05, 0.02, 0.1); g.add(eL);
      var eR = eL.clone(); eR.position.x = 0.05; g.add(eR);
    } else if (p.id === "clockwork_fox") {
      var fe1 = mesh(new THREE.ConeGeometry(0.045, 0.1, 4), earMat); fe1.position.set(-0.07, 0.14, 0); g.add(fe1);
      var fe2 = fe1.clone(); fe2.position.x = 0.07; g.add(fe2);
      var snout = mesh(new THREE.ConeGeometry(0.05, 0.12, 8), earMat); snout.rotation.x = Math.PI / 2; snout.position.set(0, -0.02, 0.14); g.add(snout);
    } else {
      // generic mote / dragon: a couple of small wings
      var wMat = new THREE.MeshStandardMaterial({ color: c.clone().multiplyScalar(1.2), roughness: 0.4, side: THREE.DoubleSide, transparent: true, opacity: 0.85 }); R.disposables.push(wMat);
      var wL = mesh(new THREE.CircleGeometry(0.12, 12, 0, Math.PI), wMat); wL.position.set(-0.1, 0.05, 0); wL.rotation.y = 0.6; g.add(wL);
      var wR = wL.clone(); wR.position.x = 0.1; wR.rotation.y = -0.6; g.add(wR);
    }
    g.scale.setScalar(0.9);
    return g;
  }

  /* =========================================================================
   * Mounts
   * =======================================================================*/
  function buildMount(spec) {
    var m = spec.mount;
    if (!m) return null;
    var id = m.id || "";
    var cset = m.colors || ["#374151", "#9ca3af", "#fbbf24"];
    var bodyMat = new THREE.MeshStandardMaterial({ color: col(cset[0]), roughness: 0.7, metalness: 0.08 });
    var accMat = new THREE.MeshStandardMaterial({ color: col(cset[1]), roughness: 0.6, metalness: 0.2 });
    var detMat = new THREE.MeshStandardMaterial({ color: col(cset[2]), roughness: 0.35, metalness: 0.5, emissive: col(cset[2]).multiplyScalar(0.15) });
    R.disposables.push(bodyMat, accMat, detMat);

    var g = new THREE.Group();

    if (id === "void_skiff") {
      // floating hover-skiff, no animal
      var hull = mesh(new THREE.CapsuleGeometry(0.32, 1.1, 6, 16), accMat);
      hull.rotation.z = Math.PI / 2; hull.scale.set(1, 1, 0.5); hull.position.y = 0.5; g.add(hull);
      var deck = mesh(new THREE.BoxGeometry(1.2, 0.06, 0.5), detMat); deck.position.y = 0.66; g.add(deck);
      var glow = mesh(new THREE.SphereGeometry(0.5, 18, 10, 0, Math.PI * 2, Math.PI * 0.55, Math.PI * 0.45), detMat);
      glow.position.y = 0.4; glow.scale.set(1.3, 1, 0.7); g.add(glow);
      g.userData.skiff = true;
      g.userData.seatY = 0.7; g.userData.stand = true;
      return g;
    }

    // ---- quadruped base ----
    var legs = [];
    function leg(x, z) {
      var l = mesh(new THREE.CapsuleGeometry(0.07, 0.5, 5, 10), bodyMat);
      l.position.set(x, 0.32, z); g.add(l); legs.push(l);
      var hoof = mesh(new THREE.CylinderGeometry(0.08, 0.09, 0.08, 8), detMat); hoof.position.set(x, 0.05, z); g.add(hoof);
      return l;
    }
    var panther = id === "phase_panther_reins";
    var bodyY = panther ? 0.62 : 0.72;
    var bodyMesh = mesh(new THREE.CapsuleGeometry(panther ? 0.3 : 0.34, 0.95, 8, 16), bodyMat);
    bodyMesh.rotation.z = Math.PI / 2; bodyMesh.position.set(0, bodyY, 0); bodyMesh.scale.set(1, 1, 0.85); g.add(bodyMesh);

    leg(-0.42, 0.22); leg(-0.42, -0.22); leg(0.42, 0.22); leg(0.42, -0.22);
    g.userData.legs = legs;

    // chest / haunch
    var haunch = mesh(new THREE.SphereGeometry(0.32, 16, 12), bodyMat); haunch.position.set(-0.5, bodyY, 0); haunch.scale.set(0.9, 1, 0.85); g.add(haunch);

    // neck + head
    var neck = mesh(new THREE.CapsuleGeometry(0.14, 0.4, 6, 12), bodyMat);
    neck.position.set(0.55, bodyY + 0.28, 0); neck.rotation.z = -0.7; g.add(neck);
    var head = mesh(new THREE.CapsuleGeometry(0.13, 0.26, 6, 12), bodyMat);
    head.position.set(0.82, bodyY + 0.48, 0); head.rotation.z = -1.2; g.add(head);
    var muzzle = mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.2, 10), bodyMat); muzzle.position.set(0.96, bodyY + 0.42, 0); muzzle.rotation.z = -1.4; g.add(muzzle);
    // ears
    var earL = mesh(new THREE.ConeGeometry(0.05, 0.14, 6), bodyMat); earL.position.set(0.74, bodyY + 0.66, 0.08); g.add(earL);
    var earR = earL.clone(); earR.position.z = -0.08; g.add(earR);
    // eyes
    var eyM = new THREE.MeshStandardMaterial({ color: 0x111319, roughness: .4 }); R.disposables.push(eyM);
    var meL = ball(0.03, eyM); meL.position.set(0.86, bodyY + 0.52, 0.1); g.add(meL);
    var meR = meL.clone(); meR.position.z = -0.1; g.add(meR);

    // tail
    var tail = mesh(new THREE.CapsuleGeometry(0.05, 0.4, 5, 10), accMat); tail.position.set(-0.78, bodyY + 0.05, 0); tail.rotation.z = 0.8; g.add(tail);

    // mane / accents
    if (!panther) {
      var mane = mesh(new THREE.BoxGeometry(0.06, 0.34, 0.3), accMat); mane.position.set(0.5, bodyY + 0.42, 0); mane.rotation.z = -0.6; g.add(mane);
    }

    // saddle (rider seat)
    var saddle = mesh(new THREE.SphereGeometry(0.26, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), detMat);
    saddle.position.set(-0.05, bodyY + 0.26, 0); saddle.scale.set(1, 0.6, 0.9); g.add(saddle);

    // ---- variant flourishes ----
    if (id === "unicorn_sigil") {
      var horn = mesh(new THREE.ConeGeometry(0.05, 0.34, 10), detMat); horn.position.set(0.92, bodyY + 0.72, 0); horn.rotation.z = -0.5; g.add(horn);
    }
    if (id === "astral_stag_tack") {
      [-1, 1].forEach(function (s) {
        var a1 = mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.3, 6), detMat); a1.position.set(0.74, bodyY + 0.8, 0.08 * s); a1.rotation.z = 0.3 * s; g.add(a1);
        var a2 = mesh(new THREE.CylinderGeometry(0.015, 0.02, 0.16, 6), detMat); a2.position.set(0.7, bodyY + 0.95, 0.16 * s); a2.rotation.z = 0.8 * s; g.add(a2);
      });
    }
    if (id === "griffin_saddle") {
      [-1, 1].forEach(function (s) {
        var wing = mesh(new THREE.PlaneGeometry(0.7, 0.5, 4, 3), new THREE.MeshStandardMaterial({ color: col(cset[1]), roughness: .6, side: THREE.DoubleSide }));
        R.disposables.push(wing.material);
        wing.position.set(-0.1, bodyY + 0.4, 0.3 * s); wing.rotation.set(0, 0, 0.5); wing.rotation.y = 0.5 * s; g.add(wing);
        g.userData.wing = g.userData.wing || []; g.userData.wing.push(wing);
      });
    }

    g.userData.seatY = bodyY + 0.42;
    g.userData.stand = false;
    return g;
  }

  /* =========================================================================
   * Sync / assemble
   * =======================================================================*/
  function specSignature(spec) {
    var e = spec.equipped || {};
    function gid(x) { return x ? (x.id + ":" + x.tier) : "-"; }
    return [
      spec.cls, spec.traits.race, spec.traits.body, spec.traits.hair, spec.traits.helm,
      spec.traits.face, spec.traits.eyeShape,
      spec.colors.skin, spec.colors.hair, spec.colors.eye,
      spec.colors.armorMid, spec.colors.armorHigh, spec.colors.armorDark, spec.colors.accent, spec.colors.cloak,
      gid(e.weapon), gid(e.helmet), gid(e.armor), gid(e.pet),
      spec.mount ? (spec.mount.id + ":" + spec.mount.tier) : "-"
    ].join("|");
  }

  function rebuild(spec) {
    // remove + dispose previous
    if (R.heroRig) { R.root.remove(R.heroRig); disposeGroup(R.heroRig); }
    if (R.mountGroup) { R.root.remove(R.mountGroup); disposeGroup(R.mountGroup); }
    if (R.petGroup) { R.root.remove(R.petGroup); disposeGroup(R.petGroup); }
    flushDisposables();
    R.heroRig = null; R.mountGroup = null; R.petGroup = null;

    var hero = buildHero(spec);
    var mount = buildMount(spec);
    var pet = buildPet(spec);

    R.mounted = !!mount;
    if (mount) {
      R.root.add(mount);
      R.mountGroup = mount;
      // seat the hero
      hero.position.y = mount.userData.seatY - 0.92;
      hero.position.x = mount.userData.stand ? 0 : 0.05;
      if (!mount.userData.stand) {
        // riding pose: splay thighs
        if (hero.userData.legL) hero.userData.legL.rotation.x = 0.5, hero.userData.legL.rotation.z = 0.18;
        if (hero.userData.legR) hero.userData.legR.rotation.x = 0.5, hero.userData.legR.rotation.z = -0.18;
      }
      // hide pedestal while mounted (mount stands on floor)
      if (R.pedestal) R.pedestal.visible = false;
    } else {
      hero.position.y = 0;
      if (R.pedestal) R.pedestal.visible = true;
    }
    R.root.add(hero);
    R.heroRig = hero;

    if (pet) {
      R.root.add(pet);
      R.petGroup = pet;
    }
    frame();
  }

  /* camera framing by mode + mounted */
  function frame() {
    var cam = R.camera;
    if (R.mode === "studio") {
      if (R.mounted) { cam.position.set(0, 1.5, 5.4); R.lookY = 1.15; }
      else { cam.position.set(0, 1.15, 3.7); R.lookY = 0.95; }
    } else { // home: tighter
      if (R.mounted) { cam.position.set(0, 1.45, 5.0); R.lookY = 1.1; }
      else { cam.position.set(0, 1.3, 2.95); R.lookY = 1.12; }
    }
    cam.lookAt(0, R.lookY, 0);
  }

  FH3D.sync = function (spec) {
    if (!FH3D.available) { if (!initEngine()) return; }
    if (!spec) return;
    R.running = !!spec.running;
    try {
      var sig = specSignature(spec);
      if (sig !== R.sig) { R.sig = sig; rebuild(spec); }
      startLoop();
    } catch (e) {
      console.warn("[FH3D] sync failed:", e);
    }
  };

  /* =========================================================================
   * Attachment (move the single canvas between containers)
   * =======================================================================*/
  function attach(container, mode) {
    if (!container) return;
    if (!FH3D.available) { if (!initEngine()) return; }
    var canvas = R.renderer.domElement;
    // the absolutely-positioned canvas needs a positioned ancestor
    try { if (getComputedStyle(container).position === "static") container.style.position = "relative"; } catch (e) {}
    if (canvas.parentNode !== container) {
      container.appendChild(canvas);
    }
    R.container = container;
    R.mode = mode || "home";
    container.classList.add("fh3d-host");
    resize();
    frame();
    observe(container);
    startLoop();
  }
  FH3D.attachHome = function (el) { attach(el, "home"); };
  FH3D.attachStudio = function (el) { attach(el, "studio"); };
  FH3D.detachStudio = function (homeEl) { if (homeEl) attach(homeEl, "home"); };

  function resize() {
    if (!R.container || !R.renderer) return;
    var w = R.container.clientWidth || 120, h = R.container.clientHeight || 120;
    R.renderer.setSize(w, h, false);
    R.camera.aspect = w / h;
    R.camera.updateProjectionMatrix();
  }
  function observe(container) {
    if (R.ro) { try { R.ro.disconnect(); } catch (e) {} }
    if (window.ResizeObserver) {
      R.ro = new ResizeObserver(function () { resize(); });
      R.ro.observe(container);
    }
    if (R.io) { try { R.io.disconnect(); } catch (e) {} }
    if (window.IntersectionObserver) {
      R.io = new IntersectionObserver(function (entries) {
        R.visible = entries[0] && entries[0].isIntersecting;
        if (R.visible && !document.hidden) startLoop(); else stopLoop();
      }, { threshold: 0.01 });
      R.io.observe(container);
    }
  }

  /* =========================================================================
   * Pointer drag (spin) + animation loop
   * =======================================================================*/
  function wirePointer(canvas) {
    canvas.style.touchAction = "pan-y";
    canvas.addEventListener("pointerdown", function (e) {
      R.dragging = true; R.autoSpin = false; R.lastPointerX = e.clientX; R.lastPointerY = e.clientY;
      try { canvas.setPointerCapture(e.pointerId); } catch (x) {}
    });
    canvas.addEventListener("pointermove", function (e) {
      if (!R.dragging) return;
      var dx = e.clientX - R.lastPointerX; R.lastPointerX = e.clientX;
      R.targetYaw += dx * 0.012;
    });
    function up() {
      R.dragging = false;
      clearTimeout(R._spinT);
      R._spinT = setTimeout(function () { R.autoSpin = true; }, 2600);
    }
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);
    canvas.addEventListener("pointerleave", function () { if (R.dragging) up(); });
  }

  function startLoop() {
    if (R.raf) return;
    if (document.hidden) return;
    R.last = performance.now();
    R.raf = requestAnimationFrame(tick);
  }
  function stopLoop() {
    if (R.raf) { cancelAnimationFrame(R.raf); R.raf = 0; }
  }

  function tick(now) {
    R.raf = requestAnimationFrame(tick);
    var dt = Math.min(0.05, (now - R.last) / 1000); R.last = now; R.clock += dt;
    var t = R.clock;

    // spin
    if (R.autoSpin && !R.dragging) R.targetYaw += dt * (R.mode === "studio" ? 0.35 : 0.5);
    R.yaw += (R.targetYaw - R.yaw) * Math.min(1, dt * 8);
    if (R.root) R.root.rotation.y = R.yaw;

    var speed = R.running ? 2.4 : 1.0;
    var amp = R.running ? 1.5 : 1.0;

    // hero idle / motion
    if (R.heroRig) {
      var h = R.heroRig;
      var bob = Math.sin(t * 2.2 * speed) * 0.018 * amp;
      if (h.userData.torso) {
        h.userData.torso.position.y = 1.16 + bob;
        h.userData.torso.rotation.y = Math.sin(t * 1.1) * 0.05;
      }
      if (h.userData.headG) {
        h.userData.headG.position.y = 1.66 + bob;
        h.userData.headG.rotation.y = Math.sin(t * 0.8) * 0.12;
        h.userData.headG.rotation.x = Math.sin(t * 1.3) * 0.03;
      }
      if (!R.mounted) {
        if (h.userData.armL) h.userData.armL.rotation.x = Math.sin(t * 1.6 * speed) * 0.12 * amp;
        if (h.userData.armR) h.userData.armR.rotation.x = -Math.sin(t * 1.6 * speed) * 0.12 * amp;
      }
      if (h.userData.cloak) {
        h.userData.cloak.rotation.x = Math.sin(t * 1.4) * 0.06 + 0.05;
        h.userData.cloak.position.y = 1.28 + bob;
      }
    }

    // mount motion
    if (R.mountGroup) {
      var mg = R.mountGroup;
      if (mg.userData.skiff) {
        mg.position.y = Math.sin(t * 1.4) * 0.05;
        mg.rotation.z = Math.sin(t * 0.9) * 0.03;
        if (R.heroRig) R.heroRig.position.y = (mg.userData.seatY - 0.92) + Math.sin(t * 1.4) * 0.05;
      } else {
        var gallop = R.running;
        var gy = gallop ? Math.abs(Math.sin(t * 6)) * 0.06 : Math.sin(t * 1.8) * 0.02;
        mg.position.y = gy;
        if (R.heroRig) R.heroRig.position.y = (mg.userData.seatY - 0.92) + gy;
        var legs = mg.userData.legs || [];
        for (var i = 0; i < legs.length; i++) {
          var ph = (i % 2 === 0) ? 0 : Math.PI;
          legs[i].rotation.x = Math.sin(t * (gallop ? 8 : 2.2) + ph + (i < 2 ? 0 : Math.PI)) * (gallop ? 0.5 : 0.12);
        }
        if (mg.userData.wing) {
          var flap = Math.sin(t * 3) * 0.4;
          mg.userData.wing[0].rotation.z = 0.5 + flap;
          mg.userData.wing[1].rotation.z = 0.5 + flap;
        }
      }
    }

    // pet orbit/bob
    if (R.petGroup) {
      var pr = 0.95, pa = t * 0.8;
      R.petGroup.position.set(Math.cos(pa) * pr, 1.55 + Math.sin(t * 2) * 0.08, Math.sin(pa) * pr * 0.6 - 0.2);
      R.petGroup.rotation.y = -pa + Math.PI / 2;
    }

    if (R.renderer && R.scene && R.camera) {
      try { R.renderer.render(R.scene, R.camera); } catch (e) { stopLoop(); }
    }
  }
  /* =========================================================================
   * Modal observer: when Character Studio closes, move canvas back home
   * =======================================================================*/
  FH3D.wireModal = function (modalId, studioHostId, homeHostId) {
    var modal = document.getElementById(modalId);
    if (!modal || !window.MutationObserver) return;
    var obs = new MutationObserver(function () {
      var hidden = modal.hasAttribute("hidden");
      if (hidden) {
        var home = document.getElementById(homeHostId);
        if (home) FH3D.detachStudio(home);
      }
    });
    obs.observe(modal, { attributes: true, attributeFilter: ["hidden"] });
  };

  /* expose a tiny debug hook */
  FH3D._R = R;
})();
