import * as THREE from 'three';
import { PLUSH_TYPES, MY_MACHINES, CUSTOMER_WINRATE, KIND_WIN, PUSHER_WINRATE, itemValue, REVIEWS, NICKS, DECOR, FLOOR, GRID, won } from './data.js';
import { buildPlushMesh } from './plush.js';
import { buildCabinet, placeClaw, setClawOpen, footprint, BASE_H, CHUTE } from './machine.js';
import { box, cyl, sphere, makeTextSprite, rand, lerp, clamp } from './util.js';
import { sfx } from './audio.js';

const DOOR = new THREE.Vector3(0, 0, 4.6);
const PASTELS = [0xffb3c6, 0xa0d8ff, 0xc3f0a8, 0xffe08a, 0xd9b8ff, 0xffc39a];
export const machineDef = id => MY_MACHINES.find(x => x.id === id);

// 슬롯 하나의 수익 정보
export function slotEconomy(slot, rep, promo=1){
  const m = machineDef(slot.machine);
  const total = Object.values(slot.stock).reduce((a,b)=>a+b, 0);
  let avg = 0;
  if (total > 0){ let sum = 0; for (const [k,n] of Object.entries(slot.stock)) sum += itemValue(k) * n; avg = sum/total; }
  const gacha = m.type === 'gacha';
  const kind = m.kind || 'claw';
  let winRate;
  if (gacha) winRate = 1;
  else if (kind === 'pusher') winRate = PUSHER_WINRATE;
  else winRate = CUSTOMER_WINRATE[slot.grip] * (KIND_WIN[kind] ?? 1) * ((slot.clawSize||1) < 1 ? 0.6 : 1) + (slot.pity ? 1/slot.pity : 0);
  const ev = winRate * avg;
  const fairness = slot.price > 0 ? ev/slot.price : 0;
  const repMult = 0.35 + 0.65*((rep ?? 3)/5);
  const mult = total > 0 ? clamp(fairness*(gacha ? 1.3 : 2.5), 0.03, 2.5) * repMult * promo : 0;
  const rate = m.baseRate * mult;
  return { m, total, avg, winRate, ev, fairness, rate, repMult, gacha, kind, profitPerMin: rate*(slot.price - winRate*avg) };
}

// 가챠 머신 캐비닛
export function buildGacha(spec){
  const { w, d, h, color } = spec;
  const root = new THREE.Group();
  root.add(box(w, 0.8, d, color, 0, 0.4, 0));
  root.add(box(w+0.04, 0.08, d+0.04, 0x3b3b48, 0, 0.04, 0));
  root.add(box(0.26, 0.14, 0.02, 0x22222a, 0, 0.35, d/2+0.011));
  const knob = cyl(0.07, 0.07, 0.04, 0xffd400, 0, 0.6, d/2+0.03); knob.rotation.x = Math.PI/2; root.add(knob);
  root.add(box(0.1, 0.02, 0.05, 0x333, 0, 0.6, d/2+0.05));
  const globe = new THREE.Mesh(new THREE.SphereGeometry(w*0.48, 20, 14), new THREE.MeshStandardMaterial({ color:0xd8f3ff, transparent:true, opacity:0.18, roughness:0.05, side:THREE.DoubleSide, depthWrite:false }));
  globe.position.y = 0.8 + w*0.48; globe.renderOrder = 20; root.add(globe);
  root.add(cyl(w*0.2, w*0.2, 0.08, color, 0, 0.8 + w*0.96, 0));
  const interior = new THREE.Group(); interior.position.y = 0.8 + w*0.48; root.add(interior);
  const display = makeTextSprite('0원', { size:54, color:'#ff3a3a', bg:null, width:512, height:128 });
  display.scale.set(0.34, 0.085, 1); display.position.set(0, 0.2, d/2+0.02); root.add(display);
  const sign = makeTextSprite(spec.name, { size:60, color:'#ff4f8b', bg:null, width:640, height:128 });
  sign.scale.set(1.0, 0.2, 1); sign.position.set(0, 0.8 + w*1.05, 0); root.add(sign);
  return { root, interior, display, sign, lights:[], dims:{w,d,h}, isGacha:true, globeR:w*0.48 };
}
export function buildAnyCabinet(m){
  const spec = { ...m, name:m.name, clawSize:1 };
  return m.type === 'gacha' ? buildGacha(spec) : buildCabinet(spec);
}
// 회전(0~3)에 따른 점유 사각형
export function slotRect(data, x=data.x, z=data.z, rot=data.rot||0){
  const m = machineDef(data.machine); const fp = footprint(m);
  const w = (rot%2) ? fp.d : fp.w, d = (rot%2) ? fp.w : fp.d;
  // 콘솔이 앞(+z 로컬)에 튀어나오므로 중심을 앞쪽으로 조금 치우침
  const off = (fp.d - (m.d + 2*0.12))/2 * 0.5;
  const a = rot*Math.PI/2, fx = Math.sin(a)*off, fz = Math.cos(a)*off;
  return { x0:x+fx-w/2, x1:x+fx+w/2, z0:z+fz-d/2, z1:z+fz+d/2 };
}
const overlaps = (a, b, gap=0) => a.x0 < b.x1+gap && a.x1 > b.x0-gap && a.z0 < b.z1+gap && a.z1 > b.z0-gap;

export class StoreScene {
  constructor(save, hooks){
    this.save = save; this.hooks = hooks;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 60);
    this.camera.position.set(0, 6.2, 8.2); this.camera.lookAt(0, 0.9, -0.2);
    this.hemi = new THREE.HemisphereLight(0xffffff, 0xffc0cb, 0.9); this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 1.4); this.sun.position.set(4, 9, 5); this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sun.shadow.camera, { left:-8, right:8, top:8, bottom:-8, near:1, far:30 });
    this.scene.add(this.sun);
    this.neonLights = [];
    // 바닥/벽
    this.floorMesh = box(11, 0.1, 9, 0xf7d9b5, 0, -0.05, 0.4); this.floorMesh.receiveShadow = true; this.scene.add(this.floorMesh);
    this.tileGroup = new THREE.Group(); this.scene.add(this.tileGroup);
    this.walls = [box(11, 3.2, 0.2, 0xcfe8ff, 0, 1.6, -4.0), box(0.2, 3.2, 9, 0xcfe8ff, -5.5, 1.6, 0.4), box(0.2, 3.2, 9, 0xcfe8ff, 5.5, 1.6, 0.4)];
    this.walls.forEach(w => this.scene.add(w));
    // 간판 + 문
    this.sign = makeTextSprite('', { size:64, color:'#ff4f8b', bg:'rgba(255,255,255,0.9)', width:768, height:128 });
    this.sign.scale.set(4.2, 0.7, 1); this.sign.position.set(0, 2.6, -3.85); this.scene.add(this.sign);
    this.setName(save.storeName || '내 인형뽑기 가게');
    this.scene.add(box(1.4, 0.06, 0.8, 0xff8fab, 0, 0.03, 4.4));
    const mat_ = makeTextSprite('입구', { size:56, color:'#fff', bg:null }); mat_.scale.set(1, 0.25, 1); mat_.position.set(0, 0.12, 4.4); this.scene.add(mat_);
    // 격자(건축 모드)
    this.gridHelper = new THREE.GridHelper(11, 22, 0xff8fab, 0xffc3d6); this.gridHelper.position.set(0, 0.02, 0.2); this.gridHelper.visible = false; this.scene.add(this.gridHelper);
    this.slots = []; this.customers = []; this.wanderers = []; this.navVersion = 0;
    this.raycaster = new THREE.Raycaster(); this.floorPlane = new THREE.Plane(new THREE.Vector3(0,1,0), 0);
    this.buildMode = false; this.ghost = null;
    this.applyDecor();
    this.rebuildAll();
  }
  resize(w, h){
    const a = w/h; this.camera.aspect = a;
    // 넓은 화면일수록 세로 시야가 좁아지므로 카메라를 뒤로 빼서 가게 전체가 들어오게
    const s = clamp(0.78 + 0.32*a, 1.0, 1.4);
    this.camera.position.set(0, 6.2*s, 8.2*s); this.camera.lookAt(0, 0.9, -0.2);
    this.camera.updateProjectionMatrix();
  }
  setName(name){ this.save.storeName = name; this.sign.setText('🧸 ' + name); }

  // ---------- 꾸미기 ----------
  applyDecor(){
    const dc = this.save.decor || { floor:'tile', wall:'sky', light:'day' };
    const f = DECOR.floor.find(x => x.id === dc.floor) || DECOR.floor[0];
    const w = DECOR.wall.find(x => x.id === dc.wall) || DECOR.wall[0];
    const l = DECOR.light.find(x => x.id === dc.light) || DECOR.light[0];
    this.floorMesh.material.color.setHex(f.base);
    while (this.tileGroup.children.length) this.tileGroup.remove(this.tileGroup.children[0]);
    if (f.pattern === 'checker'){ for (let x=-5; x<=5; x++) for (let z=-4; z<=4; z++) if ((x+z)%2===0){ const t = box(0.98, 0.012, 0.98, f.tile, x, 0.006, z+0.4); t.receiveShadow = true; this.tileGroup.add(t); } }
    if (f.pattern === 'plank'){ for (let z=-4; z<=4; z++) for (let i=0;i<3;i++){ const t = box(3.5, 0.012, 0.42, i%2 ? f.tile : f.base, -3.6 + i*3.6 + (z%2)*0.6, 0.006, z+0.4 + 0.25, {}); t.receiveShadow = true; this.tileGroup.add(t); } }
    this.walls.forEach(m => m.material.color.setHex(w.color));
    this.hemi.color.setHex(l.hemi); this.hemi.groundColor.setHex(l.ground); this.hemi.intensity = l.hemiI;
    this.sun.color.setHex(l.sun); this.sun.intensity = l.sunI;
    this.scene.background = new THREE.Color(l.bg); this.scene.fog = new THREE.Fog(l.bg, 12, 22);
    this.neonLights.forEach(n => this.scene.remove(n)); this.neonLights = [];
    l.neon.forEach((c, i) => { const p = new THREE.PointLight(c, 2.5, 7); p.position.set(-4 + i*(8/Math.max(1, l.neon.length-1)), 2.6, -3.2); this.scene.add(p); this.neonLights.push(p);
      const bulb = sphere(0.08, c, p.position.x, p.position.y, p.position.z, 1,1,1, { emissive:c, emissiveIntensity:2 }); this.scene.add(bulb); this.neonLights.push(bulb); });
  }

  // ---------- 배치 ----------
  rebuildAll(){
    this.slots.forEach(s => { if (s && s.cab) this.scene.remove(s.cab.root); });
    this.slots = [];
    this.save.slots.forEach((data, i) => { this.slots[i] = null; if (data) this.rebuildSlot(i); });
    this.buildNav();
  }
  rebuildSlot(i){
    const data = this.save.slots[i];
    if (this.slots[i] && this.slots[i].cab) this.scene.remove(this.slots[i].cab.root);
    if (!data){ this.slots[i] = null; this.buildNav(); return; }
    const m = machineDef(data.machine);
    const cab = buildAnyCabinet(m);
    cab.root.position.set(data.x, 0, data.z); cab.root.rotation.y = (data.rot||0)*Math.PI/2;
    cab.root.traverse(o => { o.userData.slot = i; });
    this.scene.add(cab.root);
    const s = { i, x:data.x, z:data.z, rot:data.rot||0, cab, plushMeshes:[] };
    this.slots[i] = s;
    if (cab.claw){ setClawOpen(cab, 1); placeClaw(cab, -m.w/2+CHUTE/2, m.h-0.24, m.d/2-CHUTE/2); }
    this.refreshStock(i);
    this.buildNav();
  }
  // 회전 반영한 앞쪽 서는 자리
  standPos(i, back=0, side=0){
    const s = this.slots[i], data = this.save.slots[i], m = machineDef(data.machine); const fp = footprint(m);
    const a = (data.rot||0)*Math.PI/2;
    const lx = side, lz = fp.d/2 + 0.35 + back;
    return new THREE.Vector3(data.x + Math.sin(a)*lz + Math.cos(a)*lx, 0, data.z + Math.cos(a)*lz - Math.sin(a)*lx);
  }
  refreshStock(i){
    const s = this.slots[i], data = this.save.slots[i]; if (!s || !s.cab || !data) return;
    s.plushMeshes.forEach(m => s.cab.interior.remove(m)); s.plushMeshes = [];
    const m = machineDef(data.machine);
    const keys = []; for (const [k,n] of Object.entries(data.stock)) for (let j=0;j<n;j++) keys.push(k);
    if (s.cab.isGacha){
      const R = s.cab.globeR;
      keys.forEach((k, j) => {
        const c = sphere(0.055, [0xff8fab, 0xffd166, 0x8fd3ff, 0xc3f0a8, 0xd9b8ff][j%5], 0,0,0);
        const a = rand(0, Math.PI*2), rr = rand(0, R*0.7), layer = Math.floor(j/9);
        c.position.set(Math.cos(a)*rr, -R*0.6 + layer*0.1 + rand(0,0.04), Math.sin(a)*rr);
        s.cab.interior.add(c); s.plushMeshes.push(c);
      });
      s.cab.display.setText(`${won(data.price)}  x${keys.length}`);
      return;
    }
    const kind = m.kind || 'claw';
    if (kind === 'ufo'){ keys.slice(0,6).forEach((k, j) => { const mesh = buildPlushMesh(k); mesh.position.set(-m.w/2+0.3 + j*0.22, 0.4, 0); mesh.rotation.x = Math.PI/2; s.cab.interior.add(mesh); s.plushMeshes.push(mesh); }); }
    else if (kind === 'pusher'){ keys.slice(0,6).forEach((k, j) => { const mesh = buildPlushMesh(k); mesh.position.set(-m.w/2+0.25 + j*0.25, 0.48, -m.d/2+0.42); s.cab.interior.add(mesh); s.plushMeshes.push(mesh); }); }
    else {
      const x0 = kind === 'sweet' ? -m.w/2 + 0.7 : -m.w/2 + 0.2;
      const cols = Math.max(2, Math.floor((m.w/2 - x0 + m.w/2 - 0.1)/0.3));
      keys.forEach((k, j) => {
        const mesh = buildPlushMesh(k);
        const col = j % cols, row = Math.floor(j/cols);
        const rows = Math.max(1, Math.floor((m.d-0.2)/0.3));
        const layer = Math.floor(row / rows), r2 = row % rows;
        let x = x0 + col*0.3 + rand(-0.03,0.03), z = -m.d/2 + 0.2 + r2*0.3 + rand(-0.03,0.03);
        if (kind !== 'sweet' && x < -m.w/2+CHUTE+0.1 && z > m.d/2-CHUTE-0.1) z -= CHUTE;
        mesh.position.set(x, 0.14 + layer*0.28, z); mesh.rotation.y = rand(0, Math.PI*2);
        s.cab.interior.add(mesh); s.plushMeshes.push(mesh);
      });
    }
    s.cab.display.setText(`${won(data.price)}  PLAY ${data.stats.plays}`);
    s.cab.sign.setText(m.name);
  }
  canPlace(mId, x, z, rot, ignore=-1){
    const rect = slotRect({ machine:mId, x, z, rot });
    if (rect.x0 < FLOOR.x0 || rect.x1 > FLOOR.x1 || rect.z0 < FLOOR.z0 || rect.z1 > FLOOR.z1) return false;
    const door = { x0:FLOOR.door.x0, x1:FLOOR.door.x1, z0:FLOOR.door.z0, z1:FLOOR.z1+1 };
    if (overlaps(rect, door)) return false;
    for (let i=0;i<this.save.slots.length;i++){ const d = this.save.slots[i]; if (!d || i === ignore) continue; if (overlaps(rect, slotRect(d), 0.15)) return false; }
    return true;
  }
  pick(ndc){
    this.raycaster.setFromCamera(ndc, this.camera);
    const hits = this.raycaster.intersectObjects(this.scene.children, true);
    for (const h of hits){ if (h.object.userData.slot !== undefined) return h.object.userData.slot; if (h.object === this.floorMesh) break; }
    return null;
  }
  pickFloor(ndc){
    this.raycaster.setFromCamera(ndc, this.camera);
    const p = new THREE.Vector3(); if (!this.raycaster.ray.intersectPlane(this.floorPlane, p)) return null;
    return { x:Math.round(p.x/GRID)*GRID, z:Math.round(p.z/GRID)*GRID };
  }
  // 고스트(배치 미리보기)
  showGhost(mId, rot=0){
    this.hideGhost();
    const m = machineDef(mId); const cab = buildAnyCabinet(m);
    cab.root.traverse(o => { if (o.isMesh || o.isSprite){ o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = 0.5; o.castShadow = false; } });
    this.ghost = { mId, rot, root:cab.root, x:0, z:-10, valid:false };
    cab.root.rotation.y = rot*Math.PI/2; this.scene.add(cab.root);
  }
  moveGhost(x, z, ignore=-1){
    const g = this.ghost; if (!g) return;
    g.x = x; g.z = z; g.valid = this.canPlace(g.mId, x, z, g.rot, ignore);
    g.root.position.set(x, 0, z);
    g.root.traverse(o => { if (o.isMesh && o.material.color){ o.material.emissive = o.material.emissive || new THREE.Color(); o.material.emissive.setHex(g.valid ? 0x226633 : 0x882222); o.material.emissiveIntensity = 0.7; } });
  }
  rotateGhost(ignore=-1){ const g = this.ghost; if (!g) return; g.rot = (g.rot+1)%4; g.root.rotation.y = g.rot*Math.PI/2; this.moveGhost(g.x, g.z, ignore); }
  hideGhost(){ if (this.ghost){ this.scene.remove(this.ghost.root); this.ghost = null; } }
  setBuildMode(on){ this.buildMode = on; this.gridHelper.visible = on; if (!on) this.hideGhost(); }

  // ---------- 경로 (격자 A*) ----------
  buildNav(){
    const nx = Math.round((FLOOR.x1-FLOOR.x0)/GRID), nz = Math.round((FLOOR.z1-FLOOR.z0)/GRID);
    const blocked = new Uint8Array(nx*nz);
    const rects = this.save.slots.filter(Boolean).map(d => slotRect(d));
    for (let ix=0; ix<nx; ix++) for (let iz=0; iz<nz; iz++){
      const cx = FLOOR.x0 + (ix+0.5)*GRID, cz = FLOOR.z0 + (iz+0.5)*GRID;
      if (rects.some(r => cx > r.x0-0.2 && cx < r.x1+0.2 && cz > r.z0-0.2 && cz < r.z1+0.2)) blocked[ix + iz*nx] = 1;
    }
    this.nav = { nx, nz, blocked }; this.navVersion++;
  }
  cellOf(p){ const n = this.nav; return { ix:clamp(Math.floor((p.x-FLOOR.x0)/GRID), 0, n.nx-1), iz:clamp(Math.floor((p.z-FLOOR.z0)/GRID), 0, n.nz-1) }; }
  cellCenter(ix, iz){ return new THREE.Vector3(FLOOR.x0 + (ix+0.5)*GRID, 0, FLOOR.z0 + (iz+0.5)*GRID); }
  nearestFree(c){
    const n = this.nav; if (!n.blocked[c.ix + c.iz*n.nx]) return c;
    for (let r=1; r<6; r++) for (let dx=-r; dx<=r; dx++) for (let dz=-r; dz<=r; dz++){ const ix = c.ix+dx, iz = c.iz+dz; if (ix<0||iz<0||ix>=n.nx||iz>=n.nz) continue; if (!n.blocked[ix+iz*n.nx]) return { ix, iz }; }
    return c;
  }
  findPath(from, to){
    const n = this.nav, s = this.nearestFree(this.cellOf(from)), g = this.nearestFree(this.cellOf(to));
    const key = (ix,iz) => ix + iz*n.nx;
    const open = [{ ix:s.ix, iz:s.iz, f:0, g:0 }], came = new Map(), gs = new Map([[key(s.ix,s.iz), 0]]), closed = new Set();
    const h = (ix,iz) => Math.hypot(ix-g.ix, iz-g.iz);
    let found = null;
    while (open.length){
      open.sort((a,b)=>a.f-b.f); const cur = open.shift(); const ck = key(cur.ix, cur.iz);
      if (closed.has(ck)) continue; closed.add(ck);
      if (cur.ix === g.ix && cur.iz === g.iz){ found = cur; break; }
      for (let dx=-1; dx<=1; dx++) for (let dz=-1; dz<=1; dz++){
        if (!dx && !dz) continue; const ix = cur.ix+dx, iz = cur.iz+dz;
        if (ix<0||iz<0||ix>=n.nx||iz>=n.nz || n.blocked[key(ix,iz)]) continue;
        if (dx && dz && (n.blocked[key(cur.ix+dx, cur.iz)] || n.blocked[key(cur.ix, cur.iz+dz)])) continue; // 모서리 끼기 금지
        const ng = cur.g + Math.hypot(dx, dz), nk = key(ix, iz);
        if (ng < (gs.get(nk) ?? 1e9)){ gs.set(nk, ng); came.set(nk, ck); open.push({ ix, iz, g:ng, f:ng + h(ix, iz) }); }
      }
      if (closed.size > 1500) break;
    }
    if (!found) return [to.clone()];
    const cells = []; let k = key(found.ix, found.iz);
    while (k !== undefined){ cells.unshift(k); k = came.get(k); }
    let pts = cells.map(c => this.cellCenter(c % n.nx, Math.floor(c / n.nx)));
    pts.push(to.clone());
    // 직선 가시선으로 단순화
    const clear = (a, b) => { const st = Math.ceil(a.distanceTo(b)/0.2); for (let i=1;i<st;i++){ const p = a.clone().lerp(b, i/st); const c = this.cellOf(p); if (n.blocked[c.ix + c.iz*n.nx]) return false; } return true; };
    const out = [pts[0]]; let cur = 0;
    while (cur < pts.length-1){ let nxt = pts.length-1; while (nxt > cur+1 && !clear(pts[cur], pts[nxt])) nxt--; out.push(pts[nxt]); cur = nxt; }
    return out.slice(1).length ? out.slice(1) : [to.clone()];
  }
  // 경로를 따라 이동. 도착하면 true
  walk(mv, dt, speed){
    if (!mv.path || mv.navV !== this.navVersion){ mv.path = this.findPath(mv.g.position, mv.target); mv.navV = this.navVersion; }
    const dst = mv.path[0];
    const dir = dst.clone().sub(mv.g.position); dir.y = 0; const dist = dir.length();
    if (dist < 0.06){ mv.path.shift(); if (!mv.path.length) return true; return false; }
    dir.normalize(); mv.g.position.add(dir.multiplyScalar(Math.min(dist, speed*dt)));
    mv.g.rotation.y = Math.atan2(dir.x, dir.z) + Math.PI;
    return false;
  }

  promoMult(){ const p = this.save.promo; return (p && p.until > Date.now()) ? p.mult : 1; }
  // ---------- 경제 시뮬 ----------
  sim(dt, visuals){
    this.save.slots.forEach((data, i) => {
      if (!data) return;
      const eco = slotEconomy(data, this.save.rep, this.promoMult());
      if (eco.total <= 0 || eco.rate <= 0) return;
      if (Math.random() < eco.rate/60*dt && this.customers.length < 18){
        const apply = () => this.customerPlay(i);
        if (visuals && this.slots[i]) this.spawnCustomer(i, apply); else apply();
      }
    });
  }
  customerPlay(i){
    const data = this.save.slots[i]; if (!data) return null;
    const eco = slotEconomy(data); if (eco.total <= 0) return null;
    this.save.money += data.price; data.stats.plays++; data.stats.revenue += data.price;
    data.pityCount = (data.pityCount||0) + 1;
    let win = Math.random() < eco.winRate;
    if (!eco.gacha && data.pity && data.pityCount >= data.pity){ win = true; }
    let key = null, complaint = false;
    const rep = this.save.rep ?? 3;
    if (eco.gacha){
      if (data.price > eco.avg*1.1 && Math.random() < 0.25){ complaint = true; this.save.rep = Math.max(1, rep - 0.05); this.addReview('rip', null, 1); }
      else this.save.rep = Math.min(5, rep + 0.008);
    } else if (win) this.save.rep = Math.min(5, rep + 0.03);
    else {
      let d = data.grip === 'loose' ? 0.012 : data.grip === 'strong' ? 0.003 : 0.006;
      if (eco.kind === 'pusher') d = 0.004;
      if (data.grip === 'loose' && eco.kind !== 'pusher' && Math.random() < 0.1){ complaint = true; d += 0.08; }
      this.save.rep = Math.max(1, rep - d);
    }
    if (win){
      data.pityCount = 0;
      const keys = Object.keys(data.stock).filter(k => data.stock[k] > 0);
      key = keys[Math.floor(Math.random()*keys.length)];
      data.stock[key]--; if (data.stock[key] <= 0) delete data.stock[key];
      data.stats.wins++;
      this.refreshStock(i);
      if (eco.gacha){ if (!complaint && Math.random() < 0.35) this.addReview('gacha', key, 4 + (Math.random()<0.5?1:0)); }
      else if (Math.random() < 0.6) this.addReview('win', key, 5);
    } else {
      if (this.slots[i]?.cab) this.slots[i].cab.display.setText(`${won(data.price)}  PLAY ${data.stats.plays}`);
      const anyKey = Object.keys(data.stock)[0];
      if (complaint) this.addReview('complaint', anyKey, 1);
      else if (Math.random() < 0.08) this.addReview('lose', anyKey, 2 + Math.floor(Math.random()*2));
    }
    this.hooks.onChange();
    return { win, key, price:data.price, complaint };
  }
  makePerson(){
    const g = new THREE.Group();
    const c = PASTELS[Math.floor(Math.random()*PASTELS.length)];
    g.scale.setScalar(rand(0.85, 1.1));
    g.add(cyl(0.13, 0.16, 0.42, c, 0, 0.36, 0, 8));
    g.add(sphere(0.13, [0xffd9b3, 0xf1c8a0, 0xd9a577][Math.floor(Math.random()*3)], 0, 0.72, 0));
    g.add(sphere(0.135, [0x3b2a1e, 0x1e1e26, 0x9b6b3d, 0xd88aa6, 0xe8c07a][Math.floor(Math.random()*5)], 0, 0.78, -0.02, 1, 0.7, 1));
    [-1,1].forEach(sg => g.add(sphere(0.02, 0x1c1c22, sg*0.045, 0.73, 0.115)));
    [-1,1].forEach(sg => g.add(cyl(0.04, 0.04, 0.3, [0x5566aa, 0x333344, 0x88aa66][Math.floor(Math.random()*3)], sg*0.07, 0.15, 0, 6)));
    g.position.copy(DOOR).add(new THREE.Vector3(rand(-0.5,0.5), 0, rand(0, 0.3)));
    this.scene.add(g);
    return g;
  }
  addReview(kind, key, stars){
    const pool = REVIEWS[kind]; if (!pool) return;
    const item = key ? PLUSH_TYPES[key].name : '인형';
    const text = pool[Math.floor(Math.random()*pool.length)].replace(/\{item\}/g, item);
    const nick = NICKS[Math.floor(Math.random()*NICKS.length)] + Math.floor(Math.random()*90+10);
    if (!this.save.reviews) this.save.reviews = [];
    this.save.reviews.unshift({ nick, stars, text, t:Date.now() });
    if (this.save.reviews.length > 40) this.save.reviews.length = 40;
    if (this.hooks.onReview) this.hooks.onReview();
  }
  spawnCustomer(i, apply){
    const g = this.makePerson();
    const ahead = this.customers.filter(c => c.i === i && c.phase !== 'out').length;
    const target = this.standPos(i, ahead*0.45, (ahead>0 ? (ahead%2 ? 0.25 : -0.25) : 0) + rand(-0.1,0.1));
    this.customers.push({ g, i, apply, phase:'in', target, wait:0, t:0, speed:rand(1.4, 2.0), path:null });
  }
  wanderTarget(){
    const idx = this.slots.map((s,i)=>s?i:-1).filter(i=>i>=0);
    if (idx.length && Math.random() < 0.7){ const i = idx[Math.floor(Math.random()*idx.length)]; return this.standPos(i, rand(0.3, 1.2), rand(-0.9, 0.9)); }
    return new THREE.Vector3(rand(-4.5, 4.5), 0, rand(-0.6, 3.8));
  }
  updateWanderers(dt){
    const machines = this.save.slots.filter(Boolean).length;
    const want = machines === 0 ? 0 : Math.min(16, Math.round((1 + machines*1.5 + (this.save.rep ?? 3)*1.2) * Math.min(1.8, this.promoMult())));
    this.wanderT = (this.wanderT || 0) + dt;
    if (this.wanderers.length < want && this.wanderT > 0.8){ this.wanderT = 0; this.wanderers.push({ g:this.makePerson(), target:this.wanderTarget(), wait:0, t:rand(0,10), speed:rand(0.8, 1.3), leaving:false, path:null }); }
    if (this.wanderers.length > want && this.wanderT > 0.8){ this.wanderT = 0; const w = this.wanderers.find(x => !x.leaving); if (w){ w.leaving = true; w.target = DOOR.clone(); w.path = null; w.wait = 0; } }
    for (let k=this.wanderers.length-1; k>=0; k--){
      const w = this.wanderers[k]; w.t += dt;
      if (w.wait > 0){ w.wait -= dt; w.g.position.y = Math.abs(Math.sin(w.t*2))*0.01; continue; }
      if (this.walk(w, dt, w.speed)){
        if (w.leaving){ this.scene.remove(w.g); this.wanderers.splice(k,1); continue; }
        w.wait = rand(1.5, 5); w.target = this.wanderTarget(); w.path = null;
      } else w.g.position.y = Math.abs(Math.sin(w.t*9))*0.035;
    }
  }
  update(dt){
    for (let k=this.customers.length-1; k>=0; k--){
      const cu = this.customers[k]; cu.t += dt;
      const bob = Math.abs(Math.sin(cu.t*10))*0.04;
      if (cu.phase === 'in' || cu.phase === 'out'){
        if (cu.phase === 'out' && !cu.target.equals(DOOR)){ cu.target = DOOR.clone(); cu.path = null; }
        if (this.walk(cu, dt, cu.speed||1.7)){
          if (cu.phase === 'in'){ cu.phase = 'play'; cu.wait = 2.2 + Math.random(); const d = this.save.slots[cu.i]; if (d) cu.g.rotation.y = (d.rot||0)*Math.PI/2 + Math.PI; }
          else { this.scene.remove(cu.g); this.customers.splice(k,1); continue; }
        } else cu.g.position.y = bob;
      } else if (cu.phase === 'play'){
        cu.wait -= dt; cu.g.position.y = bob*0.3;
        const s = this.slots[cu.i];
        if (s && s.cab && s.cab.claw){ const m = machineDef(this.save.slots[cu.i]?.machine); if (m){ const p = 0.5+0.5*Math.sin(cu.t*3); placeClaw(s.cab, lerp(-m.w/4, m.w/4, p), m.h-0.24 - Math.max(0, Math.sin(cu.t*2))*0.4, lerp(-m.d/4, m.d/4, 0.5+0.5*Math.cos(cu.t*2))); } }
        if (cu.wait <= 0){
          const res = cu.apply();
          const pos = cu.g.position.clone().add(new THREE.Vector3(0, 1.3, 0));
          if (res){
            this.hooks.floatText(pos, '+' + won(res.price), 'money'); sfx.cash();
            if (res.win) this.hooks.floatText(pos.clone().add(new THREE.Vector3(0,0.35,0)), '🎉 ' + PLUSH_TYPES[res.key].name + ' 당첨!', 'win');
            else if (res.complaint) this.hooks.floatText(pos.clone().add(new THREE.Vector3(0,0.35,0)), '😡 너무해!! 집게 뭐야', 'bad');
          }
          if (s && s.cab && s.cab.claw){ const m = machineDef(this.save.slots[cu.i]?.machine); if (m) placeClaw(s.cab, -m.w/2+CHUTE/2, m.h-0.24, m.d/2-CHUTE/2); }
          if (Math.random() < 0.4){ this.wanderers.push({ g:cu.g, target:this.wanderTarget(), wait:0, t:cu.t, speed:rand(0.8,1.3), leaving:false, path:null }); this.customers.splice(k,1); continue; }
          cu.phase = 'out'; cu.target = DOOR.clone(); cu.path = null;
        }
      }
    }
    this.updateWanderers(dt);
    // 스위트박스 윗판 왕복 연출
    const tt = performance.now()/1000;
    this.slots.forEach(s => { if (!s || !s.cab) return; if (s.cab.plate) s.cab.plate.position.z = -machineDef(this.save.slots[s.i].machine).d/2 + 0.25 + 0.1*(1+Math.sin(tt*2)); s.cab.lights.forEach((l,i) => { l.material.emissiveIntensity = (Math.floor(tt*3)+i)%2 ? 1 : 0.15; }); });
  }
}
