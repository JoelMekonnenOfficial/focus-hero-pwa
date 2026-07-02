/* ============================================================================
 * Focus Hero — FH3D v9.0 "Atelier" : sculpted avatar renderer
 * Pure renderer (reads a plain spec via FH3D.sync; never touches app state).
 * Ground-up remodel over the v8 model kit: joint-anchored rig (no floating
 * pieces), sculpted head/face with lids+brows, race kits for all 11 species,
 * per-class outfit sets, gripped weapons with distinct silhouettes, tier
 * auras, rebuilt mounts & pets. Same public API + spec contract as v8:
 * SPEC: { cls, className, palette, level, running,
 *   colors:{skin,hair,eye,armorMid,armorHigh,armorDark,outfit,leather,accent,cloak},
 *   traits:{race,body,hair,helm,face,eyeShape},
 *   equipped:{weapon,helmet,armor,pet}, mount:null|{id,family,tier,colors} }
 * ==========================================================================*/
(function () {
  "use strict";
  var FH3D = (window.FH3D = window.FH3D || {});
  FH3D.available = false; FH3D.version = "fh3d-10.0"; FH3D.engine = "forge-v1";
  var THREE = window.THREE;
  function webglSupported(){ try{ if(!THREE) return false; var c=document.createElement("canvas"); return !!(c.getContext("webgl2")||c.getContext("webgl")||c.getContext("experimental-webgl")); }catch(e){ return false; } }
  function col(hex, fb){ try{ return new THREE.Color(hex||fb||"#888"); }catch(e){ return new THREE.Color(fb||"#888"); } }
  function darken(hex,a){ var c=col(hex); c.offsetHSL(0,0,-a); return c; }
  function lighten(hex,a){ var c=col(hex); c.offsetHSL(0,0,a); return c; }
  function mix(a,b,t){ var c=col(a); c.lerp(col(b),t); return c; }
  var TAU=Math.PI*2, HPI=Math.PI/2;

  var R = { renderer:null, scene:null, camera:null, env:null, root:null, heroRig:null, mountGroup:null, petGroup:null, pedestal:null, auraRing:null, auraDust:null,
    disposables:[], raf:0, last:0, clock:0, yaw:0, targetYaw:0, pitch:0, targetPitch:0, dist:0, targetDist:0, autoSpin:true, dragging:false, lastPointerX:0, lastPointerY:0,
    mode:"home", mounted:false, running:false, actScene:"resting", lookY:1.0, sig:"", container:null, ro:null, io:null, initialized:false, reduced:false,
    blinkT:2.2, blinkPhase:0, lids:null, jawPulse:0, pose:{}, sceneT:0 };
  try { R.reduced = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches); } catch(e){}

  /* ---------------- engine ---------------- */
  function initEngine(){
    if (R.initialized) return true; if (!webglSupported()) return false;
    try {
      var renderer = new THREE.WebGLRenderer({ antialias:true, alpha:true, powerPreference:"high-performance" });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio||1, 2));
      renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      if ("outputColorSpace" in renderer) renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.06;
      var cs = renderer.domElement.style; cs.position="absolute"; cs.left="0"; cs.top="0"; cs.width="100%"; cs.height="100%"; cs.display="block"; cs.borderRadius="inherit"; cs.touchAction="pan-y";
      renderer.domElement.className = "fh3d-canvas"; renderer.domElement.setAttribute("aria-hidden","true");
      var scene = new THREE.Scene(); scene.background = makeBackdrop();
      R.env = makeEnv(renderer); scene.environment = R.env;
      var camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100); camera.position.set(0,1.3,4.6);
      var hemi = new THREE.HemisphereLight(0xcfe0ff, 0x232733, 0.75); scene.add(hemi);
      var key = new THREE.DirectionalLight(0xfff1dd, 2.3); key.position.set(2.8,5.4,3.6); key.castShadow=true;
      key.shadow.mapSize.set(2048,2048); key.shadow.camera.near=1; key.shadow.camera.far=20; key.shadow.camera.left=-3; key.shadow.camera.right=3; key.shadow.camera.top=3.8; key.shadow.camera.bottom=-2; key.shadow.bias=-0.0008; key.shadow.normalBias=0.03; scene.add(key);
      var fill = new THREE.DirectionalLight(0x8fb6ff, 0.6); fill.position.set(-4,2.2,2.2); scene.add(fill);
      var rim = new THREE.DirectionalLight(0xdcecff, 1.85); rim.position.set(-1.2,3.4,-4.4); scene.add(rim);
      var kick = new THREE.DirectionalLight(0xffd9a8, 0.68); kick.position.set(2.4,0.8,-3.2); scene.add(kick);
      var root = new THREE.Group(); scene.add(root);
      var ped = new THREE.Group();
      var pedMat = new THREE.MeshStandardMaterial({ color:0x1b2436, roughness:0.55, metalness:0.3, envMapIntensity:0.8 });
      var disc = new THREE.Mesh(new THREE.CylinderGeometry(0.92,1.04,0.1,64), pedMat); disc.position.y=-0.052; disc.receiveShadow=true; ped.add(disc);
      var lip = new THREE.Mesh(new THREE.TorusGeometry(0.92,0.022,12,64), new THREE.MeshStandardMaterial({ color:0x3d4f78, roughness:0.3, metalness:0.65, envMapIntensity:1.15 })); lip.rotation.x=HPI; lip.position.y=0.004; ped.add(lip);
      var auraMat = new THREE.MeshBasicMaterial({ color:0x22d3ee, transparent:true, opacity:0.0, blending:THREE.AdditiveBlending, depthWrite:false });
      var aura = new THREE.Mesh(new THREE.TorusGeometry(0.99,0.014,10,64), auraMat); aura.rotation.x=HPI; aura.position.y=0.012; ped.add(aura); R.auraRing=aura;
      var glowDisc=new THREE.Mesh(new THREE.CircleGeometry(0.86,48), new THREE.MeshBasicMaterial({ color:0x3d5a9e, transparent:true, opacity:0.16, blending:THREE.AdditiveBlending, depthWrite:false })); glowDisc.rotation.x=-HPI; glowDisc.position.y=0.002; ped.add(glowDisc);
      var floor = new THREE.Mesh(new THREE.CircleGeometry(2.6,48), new THREE.ShadowMaterial({ opacity:0.36 })); floor.rotation.x=-HPI; floor.receiveShadow=true; ped.add(floor);
      root.add(ped); R.pedestal = ped;
      R.renderer=renderer; R.scene=scene; R.camera=camera; R.root=root; R.initialized=true; FH3D.available=true;
      wirePointer(renderer.domElement);
      document.addEventListener("visibilitychange", function(){ if(document.hidden) stopLoop(); else startLoop(); });
      return true;
    } catch(e){ console.warn("[FH3D] init failed:", e); FH3D.available=false; return false; }
  }
  function makeBackdrop(){
    var c=document.createElement("canvas"); c.width=c.height=512; var g=c.getContext("2d");
    var gr=g.createRadialGradient(256,190,30,256,290,470);
    gr.addColorStop(0,"#5a6f9e"); gr.addColorStop(0.55,"#2c3a5c"); gr.addColorStop(1,"#131a2b");
    g.fillStyle=gr; g.fillRect(0,0,512,512);
    var s=99; function rnd(){ s=(s*1664525+1013904223)>>>0; return s/4294967296; }
    for(var i=0;i<90;i++){ var x=rnd()*512,y=rnd()*400,r2=rnd()*1.4+0.3,a=rnd()*0.35+0.08;
      g.fillStyle="rgba(210,225,255,"+a.toFixed(2)+")"; g.beginPath(); g.arc(x,y,r2,0,TAU); g.fill(); }
    var t=new THREE.CanvasTexture(c); if("colorSpace" in t) t.colorSpace=THREE.SRGBColorSpace; return t;
  }
  function makeEnv(renderer){ try{ var pmrem=new THREE.PMREMGenerator(renderer); var c=document.createElement("canvas"); c.width=256; c.height=128; var g=c.getContext("2d");
    var gr=g.createLinearGradient(0,0,0,128); gr.addColorStop(0,"#f2f6ff"); gr.addColorStop(0.42,"#93a9cf"); gr.addColorStop(0.55,"#3c4459"); gr.addColorStop(1,"#171c28"); g.fillStyle=gr; g.fillRect(0,0,256,128);
    g.fillStyle="rgba(255,244,214,0.95)"; g.beginPath(); g.arc(66,30,20,0,TAU); g.fill();
    g.fillStyle="rgba(160,200,255,0.5)"; g.beginPath(); g.arc(198,44,13,0,TAU); g.fill();
    var tex=new THREE.CanvasTexture(c); tex.mapping=THREE.EquirectangularReflectionMapping; var rt=pmrem.fromEquirectangular(tex); tex.dispose(); pmrem.dispose(); return rt.texture; }catch(e){ return null; } }
  function makeDetailTexture(seed, base, line, grid){
    try{
      var c=document.createElement("canvas"); c.width=c.height=128; var g=c.getContext("2d");
      g.fillStyle=base||"#777"; g.fillRect(0,0,128,128);
      var s=seed||17; function rnd(){ s=(s*1664525+1013904223)>>>0; return s/4294967296; }
      for(var i=0;i<1200;i++){ var v=80+(rnd()*95|0); g.fillStyle="rgba("+v+","+v+","+v+","+(0.03+rnd()*0.04)+")"; g.fillRect(rnd()*128,rnd()*128,1+rnd()*2,1+rnd()*2); }
      if(grid!==false){ g.strokeStyle=line||"rgba(255,255,255,.1)"; g.lineWidth=1;
        for(var y=14;y<128;y+=20){ g.beginPath(); g.moveTo(0,y+(rnd()*4-2)); g.lineTo(128,y+(rnd()*4-2)); g.stroke(); }
      }
      var t=new THREE.CanvasTexture(c); t.wrapS=t.wrapT=THREE.RepeatWrapping; t.repeat.set(2,2); if("colorSpace" in t) t.colorSpace=THREE.SRGBColorSpace; R.disposables.push(t); return t;
    }catch(e){ return null; }
  }

  /* ---------------- geometry helpers ---------------- */
  function M(geo, mat, x, y, z){ var m=new THREE.Mesh(geo, mat); if(x!==undefined) m.position.set(x,y,z); m.castShadow=true; m.receiveShadow=true; R.disposables.push(geo); return m; }
  function loftGeometry(rings, seg){
    seg=seg||28;
    var pos=[], idx=[];
    rings.forEach(function(r){
      var x=r.x||0, z=r.z||0;
      for(var i=0;i<seg;i++){ var a=(i/seg)*TAU; pos.push(x+Math.cos(a)*(r.rx||0.1), r.y||0, z+Math.sin(a)*(r.rz||r.rx||0.1)); }
    });
    for(var j=0;j<rings.length-1;j++){ var a0=j*seg, b0=(j+1)*seg;
      for(var k=0;k<seg;k++){ var n=(k+1)%seg; idx.push(a0+k,b0+k,a0+n, a0+n,b0+k,b0+n); } }
    var bc=pos.length/3, br=rings[0]; pos.push(br.x||0,br.y||0,br.z||0);
    for(var bi=0;bi<seg;bi++) idx.push(bc,bi,(bi+1)%seg);
    var tc=pos.length/3, tr=rings[rings.length-1], tb=(rings.length-1)*seg; pos.push(tr.x||0,tr.y||0,tr.z||0);
    for(var ti=0;ti<seg;ti++) idx.push(tc,tb+(ti+1)%seg,tb+ti);
    var g=new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos,3));
    g.setIndex(idx); g.computeVertexNormals();
    return g;
  }
  function Loft(rings, mat, seg){ return M(loftGeometry(rings, seg||28), mat); }
  /* horizontal loft: rings stacked along Z (each ring in the XY plane) */
  function loftZGeometry(rings, seg){
    seg=seg||24;
    var pos=[], idx=[];
    rings.forEach(function(r){
      var x=r.x||0, y=r.y||0;
      for(var i=0;i<seg;i++){ var a=(i/seg)*TAU; pos.push(x+Math.cos(a)*(r.rx||0.1), y+Math.sin(a)*(r.ry||r.rx||0.1), r.z||0); }
    });
    for(var j=0;j<rings.length-1;j++){ var a0=j*seg, b0=(j+1)*seg;
      for(var k=0;k<seg;k++){ var n=(k+1)%seg; idx.push(a0+k,a0+n,b0+k, a0+n,b0+n,b0+k); } }
    var bc=pos.length/3, br=rings[0]; pos.push(br.x||0,br.y||0,br.z||0);
    for(var bi=0;bi<seg;bi++) idx.push(bc,(bi+1)%seg,bi);
    var tc=pos.length/3, tr=rings[rings.length-1], tb=(rings.length-1)*seg; pos.push(tr.x||0,tr.y||0,tr.z||0);
    for(var ti=0;ti<seg;ti++) idx.push(tc,tb+ti,tb+(ti+1)%seg);
    var g=new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos,3));
    g.setIndex(idx); g.computeVertexNormals();
    return g;
  }
  function LoftZ(rings, mat, seg){ return M(loftZGeometry(rings, seg||24), mat); }
  function Ball(rx, ry, rz, mat, x, y, z, seg){
    var m=M(new THREE.SphereGeometry(1, seg||26, Math.max(12, Math.floor((seg||26)*0.7))), mat, x||0, y||0, z||0);
    m.scale.set(rx,ry,rz); return m;
  }
  /* tapered limb segment BETWEEN two points — guarantees connection */
  function seg3(a, b, r0, r1, mat, segs){
    var av=new THREE.Vector3(a[0],a[1],a[2]), bv=new THREE.Vector3(b[0],b[1],b[2]);
    var dir=bv.clone().sub(av), len=dir.length()||0.001, mid=av.clone().add(bv).multiplyScalar(0.5);
    var geo=new THREE.CylinderGeometry(r1||0.02, r0||0.02, len, segs||18, 1, false);
    var m=M(geo, mat); m.position.copy(mid);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), dir.normalize());
    return m;
  }
  function joint(p, r, mat, sy){ return Ball(r, r*(sy||0.94), r, mat, p[0], p[1], p[2], 18); }
  function panel(w,h,d,mat,x,y,z,rx,ry,rz){
    var m=M(new THREE.BoxGeometry(w,h,d), mat, x||0, y||0, z||0);
    m.rotation.set(rx||0,ry||0,rz||0); return m;
  }
  function torus(rad, tube, mat, x,y,z, rx,ry,rz, arc){
    var m=M(new THREE.TorusGeometry(rad,tube,10,40,arc||TAU), mat, x||0,y||0,z||0);
    m.rotation.set(rx||0,ry||0,rz||0); return m;
  }
  function cone(r,h,mat,x,y,z,rx,ry,rz,seg){ var m=M(new THREE.ConeGeometry(r,h,seg||12), mat, x||0,y||0,z||0); m.rotation.set(rx||0,ry||0,rz||0); return m; }
  function disposeGroup(g){ if(!g) return; g.traverse(function(o){ if(o.geometry && !o.userData._ol) o.geometry.dispose(); }); }
  function flush(){ for(var i=0;i<R.disposables.length;i++){ try{ R.disposables[i].dispose(); }catch(e){} } R.disposables.length=0; }

  /* ---------------- materials ---------------- */
  function makeMats(spec){
    var c=spec.colors, m={};
    function s(o){ var mt=new THREE.MeshStandardMaterial(o); R.disposables.push(mt); return mt; }
    m.s = s;
    var armorTex=makeDetailTexture(31,"#777","rgba(255,255,255,.14)"), clothTex=makeDetailTexture(59,"#555","rgba(255,255,255,.06)"), skinTex=makeDetailTexture(71,"#999",null,false);
    m.skin=s({ color:col(c.skin,"#e7b48c"), roughness:0.62, metalness:0.0, envMapIntensity:0.5, bumpMap:skinTex, bumpScale:0.003 });
    m.skinDk=s({ color:darken(c.skin||"#e7b48c",0.07), roughness:0.66, metalness:0.0, envMapIntensity:0.45 });
    m.cloth=s({ color:col(c.outfit||c.armorDark,"#26334d"), roughness:0.82, metalness:0.03, envMapIntensity:0.5, bumpMap:clothTex, bumpScale:0.016 });
    m.clothHi=s({ color:lighten(c.outfit||c.armorMid||"#334155",0.14), roughness:0.8, metalness:0.03, envMapIntensity:0.46, bumpMap:clothTex, bumpScale:0.012 });
    m.clothDk=s({ color:darken(c.outfit||c.armorDark||"#172033",0.09), roughness:0.9, metalness:0.02, envMapIntensity:0.34, bumpMap:clothTex, bumpScale:0.014 });
    m.armor=s({ color:col(c.armorMid,"#465e80"), roughness:0.3, metalness:0.72, envMapIntensity:1.18, bumpMap:armorTex, bumpScale:0.01 });
    m.armorHi=s({ color:col(c.armorHigh,"#7e97bd"), roughness:0.26, metalness:0.78, envMapIntensity:1.25, bumpMap:armorTex, bumpScale:0.008 });
    m.armorDk=s({ color:col(c.armorDark,"#22304a"), roughness:0.45, metalness:0.55, envMapIntensity:0.9, bumpMap:armorTex, bumpScale:0.012 });
    m.trim=s({ color:col(c.accent,"#f6cb6e"), roughness:0.24, metalness:0.9, envMapIntensity:1.35 });
    m.trimGlow=s({ color:col(c.accent,"#f6cb6e"), roughness:0.3, metalness:0.4, emissive:col(c.accent,"#f6cb6e").multiplyScalar(0.35), envMapIntensity:1.1 });
    m.cloak=s({ color:col(c.cloak,"#3a5a9c"), roughness:0.88, metalness:0.0, envMapIntensity:0.4, side:THREE.DoubleSide, bumpMap:clothTex, bumpScale:0.016 });
    m.cloakIn=s({ color:darken(c.cloak||"#3a5a9c",0.16), roughness:0.92, metalness:0.0, envMapIntensity:0.3, side:THREE.DoubleSide });
    m.hair=s({ color:col(c.hair,"#3a2417"), roughness:0.55, metalness:0.06, envMapIntensity:0.7 });
    m.hairDk=s({ color:darken(c.hair||"#3a2417",0.08), roughness:0.6, metalness:0.05, envMapIntensity:0.6 });
    m.boot=s({ color:darken(c.leather||"#4a3324",0.03), roughness:0.68, metalness:0.08, bumpMap:clothTex, bumpScale:0.01 });
    m.leather=s({ color:col(c.leather,"#5b3d22"), roughness:0.78, metalness:0.1, bumpMap:clothTex, bumpScale:0.008 });
    m.leatherHi=s({ color:lighten(c.leather||"#5b3d22",0.1), roughness:0.72, metalness:0.1 });
    var eyeC=col(c.eye,"#6cc6ff");
    m.eye=s({ color:eyeC, roughness:0.12, emissive:eyeC.clone().multiplyScalar(0.32), envMapIntensity:1.2 });
    m.eyeWhite=s({ color:0xf2f5fc, roughness:0.22, envMapIntensity:0.9 });
    m.pupil=s({ color:0x0b0e14, roughness:0.3 });
    m.dark=s({ color:0x12161e, roughness:0.5 });
    m.mouth=s({ color:0x6e3730, roughness:0.6 });
    m.teeth=s({ color:0xf3ecd6, roughness:0.42 });
    var energyC=col(c.accent,"#8b9cff");
    m.energy=s({ color:energyC, roughness:0.2, metalness:0.1, emissive:energyC.clone().multiplyScalar(0.55), envMapIntensity:1.25, transparent:true, opacity:0.95 });
    return m;
  }
  function gText(g){ return String((g&&g.name)||"").toLowerCase()+" "+String((g&&g.id)||"").toLowerCase(); }
  function gMetal(g,fb){ var m=new THREE.MeshStandardMaterial({ color:col(g&&g.metal,fb||"#cbd5e1"), roughness:0.26, metalness:0.92, envMapIntensity:1.3 }); R.disposables.push(m); return m; }
  function gGem(g,fb){ var c=col(g&&g.gem,fb||"#22d3ee"); var glow=(g&&g.glow)||0; var m=new THREE.MeshStandardMaterial({ color:c, roughness:0.1, metalness:0.1, emissive:c.clone().multiplyScalar(0.35+glow*0.12), envMapIntensity:1.3 }); R.disposables.push(m); return m; }
  function gCloth(g,fb){ var c=col(g&&g.metal,fb||"#64748b"); c.offsetHSL(0,-0.15,-0.06); var m=new THREE.MeshStandardMaterial({ color:c, roughness:0.82, metalness:0.05, envMapIntensity:0.45 }); R.disposables.push(m); return m; }

  /* ================= CHARACTER — joint-anchored sculpt ================= */
  /* Proportions (unit ~ meters). Feet at y=0. */
  function bodyPlan(build, race){
    /* v10 "Forge": heroic, de-chibi proportions. Human reads ~7.4 head-heights
       (headY+HR = 1.90, head diameter 2*HR = 0.256). Races keep their identity
       through frame + limb character, not balloon heads. */
    var p={ hipY:0.98, waistY:1.16, chestY:1.42, shoulderY:1.575, neckY:1.65, headY:1.815, HR:0.128,
      shoulderW:0.205, hipW:0.128, legSpread:0.115, armLen:0.565, legLift:0 };
    if(build==="broad"){ p.shoulderW=0.255; p.hipW=0.152; p.legSpread=0.138; p.thick=1.24; }
    else if(build==="lean"){ p.shoulderW=0.178; p.hipW=0.11; p.legSpread=0.102; p.thick=0.82; }
    else p.thick=1.0;
    race=String(race||"");
    if(/dwarf/.test(race)){ p.scaleY=0.82; p.thick*=1.24; p.shoulderW*=1.14; p.HR=0.138; }
    if(/goblin/.test(race)){ p.scaleY=0.79; p.thick*=0.9; p.HR=0.132; }
    if(/orc/.test(race)){ p.scaleY=1.05; p.thick*=1.14; p.shoulderW*=1.1; p.HR=0.131; }
    if(/fae/.test(race)){ p.scaleY=0.94; p.thick*=0.84; p.HR=0.122; }
    if(/elf/.test(race)){ p.scaleY=1.03; p.thick*=0.92; p.HR=0.124; }
    /* bake vertical scale into the joint plan (uniform transforms only — no shear) */
    var sy=p.scaleY||1;
    if(sy!==1){
      p.hipY*=sy; p.waistY*=sy; p.chestY*=sy; p.shoulderY*=sy; p.neckY*=sy; p.headY*=sy;
      var wf=(sy+2)/3; p.shoulderW*=wf; p.hipW*=wf; p.legSpread*=wf; p.thick*=wf;
    }
    p.sy=sy; p.scaleY=null;
    return p;
  }
  function classKit(cls){
    var k=String(cls||"knight").toLowerCase();
    if(/knight|warrior|sentinel|paladin|guardian/.test(k)) return "plate";
    if(/mage|wizard|cleric|warlock|sage/.test(k)) return "robe";
    if(/bard|minstrel/.test(k)) return "doublet";
    if(/rogue|shadow|assassin|thief/.test(k)) return "shade";
    if(/monk|alchemist|artificer/.test(k)) return "wraps";
    return "leathers"; /* ranger, druid, hunter... */
  }

  function buildHeroModelKit(spec){
    var mats=makeMats(spec), t=spec.traits||{}, eq=spec.equipped||{};
    var race=String(t.race||"human"), P=bodyPlan(t.body||"balanced", race), kit=classKit(spec.cls);
    var rig=new THREE.Group(); rig.userData.modelKit="atelier-v1";
    var th=P.thick, robe=(kit==="robe");

    /* ---- legs (hip → knee → ankle chains) ---- */
    var kneeY=0.5, ankleY=0.085;
    function mkLegAt(side){
      var hx=P.legSpread*side;
      var g=new THREE.Group(); g.position.set(hx,P.hipY,0); /* rotate at hip */
      var hip=[0,0,0], knee=[0.012*side,kneeY-P.hipY,0.012], ankle=[0.02*side,ankleY-P.hipY,-0.008];
      var pants=(kit==="plate")?mats.armorDk:(kit==="wraps")?mats.cloth:mats.clothDk;
      g.add(joint(hip,0.082*th,pants));
      g.add(seg3(hip,knee,0.079*th,0.056*th,pants,20));
      /* articulated knee: everything below the knee lives in kneeG */
      var kneeG=new THREE.Group(); kneeG.position.set(knee[0],knee[1],knee[2]); g.add(kneeG); g.userData.knee=kneeG;
      var ankleRel=[ankle[0]-knee[0],ankle[1]-knee[1],ankle[2]-knee[2]];
      kneeG.add(joint([0,0,0],0.056*th,(kit==="plate")?mats.armorHi:pants));
      kneeG.add(seg3([0,0,0],ankleRel,0.054*th,0.037*th,(kit==="plate")?mats.armor:pants,20));
      /* calf bulge */
      kneeG.add(Ball(0.052*th,0.085,0.05*th,pants,0.014*side,-0.1,-0.012,16));
      /* boot */
      var bg=new THREE.Group(); bg.position.set(ankleRel[0],ankleRel[1],ankleRel[2]); kneeG.add(bg); var bootHost=kneeG;
      bg.add(Loft([{y:-0.02,rx:0.052*th,rz:0.06},{y:0.045,rx:0.056*th,rz:0.062},{y:0.085,rx:0.052*th,rz:0.05}],mats.boot,20));
      var foot=Loft([{y:-0.075,rx:0.054*th,rz:0.085,z:0.045},{y:-0.028,rx:0.056*th,rz:0.088,z:0.04},{y:-0.005,rx:0.045*th,rz:0.06,z:0.02}],mats.boot,20);
      bg.add(foot);
      bg.add(Ball(0.045*th,0.032,0.05,mats.boot,0,-0.055,0.115,14)); /* toe cap */
      bg.add(panel(0.105*th,0.02,0.2,mats.leather,0,-0.083,0.045));
      bg.add(torus(0.056*th,0.009,mats.leather,0,0.06,0,HPI,0,0)); /* cuff strap */
      bg.add(panel(0.05*th,0.03,0.02,mats.leatherHi,0,-0.083,-0.055)); /* heel block */
      bg.add(Ball(0.006,0.006,0.004,mats.trim,0.02*side,0.045,0.058,6));
      bg.add(Ball(0.006,0.006,0.004,mats.trim,-0.02*side,0.02,0.06,6));
      /* kneepad for every kit */
      kneeG.add(Loft([{y:-0.02,rx:0.052*th,rz:0.05,z:0.02},{y:0.03,rx:0.058*th,rz:0.054,z:0.018},{y:0.06,rx:0.048*th,rz:0.044,z:0.014}],(kit==="plate")?mats.armorHi:mats.leather,14));
      if(kit==="plate"){ kneeG.add(panel(0.07*th,0.16,0.02,mats.armorHi,0.02*side,-0.22,0.055,0.06,0,0.03*side)); }
      g.userData.upper=null;
      return g;
    }
    kneeY*=P.sy||1; ankleY*=P.sy||1;
    var legL=mkLegAt(-1), legR=mkLegAt(1); rig.add(legL); rig.add(legR);
    rig.userData.legL=legL; rig.userData.legR=legR;

    /* ---- pelvis / hips (connects legs to torso) ---- */
    var pelvis=Loft([
      {y:P.hipY-0.075,rx:0.135*th,rz:0.088},
      {y:P.hipY+0.005,rx:0.155*th,rz:0.1},
      {y:P.waistY-0.03,rx:0.125*th,rz:0.082}
    ],(kit==="plate")?mats.armorDk:mats.clothDk,30); rig.add(pelvis);

    /* ---- torso (waist → chest → shoulders), one continuous loft ---- */
    var torso=new THREE.Group(); torso.position.y=P.waistY; rig.add(torso); rig.userData.torso=torso;
    rig.userData.torsoBaseY=P.waistY;
    var bodyMat=(kit==="plate")?mats.armor:(kit==="shade")?mats.clothDk:mats.cloth;
    var chestRel=P.chestY-P.waistY, shRel=P.shoulderY-P.waistY;
    torso.add(Loft([
      {y:-0.035,rx:0.126*th,rz:0.083},
      {y:0.09,rx:0.138*th,rz:0.09},
      {y:chestRel,rx:0.168*th,rz:0.105},
      {y:shRel-0.035,rx:0.175*th,rz:0.108},
      {y:shRel+0.035,rx:0.128*th,rz:0.085}
    ],bodyMat,34));
    /* trapezius bridge to shoulders */
    torso.add(Ball(P.shoulderW*0.95,0.055,0.085,bodyMat,0,shRel+0.01,0,22));

    /* ---- arms (shoulder → elbow → wrist chains, relaxed pose) ---- */
    function mkArmAt(side){
      /* v10: fully articulated - shoulder group -> elbowG subgroup -> hand.
         Rotating the shoulder or bending elbowG can never stretch geometry,
         because every piece lives inside the joint it belongs to. */
      var g=new THREE.Group(); g.position.set(P.shoulderW*side,P.shoulderY,0);
      var sleeves=(kit==="plate")?mats.armor:(kit==="robe")?mats.clothHi:(kit==="shade")?mats.clothDk:(kit==="doublet")?mats.clothHi:mats.cloth;
      var asy=P.sy||1;
      var elbow=[0.05*side,-0.27*asy,0.02];
      var wristRel=[0.016*side,-0.225*asy,0.075]; /* wrist relative to the elbow pivot */
      g.add(joint([0,0,0],0.072*th,(kit==="plate")?mats.armorHi:sleeves,1.0)); /* deltoid */
      g.add(seg3([0,0,0],elbow,0.062*th,0.047*th,sleeves,20));
      var elbowG=new THREE.Group(); elbowG.position.set(elbow[0],elbow[1],elbow[2]); g.add(elbowG); g.userData.elbow=elbowG;
      elbowG.add(joint([0,0,0],0.046*th,(kit==="plate")?mats.armorHi:sleeves));
      elbowG.add(seg3([0,0,0],wristRel,0.045*th,0.034*th,(kit==="plate")?mats.armorDk:sleeves,20));
      if(kit==="leathers"||kit==="shade"){ /* bracer */
        elbowG.add(seg3([wristRel[0]*0.35,wristRel[1]*0.35,wristRel[2]*0.35],[wristRel[0]*0.96,wristRel[1]*0.96,wristRel[2]*0.96],0.043*th,0.037*th,mats.leather,14));
      }
      if(kit==="robe"){ /* hanging sleeve cuff */
        elbowG.add(Loft([{y:wristRel[1]*0.55,rx:0.048*th,rz:0.044,x:wristRel[0]*0.55},{y:wristRel[1]*0.98,rx:0.066*th,rz:0.058,x:wristRel[0]*0.98}],mats.cloth,16));
      }
      elbowG.add(torus(0.037*th,0.008,(kit==="plate")?mats.trim:mats.leather,wristRel[0],wristRel[1]+0.015,wristRel[2],HPI*0.94,0,0));
      elbowG.add(torus(0.048*th,0.007,(kit==="plate")?mats.armorDk:mats.leatherHi,0,0.045,-0.004,HPI*0.9,0,0.1*side));
      g.add(Ball(0.008,0.008,0.006,mats.trim,0.012*side,-0.015,0.055,6));
      /* hand at the wrist, inside the elbow group */
      var hand=new THREE.Group(); hand.position.set(wristRel[0],wristRel[1],wristRel[2]); hand.scale.setScalar(0.82+0.18*asy);
      var palm=Ball(0.035,0.048,0.026,mats.skin,0.006*side,-0.035,0.006,16); hand.add(palm);
      for(var f=0;f<4;f++){
        var fx=(-0.018+f*0.013)*1.0;
        hand.add(seg3([fx*side,-0.055,0.01],[fx*side,-0.082,0.024],0.0068,0.006,mats.skin,10));
        hand.add(joint([fx*side,-0.083,0.025],0.0062,mats.skin));
        hand.add(seg3([fx*side,-0.083,0.025],[fx*side,-0.102,0.03],0.0058,0.005,mats.skin,8));
        hand.add(joint([fx*side,-0.104,0.031],0.005,mats.skin));
      }
      var thumb=seg3([-0.028*side,-0.038,0.018],[-0.046*side,-0.058,0.04],0.008,0.0062,mats.skin,10); hand.add(thumb);
      hand.add(joint([-0.047*side,-0.06,0.041],0.006,mats.skin));
      elbowG.add(hand); g.userData.hand=hand;
      return g;
    }
    var armL=mkArmAt(-1), armR=mkArmAt(1);
    armL.rotation.z=0.07; armR.rotation.z=-0.07; /* relaxed, slightly out */
    rig.add(armL); rig.add(armR); rig.userData.armL=armL; rig.userData.armR=armR;

    /* ---- neck + head ---- */
    rig.add(seg3([0,P.shoulderY+0.02,0.004],[0,P.headY-P.HR*0.72,0.012],0.048*th,0.042*th,mats.skin,16));
    var headG=new THREE.Group(); headG.position.y=P.headY; rig.add(headG); rig.userData.headG=headG;
    rig.userData.headBaseY=P.headY;
    /* light headgear (crowns/circlets/halos) keeps the hair; heavy helms hide it */
    var helmTxt=eq.helmet?gText(eq.helmet):"";
    var hideHair=!!eq.helmet && !(/crown|circlet|tiara|halo|tome|diadem|wreath/.test(helmTxt));
    mkHead(headG, mats, spec, t, hideHair, P.HR, race);

    /* ---- outfit layer + gear + accents ---- */
    addOutfit(rig, torso, mats, spec, P, kit, th, robe);
    addRaceBody(rig, mats, spec, race, P, th);
    addArmorGear(rig, spec, mats, torso, P, th);
    addHelmetGear(headG, spec, mats, P.HR);
    addWeapon(rig, spec, mats, P);
    addClassSignature(rig, torso, headG, spec, mats, P, th, kit);
    rig.userData.plan=P;
    return rig;
  }

  /* ---------------- head & face ---------------- */
  function mkHead(headG, mats, spec, t, hasHelmet, HR, race){
    var beast=/beastfolk|cat|wolf|lizard/.test(race);
    var catf=/cat/.test(race), wolff=/wolf/.test(race), liz=/lizard/.test(race);
    /* skull: cranium + cheeks + jaw taper */
    headG.add(Ball(HR*0.92,HR*1.0,HR*0.9,mats.skin,0,HR*0.1,-HR*0.06,30));
    headG.add(Loft([
      {y:-HR*0.62,rx:HR*0.36,rz:HR*0.42,z:HR*0.1},
      {y:-HR*0.3,rx:HR*0.62,rz:HR*0.6,z:HR*0.06},
      {y:HR*0.1,rx:HR*0.82,rz:HR*0.72,z:0}
    ],mats.skin,26));
    if(/orc|dwarf/.test(race)) headG.add(Ball(HR*0.5,HR*0.3,HR*0.34,mats.skin,0,-HR*0.5,HR*0.22,18)); /* heavy jaw */
    var fz=HR*0.78; /* face plane z */
    /* --- eyes with sockets, lids, catchlight --- */
    var ex=HR*0.33, ey=HR*0.12, eyeS=t.eyeShape==="round"?1.3:t.eyeShape==="sharp"?0.72:1.0;
    var lids=[];
    [-1,1].forEach(function(sg){
      headG.add(Ball(0.033*eyeS,0.026*eyeS,0.013,mats.eyeWhite,ex*sg,ey,fz,18));
      headG.add(Ball(0.017*eyeS,0.018*eyeS,0.008,mats.eye,ex*sg,ey-0.002,fz+0.012,14));
      headG.add(Ball(0.0075,0.008,0.005,mats.pupil,ex*sg,ey-0.002,fz+0.019,10));
      headG.add(Ball(0.0032,0.0032,0.002,mats.eyeWhite,ex*sg+0.007,ey+0.006,fz+0.022,8));
      var lid=Ball(0.034*eyeS,0.0085,0.015,mats.skinDk,ex*sg,ey+0.026,fz+0.003,14); lid.userData.baseY=ey+0.026; lids.push(lid); headG.add(lid);
      headG.add(Ball(0.03*eyeS,0.005,0.012,mats.skinDk,ex*sg,ey-0.024,fz+0.001,12));
      /* brow */
      var brow=seg3([ex*sg-0.027*sg,ey+0.054,fz+0.012],[ex*sg+0.03*sg,ey+0.046+(t.face==="scar"?0.01:0),fz+0.006],0.009,0.006,mats.hair,10);
      if(/undead/.test(race)) brow.visible=false;
      headG.add(brow);
    });
    headG.userData.lids=lids;
    /* --- nose / muzzle --- */
    if(beast&&!liz){
      var muzzle=Loft([{y:-HR*0.18,rx:HR*0.3,rz:HR*0.26,z:HR*0.55},{y:-HR*0.08,rx:HR*0.34,rz:HR*0.3,z:HR*0.42},{y:HR*0.06,rx:HR*0.2,rz:HR*0.16,z:HR*0.42}],mats.skin,20);
      headG.add(muzzle);
      headG.add(Ball(0.022,0.015,0.014,mats.pupil,0,-HR*0.02,HR*0.95,10)); /* nose pad */
      headG.add(cone(0.007,0.03,mats.teeth,-0.028,-HR*0.32,HR*0.78,Math.PI,0,0,6));
      headG.add(cone(0.007,0.03,mats.teeth,0.028,-HR*0.32,HR*0.78,Math.PI,0,0,6));
    } else if(liz){
      headG.add(Loft([{y:-HR*0.2,rx:HR*0.3,rz:HR*0.2,z:HR*0.6},{y:-HR*0.02,rx:HR*0.36,rz:HR*0.26,z:HR*0.44},{y:HR*0.1,rx:HR*0.22,rz:HR*0.16,z:HR*0.4}],mats.skin,18));
      [-1,1].forEach(function(sg){ headG.add(Ball(0.008,0.006,0.004,mats.pupil,0.03*sg,-HR*0.06,HR*0.98,8)); });
      /* head crest fins */
      [0,-1,1].forEach(function(o){ var fin=cone(0.05,HR*0.7,mats.trimGlow,o*HR*0.4,HR*0.75,-HR*0.25,-0.5,0,o*0.35,4); fin.scale.z=0.24; headG.add(fin); });
    } else {
      headG.add(seg3([0,ey+0.02,fz+0.006],[0,-HR*0.12,fz+0.028],0.0095,0.014,mats.skin,10));
      headG.add(Ball(0.019,0.014,0.015,mats.skin,0,-HR*0.15,fz+0.026,12));
      [-1,1].forEach(function(sg){ headG.add(Ball(0.007,0.005,0.005,mats.skinDk,0.013*sg,-HR*0.17,fz+0.024,8)); });
    }
    /* --- mouth by expression --- */
    var my=-HR*0.4, face=t.face||"calm";
    if(beast&&!liz){ /* muzzle already carries the expression */
      if(face==="warpaint"){ [-1,1].forEach(function(sg){ headG.add(panel(0.016,HR*0.5,0.008,mats.trimGlow,HR*0.42*sg,ey+0.02,fz*0.8,0,0,0.12*sg)); }); }
    } else if(face==="smile"){
      headG.add(torus(0.042,0.006,mats.mouth,0,my+0.016,fz*0.94,0,0,Math.PI,Math.PI));
      [-1,1].forEach(function(sg){ headG.add(Ball(0.015,0.01,0.008,mats.skinDk,0.05*sg,my+0.024,fz*0.9,10)); });
    } else if(face==="scar"){
      headG.add(panel(0.042,0.0055,0.01,mats.mouth,0.004,my,fz*0.94,0,0,-0.06));
      var scar=seg3([HR*0.36,ey+0.12,fz*0.88],[HR*0.12,my+0.02,fz*0.96],0.0065,0.0065,mats.mouth,6); headG.add(scar);
      [-0.25,0,0.25].forEach(function(o){ headG.add(panel(0.02,0.004,0.006,mats.mouth,HR*0.24+o*0.02,ey+0.06+o*HR*0.28,fz*0.93,0,0,1.15)); });
    } else if(face==="warpaint"){
      headG.add(panel(0.04,0.006,0.01,mats.mouth,0,my,fz*0.94));
      [-1,1].forEach(function(sg){
        headG.add(panel(0.016,HR*0.55,0.008,mats.trimGlow,HR*0.36*sg,ey-0.02,fz*0.92,0,0,0.12*sg));
      });
    } else {
      headG.add(panel(0.036,0.0045,0.008,mats.mouth,0,my,fz*0.94));
      headG.add(panel(0.026,0.003,0.006,mats.skinDk,0,my-0.011,fz*0.9));
    }
    /* --- race kits (head) --- */
    if(/elf|fae/.test(race)){
      [-1,1].forEach(function(sg){
        var ear=Loft([{y:-0.012,rx:0.015,rz:0.022},{y:0.03,rx:0.011,rz:0.016},{y:0.072,rx:0.004,rz:0.007}],mats.skin,10);
        ear.position.set(HR*0.84*sg,HR*0.02,-HR*0.04); ear.rotation.z=-1.15*sg; ear.rotation.y=0.3*sg; headG.add(ear);
      });
    } else if(/goblin/.test(race)){
      [-1,1].forEach(function(sg){
        var ear=Loft([{y:-0.02,rx:0.02,rz:0.038},{y:0.05,rx:0.016,rz:0.03},{y:0.13,rx:0.005,rz:0.01}],mats.skin,10);
        ear.position.set(HR*0.88*sg,HR*0.12,-HR*0.1); ear.rotation.z=-1.15*sg; ear.rotation.x=-0.25; headG.add(ear);
      });
      headG.add(cone(0.0055,0.02,mats.teeth,0.02,my-0.004,fz*0.93,0.2,0,0,5));
    } else if(beast&&!liz){
      [-1,1].forEach(function(sg){
        var ear=Loft([{y:0,rx:0.035,rz:0.02},{y:0.07,rx:0.02,rz:0.012},{y:0.11,rx:0.004,rz:0.004}],mats.skin,10);
        ear.position.set(HR*0.55*sg,HR*0.82,-HR*0.15); ear.rotation.z=-0.3*sg; headG.add(ear);
        var inner=cone(0.013,0.05,mats.skinDk,HR*0.55*sg,HR*0.85,-HR*0.13,0.15,0,-0.3*sg,8); headG.add(inner);
        if(catf){ for(var w=0;w<3;w++){ var wh=seg3([HR*0.34*sg,-HR*0.3+w*0.011,HR*0.62],[HR*0.9*sg,-HR*0.28+w*0.02,HR*0.46],0.0015,0.001,mats.eyeWhite,4); headG.add(wh); } }
      });
    } else if(!/undead/.test(race)){
      [-1,1].forEach(function(sg){
        headG.add(Ball(0.02,0.036,0.024,mats.skin,HR*0.88*sg,-HR*0.02,-HR*0.04,12));
        headG.add(Ball(0.01,0.02,0.012,mats.skinDk,HR*0.9*sg,-HR*0.03,-HR*0.02,8));
      });
    }
    if(/orc/.test(race)){
      [-1,1].forEach(function(sg){ headG.add(cone(0.011,0.05,mats.teeth,0.042*sg,my-0.005,fz*0.9,0.22,0,-0.1*sg,7)); });
    }
    if(/demon/.test(race)){
      [-1,1].forEach(function(sg){
        var h1=seg3([HR*0.5*sg,HR*0.72,-HR*0.1],[HR*0.78*sg,HR*1.15,-HR*0.28],0.026,0.016,mats.trim,10);
        var h2=seg3([HR*0.78*sg,HR*1.15,-HR*0.28],[HR*0.7*sg,HR*1.5,-HR*0.05],0.015,0.004,mats.trim,10);
        headG.add(h1); headG.add(h2);
      });
    }
    if(/dwarf/.test(race)){
      var beard=Loft([
        {y:-HR*1.35,rx:HR*0.3,rz:HR*0.2,z:HR*0.3},
        {y:-HR*0.9,rx:HR*0.55,rz:HR*0.34,z:HR*0.3},
        {y:-HR*0.45,rx:HR*0.68,rz:HR*0.4,z:HR*0.16},
        {y:-HR*0.2,rx:HR*0.72,rz:HR*0.4,z:HR*0.05}
      ],mats.hair,22); headG.add(beard);
      headG.add(torus(0.024,0.008,mats.trim,0,-HR*1.1,HR*0.34,0.1,0,0));
      [-1,1].forEach(function(sg){ headG.add(Ball(0.05,0.09,0.04,mats.hair,HR*0.5*sg,-HR*0.5,HR*0.42,12)); }); /* mustache */
    }
    if(/undead/.test(race)){
      [-1,1].forEach(function(sg){
        headG.add(Ball(0.034,0.026,0.01,mats.pupil,ex*sg,ey,fz-0.004,12)); /* hollow sockets behind */
        headG.add(Ball(HR*0.16,HR*0.1,HR*0.06,mats.skinDk,HR*0.42*sg,-HR*0.2,HR*0.5,10)); /* gaunt cheeks */
      });
      var stitch=seg3([-HR*0.3,HR*0.55,fz*0.72],[HR*0.1,HR*0.7,fz*0.6],0.003,0.003,mats.pupil,4); headG.add(stitch);
    }
    if(/fae/.test(race)){
      [-1,1].forEach(function(sg){
        var ant=seg3([HR*0.25*sg,HR*0.9,HR*0.2],[HR*0.45*sg,HR*1.35,HR*0.3],0.004,0.002,mats.hair,6);
        headG.add(ant); headG.add(Ball(0.012,0.012,0.012,mats.energy,HR*0.45*sg,HR*1.37,HR*0.3,8));
      });
    }
    if(!hasHelmet) mkHair(headG, t.hair||"short", mats, HR, race);
  }

  function mkHair(headG, style, mats, HR, race){
    var hm=mats.hair, hd=mats.hairDk;
    if(/undead/.test(String(race))&&style!=="long") style="shaved";
    if(style==="shaved"||style==="bald"){
      if(style==="shaved") headG.add(Ball(HR*0.9,HR*0.88,HR*0.88,hd,0,HR*0.16,-HR*0.07,24)).material=hd;
      return;
    }
    if(style==="mohawk"){
      headG.add(Ball(HR*0.9,HR*0.86,HR*0.86,hd,0,HR*0.16,-HR*0.07,24));
      for(var i=0;i<6;i++){
        var fy=HR*(0.85-i*0.06), fz2=HR*(0.55-i*0.26);
        var fin=cone(0.045,HR*(0.75-i*0.06),hm,0,fy+HR*0.3,fz2,-0.25+i*0.12,0,0,4); fin.scale.z=0.3; headG.add(fin);
      }
      return;
    }
    /* base cap that hugs the cranium — hairline stays above the brow */
    headG.add(Loft([
      {y:HR*0.18,rx:HR*0.97,rz:HR*0.9,z:-HR*0.18},
      {y:HR*0.48,rx:HR*0.9,rz:HR*0.84,z:-HR*0.16},
      {y:HR*0.82,rx:HR*0.6,rz:HR*0.56,z:-HR*0.14},
      {y:HR*1.02,rx:HR*0.18,rz:HR*0.18,z:-HR*0.1}
    ],hm,26));
    /* back fill so the cap doesn't float */
    headG.add(Ball(HR*0.88,HR*0.62,HR*0.6,hm,0,HR*0.28,-HR*0.42,20));
    /* front fringe tufts along the hairline */
    [-0.4,-0.15,0.12,0.38].forEach(function(fx,i){
      var tuft=Ball(HR*0.17,HR*0.09,HR*0.1,i%2?hm:hd,HR*fx,HR*0.58,HR*0.63,12);
      tuft.rotation.x=-0.5; headG.add(tuft);
    });
    if(/long/.test(style)){
      headG.add(Loft([
        {y:-HR*1.15,rx:HR*0.42,rz:HR*0.2,z:-HR*0.55},
        {y:-HR*0.5,rx:HR*0.58,rz:HR*0.3,z:-HR*0.5},
        {y:HR*0.1,rx:HR*0.8,rz:HR*0.45,z:-HR*0.3}
      ],hm,22));
      [-1,1].forEach(function(sg){ headG.add(Ball(HR*0.12,HR*0.46,HR*0.12,hd,HR*0.78*sg,-HR*0.4,HR*0.04,12)); });
    }
    if(/braid/.test(style)){
      [-1,1].forEach(function(sg){
        var px=HR*0.7*sg;
        for(var b=0;b<4;b++){ headG.add(Ball(0.026-b*0.003,0.034,0.026-b*0.003,b%2?hm:hd,px,-HR*(0.1+b*0.32),HR*0.1,10)); }
        headG.add(torus(0.014,0.005,mats.trim,px,-HR*1.06,HR*0.1,HPI,0,0));
      });
    }
    if(/top|bun|knot/.test(style)){
      headG.add(Ball(HR*0.26,HR*0.22,HR*0.26,hm,0,HR*1.05,-HR*0.15,14));
      headG.add(torus(0.02,0.006,mats.trim,0,HR*0.92,-HR*0.15,0.2,0,0));
    }
  }

  /* ---------------- outfit layer per class ---------------- */
  function addOutfit(rig, torso, mats, spec, P, kit, th, robe){
    var shRel=P.shoulderY-P.waistY, chestRel=P.chestY-P.waistY;
    /* belt with buckle — everyone */
    torso.add(Loft([{y:-0.005,rx:0.132*th,rz:0.088},{y:0.045,rx:0.138*th,rz:0.092}],mats.leather,30));
    torso.add(panel(0.044,0.036,0.018,mats.trim,0,0.02,0.097));
    [-1,1].forEach(function(sg){ torso.add(Ball(0.008,0.008,0.006,mats.trim,0.09*th*sg,0.02,0.075,6)); });
    if(kit==="leathers"||kit==="shade"||kit==="wraps"){ torso.add(panel(0.052,0.06,0.03,mats.leatherHi,0.1*th,-0.045,0.07,0.08,0,-0.05)); torso.add(panel(0.05,0.016,0.032,mats.leather,0.1*th,-0.02,0.072,0.08,0,-0.05)); }
    if(kit==="plate"){
      /* cuirass front plate w/ center ridge */
      torso.add(Loft([{y:0.06,rx:0.118*th,rz:0.02,z:0.092},{y:chestRel,rx:0.155*th,rz:0.028,z:0.1},{y:shRel-0.05,rx:0.135*th,rz:0.022,z:0.09}],mats.armorHi,26));
      torso.add(panel(0.016,0.36,0.02,mats.trim,0,chestRel-0.05,0.128,0.06,0,0));
      /* abdomen lames */
      [0.09,0.155].forEach(function(y){ torso.add(Loft([{y:y-0.025,rx:0.128*th,rz:0.086},{y:y+0.005,rx:0.133*th,rz:0.09}],mats.armorDk,26)); });
      /* pauldrons — layered, ON the shoulders (skip when an armor item overlays its own) */
      if(!(spec.equipped&&spec.equipped.armor)) [-1,1].forEach(function(sg){
        var sp=new THREE.Group(); sp.position.set(P.shoulderW*sg,shRel+0.015,0);
        sp.add(Ball(0.092*th,0.062,0.088,mats.armorHi,0,0.012,0,20));
        sp.add(Loft([{y:-0.045,rx:0.088*th,rz:0.082},{y:-0.004,rx:0.098*th,rz:0.088}],mats.armor,18));
        sp.add(Loft([{y:-0.085,rx:0.075*th,rz:0.072},{y:-0.045,rx:0.086*th,rz:0.079}],mats.armorDk,16));
        sp.add(Ball(0.016,0.016,0.016,mats.trim,0,0.062,0.018,10));
        torso.add(sp);
      });
      /* tassets on the hips + a center fauld plate */
      [-1,1].forEach(function(sg){
        var tas=panel(0.075*th,0.125,0.018,mats.armor,0.125*th*sg,-0.055,0.03,0.15,0.55*sg,-0.1*sg);
        torso.add(tas);
        torso.add(panel(0.05*th,0.09,0.014,mats.armorDk,0.15*th*sg,-0.09,-0.01,0.15,0.9*sg,-0.2*sg));
      });
      torso.add(panel(0.07*th,0.1,0.016,mats.armorHi,0,-0.075,0.088,0.22,0,0));
      torso.add(panel(0.02,0.08,0.018,mats.trim,0,-0.07,0.096,0.22,0,0));
    } else if(kit==="robe"){
      /* long skirt from waist to near ground */
      var skirt=Loft([
        {y:-P.waistY+0.06,rx:0.24*th,rz:0.2},
        {y:-P.waistY+0.45,rx:0.19*th,rz:0.15},
        {y:-0.02,rx:0.135*th,rz:0.09}
      ],mats.cloth,30); torso.add(skirt); torso.userData.skirt=skirt; rig.userData.robed=true;
      torso.add(Loft([{y:-P.waistY+0.055,rx:0.242*th,rz:0.202},{y:-P.waistY+0.2,rx:0.215*th,rz:0.175}],mats.clothDk,30));
      /* sash */
      var sash=seg3([-0.1*th,0.06,0.09],[0.12*th,-P.waistY+0.62,0.12],0.024,0.03,mats.clothHi,12); torso.add(sash);
      /* rune trim */
      torso.add(torus(0.152*th,0.007,mats.trimGlow,0,chestRel-0.06,0.01,HPI*0.88,0,0));
      /* shoulder mantle */
      torso.add(Loft([{y:shRel-0.09,rx:0.2*th,rz:0.13},{y:shRel+0.02,rx:0.145*th,rz:0.095},{y:shRel+0.06,rx:0.1*th,rz:0.075}],mats.clothDk,26));
    } else if(kit==="doublet"){
      /* bard: fitted doublet with button line + half cape */
      torso.add(Loft([{y:0.05,rx:0.128*th,rz:0.087,z:0.01},{y:chestRel,rx:0.162*th,rz:0.1,z:0.012},{y:shRel-0.06,rx:0.15*th,rz:0.095,z:0.008}],mats.clothHi,28));
      for(var b=0;b<4;b++){ torso.add(Ball(0.008,0.008,0.006,mats.trim,0.012,0.09+b*0.075,0.105+b*0.004,8)); }
      torso.add(seg3([-0.02,shRel-0.02,0.09],[-0.14*th,0.05,0.1],0.008,0.008,mats.leather,8)); /* strap for lute */
      var cape=Loft([{y:-0.15,rx:0.19*th,rz:0.05,x:0.12*th,z:-0.1},{y:shRel-0.04,rx:0.12*th,rz:0.03,x:0.09*th,z:-0.08}],mats.cloak,16);
      torso.add(cape);
    } else if(kit==="shade"){
      /* rogue: layered dark wraps + scarf + crossed belts */
      torso.add(Loft([{y:0.06,rx:0.127*th,rz:0.086},{y:chestRel+0.02,rx:0.165*th,rz:0.102},{y:shRel-0.04,rx:0.14*th,rz:0.09}],mats.clothDk,28));
      torso.add(Loft([{y:shRel-0.06,rx:0.15*th,rz:0.1},{y:shRel+0.045,rx:0.11*th,rz:0.085}],mats.cloth,22)); /* scarf collar */
      torso.add(seg3([-0.13*th,shRel-0.08,0.06],[0.12*th,0.03,0.1],0.009,0.009,mats.leather,10));
      torso.add(seg3([0.13*th,shRel-0.08,0.06],[-0.12*th,0.03,0.1],0.009,0.009,mats.leather,10));
      torso.add(panel(0.03,0.03,0.014,mats.trim,0,chestRel-0.12,0.108,0,0,0.78));
      /* thigh pouch */
      rig.add(panel(0.05,0.06,0.03,mats.leather,P.legSpread+0.05,P.hipY-0.12,0.03,0,0,-0.06));
    } else if(kit==="wraps"){
      torso.add(Loft([{y:0.05,rx:0.126*th,rz:0.085},{y:chestRel,rx:0.16*th,rz:0.1},{y:shRel-0.05,rx:0.135*th,rz:0.088}],mats.clothHi,28));
      [0.1,0.2,0.3].forEach(function(y){ torso.add(torus(0.145*th,0.008,mats.cloth,0,y,0,HPI*0.94,0,0.2)); });
      /* prayer beads */
      for(var i=0;i<9;i++){ var a=-0.8+i*0.2; torso.add(Ball(0.014,0.014,0.014,i%3?mats.leather:mats.trim,Math.sin(a)*0.13*th,chestRel-0.06-Math.abs(Math.cos(a))*0.05,0.1+Math.cos(a)*0.02,8)); }
    } else { /* leathers — ranger/druid */
      torso.add(Loft([{y:0.05,rx:0.13*th,rz:0.088,z:0.005},{y:chestRel,rx:0.165*th,rz:0.103,z:0.006},{y:shRel-0.05,rx:0.142*th,rz:0.09,z:0.004}],mats.leather,28));
      /* stitched panels + studs */
      [-1,1].forEach(function(sg){
        torso.add(seg3([0.1*th*sg,0.08,0.095],[0.085*th*sg,chestRel+0.04,0.1],0.004,0.004,mats.leatherHi,6));
        for(var s2=0;s2<3;s2++){ torso.add(Ball(0.006,0.006,0.004,mats.trim,0.115*th*sg,0.12+s2*0.1,0.1,6)); }
      });
      /* hood down behind neck */
      torso.add(Loft([{y:shRel-0.06,rx:0.13*th,rz:0.06,z:-0.08},{y:shRel+0.03,rx:0.1*th,rz:0.05,z:-0.11},{y:shRel+0.08,rx:0.05,rz:0.03,z:-0.13}],mats.cloth,18));
      /* shoulder wrap */
      torso.add(Loft([{y:shRel-0.03,rx:0.185*th,rz:0.12},{y:shRel+0.04,rx:0.12*th,rz:0.08}],mats.clothDk,22));
    }
    /* cloak for classes with capes (or armor equipped) */
    var wantCloak=(kit==="plate"||kit==="robe"||!!(spec.equipped&&spec.equipped.armor));
    if(wantCloak&&spec.colors.cloak){
      var ck=Loft([
        {y:-P.waistY+0.12,rx:0.26*th,rz:0.045,z:-0.1},
        {y:-P.waistY+0.7,rx:0.24*th,rz:0.05,z:-0.13},
        {y:chestRel+0.02,rx:0.19*th,rz:0.04,z:-0.115},
        {y:shRel+0.01,rx:0.12*th,rz:0.03,z:-0.075}
      ],mats.cloak,24);
      torso.add(ck); rig.userData.cloak=ck;
      [-1,1].forEach(function(sg){ torso.add(Ball(0.018,0.018,0.014,mats.trim,0.1*th*sg,shRel-0.005,0.075,10)); });
      torso.add(seg3([-0.1*th,shRel-0.005,0.08],[0.1*th,shRel-0.005,0.08],0.006,0.006,mats.trim,8));
    }
  }

  /* ---------------- race body extras ---------------- */
  function addRaceBody(rig, mats, spec, race, P, th){
    if(/beastfolk|cat|wolf/.test(race)){
      var tail=new THREE.Group(); tail.position.set(0,P.hipY+0.02,-0.1);
      var pts=[[0,0,0],[0.02,-0.12,-0.14],[0.01,-0.05,-0.3],[0,0.12,-0.42]];
      for(var i=0;i<pts.length-1;i++){ tail.add(seg3(pts[i],pts[i+1],0.028-i*0.005,0.024-i*0.005,mats.hair,12)); tail.add(joint(pts[i+1],0.024-i*0.005,mats.hair)); }
      if(/cat/.test(race)) tail.add(Ball(0.02,0.03,0.02,mats.hairDk,0,0.13,-0.43,10));
      else tail.add(Ball(0.034,0.05,0.034,mats.hairDk,0,0.13,-0.43,10));
      rig.add(tail); rig.userData.tail=tail;
      /* neck ruff */
      rig.add(Loft([{y:P.shoulderY-0.03,rx:0.15*th,rz:0.1},{y:P.shoulderY+0.05,rx:0.11*th,rz:0.08}],mats.hair,20));
    }
    if(/lizard/.test(race)){
      var ltail=new THREE.Group(); ltail.position.set(0,P.hipY-0.02,-0.08);
      var lp=[[0,0,0],[0,-0.16,-0.16],[0,-0.3,-0.34],[0,-0.36,-0.52]];
      for(var j=0;j<lp.length-1;j++){ ltail.add(seg3(lp[j],lp[j+1],0.05-j*0.013,0.038-j*0.013,mats.skin,12)); }
      rig.add(ltail); rig.userData.tail=ltail;
      for(var k2=0;k2<4;k2++){ rig.add(cone(0.016,0.05,mats.trimGlow,0,P.hipY-0.02-k2*0.09,-0.12-k2*0.11,-0.6,0,0,4)); }
    }
    if(/demon/.test(race)){
      var dt=new THREE.Group(); dt.position.set(0,P.hipY-0.01,-0.09);
      var dp=[[0,0,0],[0.04,-0.18,-0.14],[0.02,-0.3,-0.3],[-0.02,-0.22,-0.44]];
      for(var d=0;d<dp.length-1;d++){ dt.add(seg3(dp[d],dp[d+1],0.02-d*0.004,0.016-d*0.004,mats.skinDk,10)); }
      var spade=cone(0.03,0.06,mats.skinDk,-0.03,-0.2,-0.47,0.7,0,0,4); spade.scale.z=0.4; dt.add(spade);
      rig.add(dt); rig.userData.tail=dt;
    }
    if(/fae/.test(race)){
      var wm=new THREE.MeshStandardMaterial({ color:col(spec.colors.accent,"#a5f3fc"), roughness:0.2, metalness:0.05, transparent:true, opacity:0.42, side:THREE.DoubleSide, emissive:col(spec.colors.accent,"#a5f3fc").multiplyScalar(0.3) }); R.disposables.push(wm);
      rig.userData.wings=[];
      [-1,1].forEach(function(sg){
        var wg=new THREE.Group(); wg.position.set(0.05*sg,P.shoulderY-0.04,-0.1);
        var upper=new THREE.Mesh(loftGeometry([{y:0,rx:0.02,rz:0.01},{y:0.16,rx:0.14,rz:0.02,x:0.12*sg},{y:0.3,rx:0.05,rz:0.01,x:0.22*sg}],14),wm); R.disposables.push(upper.geometry);
        upper.castShadow=true; wg.add(upper);
        var lower=new THREE.Mesh(loftGeometry([{y:0,rx:0.02,rz:0.01},{y:-0.14,rx:0.1,rz:0.016,x:0.1*sg},{y:-0.24,rx:0.03,rz:0.008,x:0.16*sg}],12),wm); R.disposables.push(lower.geometry);
        lower.castShadow=true; wg.add(lower);
        wg.rotation.y=0.5*sg; wg.rotation.x=0.18; wg.scale.setScalar(0.9); rig.add(wg); rig.userData.wings.push(wg);
      });
    }
  }

  /* ---------------- equipped gear ---------------- */
  function weaponKind(id){
    id=String(id||"").toLowerCase();
    if (/axe/.test(id)) return "axe";
    if (/greatsword|claymore|sunder/.test(id)) return "great";
    if (/scythe/.test(id)) return "scythe";
    if (/spear|lance|trident|halberd|glaive|pike/.test(id)) return "spear";
    if (/hammer|maul|mace|cudgel|pick/.test(id)) return "heavy";
    if (/bow/.test(id)) return "bow";
    if (/staff|scepter|rod|quill/.test(id)) return "staff";
    if (/wand/.test(id)) return "wand";
    if (/orb|crystal ball|seer/.test(id)) return "orb";
    if (/lute|harp|lyre/.test(id)) return "lute";
    if (/tome|book|grimoire/.test(id)) return "tome";
    if (/dagger|shiv|knife/.test(id)) return "dagger";
    if (/dual/.test(id)) return "dual";
    return "sword";
  }
  function mkBlade(metal, gem, mats, len, wide){
    var s=new THREE.Group();
    var bl=Loft([{y:0,rx:wide,rz:0.008},{y:len*0.75,rx:wide*0.92,rz:0.007},{y:len,rx:0.004,rz:0.002}],metal,10);
    s.add(bl);
    s.add(panel(0.006,len*0.72,0.004,mats.dark,0,len*0.38,0)); /* fuller */
    var guard=panel(wide*4.6,0.022,0.03,mats.trim,0,-0.012,0);
    guard.add(Ball(0.014,0.014,0.014,gem,wide*2.3,0,0,8)); guard.add(Ball(0.014,0.014,0.014,gem,-wide*2.3,0,0,8));
    s.add(guard);
    var grip=seg3([0,-0.03,0],[0,-0.15,0],0.014,0.016,mats.leather,10); s.add(grip);
    for(var i2=0;i2<3;i2++){ s.add(torus(0.016,0.003,mats.trim,0,-0.05-i2*0.033,0,HPI,0,0)); }
    s.add(Ball(0.022,0.026,0.022,gem,0,-0.175,0,10));
    return s;
  }
  function addWeapon(rig, spec, mats, P){
    var w=spec.equipped&&spec.equipped.weapon; if(!w){ rig.userData.weaponKind="none"; return; }
    var armR=rig.userData.armR, armL=rig.userData.armL; if(!armR) return;
    var metal=gMetal(w,"#dde7f2"), gem=gGem(w,"#9fd8ff"), kind=weaponKind(gText(w));
    rig.userData.weaponKind=kind;
    var handR=armR.userData.hand, handL=armL&&armL.userData.hand;
    function grip(group, hand, rx){
      var side=(hand===handL)?-1:1;
      group.rotation.x=(rx===undefined?-0.42:rx); group.rotation.z=-0.3*side;
      group.position.set(0.008*side,-0.05,0.032); hand.add(group);
    }
    if(kind==="sword"){ grip(mkBlade(metal,gem,mats,0.62,0.02), handR); }
    else if(kind==="great"){ var g2=mkBlade(metal,gem,mats,0.85,0.03); g2.scale.setScalar(1.05); grip(g2,handR,-0.2); }
    else if(kind==="dagger"){ var dg=mkBlade(metal,gem,mats,0.3,0.016); grip(dg,handR,0.6); }
    else if(kind==="dual"){ grip(mkBlade(metal,gem,mats,0.44,0.017),handR); if(handL){ var off=mkBlade(metal,gem,mats,0.44,0.017); grip(off,handL); } }
    else if(kind==="axe"){
      var ax=new THREE.Group();
      ax.add(seg3([0,-0.16,0],[0,0.55,0],0.015,0.013,mats.leather,10));
      var head=Loft([{y:0,rx:0.03,rz:0.02},{y:0.09,rx:0.16,rz:0.014},{y:0.18,rx:0.03,rz:0.02}],metal,12);
      head.rotation.z=-HPI; head.position.set(0.055,0.42,0); ax.add(head);
      ax.add(Ball(0.024,0.024,0.02,gem,-0.02,0.42,0,10));
      ax.add(cone(0.02,0.07,metal,0,0.6,0,0,0,0,6));
      [0.05,0.12].forEach(function(y){ ax.add(torus(0.017,0.004,mats.trim,0,y,0,HPI,0,0)); });
      grip(ax,handR,-0.2);
    }
    else if(kind==="heavy"){
      var hm2=new THREE.Group();
      hm2.add(seg3([0,-0.16,0],[0,0.5,0],0.016,0.014,mats.leather,10));
      hm2.add(panel(0.19,0.11,0.11,metal,0,0.46,0));
      hm2.add(Ball(0.03,0.03,0.03,gem,0,0.46,0.062,10));
      [-1,1].forEach(function(sg){ hm2.add(torus(0.045,0.008,mats.trim,0.095*sg,0.46,0,0,HPI,0)); });
      grip(hm2,handR,-0.2);
    }
    else if(kind==="spear"){
      var sp2=new THREE.Group();
      sp2.add(seg3([0,-0.35,0],[0,0.75,0],0.012,0.011,mats.leather,10));
      sp2.add(cone(0.032,0.16,metal,0,0.84,0,0,0,0,8));
      sp2.add(Ball(0.02,0.02,0.02,gem,0,0.74,0,8));
      sp2.add(torus(0.014,0.004,mats.trim,0,0.7,0,HPI,0,0));
      grip(sp2,handR,-0.12);
    }
    else if(kind==="scythe"){
      var sc=new THREE.Group();
      sc.add(seg3([0,-0.35,0],[0,0.75,0],0.013,0.011,mats.leather,10));
      sc.add(torus(0.015,0.005,mats.trim,0,0.4,0,HPI,0,0));
      sc.add(Ball(0.022,0.022,0.022,gem,0,0.76,0,10));
      /* curved blade: tapered chords sweeping out and down from the shaft top */
      var bl=[[0,0.75,0],[0.13,0.735,0],[0.24,0.67,0],[0.31,0.56,0],[0.33,0.44,0]];
      for(var sci=0;sci<bl.length-1;sci++){ sc.add(seg3(bl[sci],bl[sci+1],0.026-sci*0.005,0.02-sci*0.005,metal,8)); }
      sc.add(cone(0.014,0.06,metal,0.335,0.4,0,Math.PI,0,0,5));
      sc.add(cone(0.012,0.07,metal,-0.05,0.75,0,0,0,1.9,5)); /* back spike */
      grip(sc,handR,-0.15);
    }
    else if(kind==="bow"){
      if(handL){
        var bw2=new THREE.Group();
        /* recurve limbs built from segments: grip at origin, tips at ±0.34 */
        var lim=[[0,0.03,0],[0.012,0.14,0.02],[0.0,0.26,0.045],[-0.02,0.34,0.03]];
        for(var bi2=0;bi2<lim.length-1;bi2++){
          bw2.add(seg3(lim[bi2],lim[bi2+1],0.011-bi2*0.002,0.009-bi2*0.002,metal,8));
          var mirA=[lim[bi2][0],-lim[bi2][1],lim[bi2][2]], mirB=[lim[bi2+1][0],-lim[bi2+1][1],lim[bi2+1][2]];
          bw2.add(seg3(mirA,mirB,0.011-bi2*0.002,0.009-bi2*0.002,metal,8));
        }
        bw2.add(seg3([-0.02,0.34,0.03],[-0.02,-0.34,0.03],0.0022,0.0022,mats.eyeWhite,4)); /* string */
        bw2.add(seg3([0,-0.035,0],[0,0.035,0],0.014,0.014,mats.leather,10)); /* grip wrap */
        bw2.add(Ball(0.012,0.012,0.012,gem,0,0.0,0.012,8));
        bw2.rotation.set(-0.15,0.35,0); bw2.position.set(-0.01,-0.055,0.035); handL.add(bw2);
      }
      var qv=new THREE.Group(); qv.position.set(-0.08,P.chestY,-0.13); qv.rotation.z=-0.35;
      qv.add(seg3([0,-0.16,0],[0,0.16,0],0.045,0.05,mats.leather,12));
      for(var a2=0;a2<3;a2++){ qv.add(seg3([-0.02+a2*0.02,0.1,0],[-0.02+a2*0.02,0.3,0],0.004,0.004,metal,5)); qv.add(cone(0.012,0.03,gem,-0.02+a2*0.02,0.32,0,0,0,0,4)); }
      rig.add(qv);
    }
    else if(kind==="staff"){
      var st=new THREE.Group();
      st.add(seg3([0,-0.5,0],[0,0.62,0],0.014,0.011,mats.leather,12));
      var claw=Loft([{y:0.6,rx:0.02,rz:0.02},{y:0.68,rx:0.05,rz:0.05},{y:0.76,rx:0.028,rz:0.028}],metal,10); st.add(claw);
      st.add(Ball(0.05,0.05,0.05,gem,0,0.76,0,16));
      var ring1=torus(0.075,0.005,metal,0,0.76,0,0.4,0,0); st.add(ring1); st.userData.spin=ring1;
      st.add(torus(0.016,0.005,mats.trim,0,0.5,0,HPI,0,0));
      grip(st,handR,-0.08);
    }
    else if(kind==="wand"){
      var wd=new THREE.Group();
      wd.add(seg3([0,-0.08,0],[0,0.22,0],0.009,0.006,mats.leather,8));
      wd.add(Ball(0.02,0.02,0.02,gem,0,0.25,0,10));
      [-1,1].forEach(function(sg){ wd.add(cone(0.007,0.03,metal,0.017*sg,0.24,0,0,0,-0.7*sg,4)); });
      grip(wd,handR,0.2);
    }
    else if(kind==="orb"){
      var obHand=handL||handR;
      var ob=new THREE.Group(); ob.add(Ball(0.055,0.055,0.055,gem,0,0,0,20)); ob.add(torus(0.075,0.005,metal,0,0,0,0.6,0,0));
      ob.position.set(0,-0.14,0.05); obHand.add(ob);
    }
    else if(kind==="lute"){
      var lu=new THREE.Group();
      lu.add(Ball(0.09,0.12,0.035,mats.leatherHi,0,0,0,18));
      lu.add(Ball(0.045,0.045,0.02,mats.dark,0,0.03,0.03,12));
      lu.add(seg3([0,0.1,0.01],[0,0.34,0.02],0.014,0.012,mats.leather,8));
      lu.add(panel(0.045,0.05,0.02,mats.leather,0,0.36,0.02,0.15,0,0));
      for(var st2=0;st2<4;st2++){ lu.add(seg3([-0.012+st2*0.008,-0.05,0.037],[-0.012+st2*0.008,0.33,0.026],0.0012,0.0012,mats.eyeWhite,3)); }
      lu.rotation.set(-0.3,0.2,-0.5); lu.position.set(0,-0.06,0.05); handR.add(lu);
    }
    else if(kind==="tome"){
      if(handL){
        var tm=new THREE.Group();
        tm.add(panel(0.11,0.016,0.14,mats.leather,0,0,0));
        tm.add(panel(0.05,0.01,0.13,mats.eyeWhite,-0.026,0.012,0,0,0,0.06));
        tm.add(panel(0.05,0.01,0.13,mats.eyeWhite,0.026,0.012,0,0,0,-0.06));
        tm.add(Ball(0.012,0.012,0.012,gem,0,0.02,0,8));
        tm.rotation.set(-0.5,0,0); tm.position.set(0,-0.1,0.06); handL.add(tm);
      }
      var tw=mkBlade(metal,gem,mats,0.4,0.016); grip(tw,handR);
    }
    /* tier sparkle on mythic/legendary */
    if((w.glow||0)>=4&&R.heroRig!==null){ /* aura handled by pedestal ring */ }
  }
  function addHelmetGear(headG, spec, mats, HR){
    var g=spec.equipped&&spec.equipped.helmet; if(!g) return;
    var metal=gMetal(g,"#f6cb6e"), gem=gGem(g,"#38bdf8"), txt=gText(g);
    if(/halo/.test(txt)){
      var halo=M(new THREE.TorusGeometry(HR*1.05,0.012,10,44), gGem(g,"#fde68a")); halo.rotation.x=HPI*0.94; halo.position.y=HR*1.45; headG.add(halo); headG.userData.halo=halo; return;
    }
    if(/crown/.test(txt)){
      var band=Loft([{y:HR*0.58,rx:HR*0.98,rz:HR*0.94},{y:HR*0.8,rx:HR*0.92,rz:HR*0.88}],metal,20);
      headG.add(band);
      for(var i=0;i<6;i++){ var a=(i/6)*TAU+0.5; headG.add(cone(0.017,0.06,metal,Math.cos(a)*HR*0.9,HR*0.9,Math.sin(a)*HR*0.86,0,0,0,4)); }
      headG.add(Ball(0.02,0.026,0.013,gem,0,HR*0.72,HR*0.92,10));
      return;
    }
    if(/circlet|tiara|tome/.test(txt)){
      headG.add(torus(HR*0.9,0.009,metal,0,HR*0.42,0,HPI*0.88,0,0));
      headG.add(Ball(0.018,0.022,0.012,gem,0,HR*0.5,HR*0.84,10));
      return;
    }
    if(/hood|hide|leather|cowl/.test(txt)){
      var hm2=gCloth(g,"#475569");
      headG.add(Loft([
        {y:-HR*0.3,rx:HR*1.02,rz:HR*1.0,z:-HR*0.1},
        {y:HR*0.3,rx:HR*1.05,rz:HR*1.02,z:-HR*0.12},
        {y:HR*0.85,rx:HR*0.72,rz:HR*0.7,z:-HR*0.2},
        {y:HR*1.1,rx:HR*0.2,rz:HR*0.24,z:-HR*0.38}
      ],hm2,22));
      headG.add(torus(HR*0.95,0.014,metal,0,HR*0.16,0,HPI*0.8,0,0));
      return;
    }
    if(/greathelm|closed|visor|war/.test(txt)){
      headG.add(Loft([
        {y:-HR*0.55,rx:HR*0.98,rz:HR*0.95},
        {y:HR*0.2,rx:HR*1.02,rz:HR*0.98},
        {y:HR*0.75,rx:HR*0.8,rz:HR*0.78},
        {y:HR*1.02,rx:HR*0.2,rz:HR*0.2}
      ],metal,24));
      headG.add(panel(HR*1.2,0.022,0.03,mats.dark,0,HR*0.1,HR*0.9));
      headG.add(panel(0.02,HR*0.9,0.03,gem,0,HR*0.62,HR*0.86,-0.15,0,0));
      [-1,1].forEach(function(sg){ headG.add(cone(0.024,0.12,metal,HR*0.8*sg,HR*0.75,0,0,0,-0.5*sg,6)); });
      return;
    }
    /* default: open helm band + crest */
    headG.add(Loft([{y:HR*0.34,rx:HR*0.98,rz:HR*0.95},{y:HR*0.66,rx:HR*0.88,rz:HR*0.85},{y:HR*0.95,rx:HR*0.4,rz:HR*0.4}],metal,22));
    headG.add(panel(HR*1.1,0.03,0.035,metal,0,HR*0.28,HR*0.8,-0.12,0,0));
    headG.add(cone(0.03,0.1,gem,0,HR*1.05,-HR*0.05,-0.2,0,0,6));
  }
  function addArmorGear(rig, spec, mats, torso, P, th){
    var a=spec.equipped&&spec.equipped.armor; if(!a) return;
    var txt=gText(a), light=/leather|hide|vest|mantle|coinweave|velvet|robe|cloak|tunic/.test(txt)&&!/plate|war|iron|steel/.test(txt);
    var metal=light?gCloth(a,"#64748b"):gMetal(a,"#dde7f2"), gem=gGem(a,"#9fd8ff");
    var shRel=P.shoulderY-P.waistY, chestRel=P.chestY-P.waistY;
    /* overlay cuirass hugging the torso silhouette */
    torso.add(Loft([
      {y:0.055,rx:0.134*th,rz:0.092,z:0.006},
      {y:chestRel,rx:0.174*th,rz:0.112,z:0.007},
      {y:shRel-0.04,rx:0.15*th,rz:0.098,z:0.005}
    ],metal,30));
    torso.add(Ball(0.03,0.038,0.016,gem,0,chestRel-0.02,0.115,12));
    [-1,1].forEach(function(sg){
      /* pauldron overlay at the shoulder joints */
      var sp=new THREE.Group(); sp.position.set(P.shoulderW*sg,shRel+0.012,0);
      sp.add(Ball(0.096*th,0.066,0.09,metal,0,0.008,0,20));
      sp.add(Loft([{y:-0.052,rx:0.088*th,rz:0.082},{y:-0.008,rx:0.099*th,rz:0.09}],light?mats.leather:mats.armorDk,16));
      sp.add(Ball(0.015,0.015,0.015,gem,0,0.058,0.026,8));
      torso.add(sp);
      torso.add(seg3([0.115*th*sg,0.08,0.09],[0.1*th*sg,chestRel+0.03,0.1],0.0035,0.0035,light?mats.leatherHi:mats.trim,6));
    });
    if(/moon|mythic|legend|astral|void/.test(txt)){
      var glowm=new THREE.MeshStandardMaterial({ color:col(a.gem,"#c4b5fd"), roughness:0.2, metalness:0.4, emissive:col(a.gem,"#c4b5fd").multiplyScalar(0.5), transparent:true, opacity:0.9 }); R.disposables.push(glowm);
      torso.add(torus(0.155*th,0.006,glowm,0,chestRel-0.06,0.02,HPI*0.92,0,0));
      torso.add(torus(0.14*th,0.005,glowm,0,0.12,0.01,HPI*0.92,0,0));
    }
  }
  function addClassSignature(rig, torso, headG, spec, mats, P, th, kit){
    var key=String(spec.cls||"knight").toLowerCase(), shRel=P.shoulderY-P.waistY;
    if(/monk/.test(key)){ /* headwear only comes from equipped items */ }
    else if(/alchemist/.test(key)){
      var glass=new THREE.MeshStandardMaterial({ color:0x9ff3ff, roughness:0.08, transparent:true, opacity:0.6, emissive:0x11434f, envMapIntensity:1.4 }); R.disposables.push(glass);
      [-1,0,1].forEach(function(n){ torso.add(seg3([n*0.055,0.04,0.1],[n*0.055,0.11,0.104],0.016,0.014,glass,8)); torso.add(Ball(0.012,0.01,0.012,mats.leather,n*0.055,0.115,0.104,6)); });
    }
    else if(/sentinel|guardian/.test(key)){
      var sh=new THREE.Group(); sh.position.set(0,P.chestY-0.05,-0.16);
      var face2=Loft([{y:-0.2,rx:0.13,rz:0.02},{y:0,rx:0.17,rz:0.03},{y:0.16,rx:0.14,rz:0.022}],mats.armorHi,14);
      sh.add(face2); sh.add(Ball(0.035,0.035,0.02,mats.trim,0,0,0.03,10));
      sh.rotation.x=0.12; rig.add(sh);
    }
    else if(/bard|minstrel/.test(key)){
      if(!(spec.equipped&&spec.equipped.weapon&&/lute|harp/.test(gText(spec.equipped.weapon)))){
        var lu=new THREE.Group(); lu.position.set(0.1,P.chestY-0.02,-0.15); lu.rotation.set(0.15,0.15,2.6);
        lu.add(Ball(0.075,0.1,0.03,mats.leatherHi,0,0,0,16));
        lu.add(Ball(0.036,0.036,0.016,mats.dark,0,0.025,0.026,10));
        lu.add(seg3([0,0.08,0.008],[0,0.28,0.016],0.012,0.01,mats.leather,8));
        for(var s3=0;s3<4;s3++){ lu.add(seg3([-0.01+s3*0.0068,-0.04,0.031],[-0.01+s3*0.0068,0.27,0.022],0.001,0.001,mats.eyeWhite,3)); }
        rig.add(lu);
      }
      /* no class hat — headwear only comes from equipped items */
    }
    else if(/ranger|druid|hunter/.test(key)){
      if(!(spec.equipped&&spec.equipped.weapon&&/bow/.test(gText(spec.equipped.weapon)))){
        var qv=new THREE.Group(); qv.position.set(-0.09,P.chestY,-0.14); qv.rotation.z=-0.4;
        qv.add(seg3([0,-0.14,0],[0,0.14,0],0.04,0.045,mats.leather,10));
        for(var a3=0;a3<3;a3++){ qv.add(seg3([-0.018+a3*0.018,0.08,0],[-0.018+a3*0.018,0.26,0],0.0035,0.0035,mats.trim,4)); }
        rig.add(qv);
      }
    }
    else if(/shadow|rogue|assassin/.test(key)){
      var headG2=rig.userData.headG;
      if(headG2){
        var mask=Ball(P.HR*0.82,P.HR*0.34,P.HR*0.5,mats.clothDk,0,-P.HR*0.44,P.HR*0.42,18);
        headG2.add(mask);
        var knot=Ball(P.HR*0.14,P.HR*0.1,P.HR*0.1,mats.clothDk,0,-P.HR*0.3,-P.HR*0.8,8);
        headG2.add(knot);
      }
    }
    else if(/mage|wizard|cleric|sage|warlock/.test(key)){
      var orb2=Ball(0.028,0.028,0.028,mats.energy,0.22,P.chestY+0.08,0.1,12);
      rig.add(orb2); if(!R.floaters) R.floaters=[]; R.floaters.push(orb2); orb2.userData.float=true;
    }
  }

  /* ---------------- pet familiars ---------------- */
  function buildPet(spec){
    var p=spec.equipped&&spec.equipped.pet; if(!p) return null;
    var g=new THREE.Group(); var txt=gText(p);
    var c=col(p.gem,"#c084fc");
    function s(o){ var m=new THREE.MeshStandardMaterial(o); R.disposables.push(m); return m; }
    var bm=s({ color:c, roughness:0.45, metalness:0.15, emissive:c.clone().multiplyScalar(0.25), envMapIntensity:0.9 });
    var dk=s({ color:c.clone().offsetHSL(0,0,-0.18), roughness:0.55 });
    var em=s({ color:0xfff3c4, emissive:0xaa8822, roughness:0.3 });
    if(/dragon|drake|wyrm|phoenix/.test(txt)){
      g.add(Ball(0.075,0.065,0.095,bm,0,0,0,16));
      g.add(Ball(0.05,0.045,0.05,bm,0,0.055,0.09,14));
      g.add(cone(0.02,0.05,dk,0,0.05,0.15,HPI*0.9,0,0,6));
      [-1,1].forEach(function(sg){
        var wing=M(new THREE.ConeGeometry(0.07,0.16,4), dk); wing.scale.z=0.25; wing.position.set(0.08*sg,0.05,-0.02); wing.rotation.z=-1.1*sg; g.add(wing); (g.userData.wings=g.userData.wings||[]).push(wing);
        g.add(Ball(0.011,0.013,0.008,em,0.026*sg,0.075,0.125,6));
      });
      g.add(cone(0.02,0.1,bm,0,-0.02,-0.12,-1.2,0,0,6));
    } else if(/fox|cat|wolf|hound/.test(txt)){
      g.add(Ball(0.062,0.055,0.088,bm,0,0,0,16));
      g.add(Ball(0.046,0.044,0.046,bm,0,0.055,0.085,14));
      g.add(Ball(0.02,0.016,0.022,dk,0,0.035,0.125,10)); /* snout */
      g.add(Ball(0.008,0.006,0.005,em,0,0.042,0.145,6));
      [-1,1].forEach(function(sg){ g.add(cone(0.02,0.055,dk,0.028*sg,0.105,0.065,0.1,0,-0.15*sg,4)); g.add(Ball(0.009,0.011,0.007,em,0.02*sg,0.062,0.122,6)); });
      var tail2=seg3([0,-0.005,-0.08],[0,0.075,-0.19],0.03,0.014,dk,10); g.add(tail2);
      g.add(Ball(0.024,0.028,0.024,em,0,0.095,-0.205,8)); /* tail tip */
      [-1,1].forEach(function(sg){ g.add(Ball(0.014,0.02,0.014,dk,0.035*sg,-0.05,0.04,6)); }); /* paws tucked */
    } else if(/owl|bird|raven|sparrow/.test(txt)){
      g.add(Ball(0.06,0.075,0.06,bm,0,0,0,16));
      g.add(Ball(0.045,0.045,0.045,bm,0,0.075,0.02,12));
      g.add(cone(0.012,0.025,em,0,0.07,0.06,HPI*0.9,0,0,5));
      [-1,1].forEach(function(sg){ g.add(Ball(0.016,0.02,0.01,em,0.02*sg,0.085,0.045,8)); var w2=Ball(0.02,0.05,0.04,dk,0.058*sg,0,0,10); (g.userData.wings=g.userData.wings||[]).push(w2); g.add(w2); });
    } else if(/slime|blob|ooze/.test(txt)){
      var sl=Loft([{y:0,rx:0.085,rz:0.085},{y:0.05,rx:0.075,rz:0.075},{y:0.095,rx:0.04,rz:0.04}],bm,18); g.add(sl);
      [-1,1].forEach(function(sg){ g.add(Ball(0.01,0.014,0.008,mats_dark(),0.03*sg,0.05,0.07)); });
      function mats_dark(){ return dk; }
    } else if(/golem|crystal|shard|gem/.test(txt)){
      var core=M(new THREE.OctahedronGeometry(0.07,0), bm); g.add(core);
      var r1=M(new THREE.OctahedronGeometry(0.02,0), em); r1.position.set(0.09,0.04,0); g.add(r1);
      var r2=M(new THREE.OctahedronGeometry(0.016,0), em); r2.position.set(-0.08,-0.03,0.03); g.add(r2);
      g.userData.spinAll=true;
    } else { /* wisp */
      g.add(Ball(0.055,0.055,0.055,bm,0,0,0,18));
      g.add(torus(0.08,0.005,em,0,0,0,0.5,0.4,0));
      [-1,1].forEach(function(sg){ g.add(Ball(0.008,0.012,0.006,em,0.02*sg,0.01,0.048,6)); });
    }
    g.userData.pet=true;
    return g;
  }

  /* ================= MOUNTS ================= */
  function buildMount(spec){
    var mt=spec.mount; if(!mt) return null;
    var fam=String(mt.family||"").toLowerCase(), id=String(mt.id||"").toLowerCase(), cs=mt.colors||["#6b5640","#caa46a","#f6cb6e"];
    function s(o){ var m=new THREE.MeshStandardMaterial(o); R.disposables.push(m); return m; }
    var body=s({ color:col(cs[0]), roughness:0.6, metalness:0.05, envMapIntensity:0.55 });
    var acc=s({ color:col(cs[1]), roughness:0.55, metalness:0.1, envMapIntensity:0.55 });
    var det=s({ color:col(cs[2]), roughness:0.28, metalness:0.5, emissive:col(cs[2]).multiplyScalar(0.16), envMapIntensity:1.05 });
    var dark=s({ color:0x14181f, roughness:0.5 });
    var leather=s({ color:0x3b271b, roughness:0.75, metalness:0.06 });
    if (fam==="bird" || /eagle|hawk|owl|raven|phoenix|roc|falcon|griffin|wing/.test(id)) return buildBird(body,acc,det,dark,leather,s);
    if (fam==="dragon" || /dragon|wyrm|drake|wyvern/.test(id)) return buildDragon(body,acc,det,dark,leather,s);
    if (fam==="aquatic" || /shark|dolphin|whale|jelly|serpent|turtle|croc|otter|tide/.test(id)) return buildAquatic(body,acc,det,dark,s,id);
    if (fam==="insect" || /moth|beetle|mantis|spider|scorpion|bee|wasp/.test(id)) return buildInsect(body,acc,det,dark,s,id);
    if (fam==="elemental" || /skiff|orb|elemental|spirit|wisp|void/.test(id)) return buildSkiff(acc,det,s);
    var feline=(fam==="feline"||fam==="cat"||/panther|cat|tiger|lion|lynx/.test(id));
    var canine=(fam==="canine"||fam==="wolf"||/wolf|hound|fox|dog/.test(id));
    return buildQuadruped(body,acc,det,dark,leather,s,id,feline,canine);
  }
  function rideMeta(g, seatY, stand, meta){ g.userData.seatY=seatY; g.userData.stand=!!stand; if(meta) Object.assign(g.userData, meta); return g; }

  function addTack(g, seatZ, seatY, headZ, headY, leather, det){
    /* saddle along Z (mount faces +Z) */
    g.add(LoftZ([
      {z:seatZ+0.15,rx:0.14,ry:0.05,y:seatY},
      {z:seatZ,rx:0.16,ry:0.055,y:seatY-0.01},
      {z:seatZ-0.15,rx:0.13,ry:0.05,y:seatY+0.01}
    ],leather,14));
    g.add(Loft([{y:seatY,rx:0.045,rz:0.04,z:seatZ-0.17},{y:seatY+0.09,rx:0.024,rz:0.022,z:seatZ-0.2}],leather,10)); /* cantle behind */
    [-1,1].forEach(function(sg){
      g.add(seg3([0.18*sg,seatY-0.02,seatZ],[0.2*sg,seatY-0.34,seatZ+0.02],0.01,0.009,leather,6));
      g.add(torus(0.045,0.007,det,0.2*sg,seatY-0.38,seatZ+0.02,0,HPI*0.5,0));
      g.add(seg3([0.08*sg,seatY+0.02,seatZ+0.12],[0.05*sg,headY,headZ],0.006,0.005,leather,6));
    });
  }
  function buildQuadruped(body,acc,det,dark,leather,s,id,feline,canine){
    id=String(id||"").toLowerCase();
    var horse=!feline&&!canine;
    var g=new THREE.Group(), by=horse?1.0:0.84;
    /* barrel along Z: nose -Z (front), tail +Z */
    g.add(LoftZ([
      {z:-0.6,rx:0.2,ry:0.21,y:by+0.02},
      {z:-0.3,rx:0.26,ry:0.27,y:by},
      {z:0.1,rx:0.27,ry:0.26,y:by-0.01},
      {z:0.42,rx:0.23,ry:0.24,y:by+0.02},
      {z:0.62,rx:0.16,ry:0.18,y:by+0.05}
    ],body,26));
    g.add(Ball(0.21,0.23,0.2,body,0,by-0.01,-0.55,20)); /* chest */
    g.add(Ball(0.23,0.25,0.22,body,0,by+0.02,0.52,20));  /* rump  */
    g.add(LoftZ([{z:-0.42,rx:0.17,ry:0.1,y:by-0.16},{z:0.3,rx:0.17,ry:0.1,y:by-0.16}],acc,18)); /* belly */
    function leg(x,zPos,front){
      var lg=new THREE.Group(); lg.position.set(x,by-0.08,zPos);
      var knee=[0,-0.36,front?-0.03:0.05], ankle=[0,-0.64,front?0.0:-0.02], hoofP=[0,-0.82,front?-0.04:-0.02];
      lg.add(joint([0,0,0],0.1,body,1.2));
      lg.add(seg3([0,0,0],knee,0.082,0.05,body,14));
      lg.add(joint(knee,0.05,acc));
      lg.add(seg3(knee,ankle,0.046,0.034,body,12));
      lg.add(joint(ankle,0.035,body));
      lg.add(seg3(ankle,hoofP,0.033,0.042,body,10));
      if(horse){ lg.add(LoftZ([{z:hoofP[2]-0.055,rx:0.05,ry:0.05,y:hoofP[1]-0.045},{z:hoofP[2]+0.045,rx:0.052,ry:0.052,y:hoofP[1]-0.045}],det,12)); }
      else { lg.add(Ball(0.048,0.032,0.058,acc,hoofP[0],hoofP[1]-0.035,hoofP[2]+0.015,10)); }
      g.add(lg); return lg;
    }
    g.userData.legs=[leg(0.16,-0.42,true),leg(-0.16,-0.42,true),leg(0.16,0.46,false),leg(-0.16,0.46,false)];
    /* neck: two tapered segments curving up-forward */
    var nb=[0,by+0.1,-0.5], nm=[0,by+0.36,-0.68], nh=[0,by+0.56,-0.78];
    g.add(seg3(nb,nm,0.16,0.12,body,18)); g.add(seg3(nm,nh,0.12,0.09,body,16)); g.add(joint(nh,0.095,body));
    /* head */
    var hg=new THREE.Group(); hg.position.set(nh[0],nh[1],nh[2]); g.userData.headG=hg;
    if(horse){
      hg.add(LoftZ([
        {z:0.02,rx:0.095,ry:0.1,y:0.01},
        {z:-0.12,rx:0.075,ry:0.082,y:-0.03},
        {z:-0.24,rx:0.05,ry:0.055,y:-0.085},
        {z:-0.31,rx:0.042,ry:0.045,y:-0.11}
      ],body,16));
      hg.add(Ball(0.045,0.04,0.05,acc,0,-0.115,-0.33,12)); /* muzzle */
      [-1,1].forEach(function(sg){ hg.add(Ball(0.007,0.006,0.005,dark,0.026*sg,-0.12,-0.36,6)); });
      /* bridle */
      hg.add(torus(0.062,0.006,leather,0,-0.09,-0.26,0,0,0));
      hg.add(torus(0.085,0.006,leather,0,0.0,-0.05,0.35,0,0));
    } else {
      hg.add(Ball(0.11,0.1,0.12,body,0,0,-0.05,18));
      hg.add(LoftZ([{z:-0.13,rx:0.055,ry:0.05,y:-0.045},{z:-0.2,rx:0.038,ry:0.034,y:-0.06}],body,12));
      hg.add(Ball(0.015,0.011,0.01,dark,0,-0.05,-0.22,8));
      [-1,1].forEach(function(sg){ hg.add(cone(0.007,0.024,s({color:0xf3ecd6,roughness:0.4}),0.028*sg,-0.085,-0.17,2.9,0,0,5)); });
    }
    [-1,1].forEach(function(sg){
      hg.add(cone(horse?0.03:0.035,horse?0.09:0.08,body,(horse?0.055:0.07)*sg,0.1,horse?0.02:0.01,-0.15,0,-0.15*sg,8));
      hg.add(Ball(0.017,0.017,0.01,dark,(horse?0.07:0.078)*sg,0.01,horse?-0.08:-0.1,8));
      hg.add(Ball(0.005,0.005,0.003,s({color:0xffffff,roughness:0.2}),(horse?0.074:0.082)*sg,0.017,horse?-0.086:-0.106,4));
    });
    g.add(hg);
    /* mane / ruff / markings */
    if(horse){ for(var i=0;i<7;i++){ var f=i/6; g.add(Ball(0.045,0.085,0.05,acc,0,by+0.2+f*0.4,-0.42-f*0.32,12)); } g.add(Ball(0.04,0.1,0.05,acc,0,by+0.62,-0.8,10)); }
    if(canine){ g.add(LoftZ([{z:-0.55,rx:0.24,ry:0.26,y:by+0.02},{z:-0.32,rx:0.3,ry:0.3,y:by+0.02}],acc,18)); }
    if(feline){ [-1,1].forEach(function(sg){ for(var st=0;st<3;st++){ g.add(panel(0.012,0.1,0.02,det,0.24*sg,by+0.03,-0.2+st*0.24,0.2,0,0.5*sg)); } }); }
    /* tail */
    if(horse){ g.add(seg3([0,by+0.08,0.62],[0,by-0.12,0.8],0.05,0.038,acc,10)); g.add(seg3([0,by-0.12,0.8],[0,by-0.4,0.86],0.038,0.016,acc,10)); }
    else if(canine){ g.add(seg3([0,by+0.06,0.6],[0,by+0.3,0.8],0.045,0.02,acc,10)); g.add(Ball(0.042,0.055,0.042,acc,0,by+0.33,0.83,10)); }
    else { g.add(seg3([0,by+0.04,0.6],[0,by+0.16,0.82],0.028,0.02,body,8)); g.add(seg3([0,by+0.16,0.82],[0,by+0.34,0.9],0.02,0.011,body,8)); g.add(Ball(0.018,0.028,0.018,det,0,by+0.37,0.91,8)); }
    /* id extras */
    if(/unicorn/.test(id)){ hg.add(cone(0.026,0.22,det,0,0.16,-0.14,-0.5,0,0,10)); }
    if(/stag|deer|elk/.test(id)){ [-1,1].forEach(function(sg){
      hg.add(seg3([0.05*sg,0.08,0.03],[0.15*sg,0.3,0.1],0.013,0.009,det,6));
      hg.add(seg3([0.15*sg,0.3,0.1],[0.1*sg,0.45,0.04],0.008,0.004,det,6));
      hg.add(seg3([0.15*sg,0.3,0.1],[0.24*sg,0.42,0.16],0.007,0.004,det,6));
    }); }
    if(/ram|bull|bison|yak|ox|rhino/.test(id)){ [-1,1].forEach(function(sg){ hg.add(cone(0.04,0.2,det,0.1*sg,0.1,0.03,0.3,0,1.6*sg,8)); }); }
    if(/pegasus/.test(id)){ g.userData.wing=[]; [-1,1].forEach(function(sg){
      var w3=Loft([{y:0,rx:0.05,rz:0.02},{y:0.3,rx:0.3,rz:0.03,x:0.2*sg},{y:0.5,rx:0.12,rz:0.02,x:0.4*sg}],acc,12);
      w3.position.set(0.2*sg,by+0.1,-0.1); w3.rotation.z=0.6*sg; g.add(w3); g.userData.wing.push(w3);
    }); }
    /* tack: saddle at z≈0, reins to the head */
    var seatY=by+0.22, seatZ=0.02;
    g.add(LoftZ([{z:seatZ-0.24,rx:0.24,ry:0.05,y:seatY-0.03},{z:seatZ+0.24,rx:0.24,ry:0.05,y:seatY-0.03}],acc,16)); /* blanket */
    g.add(LoftZ([
      {z:seatZ-0.17,rx:0.15,ry:0.05,y:seatY},
      {z:seatZ,rx:0.17,ry:0.06,y:seatY-0.01},
      {z:seatZ+0.17,rx:0.14,ry:0.05,y:seatY+0.01}
    ],leather,16));
    g.add(Loft([{y:seatY,rx:0.05,rz:0.045,z:seatZ+0.2},{y:seatY+0.1,rx:0.028,rz:0.026,z:seatZ+0.23}],leather,10)); /* cantle */
    g.add(Loft([{y:seatY,rx:0.04,rz:0.035,z:seatZ-0.19},{y:seatY+0.07,rx:0.02,rz:0.02,z:seatZ-0.22}],det,10)); /* pommel */
    [-1,1].forEach(function(sg){
      g.add(seg3([0.22*sg,seatY-0.03,seatZ],[0.25*sg,seatY-0.42,seatZ+0.02],0.011,0.009,leather,6));
      g.add(torus(0.048,0.008,det,0.25*sg,seatY-0.46,seatZ+0.02,0,HPI*0.5,0));
      g.add(seg3([0.1*sg,seatY+0.02,seatZ-0.16],[nh[0]+0.06*sg,nh[1]-0.06,nh[2]+0.02],0.006,0.005,leather,6));
    });
    g.rotation.y=Math.PI; /* face +Z like the hero */
    return rideMeta(g, seatY+0.02, false, { riderScale:0.8, riderX:0, riderZ:-seatZ, riderYOffset:0.0, cameraDist:5.9, cameraLookY:1.2, previewYaw:-0.5 });
  }
  function buildBird(body,acc,det,dark,leather,s){
    var g=new THREE.Group(); var by=0.95;
    g.add(Loft([
      {y:by-0.02,rx:0.22,rz:0.2,z:0.55},{y:by+0.02,rx:0.34,rz:0.3,z:0.15},{y:by,rx:0.3,rz:0.27,z:-0.25},{y:by+0.06,rx:0.16,rz:0.15,z:-0.55}
    ],body,22));
    g.add(Ball(0.26,0.28,0.24,acc,0,by-0.06,0.32,18)); /* breast */
    var nh=[0,by+0.42,0.62];
    g.add(seg3([0,by+0.12,0.5],nh,0.12,0.09,body,14));
    var hg=new THREE.Group(); hg.position.set(nh[0],nh[1],nh[2]);
    hg.add(Ball(0.13,0.12,0.14,body,0,0.02,0.02,16));
    hg.add(Loft([{y:0.0,rx:0.045,rz:0.04,z:0.14},{y:-0.03,rx:0.02,rz:0.018,z:0.22}],det,10));
    hg.add(cone(0.014,0.05,det,0,-0.055,0.19,2.6,0,0,6));
    [-1,1].forEach(function(sg){ hg.add(Ball(0.022,0.022,0.014,dark,0.07*sg,0.05,0.09,8)); hg.add(Ball(0.006,0.006,0.004,s({color:0xffffff,roughness:0.2}),0.075*sg,0.058,0.098,4));
      hg.add(Ball(0.05,0.03,0.06,acc,0.08*sg,0.09,-0.02,10)); });
    g.add(hg);
    g.userData.wing=[];
    [-1,1].forEach(function(sg){
      var w=new THREE.Group(); w.position.set(0.24*sg,by+0.14,0.05);
      var arm1=seg3([0,0,0],[0.34*sg,0.1,-0.05],0.05,0.035,body,10); w.add(arm1);
      var arm2=seg3([0.34*sg,0.1,-0.05],[0.62*sg,0.08,-0.12],0.035,0.02,body,8); w.add(arm2);
      for(var f2=0;f2<5;f2++){
        var fx=0.18+f2*0.11, fl=0.3+f2*0.06;
        var feather=Loft([{y:0,rx:0.045,rz:0.012},{y:-fl,rx:0.03,rz:0.008}],f2%2?acc:body,8);
        feather.position.set(fx*sg,0.06,-0.08-f2*0.015); feather.rotation.z=0.25*sg*(f2*0.16); feather.rotation.x=-0.3-f2*0.06;
        w.add(feather);
      }
      g.add(w); g.userData.wing.push(w);
    });
    [-0.1,0,0.1].forEach(function(o,i2){ var tf=Loft([{y:0,rx:0.05,rz:0.014},{y:-0.4,rx:0.035,rz:0.01}],i2===1?acc:body,8); tf.position.set(o,by+0.03,-0.55); tf.rotation.x=1.9; g.add(tf); });
    [-0.15,0.15].forEach(function(x){
      g.add(seg3([x,by-0.24,0.15],[x,by-0.5,0.18],0.045,0.03,det,8));
      for(var t2=0;t2<3;t2++){ g.add(seg3([x,by-0.5,0.18],[x+(t2-1)*0.04,by-0.56,0.26],0.012,0.006,det,5)); }
    });
    addTack(g,-0.05,by+0.26,0.58,by+0.5,leather,det);
    return rideMeta(g, by+0.34, false, { riderScale:0.8, riderZ:-0.05, cameraDist:5.8, cameraLookY:1.2, previewYaw:-0.4 });
  }
  function buildDragon(body,acc,det,dark,leather,s){
    var g=new THREE.Group(); var by=0.95;
    /* torso along Z, head +Z */
    g.add(LoftZ([
      {z:-0.68,rx:0.15,ry:0.14,y:by+0.06},
      {z:-0.3,rx:0.28,ry:0.26,y:by},
      {z:0.12,rx:0.3,ry:0.28,y:by},
      {z:0.5,rx:0.2,ry:0.19,y:by+0.03}
    ],body,24));
    g.add(LoftZ([{z:-0.3,rx:0.2,ry:0.08,y:by-0.17},{z:0.35,rx:0.2,ry:0.08,y:by-0.17}],acc,16)); /* belly plates */
    for(var bp=0;bp<5;bp++){ g.add(torus(0.2-bp*0.008,0.012,acc,0,by-0.17,0.28-bp*0.14,0.12,0,0,Math.PI)); }
    /* neck up-forward */
    var nb=[0,by+0.12,0.42], nm=[0,by+0.38,0.58], nh=[0,by+0.6,0.7];
    g.add(seg3(nb,nm,0.12,0.095,body,16)); g.add(seg3(nm,nh,0.095,0.078,body,14)); g.add(joint(nh,0.082,body));
    for(var ns=0;ns<4;ns++){ var f=ns/3; g.add(cone(0.028,0.09,det,0,by+0.2+f*0.42,0.48+f*0.2,-0.5,0,0,4)); }
    /* head: reptile skull + jaw + horns */
    var hg=new THREE.Group(); hg.position.set(nh[0],nh[1],nh[2]); g.userData.headG=hg;
    hg.add(Ball(0.1,0.09,0.13,body,0,0.01,0.02,16));
    hg.add(LoftZ([{z:0.08,rx:0.07,ry:0.05,y:-0.015},{z:0.22,rx:0.045,ry:0.032,y:-0.03}],body,12)); /* snout */
    hg.add(LoftZ([{z:0.06,rx:0.055,ry:0.02,y:-0.07},{z:0.19,rx:0.035,ry:0.014,y:-0.075}],acc,10)); /* jaw */
    [-1,1].forEach(function(sg){
      hg.add(Ball(0.008,0.006,0.005,dark,0.028*sg,-0.02,0.235,6));
      hg.add(cone(0.006,0.03,s({color:0xf3ecd6,roughness:0.4}),0.03*sg,-0.055,0.18,2.8,0,0,5)); /* fangs */
      var eye=Ball(0.02,0.016,0.012,s({color:0xffcc33,emissive:0x996600,roughness:0.25}),0.062*sg,0.035,0.09,8); hg.add(eye);
      hg.add(Ball(0.024,0.01,0.016,body,0.062*sg,0.055,0.09,8)); /* brow ridge */
      /* swept horns */
      hg.add(seg3([0.05*sg,0.07,-0.02],[0.11*sg,0.16,-0.14],0.02,0.012,det,8));
      hg.add(seg3([0.11*sg,0.16,-0.14],[0.09*sg,0.26,-0.24],0.011,0.004,det,8));
    });
    g.add(hg);
    /* quadruped legs */
    g.userData.legs=[];
    [[0.2,0.32],[-0.2,0.32],[0.22,-0.4],[-0.22,-0.4]].forEach(function(p,pi){
      var lg=new THREE.Group(); lg.position.set(p[0],by-0.12,p[1]);
      var knee=[0.01*(p[0]>0?1:-1),-0.3,0.03], ankle=[0.01*(p[0]>0?1:-1),-0.56,-0.02];
      lg.add(joint([0,0,0],0.1,body,1.15));
      lg.add(seg3([0,0,0],knee,0.08,0.05,body,12));
      lg.add(joint(knee,0.05,body));
      lg.add(seg3(knee,ankle,0.045,0.036,body,10));
      for(var c2=0;c2<3;c2++){ lg.add(cone(0.016,0.05,det,(c2-1)*0.032+ankle[0],ankle[1]-0.02,ankle[2]+0.06,1.75,0,0,5)); }
      g.add(lg); g.userData.legs.push(lg);
    });
    /* bat wings: bones + membrane fan */
    g.userData.wing=[];
    var wm=s({ color:col_mix(acc), roughness:0.5, side:THREE.DoubleSide, transparent:true, opacity:0.88, emissive:col_mix(det), emissiveIntensity:0.05 });
    [-1,1].forEach(function(sg){
      var w=new THREE.Group(); w.position.set(0.15*sg,by+0.26,-0.02); w.scale.setScalar(1.15);
      var elbowW=[0.3*sg,0.32,-0.1], tipW=[0.72*sg,0.5,-0.28], back1=[0.55*sg,0.05,-0.3], back2=[0.25*sg,-0.1,-0.2];
      w.add(seg3([0,0,0],elbowW,0.035,0.022,body,8));
      w.add(seg3(elbowW,tipW,0.02,0.008,body,8));
      w.add(joint(elbowW,0.024,body));
      /* membrane: triangle fan shoulder→elbow→tip→back1→back2 */
      var pts=[[0,0,0],elbowW,tipW,back1,back2,[0,-0.08,-0.05]];
      var pos=[]; var tris=[[0,1,2],[0,2,3],[0,3,4],[0,4,5]];
      tris.forEach(function(tr){ tr.forEach(function(ix){ pos.push(pts[ix][0],pts[ix][1],pts[ix][2]); }); });
      var mg2=new THREE.BufferGeometry(); mg2.setAttribute("position", new THREE.Float32BufferAttribute(pos,3)); mg2.computeVertexNormals();
      R.disposables.push(mg2);
      var mem=new THREE.Mesh(mg2, wm); mem.castShadow=true; w.add(mem);
      /* wing claw */
      w.add(cone(0.012,0.04,det,tipW[0],tipW[1]+0.02,tipW[2],0,0,-0.4*sg,5));
      g.add(w); g.userData.wing.push(w);
    });
    /* tail with fin */
    var tl=[[0,by+0.05,-0.66],[0,by-0.02,-1.0],[0,by+0.12,-1.3]];
    g.add(seg3(tl[0],tl[1],0.12,0.07,body,12)); g.add(seg3(tl[1],tl[2],0.07,0.025,body,10));
    var fin=cone(0.08,0.15,det,0,by+0.15,-1.34,0.5,0,0,4); fin.scale.z=0.3; g.add(fin);
    for(var ts=0;ts<3;ts++){ g.add(cone(0.02,0.06,det,0,by+0.12-ts*0.05,-0.72-ts*0.2,-0.6,0,0,4)); }
    addTack(g,-0.08,by+0.26,0.6,by+0.55,leather,det);
    return rideMeta(g, by+0.34, false, { riderScale:0.8, riderZ:-0.08, cameraDist:6.4, cameraLookY:1.25, previewYaw:-0.42 });
  }
  function col_mix(mat){ try{ return mat.color.getHex(); }catch(e){ return 0x88aadd; } }
  function buildSkiff(acc, det, s){
    var g=new THREE.Group();
    g.add(Loft([{y:0.5,rx:0.16,rz:0.05,z:0.62},{y:0.46,rx:0.3,rz:0.09,z:0.1},{y:0.48,rx:0.26,rz:0.08,z:-0.4},{y:0.54,rx:0.1,rz:0.04,z:-0.6}],acc,18));
    g.add(panel(0.4,0.03,1.0,det,0,0.55,0));
    var core=Ball(0.09,0.09,0.09,s({color:col_mix(det),emissive:col_mix(det),emissiveIntensity:0.7,roughness:0.2,transparent:true,opacity:0.95}),0,0.42,-0.3,14);
    g.add(core); g.userData.core=core;
    [-1,1].forEach(function(sg){ var fin2=cone(0.06,0.22,acc,0.24*sg,0.44,-0.55,1.8,0,0.3*sg,4); fin2.scale.z=0.3; g.add(fin2); });
    g.userData.skiff=true; return rideMeta(g, 0.62, true, { cameraDist:5.4, cameraLookY:1.1 });
  }
  function buildAquatic(body,acc,det,dark,s,id){
    var g=new THREE.Group(); var by=0.8; id=String(id||"").toLowerCase();
    if (/jelly/.test(id)){
      var bell=Loft([{y:by-0.05,rx:0.36,rz:0.36},{y:by+0.14,rx:0.3,rz:0.3},{y:by+0.26,rx:0.14,rz:0.14}],body,22); g.add(bell);
      for(var j=0;j<7;j++){ var a=(j/7)*TAU; g.add(seg3([Math.cos(a)*0.2,by-0.05,Math.sin(a)*0.2],[Math.cos(a)*0.26,by-0.5,Math.sin(a)*0.26],0.016,0.008,det,6)); }
      return rideMeta(g, by+0.3, true, { cameraDist:5.2 });
    }
    g.add(Loft([{y:by,rx:0.16,rz:0.14,z:0.6},{y:by,rx:0.28,rz:0.24,z:0.1},{y:by,rx:0.22,rz:0.2,z:-0.35},{y:by+0.02,rx:0.08,rz:0.08,z:-0.62}],body,20));
    var tf2=cone(0.16,0.3,acc,0,by+0.02,-0.75,-1.35,0,0,4); tf2.scale.x=0.24; g.add(tf2);
    var tf3=cone(0.16,0.3,acc,0,by-0.0,-0.75,1.55,0,0,4); tf3.scale.x=0.24; g.add(tf3);
    [-1,1].forEach(function(sg){ var fin3=cone(0.07,0.24,acc,0.24*sg,by-0.08,0.25,0,0,1.9*sg,4); fin3.scale.z=0.3; g.add(fin3); });
    var dor=cone(0.1,0.24,acc,0,by+0.26,-0.05,-0.35,0,0,4); dor.scale.z=0.3; g.add(dor);
    [-1,1].forEach(function(sg){ g.add(Ball(0.02,0.018,0.012,dark,0.13*sg,by+0.06,0.5,8)); });
    if (/turtle/.test(id)){ g.add(Loft([{y:by+0.02,rx:0.3,rz:0.26},{y:by+0.2,rx:0.2,rz:0.18},{y:by+0.28,rx:0.08,rz:0.08}],acc,18)); }
    addTack(g,-0.05,by+0.24,0.45,by+0.1,s({color:0x3b271b,roughness:0.75}),det);
    return rideMeta(g, by+0.3, false, { riderScale:0.8, cameraDist:5.4, cameraLookY:1.05 });
  }
  function buildInsect(body,acc,det,dark,s,id){
    var g=new THREE.Group(); var by=0.8; id=String(id||"").toLowerCase();
    g.add(Ball(0.24,0.2,0.3,acc,0,by,0.3,18));
    g.add(Ball(0.26,0.22,0.26,body,0,by,-0.05,18));
    g.add(Ball(0.3,0.24,0.34,acc,0,by+0.02,-0.42,18));
    [-1,1].forEach(function(sg){ g.add(Ball(0.035,0.03,0.02,dark,0.1*sg,by+0.08,0.52,8));
      g.add(seg3([0.06*sg,by+0.16,0.5],[0.14*sg,by+0.34,0.62],0.006,0.003,dark,5));
      g.add(Ball(0.012,0.012,0.012,det,0.14*sg,by+0.35,0.63,6));
    });
    for(var l=0;l<6;l++){ var side=l%2?1:-1, zp=0.3-Math.floor(l/2)*0.3;
      var lg=new THREE.Group(); lg.position.set(0.2*side,by-0.05,zp);
      lg.add(seg3([0,0,0],[0.2*side,-0.18,0.02],0.02,0.014,body,6));
      lg.add(seg3([0.2*side,-0.18,0.02],[0.26*side,-0.5,0.04],0.013,0.006,body,6));
      g.add(lg);
    }
    if (/moth|bee|wasp|beetle/.test(id)){
      g.userData.wing=[];
      [-1,1].forEach(function(sg){ var wm=s({ color:col_mix(det), roughness:0.3, side:THREE.DoubleSide, transparent:true, opacity:0.5, emissive:col_mix(det), emissiveIntensity:0.2 });
        var wing=new THREE.Mesh(loftGeometry([{y:0,rx:0.04,rz:0.01},{y:0.42,rx:0.22,rz:0.014,x:0.18*sg},{y:0.6,rx:0.1,rz:0.01,x:0.3*sg}],10), wm); R.disposables.push(wing.geometry);
        wing.castShadow=true; wing.position.set(0.1*sg,by+0.16,-0.05); wing.rotation.z=1.15*sg; g.add(wing); g.userData.wing.push(wing); });
    }
    if (/scorpion/.test(id)){
      var t3=[[0,by+0.1,-0.6],[0,by+0.42,-0.78],[0,by+0.66,-0.6]];
      g.add(seg3(t3[0],t3[1],0.06,0.04,body,8)); g.add(seg3(t3[1],t3[2],0.04,0.02,body,8));
      g.add(cone(0.03,0.1,det,0,by+0.7,-0.52,0.8,0,0,6));
    }
    addTack(g,-0.06,by+0.24,0.42,by+0.14,s({color:0x3b271b,roughness:0.75}),det);
    return rideMeta(g, by+0.28, false, { riderScale:0.8, cameraDist:5.2 });
  }

  /* ---------------- assemble / camera / loop ---------------- */
  function maxGlow(spec){
    var e=spec.equipped||{}, g=0;
    ["weapon","helmet","armor","pet"].forEach(function(k){ if(e[k]&&(e[k].glow||0)>g) g=e[k].glow||0; });
    if(spec.mount&&spec.mount.tier){ var tg={common:0,uncommon:1,rare:2,epic:3,legendary:4,mythic:5}[spec.mount.tier]||0; if(tg>g) g=tg; }
    return g;
  }
  function auraColor(spec){
    var e=spec.equipped||{}, best=null, bg=-1;
    ["weapon","helmet","armor","pet"].forEach(function(k){ if(e[k]&&(e[k].glow||0)>bg){ bg=e[k].glow||0; best=e[k]; } });
    return best&&best.gem?best.gem:"#22d3ee";
  }
  function specSig(s){ var e=s.equipped||{}; function gid(x){ return x?(x.id+":"+x.tier):"-"; }
    return [s.cls,s.traits.race,s.traits.body,s.traits.hair,s.traits.helm,s.traits.face,s.traits.eyeShape,
      s.colors.skin,s.colors.hair,s.colors.eye,s.colors.armorMid,s.colors.armorHigh,s.colors.armorDark,s.colors.accent,s.colors.cloak,
      gid(e.weapon),gid(e.helmet),gid(e.armor),gid(e.pet), s.mount?(s.mount.id+":"+s.mount.family+":"+s.mount.tier):"-"].join("|"); }
  function rebuild(spec){
    if(R.heroRig){ R.root.remove(R.heroRig); disposeGroup(R.heroRig); }
    if(R.mountGroup){ R.root.remove(R.mountGroup); disposeGroup(R.mountGroup); }
    if(R.petGroup){ R.root.remove(R.petGroup); disposeGroup(R.petGroup); }
    flush(); R.heroRig=R.mountGroup=R.petGroup=null; R.floaters=[]; R.pose={};
    var hero=buildHeroModelKit(spec);
    var mount=spec.mount?buildMount(spec):null;
    var pet=buildPet(spec); R.mounted=!!mount;
    if(mount){ R.root.add(mount); R.mountGroup=mount; applyMountedPose(hero, mount);
      if(R.mode==="studio" && mount.userData.previewYaw!==undefined){ R.yaw=mount.userData.previewYaw; R.targetYaw=mount.userData.previewYaw; } }
    else { hero.position.y=0; }
    if(R.pedestal) R.pedestal.visible = true;
    /* aura ring driven by best equipped tier */
    var g=maxGlow(spec);
    if(R.auraRing){ R.auraRing.material.color=col(auraColor(spec)); R.auraRing.material.opacity=g>0?(0.18+g*0.13):0.0; }
    R.root.add(hero); R.heroRig=hero; if(pet){ R.root.add(pet); R.petGroup=pet; }
    frame();
  }
  function applyMountedPose(hero, mount){
    var ud=mount.userData||{}, stand=!!ud.stand, sc=stand?(ud.riderScale||0.86):(ud.riderScale||0.8);
    hero.scale.setScalar(sc); /* uniform only — non-uniform scale shears rotated limbs */
    hero.rotation.set(stand?0:-0.04,0,0);
    var P=hero.userData.plan||{hipY:0.94};
    var baseY = stand ? (ud.seatY||0.62) : ((ud.seatY||1.2)-P.hipY*sc+0.0+(ud.riderYOffset||0));
    if(hero.userData.torso&&hero.userData.torso.userData.skirt){ hero.userData.torso.userData.skirt.visible=stand; }
    if(hero.userData.cloak){ hero.userData.cloak.visible=false; }
    hero.position.set(ud.riderX||0, baseY, ud.riderZ||0); hero.userData.mountBaseY=baseY; hero.userData.mounted=!stand;
    if(!stand){
      if(hero.userData.legL){ hero.userData.legL.rotation.set(-0.95,0.1,0.78); if(hero.userData.legL.userData.knee) hero.userData.legL.userData.knee.rotation.x=1.4; }
      if(hero.userData.legR){ hero.userData.legR.rotation.set(-0.95,-0.1,-0.78); if(hero.userData.legR.userData.knee) hero.userData.legR.userData.knee.rotation.x=1.4; }
      if(hero.userData.armL){ hero.userData.armL.rotation.set(0.5,0,0.14); if(hero.userData.armL.userData.elbow) hero.userData.armL.userData.elbow.rotation.x=-0.4; }
      if(hero.userData.armR){ hero.userData.armR.rotation.set(0.5,0,-0.14); if(hero.userData.armR.userData.elbow) hero.userData.armR.userData.elbow.rotation.x=-0.4; }
      if(hero.userData.torso){ hero.userData.torso.rotation.x=0.05; }
    } else {
      if(hero.userData.legL) hero.userData.legL.rotation.z=0.12;
      if(hero.userData.legR) hero.userData.legR.rotation.z=-0.12;
      if(hero.userData.armL) hero.userData.armL.rotation.z=0.3;
      if(hero.userData.armR) hero.userData.armR.rotation.z=-0.3;
    }
  }
  function frame(){ var cam=R.camera;
    var md=R.mountGroup&&R.mountGroup.userData||{};
    var base;
    if(R.mode==="studio"){ base=R.mounted?(md.cameraDist||5.6):4.35; R.lookY=R.mounted?(md.cameraLookY||1.12):0.98; }
    else { base=R.mounted?(md.cameraDist||5.4):4.15; R.lookY=R.mounted?(md.cameraLookY||1.1):0.96; }
    if(!R.dist||Math.abs(R.dist-base)>2.5){ R.dist=base; }
    R.targetDist=R.targetDist||base; R.baseDist=base;
    cam.position.set(0, 1.16+R.pitch*0.6, R.dist);
    cam.lookAt(0,R.lookY,0);
  }
  FH3D.sync=function(spec){ if(!FH3D.available){ if(!initEngine()) return; } if(!spec) return; R.running=!!spec.running;
    var sc=String(spec.scene||"resting"); if(sc!==R.actScene){ R.actScene=sc; R.sceneT=0; }
    try{ var sg=specSig(spec); if(sg!==R.sig){ R.sig=sg; rebuild(spec); } renderOnce(); startLoop(); }catch(e){ console.warn("[FH3D] sync failed:",e); } };
  function renderOnce(){
    /* guarantee a visible frame + ready flag even before rAF fires (background tabs) */
    try{ if(R.renderer&&R.scene&&R.camera&&R.container){ R.renderer.render(R.scene,R.camera); R.container.setAttribute("data-fh3d-ready","1"); R.container.classList.add("fh3d-ready"); } }catch(e){}
  }
  function attach(container, mode){ if(!container) return; if(!FH3D.available){ if(!initEngine()) return; }
    var canvas=R.renderer.domElement; try{ if(getComputedStyle(container).position==="static") container.style.position="relative"; }catch(e){}
    if(canvas.parentNode!==container) container.appendChild(canvas); R.container=container; R.mode=mode||"home";
    if(R.mode==="studio"){
      var pv=(R.mounted&&R.mountGroup&&R.mountGroup.userData.previewYaw!==undefined)?R.mountGroup.userData.previewYaw:0;
      R.yaw=pv; R.targetYaw=pv; R.autoSpin=false;
    } else if(!R.dragging){ R.autoSpin=true; }
    container.classList.add("fh3d-host"); container.setAttribute("data-fh3d-ready","0"); resize(); frame(); observe(container); renderOnce(); startLoop(); }
  FH3D.attachHome=function(el){ attach(el,"home"); }; FH3D.attachStudio=function(el){ attach(el,"studio"); }; FH3D.detachStudio=function(h){ if(h) attach(h,"home"); };
  function resize(){ if(!R.container||!R.renderer) return; var w=R.container.clientWidth||120,h=R.container.clientHeight||120; R.renderer.setSize(w,h,false); R.camera.aspect=w/h; R.camera.updateProjectionMatrix(); }
  function observe(container){ if(R.ro){ try{ R.ro.disconnect(); }catch(e){} } if(window.ResizeObserver){ R.ro=new ResizeObserver(function(){ resize(); }); R.ro.observe(container); }
    if(R.io){ try{ R.io.disconnect(); }catch(e){} } if(window.IntersectionObserver){ R.io=new IntersectionObserver(function(en){ var v=en[0]&&en[0].isIntersecting; if(v&&!document.hidden) startLoop(); else stopLoop(); }, {threshold:0.01}); R.io.observe(container); } }
  function wirePointer(canvas){
    canvas.addEventListener("pointerdown", function(e){ R.dragging=true; R.autoSpin=false; R.lastPointerX=e.clientX; R.lastPointerY=e.clientY; try{ canvas.setPointerCapture(e.pointerId); }catch(x){} });
    canvas.addEventListener("pointermove", function(e){ if(!R.dragging) return; var dx=e.clientX-R.lastPointerX, dy=e.clientY-R.lastPointerY; R.lastPointerX=e.clientX; R.lastPointerY=e.clientY;
      R.targetYaw+=dx*0.012; R.targetPitch=Math.max(-0.5,Math.min(0.75,(R.targetPitch||0)+dy*0.006)); });
    function up(){ R.dragging=false; clearTimeout(R._t); R._t=setTimeout(function(){ if(R.mode!=="studio") R.autoSpin=true; },2800); }
    canvas.addEventListener("pointerup",up); canvas.addEventListener("pointercancel",up); canvas.addEventListener("pointerleave", function(){ if(R.dragging) up(); });
    canvas.addEventListener("wheel", function(e){ if(R.mode!=="studio") return; e.preventDefault();
      var base=R.baseDist||4.35; R.targetDist=Math.max(base*0.55,Math.min(base*1.5,(R.targetDist||base)+(e.deltaY>0?0.25:-0.25))); }, {passive:false});
  }
  function startLoop(){ if(R.raf) return; if(document.hidden) return; R.last=performance.now(); R.raf=requestAnimationFrame(tick); }
  function stopLoop(){ if(R.raf){ cancelAnimationFrame(R.raf); R.raf=0; } }

  /* ============ v10 action animation engine ============
     Every focus action plays a real, readable animation. Targets are computed
     per-frame (oscillators live inside the targets) and the applied pose is
     damped toward them, so switching actions cross-fades instead of popping.
     All motion is pure joint rotation + root translation - geometry can never
     stretch or shear. */
  function easeOut(x){ return 1-Math.pow(1-Math.max(0,Math.min(1,x)),3); }
  function scenePose(t, ud){
    var k=R.running?1:0.4;             /* live session = full energy */
    var robeK=ud.robed?0.3:1;          /* long robes limit leg articulation */
    var plan=ud.plan||{hipY:0.98};
    var wk=ud.weaponKind||"none";
    /* baseline: relaxed stand */
    var P={ rigY:0, rigZ:0, torsoX:Math.sin(t*1.9)*0.008*k, torsoY:Math.sin(t*0.9)*0.012*k,
      headX:Math.sin(t*1.1)*0.012*k, headY:Math.sin(t*0.62)*0.035*k,
      aLx:Math.sin(t*1.5)*0.02, aLz:0.07+Math.sin(t*1.3)*0.004, aLe:0.12,
      aRx:-Math.sin(t*1.5)*0.02, aRz:-0.07-Math.sin(t*1.3)*0.004, aRe:0.12,
      lLx:0, lLz:0, lLk:0.02, lRx:0, lRz:0, lRk:0.02,
      bob:Math.sin(t*1.9)*0.011*k };
    var s=R.actScene;
    if(s==="travelling"){
      var ws=R.running?5.2:2.4, sw=Math.sin(t*ws), swAbs=Math.abs(sw);
      var la=(R.running?0.5:0.26)*robeK;
      P.lLx=-sw*la; P.lRx=sw*la;
      P.lLk=Math.max(0.04,-sw)*0.85*robeK; P.lRk=Math.max(0.04,sw)*0.85*robeK;
      P.aLx=sw*(R.running?0.45:0.22); P.aRx=-sw*(R.running?0.45:0.22);
      P.aLe=0.3+swAbs*0.2; P.aRe=0.3+swAbs*0.2;
      P.torsoX=0.06+(R.running?0.07:0.02); P.bob=swAbs*(R.running?0.032:0.012);
      P.headY=Math.sin(t*0.5)*0.06;
    } else if(s==="resting"){
      /* sit on the ground, arms over knees, slow deep breath */
      P.rigY=-(plan.hipY-0.14);
      P.lLx=-1.32*robeK-(ud.robed?0.25:0); P.lRx=-1.32*robeK-(ud.robed?0.25:0);
      P.lLz=0.3*robeK; P.lRz=-0.3*robeK; P.lLk=1.12*robeK+(ud.robed?0.3:0); P.lRk=1.12*robeK+(ud.robed?0.3:0);
      P.aLx=-0.5; P.aRx=-0.5; P.aLz=0.16; P.aRz=-0.16; P.aLe=0.85; P.aRe=0.85;
      P.torsoX=0.1+Math.sin(t*1.05)*0.02; P.headX=0.08+Math.sin(t*1.05)*0.015; P.headY=Math.sin(t*0.4)*0.05;
      P.bob=Math.sin(t*1.05)*0.006;
    } else if(s==="fighting"){
      /* staggered stance + weapon-aware attack cycle */
      P.lLx=-0.2; P.lLz=0.1*robeK; P.lLk=0.24*robeK; P.lRx=0.26; P.lRz=-0.1*robeK; P.lRk=0.34*robeK;
      P.torsoX=0.1; P.headX=0.04; P.headY=0;
      var cyc=R.running?1.5:2.6, p=(t%cyc)/cyc;
      if(wk==="bow"){
        /* nock, draw, hold, loose */
        P.aLx=-1.28; P.aLz=0.1; P.aLe=0.12;
        var d=p<0.45?easeOut(p/0.45):(p<0.7?1:(p<0.78?1-easeOut((p-0.7)/0.08):0));
        P.aRx=-1.05*d-0.15; P.aRe=0.35+d*0.95; P.torsoY=-0.28*d;
      } else if(wk==="staff"||wk==="wand"||wk==="orb"||wk==="tome"){
        /* gather, thrust cast */
        var c=p<0.55?easeOut(p/0.55):(p<0.7?1:1-easeOut((p-0.7)/0.3));
        P.aRx=-0.3-c*1.05; P.aRe=1.05-c*0.75; P.aRz=-0.12;
        P.aLx=-0.45*c; P.aLe=0.9; P.aLz=0.2;
        P.torsoY=0.16*c; P.rigZ=0.04*c;
      } else if(wk==="dual"||wk==="dagger"){
        var pA=(t%1.1)/1.1, pB=((t+0.55)%1.1)/1.1;
        var slash=function(q){ return q<0.4?-easeOut(q/0.4)*1.35-0.2:(q<0.55?0.35:-0.2); };
        P.aRx=slash(pA); P.aRe=0.55+Math.max(0,Math.sin(pA*Math.PI))*0.5;
        P.aLx=slash(pB); P.aLe=0.55+Math.max(0,Math.sin(pB*Math.PI))*0.5; P.aLz=0.18;
        P.torsoY=Math.sin(t*5.7)*0.12; P.bob=Math.abs(Math.sin(t*5.7))*0.012;
      } else if(wk==="none"){
        /* unarmed: guard + jab cross */
        var j=(t%1.2)/1.2;
        P.aLx=-0.95; P.aLe=1.25; P.aLz=0.28;
        P.aRx=j<0.25?-0.95-easeOut(j/0.25)*0.45:(j<0.4?-0.35:-0.95);
        P.aRe=j<0.4?0.35:1.25; P.aRz=-0.28;
        P.torsoY=j<0.4?0.2:0.05; P.bob=Math.abs(Math.sin(t*4.6))*0.01;
      } else {
        /* melee swing: windup high, strike through, recover */
        var w2=p<0.42?easeOut(p/0.42):0, st2=(p>=0.42&&p<0.56)?easeOut((p-0.42)/0.14):0, rec=p>=0.56?easeOut((p-0.56)/0.44):0;
        if(p<0.42){ P.aRx=-0.2-w2*1.55; P.aRe=0.35+w2*0.85; }
        else if(p<0.56){ P.aRx=-1.75+st2*2.1; P.aRe=1.2-st2*0.75; }
        else { P.aRx=0.35-0.55*rec; P.aRe=0.45-0.1*rec; }
        P.aLx=-0.6; P.aLe=1.05; P.aLz=0.22; /* guard */
        P.torsoY=(p<0.42)?(-w2*0.22):(p<0.56?(-0.22+st2*0.62):(0.4-0.58*rec));
        P.rigZ=st2*0.06; P.bob=st2*0.02;
      }
    } else if(s==="hunting"){
      /* low stalk; with a bow: aim-and-loose */
      P.rigY=-0.07; P.torsoX=0.26; P.headX=0.1;
      P.lLx=-0.32; P.lRx=-0.32; P.lLk=0.5*robeK; P.lRk=0.5*robeK; P.lLz=0.08; P.lRz=-0.08;
      if(wk==="bow"){
        P.aLx=-1.22; P.aLz=0.1; P.aLe=0.12;
        var hp=(t%3.0)/3.0, hd=hp<0.4?easeOut(hp/0.4):(hp<0.75?1:(hp<0.82?1-easeOut((hp-0.75)/0.07):0));
        P.aRx=-1.0*hd-0.15; P.aRe=0.3+hd*1.0; P.torsoY=-0.3*hd; P.headY=-0.12*hd;
      } else {
        var step=Math.sin(t*2.2);
        P.lLx=-0.32+step*0.16*robeK; P.lRx=-0.32-step*0.16*robeK;
        P.aLx=-0.4; P.aLe=0.7; P.aRx=-0.45; P.aRe=0.75;
        P.headY=Math.sin(t*0.7)*0.32; P.bob=Math.abs(step)*0.008;
      }
    } else if(s==="crafting"){
      var craftCyc=R.running?0.95:1.6;
      var hp2=(t%craftCyc)/craftCyc;
      var raise=hp2<0.55?easeOut(hp2/0.55):0, strike=(hp2>=0.55&&hp2<0.68)?easeOut((hp2-0.55)/0.13):0;
      if(ud.robed){ /* standing tinker for robes */
        P.torsoX=0.2; P.headX=0.32;
        P.aLx=-0.7; P.aLe=1.0; P.aLz=0.2;
      } else { /* kneel: left knee down, right foot planted */
        P.rigY=-(plan.hipY*0.42);
        P.lLx=-1.5; P.lLk=1.55; P.lLz=0.12;
        P.lRx=-0.72; P.lRk=1.28; P.lRz=-0.14;
        P.torsoX=0.3; P.headX=0.4;
        P.aLx=-0.72; P.aLe=0.95; P.aLz=0.18; /* steadying the work */
      }
      if(hp2<0.55){ P.aRx=-0.5-raise*1.0; P.aRe=0.5+raise*0.7; }
      else if(hp2<0.68){ P.aRx=-1.5+strike*1.35; P.aRe=1.2-strike*0.55; }
      else { P.aRx=-0.15-easeOut((hp2-0.68)/0.32)*0.35; P.aRe=0.65; }
      P.bob=strike*0.012;
    } else if(s==="meditating"){
      /* cross-legged, gently floating */
      P.rigY=-(plan.hipY-0.2)+0.1+Math.sin(t*1.1)*0.035;
      P.lLx=-1.5*robeK-(ud.robed?0.4:0); P.lRx=-1.5*robeK-(ud.robed?0.4:0);
      P.lLz=0.55*robeK; P.lRz=-0.55*robeK; P.lLk=2.0*robeK+(ud.robed?0.5:0); P.lRk=2.0*robeK+(ud.robed?0.5:0);
      P.aLx=-0.32; P.aRx=-0.32; P.aLz=0.3; P.aRz=-0.3; P.aLe=1.3; P.aRe=1.3;
      P.torsoX=0.02+Math.sin(t*0.9)*0.02; P.headX=Math.sin(t*0.9)*0.02; P.headY=0;
      P.bob=0;
    } else if(s==="looting"){
      /* crouched, hands rummaging */
      P.rigY=-(plan.hipY*0.34);
      P.lLx=-0.92; P.lRx=-0.92; P.lLk=1.3*robeK+(ud.robed?0.2:0); P.lRk=1.3*robeK+(ud.robed?0.2:0);
      P.lLz=0.12; P.lRz=-0.12;
      P.torsoX=0.46; P.headX=0.4+((Math.sin(t*0.55)>0.92)?-0.5:0); P.headY=Math.sin(t*0.8)*0.12;
      var rum=t*(R.running?3.6:2.4);
      P.aLx=-0.62+Math.sin(rum+Math.PI)*0.28; P.aLe=0.85+Math.sin(rum*1.3)*0.2; P.aLz=0.2;
      P.aRx=-0.72+Math.sin(rum)*0.3; P.aRe=0.9+Math.sin(rum*1.3+1)*0.22; P.aRz=-0.2;
      P.bob=0;
    }
    return P;
  }
  function applyPose(h, ud, t, dt){
    var tgt=scenePose(t, ud);
    var pose=R.pose, a=1-Math.exp(-dt*9);
    for(var key in tgt){ if(pose[key]===undefined) pose[key]=tgt[key]; else pose[key]+=(tgt[key]-pose[key])*a; }
    var tb=ud.torsoBaseY||1.16, hb=ud.headBaseY||1.815;
    h.position.y=pose.rigY+pose.bob; h.position.z=pose.rigZ;
    if(ud.torso){ ud.torso.position.y=tb+pose.bob*0.4; ud.torso.rotation.x=pose.torsoX; ud.torso.rotation.y=pose.torsoY; }
    if(ud.headG){ ud.headG.position.y=hb+pose.bob*0.5; ud.headG.rotation.x=pose.headX; ud.headG.rotation.y=pose.headY; }
    if(ud.armL){ ud.armL.rotation.x=pose.aLx; ud.armL.rotation.z=pose.aLz; if(ud.armL.userData.elbow) ud.armL.userData.elbow.rotation.x=-Math.max(0,pose.aLe); }
    if(ud.armR){ ud.armR.rotation.x=pose.aRx; ud.armR.rotation.z=pose.aRz; if(ud.armR.userData.elbow) ud.armR.userData.elbow.rotation.x=-Math.max(0,pose.aRe); }
    if(ud.legL){ ud.legL.rotation.x=pose.lLx; ud.legL.rotation.z=pose.lLz; if(ud.legL.userData.knee) ud.legL.userData.knee.rotation.x=Math.max(0,pose.lLk); }
    if(ud.legR){ ud.legR.rotation.x=pose.lRx; ud.legR.rotation.z=pose.lRz; if(ud.legR.userData.knee) ud.legR.userData.knee.rotation.x=Math.max(0,pose.lRk); }
  }
  function tick(now){
    R.raf=requestAnimationFrame(tick); var dt=Math.min(0.05,(now-R.last)/1000); R.last=now; R.clock+=dt; var t=R.clock;
    if(R.reduced){ if(R.renderer&&R.scene&&R.camera){ try{ R.renderer.render(R.scene,R.camera); if(R.container){ R.container.setAttribute("data-fh3d-ready","1"); R.container.classList.add("fh3d-ready"); } }catch(e){ stopLoop(); } } return; }
    if(R.autoSpin&&!R.dragging&&R.mode!=="studio") R.targetYaw+=dt*0.45;
    R.yaw+=(R.targetYaw-R.yaw)*Math.min(1,dt*8); if(R.root) R.root.rotation.y=R.yaw;
    R.pitch+=((R.targetPitch||0)-R.pitch)*Math.min(1,dt*8);
    if(R.targetDist){ R.dist+=(R.targetDist-R.dist)*Math.min(1,dt*8); R.camera.position.set(0,1.16+R.pitch*0.6,R.dist); R.camera.lookAt(0,R.lookY,0); }
    if(R.heroRig){ var h=R.heroRig, ud=h.userData;
      R.sceneT+=dt;
      if(!R.mounted){
        applyPose(h, ud, t, dt);
      } else {
        /* riding: relaxed rein-holding sway (pose machine resumes on foot) */
        if(ud.armL){ ud.armL.rotation.x=0.55+Math.sin(t*1.1)*0.02; if(ud.armL.userData.elbow) ud.armL.userData.elbow.rotation.x=-0.4; }
        if(ud.armR){ ud.armR.rotation.x=0.55-Math.sin(t*1.1)*0.02; if(ud.armR.userData.elbow) ud.armR.userData.elbow.rotation.x=-0.4; }
        if(ud.headG){ ud.headG.rotation.y=Math.sin(t*0.62)*0.03; ud.headG.rotation.x=Math.sin(t*1.1)*0.012; }
      }
      if(ud.headG){
        /* blink */
        R.blinkT-=dt; if(R.blinkT<=0){ R.blinkPhase=0.14; R.blinkT=2.2+Math.random()*3.2; }
        if(R.blinkPhase>0){ R.blinkPhase-=dt; var k=Math.max(0,R.blinkPhase)/0.14, open=Math.abs(k-0.5)*2;
          var lids=ud.headG.userData.lids||[]; for(var li=0;li<lids.length;li++){ var ld=lids[li]; ld.scale.y=1+(1-open)*1.5; ld.position.y=(ld.userData.baseY||0.04)-(1-open)*0.01; } }
      }
      if(ud.cloak){ ud.cloak.rotation.x=Math.sin(t*1.25)*0.04+(R.running?0.14:0.03)+Math.max(0,(R.pose&&R.pose.torsoX)||0)*0.5; }
      if(ud.tail){ ud.tail.rotation.y=Math.sin(t*1.6)*0.25; ud.tail.rotation.x=Math.sin(t*1.1)*0.06; }
      if(ud.wings){ for(var wi=0;wi<ud.wings.length;wi++){ var sgn=wi===0?-1:1; ud.wings[wi].rotation.y=0.5*sgn+Math.sin(t*6+wi)*0.25*sgn; } }
      if(ud.headG&&ud.headG.userData.halo){ ud.headG.userData.halo.rotation.z=t*0.6; ud.headG.userData.halo.position.y=0.148*1.45+Math.sin(t*1.8)*0.008; }
    }
    if(R.floaters){ for(var fi=0;fi<R.floaters.length;fi++){ var fo=R.floaters[fi]; fo.position.y+= Math.sin(t*2.2+fi)*0.0009; fo.rotation.y=t*0.9; } }
    if(R.auraRing&&R.auraRing.material.opacity>0){ R.auraRing.material.opacity*= (1+Math.sin(t*2.4)*0.004); R.auraRing.rotation.z=t*0.25; }
    if(R.mountGroup){ var mg=R.mountGroup;
      if(mg.userData.skiff){ mg.position.y=Math.sin(t*1.4)*0.05; if(mg.userData.core){ mg.userData.core.rotation.y=t*2; }
        if(R.heroRig) R.heroRig.position.y=((R.heroRig.userData.mountBaseY!==undefined)?R.heroRig.userData.mountBaseY:0.62)+Math.sin(t*1.4)*0.05; }
      else { var run=R.running, gy=run?Math.abs(Math.sin(t*6))*0.05:Math.sin(t*1.7)*0.015; mg.position.y=gy;
        if(R.heroRig&&R.heroRig.userData.mounted) R.heroRig.position.y=((R.heroRig.userData.mountBaseY!==undefined)?R.heroRig.userData.mountBaseY:0.5)+gy;
        var legs=mg.userData.legs||[]; for(var i=0;i<legs.length;i++) legs[i].rotation.x=Math.sin(t*(run?7.5:2.0)+(i<2?0:Math.PI))*(run?0.5:0.1);
        if(mg.userData.wing){ var fl=Math.sin(t*(run?5.5:2.4));
          for(var wj=0;wj<mg.userData.wing.length;wj++){ var sg2=wj===0?1:-1; mg.userData.wing[wj].rotation.z=(0.12+fl*0.35)*sg2; } }
      }
    }
    if(R.petGroup){ var pa=t*0.75; R.petGroup.position.set(Math.cos(pa)*0.72,1.28+Math.sin(t*2)*0.06,Math.sin(pa)*0.45-0.12); R.petGroup.rotation.y=-pa+HPI;
      if(R.petGroup.userData.wings){ for(var pw=0;pw<R.petGroup.userData.wings.length;pw++){ var ps=pw===0?-1:1; R.petGroup.userData.wings[pw].rotation.z=-1.1*ps+Math.sin(t*9)*0.35*ps; } }
      if(R.petGroup.userData.spinAll){ R.petGroup.rotation.x=Math.sin(t*1.3)*0.2; }
    }
    if(R.renderer&&R.scene&&R.camera){ try{ R.renderer.render(R.scene,R.camera); if(R.container){ R.container.setAttribute("data-fh3d-ready","1"); R.container.classList.add("fh3d-ready"); } }catch(e){ if(R.container){ R.container.setAttribute("data-fh3d-ready","0"); R.container.classList.remove("fh3d-ready"); } stopLoop(); } }
  }
  FH3D.wireModal=function(modalId, studioHostId, homeHostId){ var modal=document.getElementById(modalId); if(!modal||!window.MutationObserver) return;
    var obs=new MutationObserver(function(){ var hidden=modal.hasAttribute("hidden"); if(hidden){ var hh=document.getElementById(homeHostId); if(hh) FH3D.attachHome(hh); } else { var st=document.getElementById(studioHostId); if(st) FH3D.attachStudio(st); } });
    obs.observe(modal, { attributes:true, attributeFilter:["hidden"] }); };
  FH3D._R=R;
})();
