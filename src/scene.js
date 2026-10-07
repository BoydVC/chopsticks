// World + vehicles. Sim coordinates map 1:1 to world metres: x downrange (ocean at +x), y up, z across.
import * as THREE from "three";
import * as TX from "./textures.js";
import { TOWER, VEHICLES } from "./sim.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

export function buildWorld(renderer) {
  const scene = new THREE.Scene();
  scene.background = TX.sky();
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.55;
  scene.fog = new THREE.Fog(0xb7cde6, 3500, 30000);
  const hemi = new THREE.HemisphereLight(0xdfeaff, 0x8a7a5c, 1.1); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1dc, 2.6);
  sun.position.set(260, 420, 300); sun.castShadow = true;
  Object.assign(sun.shadow.camera, { left: -140, right: 140, top: 200, bottom: -40, near: 10, far: 1400 });
  sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0004;
  sun.target.position.set(-10, 60, 0); scene.add(sun, sun.target);

  const land = new THREE.Group(); scene.add(land);
  // ocean (whole world) + coastline land patch (catch site only)
  const wn = TX.waterNormal(); wn.repeat.set(60, 60);
  const ocean = new THREE.Mesh(new THREE.PlaneGeometry(40000, 40000), new THREE.MeshStandardMaterial({ color: 0x1d5d86, roughness: 0.18, metalness: 0.35, normalMap: wn, normalScale: new THREE.Vector2(0.6, 0.6) }));
  ocean.rotation.x = -Math.PI / 2; ocean.position.y = -0.5; ocean.receiveShadow = true; scene.add(ocean);
  const gt = TX.ground(); gt.repeat.set(160, 240);
  const shore = new THREE.Mesh(new THREE.PlaneGeometry(6000, 9000), new THREE.MeshStandardMaterial({ color: 0xffffff, map: gt, roughness: 1 }));
  shore.rotation.x = -Math.PI / 2; shore.position.set(-2400, 0, 0); shore.receiveShadow = true; land.add(shore);
  const ct = TX.concrete(); ct.repeat.set(12, 12);
  const pad = new THREE.Mesh(new THREE.PlaneGeometry(240, 200), new THREE.MeshStandardMaterial({ map: ct, roughness: 0.95 }));
  pad.rotation.x = -Math.PI / 2; pad.position.set(-20, 0.05, 0); pad.receiveShadow = true; land.add(pad);
  // dunes + far hills
  const duneMat = new THREE.MeshStandardMaterial({ color: 0xd8c39a, roughness: 1, flatShading: true });
  for (let i = 0; i < 26; i++) {
    const d = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 6), duneMat);
    d.scale.set(60 + Math.random() * 120, 6 + Math.random() * 10, 40 + Math.random() * 90);
    d.position.set(560 + Math.random() * 40 - 200 * Math.random(), -2, -2500 + i * 200 + Math.random() * 60); land.add(d);
  }
  const hillMat = new THREE.MeshStandardMaterial({ color: 0x8c9a76, roughness: 1, flatShading: true });
  for (let i = 0; i < 18; i++) { const hl = new THREE.Mesh(new THREE.ConeGeometry(300 + Math.random() * 500, 80 + Math.random() * 160, 7), hillMat); hl.position.set(-4200 - Math.random() * 2500, 0, -5000 + i * 600); land.add(hl); }
  // a few low site buildings (generic) and tanks
  const bmat = new THREE.MeshStandardMaterial({ color: 0xe9ecef, roughness: 0.7 }), tmat = new THREE.MeshStandardMaterial({ color: 0xdfe3e8, metalness: 0.6, roughness: 0.35 });
  [[-150, 18, 60, 40, 30], [-210, 26, 120, 60, 40], [-120, 10, -110, 30, 50]].forEach(([x, h, z, w, d]) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), bmat); b.position.set(x, h / 2, z); b.castShadow = b.receiveShadow = true; land.add(b); });
  for (let i = 0; i < 6; i++) { const t = new THREE.Mesh(new THREE.CylinderGeometry(5, 5, 28, 20), tmat); t.position.set(-95 - (i % 3) * 13, 14, -60 - Math.floor(i / 3) * 13); t.castShadow = true; land.add(t); }

  const tower = buildTower(); land.add(tower.group);
  const mount = buildMount(); land.add(mount);

  // clouds
  const ctex = TX.cloud(); const clouds = new THREE.Group(); scene.add(clouds);
  for (let i = 0; i < 46; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: ctex, transparent: true, opacity: 0.55 + Math.random() * 0.3, depthWrite: false, fog: false }));
    const s = 500 + Math.random() * 900; sp.scale.set(s, s * 0.45, 1);
    sp.position.set(-2500 + Math.random() * 5500, 900 + Math.random() * 2200, -3000 + Math.random() * 6000); clouds.add(sp);
  }
  // buoy for ship mode
  const buoy = new THREE.Group();
  const bm = new THREE.MeshStandardMaterial({ color: 0xff7a1a, roughness: 0.5 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(30, 1.3, 8, 64), new THREE.MeshBasicMaterial({ color: 0xffb36b, transparent: true, opacity: 0.55 }));
  ring.rotation.x = Math.PI / 2; ring.position.y = 0.3; buoy.add(ring);
  const b1 = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.8, 3, 12), bm); b1.position.set(0, 1, 34); b1.castShadow = true; buoy.add(b1);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 3), new THREE.MeshStandardMaterial({ color: 0x333333 })); mast.position.set(0, 4, 34); buoy.add(mast);
  scene.add(buoy);

  return { scene, sun, ocean, wn, land, tower, clouds, buoy };
}

function buildTower() {
  const T = TOWER, g = new THREE.Group();
  const steelMat = new THREE.MeshStandardMaterial({ color: 0x5b6067, metalness: 0.55, roughness: 0.55 });
  const lightMat = new THREE.MeshStandardMaterial({ color: 0x8b9097, metalness: 0.5, roughness: 0.5 });
  const cx = (T.faceX + T.backX) / 2, w = T.faceX - T.backX, d = 14;
  const col = new THREE.BoxGeometry(1.6, T.top, 1.6);
  const cols = new THREE.InstancedMesh(col, steelMat, 4);
  const m = new THREE.Matrix4(); let k = 0;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { m.makeTranslation(cx + (sx * w) / 2, T.top / 2, (sz * d) / 2); cols.setMatrixAt(k++, m); }
  cols.castShadow = true; g.add(cols);
  // braces: horizontal rings + X diagonals on each face
  const levels = Math.floor(T.top / 9);
  const hb = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.6, 0.6), lightMat, levels * 4);
  const db = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.45, 0.45), lightMat, levels * 8);
  let hi = 0, di = 0; const q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), e = new THREE.Euler();
  for (let l = 0; l < levels; l++) {
    const y = l * 9 + 9;
    const faces = [[cx, y, d / 2, w, 0], [cx, y, -d / 2, w, 0], [cx + w / 2, y, 0, d, Math.PI / 2], [cx - w / 2, y, 0, d, Math.PI / 2]];
    for (const [fx, fy, fz, len, ry] of faces) {
      e.set(0, ry, 0); q.setFromEuler(e); p.set(fx, fy, fz); s.set(len, 1, 1); m.compose(p, q, s); hb.setMatrixAt(hi++, m);
      const diag = Math.hypot(len, 9), ang = Math.atan2(9, len);
      for (const sgn of [-1, 1]) { e.set(0, ry, sgn * ang, "YZX"); q.setFromEuler(e); p.set(fx, fy - 4.5, fz); s.set(diag, 1, 1); m.compose(p, q, s); db.setMatrixAt(di++, m); }
    }
  }
  hb.castShadow = db.castShadow = true; g.add(hb, db);
  // top + lightning mast + beacon
  const cap = new THREE.Mesh(new THREE.BoxGeometry(w + 2, 3, d + 2), steelMat); cap.position.set(cx, T.top + 1.5, 0); g.add(cap);
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.5, 18), steelMat); rod.position.set(cx, T.top + 12, 0); g.add(rod);
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.9, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff3030 })); beacon.position.set(cx, T.top + 21.5, 0); g.add(beacon);
  // carriage at arm height
  const carriage = new THREE.Mesh(new THREE.BoxGeometry(w + 4, 9, d + 4), new THREE.MeshStandardMaterial({ color: 0x3f444a, metalness: 0.5, roughness: 0.5 }));
  carriage.position.set(cx, T.armY - 4.5, 0); carriage.castShadow = true; g.add(carriage);
  // the two chopsticks: pivot at the tower face, reach out over the mount toward +x
  const armLen = T.armTipX - T.faceX;
  const arms = [];
  const armMat = new THREE.MeshStandardMaterial({ color: 0x6d737b, metalness: 0.55, roughness: 0.45 });
  const railMat = new THREE.MeshStandardMaterial({ color: 0xc9a227, metalness: 0.3, roughness: 0.6 });
  for (const sz of [-1, 1]) {
    const pivot = new THREE.Group(); pivot.position.set(T.faceX, T.armY, sz * 6.4);
    const truss = new THREE.Mesh(new THREE.BoxGeometry(armLen, 4.2, 2.2), armMat); truss.position.set(armLen / 2, -2.1, 0); truss.castShadow = true;
    const rail = new THREE.Mesh(new THREE.BoxGeometry(armLen * 0.55, 0.5, 1.6), railMat); rail.position.set(armLen * 0.62, 0.2, 0);
    // truss holes look: dark slats
    const slats = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 3.4, 2.3), new THREE.MeshStandardMaterial({ color: 0x2c3036 }), 14);
    for (let i = 0; i < 14; i++) { m.makeTranslation(2 + i * (armLen - 4) / 13, -2.1, 0); slats.setMatrixAt(i, m); }
    pivot.add(truss, rail, slats); g.add(pivot); arms.push({ pivot, sz });
  }
  return { group: g, arms, beacon, setArms(closed) { for (const a of arms) a.pivot.rotation.y = a.sz * (1 - closed) * 0.42; } };
}

function buildMount() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x9aa0a6, metalness: 0.4, roughness: 0.6 });
  const top = new THREE.Mesh(new THREE.CylinderGeometry(12, 12, 4, 40, 1, true), mat); top.position.y = TOWER.mountTop - 2; top.castShadow = true;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(10.5, 1.4, 10, 40), new THREE.MeshStandardMaterial({ color: 0x3a3e44, metalness: 0.5 })); ring.rotation.x = Math.PI / 2; ring.position.y = TOWER.mountTop;
  g.add(top, ring);
  for (let i = 0; i < 6; i++) { const a = (i / 6) * 6.283; const leg = new THREE.Mesh(new THREE.BoxGeometry(3, TOWER.mountTop - 4, 3), mat); leg.position.set(Math.cos(a) * 10, (TOWER.mountTop - 4) / 2, Math.sin(a) * 10); leg.castShadow = true; g.add(leg); }
  const deflector = new THREE.Mesh(new THREE.CylinderGeometry(14, 16, 1.2, 40), new THREE.MeshStandardMaterial({ color: 0x55595f, metalness: 0.6, roughness: 0.4 })); deflector.position.y = 0.6; g.add(deflector);
  return g;
}

export function buildVehicle(kind) {
  const V = VEHICLES[kind];
  const g = new THREE.Group();          // origin = engine plane (base point), +y = body axis
  const body = new THREE.Group(); g.add(body);
  const steelMat = new THREE.MeshStandardMaterial({ map: TX.steel(kind), metalness: 0.75, roughness: 0.32 });
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(V.R, V.R, kind === "ship" ? V.L - 12 : V.L - 3, 48, 1), steelMat);
  tank.position.y = kind === "ship" ? (V.L - 12) / 2 : (V.L - 3) / 2; tank.castShadow = true; body.add(tank);
  const dark = new THREE.MeshStandardMaterial({ color: 0x24272b, metalness: 0.6, roughness: 0.5 });
  // engine skirt + bells
  const skirt = new THREE.Mesh(new THREE.CylinderGeometry(V.R, V.R * 0.96, 2.4, 40), dark); skirt.position.y = 1.2; body.add(skirt);
  const bells = kind === "ship" ? [[0, 0], [1.6, 0], [-0.8, 1.4], [-0.8, -1.4], [3.2, 0], [-1.6, 2.8]].slice(0, 6) : [];
  if (kind === "booster") { bells.push([0, 0], [1.4, 0.8], [-1.4, 0.8], [0, -1.6]); for (let i = 0; i < 10; i++) { const a = (i / 10) * 6.283; bells.push([Math.cos(a) * 3.1, Math.sin(a) * 3.1]); } }
  const bellGeo = new THREE.CylinderGeometry(0.35, 0.65, 1.6, 12, 1, true);
  for (const [bx, bz] of bells) { const b = new THREE.Mesh(bellGeo, new THREE.MeshStandardMaterial({ color: 0x2a2522, metalness: 0.7, roughness: 0.4, side: THREE.DoubleSide })); b.position.set(bx, -0.4, bz); body.add(b); }
  const parts = { fins: [], flaps: [], pins: [] };
  if (kind === "booster") {
    // hot-stage ring on top
    const hs = new THREE.Mesh(new THREE.CylinderGeometry(V.R, V.R, 3, 48, 1, true), new THREE.MeshStandardMaterial({ color: 0x2d3136, metalness: 0.6, roughness: 0.5, side: THREE.DoubleSide }));
    hs.position.y = V.L - 1.5; body.add(hs);
    const ventMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
    for (let i = 0; i < 18; i++) { const a = (i / 18) * 6.283; const v = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.8, 0.2), ventMat); v.position.set(Math.cos(a) * (V.R + 0.05), V.L - 1.5, Math.sin(a) * (V.R + 0.05)); v.lookAt(0, V.L - 1.5, 0); body.add(v); }
    // four grid fins
    const fm = new THREE.MeshStandardMaterial({ map: TX.gridFin(), metalness: 0.6, roughness: 0.5, transparent: true });
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * 6.283 + Math.PI / 4;
      const piv = new THREE.Group(); piv.position.set(Math.cos(a) * V.R, V.L - 6.5, Math.sin(a) * V.R); piv.rotation.y = -a;
      const fin = new THREE.Mesh(new THREE.BoxGeometry(5.5, 4.5, 0.6), fm); fin.position.x = 2.9; fin.castShadow = true; piv.add(fin); body.add(piv); parts.fins.push(piv);
    }
    // catch pins (sit on the chopsticks)
    for (const sz of [-1, 1]) { const pin = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.4, 2.6), dark); pin.position.set(0, V.hpin + 0.7, sz * (V.R + 1.1)); body.add(pin); parts.pins.push(pin); }
  } else {
    // nose (ogive) + flaps
    const pts = []; for (let i = 0; i <= 16; i++) { const u = i / 16; pts.push(new THREE.Vector2(V.R * Math.sqrt(1 - u * u) * (1 - 0.12 * u), u * 14)); }
    const nose = new THREE.Mesh(new THREE.LatheGeometry(pts, 48), steelMat); nose.position.y = V.L - 12; nose.castShadow = true; body.add(nose);
    const flapMat = new THREE.MeshStandardMaterial({ color: 0x1d1f22, roughness: 0.7 });
    for (const [y, len, h] of [[V.L - 8, 3.5, 7], [6, 5, 11]]) for (const sz of [-1, 1]) {
      const piv = new THREE.Group(); piv.position.set(-1, y, sz * V.R);
      const f = new THREE.Mesh(new THREE.BoxGeometry(3.5, h, len), flapMat); f.position.z = sz * len * 0.5; f.castShadow = true; piv.add(f); body.add(piv); parts.flaps.push({ piv, sz });
    }
  }
  // plume
  const pt = TX.plume();
  const plumeMat = new THREE.MeshBasicMaterial({ map: pt, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const plume = new THREE.Group(); plume.position.y = -1.2; g.add(plume);
  for (let i = 0; i < 3; i++) { const c = new THREE.Mesh(new THREE.ConeGeometry(V.R * (0.55 + i * 0.18), 1, 24, 1, true), plumeMat); c.rotation.x = Math.PI; c.position.y = -0.5; plume.add(c); }
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: TX.soft("255,190,120"), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
  glow.scale.set(30, 30, 1); glow.position.y = -3; g.add(glow);
  const light = new THREE.PointLight(0xffa860, 0, 400, 1.6); light.position.y = -6; g.add(light);
  return { group: g, body, plume, glow, light, parts, V, kind };
}

export function poseVehicle(v, base, th, thr, gimbal, fin, t) {
  v.group.position.set(base.x, base.y, 0);
  v.group.rotation.z = -th;
  const on = thr > 0.02;
  v.plume.visible = on; v.glow.visible = on;
  if (on) {
    const len = 18 + thr * 70 * (0.92 + 0.08 * Math.sin(t * 53));
    v.plume.rotation.z = gimbal;
    v.plume.children.forEach((c, i) => { c.scale.set(1 + i * 0.08, len * (1 - i * 0.22), 1 + i * 0.08); c.position.y = -len * (1 - i * 0.22) / 2; });
    v.glow.material.opacity = 0.3 + thr * 0.35; v.glow.scale.setScalar(14 + thr * 20);
  }
  v.light.intensity = on ? 2500 + thr * 14000 : 0;
  for (const f of v.parts.fins) f.rotation.x = fin * 0.35;
  for (const f of v.parts.flaps) f.piv.rotation.y = f.sz * fin * 0.4;
}
