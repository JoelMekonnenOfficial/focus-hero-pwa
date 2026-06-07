/* ============================================================================
 * Focus Hero — FH3D v3 : clean chibi 3D character / mount / gear  (v8.8.2)
 * Pure renderer (reads a plain spec via FH3D.sync; never touches app state).
 * v3: cohesive chibi proportions (big head, compact connected body, small
 * shoulders/hands — no more bulbous pauldrons / pot torso / floating gaps),
 * soft toon-ish PBR + IBL, cute face, redesigned mounts.
 * SPEC: { cls, className, palette, level, running,
 *   colors:{skin,hair,eye,armorMid,armorHigh,armorDark,accent,cloak},
 *   traits:{race,body,hair,helm,face,eyeShape},
 *   equipped:{weapon,helmet,armor,pet}, mount:null|{id,tier,colors} }
 * ==========================================================================*/
(function () {
  "use strict";
  var FH3D = (window.FH3D = window.FH3D || {});
  FH3D.available = false;
  FH3D.version = "fh3d-3.0";
  var THREE = window.THREE;

  function webglSupported() {
    try { if (!THREE) return false; var c = document.createElement("canvas");
      return !!(c.getContext("webgl2") || c.getContext("webgl") || c.getContext("experimental-webgl")); }
    catch (e) { return false; }
  }
  function col(hex, fb) { try { return new THREE.Color(hex || fb || "#888"); } catch (e) { return new THREE.Color(fb || "#888"); } }
  function darken(hex, a) { var c = col(hex); c.offsetHSL(0, 0, -a); return c; }
  function lighten(hex, a) { var c = col(hex); c.offsetHSL(0, 0, a); return c; }

  var R = {
    renderer: null, scene: null, camera: null, env: null,
    root: null, heroRig: null, mountGroup: null, petGroup: null, pedestal: null,
    disposables: [], raf: 0, last: 0, clock: 0,
    yaw: 0, targetYaw: 0, autoSpin: true, dragging: false, lastPointerX: 0,
    mode: "home", mounted: false, running: false, lookY: 0.95,
    sig: "", container: null, ro: null, io: null, initialized: false
  };

  /* ---------- engine ---------- */
  function initEngine() {
    if (R.initialized) return true;
    if (!webglSupported()) return false;
    try {
      var renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      if ("outputColorSpace" in renderer) renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1;
      var cs = renderer.domElement.style;
      cs.position = "absolute"; cs.left = "0"; cs.top = "0"; cs.width = "100%"; cs.height = "100%";
      cs.display = "block"; cs.borderRadius = "inherit"; cs.touchAction = "pan-y";
      renderer.domElement.className = "fh3d-canvas";
      renderer.domElement.setAttribute("aria-hidden", "true");

      var scene = new THREE.Scene();
      scene.background = makeBackdrop("#2b3c63", "#0c1020");
      R.env = makeEnv(renderer); scene.environment = R.env;

      var camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
      camera.position.set(0, 1.0, 4.0);

      var hemi = new THREE.HemisphereLight(0xdce8ff, 0x39322c, 0.75); scene.add(hemi);
      var key = new THREE.DirectionalLight(0xfff4e2, 2.3);
      key.position.set(2.8, 5.2, 3.6); key.castShadow = true;
      key.shadow.mapSize.set(2048, 2048);
      key.shadow.camera.near = 1; key.shadow.camera.far = 18;
      key.shadow.camera.left = -2.6; key.shadow.camera.right = 2.6;
      key.shadow.camera.top = 3; key.shadow.camera.bottom = -1.6;
      key.shadow.bias = -0.0007; key.shadow.normalBias = 0.03;
      scene.add(key);
      var fill = new THREE.DirectionalLight(0xa8c6ff, 0.55); fill.position.set(-3.6, 2, 1.6); scene.add(fill);
      var rim = new THREE.DirectionalLight(0xe6f2ff, 1.5); rim.position.set(-1.2, 2.6, -3.8); scene.add(rim);

      var root = new THREE.Group(); scene.add(root);

      var ped = new THREE.Group();
      var pedMat = new THREE.MeshStandardMaterial({ color: 0x2c3a5e, roughness: 0.6, metalness: 0.2, envMapIntensity: 0.7 });
      var pedTop = new THREE.MeshStandardMaterial({ color: 0x3f558c, roughness: 0.35, metalness: 0.35, envMapIntensity: 1.0 });
      var disc = new THREE.Mesh(new THREE.CylinderGeometry(0.78, 0.9, 0.12, 56), pedMat);
      disc.position.y = -0.06; disc.receiveShadow = true; ped.add(disc);
      var ring = new THREE.Mesh(new THREE.TorusGeometry(0.76, 0.03, 10, 56), pedTop);
      ring.rotation.x = Math.PI / 2; ring.position.y = 0.01; ped.add(ring);
      var floor = new THREE.Mesh(new THREE.CircleGeometry(2.2, 48), new THREE.ShadowMaterial({ opacity: 0.34 }));
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
    var grad = g.createRadialGradient(128, 88, 14, 128, 150, 240);
    grad.addColorStop(0, inner); grad.addColorStop(1, outer);
    g.fillStyle = grad; g.fillRect(0, 0, 256, 256);
    var t = new THREE.CanvasTexture(c); if ("colorSpace" in t) t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  function makeEnv(renderer) {
    try {
      var pmrem = new THREE.PMREMGenerator(renderer);
      var c = document.createElement("canvas"); c.width = 128; c.height = 64;
      var g = c.getContext("2d");
      var grad = g.createLinearGradient(0, 0, 0, 64);
      grad.addColorStop(0, "#eaf1ff"); grad.addColorStop(0.5, "#93a8cc"); grad.addColorStop(0.5, "#4a5468"); grad.addColorStop(1, "#222734");
      g.fillStyle = grad; g.fillRect(0, 0, 128, 64);
      g.fillStyle = "rgba(255,248,228,0.95)"; g.beginPath(); g.arc(36, 16, 11, 0, 7); g.fill();
      var tex = new THREE.CanvasTexture(c); tex.mapping = THREE.EquirectangularReflectionMapping;
      var rt = pmrem.fromEquirectangular(tex); tex.dispose(); pmrem.dispose(); return rt.texture;
    } catch (e) { return null; }
  }

  /* ---------- mesh helpers ---------- */
  function M(geo, mat, x, y, z) {
    var m = new THREE.Mesh(geo, mat); if (x !== undefined) m.position.set(x, y, z);
    m.castShadow = true; m.receiveShadow = true; R.disposables.push(geo); return m;
  }
  function disposeGroup(g) { if (!g) return; g.traverse(function (o) { if (o.geometry) o.geometry.dispose(); }); }
  function flush() { for (var i = 0; i < R.disposables.length; i++) { try { R.disposables[i].dispose(); } catch (e) {} } R.disposables.length = 0; }

  /* ---------- materials (soft, slightly toon) ---------- */
  function makeMats(spec) {
    var c = spec.colors, m = {};
    function s(o) { var mt = new THREE.MeshStandardMaterial(o); R.disposables.push(mt); return mt; }
    m.skin = s({ color: col(c.skin, "#e7b48c"), roughness: 0.74, metalness: 0.0, envMapIntensity: 0.35, flatShading: false });
    m.armor = s({ color: col(c.armorMid, "#465e80"), roughness: 0.42, metalness: 0.35, envMapIntensity: 0.85 });
    m.armorHi = s({ color: col(c.armorHigh, "#7e97bd"), roughness: 0.34, metalness: 0.45, envMapIntensity: 1.0 });
    m.armorDk = s({ color: col(c.armorDark, "#22304a"), roughness: 0.5, metalness: 0.3, envMapIntensity: 0.7 });
    m.trim = s({ color: col(c.accent, "#f6cb6e"), roughness: 0.3, metalness: 0.75, envMapIntensity: 1.2 });
    m.cloak = s({ color: col(c.cloak, "#3a5a9c"), roughness: 0.8, metalness: 0.0, envMapIntensity: 0.3, side: THREE.DoubleSide });
    m.hair = s({ color: col(c.hair, "#3a2417"), roughness: 0.72, metalness: 0.04, envMapIntensity: 0.35 });
    m.boot = s({ color: darken(c.armorDark || "#22304a", 0.02), roughness: 0.5, metalness: 0.25 });
    var eyeC = col(c.eye, "#6cc6ff");
    m.eye = s({ color: eyeC, roughness: 0.18, metalness: 0.0, emissive: eyeC.clone().multiplyScalar(0.18) });
    m.eyeWhite = s({ color: 0xfbfdff, roughness: 0.3 });
    m.dark = s({ color: 0x14181f, roughness: 0.45 });
    m.mouth = s({ color: 0x6a342f, roughness: 0.6 });
    m.white = s({ color: 0xf4f7ff, roughness: 0.5 });
    return m;
  }

  /* =====================================================================
   * CHIBI HERO  (feet at y=0; total height ~1.7; head is the hero of the silhouette)
   * ===================================================================== */
  function buildHero(spec) {
    var mats = makeMats(spec), t = spec.traits || {}, rig = new THREE.Group();
    var build = t.body || "balanced";
    var bw = build === "broad" ? 1.14 : build === "lean" ? 0.9 : 1.0;     // body width
    var hsc = build === "lean" ? 1.06 : build === "broad" ? 0.96 : 1.0;   // slight height nudge

    var HIP_Y = 0.42 * hsc;
    var BODY_CY = 0.70 * hsc;
    var SHOULD_Y = 0.92 * hsc;
    var HEAD_R = 0.40;
    var HEAD_Y = (1.04 * hsc) + HEAD_R * 0.78;   // head sits right on the body — no gap

    // ----- legs (short, stubby, close) -----
    var legL = makeLeg(mats, hsc); legL.position.set(-0.13 * bw, HIP_Y, 0); rig.add(legL);
    var legR = makeLeg(mats, hsc); legR.position.set(0.13 * bw, HIP_Y, 0); rig.add(legR);
    rig.userData.legL = legL; rig.userData.legR = legR;

    // ----- body group (smooth egg torso, connected to hips) -----
    var torso = new THREE.Group(); torso.position.y = BODY_CY; rig.add(torso); rig.userData.torso = torso;
    var bodyGeo = new THREE.CapsuleGeometry(0.30 * bw, 0.20, 8, 20);
    var body = M(bodyGeo, mats.armor); body.scale.set(1, 1.18, 0.9); torso.add(body);
    // chest plate highlight (subtle, sits flush)
    var chest = M(new THREE.SphereGeometry(0.27 * bw, 20, 16, 0, Math.PI * 2, 0, Math.PI * 0.62), mats.armorHi);
    chest.position.set(0, 0.06, 0.13 * bw); chest.scale.set(1, 1.0, 0.5); torso.add(chest);
    // belt
    var belt = M(new THREE.TorusGeometry(0.30 * bw, 0.035, 10, 26), mats.trim);
    belt.rotation.x = Math.PI / 2; belt.position.y = -0.16; belt.scale.set(1, 1, 0.9); torso.add(belt);
    // small class emblem
    var emblem = M(new THREE.OctahedronGeometry(0.055, 0), mats.trim);
    emblem.position.set(0, 0.04, 0.27 * bw); torso.add(emblem);
    // tiny rounded shoulder caps (NOT giant pauldrons) — flush with shoulders
    var shL = M(new THREE.SphereGeometry(0.12 * bw, 16, 12), mats.armorHi);
    shL.position.set(-0.26 * bw, 0.2, 0); shL.scale.set(1, 0.8, 1); torso.add(shL);
    var shR = shL.clone(); shR.position.x = 0.26 * bw; torso.add(shR);

    // ----- head (big, cute) -----
    var headG = new THREE.Group(); headG.position.y = HEAD_Y; rig.add(headG); rig.userData.headG = headG;
    var head = M(new THREE.SphereGeometry(HEAD_R, 30, 26), mats.skin); head.scale.set(1, 0.98, 0.96); headG.add(head);
    // little neck filler so head meets body with no gap
    var neck = M(new THREE.CylinderGeometry(0.13, 0.16, 0.16, 14), mats.skin); neck.position.y = -HEAD_R * 0.9; rig.add(neck); neck.position.y = SHOULD_Y + 0.04;

    var helm = t.helm || "open";
    var fullHelm = (helm === "closed");
    if (fullHelm) buildSoftHelm(headG, mats, HEAD_R);
    else {
      buildFace(headG, mats, spec, t, HEAD_R);
      addHair(headG, t.hair || "short", mats.hair, HEAD_R);
      if (helm === "crest") { var bandc = M(new THREE.TorusGeometry(HEAD_R * 0.96, 0.04, 10, 28), mats.trim); bandc.rotation.x = Math.PI / 2; bandc.position.y = HEAD_R * 0.32; headG.add(bandc); addPlume(headG, mats, HEAD_R); }
    }

    // ----- arms (short, slim, small hands) -----
    var armL = makeArm(mats, hsc); armL.position.set(-0.30 * bw, SHOULD_Y, 0); armL.rotation.z = 0.16; rig.add(armL);
    var armR = makeArm(mats, hsc); armR.position.set(0.30 * bw, SHOULD_Y, 0); armR.rotation.z = -0.16; rig.add(armR);
    rig.userData.armL = armL; rig.userData.armR = armR;

    // ----- cloak (small, tidy) -----
    if (spec.colors.cloak) {
      var cg = new THREE.PlaneGeometry(0.5 * bw, 0.72, 6, 8);
      var pos = cg.attributes.position;
      for (var i = 0; i < pos.count; i++) { var x = pos.getX(i); pos.setZ(i, -Math.cos(x * 3.4) * 0.07 - 0.03); }
      cg.computeVertexNormals(); R.disposables.push(cg);
      var cloak = new THREE.Mesh(cg, mats.cloak); cloak.castShadow = true;
      cloak.position.set(0, BODY_CY + 0.12, -0.24 * bw); rig.add(cloak); rig.userData.cloak = cloak;
      var clasp = M(new THREE.SphereGeometry(0.04, 12, 10), mats.trim); clasp.position.set(0, SHOULD_Y + 0.04, -0.02); rig.add(clasp);
    }

    // gear
    addArmorGear(rig, spec, mats, torso, bw);
    addHelmetGear(headG, spec, mats, HEAD_R);
    addWeapon(rig.userData.armR, spec, mats);
    return rig;
  }

  function makeLeg(mats, hsc) {
    var g = new THREE.Group();
    var thigh = M(new THREE.CapsuleGeometry(0.105, 0.12, 6, 12), mats.armorDk); thigh.position.y = -0.12; g.add(thigh);
    var shin = M(new THREE.CapsuleGeometry(0.095, 0.12, 6, 12), mats.boot); shin.position.y = -0.3; g.add(shin);
    var foot = M(new THREE.SphereGeometry(0.12, 14, 12), mats.boot); foot.position.set(0, -0.42, 0.05); foot.scale.set(1, 0.6, 1.35); g.add(foot);
    g.userData.thigh = thigh; return g;
  }
  function makeArm(mats, hsc) {
    var g = new THREE.Group();
    var up = M(new THREE.CapsuleGeometry(0.085, 0.18, 6, 12), mats.armor); up.position.y = -0.16; g.add(up);
    var hand = M(new THREE.SphereGeometry(0.1, 14, 12), mats.skin); hand.position.y = -0.34; g.add(hand);
    g.userData.hand = hand; return g;
  }

  function buildFace(headG, mats, spec, t, HR) {
    var z = HR * 0.92;
    var eyeR = t.eyeShape === "round" ? 0.075 : t.eyeShape === "sharp" ? 0.055 : 0.066;
    var ex = 0.15;
    // big cute eyes: white + iris + pupil + highlight
    var wL = M(new THREE.SphereGeometry(0.082, 18, 14), mats.eyeWhite); wL.position.set(-ex, 0.02, z * 0.86); wL.scale.set(0.85, 1, 0.55); headG.add(wL);
    var wR = wL.clone(); wR.position.x = ex; headG.add(wR);
    var iL = M(new THREE.SphereGeometry(eyeR, 18, 14), mats.eye); iL.position.set(-ex, 0.0, z * 0.93); iL.scale.set(1, 1, 0.6); headG.add(iL);
    var iR = iL.clone(); iR.position.x = ex; headG.add(iR);
    var pL = M(new THREE.SphereGeometry(eyeR * 0.5, 12, 10), mats.dark); pL.position.set(-ex, 0.0, z * 0.99); headG.add(pL);
    var pR = pL.clone(); pR.position.x = ex; headG.add(pR);
    var gL = M(new THREE.SphereGeometry(eyeR * 0.26, 8, 8), mats.white); gL.position.set(-ex + 0.03, 0.04, z * 1.02); headG.add(gL);
    var gR = gL.clone(); gR.position.x = ex + 0.03; headG.add(gR);
    // brows
    var brow = new THREE.MeshStandardMaterial({ color: darken(spec.colors.hair || "#3a2417", 0.02), roughness: 0.8 }); R.disposables.push(brow);
    var bL = M(new THREE.BoxGeometry(0.1, 0.022, 0.03), brow); bL.position.set(-ex, 0.13, z * 0.86); bL.rotation.z = 0.06; headG.add(bL);
    var bR = bL.clone(); bR.position.x = ex; bR.rotation.z = -0.06; headG.add(bR);
    // nose (tiny)
    var nose = M(new THREE.SphereGeometry(0.028, 10, 8), mats.skin); nose.position.set(0, -0.05, z); headG.add(nose);
    // mouth
    if (t.face === "smile") { var sm = M(new THREE.TorusGeometry(0.07, 0.018, 8, 16, Math.PI), mats.mouth); sm.rotation.z = Math.PI; sm.position.set(0, -0.16, z * 0.86); headG.add(sm); }
    else { var mo = M(new THREE.CapsuleGeometry(0.012, 0.07, 4, 8), mats.mouth); mo.rotation.z = Math.PI / 2; mo.position.set(0, -0.16, z * 0.86); headG.add(mo); }
    // race traits
    var race = t.race || "human";
    if (race === "elf" || race === "fae" || race === "demon" || /elf|fae|sprite/.test(race)) {
      var earL = M(new THREE.ConeGeometry(0.07, 0.26, 8), mats.skin); earL.position.set(-HR * 0.95, 0.06, 0); earL.rotation.set(0, 0.3, Math.PI / 2.0); headG.add(earL);
      var earR = earL.clone(); earR.position.x = HR * 0.95; earR.rotation.set(0, -0.3, -Math.PI / 2.0); headG.add(earR);
    } else {
      var eaL = M(new THREE.SphereGeometry(0.06, 12, 10), mats.skin); eaL.position.set(-HR * 0.96, -0.02, 0); eaL.scale.set(0.6, 1, 1); headG.add(eaL);
      var eaR = eaL.clone(); eaR.position.x = HR * 0.96; headG.add(eaR);
    }
    if (/orc|goblin|troll/.test(race)) {
      var tu = new THREE.MeshStandardMaterial({ color: 0xf4eed6, roughness: 0.5 }); R.disposables.push(tu);
      var tL = M(new THREE.ConeGeometry(0.03, 0.1, 6), tu); tL.position.set(-0.07, -0.2, z * 0.8); tL.rotation.x = Math.PI; headG.add(tL);
      var tR = tL.clone(); tR.position.x = 0.07; headG.add(tR);
    }
    if (/dwarf/.test(race)) { var beard = M(new THREE.SphereGeometry(0.3, 18, 14, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.5), mats.hair); beard.position.set(0, -0.16, 0.08); beard.scale.set(1, 1.3, 0.9); headG.add(beard); }
    if (/demon/.test(race)) { var hgM = mats.trim; var hL = M(new THREE.ConeGeometry(0.05, 0.2, 8), hgM); hL.position.set(-0.18, HR * 0.85, -0.05); hL.rotation.z = -0.3; headG.add(hL); var hR = hL.clone(); hR.position.x = 0.18; hR.rotation.z = 0.3; headG.add(hR); }
    if (/undead/.test(race)) { /* sunken eyes already dark; nothing extra */ }
  }

  function buildSoftHelm(headG, mats, HR) {
    var dome = M(new THREE.SphereGeometry(HR * 1.04, 26, 18, 0, Math.PI * 2, 0, Math.PI * 0.66), mats.armorHi);
    dome.position.y = HR * 0.04; headG.add(dome);
    var visor = M(new THREE.BoxGeometry(HR * 1.4, 0.07, 0.05), mats.dark); visor.position.set(0, 0.0, HR * 0.92); headG.add(visor);
    var band = M(new THREE.TorusGeometry(HR * 0.98, 0.03, 10, 28), mats.trim); band.rotation.x = Math.PI / 2; band.position.y = -HR * 0.18; headG.add(band);
    var slit = M(new THREE.BoxGeometry(HR * 1.0, 0.04, 0.03), mats.eye); slit.position.set(0, 0.02, HR * 0.95); headG.add(slit);
  }

  function addHair(headG, style, hairMat, HR) {
    if (style === "shaved" || style === "bald") return;
    if (style === "mohawk") { var mh = M(new THREE.BoxGeometry(0.09, HR * 0.7, HR * 1.5), hairMat); mh.position.set(0, HR * 0.7, -HR * 0.05); headG.add(mh); return; }
    var cap = M(new THREE.SphereGeometry(HR * 1.04, 24, 18, 0, Math.PI * 2, 0, Math.PI * 0.52), hairMat);
    cap.position.y = HR * 0.12; headG.add(cap);
    if (/long/.test(style)) { var back = M(new THREE.CapsuleGeometry(HR * 0.7, HR * 0.5, 6, 12), hairMat); back.position.set(0, -HR * 0.25, -HR * 0.55); back.scale.set(1, 1, 0.5); headG.add(back); }
    if (/braid/.test(style)) { var brL = M(new THREE.CapsuleGeometry(0.06, HR * 0.7, 5, 10), hairMat); brL.position.set(-HR * 0.85, -HR * 0.3, 0.05); headG.add(brL); var brR = brL.clone(); brR.position.x = HR * 0.85; headG.add(brR); }
  }
  function addPlume(headG, mats, HR) { var p = M(new THREE.CapsuleGeometry(0.05, HR * 0.7, 6, 10), mats.trim); p.position.set(0, HR * 1.0, -HR * 0.1); p.rotation.x = -0.3; headG.add(p); }

  /* ---------- gear ---------- */
  function gMetal(g, fb) { var m = new THREE.MeshStandardMaterial({ color: col(g && g.metal, fb || "#cbd5e1"), roughness: 0.3, metalness: 0.85, envMapIntensity: 1.2 }); R.disposables.push(m); return m; }
  function gGem(g, fb) { var c = col(g && g.gem, fb || "#22d3ee"); var m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.12, metalness: 0.1, emissive: c.clone().multiplyScalar(0.5) }); R.disposables.push(m); return m; }
  function addWeapon(armR, spec, mats) {
    var w = spec.equipped && spec.equipped.weapon; if (!armR || !w) return;
    var metal = gMetal(w, "#dde7f2"), gem = gGem(w, "#9fd8ff");
    var s = new THREE.Group();
    var blade = M(new THREE.CylinderGeometry(0.016, 0.04, 0.46, 4), metal); blade.position.y = 0.3; blade.rotation.y = Math.PI / 4; s.add(blade);
    var tip = M(new THREE.ConeGeometry(0.04, 0.1, 4), metal); tip.position.y = 0.57; tip.rotation.y = Math.PI / 4; s.add(tip);
    var guard = M(new THREE.BoxGeometry(0.18, 0.035, 0.04), mats.trim); guard.position.y = 0.06; s.add(guard);
    var grip = M(new THREE.CylinderGeometry(0.022, 0.022, 0.12, 8), mats.armorDk); grip.position.y = -0.02; s.add(grip);
    var pom = M(new THREE.SphereGeometry(0.035, 10, 8), gem); pom.position.y = -0.09; s.add(pom);
    s.position.set(0, -0.36, 0.04); s.rotation.x = -0.12; armR.add(s);
  }
  function addHelmetGear(headG, spec, mats, HR) {
    var g = spec.equipped && spec.equipped.helmet; if (!g) return;
    var metal = gMetal(g, "#f6cb6e"), gem = gGem(g, "#38bdf8");
    if (g.id === "crown_of_flow") {
      var base = M(new THREE.CylinderGeometry(HR * 0.85, HR * 0.92, 0.06, 14, 1, true), metal); base.position.y = HR * 0.7; headG.add(base);
      for (var i = 0; i < 7; i++) { var a = (i / 7) * Math.PI * 2; var sp = M(new THREE.ConeGeometry(0.04, 0.14, 4), metal); sp.position.set(Math.cos(a) * HR * 0.85, HR * 0.82, Math.sin(a) * HR * 0.85); headG.add(sp); }
      var jew = M(new THREE.OctahedronGeometry(0.06, 0), gem); jew.position.set(0, HR * 0.78, HR * 0.85); headG.add(jew);
    } else { var ring = M(new THREE.TorusGeometry(HR * 0.9, 0.03, 8, 22), metal); ring.rotation.x = Math.PI / 2; ring.position.y = HR * 0.62; headG.add(ring); }
  }
  function addArmorGear(rig, spec, mats, torso, bw) {
    var a = spec.equipped && spec.equipped.armor; if (!a) return;
    if (a.id === "moonplate_vest") {
      var c = col(a.gem, "#c4b5fd"); var gm = new THREE.MeshStandardMaterial({ color: c, roughness: 0.3, metalness: 0.4, emissive: c.clone().multiplyScalar(0.4), envMapIntensity: 1.1 }); R.disposables.push(gm);
      var v = M(new THREE.SphereGeometry(0.29 * bw, 18, 14, 0, Math.PI * 2, 0, Math.PI * 0.6), gm); v.position.set(0, 0.04, 0.12 * bw); v.scale.set(1, 1.05, 0.5); torso.add(v);
    }
  }

  /* ---------- pet ---------- */
  function buildPet(spec) {
    var p = spec.equipped && spec.equipped.pet; if (!p) return null;
    var g = new THREE.Group(); var c = col(p.gem, "#c084fc");
    var bm = new THREE.MeshStandardMaterial({ color: c, roughness: 0.5, metalness: 0.15, emissive: c.clone().multiplyScalar(0.22) }); R.disposables.push(bm);
    var body = M(new THREE.SphereGeometry(0.12, 18, 14), bm); g.add(body);
    var e1 = M(new THREE.ConeGeometry(0.04, 0.08, 5), bm); e1.position.set(-0.06, 0.12, 0); g.add(e1); var e2 = e1.clone(); e2.position.x = 0.06; g.add(e2);
    var em = new THREE.MeshStandardMaterial({ color: 0xfff3c4, emissive: 0x886600, roughness: 0.4 }); R.disposables.push(em);
    var eL = M(new THREE.SphereGeometry(0.04, 12, 10), em); eL.position.set(-0.045, 0.02, 0.1); g.add(eL); var eR = eL.clone(); eR.position.x = 0.045; g.add(eR);
    g.scale.setScalar(0.9); return g;
  }

  /* =====================================================================
   * MOUNTS — chunky, clean (chibi-matched)
   * ===================================================================== */
  function buildMount(spec) {
    var mt = spec.mount; if (!mt) return null;
    var id = mt.id || "", cs = mt.colors || ["#6b5640", "#caa46a", "#f6cb6e"];
    function s(o) { var m = new THREE.MeshStandardMaterial(o); R.disposables.push(m); return m; }
    var body = s({ color: col(cs[0]), roughness: 0.66, metalness: 0.06, envMapIntensity: 0.5 });
    var acc = s({ color: col(cs[1]), roughness: 0.6, metalness: 0.12, envMapIntensity: 0.5 });
    var det = s({ color: col(cs[2]), roughness: 0.32, metalness: 0.5, emissive: col(cs[2]).multiplyScalar(0.12), envMapIntensity: 1.0 });
    var g = new THREE.Group();

    if (id === "void_skiff") {
      var hull = M(new THREE.CapsuleGeometry(0.32, 1.0, 8, 18), acc); hull.rotation.z = Math.PI / 2; hull.scale.set(1, 1, 0.5); hull.position.y = 0.5; g.add(hull);
      var deck = M(new THREE.BoxGeometry(1.15, 0.06, 0.5), det); deck.position.y = 0.66; g.add(deck);
      var glow = M(new THREE.SphereGeometry(0.5, 18, 10, 0, Math.PI * 2, Math.PI * 0.55, Math.PI * 0.45), det); glow.position.y = 0.4; glow.scale.set(1.3, 1, 0.7); g.add(glow);
      g.userData.skiff = true; g.userData.seatY = 0.72; g.userData.stand = true; return g;
    }
    var panther = id === "phase_panther_reins";
    var bodyY = 0.8;
    var torso = M(new THREE.CapsuleGeometry(panther ? 0.3 : 0.34, 0.6, 8, 16), body);
    torso.rotation.z = Math.PI / 2; torso.position.set(0, bodyY, 0); torso.scale.set(1, 1, 0.82); g.add(torso);
    var chest = M(new THREE.SphereGeometry(0.34, 16, 14), body); chest.position.set(0.42, bodyY, 0); chest.scale.set(0.9, 1, 0.85); g.add(chest);
    var rump = M(new THREE.SphereGeometry(0.35, 16, 14), body); rump.position.set(-0.44, bodyY + 0.02, 0); rump.scale.set(0.9, 1, 0.85); g.add(rump);
    var legs = [];
    function leg(x, z) { var lg = new THREE.Group(); lg.position.set(x, bodyY - 0.18, z);
      var up = M(new THREE.CapsuleGeometry(0.085, 0.34, 5, 10), body); up.position.y = -0.22; lg.add(up);
      var hoof = M(new THREE.CylinderGeometry(0.08, 0.09, 0.1, 8), det); hoof.position.y = -0.44; lg.add(hoof); g.add(lg); legs.push(lg); return lg; }
    leg(0.4, 0.2); leg(0.4, -0.2); leg(-0.42, 0.2); leg(-0.42, -0.2);
    g.userData.legs = legs;
    var neck = M(new THREE.CapsuleGeometry(0.16, 0.34, 6, 12), body); neck.position.set(0.6, bodyY + 0.3, 0); neck.rotation.z = -0.7; g.add(neck);
    var head = M(new THREE.CapsuleGeometry(0.16, 0.28, 7, 14), body); head.position.set(0.86, bodyY + 0.5, 0); head.rotation.z = -1.2; g.add(head);
    var muzzle = M(new THREE.SphereGeometry(0.12, 12, 10), body); muzzle.position.set(1.0, bodyY + 0.42, 0); muzzle.scale.set(1.1, 0.85, 0.9); g.add(muzzle);
    var earL = M(new THREE.ConeGeometry(0.06, 0.16, 6), body); earL.position.set(0.78, bodyY + 0.72, 0.08); g.add(earL); var earR = earL.clone(); earR.position.z = -0.08; g.add(earR);
    var em = s({ color: 0x10131a, roughness: 0.4 });
    var eL = M(new THREE.SphereGeometry(0.04, 10, 8), em); eL.position.set(0.92, bodyY + 0.54, 0.11); g.add(eL); var eR = eL.clone(); eR.position.z = -0.11; g.add(eR);
    if (!panther) { for (var i = 0; i < 6; i++) { var mh = M(new THREE.BoxGeometry(0.06, 0.16, 0.1), acc); var f = i / 5; mh.position.set(0.46 + f * 0.34, bodyY + 0.42 + f * 0.14, 0); mh.rotation.z = -0.7; g.add(mh); } }
    var tail = M(new THREE.CapsuleGeometry(0.07, 0.42, 5, 10), acc); tail.position.set(-0.78, bodyY + 0.02, 0); tail.rotation.z = 0.9; g.add(tail);
    var saddle = M(new THREE.SphereGeometry(0.28, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), det); saddle.position.set(-0.05, bodyY + 0.28, 0); saddle.scale.set(1, 0.55, 0.95); g.add(saddle);
    if (id === "unicorn_sigil") { var horn = M(new THREE.ConeGeometry(0.05, 0.36, 12), det); horn.position.set(0.95, bodyY + 0.78, 0); horn.rotation.z = -0.5; g.add(horn); }
    if (id === "astral_stag_tack") { [-1, 1].forEach(function (sg) { var a1 = M(new THREE.CylinderGeometry(0.02, 0.03, 0.32, 6), det); a1.position.set(0.78, bodyY + 0.86, 0.08 * sg); a1.rotation.z = 0.3 * sg; g.add(a1); var a2 = M(new THREE.CylinderGeometry(0.014, 0.02, 0.18, 6), det); a2.position.set(0.72, bodyY + 1.02, 0.16 * sg); a2.rotation.z = 0.8 * sg; g.add(a2); }); }
    if (id === "griffin_saddle") { g.userData.wing = []; [-1, 1].forEach(function (sg) { var wm = s({ color: col(cs[1]), roughness: 0.6, side: THREE.DoubleSide }); var wing = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.55, 4, 3), wm); R.disposables.push(wing.geometry); wing.castShadow = true; wing.position.set(-0.1, bodyY + 0.4, 0.28 * sg); wing.rotation.set(0, 0.5 * sg, 0.55); g.add(wing); g.userData.wing.push(wing); }); }
    g.userData.seatY = bodyY + 0.34; g.userData.stand = false; return g;
  }

  /* ---------- assemble ---------- */
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
    var mount = spec.mount ? buildMount(spec) : null;
    var pet = buildPet(spec);
    R.mounted = !!mount;
    if (mount) {
      R.root.add(mount); R.mountGroup = mount;
      hero.position.y = mount.userData.seatY - 0.42;
      hero.position.x = mount.userData.stand ? 0 : 0.04;
      if (!mount.userData.stand) { if (hero.userData.legL) { hero.userData.legL.rotation.x = 0.6; hero.userData.legL.rotation.z = 0.25; } if (hero.userData.legR) { hero.userData.legR.rotation.x = 0.6; hero.userData.legR.rotation.z = -0.25; } }
      if (R.pedestal) R.pedestal.visible = false;
    } else { hero.position.y = 0; if (R.pedestal) R.pedestal.visible = true; }
    R.root.add(hero); R.heroRig = hero;
    if (pet) { R.root.add(pet); R.petGroup = pet; }
    frame();
  }
  function frame() {
    var cam = R.camera;
    if (R.mode === "studio") { if (R.mounted) { cam.position.set(0, 1.15, 5.0); R.lookY = 0.95; } else { cam.position.set(0, 0.85, 3.9); R.lookY = 0.72; } }
    else { if (R.mounted) { cam.position.set(0, 1.1, 4.7); R.lookY = 0.92; } else { cam.position.set(0, 0.85, 3.8); R.lookY = 0.72; } }
    cam.lookAt(0, R.lookY, 0);
  }
  FH3D.sync = function (spec) {
    if (!FH3D.available) { if (!initEngine()) return; }
    if (!spec) return; R.running = !!spec.running;
    try { var sg = specSig(spec); if (sg !== R.sig) { R.sig = sg; rebuild(spec); } startLoop(); } catch (e) { console.warn("[FH3D] sync failed:", e); }
  };

  /* ---------- attach ---------- */
  function attach(container, mode) {
    if (!container) return; if (!FH3D.available) { if (!initEngine()) return; }
    var canvas = R.renderer.domElement;
    try { if (getComputedStyle(container).position === "static") container.style.position = "relative"; } catch (e) {}
    if (canvas.parentNode !== container) container.appendChild(canvas);
    R.container = container; R.mode = mode || "home"; container.classList.add("fh3d-host");
    resize(); frame(); observe(container); startLoop();
  }
  FH3D.attachHome = function (el) { attach(el, "home"); };
  FH3D.attachStudio = function (el) { attach(el, "studio"); };
  FH3D.detachStudio = function (homeEl) { if (homeEl) attach(homeEl, "home"); };
  function resize() { if (!R.container || !R.renderer) return; var w = R.container.clientWidth || 120, h = R.container.clientHeight || 120; R.renderer.setSize(w, h, false); R.camera.aspect = w / h; R.camera.updateProjectionMatrix(); }
  function observe(container) {
    if (R.ro) { try { R.ro.disconnect(); } catch (e) {} }
    if (window.ResizeObserver) { R.ro = new ResizeObserver(function () { resize(); }); R.ro.observe(container); }
    if (R.io) { try { R.io.disconnect(); } catch (e) {} }
    if (window.IntersectionObserver) { R.io = new IntersectionObserver(function (en) { var v = en[0] && en[0].isIntersecting; if (v && !document.hidden) startLoop(); else stopLoop(); }, { threshold: 0.01 }); R.io.observe(container); }
  }
  function wirePointer(canvas) {
    canvas.addEventListener("pointerdown", function (e) { R.dragging = true; R.autoSpin = false; R.lastPointerX = e.clientX; try { canvas.setPointerCapture(e.pointerId); } catch (x) {} });
    canvas.addEventListener("pointermove", function (e) { if (!R.dragging) return; var dx = e.clientX - R.lastPointerX; R.lastPointerX = e.clientX; R.targetYaw += dx * 0.012; });
    function up() { R.dragging = false; clearTimeout(R._t); R._t = setTimeout(function () { R.autoSpin = true; }, 2800); }
    canvas.addEventListener("pointerup", up); canvas.addEventListener("pointercancel", up); canvas.addEventListener("pointerleave", function () { if (R.dragging) up(); });
  }
  function startLoop() { if (R.raf) return; if (document.hidden) return; R.last = performance.now(); R.raf = requestAnimationFrame(tick); }
  function stopLoop() { if (R.raf) { cancelAnimationFrame(R.raf); R.raf = 0; } }
  function tick(now) {
    R.raf = requestAnimationFrame(tick);
    var dt = Math.min(0.05, (now - R.last) / 1000); R.last = now; R.clock += dt; var t = R.clock;
    if (R.autoSpin && !R.dragging) R.targetYaw += dt * (R.mode === "studio" ? 0.32 : 0.5);
    R.yaw += (R.targetYaw - R.yaw) * Math.min(1, dt * 8); if (R.root) R.root.rotation.y = R.yaw;
    var sp = R.running ? 2.2 : 1.0, amp = R.running ? 1.4 : 1.0;
    if (R.heroRig) {
      var h = R.heroRig, bob = Math.sin(t * 2.0 * sp) * 0.014 * amp;
      if (h.userData.torso) { h.userData.torso.position.y = 0.70 + bob; h.userData.torso.rotation.y = Math.sin(t * 1.0) * 0.04; }
      if (h.userData.headG) { h.userData.headG.position.y = (h.userData.headG.userData_baseY || h.userData.headG.position.y); h.userData.headG.rotation.y = Math.sin(t * 0.7) * 0.12; h.userData.headG.rotation.z = Math.sin(t * 0.9) * 0.03; }
      if (!R.mounted) { if (h.userData.armL) h.userData.armL.rotation.x = Math.sin(t * 1.5 * sp) * 0.1 * amp; if (h.userData.armR) h.userData.armR.rotation.x = -Math.sin(t * 1.5 * sp) * 0.1 * amp; }
      if (h.userData.cloak) h.userData.cloak.rotation.x = Math.sin(t * 1.3) * 0.05 + 0.03;
    }
    if (R.mountGroup) {
      var mg = R.mountGroup;
      if (mg.userData.skiff) { mg.position.y = Math.sin(t * 1.4) * 0.05; if (R.heroRig) R.heroRig.position.y = (mg.userData.seatY - 0.42) + Math.sin(t * 1.4) * 0.05; }
      else { var gallop = R.running, gy = gallop ? Math.abs(Math.sin(t * 6)) * 0.06 : Math.sin(t * 1.8) * 0.02; mg.position.y = gy; if (R.heroRig) R.heroRig.position.y = (mg.userData.seatY - 0.42) + gy;
        var legs = mg.userData.legs || []; for (var i = 0; i < legs.length; i++) legs[i].rotation.x = Math.sin(t * (gallop ? 8 : 2.2) + (i < 2 ? 0 : Math.PI)) * (gallop ? 0.5 : 0.13);
        if (mg.userData.wing) { var fl = Math.sin(t * 3) * 0.4; mg.userData.wing[0].rotation.z = 0.55 + fl; mg.userData.wing[1].rotation.z = 0.55 + fl; } }
    }
    if (R.petGroup) { var pa = t * 0.8; R.petGroup.position.set(Math.cos(pa) * 0.8, 1.2 + Math.sin(t * 2) * 0.08, Math.sin(pa) * 0.5 - 0.15); R.petGroup.rotation.y = -pa + Math.PI / 2; }
    if (R.renderer && R.scene && R.camera) { try { R.renderer.render(R.scene, R.camera); } catch (e) { stopLoop(); } }
  }
  FH3D.wireModal = function (modalId, studioHostId, homeHostId) {
    var modal = document.getElementById(modalId); if (!modal || !window.MutationObserver) return;
    var obs = new MutationObserver(function () { var hidden = modal.hasAttribute("hidden"); if (hidden) { var home = document.getElementById(homeHostId); if (home) FH3D.attachHome(home); } else { var st = document.getElementById(studioHostId); if (st) FH3D.attachStudio(st); } });
    obs.observe(modal, { attributes: true, attributeFilter: ["hidden"] });
  };
  FH3D._R = R;
})();
