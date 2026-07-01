/* ============================================================================
 * Focus Hero — FH3D v6 : real 3D primary renderer, readiness-gated fallback
 * Pure renderer (reads a plain spec via FH3D.sync; never touches app state).
 * v5: keeps the realistic proportions/PBR base, then adds class-specific model
 * signatures, distinct weapon silhouettes, aquatic/insect mounts, and a richer
 * studio presentation so equipped gear/mounts read like actual model changes.
 * SPEC: { cls, className, palette, level, running,
 *   colors:{skin,hair,eye,armorMid,armorHigh,armorDark,accent,cloak},
 *   traits:{race,body,hair,helm,face,eyeShape},
 *   equipped:{weapon,helmet,armor,pet}, mount:null|{id,family,tier,colors} }
 * ==========================================================================*/
(function () {
  "use strict";
  var FH3D = (window.FH3D = window.FH3D || {});
  FH3D.available = false; FH3D.version = "fh3d-6.0";
  var THREE = window.THREE;
  function webglSupported(){ try{ if(!THREE) return false; var c=document.createElement("canvas"); return !!(c.getContext("webgl2")||c.getContext("webgl")||c.getContext("experimental-webgl")); }catch(e){ return false; } }
  function col(hex, fb){ try{ return new THREE.Color(hex||fb||"#888"); }catch(e){ return new THREE.Color(fb||"#888"); } }
  function darken(hex,a){ var c=col(hex); c.offsetHSL(0,0,-a); return c; }
  function lighten(hex,a){ var c=col(hex); c.offsetHSL(0,0,a); return c; }

  var R = { renderer:null, scene:null, camera:null, env:null, root:null, heroRig:null, mountGroup:null, petGroup:null, pedestal:null,
    disposables:[], raf:0, last:0, clock:0, yaw:0, targetYaw:0, autoSpin:true, dragging:false, lastPointerX:0,
    mode:"home", mounted:false, running:false, lookY:1.0, sig:"", container:null, ro:null, io:null, initialized:false };

  function initEngine(){
    if (R.initialized) return true; if (!webglSupported()) return false;
    try {
      var renderer = new THREE.WebGLRenderer({ antialias:true, alpha:true, powerPreference:"high-performance" });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio||1, 2));
      renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      if ("outputColorSpace" in renderer) renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.08;
      var cs = renderer.domElement.style; cs.position="absolute"; cs.left="0"; cs.top="0"; cs.width="100%"; cs.height="100%"; cs.display="block"; cs.borderRadius="inherit"; cs.touchAction="pan-y";
      renderer.domElement.className = "fh3d-canvas"; renderer.domElement.setAttribute("aria-hidden","true");
      var scene = new THREE.Scene(); scene.background = makeBackdrop("#7e90b5","#27304a");
      R.env = makeEnv(renderer); scene.environment = R.env;
      var camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100); camera.position.set(0,1.3,4.6);
      var hemi = new THREE.HemisphereLight(0xd6e6ff, 0x35302a, 0.7); scene.add(hemi);
      var key = new THREE.DirectionalLight(0xfff3df, 2.4); key.position.set(3.0,5.4,3.6); key.castShadow=true;
      key.shadow.mapSize.set(2048,2048); key.shadow.camera.near=1; key.shadow.camera.far=20; key.shadow.camera.left=-3; key.shadow.camera.right=3; key.shadow.camera.top=3.6; key.shadow.camera.bottom=-2; key.shadow.bias=-0.0008; key.shadow.normalBias=0.028; scene.add(key);
      var fill = new THREE.DirectionalLight(0x9fc2ff, 0.5); fill.position.set(-4,2.2,1.6); scene.add(fill);
      var rim = new THREE.DirectionalLight(0xe3f0ff, 1.45); rim.position.set(-1.4,3,-4.2); scene.add(rim);
      var root = new THREE.Group(); scene.add(root);
      var ped = new THREE.Group();
      var pedMat = new THREE.MeshStandardMaterial({ color:0x29354f, roughness:0.6, metalness:0.25, envMapIntensity:0.7 });
      var pedTop = new THREE.MeshStandardMaterial({ color:0x3c4f7e, roughness:0.35, metalness:0.4, envMapIntensity:1.0 });
      var disc = new THREE.Mesh(new THREE.CylinderGeometry(0.85,0.98,0.13,56), pedMat); disc.position.y=-0.065; disc.receiveShadow=true; ped.add(disc);
      var ring = new THREE.Mesh(new THREE.TorusGeometry(0.83,0.032,10,56), pedTop); ring.rotation.x=Math.PI/2; ring.position.y=0.006; ped.add(ring);
      var floor = new THREE.Mesh(new THREE.CircleGeometry(2.4,48), new THREE.ShadowMaterial({ opacity:0.34 })); floor.rotation.x=-Math.PI/2; floor.receiveShadow=true; ped.add(floor);
      root.add(ped); R.pedestal = ped;
      R.renderer=renderer; R.scene=scene; R.camera=camera; R.root=root; R.initialized=true; FH3D.available=true;
      wirePointer(renderer.domElement);
      document.addEventListener("visibilitychange", function(){ if(document.hidden) stopLoop(); else startLoop(); });
      return true;
    } catch(e){ console.warn("[FH3D] init failed:", e); FH3D.available=false; return false; }
  }
  function makeBackdrop(inner, outer){ var c=document.createElement("canvas"); c.width=c.height=256; var g=c.getContext("2d"); var gr=g.createRadialGradient(128,90,16,128,150,240); gr.addColorStop(0,inner); gr.addColorStop(1,outer); g.fillStyle=gr; g.fillRect(0,0,256,256); var t=new THREE.CanvasTexture(c); if("colorSpace" in t) t.colorSpace=THREE.SRGBColorSpace; return t; }
  function makeEnv(renderer){ try{ var pmrem=new THREE.PMREMGenerator(renderer); var c=document.createElement("canvas"); c.width=128; c.height=64; var g=c.getContext("2d"); var gr=g.createLinearGradient(0,0,0,64); gr.addColorStop(0,"#e8f0ff"); gr.addColorStop(0.5,"#8ea4c8"); gr.addColorStop(0.5,"#444c5e"); gr.addColorStop(1,"#1f242f"); g.fillStyle=gr; g.fillRect(0,0,128,64); g.fillStyle="rgba(255,247,225,0.95)"; g.beginPath(); g.arc(34,16,11,0,7); g.fill(); var tex=new THREE.CanvasTexture(c); tex.mapping=THREE.EquirectangularReflectionMapping; var rt=pmrem.fromEquirectangular(tex); tex.dispose(); pmrem.dispose(); return rt.texture; }catch(e){ return null; } }
  function makeDetailTexture(seed, base, line){
    var c=document.createElement("canvas"); c.width=c.height=128; var g=c.getContext("2d");
    g.fillStyle=base||"#777"; g.fillRect(0,0,128,128);
    var s=seed||17; function rnd(){ s=(s*1664525+1013904223)>>>0; return s/4294967296; }
    for(var i=0;i<1500;i++){ var v=80+(rnd()*95|0); g.fillStyle="rgba("+v+","+v+","+v+","+(0.035+rnd()*0.045)+")"; g.fillRect(rnd()*128,rnd()*128,1+rnd()*2,1+rnd()*2); }
    g.strokeStyle=line||"rgba(255,255,255,.12)"; g.lineWidth=1;
    for(var y=12;y<128;y+=18){ g.beginPath(); g.moveTo(0,y+(rnd()*4-2)); g.lineTo(128,y+(rnd()*4-2)); g.stroke(); }
    for(var x=18;x<128;x+=24){ g.beginPath(); g.moveTo(x+(rnd()*4-2),0); g.lineTo(x+(rnd()*4-2),128); g.stroke(); }
    var t=new THREE.CanvasTexture(c); t.wrapS=t.wrapT=THREE.RepeatWrapping; t.repeat.set(2,2); if("colorSpace" in t) t.colorSpace=THREE.SRGBColorSpace; R.disposables.push(t); return t;
  }

  function M(geo, mat, x, y, z){ var m=new THREE.Mesh(geo, mat); if(x!==undefined) m.position.set(x,y,z); m.castShadow=true; m.receiveShadow=true; R.disposables.push(geo); return m; }
  var OUTLINE_MAT = new THREE.MeshBasicMaterial({ color:0x0a0c12, side:THREE.BackSide });
  function addOutlines(group, scale){ scale=scale||1.07; var ms=[]; group.traverse(function(o){ if(o.isMesh && !o.userData._ol && !o.userData.noOutline) ms.push(o); });
    ms.forEach(function(m){ var o=new THREE.Mesh(m.geometry, OUTLINE_MAT); o.position.copy(m.position); o.quaternion.copy(m.quaternion); o.scale.copy(m.scale).multiplyScalar(scale); o.userData._ol=true; o.castShadow=false; o.receiveShadow=false; o.renderOrder=-1; if(m.parent) m.parent.add(o); }); }
  function disposeGroup(g){ if(!g) return; g.traverse(function(o){ if(o.geometry && !o.userData._ol) o.geometry.dispose(); }); }
  function flush(){ for(var i=0;i<R.disposables.length;i++){ try{ R.disposables[i].dispose(); }catch(e){} } R.disposables.length=0; }

  function makeMats(spec){
    var c=spec.colors, m={};
    function s(o){ var mt=new THREE.MeshStandardMaterial(o); R.disposables.push(mt); return mt; }
    var armorTex=makeDetailTexture(31,"#777","rgba(255,255,255,.16)"), darkTex=makeDetailTexture(43,"#555","rgba(255,255,255,.09)"), clothTex=makeDetailTexture(59,"#444","rgba(255,255,255,.08)"), skinTex=makeDetailTexture(71,"#999","rgba(255,255,255,.04)");
    m.skin=s({ color:col(c.skin,"#e7b48c"), roughness:0.72, metalness:0.0, envMapIntensity:0.4, bumpMap:skinTex, bumpScale:0.004 });
    m.armor=s({ color:col(c.armorMid,"#465e80"), roughness:0.36, metalness:0.62, envMapIntensity:1.05, bumpMap:armorTex, bumpScale:0.014 });
    m.armorHi=s({ color:col(c.armorHigh,"#7e97bd"), roughness:0.28, metalness:0.72, envMapIntensity:1.2, bumpMap:armorTex, bumpScale:0.012 });
    m.armorDk=s({ color:col(c.armorDark,"#22304a"), roughness:0.48, metalness:0.5, envMapIntensity:0.85, bumpMap:darkTex, bumpScale:0.016 });
    m.trim=s({ color:col(c.accent,"#f6cb6e"), roughness:0.28, metalness:0.85, envMapIntensity:1.3 });
    m.cloak=s({ color:col(c.cloak,"#3a5a9c"), roughness:0.86, metalness:0.0, envMapIntensity:0.35, side:THREE.DoubleSide, bumpMap:clothTex, bumpScale:0.018 });
    m.hair=s({ color:col(c.hair,"#3a2417"), roughness:0.76, metalness:0.04, envMapIntensity:0.42, bumpMap:darkTex, bumpScale:0.01 });
    m.boot=s({ color:darken(c.armorDark||"#22304a",0.03), roughness:0.45, metalness:0.4 });
    m.leather=s({ color:col("#5b3d22"), roughness:0.8, metalness:0.1 });
    var eyeC=col(c.eye,"#6cc6ff");
    m.eye=s({ color:eyeC, roughness:0.18, emissive:eyeC.clone().multiplyScalar(0.2) });
    m.eyeWhite=s({ color:0xf6f9ff, roughness:0.3 });
    m.dark=s({ color:0x12161e, roughness:0.45 });
    m.mouth=s({ color:0x7a3b33, roughness:0.6 });
    var energyC=col(c.accent,"#8b9cff");
    m.energy=s({ color:energyC, roughness:0.22, metalness:0.12, emissive:energyC.clone().multiplyScalar(0.45), envMapIntensity:1.25, transparent:true, opacity:0.92 });
    return m;
  }

  /* ===================== HERO (heroic-realistic ~6 heads) ===================== */
  function buildHero(spec){
    var mats=makeMats(spec), t=spec.traits||{}, rig=new THREE.Group();
    var build=t.body||"balanced";
    var bw= build==="broad"?1.12: build==="lean"?0.92:1.0;
    var HIPY=0.86;
    // legs
    var legL=makeLeg(mats); legL.position.set(-0.13*bw,HIPY,0); rig.add(legL);
    var legR=makeLeg(mats); legR.position.set(0.13*bw,HIPY,0); rig.add(legR);
    rig.userData.legL=legL; rig.userData.legR=legR;
    // pelvis (connects legs to torso, no gap)
    var pelvis=M(new THREE.SphereGeometry(0.24*bw,22,16), mats.armorDk); pelvis.position.y=0.92; pelvis.scale.set(1,0.64,0.86); rig.add(pelvis);
    // torso
    var torso=new THREE.Group(); torso.position.y=1.16; rig.add(torso); rig.userData.torso=torso;
    var chest=M(new THREE.CapsuleGeometry(0.265*bw,0.38,10,24), mats.armor); chest.scale.set(1.08,1,0.76); torso.add(chest);
    var collar=M(new THREE.TorusGeometry(0.135,0.026,8,22), mats.trim); collar.rotation.x=Math.PI/2.2; collar.position.set(0,0.2,0.03); torso.add(collar);
    var plate=M(new THREE.CapsuleGeometry(0.15*bw,0.2,8,18), mats.armorHi); plate.position.set(0,0.01,0.15*bw); plate.scale.set(1.0,1,0.38); torso.add(plate);
    var sternum=M(new THREE.BoxGeometry(0.02,0.26,0.02), mats.trim); sternum.position.set(0,0.0,0.2*bw); torso.add(sternum);
    var clsMat=new THREE.MeshStandardMaterial({ color:col((spec.palette&&spec.palette[1])||spec.colors.accent,"#f6cb6e"), roughness:0.3, metalness:0.7, emissive:col((spec.palette&&spec.palette[1])||"#222").multiplyScalar(0.15), envMapIntensity:1.2 }); R.disposables.push(clsMat);
    var emblem=M(new THREE.OctahedronGeometry(0.05,0), clsMat); emblem.position.set(0,0.04,0.2*bw); torso.add(emblem);
    var belt=M(new THREE.TorusGeometry(0.2*bw,0.035,10,24), mats.leather); belt.rotation.x=Math.PI/2; belt.position.y=-0.22; belt.scale.z=0.8; torso.add(belt);
    var buckle=M(new THREE.BoxGeometry(0.07,0.06,0.03), mats.trim); buckle.position.set(0,-0.22,0.16*bw); torso.add(buckle);
    // pauldrons (modest, sit ON shoulders)
    var pL=M(new THREE.SphereGeometry(0.14*bw,18,14), mats.armorHi); pL.position.set(-0.31*bw,0.17,0); pL.scale.set(1.12,0.72,0.9); torso.add(pL);
    var pR=pL.clone(); pR.position.x=0.31*bw; torso.add(pR);
    // neck
    var neck=M(new THREE.CylinderGeometry(0.07,0.082,0.12,12), mats.skin); neck.position.y=1.44; rig.add(neck);
    // head
    var HR=0.168;
    var headG=new THREE.Group(); headG.position.y=1.6; rig.add(headG); rig.userData.headG=headG;
    var head=M(new THREE.SphereGeometry(HR,28,24), mats.skin); head.scale.set(0.96,1.08,0.98); headG.add(head);
    var jaw=M(new THREE.SphereGeometry(HR*0.82,18,14), mats.skin); jaw.position.set(0,-0.08,0.02); jaw.scale.set(0.92,0.78,0.95); headG.add(jaw);
    var helm=t.helm||"open"; var helmetGear=spec.equipped&&spec.equipped.helmet?spec.equipped.helmet.id:null;
    if (helm==="closed") buildKnightHelm(headG, mats, HR);
    else { buildFace(headG, mats, spec, t, HR); addHair(headG, t.hair||"short", mats.hair, HR);
      if (helm==="open"||helm==="crest"){ var band=M(new THREE.TorusGeometry(HR*0.98,0.022,10,26), mats.armorHi); band.rotation.x=Math.PI/2; band.position.y=HR*0.55; headG.add(band); }
      if (helm==="crest") addPlume(headG, mats, HR);
    }
    // arms
    var sx=0.32*bw, sy=1.37;
    var armL=makeArm(mats); armL.position.set(-sx,sy,0); armL.rotation.z=0.1; rig.add(armL);
    var armR=makeArm(mats); armR.position.set(sx,sy,0); armR.rotation.z=-0.1; rig.add(armR);
    rig.userData.armL=armL; rig.userData.armR=armR;
    // cloak
    if (spec.colors.cloak && spec.equipped && spec.equipped.armor){
      var sh=new THREE.Shape();
      sh.moveTo(-0.26*bw,0.34); sh.bezierCurveTo(-0.36*bw,-0.1,-0.24*bw,-0.6,-0.13*bw,-0.82);
      sh.bezierCurveTo(-0.06*bw,-0.9,0.06*bw,-0.9,0.13*bw,-0.82);
      sh.bezierCurveTo(0.24*bw,-0.6,0.36*bw,-0.1,0.26*bw,0.34);
      sh.bezierCurveTo(0.14*bw,0.2,-0.14*bw,0.2,-0.26*bw,0.34);
      var cg=new THREE.ShapeGeometry(sh,10); R.disposables.push(cg);
      var cloak=new THREE.Mesh(cg, mats.cloak); cloak.castShadow=true; cloak.userData.noOutline=true; cloak.position.set(0,1.18,-0.28*bw); rig.add(cloak); rig.userData.cloak=cloak;
      var clasp=M(new THREE.SphereGeometry(0.04,12,10), mats.trim); clasp.position.set(0,1.45,-0.02); rig.add(clasp);
    }
    addArmorGear(rig, spec, mats, torso, bw);
    addHelmetGear(headG, spec, mats, HR);
    addWeapon(rig.userData.armR, spec, mats);
    addClassSignature(rig, torso, headG, spec, mats, bw, HR);
    return rig;
  }
  function makeLeg(mats){
    var g=new THREE.Group();
    var thigh=M(new THREE.CapsuleGeometry(0.115,0.31,8,14), mats.armorDk); thigh.position.y=-0.2; g.add(thigh);
    var knee=M(new THREE.SphereGeometry(0.105,16,12), mats.armorHi); knee.position.y=-0.4; g.add(knee);
    var shin=M(new THREE.CapsuleGeometry(0.098,0.31,8,14), mats.armor); shin.position.y=-0.6; g.add(shin);
    var boot=M(new THREE.SphereGeometry(0.13,16,12), mats.boot); boot.position.set(0,-0.82,0.055); boot.scale.set(1.04,0.62,1.55); g.add(boot);
    g.userData.thigh=thigh; return g;
  }
  function makeArm(mats){
    var g=new THREE.Group();
    var sh=M(new THREE.SphereGeometry(0.105,16,12), mats.armor); g.add(sh);
    var up=M(new THREE.CapsuleGeometry(0.082,0.25,8,12), mats.armor); up.position.y=-0.19; g.add(up);
    var elbow=M(new THREE.SphereGeometry(0.078,14,10), mats.armorHi); elbow.position.y=-0.36; g.add(elbow);
    var fore=M(new THREE.CapsuleGeometry(0.074,0.23,8,12), mats.armorDk); fore.position.y=-0.52; g.add(fore);
    var hand=M(new THREE.SphereGeometry(0.078,14,10), mats.leather); hand.position.y=-0.69; g.add(hand);
    g.userData.hand=hand; return g;
  }
  function buildFace(headG, mats, spec, t, HR){
    var z=HR*0.9, ex=0.07, eyeR=t.eyeShape==="round"?0.04:t.eyeShape==="sharp"?0.028:0.034;
    var wL=M(new THREE.SphereGeometry(0.042,16,12), mats.eyeWhite); wL.position.set(-ex,0.01,z*0.9); wL.scale.set(1,0.8,0.5); headG.add(wL);
    var wR=wL.clone(); wR.position.x=ex; headG.add(wR);
    var iL=M(new THREE.SphereGeometry(eyeR,14,12), mats.eye); iL.position.set(-ex,0.0,z*0.98); iL.scale.set(1,1,0.5); headG.add(iL);
    var iR=iL.clone(); iR.position.x=ex; headG.add(iR);
    var pL=M(new THREE.SphereGeometry(eyeR*0.5,10,8), mats.dark); pL.position.set(-ex,0,z*1.02); headG.add(pL);
    var pR=pL.clone(); pR.position.x=ex; headG.add(pR);
    var brow=new THREE.MeshStandardMaterial({ color:darken(spec.colors.hair||"#3a2417",0.02), roughness:0.8 }); R.disposables.push(brow);
    var bL=M(new THREE.BoxGeometry(0.07,0.016,0.02), brow); bL.position.set(-ex,0.08,z*0.92); bL.rotation.z=0.08; headG.add(bL);
    var bR=bL.clone(); bR.position.x=ex; bR.rotation.z=-0.08; headG.add(bR);
    var nose=M(new THREE.ConeGeometry(0.022,0.06,8), mats.skin); nose.rotation.x=Math.PI/2.1; nose.position.set(0,-0.02,z*1.02); headG.add(nose);
    if (t.face==="smile"){ var sm=M(new THREE.TorusGeometry(0.045,0.01,8,14,Math.PI), mats.mouth); sm.rotation.z=Math.PI; sm.position.set(0,-0.1,z*0.92); headG.add(sm); }
    else { var mo=M(new THREE.BoxGeometry(0.06,0.012,0.02), mats.mouth); mo.position.set(0,-0.1,z*0.92); headG.add(mo); }
    var race=t.race||"human";
    if (/elf|fae|sprite/.test(race)){ var earL=M(new THREE.ConeGeometry(0.045,0.17,8), mats.skin); earL.position.set(-HR*0.95,0.05,0); earL.rotation.set(0,0.3,Math.PI/2.0); headG.add(earL); var earR=earL.clone(); earR.position.x=HR*0.95; earR.rotation.set(0,-0.3,-Math.PI/2.0); headG.add(earR); }
    else { var eaL=M(new THREE.SphereGeometry(0.04,10,8), mats.skin); eaL.position.set(-HR*0.95,-0.01,0); eaL.scale.set(0.6,1,1); headG.add(eaL); var eaR=eaL.clone(); eaR.position.x=HR*0.95; headG.add(eaR); }
    if (/orc|goblin|troll/.test(race)){ var tu=new THREE.MeshStandardMaterial({ color:0xf3ecd6, roughness:0.5 }); R.disposables.push(tu); var tL=M(new THREE.ConeGeometry(0.022,0.08,6), tu); tL.position.set(-0.05,-0.14,z*0.85); tL.rotation.x=Math.PI; headG.add(tL); var tR=tL.clone(); tR.position.x=0.05; headG.add(tR); }
    if (/dwarf/.test(race)){ var beard=M(new THREE.SphereGeometry(0.16,18,14,0,Math.PI*2,Math.PI*0.5,Math.PI*0.5), mats.hair); beard.position.set(0,-0.12,0.05); beard.scale.set(1,1.3,0.85); headG.add(beard); }
    if (/demon/.test(race)){ var hL=M(new THREE.ConeGeometry(0.04,0.16,8), mats.trim); hL.position.set(-0.12,HR*0.95,-0.04); hL.rotation.z=-0.3; headG.add(hL); var hR=hL.clone(); hR.position.x=0.12; hR.rotation.z=0.3; headG.add(hR); }
  }
  function buildKnightHelm(headG, mats, HR){
    var dome=M(new THREE.SphereGeometry(HR*1.06,26,18,0,Math.PI*2,0,Math.PI*0.66), mats.armorHi); dome.position.y=HR*0.05; dome.scale.set(1,1.04,1.1); headG.add(dome);
    var guard=M(new THREE.SphereGeometry(HR*1.0,24,16,0,Math.PI*2,Math.PI*0.42,Math.PI*0.42), mats.armor); guard.scale.set(1,1,1.12); headG.add(guard);
    var keel=M(new THREE.BoxGeometry(0.028,0.05,HR*2.0), mats.armor); keel.position.set(0,HR*0.7,-0.02); headG.add(keel);
    var nasal=M(new THREE.BoxGeometry(0.035,0.14,0.04), mats.armor); nasal.position.set(0,-0.03,HR*0.96); headG.add(nasal);
    var slit=M(new THREE.BoxGeometry(HR*1.3,0.03,0.03), mats.dark); slit.position.set(0,0.02,HR*0.98); headG.add(slit);
    var tb=M(new THREE.TorusGeometry(HR*0.98,0.014,8,26), mats.trim); tb.rotation.x=Math.PI/2; tb.position.y=-HR*0.2; headG.add(tb);
  }
  function addHair(headG, style, hairMat, HR){
    if (style==="shaved"||style==="bald") return;
    if (style==="mohawk"){ var mh=M(new THREE.BoxGeometry(0.04,HR*0.7,HR*1.7), hairMat); mh.position.set(0,HR*0.7,-0.01); headG.add(mh); return; }
    var cap=M(new THREE.SphereGeometry(HR*1.05,22,16,0,Math.PI*2,0,Math.PI*0.52), hairMat); cap.position.y=HR*0.1; headG.add(cap);
    if (/long/.test(style)){ var back=M(new THREE.CapsuleGeometry(HR*0.7,HR*0.6,6,12), hairMat); back.position.set(0,-HR*0.3,-HR*0.5); back.scale.set(1,1,0.5); headG.add(back); }
    if (/braid/.test(style)){ var brL=M(new THREE.CapsuleGeometry(0.035,HR*0.8,5,10), hairMat); brL.position.set(-HR*0.85,-HR*0.3,0.02); headG.add(brL); var brR=brL.clone(); brR.position.x=HR*0.85; headG.add(brR); }
  }
  function addPlume(headG, mats, HR){ var p=M(new THREE.CapsuleGeometry(0.04,HR*1.0,6,10), mats.trim); p.position.set(0,HR*1.1,-HR*0.2); p.rotation.x=-0.3; headG.add(p); }

  function gMetal(g,fb){ var m=new THREE.MeshStandardMaterial({ color:col(g&&g.metal,fb||"#cbd5e1"), roughness:0.28, metalness:0.9, envMapIntensity:1.25 }); R.disposables.push(m); return m; }
  function gGem(g,fb){ var c=col(g&&g.gem,fb||"#22d3ee"); var m=new THREE.MeshStandardMaterial({ color:c, roughness:0.12, metalness:0.1, emissive:c.clone().multiplyScalar(0.5) }); R.disposables.push(m); return m; }
  function addClassSignature(rig, torso, headG, spec, mats, bw, HR){
    var key=String(spec.cls||"knight").toLowerCase();
    if (/monk/.test(key)){
      var halo=M(new THREE.TorusGeometry(HR*1.22,0.012,8,36), mats.energy); halo.rotation.x=Math.PI/2; halo.position.y=HR*1.0; headG.add(halo);
      var core=M(new THREE.TorusGeometry(0.26*bw,0.012,8,36), mats.energy); core.rotation.x=Math.PI/2; core.position.set(0,0.02,0.21*bw); torso.add(core);
      [-1,1].forEach(function(sg){ var bead=M(new THREE.SphereGeometry(0.035,10,8), mats.energy); bead.position.set(0.27*sg,1.02,0.18); rig.add(bead); });
    } else if (/alchemist/.test(key)){
      var glass=new THREE.MeshStandardMaterial({ color:0x9ff3ff, roughness:0.08, metalness:0.0, transparent:true, opacity:0.62, emissive:0x164b5a, envMapIntensity:1.4 }); R.disposables.push(glass);
      [-1,0,1].forEach(function(n){ var vial=M(new THREE.CylinderGeometry(0.026,0.026,0.16,10), glass); vial.position.set((n*0.07),-0.18,0.22*bw); vial.rotation.z=n*0.15; torso.add(vial); var cork=M(new THREE.CylinderGeometry(0.02,0.022,0.025,8), mats.leather); cork.position.set(n*0.07,-0.09,0.22*bw); torso.add(cork); });
      var satchel=M(new THREE.BoxGeometry(0.16,0.13,0.08), mats.leather); satchel.position.set(-0.28*bw,1.04,0.08); rig.add(satchel);
    } else if (/sentinel/.test(key)){
      var shield=M(new THREE.CylinderGeometry(0.22*bw,0.22*bw,0.055,6), mats.armorHi); shield.rotation.x=Math.PI/2; shield.rotation.z=Math.PI/6; shield.position.set(0,1.27,-0.28*bw); rig.add(shield);
      var boss=M(new THREE.OctahedronGeometry(0.055,0), mats.trim); boss.position.set(0,1.27,-0.32*bw); rig.add(boss);
    } else if (/knight|warrior/.test(key)){
      [-1,1].forEach(function(sg){ var trim=M(new THREE.BoxGeometry(0.16,0.028,0.026), mats.trim); trim.position.set(0.16*sg,1.32,0.17); trim.rotation.z=0.22*sg; rig.add(trim); });
    } else if (/shadow/.test(key)){
      var cres=M(new THREE.TorusGeometry(0.2,0.018,8,36), mats.energy); cres.position.set(-0.18*bw,1.5,-0.08); cres.rotation.set(0.2,0.1,0.3); rig.add(cres);
      var cut=M(new THREE.SphereGeometry(0.16,16,12), mats.dark); cut.position.set(-0.11*bw,1.53,-0.055); rig.add(cut);
      var shard=M(new THREE.OctahedronGeometry(0.045,0), mats.energy); shard.position.set(0.25*bw,1.38,0.14); rig.add(shard);
    } else if (/ranger|druid/.test(key)){
      var quiver=M(new THREE.CylinderGeometry(0.055,0.065,0.42,10), mats.leather); quiver.position.set(-0.25*bw,1.25,-0.2); quiver.rotation.z=-0.35; rig.add(quiver);
      for(var i=0;i<3;i++){ var arr=M(new THREE.CylinderGeometry(0.006,0.006,0.36,6), mats.trim); arr.position.set(-0.29*bw+i*0.026,1.45,-0.18); arr.rotation.z=-0.35; rig.add(arr); }
    } else if (/cleric|mage|bard/.test(key)){
      var sig=M(new THREE.TorusGeometry(HR*0.78,0.01,8,30), mats.energy); sig.position.set(0,HR*1.03,-0.02); sig.rotation.x=Math.PI/2; headG.add(sig);
    }
  }
  function weaponKind(id){
    id=String(id||"").toLowerCase();
    if (/staff|scepter|orb|lute|quill/.test(id)) return "staff";
    if (/hammer|pick|axe|cudgel/.test(id)) return "heavy";
    if (/bow|boomerang|compass|trident/.test(id)) return "ranged";
    if (/dagger|dual|blade|sword|shortsword|chronoblade|voidblade/.test(id)) return "blade";
    return "blade";
  }
  function addWeapon(armR, spec, mats){
    var w=spec.equipped&&spec.equipped.weapon; if(!armR||!w) return;
    var metal=gMetal(w,"#dde7f2"), gem=gGem(w,"#9fd8ff"); var s=new THREE.Group(), kind=weaponKind(w.id);
    var grip=M(new THREE.CylinderGeometry(0.02,0.02,0.16,8), mats.leather); grip.position.y=-0.02; s.add(grip);
    if (kind==="staff"){
      var staff=M(new THREE.CylinderGeometry(0.018,0.018,0.78,10), mats.leather); staff.position.y=0.28; s.add(staff);
      var orb=M(new THREE.SphereGeometry(0.07,18,14), gem); orb.position.y=0.72; s.add(orb);
      var halo=M(new THREE.TorusGeometry(0.09,0.008,8,26), metal); halo.position.y=0.72; halo.rotation.x=Math.PI/2; s.add(halo);
    } else if (kind==="heavy"){
      var haft=M(new THREE.CylinderGeometry(0.018,0.022,0.62,8), mats.leather); haft.position.y=0.25; s.add(haft);
      var head=M(new THREE.BoxGeometry(0.18,0.12,0.11), metal); head.position.y=0.58; head.rotation.z=0.08; s.add(head);
      var spike=M(new THREE.ConeGeometry(0.045,0.13,6), gem); spike.position.y=0.7; s.add(spike);
    } else if (kind==="ranged"){
      var bow=M(new THREE.TorusGeometry(0.22,0.012,8,32,Math.PI*1.22), metal); bow.position.y=0.36; bow.rotation.z=Math.PI/2.15; s.add(bow);
      var string=M(new THREE.CylinderGeometry(0.004,0.004,0.52,5), mats.energy); string.position.y=0.36; string.position.x=-0.12; s.add(string);
      var arrow=M(new THREE.CylinderGeometry(0.007,0.007,0.48,6), gem); arrow.position.y=0.36; arrow.rotation.z=Math.PI/2; s.add(arrow);
    } else {
      var blade=M(new THREE.CylinderGeometry(0.016,0.04,0.56,4), metal); blade.position.y=0.36; blade.rotation.y=Math.PI/4; s.add(blade);
      var tip=M(new THREE.ConeGeometry(0.04,0.12,4), metal); tip.position.y=0.68; tip.rotation.y=Math.PI/4; s.add(tip);
      var guard=M(new THREE.BoxGeometry(/dual|dagger/.test(String(w.id||""))?0.15:0.22,0.035,0.04), mats.trim); guard.position.y=0.07; s.add(guard);
      if (/dual/.test(String(w.id||""))){ var off=blade.clone(); off.position.x=-0.055; off.position.y=0.3; off.scale.setScalar(0.72); s.add(off); }
    }
    var pom=M(new THREE.SphereGeometry(0.035,10,8), gem); pom.position.y=-0.11; s.add(pom);
    s.position.set(0,-0.66,0.04); s.rotation.x=-0.12; armR.add(s);
  }
  function addHelmetGear(headG, spec, mats, HR){
    var g=spec.equipped&&spec.equipped.helmet; if(!g) return; var metal=gMetal(g,"#f6cb6e"), gem=gGem(g,"#38bdf8");
    if (g.id==="crown_of_flow"){ var base=M(new THREE.CylinderGeometry(HR*0.92,HR*0.98,0.05,14,1,true), metal); base.position.y=HR*0.7; headG.add(base);
      for(var i=0;i<7;i++){ var a=(i/7)*Math.PI*2; var sp=M(new THREE.ConeGeometry(0.03,0.11,4), metal); sp.position.set(Math.cos(a)*HR*0.92,HR*0.82,Math.sin(a)*HR*0.92); headG.add(sp); }
      var jew=M(new THREE.OctahedronGeometry(0.045,0), gem); jew.position.set(0,HR*0.78,HR*0.92); headG.add(jew);
    } else {
      var ring=M(new THREE.TorusGeometry(HR*0.95,0.022,8,28), metal); ring.rotation.x=Math.PI/2; ring.position.y=HR*0.6; headG.add(ring);
      var brow=M(new THREE.BoxGeometry(HR*1.18,0.036,0.042), metal); brow.position.set(0,HR*0.14,HR*0.92); brow.rotation.x=-0.1; headG.add(brow);
      var cheekL=M(new THREE.BoxGeometry(0.035,0.16,0.045), metal); cheekL.position.set(-HR*0.63,-HR*0.05,HR*0.84); cheekL.rotation.z=-0.12; headG.add(cheekL);
      var cheekR=cheekL.clone(); cheekR.position.x=HR*0.63; cheekR.rotation.z=0.12; headG.add(cheekR);
      var crest=M(new THREE.ConeGeometry(0.052,0.16,6), gem); crest.position.set(0,HR*0.86,HR*0.2); crest.rotation.x=-0.22; headG.add(crest);
    }
  }
  function addArmorGear(rig, spec, mats, torso, bw){
    var a=spec.equipped&&spec.equipped.armor; if(!a) return;
    var metal=gMetal(a,"#dde7f2"), gem=gGem(a,"#9fd8ff");
    var cuirass=M(new THREE.SphereGeometry(0.23*bw,24,16,0,Math.PI*2,0,Math.PI*0.66), metal); cuirass.position.set(0,0.01,0.12*bw); cuirass.scale.set(1.1,1.24,0.48); torso.add(cuirass);
    var core=M(new THREE.OctahedronGeometry(0.058,0), gem); core.position.set(0,0.07,0.25*bw); torso.add(core);
    [-1,1].forEach(function(sg){
      var rib=M(new THREE.BoxGeometry(0.04,0.3,0.035), metal); rib.position.set(0.1*sg,-0.02,0.235*bw); rib.rotation.z=0.26*sg; torso.add(rib);
      var hip=M(new THREE.BoxGeometry(0.12,0.16,0.035), metal); hip.position.set(0.13*sg,-0.32,0.11*bw); hip.rotation.z=-0.18*sg; torso.add(hip);
      var vam=M(new THREE.CapsuleGeometry(0.054,0.22,6,12), metal); vam.position.set(0.36*sg,0.9,0.08); vam.rotation.z=-0.28*sg; rig.add(vam);
    });
    if (a.id==="moonplate_vest"){ var c=col(a.gem,"#c4b5fd"); var gm=new THREE.MeshStandardMaterial({ color:c, roughness:0.24, metalness:0.55, emissive:c.clone().multiplyScalar(0.48), envMapIntensity:1.18 }); R.disposables.push(gm); var v=M(new THREE.SphereGeometry(0.2*bw,22,16,0,Math.PI*2,0,Math.PI*0.6), gm); v.position.set(0,0.0,0.15*bw); v.scale.set(1,1.18,0.46); torso.add(v); }
  }
  function buildPet(spec){
    var p=spec.equipped&&spec.equipped.pet; if(!p) return null; var g=new THREE.Group(); var c=col(p.gem,"#c084fc");
    var bm=new THREE.MeshStandardMaterial({ color:c, roughness:0.5, metalness:0.2, emissive:c.clone().multiplyScalar(0.22) }); R.disposables.push(bm);
    var body=M(new THREE.SphereGeometry(0.1,18,14), bm); g.add(body);
    var e1=M(new THREE.ConeGeometry(0.03,0.06,5), bm); e1.position.set(-0.05,0.1,0); g.add(e1); var e2=e1.clone(); e2.position.x=0.05; g.add(e2);
    var em=new THREE.MeshStandardMaterial({ color:0xfff3c4, emissive:0x886600, roughness:0.4 }); R.disposables.push(em);
    var eL=M(new THREE.SphereGeometry(0.035,12,10), em); eL.position.set(-0.038,0.02,0.085); g.add(eL); var eR=eL.clone(); eR.position.x=0.038; g.add(eR);
    g.scale.setScalar(0.95); return g;
  }

  /* ===================== MOUNTS (per family) ===================== */
  function buildMount(spec){
    var mt=spec.mount; if(!mt) return null;
    var fam=String(mt.family||"").toLowerCase(), id=mt.id||"", cs=mt.colors||["#6b5640","#caa46a","#f6cb6e"];
    function s(o){ var m=new THREE.MeshStandardMaterial(o); R.disposables.push(m); return m; }
    var body=s({ color:col(cs[0]), roughness:0.66, metalness:0.06, envMapIntensity:0.5 });
    var acc=s({ color:col(cs[1]), roughness:0.6, metalness:0.12, envMapIntensity:0.5 });
    var det=s({ color:col(cs[2]), roughness:0.32, metalness:0.5, emissive:col(cs[2]).multiplyScalar(0.12), envMapIntensity:1.0 });
    if (fam==="bird" || /eagle|hawk|owl|raven|phoenix|roc|falcon|wing/.test(id)) return buildBird(body,acc,det,s);
    if (fam==="dragon" || /dragon|wyrm|drake|wyvern/.test(id)) return buildDragon(body,acc,det,s);
    if (fam==="aquatic" || /shark|dolphin|whale|jelly|serpent|turtle|croc|otter|tide|tides/.test(id)) return buildAquatic(body,acc,det,s,id);
    if (fam==="insect" || /moth|beetle|mantis|spider|scorpion|bee|wasp/.test(id)) return buildInsect(body,acc,det,s,id);
    if (fam==="elemental" || id==="void_skiff" || /skiff|orb|elemental|spirit|wisp/.test(id)) return buildSkiff(acc,det);
    var panther=(fam==="feline"||/panther|cat|tiger|lion|lynx/.test(id));
    var wolf=(fam==="canine"||/wolf|hound|fox|dog/.test(id));
    return buildQuadruped(body,acc,det,s,id,panther,wolf);
  }
  function rideMeta(g, seatY, stand){ g.userData.seatY=seatY; g.userData.stand=!!stand; return g; }

  function buildBird(body,acc,det,s){
    var g=new THREE.Group(); var by=0.95;
    var torso=M(new THREE.SphereGeometry(0.42,20,16), body); torso.position.set(0,by,0); torso.scale.set(1,0.95,1.25); g.add(torso);
    var breast=M(new THREE.SphereGeometry(0.3,18,14), acc); breast.position.set(0,by-0.05,0.32); breast.scale.set(0.9,1,0.7); g.add(breast);
    var neck=M(new THREE.CapsuleGeometry(0.12,0.2,6,12), body); neck.position.set(0,by+0.34,0.34); neck.rotation.x=0.5; g.add(neck);
    var head=M(new THREE.SphereGeometry(0.17,16,14), body); head.position.set(0,by+0.55,0.46); g.add(head);
    var beak=M(new THREE.ConeGeometry(0.07,0.2,6), det); beak.rotation.x=Math.PI/2; beak.position.set(0,by+0.52,0.66); g.add(beak);
    var em=s({ color:0x10131a, roughness:0.4 });
    var eL=M(new THREE.SphereGeometry(0.03,10,8), em); eL.position.set(-0.07,by+0.6,0.56); g.add(eL); var eR=eL.clone(); eR.position.x=0.07; g.add(eR);
    // big wings
    g.userData.wing=[];
    [-1,1].forEach(function(sg){
      var w=new THREE.Group();
      var w1=M(new THREE.BoxGeometry(0.5,0.06,0.5), acc); w1.position.set(0.3*sg,0,0); w.add(w1);
      var w2=M(new THREE.BoxGeometry(0.45,0.05,0.36), body); w2.position.set(0.7*sg,-0.02,-0.05); w.add(w2);
      [0,1,2].forEach(function(k){ var f=M(new THREE.BoxGeometry(0.16,0.04,0.5), acc); f.position.set((0.55+k*0.16)*sg,-0.04,-0.28-k*0.02); f.rotation.y=0.2*sg; w.add(f); });
      w.position.set(0.36*sg,by+0.16,-0.02); w.rotation.z=0.25*sg; g.add(w); g.userData.wing.push(w);
    });
    // tail feathers
    [-0.12,0,0.12].forEach(function(o){ var tf=M(new THREE.BoxGeometry(0.1,0.04,0.4), acc); tf.position.set(o,by-0.05,-0.5); tf.rotation.x=-0.3; g.add(tf); });
    // talon legs
    [-0.16,0.16].forEach(function(x){ var lg=M(new THREE.CapsuleGeometry(0.05,0.18,5,8), det); lg.position.set(x,by-0.42,0.12); g.add(lg); var foot=M(new THREE.SphereGeometry(0.08,10,8), det); foot.position.set(x,by-0.56,0.18); foot.scale.set(1,0.5,1.3); g.add(foot); });
    return rideMeta(g, by+0.36, false);
  }
  function buildDragon(body,acc,det,s){
    var g=new THREE.Group(); var by=0.92;
    var torso=M(new THREE.CapsuleGeometry(0.34,0.7,8,16), body); torso.rotation.z=Math.PI/2; torso.position.set(0,by,0); torso.scale.set(1,1,0.92); g.add(torso);
    var chest=M(new THREE.SphereGeometry(0.34,16,14), body); chest.position.set(0.5,by,0); g.add(chest);
    var neck=M(new THREE.CapsuleGeometry(0.16,0.4,6,12), body); neck.position.set(0.7,by+0.34,0); neck.rotation.z=-0.7; g.add(neck);
    var head=M(new THREE.CapsuleGeometry(0.16,0.3,7,14), body); head.position.set(1.0,by+0.56,0); head.rotation.z=-1.1; g.add(head);
    var snout=M(new THREE.ConeGeometry(0.13,0.26,8), body); snout.rotation.z=-Math.PI/2; snout.position.set(1.22,by+0.5,0); g.add(snout);
    [-1,1].forEach(function(sg){ var horn=M(new THREE.ConeGeometry(0.04,0.22,6), det); horn.position.set(0.92,by+0.74,0.08*sg); horn.rotation.z=0.4; g.add(horn); });
    var em=s({ color:0xffcc33, emissive:0x884400, roughness:0.3 });
    var eL=M(new THREE.SphereGeometry(0.035,10,8), em); eL.position.set(1.04,by+0.6,0.1); g.add(eL); var eR=eL.clone(); eR.position.z=-0.1; g.add(eR);
    // legs
    [[0.42,0.22],[0.42,-0.22],[-0.4,0.22],[-0.4,-0.22]].forEach(function(p){ var lg=M(new THREE.CapsuleGeometry(0.09,0.34,5,10), body); lg.position.set(p[0],by-0.34,p[1]); g.add(lg); var claw=M(new THREE.ConeGeometry(0.09,0.12,6), det); claw.position.set(p[0],by-0.56,p[1]+0.04); claw.rotation.x=Math.PI; g.add(claw); });
    // membrane wings
    g.userData.wing=[];
    [-1,1].forEach(function(sg){ var wm=s({ color:col_mix(acc), roughness:0.6, side:THREE.DoubleSide, transparent:true, opacity:0.92 }); var wing=new THREE.Mesh(new THREE.PlaneGeometry(0.95,0.7,4,3), wm); R.disposables.push(wing.geometry); wing.castShadow=true; wing.position.set(-0.05,by+0.45,0.3*sg); wing.rotation.set(0,0.5*sg,0.5); g.add(wing); g.userData.wing.push(wing); });
    // tail
    var tail=M(new THREE.ConeGeometry(0.16,0.9,10), body); tail.rotation.z=Math.PI/2; tail.position.set(-0.85,by+0.05,0); g.add(tail);
    var saddle=M(new THREE.SphereGeometry(0.26,16,12,0,Math.PI*2,0,Math.PI*0.5), det); saddle.position.set(-0.04,by+0.28,0); saddle.scale.set(1,0.55,0.95); g.add(saddle);
    return rideMeta(g, by+0.36, false);
  }
  function col_mix(mat){ try{ return mat.color.getHex(); }catch(e){ return 0x88aadd; } }
  function buildSkiff(acc, det){
    var g=new THREE.Group();
    var hull=M(new THREE.CapsuleGeometry(0.34,1.0,8,18), acc); hull.rotation.z=Math.PI/2; hull.scale.set(1,1,0.5); hull.position.y=0.5; g.add(hull);
    var deck=M(new THREE.BoxGeometry(1.15,0.06,0.5), det); deck.position.y=0.66; g.add(deck);
    var glow=M(new THREE.SphereGeometry(0.5,18,10,0,Math.PI*2,Math.PI*0.55,Math.PI*0.45), det); glow.position.y=0.4; glow.scale.set(1.3,1,0.7); g.add(glow);
    g.userData.skiff=true; return rideMeta(g, 0.72, true);
  }
  function buildAquatic(body,acc,det,s,id){
    var g=new THREE.Group(); var by=0.78; id=String(id||"").toLowerCase();
    if (/jelly/.test(id)){
      var bell=M(new THREE.SphereGeometry(0.36,22,14,0,Math.PI*2,0,Math.PI*0.58), body); bell.position.set(0,by+0.12,0); bell.scale.set(1,0.68,1); g.add(bell);
      for(var j=0;j<7;j++){ var a=(j/7)*Math.PI*2; var ten=M(new THREE.CapsuleGeometry(0.018,0.42,4,8), det); ten.position.set(Math.cos(a)*0.2,by-0.17,Math.sin(a)*0.2); ten.rotation.z=Math.sin(a)*0.35; g.add(ten); }
      return rideMeta(g, by+0.42, true);
    }
    var torso=M(new THREE.CapsuleGeometry(0.3,0.88,8,18), body); torso.rotation.z=Math.PI/2; torso.position.set(0,by,0); torso.scale.set(1,0.84,0.78); g.add(torso);
    var nose=M(new THREE.ConeGeometry(0.22,0.34,14), body); nose.rotation.z=-Math.PI/2; nose.position.set(0.62,by,0); g.add(nose);
    var tail=M(new THREE.ConeGeometry(0.18,0.48,4), acc); tail.rotation.z=Math.PI/2; tail.position.set(-0.7,by,0); g.add(tail);
    [-1,1].forEach(function(sg){ var fin=M(new THREE.ConeGeometry(0.08,0.3,4), acc); fin.position.set(0.05,by-0.02,0.28*sg); fin.rotation.x=Math.PI/2*sg; g.add(fin); });
    var top=M(new THREE.ConeGeometry(0.1,0.32,4), acc); top.position.set(-0.06,by+0.32,0); top.rotation.x=Math.PI; g.add(top);
    if (/turtle/.test(id)){ var shell=M(new THREE.SphereGeometry(0.36,18,12,0,Math.PI*2,0,Math.PI*0.58), acc); shell.position.set(-0.02,by+0.1,0); shell.scale.set(1.1,0.56,0.9); g.add(shell); }
    if (/croc/.test(id)){ for(var k=0;k<5;k++){ var sp=M(new THREE.ConeGeometry(0.035,0.12,5), det); sp.position.set(-0.38+k*0.17,by+0.25,0); sp.rotation.x=Math.PI; g.add(sp); } }
    var saddle=M(new THREE.SphereGeometry(0.25,16,12,0,Math.PI*2,0,Math.PI*0.5), det); saddle.position.set(-0.05,by+0.29,0); saddle.scale.set(1,0.52,0.9); g.add(saddle);
    return rideMeta(g, by+0.35, false);
  }
  function buildInsect(body,acc,det,s,id){
    var g=new THREE.Group(); var by=0.78; id=String(id||"").toLowerCase();
    [-0.35,0,0.35].forEach(function(x,idx){ var seg=M(new THREE.SphereGeometry(idx===1?0.28:0.24,18,12), idx===1?body:acc); seg.position.set(x,by,0); seg.scale.set(1,0.72,0.9); g.add(seg); });
    for(var l=0;l<6;l++){ var side=l%2?1:-1, x=-0.32+Math.floor(l/2)*0.32; var leg=M(new THREE.CapsuleGeometry(0.025,0.48,4,8), body); leg.position.set(x,by-0.22,0.24*side); leg.rotation.x=0.9*side; leg.rotation.z=(l<2?0.5:l>3?-0.5:0); g.add(leg); }
    if (/moth|bee|wasp/.test(id)){
      g.userData.wing=[];
      [-1,1].forEach(function(sg){ var wm=s({ color:col_mix(det), roughness:0.35, side:THREE.DoubleSide, transparent:true, opacity:0.58, emissive:col_mix(det) }); var wing=new THREE.Mesh(new THREE.PlaneGeometry(0.58,0.44,2,2), wm); R.disposables.push(wing.geometry); wing.castShadow=true; wing.position.set(0.03,by+0.26,0.22*sg); wing.rotation.set(0.25,0.62*sg,0.18*sg); g.add(wing); g.userData.wing.push(wing); });
    }
    if (/scorpion/.test(id)){ var tail=M(new THREE.CapsuleGeometry(0.045,0.52,5,10), det); tail.position.set(-0.55,by+0.25,0); tail.rotation.z=0.85; g.add(tail); var barb=M(new THREE.ConeGeometry(0.055,0.16,6), det); barb.position.set(-0.78,by+0.5,0); barb.rotation.z=0.55; g.add(barb); }
    var saddle=M(new THREE.SphereGeometry(0.23,16,12,0,Math.PI*2,0,Math.PI*0.5), det); saddle.position.set(0.02,by+0.27,0); saddle.scale.set(1,0.52,0.9); g.add(saddle);
    return rideMeta(g, by+0.33, false);
  }
  function buildQuadruped(body,acc,det,s,id,panther,wolf){
    id=String(id||"").toLowerCase();
    var g=new THREE.Group(); var by=0.86;
    var torso=M(new THREE.CapsuleGeometry(panther?0.28:0.32,0.66,8,16), body); torso.rotation.z=Math.PI/2; torso.position.set(0,by,0); torso.scale.set(1,1,0.84); g.add(torso);
    var chest=M(new THREE.SphereGeometry(0.32,16,14), body); chest.position.set(0.46,by,0); chest.scale.set(0.9,1,0.85); g.add(chest);
    var rump=M(new THREE.SphereGeometry(0.33,16,14), body); rump.position.set(-0.48,by+0.02,0); rump.scale.set(0.9,1,0.85); g.add(rump);
    var legs=[];
    function leg(x,z){ var lg=new THREE.Group(); lg.position.set(x,by-0.16,z);
      var up=M(new THREE.CapsuleGeometry(0.075,0.34,5,10), body); up.position.y=-0.24; lg.add(up);
      var hoof=M(new THREE.CylinderGeometry(0.07,0.08,0.1,8), det); hoof.position.y=-0.48; lg.add(hoof); g.add(lg); legs.push(lg); return lg; }
    leg(0.42,0.2); leg(0.42,-0.2); leg(-0.44,0.2); leg(-0.44,-0.2); g.userData.legs=legs;
    var neck=M(new THREE.CapsuleGeometry(0.15,0.4,6,12), body); neck.position.set(0.6,by+0.32,0); neck.rotation.z=-0.65; g.add(neck);
    var head=M(new THREE.CapsuleGeometry(0.14,0.3,7,14), body); head.position.set(0.88,by+0.54,0); head.rotation.z=-1.18; g.add(head);
    var muzzle=M(new THREE.SphereGeometry(0.12,12,10), body); muzzle.position.set(1.02,by+0.46,0); muzzle.scale.set(1.2,0.85,0.9); g.add(muzzle);
    var earL=M(new THREE.ConeGeometry(0.055,0.16,6), body); earL.position.set(0.8,by+0.74,0.08); g.add(earL); var earR=earL.clone(); earR.position.z=-0.08; g.add(earR);
    var em=s({ color:0x10131a, roughness:0.4 });
    var eL=M(new THREE.SphereGeometry(0.035,10,8), em); eL.position.set(0.94,by+0.56,0.11); g.add(eL); var eR=eL.clone(); eR.position.z=-0.11; g.add(eR);
    if (!panther && !wolf){ for(var i=0;i<6;i++){ var mh=M(new THREE.BoxGeometry(0.05,0.16,0.1), acc); var f=i/5; mh.position.set(0.48+f*0.34,by+0.42+f*0.14,0); mh.rotation.z=-0.65; g.add(mh); } }
    if (wolf){ var ruff=M(new THREE.SphereGeometry(0.3,16,12), acc); ruff.position.set(0.4,by+0.1,0); ruff.scale.set(0.8,1,1); g.add(ruff); }
    var tail=M(new THREE.CapsuleGeometry(wolf?0.09:0.06,0.42,5,10), acc); tail.position.set(-0.8,by+0.02,0); tail.rotation.z=0.9; g.add(tail);
    var saddle=M(new THREE.SphereGeometry(0.27,16,12,0,Math.PI*2,0,Math.PI*0.5), det); saddle.position.set(-0.05,by+0.28,0); saddle.scale.set(1,0.55,0.95); g.add(saddle);
    if (/unicorn/.test(id)){ var horn=M(new THREE.ConeGeometry(0.045,0.34,12), det); horn.position.set(0.96,by+0.78,0); horn.rotation.z=-0.5; g.add(horn); }
    if (/ram|bull|bison|yak|ox|rhino/.test(id)){ [-1,1].forEach(function(sg){ var horn2=M(new THREE.ConeGeometry(0.045,0.26,8), det); horn2.position.set(0.92,by+0.68,0.09*sg); horn2.rotation.set(0.2,0.4*sg,0.25); g.add(horn2); }); }
    if (/stag|deer|elk/.test(id)){ [-1,1].forEach(function(sg){ var a1=M(new THREE.CylinderGeometry(0.02,0.03,0.3,6), det); a1.position.set(0.8,by+0.86,0.08*sg); a1.rotation.z=0.3*sg; g.add(a1); var a2=M(new THREE.CylinderGeometry(0.014,0.02,0.18,6), det); a2.position.set(0.74,by+1.0,0.16*sg); a2.rotation.z=0.8*sg; g.add(a2); }); }
    return rideMeta(g, by+0.32, false);
  }

  /* ---------- assemble ---------- */
  function specSig(s){ var e=s.equipped||{}; function gid(x){ return x?(x.id+":"+x.tier):"-"; }
    return [s.cls,s.traits.race,s.traits.body,s.traits.hair,s.traits.helm,s.traits.face,s.traits.eyeShape,
      s.colors.skin,s.colors.hair,s.colors.eye,s.colors.armorMid,s.colors.armorHigh,s.colors.armorDark,s.colors.accent,s.colors.cloak,
      gid(e.weapon),gid(e.helmet),gid(e.armor),gid(e.pet), s.mount?(s.mount.id+":"+s.mount.family+":"+s.mount.tier):"-"].join("|"); }
  function rebuild(spec){
    if(R.heroRig){ R.root.remove(R.heroRig); disposeGroup(R.heroRig); }
    if(R.mountGroup){ R.root.remove(R.mountGroup); disposeGroup(R.mountGroup); }
    if(R.petGroup){ R.root.remove(R.petGroup); disposeGroup(R.petGroup); }
    flush(); R.heroRig=R.mountGroup=R.petGroup=null;
    var hero=buildHero(spec); addOutlines(hero); var mount=spec.mount?buildMount(spec):null; if(mount) addOutlines(mount); var pet=buildPet(spec); R.mounted=!!mount;
    if(mount){ R.root.add(mount); R.mountGroup=mount; hero.position.y=mount.userData.seatY-0.86; hero.position.x=mount.userData.stand?0:0.04;
      if(!mount.userData.stand){ if(hero.userData.legL){ hero.userData.legL.rotation.x=0.55; hero.userData.legL.rotation.z=0.22; } if(hero.userData.legR){ hero.userData.legR.rotation.x=0.55; hero.userData.legR.rotation.z=-0.22; } }
      if(R.pedestal) R.pedestal.visible=false;
    } else { hero.position.y=0; if(R.pedestal) R.pedestal.visible=true; }
    R.root.add(hero); R.heroRig=hero; if(pet){ R.root.add(pet); R.petGroup=pet; } frame();
  }
  function frame(){ var cam=R.camera;
    if(R.mode==="studio"){ if(R.mounted){ cam.position.set(0,1.45,5.6); R.lookY=1.15; } else { cam.position.set(0,1.12,3.95); R.lookY=0.95; } }
    else { if(R.mounted){ cam.position.set(0,1.4,5.3); R.lookY=1.1; } else { cam.position.set(0,1.12,3.8); R.lookY=0.95; } }
    cam.lookAt(0,R.lookY,0); }
  FH3D.sync=function(spec){ if(!FH3D.available){ if(!initEngine()) return; } if(!spec) return; R.running=!!spec.running;
    try{ var sg=specSig(spec); if(sg!==R.sig){ R.sig=sg; rebuild(spec); } startLoop(); }catch(e){ console.warn("[FH3D] sync failed:",e); } };

  function attach(container, mode){ if(!container) return; if(!FH3D.available){ if(!initEngine()) return; }
    var canvas=R.renderer.domElement; try{ if(getComputedStyle(container).position==="static") container.style.position="relative"; }catch(e){}
    if(canvas.parentNode!==container) container.appendChild(canvas); R.container=container; R.mode=mode||"home"; if(R.mode==="studio"){ R.yaw=0; R.targetYaw=0; R.autoSpin=false; } else if(!R.dragging){ R.autoSpin=true; } container.classList.add("fh3d-host"); container.setAttribute("data-fh3d-ready","0"); resize(); frame(); observe(container); startLoop(); }
  FH3D.attachHome=function(el){ attach(el,"home"); }; FH3D.attachStudio=function(el){ attach(el,"studio"); }; FH3D.detachStudio=function(h){ if(h) attach(h,"home"); };
  function resize(){ if(!R.container||!R.renderer) return; var w=R.container.clientWidth||120,h=R.container.clientHeight||120; R.renderer.setSize(w,h,false); R.camera.aspect=w/h; R.camera.updateProjectionMatrix(); }
  function observe(container){ if(R.ro){ try{ R.ro.disconnect(); }catch(e){} } if(window.ResizeObserver){ R.ro=new ResizeObserver(function(){ resize(); }); R.ro.observe(container); }
    if(R.io){ try{ R.io.disconnect(); }catch(e){} } if(window.IntersectionObserver){ R.io=new IntersectionObserver(function(en){ var v=en[0]&&en[0].isIntersecting; if(v&&!document.hidden) startLoop(); else stopLoop(); }, {threshold:0.01}); R.io.observe(container); } }
  function wirePointer(canvas){
    canvas.addEventListener("pointerdown", function(e){ R.dragging=true; R.autoSpin=false; R.lastPointerX=e.clientX; try{ canvas.setPointerCapture(e.pointerId); }catch(x){} });
    canvas.addEventListener("pointermove", function(e){ if(!R.dragging) return; var dx=e.clientX-R.lastPointerX; R.lastPointerX=e.clientX; R.targetYaw+=dx*0.012; });
    function up(){ R.dragging=false; clearTimeout(R._t); R._t=setTimeout(function(){ R.autoSpin=true; },2800); }
    canvas.addEventListener("pointerup",up); canvas.addEventListener("pointercancel",up); canvas.addEventListener("pointerleave", function(){ if(R.dragging) up(); });
  }
  function startLoop(){ if(R.raf) return; if(document.hidden) return; R.last=performance.now(); R.raf=requestAnimationFrame(tick); }
  function stopLoop(){ if(R.raf){ cancelAnimationFrame(R.raf); R.raf=0; } }
  function tick(now){
    R.raf=requestAnimationFrame(tick); var dt=Math.min(0.05,(now-R.last)/1000); R.last=now; R.clock+=dt; var t=R.clock;
    if(R.autoSpin&&!R.dragging&&R.mode!=="studio") R.targetYaw+=dt*0.5; R.yaw+=(R.targetYaw-R.yaw)*Math.min(1,dt*8); if(R.root) R.root.rotation.y=R.yaw;
    var sp=R.running?2.2:1.0, amp=R.running?1.4:1.0;
    if(R.heroRig){ var h=R.heroRig, bob=Math.sin(t*2.0*sp)*0.014*amp;
      if(h.userData.torso){ h.userData.torso.position.y=1.16+bob; h.userData.torso.rotation.y=Math.sin(t*1.0)*0.04; }
      if(h.userData.headG){ h.userData.headG.position.y=1.6+bob; h.userData.headG.rotation.y=Math.sin(t*0.7)*0.1; h.userData.headG.rotation.x=Math.sin(t*1.2)*0.025; }
      if(!R.mounted){ if(h.userData.armL) h.userData.armL.rotation.x=Math.sin(t*1.5*sp)*0.1*amp; if(h.userData.armR) h.userData.armR.rotation.x=-Math.sin(t*1.5*sp)*0.1*amp; }
      if(h.userData.cloak) h.userData.cloak.rotation.x=Math.sin(t*1.3)*0.05+0.04;
    }
    if(R.mountGroup){ var mg=R.mountGroup;
      if(mg.userData.skiff){ mg.position.y=Math.sin(t*1.4)*0.05; if(R.heroRig) R.heroRig.position.y=(mg.userData.seatY-0.86)+Math.sin(t*1.4)*0.05; }
      else { var run=R.running, gy=run?Math.abs(Math.sin(t*6))*0.06:Math.sin(t*1.8)*0.02; mg.position.y=gy; if(R.heroRig) R.heroRig.position.y=(mg.userData.seatY-0.86)+gy;
        var legs=mg.userData.legs||[]; for(var i=0;i<legs.length;i++) legs[i].rotation.x=Math.sin(t*(run?8:2.2)+(i<2?0:Math.PI))*(run?0.5:0.12);
        if(mg.userData.wing){ var fl=Math.sin(t*(run?6:2.6)); mg.userData.wing[0].rotation.z=0.25+fl*0.4; mg.userData.wing[1].rotation.z=-0.25-fl*0.4; if(mg.userData.wing[0].rotation.z!==undefined){} } }
    }
    if(R.petGroup){ var pa=t*0.8; R.petGroup.position.set(Math.cos(pa)*0.9,1.5+Math.sin(t*2)*0.08,Math.sin(pa)*0.55-0.2); R.petGroup.rotation.y=-pa+Math.PI/2; }
    if(R.renderer&&R.scene&&R.camera){ try{ R.renderer.render(R.scene,R.camera); if(R.container){ R.container.setAttribute("data-fh3d-ready","1"); R.container.classList.add("fh3d-ready"); } }catch(e){ if(R.container){ R.container.setAttribute("data-fh3d-ready","0"); R.container.classList.remove("fh3d-ready"); } stopLoop(); } }
  }
  FH3D.wireModal=function(modalId, studioHostId, homeHostId){ var modal=document.getElementById(modalId); if(!modal||!window.MutationObserver) return;
    var obs=new MutationObserver(function(){ var hidden=modal.hasAttribute("hidden"); if(hidden){ var hh=document.getElementById(homeHostId); if(hh) FH3D.attachHome(hh); } else { var st=document.getElementById(studioHostId); if(st) FH3D.attachStudio(st); } });
    obs.observe(modal, { attributes:true, attributeFilter:["hidden"] }); };
  FH3D._R=R;
})();
