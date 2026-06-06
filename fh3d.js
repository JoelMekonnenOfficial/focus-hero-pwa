/* ============================================================================
 * Focus Hero — FH3D : 3D character / mount / gear system  (v8.4.1 overhaul)
 * ----------------------------------------------------------------------------
 * Pure renderer. The app hands in a plain "spec" via FH3D.sync(spec); FH3D
 * never reads app state, localStorage, or cloud sync. Progressive enhancement:
 * if THREE/WebGL is missing, FH3D.available stays false and the app keeps its
 * SVG avatar.
 *
 * v8.4.1: heroic proportions, real face + knight helm (no robot dome), image-
 * based lighting (PMREM env) for reflective metal, redesigned horse, and the
 * canvas now correctly stays on the home card (Studio only borrows it when open).
 *
 * SPEC SHAPE:
 *   { cls, className, palette:[mid,high,dark,trim], level, running,
 *     colors:{ skin, hair, eye, armorMid, armorHigh, armorDark, accent, cloak },
 *     traits:{ race, body, hair, helm, face, eyeShape },
 *     equipped:{ weapon|null, helmet|null, armor|null, pet|null },  // {id,tier,metal,gem,glow}
 *     mount: null | { id, tier, colors:[body,accent,detail] } }
 * ==========================================================================*/
(function () {
  "use strict";
  var FH3D = (window.FH3D = window.FH3D || {});
  FH3D.available = false;
  FH3D.version = "fh3d-2.0";
  var THREE = window.THREE;

  function webglSupported() {
    try {
      if (!THREE) return false;
      var c = document.createElement("canvas");
      return !!(c.getContext("webgl2") || c.getContext("webgl") || c.getContext("experimental-webgl"));
    } catch (e) { return false; }
  }
  function col(hex, fb) { try { return new THREE.Color(hex || fb || "#888"); } catch (e) { return new THREE.Color(fb || "#888"); } }
  function darken(hex, a) { var c = col(hex); c.offsetHSL(0, 0, -a); return c; }
  function lighten(hex, a) { var c = col(hex); c.offsetHSL(0, 0, a); return c; }

  var R = {
    renderer: null, scene: null, camera: null, env: null,
    root: null, heroRig: null, mountGroup: null, petGroup: null, pedestal: null,
    disposables: [],
    raf: 0, last: 0, clock: 0,
    yaw: 0, targetYaw: 0, autoSpin: true, dragging: false, lastPointerX: 0,
    mode: "home", mounted: false, running: false, lookY: 1.0,
    sig: "", container: null, ro: null, io: null, initialized: false
  };

  /* ---------- engine ---------- */
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
      renderer.toneMappingExposure = 1.05;
      var cs = renderer.domElement.style;
      cs.position = "absolute"; cs.left = "0"; cs.top = "0";
      cs.width = "100%"; cs.height = "100%"; cs.display = "block";
      cs.borderRadius = "inherit"; cs.touchAction = "pan-y";
      renderer.domElement.className = "fh3d-canvas";
      renderer.domElement.setAttribute("aria-hidden", "true");

      var scene = new THREE.Scene();
      scene.background = makeBackdrop("#243454", "#0a0e1a");
      R.env = makeEnv(renderer);
      scene.environment = R.env;

      var camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
      camera.position.set(0, 1.3, 4.4);

      var hemi = new THREE.HemisphereLight(0xcfe0ff, 0x2a2620, 0.55); scene.add(hemi);
      var key = new THREE.DirectionalLight(0xfff2da, 2.5);
      key.position.set(3.4, 5.6, 3.8); key.castShadow = true;
      key.shadow.mapSize.set(2048, 2048);
      key.shadow.camera.near = 1; key.shadow.camera.far = 20;
      key.shadow.camera.left = -3.5; key.shadow.camera.right = 3.5;
      key.shadow.camera.top = 4; key.shadow.camera.bottom = -2.5;
      key.shadow.bias = -0.0008; key.shadow.normalBias = 0.025;
      scene.add(key);
      var fill = new THREE.DirectionalLight(0x9bc0ff, 0.5); fill.position.set(-4.5, 2.2, 1.5); scene.add(fill);
      var rim = new THREE.DirectionalLight(0xdcefff, 1.4); rim.position.set(-1.5, 3.2, -4.5); scene.add(rim);

      var root = new THREE.Group(); scene.add(root);

      // pedestal + soft contact shadow
      var ped = new THREE.Group();
      var pedMat = new THREE.MeshStandardMaterial({ color: 0x2a3658, roughness: 0.65, metalness: 0.3, envMapIntensity: 0.6 });
      var pedTop = new THREE.MeshStandardMaterial({ color: 0x3a4d80, roughness: 0.4, metalness: 0.5, envMapIntensity: 0.9 });
      var disc = new THREE.Mesh(new THREE.CylinderGeometry(0.92, 1.04, 0.14, 56), pedMat);
      disc.position.y = -0.07; disc.receiveShadow = true; ped.add(disc);
      var rim2 = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.035, 10, 56), pedTop);
      rim2.rotation.x = Math.PI / 2; rim2.position.y = 0.005; ped.add(rim2);
      var floor = new THREE.Mesh(new THREE.CircleGeometry(2.6, 48), new THREE.ShadowMaterial({ opacity: 0.35 }));
      floor.rotation.x = -Math.PI / 2; floor.position.y = 0; floor.receiveShadow = true; ped.add(floor);
      root.add(ped); R.pedestal = ped;

      R.renderer = renderer; R.scene = scene; R.camera = camera; R.root = root;
      R.initialized = true; FH3D.available = true;
      wirePointer(renderer.domElement);
      document.addEventListener("visibilitychange", function () { if (document.hidden) stopLoop(); else startLoop(); });
      return true;
    } catch (e) { console.warn("[FH3D] init failed:", e); FH3D.available = false; return false; }
  }

  function makeBackdrop(inner, outer) {
    var c = document.createElement("canvas"); c.width = c.height = 256;
    var g = c.getContext("2d");
    var grad = g.createRadialGradient(128, 92, 16, 128, 150, 250);
    grad.addColorStop(0, inner); grad.addColorStop(1, outer);
    g.fillStyle = grad; g.fillRect(0, 0, 256, 256);
    var t = new THREE.CanvasTexture(c); if ("colorSpace" in t) t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  // image-based lighting from a small gradient — gives metals real reflections
  function makeEnv(renderer) {
    try {
      var pmrem = new THREE.PMREMGenerator(renderer);
      var c = document.createElement("canvas"); c.width = 128; c.height = 64;
      var g = c.getContext("2d");
      var grad = g.createLinearGradient(0, 0, 0, 64);
      grad.addColorStop(0.0, "#dfe9ff"); grad.addColorStop(0.45, "#8fa6cc");
      grad.addColorStop(0.55, "#54607a"); grad.addColorStop(1.0, "#20242e");
      g.fillStyle = grad; g.fillRect(0, 0, 128, 64);
      // a couple of soft "light" blobs for highlights
      g.fillStyle = "rgba(255,245,220,0.9)"; g.beginPath(); g.arc(34, 18, 10, 0, 7); g.fill();
      g.fillStyle = "rgba(180,210,255,0.7)"; g.beginPath(); g.arc(98, 22, 8, 0, 7); g.fill();
      var tex = new THREE.CanvasTexture(c); tex.mapping = THREE.EquirectangularReflectionMapping;
      var rt = pmrem.fromEquirectangular(tex);
      tex.dispose(); pmrem.dispose();
      return rt.texture;
    } catch (e) { return null; }
  }

  /* ---------- mesh helpers ---------- */
  function track(o) { if (o.geometry) R.disposables.push(o.geometry); if (o.material) R.disposables.push(o.material); return o; }
  function M(geo, mat, x, y, z) {
    var m = new THREE.Mesh(geo, mat); if (x !== undefined) m.position.set(x, y, z);
    m.castShadow = true; m.receiveShadow = true; R.disposables.push(geo); return m;
  }
  function disposeGroup(g) { if (!g) return; g.traverse(function (o) { if (o.geometry) o.geometry.dispose(); }); }
  function flush() { for (var i = 0; i < R.disposables.length; i++) { try { R.disposables[i].dispose(); } catch (e) {} } R.disposables.length = 0; }

  /* ---------- materials ---------- */
  function makeMats(spec) {
    var c = spec.colors, m = {};
    function std(o) { var mt = new THREE.MeshStandardMaterial(o); R.disposables.push(mt); return mt; }
    m.skin = std({ color: col(c.skin, "#e7b48c"), roughness: 0.62, metalness: 0.0, envMapIntensity: 0.5 });
    m.armor = std({ color: col(c.armorMid, "#64748b"), roughness: 0.33, metalness: 0.92, envMapIntensity: 1.1 });
    m.armorHi = std({ color: col(c.armorHigh, "#cbd5e1"), roughness: 0.25, metalness: 0.95, envMapIntensity: 1.25 });
    m.armorDk = std({ color: col(c.armorDark, "#1f2937"), roughness: 0.45, metalness: 0.85, envMapIntensity: 0.9 });
    m.trim = std({ color: col(c.accent, "#fbbf24"), roughness: 0.28, metalness: 1.0, envMapIntensity: 1.3 });
    m.cloak = std({ color: col(c.cloak, "#2563eb"), roughness: 0.85, metalness: 0.0, envMapIntensity: 0.4, side: THREE.DoubleSide });
    m.cloakIn = std({ color: darken(c.cloak || "#2563eb", 0.12), roughness: 0.9, metalness: 0.0, side: THREE.DoubleSide });
    m.hair = std({ color: col(c.hair, "#3a2417"), roughness: 0.75, metalness: 0.05, envMapIntensity: 0.4 });
    m.boot = std({ color: darken(c.armorDark || "#1f2937", 0.03), roughness: 0.4, metalness: 0.8, envMapIntensity: 0.9 });
    m.leather = std({ color: col("#5b3d22"), roughness: 0.8, metalness: 0.1 });
    var eyeC = col(c.eye, "#7fe9ff");
    m.eye = std({ color: eyeC, roughness: 0.2, metalness: 0.0, emissive: eyeC.clone().multiplyScalar(0.25) });
    m.eyeWhite = std({ color: 0xf4f7ff, roughness: 0.35 });
    m.dark = std({ color: 0x0f131c, roughness: 0.5 });
    m.brow = std({ color: darken(c.hair || "#3a2417", 0.02), roughness: 0.8 });
    m.mouth = std({ color: 0x7a3b33, roughness: 0.7 });
    return m;
  }

  /* ===================== CHARACTER ===================== */
  function buildHero(spec) {
    var mats = makeMats(spec), t = spec.traits || {}, rig = new THREE.Group();
    var build = t.body || "balanced";
    var bw = build === "broad" ? 1.12 : build === "lean" ? 0.9 : 1.0;   // body width scale
    var helm = t.helm || "closed";
    var helmetGear = spec.equipped && spec.equipped.helmet ? spec.equipped.helmet.id : null;
    var fullHelm = helm === "closed";

    // ---- legs (longer, heroic) ----
    var legL = makeLeg(mats); legL.position.set(-0.17 * bw, 0.86, 0); rig.add(legL);
    var legR = makeLeg(mats); legR.position.set(0.17 * bw, 0.86, 0); rig.add(legR);
    rig.userData.legL = legL; rig.userData.legR = legR;

    // ---- armored skirt / tassets below belt ----
    var skirt = M(new THREE.CylinderGeometry(0.21 * bw, 0.27 * bw, 0.24, 16, 1, true), mats.armorDk);
    skirt.position.y = 0.93; rig.add(skirt);
    var skirtTrim = M(new THREE.TorusGeometry(0.27 * bw, 0.018, 8, 24), mats.trim);
    skirtTrim.rotation.x = Math.PI / 2; skirtTrim.position.y = 0.82; rig.add(skirtTrim);

    // ---- torso group ----
    var torso = new THREE.Group(); torso.position.y = 1.18; rig.add(torso); rig.userData.torso = torso;
    // breastplate (lathe for a smooth cuirass)
    var pts = [];
    pts.push(new THREE.Vector2(0.23 * bw, -0.32));
    pts.push(new THREE.Vector2(0.265 * bw, -0.16));
    pts.push(new THREE.Vector2(0.255 * bw, 0.0));
    pts.push(new THREE.Vector2(0.215 * bw, 0.16));
    pts.push(new THREE.Vector2(0.145 * bw, 0.27));
    pts.push(new THREE.Vector2(0.07 * bw, 0.32));
    var cuir = M(new THREE.LatheGeometry(pts, 28), mats.armor);
    cuir.scale.z = 0.78; torso.add(cuir);
    // chest highlight ridge
    var ridge = M(new THREE.SphereGeometry(0.12 * bw, 18, 14, 0, Math.PI * 2, 0, Math.PI * 0.55), mats.armorHi);
    ridge.position.set(0, 0.05, 0.17 * bw); ridge.scale.set(1, 1.1, 0.42); torso.add(ridge);
    // class emblem (color-coded) on chest
    var clsMat = new THREE.MeshStandardMaterial({ color: col((spec.palette && spec.palette[1]) || spec.colors.accent, "#fbbf24"), roughness: 0.3, metalness: 0.75, emissive: col((spec.palette && spec.palette[1]) || "#222").multiplyScalar(0.18), envMapIntensity: 1.2 }); R.disposables.push(clsMat);
    var emblem = M(new THREE.OctahedronGeometry(0.064, 0), clsMat);
    emblem.position.set(0, 0.07, 0.23 * bw); torso.add(emblem);
    // neckline trim
    var collar = M(new THREE.TorusGeometry(0.12, 0.025, 8, 22), mats.trim);
    collar.rotation.x = Math.PI / 2.3; collar.position.set(0, 0.26, 0.04); torso.add(collar);
    // belt
    var belt = M(new THREE.TorusGeometry(0.245 * bw, 0.038, 8, 26), mats.leather);
    belt.rotation.x = Math.PI / 2; belt.position.y = -0.28; belt.scale.z = 0.78; torso.add(belt);
    var buckle = M(new THREE.BoxGeometry(0.09, 0.07, 0.04), mats.trim); buckle.position.set(0, -0.28, 0.2 * bw); torso.add(buckle);
    // pauldrons
    var pL = M(new THREE.SphereGeometry(0.115 * bw, 18, 14, 0, Math.PI * 2, 0, Math.PI * 0.6), mats.armorHi);
    pL.position.set(-0.26 * bw, 0.18, 0); pL.scale.y = 0.8; torso.add(pL);
    var pR = pL.clone(); pR.position.x = 0.26 * bw; torso.add(pR);
    var pLt = M(new THREE.TorusGeometry(0.115 * bw, 0.013, 8, 20), mats.trim); pLt.rotation.x = Math.PI / 2; pLt.position.set(-0.26 * bw, 0.12, 0); torso.add(pLt);
    var pRt = pLt.clone(); pRt.position.x = 0.26 * bw; torso.add(pRt);

    // ---- neck ----
    var neck = M(new THREE.CylinderGeometry(0.075, 0.085, 0.1, 12), mats.skin); neck.position.y = 1.52; rig.add(neck);

    // ---- head ----
    var headG = new THREE.Group(); headG.position.y = 1.66; rig.add(headG); rig.userData.headG = headG;
    var head = M(new THREE.SphereGeometry(0.205, 26, 22), mats.skin); head.scale.set(0.95, 1.05, 0.98); headG.add(head);
    // jaw
    var jaw = M(new THREE.SphereGeometry(0.16, 18, 14), mats.skin); jaw.position.set(0, -0.1, 0.02); jaw.scale.set(0.92, 0.8, 0.95); headG.add(jaw);

    if (fullHelm) {
      buildKnightHelm(headG, mats, spec);
    } else {
      buildFace(headG, mats, spec, t);
      addHair(headG, t.hair || "short", mats.hair);
      if (helm === "open" || helm === "crest") {
        var band = M(new THREE.TorusGeometry(0.215, 0.028, 10, 28), mats.armorHi);
        band.rotation.x = Math.PI / 2; band.position.y = 0.12; headG.add(band);
        var bandT = M(new THREE.TorusGeometry(0.215, 0.01, 8, 28), mats.trim); bandT.rotation.x = Math.PI / 2; bandT.position.y = 0.155; headG.add(bandT);
      }
      if (helm === "crest") addPlume(headG, mats);
      // ears for non-helmless races handled in buildFace
    }

    // ---- arms ----
    var sx = 0.28 * bw, sy = 1.43;
    var armL = makeArm(mats, true); armL.position.set(-sx, sy, 0); armL.rotation.z = 0.1; rig.add(armL);
    var armR = makeArm(mats, false); armR.position.set(sx, sy, 0); armR.rotation.z = -0.1; rig.add(armR);
    rig.userData.armL = armL; rig.userData.armR = armR;

    // ---- cloak ----
    if (spec.colors.cloak) {
      var cg = new THREE.PlaneGeometry(0.62 * bw, 1.15, 8, 12);
      var pos = cg.attributes.position;
      for (var i = 0; i < pos.count; i++) {
        var x = pos.getX(i), yy = pos.getY(i);
        pos.setZ(i, -Math.cos(x * 3.0) * 0.10 - 0.05 - (0.5 - (yy / 1.15)) * 0.02);
      }
      cg.computeVertexNormals(); R.disposables.push(cg);
      var cloak = new THREE.Mesh(cg, mats.cloak); cloak.castShadow = true;
      cloak.position.set(0, 1.30, -0.26 * bw); rig.add(cloak); rig.userData.cloak = cloak;
      var clasp = M(new THREE.SphereGeometry(0.045, 12, 10), mats.trim); clasp.position.set(0, 1.5, -0.02); rig.add(clasp);
    }

    // ---- gear ----
    addArmorGear(rig, spec, mats, torso, bw);
    addHelmetGear(headG, helmetGear, spec, mats, fullHelm);
    addWeapon(rig.userData.armR, spec, mats);

    return rig;
  }

  function buildKnightHelm(headG, mats, spec) {
    // sallet-style: rounded dome + tail + face guard with a single dark eye slit + keel ridge
    var dome = M(new THREE.SphereGeometry(0.235, 26, 18, 0, Math.PI * 2, 0, Math.PI * 0.66), mats.armorHi);
    dome.position.y = 0.02; dome.scale.set(1, 1.02, 1.12); headG.add(dome);
    // keel ridge along the top
    var keel = M(new THREE.BoxGeometry(0.03, 0.06, 0.42), mats.armor); keel.position.set(0, 0.16, -0.02); headG.add(keel);
    // face guard
    var guard = M(new THREE.SphereGeometry(0.225, 24, 16, 0, Math.PI * 2, Math.PI * 0.42, Math.PI * 0.4), mats.armor);
    guard.position.set(0, -0.02, 0.0); guard.scale.set(1, 1, 1.16); headG.add(guard);
    // brow ridge + nasal
    var brow = M(new THREE.TorusGeometry(0.2, 0.022, 8, 24, Math.PI), mats.armorHi); brow.rotation.x = Math.PI; brow.position.set(0, 0.06, 0.16); headG.add(brow);
    var nasal = M(new THREE.BoxGeometry(0.04, 0.16, 0.05), mats.armor); nasal.position.set(0, -0.04, 0.21); headG.add(nasal);
    // dark eye slit (no glowing dots)
    var slit = M(new THREE.BoxGeometry(0.32, 0.035, 0.04), mats.dark); slit.position.set(0, 0.02, 0.215); headG.add(slit);
    // gold trim band
    var tb = M(new THREE.TorusGeometry(0.21, 0.012, 8, 28), mats.trim); tb.rotation.x = Math.PI / 2; tb.position.y = -0.05; headG.add(tb);
  }

  function buildFace(headG, mats, spec, t) {
    var eyeR = t.eyeShape === "round" ? 0.05 : t.eyeShape === "sharp" ? 0.035 : 0.044;
    var bL = M(new THREE.SphereGeometry(0.05, 14, 10), mats.eyeWhite); bL.position.set(-0.082, 0.0, 0.185); bL.scale.set(1, 0.78, 0.55); headG.add(bL);
    var bR = bL.clone(); bR.position.x = 0.082; headG.add(bR);
    var iL = M(new THREE.SphereGeometry(eyeR, 14, 12), mats.eye); iL.position.set(-0.082, 0.0, 0.205); iL.scale.set(1, 1.05, 0.5); headG.add(iL);
    var iR = iL.clone(); iR.position.x = 0.082; headG.add(iR);
    var pL = M(new THREE.SphereGeometry(0.016, 8, 8), mats.dark); pL.position.set(-0.082, 0.0, 0.22); headG.add(pL);
    var pR = pL.clone(); pR.position.x = 0.082; headG.add(pR);
    // brows
    var ebL = M(new THREE.BoxGeometry(0.08, 0.016, 0.02), mats.brow); ebL.position.set(-0.082, 0.08, 0.2); ebL.rotation.z = 0.1; headG.add(ebL);
    var ebR = ebL.clone(); ebR.position.x = 0.082; ebR.rotation.z = -0.1; headG.add(ebR);
    // nose
    var nose = M(new THREE.ConeGeometry(0.03, 0.08, 8), mats.skin); nose.rotation.x = Math.PI / 2.1; nose.position.set(0, -0.03, 0.21); headG.add(nose);
    // mouth / face variant
    if (t.face === "smile") {
      var sm = M(new THREE.TorusGeometry(0.05, 0.012, 8, 14, Math.PI), mats.mouth); sm.rotation.z = Math.PI; sm.position.set(0, -0.11, 0.2); headG.add(sm);
    } else {
      var mo = M(new THREE.BoxGeometry(0.07, 0.014, 0.02), mats.mouth); mo.position.set(0, -0.115, 0.2); headG.add(mo);
    }
    if (t.face === "scar") { var sc = M(new THREE.BoxGeometry(0.012, 0.11, 0.02), mats.mouth); sc.position.set(0.07, 0.0, 0.205); sc.rotation.z = 0.3; headG.add(sc); }
    if (t.face === "warpaint") {
      var wp = new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.7 }); R.disposables.push(wp);
      var wL = M(new THREE.BoxGeometry(0.07, 0.018, 0.02), wp); wL.position.set(-0.082, -0.05, 0.2); headG.add(wL);
      var wR = wL.clone(); wR.position.x = 0.082; headG.add(wR);
    }
    // race traits
    if (t.race === "elf" || t.race === "fae") {
      var earL = M(new THREE.ConeGeometry(0.045, 0.17, 8), mats.skin); earL.position.set(-0.2, 0.04, 0); earL.rotation.set(0, 0.3, Math.PI / 2.1); headG.add(earL);
      var earR = earL.clone(); earR.position.x = 0.2; earR.rotation.set(0, -0.3, -Math.PI / 2.1); headG.add(earR);
    } else {
      var eaL = M(new THREE.SphereGeometry(0.035, 10, 8), mats.skin); eaL.position.set(-0.2, -0.01, 0.02); headG.add(eaL);
      var eaR = eaL.clone(); eaR.position.x = 0.2; headG.add(eaR);
    }
    if (t.race === "orc") {
      var tu = new THREE.MeshStandardMaterial({ color: 0xf3ecd6, roughness: 0.5 }); R.disposables.push(tu);
      var tL = M(new THREE.ConeGeometry(0.02, 0.08, 6), tu); tL.position.set(-0.05, -0.15, 0.17); tL.rotation.x = Math.PI; headG.add(tL);
      var tR = tL.clone(); tR.position.x = 0.05; headG.add(tR);
    }
    if (t.race === "dwarf") {
      var beard = M(new THREE.SphereGeometry(0.17, 18, 14, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.5), mats.hair);
      beard.position.set(0, -0.13, 0.05); beard.scale.set(1, 1.4, 0.85); headG.add(beard);
    }
  }

  function addHair(headG, style, hairMat) {
    if (style === "shaved") return;
    if (style === "mohawk") { var mh = M(new THREE.BoxGeometry(0.05, 0.17, 0.34), hairMat); mh.position.set(0, 0.2, -0.01); headG.add(mh); return; }
    var cap = M(new THREE.SphereGeometry(0.225, 22, 16, 0, Math.PI * 2, 0, Math.PI * 0.56), hairMat); cap.position.y = 0.04; cap.scale.set(1.03, 1, 1.05); headG.add(cap);
    if (style === "long") { var back = M(new THREE.BoxGeometry(0.34, 0.36, 0.16), hairMat); back.position.set(0, -0.08, -0.15); headG.add(back); }
    if (style === "braids") { var brL = M(new THREE.CapsuleGeometry(0.035, 0.24, 4, 8), hairMat); brL.position.set(-0.2, -0.16, 0.0); headG.add(brL); var brR = brL.clone(); brR.position.x = 0.2; headG.add(brR); }
  }
  function addPlume(headG, mats) {
    var p = M(new THREE.BoxGeometry(0.04, 0.16, 0.32), mats.trim); p.position.set(0, 0.28, -0.02); headG.add(p);
  }

  function makeArm(mats, left) {
    var g = new THREE.Group();
    var paul = M(new THREE.SphereGeometry(0.078, 14, 12), mats.armorHi); paul.position.y = 0.0; g.add(paul);
    var upper = M(new THREE.CapsuleGeometry(0.056, 0.26, 6, 14), mats.armor); upper.position.y = -0.2; g.add(upper);
    var elbow = M(new THREE.SphereGeometry(0.06, 14, 12), mats.armorHi); elbow.position.y = -0.37; g.add(elbow);
    var fore = M(new THREE.CapsuleGeometry(0.05, 0.24, 6, 14), mats.armorDk); fore.position.y = -0.54; g.add(fore);
    var hand = M(new THREE.SphereGeometry(0.062, 14, 12), mats.leather); hand.position.y = -0.72; g.add(hand);
    g.userData.hand = hand; return g;
  }
  function makeLeg(mats) {
    var g = new THREE.Group();
    var thigh = M(new THREE.CapsuleGeometry(0.1, 0.3, 6, 12), mats.armorDk); thigh.position.y = -0.18; g.add(thigh);
    var knee = M(new THREE.SphereGeometry(0.092, 14, 12), mats.armorHi); knee.position.y = -0.4; g.add(knee);
    var shin = M(new THREE.CapsuleGeometry(0.082, 0.3, 6, 12), mats.armor); shin.position.y = -0.6; g.add(shin);
    var boot = M(new THREE.BoxGeometry(0.17, 0.13, 0.3), mats.boot); boot.position.set(0, -0.8, 0.05); g.add(boot);
    var toe = M(new THREE.SphereGeometry(0.085, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.6), mats.boot); toe.rotation.x = -Math.PI / 2; toe.position.set(0, -0.84, 0.18); g.add(toe);
    g.userData.thigh = thigh; return g;
  }

  /* ---------- gear ---------- */
  function gMetal(g, fb) { var m = new THREE.MeshStandardMaterial({ color: col(g && g.metal, fb || "#cbd5e1"), roughness: 0.25, metalness: 1.0, envMapIntensity: 1.3 }); R.disposables.push(m); return m; }
  function gGem(g, fb) { var c = col(g && g.gem, fb || "#22d3ee"); var m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.12, metalness: 0.1, emissive: c.clone().multiplyScalar(0.55) }); R.disposables.push(m); return m; }

  function addWeapon(armR, spec, mats) {
    var w = spec.equipped && spec.equipped.weapon; if (!armR || !w) return;
    var metal = gMetal(w, "#dde7f2"), gem = gGem(w, "#9fd8ff"), id = w.id;
    function sword(scale) {
      var s = new THREE.Group();
      var bg = new THREE.CylinderGeometry(0.018, 0.05, 0.66, 4); R.disposables.push(bg);
      var blade = new THREE.Mesh(bg, metal); blade.castShadow = true; blade.position.y = 0.42; blade.rotation.y = Math.PI / 4; s.add(blade);
      var tip = M(new THREE.ConeGeometry(0.05, 0.12, 4), metal); tip.position.y = 0.78; tip.rotation.y = Math.PI / 4; s.add(tip);
      var guard = M(new THREE.BoxGeometry(0.24, 0.04, 0.05), mats.trim); guard.position.y = 0.08; s.add(guard);
      var grip = M(new THREE.CylinderGeometry(0.024, 0.024, 0.16, 8), mats.leather); grip.position.y = -0.02; s.add(grip);
      var pom = M(new THREE.SphereGeometry(0.04, 10, 8), gem); pom.position.y = -0.11; s.add(pom);
      s.scale.setScalar(scale || 1); return s;
    }
    if (id === "dualblade") {
      var s1 = sword(0.85); s1.position.set(0, -0.74, 0.06); s1.rotation.x = -0.18; armR.add(s1);
      var s2 = sword(0.85); s2.position.set(0.02, -0.74, -0.08); s2.rotation.set(-0.18, 0, 0.22); armR.add(s2);
    } else { var sw = sword(1.0); sw.position.set(0, -0.78, 0.06); sw.rotation.x = -0.14; armR.add(sw); }
  }
  function addHelmetGear(headG, id, spec, mats, fullHelm) {
    if (!id) return; var g = spec.equipped.helmet, metal = gMetal(g, "#fbbf24"), gem = gGem(g, "#38bdf8");
    if (id === "crown_of_flow") {
      var base = M(new THREE.CylinderGeometry(0.2, 0.22, 0.05, 14, 1, true), metal); base.position.y = 0.2; headG.add(base);
      for (var i = 0; i < 7; i++) { var a = (i / 7) * Math.PI * 2; var sp = M(new THREE.ConeGeometry(0.028, 0.11, 4), metal); sp.position.set(Math.cos(a) * 0.2, 0.28, Math.sin(a) * 0.2); headG.add(sp); }
      var jew = M(new THREE.OctahedronGeometry(0.045, 0), gem); jew.position.set(0, 0.25, 0.2); headG.add(jew);
    } else if (id === "tome_of_tomorrow") {
      var circ = M(new THREE.TorusGeometry(0.24, 0.02, 8, 26), gem); circ.rotation.x = Math.PI / 2; circ.position.y = 0.28; headG.add(circ);
    } else { var ring = M(new THREE.TorusGeometry(0.22, 0.022, 8, 22), metal); ring.rotation.x = Math.PI / 2; ring.position.y = 0.2; headG.add(ring); }
  }
  function addArmorGear(rig, spec, mats, torso, bw) {
    var a = spec.equipped && spec.equipped.armor; if (!a) return;
    if (a.id === "moonplate_vest") {
      var c = col(a.gem, "#c4b5fd"); var gm = new THREE.MeshStandardMaterial({ color: c, roughness: 0.3, metalness: 0.6, emissive: c.clone().multiplyScalar(0.4), envMapIntensity: 1.2 }); R.disposables.push(gm);
      var v = M(new THREE.SphereGeometry(0.3 * bw, 18, 14, 0, Math.PI * 2, 0, Math.PI * 0.6), gm); v.position.set(0, 0.02, 0.16 * bw); v.scale.set(1, 1.15, 0.55); torso.add(v);
    }
  }

  /* ---------- pet ---------- */
  function buildPet(spec) {
    var p = spec.equipped && spec.equipped.pet; if (!p) return null;
    var g = new THREE.Group(); var c = col(p.gem, "#c084fc");
    var bm = new THREE.MeshStandardMaterial({ color: c, roughness: 0.5, metalness: 0.2, emissive: c.clone().multiplyScalar(0.22), envMapIntensity: 0.8 }); R.disposables.push(bm);
    var body = M(new THREE.SphereGeometry(0.12, 18, 14), bm); g.add(body);
    if (p.id === "study_owl") {
      var e1 = M(new THREE.ConeGeometry(0.035, 0.07, 4), bm); e1.position.set(-0.06, 0.12, 0); g.add(e1); var e2 = e1.clone(); e2.position.x = 0.06; g.add(e2);
      var em = new THREE.MeshStandardMaterial({ color: 0xfff3c4, emissive: 0x886600, roughness: 0.4 }); R.disposables.push(em);
      var eL = M(new THREE.SphereGeometry(0.045, 12, 10), em); eL.position.set(-0.045, 0.02, 0.095); g.add(eL); var eR = eL.clone(); eR.position.x = 0.045; g.add(eR);
    } else if (p.id === "clockwork_fox") {
      var f1 = M(new THREE.ConeGeometry(0.04, 0.09, 4), bm); f1.position.set(-0.065, 0.12, 0); g.add(f1); var f2 = f1.clone(); f2.position.x = 0.065; g.add(f2);
      var sn = M(new THREE.ConeGeometry(0.045, 0.11, 8), bm); sn.rotation.x = Math.PI / 2; sn.position.set(0, -0.02, 0.13); g.add(sn);
    } else {
      var wm = new THREE.MeshStandardMaterial({ color: lighten(p.gem || "#c084fc", 0.1), roughness: 0.4, side: THREE.DoubleSide, transparent: true, opacity: 0.85 }); R.disposables.push(wm);
      var wL = M(new THREE.CircleGeometry(0.11, 12, 0, Math.PI), wm); wL.position.set(-0.09, 0.04, 0); wL.rotation.y = 0.6; g.add(wL); var wR = wL.clone(); wR.position.x = 0.09; wR.rotation.y = -0.6; g.add(wR);
    }
    g.scale.setScalar(0.95); return g;
  }

  /* ===================== MOUNTS ===================== */
  function buildMount(spec) {
    var mt = spec.mount; if (!mt) return null;
    var id = mt.id || "", cs = mt.colors || ["#6b5640", "#caa46a", "#fbbf24"];
    function s(o) { var m = new THREE.MeshStandardMaterial(o); R.disposables.push(m); return m; }
    var body = s({ color: col(cs[0]), roughness: 0.7, metalness: 0.06, envMapIntensity: 0.5 });
    var acc = s({ color: col(cs[1]), roughness: 0.6, metalness: 0.15, envMapIntensity: 0.5 });
    var det = s({ color: col(cs[2]), roughness: 0.3, metalness: 0.6, emissive: col(cs[2]).multiplyScalar(0.12), envMapIntensity: 1.0 });
    var g = new THREE.Group();

    if (id === "void_skiff") {
      var hull = M(new THREE.CapsuleGeometry(0.34, 1.2, 8, 18), acc); hull.rotation.z = Math.PI / 2; hull.scale.set(1, 1, 0.45); hull.position.y = 0.55; g.add(hull);
      var deck = M(new THREE.BoxGeometry(1.3, 0.06, 0.52), det); deck.position.y = 0.72; g.add(deck);
      var glow = M(new THREE.SphereGeometry(0.55, 18, 10, 0, Math.PI * 2, Math.PI * 0.55, Math.PI * 0.45), det); glow.position.y = 0.42; glow.scale.set(1.35, 1, 0.7); g.add(glow);
      g.userData.skiff = true; g.userData.seatY = 0.78; g.userData.stand = true; return g;
    }

    var panther = id === "phase_panther_reins", wolf = id === "wolf_reins";
    var bodyY = 0.92, len = panther ? 0.5 : 0.55;
    // barrel body
    var torso = M(new THREE.CapsuleGeometry(panther ? 0.26 : 0.3, len, 8, 16), body);
    torso.rotation.z = Math.PI / 2; torso.position.set(0, bodyY, 0); torso.scale.set(1, 1, 0.82); g.add(torso);
    var chest = M(new THREE.SphereGeometry(0.31, 16, 14), body); chest.position.set(0.5, bodyY - 0.02, 0); chest.scale.set(0.85, 0.95, 0.82); g.add(chest);
    var haunch = M(new THREE.SphereGeometry(0.33, 16, 14), body); haunch.position.set(-0.5, bodyY + 0.02, 0); haunch.scale.set(0.9, 1, 0.85); g.add(haunch);

    // legs (two-segment) + hooves
    var legs = [];
    function leg(x, z, front) {
      var lg = new THREE.Group(); lg.position.set(x, bodyY - 0.05, z);
      var up = M(new THREE.CapsuleGeometry(0.075, 0.3, 5, 10), body); up.position.y = -0.2; lg.add(up);
      var lo = M(new THREE.CapsuleGeometry(0.055, 0.32, 5, 10), body); lo.position.y = -0.52; lg.add(lo);
      var hoof = M(new THREE.CylinderGeometry(0.07, 0.08, 0.1, 8), det); hoof.position.y = -0.72; lg.add(hoof);
      g.add(lg); legs.push(lg); return lg;
    }
    leg(0.42, 0.2, true); leg(0.42, -0.2, true); leg(-0.42, 0.2, false); leg(-0.42, -0.2, false);
    g.userData.legs = legs;

    // neck + head
    var neck = M(new THREE.CapsuleGeometry(0.13, 0.42, 6, 12), body); neck.position.set(0.62, bodyY + 0.32, 0); neck.rotation.z = -0.6; g.add(neck);
    var head = M(new THREE.CapsuleGeometry(0.12, 0.22, 6, 12), body); head.position.set(0.92, bodyY + 0.56, 0); head.rotation.z = -1.15; g.add(head);
    var muzzle = M(new THREE.CapsuleGeometry(0.082, 0.16, 6, 10), body); muzzle.position.set(1.06, bodyY + 0.44, 0); muzzle.rotation.z = -1.35; g.add(muzzle);
    var earL = M(new THREE.ConeGeometry(0.05, 0.13, 6), body); earL.position.set(0.84, bodyY + 0.74, 0.07); g.add(earL); var earR = earL.clone(); earR.position.z = -0.07; g.add(earR);
    var em = s({ color: 0x10131a, roughness: 0.4 });
    var eL = M(new THREE.SphereGeometry(0.03, 10, 8), em); eL.position.set(0.98, bodyY + 0.6, 0.1); g.add(eL); var eR = eL.clone(); eR.position.z = -0.1; g.add(eR);

    // mane + tail
    if (!panther) {
      for (var i = 0; i < 6; i++) { var mh = M(new THREE.BoxGeometry(0.05, 0.16, 0.08), acc); var f = i / 5; mh.position.set(0.5 + f * 0.36, bodyY + 0.42 + f * 0.12, 0); mh.rotation.z = -0.6; g.add(mh); }
    }
    var tail = M(new THREE.CapsuleGeometry(0.06, 0.42, 5, 10), acc); tail.position.set(-0.82, bodyY + 0.02, 0); tail.rotation.z = 0.9; g.add(tail);

    // saddle
    var saddle = M(new THREE.SphereGeometry(0.27, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), det); saddle.position.set(-0.04, bodyY + 0.28, 0); saddle.scale.set(1, 0.55, 0.95); g.add(saddle);

    // variant flourishes
    if (id === "unicorn_sigil") { var horn = M(new THREE.ConeGeometry(0.045, 0.36, 12), det); horn.position.set(1.0, bodyY + 0.82, 0); horn.rotation.z = -0.45; g.add(horn); }
    if (id === "astral_stag_tack") {
      [-1, 1].forEach(function (sgn) {
        var a1 = M(new THREE.CylinderGeometry(0.02, 0.03, 0.32, 6), det); a1.position.set(0.82, bodyY + 0.88, 0.08 * sgn); a1.rotation.z = 0.3 * sgn; g.add(a1);
        var a2 = M(new THREE.CylinderGeometry(0.014, 0.02, 0.18, 6), det); a2.position.set(0.76, bodyY + 1.04, 0.16 * sgn); a2.rotation.z = 0.8 * sgn; g.add(a2);
      });
    }
    if (id === "griffin_saddle") {
      g.userData.wing = [];
      [-1, 1].forEach(function (sgn) {
        var wm = s({ color: col(cs[1]), roughness: 0.6, side: THREE.DoubleSide });
        var wing = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.55, 4, 3), wm); R.disposables.push(wing.geometry);
        wing.castShadow = true; wing.position.set(-0.1, bodyY + 0.45, 0.28 * sgn); wing.rotation.set(0, 0.5 * sgn, 0.55); g.add(wing); g.userData.wing.push(wing);
      });
    }
    g.userData.seatY = bodyY + 0.42; g.userData.stand = false; return g;
  }

  /* ===================== assemble ===================== */
  function specSig(s) {
    var e = s.equipped || {}; function gid(x) { return x ? (x.id + ":" + x.tier) : "-"; }
    return [s.cls, s.traits.race, s.traits.body, s.traits.hair, s.traits.helm, s.traits.face, s.traits.eyeShape,
      s.colors.skin, s.colors.hair, s.colors.eye, s.colors.armorMid, s.colors.armorHigh, s.colors.armorDark, s.colors.accent, s.colors.cloak,
      gid(e.weapon), gid(e.helmet), gid(e.armor), gid(e.pet), s.mount ? (s.mount.id + ":" + s.mount.tier) : "-"].join("|");
  }
  function rebuild(spec) {
    if (R.heroRig) { R.root.remove(R.heroRig); disposeGroup(R.heroRig); }
    if (R.mountGroup) { R.root.remove(R.mountGroup); disposeGroup(R.mountGroup); }
    if (R.petGroup) { R.root.remove(R.petGroup); disposeGroup(R.petGroup); }
    flush(); R.heroRig = R.mountGroup = R.petGroup = null;

    var hero = buildHero(spec);
    var mount = spec.mount ? buildMount(spec) : null;   // null spec.mount => NEVER a horse
    var pet = buildPet(spec);
    R.mounted = !!mount;

    if (mount) {
      R.root.add(mount); R.mountGroup = mount;
      hero.position.y = mount.userData.seatY - 0.86;
      hero.position.x = mount.userData.stand ? 0 : 0.04;
      if (!mount.userData.stand) {
        if (hero.userData.legL) { hero.userData.legL.rotation.x = 0.5; hero.userData.legL.rotation.z = 0.2; }
        if (hero.userData.legR) { hero.userData.legR.rotation.x = 0.5; hero.userData.legR.rotation.z = -0.2; }
      }
      if (R.pedestal) R.pedestal.visible = false;
    } else { hero.position.y = 0; if (R.pedestal) R.pedestal.visible = true; }
    R.root.add(hero); R.heroRig = hero;
    if (pet) { R.root.add(pet); R.petGroup = pet; }
    frame();
  }
  function frame() {
    var cam = R.camera;
    if (R.mode === "studio") {
      if (R.mounted) { cam.position.set(0, 1.55, 5.6); R.lookY = 1.2; }
      else { cam.position.set(0, 1.18, 3.9); R.lookY = 1.0; }
    } else {
      if (R.mounted) { cam.position.set(0, 1.5, 5.2); R.lookY = 1.15; }
      else { cam.position.set(0, 1.35, 3.05); R.lookY = 1.2; }
    }
    cam.lookAt(0, R.lookY, 0);
  }

  FH3D.sync = function (spec) {
    if (!FH3D.available) { if (!initEngine()) return; }
    if (!spec) return; R.running = !!spec.running;
    try { var sg = specSig(spec); if (sg !== R.sig) { R.sig = sg; rebuild(spec); } startLoop(); }
    catch (e) { console.warn("[FH3D] sync failed:", e); }
  };

  /* ---------- attach / move canvas ---------- */
  function attach(container, mode) {
    if (!container) return;
    if (!FH3D.available) { if (!initEngine()) return; }
    var canvas = R.renderer.domElement;
    try { if (getComputedStyle(container).position === "static") container.style.position = "relative"; } catch (e) {}
    if (canvas.parentNode !== container) container.appendChild(canvas);
    R.container = container; R.mode = mode || "home";
    container.classList.add("fh3d-host");
    resize(); frame(); observe(container); startLoop();
  }
  FH3D.attachHome = function (el) { attach(el, "home"); };
  FH3D.attachStudio = function (el) { attach(el, "studio"); };
  FH3D.detachStudio = function (homeEl) { if (homeEl) attach(homeEl, "home"); };

  function resize() {
    if (!R.container || !R.renderer) return;
    var w = R.container.clientWidth || 120, h = R.container.clientHeight || 120;
    R.renderer.setSize(w, h, false); R.camera.aspect = w / h; R.camera.updateProjectionMatrix();
  }
  function observe(container) {
    if (R.ro) { try { R.ro.disconnect(); } catch (e) {} }
    if (window.ResizeObserver) { R.ro = new ResizeObserver(function () { resize(); }); R.ro.observe(container); }
    if (R.io) { try { R.io.disconnect(); } catch (e) {} }
    if (window.IntersectionObserver) {
      R.io = new IntersectionObserver(function (en) { var vis = en[0] && en[0].isIntersecting; if (vis && !document.hidden) startLoop(); else stopLoop(); }, { threshold: 0.01 });
      R.io.observe(container);
    }
  }

  /* ---------- pointer drag ---------- */
  function wirePointer(canvas) {
    canvas.addEventListener("pointerdown", function (e) { R.dragging = true; R.autoSpin = false; R.lastPointerX = e.clientX; try { canvas.setPointerCapture(e.pointerId); } catch (x) {} });
    canvas.addEventListener("pointermove", function (e) { if (!R.dragging) return; var dx = e.clientX - R.lastPointerX; R.lastPointerX = e.clientX; R.targetYaw += dx * 0.012; });
    function up() { R.dragging = false; clearTimeout(R._t); R._t = setTimeout(function () { R.autoSpin = true; }, 2800); }
    canvas.addEventListener("pointerup", up); canvas.addEventListener("pointercancel", up);
    canvas.addEventListener("pointerleave", function () { if (R.dragging) up(); });
  }

  /* ---------- loop ---------- */
  function startLoop() { if (R.raf) return; if (document.hidden) return; R.last = performance.now(); R.raf = requestAnimationFrame(tick); }
  function stopLoop() { if (R.raf) { cancelAnimationFrame(R.raf); R.raf = 0; } }
  function tick(now) {
    R.raf = requestAnimationFrame(tick);
    var dt = Math.min(0.05, (now - R.last) / 1000); R.last = now; R.clock += dt; var t = R.clock;
    if (R.autoSpin && !R.dragging) R.targetYaw += dt * (R.mode === "studio" ? 0.32 : 0.5);
    R.yaw += (R.targetYaw - R.yaw) * Math.min(1, dt * 8);
    if (R.root) R.root.rotation.y = R.yaw;
    var sp = R.running ? 2.2 : 1.0, amp = R.running ? 1.4 : 1.0;
    if (R.heroRig) {
      var h = R.heroRig, bob = Math.sin(t * 2.0 * sp) * 0.016 * amp;
      if (h.userData.torso) { h.userData.torso.position.y = 1.18 + bob; h.userData.torso.rotation.y = Math.sin(t * 1.0) * 0.04; }
      if (h.userData.headG) { h.userData.headG.position.y = 1.66 + bob; h.userData.headG.rotation.y = Math.sin(t * 0.7) * 0.1; h.userData.headG.rotation.x = Math.sin(t * 1.2) * 0.025; }
      if (!R.mounted) {
        if (h.userData.armL) h.userData.armL.rotation.x = Math.sin(t * 1.5 * sp) * 0.1 * amp;
        if (h.userData.armR) h.userData.armR.rotation.x = -Math.sin(t * 1.5 * sp) * 0.1 * amp;
      }
      if (h.userData.cloak) { h.userData.cloak.rotation.x = Math.sin(t * 1.3) * 0.05 + 0.04; h.userData.cloak.position.y = 1.30 + bob; }
    }
    if (R.mountGroup) {
      var mg = R.mountGroup;
      if (mg.userData.skiff) { mg.position.y = Math.sin(t * 1.4) * 0.05; mg.rotation.z = Math.sin(t * 0.9) * 0.025; if (R.heroRig) R.heroRig.position.y = (mg.userData.seatY - 0.86) + Math.sin(t * 1.4) * 0.05; }
      else {
        var gallop = R.running, gy = gallop ? Math.abs(Math.sin(t * 6)) * 0.06 : Math.sin(t * 1.8) * 0.02;
        mg.position.y = gy; if (R.heroRig) R.heroRig.position.y = (mg.userData.seatY - 0.86) + gy;
        var legs = mg.userData.legs || [];
        for (var i = 0; i < legs.length; i++) legs[i].rotation.x = Math.sin(t * (gallop ? 8 : 2.2) + (i < 2 ? 0 : Math.PI)) * (gallop ? 0.5 : 0.13);
        if (mg.userData.wing) { var fl = Math.sin(t * 3) * 0.4; mg.userData.wing[0].rotation.z = 0.55 + fl; mg.userData.wing[1].rotation.z = 0.55 + fl; }
      }
    }
    if (R.petGroup) { var pa = t * 0.8; R.petGroup.position.set(Math.cos(pa) * 0.95, 1.55 + Math.sin(t * 2) * 0.08, Math.sin(pa) * 0.6 - 0.2); R.petGroup.rotation.y = -pa + Math.PI / 2; }
    if (R.renderer && R.scene && R.camera) { try { R.renderer.render(R.scene, R.camera); } catch (e) { stopLoop(); } }
  }

  /* ---------- modal observer: both directions ---------- */
  FH3D.wireModal = function (modalId, studioHostId, homeHostId) {
    var modal = document.getElementById(modalId); if (!modal || !window.MutationObserver) return;
    var obs = new MutationObserver(function () {
      var hidden = modal.hasAttribute("hidden");
      if (hidden) { var home = document.getElementById(homeHostId); if (home) FH3D.attachHome(home); }
      else { var studio = document.getElementById(studioHostId); if (studio) FH3D.attachStudio(studio); }
    });
    obs.observe(modal, { attributes: true, attributeFilter: ["hidden"] });
  };

  FH3D._R = R;
})();
