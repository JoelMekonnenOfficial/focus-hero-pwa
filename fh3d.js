/* ============================================================================
 * Focus Hero — FH3D v8.0 : mesh avatar model kit renderer
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
  FH3D.available = false; FH3D.version = "fh3d-8.0"; FH3D.engine = "mesh-avatar-modelkit-v1";
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
      renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
      var cs = renderer.domElement.style; cs.position="absolute"; cs.left="0"; cs.top="0"; cs.width="100%"; cs.height="100%"; cs.display="block"; cs.borderRadius="inherit"; cs.touchAction="pan-y";
      renderer.domElement.className = "fh3d-canvas"; renderer.domElement.setAttribute("aria-hidden","true");
      var scene = new THREE.Scene(); scene.background = makeBackdrop("#8aa0c9","#1c2538");
      R.env = makeEnv(renderer); scene.environment = R.env;
      var camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100); camera.position.set(0,1.3,4.6);
      var hemi = new THREE.HemisphereLight(0xd6e6ff, 0x2a2d36, 0.82); scene.add(hemi);
      var key = new THREE.DirectionalLight(0xfff3df, 2.15); key.position.set(3.2,5.2,4.1); key.castShadow=true;
      key.shadow.mapSize.set(2048,2048); key.shadow.camera.near=1; key.shadow.camera.far=20; key.shadow.camera.left=-3; key.shadow.camera.right=3; key.shadow.camera.top=3.6; key.shadow.camera.bottom=-2; key.shadow.bias=-0.0008; key.shadow.normalBias=0.028; scene.add(key);
      var fill = new THREE.DirectionalLight(0x9fc2ff, 0.72); fill.position.set(-4,2.4,1.8); scene.add(fill);
      var rim = new THREE.DirectionalLight(0xe3f0ff, 1.55); rim.position.set(-1.5,3.1,-4.3); scene.add(rim);
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
  function CBetween(a, b, r, mat, seg){
    var av=new THREE.Vector3(a[0],a[1],a[2]), bv=new THREE.Vector3(b[0],b[1],b[2]), mid=av.clone().add(bv).multiplyScalar(0.5), dir=bv.clone().sub(av), len=dir.length()||0.001;
    var mesh=M(new THREE.CylinderGeometry(r||0.01,r||0.01,len,seg||8), mat);
    mesh.position.copy(mid); mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), dir.normalize());
    return mesh;
  }
  var OUTLINE_MAT = new THREE.MeshBasicMaterial({ color:0x101827, side:THREE.BackSide, transparent:true, opacity:0.14, depthWrite:false });
  function addOutlines(group, scale){
    // Keep the model clean and PBR-lit. The older outline shell made the hero read
    // like a flat cartoon cutout, especially in Character Studio.
    return;
  }
  function disposeGroup(g){ if(!g) return; g.traverse(function(o){ if(o.geometry && !o.userData._ol) o.geometry.dispose(); }); }
  function flush(){ for(var i=0;i<R.disposables.length;i++){ try{ R.disposables[i].dispose(); }catch(e){} } R.disposables.length=0; }

  function makeMats(spec){
    var c=spec.colors, m={};
    function s(o){ var mt=new THREE.MeshStandardMaterial(o); R.disposables.push(mt); return mt; }
    var armorTex=makeDetailTexture(31,"#777","rgba(255,255,255,.16)"), darkTex=makeDetailTexture(43,"#555","rgba(255,255,255,.09)"), clothTex=makeDetailTexture(59,"#444","rgba(255,255,255,.08)"), skinTex=makeDetailTexture(71,"#999","rgba(255,255,255,.04)");
    m.skin=s({ color:col(c.skin,"#e7b48c"), roughness:0.72, metalness:0.0, envMapIntensity:0.4, bumpMap:skinTex, bumpScale:0.004 });
    m.cloth=s({ color:col(c.outfit||c.armorDark,"#26334d"), roughness:0.84, metalness:0.02, envMapIntensity:0.36, bumpMap:clothTex, bumpScale:0.02 });
    m.clothHi=s({ color:lighten(c.outfit||c.armorMid||"#334155",0.16), roughness:0.78, metalness:0.03, envMapIntensity:0.42, bumpMap:clothTex, bumpScale:0.016 });
    m.clothDk=s({ color:darken(c.outfit||c.armorDark||"#172033",0.08), roughness:0.88, metalness:0.02, envMapIntensity:0.3, bumpMap:clothTex, bumpScale:0.02 });
    m.armor=s({ color:col(c.armorMid,"#465e80"), roughness:0.36, metalness:0.62, envMapIntensity:1.05, bumpMap:armorTex, bumpScale:0.014 });
    m.armorHi=s({ color:col(c.armorHigh,"#7e97bd"), roughness:0.28, metalness:0.72, envMapIntensity:1.2, bumpMap:armorTex, bumpScale:0.012 });
    m.armorDk=s({ color:col(c.armorDark,"#22304a"), roughness:0.48, metalness:0.5, envMapIntensity:0.85, bumpMap:darkTex, bumpScale:0.016 });
    m.trim=s({ color:col(c.accent,"#f6cb6e"), roughness:0.28, metalness:0.85, envMapIntensity:1.3 });
    m.cloak=s({ color:col(c.cloak,"#3a5a9c"), roughness:0.86, metalness:0.0, envMapIntensity:0.35, side:THREE.DoubleSide, bumpMap:clothTex, bumpScale:0.018 });
    m.hair=s({ color:col(c.hair,"#3a2417"), roughness:0.76, metalness:0.04, envMapIntensity:0.42, bumpMap:darkTex, bumpScale:0.01 });
    m.boot=s({ color:col(c.leather||"#4a3324"), roughness:0.72, metalness:0.08, bumpMap:clothTex, bumpScale:0.012 });
    m.leather=s({ color:col(c.leather||"#5b3d22"), roughness:0.8, metalness:0.1, bumpMap:clothTex, bumpScale:0.01 });
    var eyeC=col(c.eye,"#6cc6ff");
    m.eye=s({ color:eyeC, roughness:0.18, emissive:eyeC.clone().multiplyScalar(0.2) });
    m.eyeWhite=s({ color:0xf6f9ff, roughness:0.3 });
    m.dark=s({ color:0x12161e, roughness:0.45 });
    m.mouth=s({ color:0x7a3b33, roughness:0.6 });
    var energyC=col(c.accent,"#8b9cff");
    m.energy=s({ color:energyC, roughness:0.22, metalness:0.12, emissive:energyC.clone().multiplyScalar(0.45), envMapIntensity:1.25, transparent:true, opacity:0.92 });
    return m;
  }

  /* ===================== AVATAR MODEL KIT (mesh-first, no puppet shell) ===================== */
  function loftGeometry(rings, seg){
    seg=seg||28;
    var pos=[], idx=[];
    rings.forEach(function(r){
      var twist=r.twist||0, x=r.x||0, z=r.z||0;
      for(var i=0;i<seg;i++){
        var a=(i/seg)*Math.PI*2+twist;
        pos.push(x+Math.cos(a)*(r.rx||0.1), r.y||0, z+Math.sin(a)*(r.rz||r.rx||0.1));
      }
    });
    for(var j=0;j<rings.length-1;j++){
      var a0=j*seg, b0=(j+1)*seg;
      for(var k=0;k<seg;k++){
        var n=(k+1)%seg;
        idx.push(a0+k,b0+k,a0+n, a0+n,b0+k,b0+n);
      }
    }
    var bottomCenter=pos.length/3, br=rings[0]; pos.push(br.x||0,br.y||0,br.z||0);
    for(var bi=0;bi<seg;bi++) idx.push(bottomCenter,bi,(bi+1)%seg);
    var topCenter=pos.length/3, tr=rings[rings.length-1], topBase=(rings.length-1)*seg; pos.push(tr.x||0,tr.y||0,tr.z||0);
    for(var ti=0;ti<seg;ti++) idx.push(topCenter,topBase+(ti+1)%seg,topBase+ti);
    var g=new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos,3));
    g.setIndex(idx); g.computeVertexNormals();
    return g;
  }
  function Loft(rings, mat, seg){ return M(loftGeometry(rings, seg||28), mat); }
  function Ball(rx, ry, rz, mat, x, y, z, seg){
    var m=M(new THREE.SphereGeometry(1, seg||28, Math.max(12, Math.floor((seg||28)*0.7))), mat, x||0, y||0, z||0);
    m.scale.set(rx,ry,rz); return m;
  }
  function Capsule(rad, len, mat, x, y, z, sx, sz, seg){
    var m=M(new THREE.CapsuleGeometry(rad, len, 10, seg||24), mat, x||0, y||0, z||0);
    m.scale.set(sx||1,1,sz||1); return m;
  }
  function panel(w,h,d,mat,x,y,z,rx,ry,rz){
    var m=M(new THREE.BoxGeometry(w,h,d), mat, x||0, y||0, z||0);
    m.rotation.set(rx||0,ry||0,rz||0); return m;
  }
  function buildHeroModelKit(spec){
    var mats=makeMats(spec), t=spec.traits||{}, eq=spec.equipped||{}, rig=new THREE.Group();
    rig.userData.modelKit="mesh-avatar-modelkit-v1";
    var hasArmor=!!eq.armor, hasHelmet=!!eq.helmet, build=t.body||"balanced";
    var bw=build==="broad"?1.08:build==="lean"?0.86:0.96, slim=build==="lean"?0.92:1.0;
    var HIPY=0.88, sx=0.272*bw;

    var legL=mkLeg(mats, hasArmor, -1, bw, slim); legL.position.set(-0.135*bw,HIPY,0); rig.add(legL);
    var legR=mkLeg(mats, hasArmor, 1, bw, slim); legR.position.set(0.135*bw,HIPY,0); rig.add(legR);
    rig.userData.legL=legL; rig.userData.legR=legR;

    var pelvis=Loft([
      {y:0.78,rx:0.12*bw,rz:0.08},{y:0.86,rx:0.22*bw,rz:0.12},{y:0.96,rx:0.18*bw,rz:0.1},{y:1.02,rx:0.13*bw,rz:0.075}
    ], hasArmor?mats.armorDk:mats.clothDk, 28); rig.add(pelvis);

    var torso=new THREE.Group(); torso.position.y=1.12; rig.add(torso); rig.userData.torso=torso;
    var bodyMat=hasArmor?mats.armor:mats.cloth;
    var torsoMesh=Loft([
      {y:-0.34,rx:0.145*bw,rz:0.075},
      {y:-0.18,rx:0.165*bw,rz:0.088},
      {y:0.06,rx:0.195*bw,rz:0.104},
      {y:0.25,rx:0.212*bw,rz:0.108},
      {y:0.38,rx:0.18*bw,rz:0.086}
    ], bodyMat, 34); torso.add(torsoMesh);
    if(hasArmor){
      var plate=Loft([{y:-0.18,rx:0.12*bw,rz:0.012,z:0.118},{y:0.06,rx:0.17*bw,rz:0.018,z:0.128},{y:0.26,rx:0.14*bw,rz:0.014,z:0.12}], mats.armorHi, 28); torso.add(plate);
      torso.add(panel(0.018,0.43,0.02,mats.trim,0,0.02,0.155));
    } else {
      var jacketL=Loft([{y:-0.3,rx:0.045*bw,rz:0.009,x:-0.055*bw,z:0.12},{y:0.1,rx:0.078*bw,rz:0.012,x:-0.06*bw,z:0.133},{y:0.34,rx:0.056*bw,rz:0.011,x:-0.044*bw,z:0.124}], mats.clothHi, 18); torso.add(jacketL);
      var jacketR=jacketL.clone(); jacketR.position.x=0.11*bw; torso.add(jacketR);
      torso.add(CBetween([0,-0.27,0.151],[0,0.25,0.15],0.0045,mats.leather,6));
      torso.add(CBetween([-0.075*bw,0.3,0.132],[0,0.18,0.156],0.006,mats.clothDk,8));
      torso.add(CBetween([0.075*bw,0.3,0.132],[0,0.18,0.156],0.006,mats.clothDk,8));
      var hood=Loft([{y:0.28,rx:0.14*bw,rz:0.028,z:-0.09},{y:0.42,rx:0.12*bw,rz:0.04,z:-0.065}], mats.clothDk, 24); torso.add(hood);
      var pendant=Ball(0.018,0.022,0.012,mats.trim,0,0.12,0.168,14); torso.add(pendant);
    }
    var belt=Loft([{y:-0.305,rx:0.172*bw,rz:0.084},{y:-0.26,rx:0.18*bw,rz:0.09}], mats.leather, 30); torso.add(belt);
    torso.add(panel(0.052,0.042,0.022,mats.trim,0,-0.282,0.106));

    var neck=Capsule(0.052,0.12,mats.skin,0,1.44,0,1.0,0.92,18); rig.add(neck);
    var headG=new THREE.Group(); headG.position.y=1.61; rig.add(headG); rig.userData.headG=headG;
    mkHead(headG, mats, spec, t, hasHelmet);

    var armL=mkArm(mats, hasArmor, -1, bw); armL.position.set(-sx,1.335,0); armL.rotation.z=-0.035; rig.add(armL);
    var armR=mkArm(mats, hasArmor, 1, bw); armR.position.set(sx,1.335,0); armR.rotation.z=0.035; rig.add(armR);
    rig.userData.armL=armL; rig.userData.armR=armR;

    if(hasArmor) addModelKitArmor(rig, torso, mats, spec, bw);
    if(hasHelmet) addModelKitHelmet(headG, mats, spec, 0.158);
    addModelKitClassAccent(rig, torso, headG, spec, mats, bw);
    addWeapon(rig.userData.armR, spec, mats);
    return rig;
  }
  function mkLeg(mats, armored, side, bw, slim){
    var g=new THREE.Group();
    var thigh=Loft([{y:0,rx:0.066*slim,rz:0.055},{y:-0.18,rx:0.082*slim,rz:0.06},{y:-0.42,rx:0.064*slim,rz:0.05}], armored?mats.armorDk:mats.cloth, 24);
    thigh.position.x=0.008*side; thigh.rotation.z=-0.035*side; g.add(thigh);
    var knee=Ball(0.055,0.04,0.048,armored?mats.armorHi:mats.clothDk,0.022*side,-0.47,0.014,18); g.add(knee);
    var shin=Loft([{y:-0.5,rx:0.064*slim,rz:0.048},{y:-0.72,rx:0.055*slim,rz:0.042},{y:-0.94,rx:0.043*slim,rz:0.038}], armored?mats.armor:mats.clothDk, 24);
    shin.position.x=0.032*side; shin.rotation.z=0.02*side; g.add(shin);
    if(!armored) g.add(CBetween([0.038*side,-0.55,0.054],[0.046*side,-0.9,0.056],0.0035,mats.clothHi,6));
    else g.add(panel(0.056,0.25,0.024,mats.armorHi,0.04*side,-0.72,0.066,0,0,0.02*side));
    var shoe=Loft([{y:-0.99,rx:0.052,rz:0.076,z:0.04},{y:-1.045,rx:0.07,rz:0.11,z:0.08}], mats.boot, 22);
    shoe.position.x=0.052*side; shoe.rotation.z=0.015*side; g.add(shoe);
    g.add(panel(0.13,0.017,0.21,mats.leather,0.052*side,-1.066,0.09,0,0,0.015*side));
    g.userData.thigh=thigh; return g;
  }
  function mkArm(mats, armored, side, bw){
    var g=new THREE.Group();
    g.add(Ball(0.048,0.038,0.052,armored?mats.armor:mats.clothHi,0,0,0,22));
    var upper=Loft([{y:-0.03,rx:0.047,rz:0.048},{y:-0.22,rx:0.052,rz:0.048},{y:-0.42,rx:0.041,rz:0.04}], armored?mats.armor:mats.cloth, 26);
    upper.position.x=0.02*side; upper.rotation.z=0.045*side; g.add(upper);
    g.add(Ball(0.041,0.035,0.038,armored?mats.armorHi:mats.clothDk,0.045*side,-0.46,0.012,16));
    var fore=Loft([{y:-0.49,rx:0.042,rz:0.039},{y:-0.64,rx:0.039,rz:0.036},{y:-0.79,rx:0.033,rz:0.032}], armored?mats.armorDk:mats.cloth, 26);
    fore.position.x=0.074*side; fore.rotation.z=-0.03*side; g.add(fore);
    g.add(CBetween([0.06*side,-0.77,0.035],[0.115*side,-0.78,0.034],0.007,armored?mats.trim:mats.leather,8));
    var hand=Ball(0.042,0.052,0.034,mats.skin,0.1*side,-0.855,0.042,16); g.add(hand);
    [-0.023,-0.008,0.008,0.023].forEach(function(off){ var f=Capsule(0.0055,0.048,mats.skin,0.108*side+off*side,-0.905,0.058,1,0.8,6); f.rotation.z=-0.06*side; g.add(f); });
    var thumb=Capsule(0.006,0.046,mats.skin,0.065*side,-0.875,0.062,1,0.8,6); thumb.rotation.z=0.55*side; g.add(thumb);
    if(armored) g.add(panel(0.042,0.19,0.025,mats.armorHi,0.08*side,-0.64,0.068,0,0,-0.03*side));
    else g.add(CBetween([0.042*side,-0.16,0.056],[0.076*side,-0.6,0.062],0.003,mats.clothHi,6));
    g.userData.hand=hand; return g;
  }
  function mkHead(headG, mats, spec, t, hasHelmet){
    var HR=0.158, race=t.race||"human";
    headG.add(Ball(HR*0.86,HR*1.02,HR*0.86,mats.skin,0,0.005,0,30));
    headG.add(Ball(HR*0.58,HR*0.44,HR*0.68,mats.skin,0,-0.092,0.03,22));
    var z=HR*0.82, ex=0.052, eyeR=t.eyeShape==="round"?0.022:t.eyeShape==="sharp"?0.016:0.019;
    [-1,1].forEach(function(sg){
      headG.add(Ball(0.024,0.012,0.008,mats.eyeWhite,ex*sg,0.022,z,16));
      headG.add(Ball(eyeR*0.56,eyeR*0.5,0.006,mats.eye,ex*sg,0.016,z+0.01,14));
      headG.add(panel(0.05,0.007,0.01,mats.hair,ex*sg,0.073,z*0.96,0,0,-0.08*sg));
      var cheek=Ball(0.02,0.011,0.01,mats.skin,0.052*sg,-0.054,z*0.94,12); headG.add(cheek);
    });
    var nose=Loft([{y:0.012,rx:0.008,rz:0.005,z:z+0.01},{y:-0.034,rx:0.014,rz:0.018,z:z+0.026}], mats.skin, 10); headG.add(nose);
    var mouth=(t.face==="smile")?M(new THREE.TorusGeometry(0.03,0.004,8,16,Math.PI), mats.mouth):panel(0.04,0.005,0.01,mats.mouth,0,-0.092,z*0.94);
    if(t.face==="smile"){ mouth.rotation.z=Math.PI; mouth.position.set(0,-0.092,z*0.94); } headG.add(mouth);
    if(/elf|fae|sprite/.test(race)){ [-1,1].forEach(function(sg){ var ear=M(new THREE.ConeGeometry(0.04,0.15,8), mats.skin); ear.position.set(HR*0.82*sg,0.045,0); ear.rotation.set(0,0.22*sg,-Math.PI/2*sg); headG.add(ear); }); }
    else { [-1,1].forEach(function(sg){ headG.add(Ball(0.024,0.04,0.02,mats.skin,HR*0.83*sg,-0.01,0,12)); }); }
    if(/orc|goblin/.test(race)){ [-1,1].forEach(function(sg){ var tusk=M(new THREE.ConeGeometry(0.014,0.055,6), mats.eyeWhite); tusk.position.set(0.045*sg,-0.125,z*0.86); tusk.rotation.x=Math.PI; headG.add(tusk); }); }
    if(/demon/.test(race)){ [-1,1].forEach(function(sg){ var horn=M(new THREE.ConeGeometry(0.035,0.14,8), mats.trim); horn.position.set(0.092*sg,HR*0.9,-0.045); horn.rotation.z=-0.3*sg; headG.add(horn); }); }
    if(!hasHelmet) mkHairModelKit(headG, t.hair||"short", mats.hair, HR);
  }
  function mkHairModelKit(headG, style, hairMat, HR){
    if(style==="shaved"||style==="bald") return;
    var cap=Ball(HR*0.92,HR*0.38,HR*0.9,hairMat,0,HR*0.43,-0.012,30); cap.scale.y*=0.72; headG.add(cap);
    if(style==="mohawk"){ var mh=Capsule(0.025,HR*0.82,hairMat,0,HR*0.55,-0.02,1,0.7,10); mh.rotation.x=-0.12; headG.add(mh); return; }
    [-0.08,-0.04,0.005,0.05,0.087].forEach(function(x,i){
      var l=Capsule(0.01+(i%2)*0.003,HR*(0.15+(i%3)*0.035),hairMat,x,HR*(0.2-(i%2)*0.018),HR*0.79,1,0.7,8);
      l.rotation.x=-0.18; l.rotation.z=(x<0?0.05:-0.05); headG.add(l);
    });
    if(/long/.test(style)){ var back=Loft([{y:-HR*0.05,rx:HR*0.55,rz:HR*0.18,z:-HR*0.62},{y:-HR*0.6,rx:HR*0.45,rz:HR*0.14,z:-HR*0.55}], hairMat, 24); headG.add(back); }
    if(/braid/.test(style)){ [-1,1].forEach(function(sg){ var br=Capsule(0.026,HR*0.78,hairMat,HR*0.82*sg,-HR*0.26,0.02,1,0.8,8); br.rotation.z=0.05*sg; headG.add(br); }); }
  }
  function addModelKitArmor(rig, torso, mats, spec, bw){
    var g=spec.equipped&&spec.equipped.armor; if(!g) return;
    var metal=gMetal(g,"#dde7f2"), gem=gGem(g,"#9fd8ff"), txt=gText(g), light=/leather|hide|vest|mantle|robe/.test(txt)&&!/plate|war/.test(txt);
    var mat=light?gCloth(g,"#64748b"):metal;
    torso.add(Loft([{y:-0.2,rx:0.13*bw,rz:0.014,z:0.155},{y:0.05,rx:0.18*bw,rz:0.018,z:0.17},{y:0.3,rx:0.15*bw,rz:0.015,z:0.155}], mat, 28));
    torso.add(Ball(0.042,0.052,0.018,gem,0,0.085,0.188,16));
    [-1,1].forEach(function(sg){
      torso.add(panel(0.032,0.34,0.026,light?mats.leather:mats.trim,0.095*sg,-0.02,0.184,0,0,0.22*sg));
      var sh=Ball(0.12*bw,0.06,0.08,mat,0.34*sg,1.33,0.02,18); rig.add(sh);
      var vam=Capsule(0.052,0.24,mat,0.36*sg,0.83,0.08,1,0.86,12); vam.rotation.z=-0.28*sg; rig.add(vam);
      var gr=Capsule(0.054,0.28,mat,0.13*sg,0.25,0.05,1,0.86,12); rig.add(gr);
    });
  }
  function addModelKitHelmet(headG, mats, spec, HR){
    var g=spec.equipped&&spec.equipped.helmet; if(!g) return;
    var metal=gMetal(g,"#f6cb6e"), gem=gGem(g,"#38bdf8"), txt=gText(g);
    if(/hood|hide|leather/.test(txt)){
      headG.add(Ball(HR*0.98,HR*0.74,HR*0.96,gCloth(g,"#475569"),0,HR*0.18,-0.02,26));
      return;
    }
    headG.add(Ball(HR*0.94,HR*0.52,HR*0.94,metal,0,HR*0.45,-0.02,26));
    headG.add(CBetween([-HR*0.72,HR*0.1,HR*0.78],[HR*0.72,HR*0.1,HR*0.78],0.014,metal,8));
    headG.add(Ball(0.036,0.044,0.02,gem,0,HR*0.74,HR*0.28,12));
  }
  function addModelKitClassAccent(rig, torso, headG, spec, mats, bw){
    var key=String(spec.cls||"knight").toLowerCase();
    if(/monk/.test(key)){ var halo=M(new THREE.TorusGeometry(0.19,0.008,8,36), mats.energy); halo.position.set(0,1.78,-0.04); halo.rotation.x=Math.PI/2; rig.add(halo); }
    else if(/mage|cleric|bard|shadow/.test(key)){ var sig=M(new THREE.TorusGeometry(0.13,0.006,8,32), mats.energy); sig.position.set(0,0.12,0.19*bw); sig.rotation.x=Math.PI/2; torso.add(sig); }
    else if(/ranger|druid/.test(key)){ var strap=CBetween([-0.16*bw,0.3,-0.02],[0.16*bw,-0.28,0.13],0.012,mats.leather,8); torso.add(strap); }
  }

  /* ===================== HERO (heroic-realistic ~6 heads) ===================== */
  function buildHero(spec){
    var mats=makeMats(spec), t=spec.traits||{}, rig=new THREE.Group();
    var eq=spec.equipped||{}, hasArmor=!!eq.armor, hasHelmet=!!eq.helmet;
    var build=t.body||"balanced";
    var bw= build==="broad"?0.98: build==="lean"?0.78:0.86;
    var HIPY=0.86;
    // legs
    var legL=makeLeg(mats, hasArmor, -1); legL.position.set(-0.13*bw,HIPY,0); rig.add(legL);
    var legR=makeLeg(mats, hasArmor, 1); legR.position.set(0.13*bw,HIPY,0); rig.add(legR);
    rig.userData.legL=legL; rig.userData.legR=legR;
    // pelvis (connects legs to torso, no gap)
    var pelvis=M(new THREE.SphereGeometry(0.205*bw,28,18), hasArmor?mats.armorDk:mats.clothDk); pelvis.position.y=0.9; pelvis.scale.set(1.06,0.46,0.76); rig.add(pelvis);
    // torso
    var torso=new THREE.Group(); torso.position.y=1.12; rig.add(torso); rig.userData.torso=torso;
    var chest=M(new THREE.CapsuleGeometry(0.206*bw,0.5,12,36), hasArmor?mats.armor:mats.cloth); chest.scale.set(1.1,1.08,0.66); torso.add(chest);
    var waist=M(new THREE.CapsuleGeometry(0.15*bw,0.19,10,26), hasArmor?mats.armorDk:mats.clothDk); waist.position.y=-0.29; waist.scale.set(1.1,0.95,0.58); torso.add(waist);
    if(hasArmor){
      var collar=M(new THREE.TorusGeometry(0.116,0.018,8,28), mats.trim); collar.rotation.x=Math.PI/2.16; collar.position.set(0,0.22,0.025); torso.add(collar);
    } else {
      var neckLineL=CBetween([-0.072*bw,0.25,0.145*bw],[0,0.17,0.168*bw],0.006,mats.clothHi,8); torso.add(neckLineL);
      var neckLineR=CBetween([0.072*bw,0.25,0.145*bw],[0,0.17,0.168*bw],0.006,mats.clothHi,8); torso.add(neckLineR);
    }
    if (hasArmor){
      var plate=M(new THREE.CapsuleGeometry(0.118*bw,0.24,8,20), mats.armorHi); plate.position.set(0,0.005,0.124*bw); plate.scale.set(1.02,1,0.32); torso.add(plate);
      var sternum=M(new THREE.BoxGeometry(0.014,0.24,0.016), mats.trim); sternum.position.set(0,0.0,0.166*bw); torso.add(sternum);
    } else {
      var tunic=M(new THREE.CapsuleGeometry(0.118*bw,0.37,10,26), mats.clothHi); tunic.position.set(0,0.0,0.126*bw); tunic.scale.set(1.12,1.05,0.3); torso.add(tunic);
      var lacing=M(new THREE.BoxGeometry(0.012,0.27,0.012), mats.leather); lacing.position.set(0,-0.005,0.173*bw); torso.add(lacing);
      [-1,1].forEach(function(sg){
        var cord=M(new THREE.CylinderGeometry(0.0035,0.0035,0.19,7), mats.leather); cord.position.set(0.028*sg,-0.016,0.181*bw); cord.rotation.z=0.22*sg; torso.add(cord);
        var seam=CBetween([0.125*sg,0.18,0.145*bw],[0.104*sg,-0.25,0.16*bw],0.004,mats.clothDk,6); torso.add(seam);
        var flap=M(new THREE.BoxGeometry(0.082*bw,0.19,0.018), mats.clothDk); flap.position.set(0.052*sg,-0.385,0.055); flap.rotation.z=-0.08*sg; torso.add(flap);
      });
    }
    var clsMat=new THREE.MeshStandardMaterial({ color:col((spec.palette&&spec.palette[1])||spec.colors.accent,"#f6cb6e"), roughness:0.3, metalness:0.7, emissive:col((spec.palette&&spec.palette[1])||"#222").multiplyScalar(0.15), envMapIntensity:1.2 }); R.disposables.push(clsMat);
    if(hasArmor){
      var emblem=M(new THREE.OctahedronGeometry(0.038,0), clsMat); emblem.position.set(0,0.038,0.17*bw); torso.add(emblem);
    } else {
      var pendant=M(new THREE.SphereGeometry(0.018,12,10), clsMat); pendant.position.set(0,0.155,0.177*bw); torso.add(pendant);
      var necklace=CBetween([-0.055*bw,0.2,0.158*bw],[0.055*bw,0.2,0.158*bw],0.0035,mats.leather,6); torso.add(necklace);
    }
    var belt=M(new THREE.TorusGeometry(0.16*bw,0.024,10,28), mats.leather); belt.rotation.x=Math.PI/2; belt.position.y=-0.245; belt.scale.z=0.72; torso.add(belt);
    var buckle=M(new THREE.BoxGeometry(0.052,0.044,0.025), mats.trim); buckle.position.set(0,-0.245,0.125*bw); torso.add(buckle);
    // Shoulders: cloth wraps when naked/base, actual pauldrons only when body armor is equipped.
    if (hasArmor){
      var pL=M(new THREE.SphereGeometry(0.104*bw,18,14), mats.armorHi); pL.position.set(-0.245*bw,0.15,0); pL.scale.set(1.06,0.58,0.82); torso.add(pL);
      var pR=pL.clone(); pR.position.x=0.245*bw; torso.add(pR);
    } else {
      var swL=M(new THREE.SphereGeometry(0.058*bw,18,12), mats.clothHi); swL.position.set(-0.232*bw,0.13,0.01); swL.scale.set(1.08,0.42,0.68); torso.add(swL);
      var swR=swL.clone(); swR.position.x=0.232*bw; torso.add(swR);
    }
    // neck
    var neck=M(new THREE.CylinderGeometry(0.056,0.066,0.13,14), mats.skin); neck.position.y=1.43; rig.add(neck);
    // head
    var HR=0.158;
    var headG=new THREE.Group(); headG.position.y=1.59; rig.add(headG); rig.userData.headG=headG;
    var head=M(new THREE.SphereGeometry(HR,30,24), mats.skin); head.scale.set(0.9,1.04,0.92); headG.add(head);
    var jaw=M(new THREE.SphereGeometry(HR*0.76,18,14), mats.skin); jaw.position.set(0,-0.075,0.02); jaw.scale.set(0.86,0.68,0.9); headG.add(jaw);
    var helm=t.helm||"open";
    if (!hasHelmet && helm==="closed") helm="open";
    if (helm==="closed") buildKnightHelm(headG, mats, HR);
    else { buildFace(headG, mats, spec, t, HR); addHair(headG, t.hair||"short", mats.hair, HR);
      if (hasHelmet && (helm==="open"||helm==="crest")){ var band=M(new THREE.TorusGeometry(HR*0.98,0.022,10,26), mats.armorHi); band.rotation.x=Math.PI/2; band.position.y=HR*0.55; headG.add(band); }
      if (hasHelmet && helm==="crest") addPlume(headG, mats, HR);
    }
    // arms
    var sx=0.245*bw, sy=1.36;
    var armL=makeArm(mats, hasArmor, -1); armL.position.set(-sx,sy,0); armL.rotation.z=-0.06; armL.rotation.x=-0.03; rig.add(armL);
    var armR=makeArm(mats, hasArmor, 1); armR.position.set(sx,sy,0); armR.rotation.z=0.06; armR.rotation.x=0.03; rig.add(armR);
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
  function makeLeg(mats, armored, side){
    side=side||1;
    var g=new THREE.Group();
    var thigh=M(new THREE.CapsuleGeometry(armored?0.078:0.082,0.4,10,24), armored?mats.armorDk:mats.cloth); thigh.position.set(0.006*side,-0.22,0); thigh.scale.set(1.03,1,0.9); thigh.rotation.z=-0.035*side; g.add(thigh);
    var knee=M(new THREE.SphereGeometry(0.058,18,12), armored?mats.armorHi:mats.leather); knee.position.set(0.02*side,-0.465,0.012); knee.scale.set(armored?0.98:0.74,armored?0.88:0.54,armored?0.9:0.68); g.add(knee);
    var shin=M(new THREE.CapsuleGeometry(armored?0.066:0.07,0.39,10,24), armored?mats.armor:mats.clothDk); shin.position.set(0.03*side,-0.715,0.008); shin.scale.set(0.94,1,0.84); shin.rotation.z=0.02*side; g.add(shin);
    var ankle=M(new THREE.CylinderGeometry(0.048,0.056,0.07,12), armored?mats.armorDk:mats.clothDk); ankle.position.set(0.04*side,-0.94,0.03); ankle.rotation.z=0.02*side; g.add(ankle);
    var boot=M(new THREE.SphereGeometry(0.088,18,12), mats.boot); boot.position.set(0.046*side,-1.0,0.074); boot.scale.set(0.98,0.42,1.58); g.add(boot);
    var sole=M(new THREE.BoxGeometry(0.112,0.018,0.2), mats.leather); sole.position.set(0.052*side,-1.043,0.09); sole.rotation.z=0.02*side; g.add(sole);
    if(!armored){ var pantSeam=CBetween([0.036*side,-0.55,0.075],[0.046*side,-0.86,0.078],0.004,mats.clothHi,6); g.add(pantSeam); }
    if(armored){ var greave=M(new THREE.BoxGeometry(0.06,0.23,0.026), mats.armorHi); greave.position.set(0.04*side,-0.71,0.07); greave.rotation.z=0.02*side; g.add(greave); }
    g.userData.thigh=thigh; return g;
  }
  function makeArm(mats, armored, side){
    side=side||1;
    var g=new THREE.Group();
    var sh=M(new THREE.SphereGeometry(0.066,18,12), armored?mats.armor:mats.clothHi); sh.scale.set(armored?1.05:0.92,armored?0.62:0.5,armored?0.86:0.68); sh.position.x=0.004*side; g.add(sh);
    var up=M(new THREE.CapsuleGeometry(armored?0.052:0.055,0.32,10,22), armored?mats.armor:mats.cloth); up.position.set(0.026*side,-0.235,0.006); up.scale.set(1,1,0.86); up.rotation.z=0.045*side; g.add(up);
    var elbow=M(new THREE.SphereGeometry(0.046,16,12), armored?mats.armorHi:mats.clothDk); elbow.position.set(0.05*side,-0.46,0.012); elbow.scale.set(armored?0.92:0.76,armored?0.82:0.58,armored?0.9:0.68); g.add(elbow);
    var fore=M(new THREE.CapsuleGeometry(armored?0.047:0.048,0.28,10,22), armored?mats.armorDk:mats.cloth); fore.position.set(0.075*side,-0.645,0.02); fore.scale.set(0.9,1,0.82); fore.rotation.z=-0.035*side; g.add(fore);
    var cuff=M(new THREE.TorusGeometry(0.048,0.008,7,18), armored?mats.trim:mats.leather); cuff.rotation.x=Math.PI/2; cuff.position.set(0.088*side,-0.785,0.022); g.add(cuff);
    var hand=M(new THREE.SphereGeometry(0.054,16,12), mats.skin); hand.position.set(0.098*side,-0.852,0.034); hand.scale.set(0.9,1.05,0.78); g.add(hand);
    [-0.021,-0.006,0.009,0.024].forEach(function(off){ var finger=M(new THREE.CapsuleGeometry(0.0055,0.055,4,7), mats.skin); finger.position.set(0.106*side+off*side,-0.905,0.056); finger.rotation.z=-0.08*side; g.add(finger); });
    var thumb=M(new THREE.CapsuleGeometry(0.007,0.048,4,7), mats.skin); thumb.position.set(0.058*side,-0.872,0.062); thumb.rotation.z=0.55*side; g.add(thumb);
    if(!armored){ var sleeveSeam=CBetween([0.042*side,-0.18,0.06],[0.075*side,-0.57,0.068],0.0038,mats.clothHi,6); g.add(sleeveSeam); }
    if(armored){ var vam=M(new THREE.BoxGeometry(0.044,0.19,0.026), mats.armorHi); vam.position.set(0.078*side,-0.62,0.068); vam.rotation.z=-0.035*side; g.add(vam); }
    g.userData.hand=hand; return g;
  }
  function buildFace(headG, mats, spec, t, HR){
    var z=HR*0.9, ex=0.052, eyeR=t.eyeShape==="round"?0.022:t.eyeShape==="sharp"?0.016:0.019;
    var wL=M(new THREE.SphereGeometry(0.023,18,12), mats.eyeWhite); wL.position.set(-ex,0.018,z*0.9); wL.scale.set(1,0.5,0.34); headG.add(wL);
    var wR=wL.clone(); wR.position.x=ex; headG.add(wR);
    var iL=M(new THREE.SphereGeometry(eyeR,16,12), mats.eye); iL.position.set(-ex,0.01,z*0.985); iL.scale.set(1,0.86,0.45); headG.add(iL);
    var iR=iL.clone(); iR.position.x=ex; headG.add(iR);
    var pL=M(new THREE.SphereGeometry(eyeR*0.36,10,8), mats.dark); pL.position.set(-ex,0.012,z*1.025); headG.add(pL);
    var pR=pL.clone(); pR.position.x=ex; headG.add(pR);
    var brow=new THREE.MeshStandardMaterial({ color:darken(spec.colors.hair||"#3a2417",0.02), roughness:0.8 }); R.disposables.push(brow);
    var bL=M(new THREE.BoxGeometry(0.05,0.009,0.014), brow); bL.position.set(-ex,0.068,z*0.93); bL.rotation.z=0.08; headG.add(bL);
    var bR=bL.clone(); bR.position.x=ex; bR.rotation.z=-0.08; headG.add(bR);
    var nose=M(new THREE.ConeGeometry(0.015,0.052,9), mats.skin); nose.rotation.x=Math.PI/2.1; nose.position.set(0,-0.022,z*1.03); headG.add(nose);
    var bridge=M(new THREE.CapsuleGeometry(0.006,0.04,4,8), mats.skin); bridge.position.set(0,0.02,z*1.035); bridge.rotation.x=0.08; headG.add(bridge);
    [-1,1].forEach(function(sg){ var cheek=M(new THREE.SphereGeometry(0.022,12,8), mats.skin); cheek.position.set(0.052*sg,-0.052,z*0.95); cheek.scale.set(1,0.5,0.34); headG.add(cheek); });
    if (t.face==="smile"){ var sm=M(new THREE.TorusGeometry(0.03,0.0045,8,16,Math.PI), mats.mouth); sm.rotation.z=Math.PI; sm.position.set(0,-0.094,z*0.93); headG.add(sm); }
    else { var mo=M(new THREE.BoxGeometry(0.04,0.006,0.014), mats.mouth); mo.position.set(0,-0.094,z*0.93); headG.add(mo); }
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
    if (style==="mohawk"){ var mh=M(new THREE.CapsuleGeometry(0.026,HR*0.92,5,12), hairMat); mh.position.set(0,HR*0.62,-0.02); mh.scale.z=0.68; headG.add(mh); return; }
    var cap=M(new THREE.SphereGeometry(HR*1.04,28,18,0,Math.PI*2,0,Math.PI*0.5), hairMat); cap.position.y=HR*0.11; cap.scale.set(1.02,0.94,1.02); headG.add(cap);
    [-0.092,-0.052,-0.015,0.022,0.062,0.098].forEach(function(x,i){
      var lock=M(new THREE.CapsuleGeometry(0.014+(i%2)*0.004,HR*(0.22+(i%3)*0.035),5,10), hairMat);
      lock.position.set(x,HR*(0.2-(i%2)*0.03),HR*0.82);
      lock.rotation.x=-0.22; lock.rotation.z=(x<0?0.08:-0.08);
      headG.add(lock);
    });
    [-1,1].forEach(function(sg){ var side=M(new THREE.CapsuleGeometry(0.018,HR*0.34,5,10), hairMat); side.position.set(HR*0.83*sg,-HR*0.05,HR*0.08); side.rotation.z=0.08*sg; headG.add(side); });
    if (/long/.test(style)){ var back=M(new THREE.CapsuleGeometry(HR*0.72,HR*0.68,8,16), hairMat); back.position.set(0,-HR*0.32,-HR*0.52); back.scale.set(1,1.06,0.44); headG.add(back); }
    if (/braid/.test(style)){ var brL=M(new THREE.CapsuleGeometry(0.032,HR*0.86,5,12), hairMat); brL.position.set(-HR*0.85,-HR*0.34,0.02); headG.add(brL); var brR=brL.clone(); brR.position.x=HR*0.85; headG.add(brR); }
  }
  function addPlume(headG, mats, HR){ var p=M(new THREE.CapsuleGeometry(0.04,HR*1.0,6,10), mats.trim); p.position.set(0,HR*1.1,-HR*0.2); p.rotation.x=-0.3; headG.add(p); }

  function gText(g){ return String((g&&g.name)||"").toLowerCase()+" "+String((g&&g.id)||"").toLowerCase(); }
  function gMetal(g,fb){ var m=new THREE.MeshStandardMaterial({ color:col(g&&g.metal,fb||"#cbd5e1"), roughness:0.28, metalness:0.9, envMapIntensity:1.25 }); R.disposables.push(m); return m; }
  function gGem(g,fb){ var c=col(g&&g.gem,fb||"#22d3ee"); var m=new THREE.MeshStandardMaterial({ color:c, roughness:0.12, metalness:0.1, emissive:c.clone().multiplyScalar(0.5) }); R.disposables.push(m); return m; }
  function gCloth(g,fb){ var c=col(g&&g.metal,fb||"#64748b"); c.offsetHSL(0, -0.18, -0.08); var m=new THREE.MeshStandardMaterial({ color:c, roughness:0.82, metalness:0.04, envMapIntensity:0.44 }); R.disposables.push(m); return m; }
  function addClassSignature(rig, torso, headG, spec, mats, bw, HR){
    var key=String(spec.cls||"knight").toLowerCase();
    var hasArmor=!!(spec.equipped&&spec.equipped.armor);
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
      if(!hasArmor) return;
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
    var metal=gMetal(w,"#dde7f2"), gem=gGem(w,"#9fd8ff"); var s=new THREE.Group(), kind=weaponKind(w.id), txt=gText(w);
    var grip=M(new THREE.CylinderGeometry(0.024,0.024,0.2,8), mats.leather); grip.position.y=-0.02; s.add(grip);
    if (kind==="staff"){
      var staff=M(new THREE.CylinderGeometry(0.02,0.02,0.94,10), mats.leather); staff.position.y=0.36; s.add(staff);
      var orb=M(new THREE.SphereGeometry(/orb/.test(txt)?0.095:0.075,20,16), gem); orb.position.y=0.86; s.add(orb);
      var halo=M(new THREE.TorusGeometry(0.11,0.008,8,30), metal); halo.position.y=0.86; halo.rotation.x=Math.PI/2; s.add(halo);
      if (/lute/.test(txt)){ var lute=M(new THREE.SphereGeometry(0.1,18,12), metal); lute.position.set(0.09,0.35,0.02); lute.scale.set(0.75,1.1,0.25); s.add(lute); }
    } else if (kind==="heavy"){
      var haft=M(new THREE.CylinderGeometry(0.02,0.024,0.72,8), mats.leather); haft.position.y=0.3; s.add(haft);
      var head=M(new THREE.BoxGeometry(/axe/.test(txt)?0.11:0.22,0.14,0.12), metal); head.position.y=0.66; head.rotation.z=/axe/.test(txt)?0.32:0.08; s.add(head);
      if (/axe/.test(txt)){ var axe=M(new THREE.ConeGeometry(0.14,0.2,4), metal); axe.position.set(0.09,0.66,0); axe.rotation.z=-Math.PI/2; s.add(axe); }
      var spike=M(new THREE.ConeGeometry(0.05,0.15,6), gem); spike.position.y=0.79; s.add(spike);
    } else if (kind==="ranged"){
      var bow=M(new THREE.TorusGeometry(0.25,0.012,8,36,Math.PI*1.22), metal); bow.position.y=0.42; bow.rotation.z=Math.PI/2.15; s.add(bow);
      var string=M(new THREE.CylinderGeometry(0.004,0.004,0.52,5), mats.energy); string.position.y=0.36; string.position.x=-0.12; s.add(string);
      var arrow=M(new THREE.CylinderGeometry(0.007,0.007,0.48,6), gem); arrow.position.y=0.36; arrow.rotation.z=Math.PI/2; s.add(arrow);
      if (/trident/.test(txt)){ for(var pr=-1;pr<=1;pr++){ var tine=M(new THREE.ConeGeometry(0.02,0.14,5), metal); tine.position.set(pr*0.045,0.83,0); s.add(tine); } }
    } else {
      var short=/dual|dagger|short/.test(txt);
      var blade=M(new THREE.CylinderGeometry(0.018,short?0.036:0.048,short?0.48:0.68,4), metal); blade.position.y=short?0.32:0.42; blade.rotation.y=Math.PI/4; s.add(blade);
      var tip=M(new THREE.ConeGeometry(short?0.036:0.048,0.13,4), metal); tip.position.y=short?0.59:0.78; tip.rotation.y=Math.PI/4; s.add(tip);
      var guard=M(new THREE.BoxGeometry(short?0.16:0.25,0.04,0.05), mats.trim); guard.position.y=0.08; s.add(guard);
      if (/dual/.test(txt)){ var off=blade.clone(); off.position.x=-0.065; off.position.y=0.29; off.scale.setScalar(0.72); s.add(off); var offTip=tip.clone(); offTip.position.x=-0.065; offTip.position.y=0.49; offTip.scale.setScalar(0.72); s.add(offTip); }
    }
    var pom=M(new THREE.SphereGeometry(0.035,10,8), gem); pom.position.y=-0.11; s.add(pom);
    s.position.set(0,-0.66,0.04); s.rotation.x=-0.12; armR.add(s);
  }
  function addHelmetGear(headG, spec, mats, HR){
    var g=spec.equipped&&spec.equipped.helmet; if(!g) return; var metal=gMetal(g,"#f6cb6e"), gem=gGem(g,"#38bdf8"), txt=gText(g);
    if (/crown/.test(txt)){ var base=M(new THREE.CylinderGeometry(HR*0.92,HR*0.98,0.05,14,1,true), metal); base.position.y=HR*0.7; headG.add(base);
      for(var i=0;i<7;i++){ var a=(i/7)*Math.PI*2; var sp=M(new THREE.ConeGeometry(0.03,0.11,4), metal); sp.position.set(Math.cos(a)*HR*0.92,HR*0.82,Math.sin(a)*HR*0.92); headG.add(sp); }
      var jew=M(new THREE.OctahedronGeometry(0.045,0), gem); jew.position.set(0,HR*0.78,HR*0.92); headG.add(jew);
    } else if (/hood|hide|leather/.test(txt)) {
      var hood=gCloth(g,"#475569");
      var cap=M(new THREE.SphereGeometry(HR*1.14,24,18,0,Math.PI*2,0,Math.PI*0.68), hood); cap.position.y=HR*0.08; cap.scale.set(1.06,1.08,1.12); headG.add(cap);
      var brow=M(new THREE.TorusGeometry(HR*0.86,0.018,8,26), metal); brow.rotation.x=Math.PI/2; brow.position.y=HR*0.2; headG.add(brow);
      var tail=M(new THREE.CapsuleGeometry(0.038,0.22,6,10), hood); tail.position.set(0,HR*0.28,-HR*0.92); tail.rotation.x=0.7; headG.add(tail);
    } else {
      var ring=M(new THREE.TorusGeometry(HR*0.95,0.022,8,28), metal); ring.rotation.x=Math.PI/2; ring.position.y=HR*0.6; headG.add(ring);
      var brow=M(new THREE.BoxGeometry(HR*1.18,0.036,0.042), metal); brow.position.set(0,HR*0.14,HR*0.92); brow.rotation.x=-0.1; headG.add(brow);
      var cheekL=M(new THREE.BoxGeometry(0.035,0.16,0.045), metal); cheekL.position.set(-HR*0.63,-HR*0.05,HR*0.84); cheekL.rotation.z=-0.12; headG.add(cheekL);
      var cheekR=cheekL.clone(); cheekR.position.x=HR*0.63; cheekR.rotation.z=0.12; headG.add(cheekR);
      var crest=M(new THREE.ConeGeometry(0.052,0.16,6), gem); crest.position.set(0,HR*0.86,HR*0.2); crest.rotation.x=-0.22; headG.add(crest);
      if (/war|resolve|helm/.test(txt)){ [-1,1].forEach(function(sg){ var horn=M(new THREE.ConeGeometry(0.035,0.17,7), metal); horn.position.set(HR*0.72*sg,HR*0.55,0); horn.rotation.z=-0.7*sg; headG.add(horn); }); }
    }
  }
  function addArmorGear(rig, spec, mats, torso, bw){
    var a=spec.equipped&&spec.equipped.armor; if(!a) return;
    var txt=gText(a), light=/leather|hide|vest|mantle|coinweave|velvet|robe/.test(txt) && !/plate|war/.test(txt);
    var metal=light?gCloth(a,"#64748b"):gMetal(a,"#dde7f2"), gem=gGem(a,"#9fd8ff");
    var cuirass=M(new THREE.SphereGeometry(0.24*bw,26,18,0,Math.PI*2,0,Math.PI*0.68), metal); cuirass.position.set(0,0.01,0.13*bw); cuirass.scale.set(1.18,1.3,0.5); torso.add(cuirass);
    var core=M(new THREE.OctahedronGeometry(0.058,0), gem); core.position.set(0,0.07,0.25*bw); torso.add(core);
    [-1,1].forEach(function(sg){
      var rib=M(new THREE.BoxGeometry(light?0.028:0.045,0.31,0.035), light?mats.leather:metal); rib.position.set(0.1*sg,-0.02,0.24*bw); rib.rotation.z=0.26*sg; torso.add(rib);
      var hip=M(new THREE.BoxGeometry(0.13,0.18,0.035), metal); hip.position.set(0.13*sg,-0.33,0.11*bw); hip.rotation.z=-0.18*sg; torso.add(hip);
      var shoulder=M(new THREE.SphereGeometry(0.14*bw,18,14), metal); shoulder.position.set(0.34*sg,1.35,0.02); shoulder.scale.set(1.25,0.68,0.9); rig.add(shoulder);
      var vam=M(new THREE.CapsuleGeometry(0.058,0.24,6,12), metal); vam.position.set(0.36*sg,0.84,0.08); vam.rotation.z=-0.28*sg; rig.add(vam);
      var greave=M(new THREE.CapsuleGeometry(0.058,0.28,6,12), metal); greave.position.set(0.13*sg,0.25,0.05); rig.add(greave);
      var buckle=M(new THREE.BoxGeometry(0.036,0.026,0.018), gem); buckle.position.set(0.16*sg,-0.21,0.255*bw); torso.add(buckle);
    });
    [-0.11,0,0.11].forEach(function(y){ var seam=M(new THREE.BoxGeometry(0.2*bw,0.012,0.014), light?mats.leather:mats.trim); seam.position.set(0,y,0.258*bw); torso.add(seam); });
    if (/moon|mythic|legend|coin|velvet/.test(txt)){ var c=col(a.gem,"#c4b5fd"); var gm=new THREE.MeshStandardMaterial({ color:c, roughness:0.24, metalness:0.55, emissive:c.clone().multiplyScalar(0.48), envMapIntensity:1.18 }); R.disposables.push(gm); var v=M(new THREE.SphereGeometry(0.2*bw,22,16,0,Math.PI*2,0,Math.PI*0.6), gm); v.position.set(0,0.0,0.15*bw); v.scale.set(1,1.18,0.46); torso.add(v); }
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
  function rideMeta(g, seatY, stand, meta){ g.userData.seatY=seatY; g.userData.stand=!!stand; if(meta) Object.assign(g.userData, meta); return g; }

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
    var horse=/horse|mare|stallion|steed|pony|unicorn|pegasus|mustang|charger/.test(id) || (!panther && !wolf);
    var g=new THREE.Group(), by=0.82, legs=[];
    var leather=s({ color:0x3b271b, roughness:0.78, metalness:0.08, envMapIntensity:0.45 });
    var dark=s({ color:0x111827, roughness:0.5, metalness:0.08 });
    var bone=s({ color:0xf5efe0, roughness:0.48, metalness:0.02 });
    var torso=M(new THREE.CapsuleGeometry(horse?0.245:panther?0.25:0.28, horse?0.94:0.7,10,24), body);
    torso.rotation.z=Math.PI/2; torso.position.set(-0.08,by,0); torso.scale.set(1,0.92,horse?0.62:0.82); g.add(torso);
    var topline=M(new THREE.CapsuleGeometry(0.06,0.82,6,12), acc); topline.rotation.z=Math.PI/2; topline.position.set(-0.08,by+0.25,0); topline.scale.set(1,0.65,0.42); g.add(topline);
    var chest=M(new THREE.SphereGeometry(horse?0.255:0.28,20,16), body); chest.position.set(0.49,by+0.015,0); chest.scale.set(0.78,1.02,0.68); g.add(chest);
    var rump=M(new THREE.SphereGeometry(horse?0.27:0.29,20,16), body); rump.position.set(-0.62,by+0.02,0); rump.scale.set(0.88,0.98,0.68); g.add(rump);
    var belly=M(new THREE.CapsuleGeometry(0.13,0.72,8,16), acc); belly.rotation.z=Math.PI/2; belly.position.set(-0.08,by-0.13,0); belly.scale.set(1,0.54,0.42); g.add(belly);
    function leg(x,z,front){
      var lg=new THREE.Group(); lg.position.set(x,by-0.06,z);
      var upper=M(new THREE.CapsuleGeometry(0.052,0.38,6,12), body); upper.position.set(front?0.015:-0.02,-0.24,0); upper.rotation.z=(front?-0.08:0.08); lg.add(upper);
      var joint=M(new THREE.SphereGeometry(0.052,14,10), acc); joint.position.set(front?0.035:-0.04,-0.47,0); joint.scale.set(0.78,0.62,0.78); lg.add(joint);
      var lower=M(new THREE.CapsuleGeometry(0.04,0.37,6,12), body); lower.position.set(front?0.055:-0.055,-0.71,0); lower.rotation.z=(front?0.08:-0.08); lg.add(lower);
      var hoof=M(new THREE.CylinderGeometry(0.062,0.075,0.08,10), det); hoof.position.set(front?0.07:-0.07,-0.92,0.025); hoof.scale.set(1,0.78,1.2); lg.add(hoof);
      g.add(lg); legs.push(lg); return lg;
    }
    leg(0.43,0.18,true); leg(0.43,-0.18,true); leg(-0.52,0.18,false); leg(-0.52,-0.18,false); g.userData.legs=legs;
    var neck=M(new THREE.CapsuleGeometry(horse?0.1:0.14, horse?0.54:0.4,8,16), body); neck.position.set(0.58,by+0.35,0); neck.rotation.z=horse?-0.48:-0.66; g.add(neck);
    var head=M(new THREE.CapsuleGeometry(horse?0.105:0.14, horse?0.36:0.3,8,16), body); head.position.set(horse?0.88:0.86,by+0.62,0); head.rotation.z=horse?-1.0:-1.18; g.add(head);
    var muzzle=M(new THREE.SphereGeometry(horse?0.082:0.12,14,10), body); muzzle.position.set(horse?1.06:1.02,horse?by+0.54:by+0.46,0); muzzle.scale.set(horse?1.5:1.2,0.68,0.68); g.add(muzzle);
    [-1,1].forEach(function(sg){ var ear=M(new THREE.ConeGeometry(0.05,0.17,7), body); ear.position.set(0.78,by+0.8,0.08*sg); ear.rotation.set(0.1,0.15*sg,-0.12); g.add(ear); });
    var em=s({ color:0x10131a, roughness:0.4 });
    [-1,1].forEach(function(sg){ var eye=M(new THREE.SphereGeometry(0.028,12,8), em); eye.position.set(0.94,by+0.61,0.105*sg); g.add(eye); var nost=M(new THREE.SphereGeometry(0.018,8,6), em); nost.position.set(1.14,by+0.5,0.055*sg); g.add(nost); });
    if (!panther && !wolf){ for(var i=0;i<7;i++){ var mh=M(new THREE.BoxGeometry(0.04,0.15,0.075), acc); var f=i/6; mh.position.set(0.45+f*0.33,by+0.43+f*0.18,0); mh.rotation.z=-0.55; g.add(mh); } }
    if (wolf){ var ruff=M(new THREE.SphereGeometry(0.26,18,12), acc); ruff.position.set(0.38,by+0.1,0); ruff.scale.set(0.8,1.05,1); g.add(ruff); }
    var tail=M(new THREE.CapsuleGeometry(wolf?0.08:0.055,wolf?0.46:0.5,6,12), acc); tail.position.set(-0.86,by+0.03,0); tail.rotation.z=wolf?0.95:1.18; tail.scale.set(1,1,0.8); g.add(tail);
    [-1,1].forEach(function(sg){ var flank=CBetween([-0.46,by+0.07,0.2*sg],[0.28,by+0.09,0.2*sg],0.008,acc,6); g.add(flank); });
    var blanket=M(new THREE.BoxGeometry(0.5,0.044,0.42), acc); blanket.position.set(-0.12,by+0.27,0); blanket.rotation.z=-0.015; g.add(blanket);
    var saddle=M(new THREE.SphereGeometry(0.21,20,14,0,Math.PI*2,0,Math.PI*0.5), det); saddle.position.set(-0.08,by+0.34,0); saddle.scale.set(1.0,0.38,0.72); g.add(saddle);
    [-1,1].forEach(function(sg){
      var strap=CBetween([-0.12,by+0.31,0.24*sg],[-0.18,by-0.23,0.2*sg],0.012,leather,6); g.add(strap);
      var stir=CBetween([-0.18,by-0.22,0.2*sg],[-0.18,by-0.45,0.2*sg],0.01,det,6); g.add(stir);
      var ring=M(new THREE.TorusGeometry(0.055,0.008,6,18), det); ring.position.set(-0.18,by-0.49,0.2*sg); ring.rotation.x=Math.PI/2; g.add(ring);
      var rein=CBetween([-0.02,by+0.43,0.12*sg],[0.96,by+0.62,0.085*sg],0.008,leather,6); g.add(rein);
    });
    var breast=CBetween([0.28,by+0.18,0],[0.72,by+0.52,0],0.014,leather,6); g.add(breast);
    var brow=CBetween([0.83,by+0.68,-0.12],[0.83,by+0.68,0.12],0.012,leather,6); g.add(brow);
    var noseBand=CBetween([1.08,by+0.5,-0.1],[1.08,by+0.5,0.1],0.012,leather,6); g.add(noseBand);
    if (/unicorn/.test(id)){ var horn=M(new THREE.ConeGeometry(0.04,0.34,12), det); horn.position.set(0.94,by+0.82,0); horn.rotation.z=-0.45; g.add(horn); }
    if (/ram|bull|bison|yak|ox|rhino/.test(id)){ [-1,1].forEach(function(sg){ var horn2=M(new THREE.ConeGeometry(0.045,0.26,8), det); horn2.position.set(0.92,by+0.68,0.09*sg); horn2.rotation.set(0.2,0.4*sg,0.25); g.add(horn2); }); }
    if (/stag|deer|elk/.test(id)){ [-1,1].forEach(function(sg){ var a1=M(new THREE.CylinderGeometry(0.02,0.03,0.3,6), det); a1.position.set(0.8,by+0.86,0.08*sg); a1.rotation.z=0.3*sg; g.add(a1); var a2=M(new THREE.CylinderGeometry(0.014,0.02,0.18,6), det); a2.position.set(0.74,by+1.0,0.16*sg); a2.rotation.z=0.8*sg; g.add(a2); }); }
    return rideMeta(g, by+0.48, false, { riderScale:0.8, riderX:-0.1, riderZ:0.0, riderYOffset:0.07, cameraDist:5.1, cameraLookY:1.12, previewYaw:-0.38 });
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
    var hero=buildHeroModelKit(spec); addOutlines(hero); var mount=spec.mount?buildMount(spec):null; if(mount) addOutlines(mount); var pet=buildPet(spec); R.mounted=!!mount;
    if(mount){ R.root.add(mount); R.mountGroup=mount; applyMountedPose(hero, mount); if(R.mode==="studio" && mount.userData.previewYaw!==undefined){ R.yaw=mount.userData.previewYaw; R.targetYaw=mount.userData.previewYaw; }
      if(R.pedestal) R.pedestal.visible=false;
    } else { hero.position.y=0; if(R.pedestal) R.pedestal.visible=false; }
    R.root.add(hero); R.heroRig=hero; if(pet){ R.root.add(pet); R.petGroup=pet; } frame();
  }
  function applyMountedPose(hero, mount){
    var ud=mount.userData||{}, stand=!!ud.stand, sc=stand?(ud.riderScale||0.88):(ud.riderScale||0.78);
    hero.scale.setScalar(sc); hero.rotation.set(stand?0:-0.035,0,0);
    var baseY = stand ? ((ud.seatY||0.72)+0.18*sc) : ((ud.seatY||1.25)+(ud.riderYOffset||0.06)-0.9*sc);
    hero.position.set(ud.riderX||0, baseY, ud.riderZ||0); hero.userData.mountBaseY=baseY; hero.userData.mounted=!stand;
    if(!stand){
      if(hero.userData.legL){ hero.userData.legL.position.set(-0.18,0.82,0.06); hero.userData.legL.rotation.set(0.88,0,0.42); }
      if(hero.userData.legR){ hero.userData.legR.position.set(0.18,0.82,-0.06); hero.userData.legR.rotation.set(0.88,0,-0.42); }
      if(hero.userData.armL){ hero.userData.armL.rotation.set(-0.42,0,-0.16); }
      if(hero.userData.armR){ hero.userData.armR.rotation.set(-0.42,0,0.16); }
      if(hero.userData.torso){ hero.userData.torso.rotation.x=-0.04; }
    }
  }
  function frame(){ var cam=R.camera;
    var md=R.mountGroup&&R.mountGroup.userData||{};
    if(R.mode==="studio"){ if(R.mounted){ cam.position.set(0,1.38,md.cameraDist||5.25); R.lookY=md.cameraLookY||1.1; } else { cam.position.set(0,1.07,4.22); R.lookY=0.84; } }
    else { if(R.mounted){ cam.position.set(0,1.34,md.cameraDist||5.15); R.lookY=md.cameraLookY||1.08; } else { cam.position.set(0,1.06,4.05); R.lookY=0.86; } }
    cam.lookAt(0,R.lookY,0); }
  FH3D.sync=function(spec){ if(!FH3D.available){ if(!initEngine()) return; } if(!spec) return; R.running=!!spec.running;
    try{ var sg=specSig(spec); if(sg!==R.sig){ R.sig=sg; rebuild(spec); } startLoop(); }catch(e){ console.warn("[FH3D] sync failed:",e); } };

  function attach(container, mode){ if(!container) return; if(!FH3D.available){ if(!initEngine()) return; }
    var canvas=R.renderer.domElement; try{ if(getComputedStyle(container).position==="static") container.style.position="relative"; }catch(e){}
    if(canvas.parentNode!==container) container.appendChild(canvas); R.container=container; R.mode=mode||"home"; if(R.mode==="studio"){ R.yaw=0; R.targetYaw=0; R.autoSpin=false; } else if(!R.dragging){ R.autoSpin=true; }
    if(R.pedestal) R.pedestal.visible = false;
    container.classList.add("fh3d-host"); container.setAttribute("data-fh3d-ready","0"); resize(); frame(); observe(container); startLoop(); }
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
      if(h.userData.torso){ h.userData.torso.position.y=1.12+bob; h.userData.torso.rotation.y=Math.sin(t*1.0)*0.035; }
      if(h.userData.headG){ h.userData.headG.position.y=1.59+bob; h.userData.headG.rotation.y=Math.sin(t*0.7)*0.08; h.userData.headG.rotation.x=Math.sin(t*1.2)*0.02; }
      if(!R.mounted){ if(h.userData.armL) h.userData.armL.rotation.x=Math.sin(t*1.5*sp)*0.1*amp; if(h.userData.armR) h.userData.armR.rotation.x=-Math.sin(t*1.5*sp)*0.1*amp; }
      else { if(h.userData.armL) h.userData.armL.rotation.x=-0.42+Math.sin(t*1.15)*0.025; if(h.userData.armR) h.userData.armR.rotation.x=-0.42-Math.sin(t*1.15)*0.025; }
      if(h.userData.cloak) h.userData.cloak.rotation.x=Math.sin(t*1.3)*0.05+0.04;
    }
    if(R.mountGroup){ var mg=R.mountGroup;
      if(mg.userData.skiff){ mg.position.y=Math.sin(t*1.4)*0.05; if(R.heroRig) R.heroRig.position.y=((R.heroRig.userData.mountBaseY!==undefined)?R.heroRig.userData.mountBaseY:(mg.userData.seatY-0.86))+Math.sin(t*1.4)*0.05; }
      else { var run=R.running, gy=run?Math.abs(Math.sin(t*6))*0.06:Math.sin(t*1.8)*0.02; mg.position.y=gy; if(R.heroRig) R.heroRig.position.y=((R.heroRig.userData.mountBaseY!==undefined)?R.heroRig.userData.mountBaseY:(mg.userData.seatY-0.86))+gy;
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
