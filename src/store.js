import * as THREE from 'three';
import { PLUSH_TYPES, MY_MACHINES, CUSTOMER_WINRATE, KIND_WIN, PUSHER_WINRATE, itemValue, isPlush, REVIEWS, NICKS, DECOR, GRID, STAFF, EXPANSIONS, BREAKDOWNS, BUBBLES, won } from './data.js';
import { buildPlushMesh } from './plush.js';
import { buildCabinet, placeClaw, setClawOpen, footprint, BASE_H, CHUTE } from './machine.js';
import { box, cyl, sphere, makeTextSprite, makeTextPlane, rand, lerp, clamp } from './util.js';
import { sfx } from './audio.js';
import { spawn, play as playAnim, tick as tickAnim, fitHeight, CHARACTERS } from './assets.js';

const PASTELS = [0xffb3c6, 0xa0d8ff, 0xc3f0a8, 0xffe08a, 0xd9b8ff, 0xffc39a];
export const machineDef = id => MY_MACHINES.find(x => x.id === id);
export const bdDef = id => BREAKDOWNS.find(b => b.id === id);

// 슬롯 하나의 수익 정보
export function slotEconomy(slot, rep, promo=1){
  const m = machineDef(slot.machine);
  if (m.type === 'facility') return { m, total:0, avg:0, winRate:0, ev:0, fairness:0, rate:0, repMult:1, gacha:false, kind:m.kind, facility:true, profitPerMin:0 };
  const total = Object.values(slot.stock).reduce((a,b)=>a+b, 0);
  let avg = 0;
  if (total > 0){ let sum = 0; for (const [k,n] of Object.entries(slot.stock)) sum += itemValue(k) * n; avg = sum/total; }
  const gacha = m.type === 'gacha';
  const kind = m.kind || 'claw';
  let winRate;
  if (gacha) winRate = 1;
  else if (kind === 'pusher') winRate = PUSHER_WINRATE;
  else winRate = CUSTOMER_WINRATE[slot.grip] * (KIND_WIN[kind] ?? 1) * ((slot.clawSize||1) < 1 ? 0.6 : 1) + (slot.pity ? 1/slot.pity : 0);
  const bd = slot.broken ? bdDef(slot.broken) : null;
  if (bd) winRate *= bd.win;
  const ev = winRate * avg;
  const fairness = slot.price > 0 ? ev/slot.price : 0;
  const repMult = 0.35 + 0.65*((rep ?? 3)/5);
  let mult = total > 0 ? clamp(fairness*(gacha ? 1.3 : 2.5), 0.03, 2.5) * repMult * promo : 0;
  if (bd) mult *= bd.rate;
  const rate = m.baseRate * mult;
  const revMult = bd?.revenue ?? 1;
  return { m, total, avg, winRate, ev, fairness, rate, repMult, gacha, kind, bd, revMult, profitPerMin: rate*(slot.price*revMult - winRate*avg) };
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
  sign.scale.set(1.0, 0.2, 1); sign.position.set(0, 0.8 + w*1.05, 0);
  return { root, interior, display, sign, lights:[], dims:{w,d,h}, isGacha:true, globeR:w*0.48 };
}
// 시설물
export function buildFacility(m){
  const { w, d, h, color } = m; const root = new THREE.Group(); const out = { root, isFacility:true, kind:m.kind, lights:[], dims:{w,d,h} };
  if (m.kind === 'toilet'){
    root.add(box(w, h, d, color, 0, h/2, 0));
    root.add(box(w+0.04, 0.06, d+0.04, 0x3b3b48, 0, 0.03, 0));
    const door = new THREE.Group(); door.position.set(-0.28, 0, d/2+0.01); root.add(door);
    door.add(box(0.56, 1.7, 0.04, 0xffffff, 0.28, 0.85, 0));
    door.add(sphere(0.025, 0xffd400, 0.5, 0.9, 0.03));
    out.door = door;
    const sg = makeTextSprite('🚻 화장실', { size:60, color:'#2563eb', bg:'rgba(255,255,255,0.95)', width:512, height:128 }); sg.scale.set(0.9, 0.22, 1); sg.position.set(0, h+0.2, d/2); root.add(sg);
    out.sign = sg;
  } else if (m.kind === 'vending' && spawn('arcade-vending-machine')){
    const mv = spawn('arcade-vending-machine'); fitHeight(mv, h); root.add(mv);
    const sg = makeTextSprite('🥤 음료', { size:60, color:'#fff', bg:null, width:512, height:128 }); sg.scale.set(0.6, 0.15, 1); sg.position.set(0, h+0.1, d/2); root.add(sg);
  } else if (m.kind === 'vending'){
    root.add(box(w, h, d, color, 0, h/2, 0));
    root.add(box(w*0.8, h*0.55, 0.02, 0x9be7ff, 0, h*0.62, d/2+0.011, { emissive:0x66ccff, emissiveIntensity:0.5 }));
    for (let i=0;i<6;i++) root.add(cyl(0.035, 0.035, 0.12, [0xff4f8b, 0x7c5cff, 0x22c55e, 0xffd400][i%4], -w*0.28 + (i%3)*w*0.28, h*0.5 + Math.floor(i/3)*0.2, d/2-0.02, 8));
    root.add(box(w*0.6, 0.1, 0.02, 0x222, 0, h*0.18, d/2+0.011));
    const sg = makeTextSprite('🥤 음료', { size:60, color:'#fff', bg:null, width:512, height:128 }); sg.scale.set(0.6, 0.15, 1); sg.position.set(0, h+0.1, d/2); root.add(sg);
  } else if (m.kind === 'bench'){
    root.add(box(w, 0.06, d, color, 0, 0.45, 0));
    root.add(box(w, 0.4, 0.05, color, 0, 0.7, -d/2+0.03));
    [[-1],[1]].forEach(([s]) => { root.add(box(0.05, 0.45, d-0.05, 0x5a4634, s*(w/2-0.05), 0.22, 0)); });
    out.seatY = 0.48;
  }
  return out;
}
export function buildAnyCabinet(m){
  if (m.type === 'facility') return buildFacility(m);
  const spec = { ...m, name:m.name, clawSize:1 };
  return m.type === 'gacha' ? buildGacha(spec) : buildCabinet(spec);
}
export function slotFootprint(m){ return m.type === 'facility' ? { w:m.w + 0.2, d:m.d + (m.kind==='bench' ? 0.3 : 0.6) } : footprint(m); }
// 회전(0~3)에 따른 점유 사각형
export function slotRect(data, x=data.x, z=data.z, rot=data.rot||0){
  const m = machineDef(data.machine); const fp = slotFootprint(m);
  const w = (rot%2) ? fp.d : fp.w, d = (rot%2) ? fp.w : fp.d;
  const off = (fp.d - (m.d + 2*0.12))/2 * 0.5;
  const a = rot*Math.PI/2, fx = Math.sin(a)*off, fz = Math.cos(a)*off;
  return { x0:x+fx-w/2, x1:x+fx+w/2, z0:z+fz-d/2, z1:z+fz+d/2 };
}
const overlaps = (a, b, gap=0) => a.x0 < b.x1+gap && a.x1 > b.x0-gap && a.z0 < b.z1+gap && a.z1 > b.z0-gap;

export class StoreScene {
  constructor(save, hooks){
    this.save = save; this.hooks = hooks;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 80);
    this.hemi = new THREE.HemisphereLight(0xffffff, 0xffc0cb, 0.9); this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 1.4); this.sun.position.set(4, 9, 5); this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sun.shadow.camera, { left:-10, right:10, top:12, bottom:-12, near:1, far:40 });
    this.scene.add(this.sun);
    this.neonLights = []; this.room = new THREE.Group(); this.scene.add(this.room); this.tileGroup = new THREE.Group(); this.scene.add(this.tileGroup); this.props = new THREE.Group(); this.scene.add(this.props); this.propRects = [];
    this.sign = makeTextPlane('', { size:66, color:'#ff4f8b', bg:'rgba(255,255,255,0.96)', width:900, height:180 }); this.sign.scale.set(4.5, 0.9, 1); this.sign.userData.sign = true; this.scene.add(this.sign);
    this.signBoard = box(4.7, 1.1, 0.08, 0xff8fab, 0, 2.6, -3.93); this.scene.add(this.signBoard);
    this.floor = 0;
    this.gridHelper = null;
    this.slots = []; this.customers = []; this.wanderers = []; this.staffFigs = []; this.navVersion = 0;
    this.raycaster = new THREE.Raycaster(); this.floorPlane = new THREE.Plane(new THREE.Vector3(0,1,0), 0);
    this.buildMode = false; this.ghost = null; this.aspect = 1;
    this.buildRoom();
    this.setName(save.storeName || '내 인형뽑기 가게');
    this.applyDecor();
    this.rebuildAll();
    this.rebuildStaff();
  }
  get level(){ return this.save.expansion || 0; }
  // 바닥 범위 (증축 레벨에 따라)
  buildRoom(){
    const ex = EXPANSIONS[this.level] || EXPANSIONS[0];
    const W = ex.w, D = ex.d;
    this.F = { x0:-W/2+0.25, x1:W/2-0.25, z0:-3.75, z1:-4 + D - 0.85, W, D };
    this.F.door = { x0:-1.0, x1:1.0, z0:this.F.z1-0.85 };
    this.DOOR = new THREE.Vector3(0, 0, this.F.z1 + 0.45);
    while (this.room.children.length) this.room.remove(this.room.children[0]);
    const zc = -4 + D/2;
    const floors = this.save.floors || 1;
    if (floors > 1){
      // 계단(뒤쪽 오른쪽 구석). 위층에서는 계단이 출입구가 된다
      const sx = this.F.x1 - 0.9, sz = this.F.z0 + 0.9;
      const st = new THREE.Group(); st.position.set(sx, 0, sz); this.room.add(st);
      for (let i=0;i<6;i++) st.add(box(1.2, 0.12, 0.28, 0xcfa77a, 0, 0.06 + i*0.12, -0.7 + i*0.28));
      st.add(box(0.06, 1.0, 1.8, 0x8a6d4a, -0.62, 0.5, 0)); st.add(box(0.06, 1.0, 1.8, 0x8a6d4a, 0.62, 0.5, 0));
      const lab = makeTextSprite(this.floor === 0 ? '⬆ 계단' : `${this.floor+1}F ⬇`, { size:56, color:'#241c2e', bg:'rgba(255,255,255,0.9)', width:384, height:128 }); lab.scale.set(0.9, 0.3, 1); lab.position.set(0, 1.6, 0); st.add(lab);
      this.F.stairs = { x0:sx-0.8, x1:sx+0.8, z0:sz-1.1, z1:sz+1.2 };
      if (this.floor > 0) this.DOOR = new THREE.Vector3(sx, 0, sz + 1.0);
    } else this.F.stairs = null;
    this.buildProps();
    if (this.floor > 0){ const fl = makeTextSprite(`${this.floor+1}F`, { size:70, color:'#fff', bg:'rgba(124,92,255,0.9)', width:256, height:128 }); fl.scale.set(1.0, 0.5, 1); fl.position.set(-W/2+0.9, 2.5, -3.85); this.room.add(fl); }
    this.floorMesh = box(W, 0.1, D, 0xf7d9b5, 0, -0.05, zc); this.floorMesh.receiveShadow = true; this.room.add(this.floorMesh);
    this.walls = [box(W, 3.2, 0.2, 0xcfe8ff, 0, 1.6, -4.0), box(0.2, 3.2, D, 0xcfe8ff, -W/2, 1.6, zc), box(0.2, 3.2, D, 0xcfe8ff, W/2, 1.6, zc)];
    this.walls.forEach(w => this.room.add(w));
    this.sign.position.set(0, 2.6, -3.88); this.signBoard.position.set(0, 2.6, -3.93);
    this.room.add(box(1.4, 0.06, 0.8, 0xff8fab, 0, 0.03, this.DOOR.z - 0.2));
    const mat_ = makeTextSprite('입구', { size:56, color:'#fff', bg:null }); mat_.scale.set(1, 0.25, 1); mat_.position.set(0, 0.12, this.DOOR.z - 0.2); this.room.add(mat_);
    if (this.gridHelper) this.scene.remove(this.gridHelper);
    this.gridHelper = new THREE.GridHelper(Math.max(W, D), Math.max(W, D)*2, 0xff8fab, 0xffc3d6); this.gridHelper.position.set(0, 0.02, zc); this.gridHelper.visible = this.buildMode; this.scene.add(this.gridHelper);
    this.resize(this.aspect, 1);
    this.applyDecor();
  }
  // 카운터·기둥·화분 등 장식 (Kenney 모델이 로드돼 있으면 사용)
  buildProps(){
    while (this.props.children.length) this.props.remove(this.props.children[0]);
    this.propRects = [];
    const F = this.F;
    const put = (name, x, z, h, rotY=0) => { const m = spawn(name); if (!m) return null; fitHeight(m, h); m.position.set(x, 0, z); m.rotation.y = rotY; this.props.add(m); return m; };
    if (this.floor === 0){
      // 카운터 (뒤쪽 왼쪽) — 직원이 뒤에 선다
      const cx = F.x0 + 1.9, cz = F.z0 + 1.35;
      const counter = box(2.6, 0.95, 0.7, 0xfff6e8, cx, 0.475, cz); counter.receiveShadow = true; this.props.add(counter);
      this.props.add(box(2.7, 0.06, 0.8, 0xff8fab, cx, 0.98, cz));
      const reg = put('arcade-cash-register', cx - 0.7, cz, 0.55); if (reg) reg.position.y = 1.0;
      const pz = put('arcade-prizes', cx + 0.6, cz, 0.5); if (pz) pz.position.y = 1.0;
      this.propRects.push({ x0:cx-1.4, x1:cx+1.4, z0:F.z0-0.2, z1:cz+0.5 });
      // 기둥(뒤쪽 양 끝), 화분(입구 양쪽), 쓰레기통
      put('arcade-column', F.x0 + 0.35, F.z0 + 0.35, 3.0); put('arcade-column', F.x1 - 0.35, F.z0 + 0.35, 3.0);
      put('furn-plantSmall1', -1.6, F.z1 - 0.4, 0.9); put('furn-plantSmall2', 1.6, F.z1 - 0.4, 0.9);
      put('furn-lampRoundFloor', F.x1 - 0.5, F.z1 - 0.6, 1.6);
    } else {
      put('furn-plantSmall2', F.x0 + 0.5, F.z0 + 0.5, 0.9);
    }
  }
  resize(w, h){
    const a = w/h; this.aspect = a; this.camera.aspect = a;
    const ex = EXPANSIONS[this.level] || EXPANSIONS[0];
    const sz = Math.max(ex.w/11, ex.d/9);
    const s = clamp(0.78 + 0.32*a, 1.0, 1.4) * sz;
    const zc = -4 + ex.d/2;
    this.camera.position.set(0, 6.2*s, zc + 7.8*s); this.camera.lookAt(0, 0.9, zc - 0.6);
    this.camera.updateProjectionMatrix();
  }
  setName(name){ this.save.storeName = name; this.sign.setText('🧸 ' + name); }
  expand(level){ this.save.expansion = level; this.buildRoom(); this.buildNav(); }
  // 층 전환: 현재 층의 기계·손님만 보인다
  setFloor(f){
    if (f === this.floor) return;
    this.customers.forEach(c => this.scene.remove(c.g)); this.wanderers.forEach(w => this.scene.remove(w.g)); this.customers = []; this.wanderers = [];
    this.floor = f; this.buildRoom(); this.rebuildAll(); this.rebuildStaff();
    this.sign.visible = f === 0; this.signBoard.visible = f === 0;
  }
  onFloor(i){ const d = this.save.slots[i]; return !!d && (d.floor||0) === this.floor; }

  // ---------- 꾸미기 ----------
  applyDecor(){
    const dc = this.save.decor || { floor:'tile', wall:'sky', light:'day' };
    const f = DECOR.floor.find(x => x.id === dc.floor) || DECOR.floor[0];
    const w = DECOR.wall.find(x => x.id === dc.wall) || DECOR.wall[0];
    const l = DECOR.light.find(x => x.id === dc.light) || DECOR.light[0];
    const { W, D } = this.F, zc = -4 + D/2;
    this.floorMesh.material.color.setHex(f.base);
    while (this.tileGroup.children.length) this.tileGroup.remove(this.tileGroup.children[0]);
    if (f.pattern === 'checker'){ for (let x=-Math.floor(W/2); x<=Math.floor(W/2); x++) for (let z=0; z<D; z++) if ((x+z)%2===0){ const t = box(0.98, 0.012, 0.98, f.tile, x, 0.006, -4 + 0.5 + z); t.receiveShadow = true; this.tileGroup.add(t); } }
    if (f.pattern === 'plank'){ for (let z=0; z<D; z++) for (let i=0;i<Math.ceil(W/3.5);i++){ const t = box(3.4, 0.012, 0.42, i%2 ? f.tile : f.base, -W/2 + 1.75 + i*3.5 + (z%2)*0.6, 0.006, -4 + 0.75 + z); t.receiveShadow = true; this.tileGroup.add(t); } }
    this.walls.forEach(m => m.material.color.setHex(w.color));
    this.hemi.color.setHex(l.hemi); this.hemi.groundColor.setHex(l.ground); this.hemi.intensity = l.hemiI*1.25;
    this.sun.color.setHex(l.sun); this.sun.intensity = l.sunI*1.3;
    this.scene.background = new THREE.Color(l.bg); this.scene.fog = new THREE.Fog(l.bg, 14, 30);
    this.neonLights.forEach(n => this.scene.remove(n)); this.neonLights = [];
    l.neon.forEach((c, i) => { const p = new THREE.PointLight(c, 2.5, 7); p.position.set(-W/2+1.5 + i*((W-3)/Math.max(1, l.neon.length-1)), 2.6, -3.2); this.scene.add(p); this.neonLights.push(p);
      const bulb = sphere(0.08, c, p.position.x, p.position.y, p.position.z, 1,1,1, { emissive:c, emissiveIntensity:2 }); this.scene.add(bulb); this.neonLights.push(bulb); });
  }

  // ---------- 배치 ----------
  rebuildAll(){
    this.slots.forEach(s => { if (s && s.cab) this.scene.remove(s.cab.root); });
    this.slots = [];
    this.save.slots.forEach((data, i) => { this.slots[i] = null; if (data && (data.floor||0) === this.floor) this.rebuildSlot(i, true); });
    this.buildNav();
  }
  rebuildSlot(i, skipNav=false){
    const data = this.save.slots[i];
    if (this.slots[i] && this.slots[i].cab) this.scene.remove(this.slots[i].cab.root);
    if (!data || (data.floor||0) !== this.floor){ this.slots[i] = null; if (!skipNav) this.buildNav(); return; }
    const m = machineDef(data.machine);
    const cab = buildAnyCabinet(m);
    cab.root.position.set(data.x, 0, data.z); cab.root.rotation.y = (data.rot||0)*Math.PI/2;
    cab.root.traverse(o => { o.userData.slot = i; });
    this.scene.add(cab.root);
    const s = { i, x:data.x, z:data.z, rot:data.rot||0, cab, plushMeshes:[] };
    this.slots[i] = s;
    if (cab.claw){ setClawOpen(cab, 1); placeClaw(cab, -m.w/2+CHUTE/2, m.h-0.24, m.d/2-CHUTE/2); }
    // 고장 표시
    const warn = makeTextSprite('⚠ 고장', { size:60, color:'#fff', bg:'rgba(239,68,68,0.95)', width:384, height:128 }); warn.scale.set(0.9, 0.3, 1); warn.position.set(0, BASE_H + m.h + 0.75, 0); warn.visible = !!data.broken; cab.root.add(warn); s.warn = warn;
    this.refreshStock(i);
    if (!skipNav) this.buildNav();
  }
  standPos(i, back=0, side=0){
    const data = this.save.slots[i], m = machineDef(data.machine); const fp = slotFootprint(m);
    const a = (data.rot||0)*Math.PI/2;
    const lx = side, lz = fp.d/2 + 0.35 + back;
    return new THREE.Vector3(data.x + Math.sin(a)*lz + Math.cos(a)*lx, 0, data.z + Math.cos(a)*lz - Math.sin(a)*lx);
  }
  refreshStock(i){
    const s = this.slots[i], data = this.save.slots[i]; if (!s || !s.cab || !data) return;
    if (s.warn) s.warn.visible = !!data.broken;
    if (s.cab.isFacility) return;
    s.plushMeshes.forEach(m => s.cab.interior.remove(m)); s.plushMeshes = [];
    const m = machineDef(data.machine);
    const keys = []; for (const [k,n] of Object.entries(data.stock)) for (let j=0;j<n;j++) keys.push(k);
    if (s.cab.isGacha){
      const R = s.cab.globeR;
      keys.forEach((k, j) => { const c = sphere(0.055, [0xff8fab, 0xffd166, 0x8fd3ff, 0xc3f0a8, 0xd9b8ff][j%5], 0,0,0); const a = rand(0, Math.PI*2), rr = rand(0, R*0.7), layer = Math.floor(j/9); c.position.set(Math.cos(a)*rr, -R*0.6 + layer*0.1 + rand(0,0.04), Math.sin(a)*rr); s.cab.interior.add(c); s.plushMeshes.push(c); });
      s.cab.display.setText(`${won(data.price)}  x${keys.length}`);
      return;
    }
    const kind = m.kind || 'claw';
    if (kind === 'ufo'){ keys.slice(0,6).forEach((k, j) => { const mesh = buildPlushMesh(k); mesh.position.set(-m.w/2+0.3 + j*0.22, 0.4, 0); mesh.rotation.x = Math.PI/2; s.cab.interior.add(mesh); s.plushMeshes.push(mesh); }); }
    else if (kind === 'pusher'){ keys.slice(0,6).forEach((k, j) => { const mesh = buildPlushMesh(k); mesh.position.set(-m.w/2+0.25 + j*0.25, 0.48, -m.d/2+0.42); s.cab.interior.add(mesh); s.plushMeshes.push(mesh); }); }
    else {
      const x0 = kind === 'sweet' ? -m.w/2 + 0.9 : -m.w/2 + 0.2, x1 = m.w/2 - 0.2, z0 = -m.d/2 + 0.2, z1 = m.d/2 - 0.2;
      const cols = Math.max(1, Math.floor((x1 - x0)/0.28) + 1), rows = Math.max(1, Math.floor((z1 - z0)/0.28) + 1);
      keys.forEach((k, j) => {
        const mesh = buildPlushMesh(k);
        const col = j % cols, row = Math.floor(j/cols);
        const layer = Math.floor(row / rows), r2 = row % rows;
        let x = clamp(x0 + col*0.28 + rand(-0.03,0.03), x0, x1), z = clamp(z0 + r2*0.28 + rand(-0.03,0.03), z0, z1);
        if (kind !== 'sweet' && x < -m.w/2+CHUTE+0.1 && z > m.d/2-CHUTE-0.1) z = Math.max(z0, z - CHUTE);
        mesh.position.set(x, 0.14 + layer*0.28, z); mesh.rotation.y = rand(0, Math.PI*2);
        s.cab.interior.add(mesh); s.plushMeshes.push(mesh);
      });
    }
    s.cab.display.setText(data.broken ? 'ERROR' : `${won(data.price)}  PLAY ${data.stats.plays}`);
    s.cab.sign.setText(m.name);
  }
  canPlace(mId, x, z, rot, ignore=-1){
    const rect = slotRect({ machine:mId, x, z, rot }), F = this.F;
    if (rect.x0 < F.x0 || rect.x1 > F.x1 || rect.z0 < F.z0 || rect.z1 > F.z1) return false;
    const door = { x0:F.door.x0, x1:F.door.x1, z0:F.door.z0, z1:F.z1+1 };
    if (overlaps(rect, door)) return false;
    if (F.stairs && overlaps(rect, F.stairs, 0.1)) return false;
    if (this.propRects.some(r => overlaps(rect, r, 0.1))) return false;
    for (let i=0;i<this.save.slots.length;i++){ const d = this.save.slots[i]; if (!d || i === ignore || (d.floor||0) !== this.floor) continue; if (overlaps(rect, slotRect(d), 0.15)) return false; }
    return true;
  }
  pick(ndc){
    this.raycaster.setFromCamera(ndc, this.camera);
    const hits = this.raycaster.intersectObjects(this.scene.children, true);
    for (const h of hits){ if (h.object.userData.slot !== undefined) return h.object.userData.slot; if (h.object === this.floorMesh) break; }
    return null;
  }
  pickSign(ndc){
    this.raycaster.setFromCamera(ndc, this.camera);
    return this.sign.visible && this.raycaster.intersectObject(this.sign).length > 0;
  }
  pickFloor(ndc){
    this.raycaster.setFromCamera(ndc, this.camera);
    const p = new THREE.Vector3(); if (!this.raycaster.ray.intersectPlane(this.floorPlane, p)) return null;
    return { x:Math.round(p.x/GRID)*GRID, z:Math.round(p.z/GRID)*GRID };
  }
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
    const F = this.F, nx = Math.round((F.x1-F.x0)/GRID), nz = Math.round((F.z1-F.z0)/GRID);
    const blocked = new Uint8Array(nx*nz);
    const rects = this.save.slots.filter(d => d && (d.floor||0) === this.floor).map(d => slotRect(d));
    if (F.stairs) rects.push(F.stairs);
    rects.push(...this.propRects);
    for (let ix=0; ix<nx; ix++) for (let iz=0; iz<nz; iz++){
      const cx = F.x0 + (ix+0.5)*GRID, cz = F.z0 + (iz+0.5)*GRID;
      if (rects.some(r => cx > r.x0-0.2 && cx < r.x1+0.2 && cz > r.z0-0.2 && cz < r.z1+0.2)) blocked[ix + iz*nx] = 1;
    }
    this.nav = { nx, nz, blocked }; this.navVersion++;
  }
  cellOf(p){ const n = this.nav, F = this.F; return { ix:clamp(Math.floor((p.x-F.x0)/GRID), 0, n.nx-1), iz:clamp(Math.floor((p.z-F.z0)/GRID), 0, n.nz-1) }; }
  cellCenter(ix, iz){ return new THREE.Vector3(this.F.x0 + (ix+0.5)*GRID, 0, this.F.z0 + (iz+0.5)*GRID); }
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
        if (dx && dz && (n.blocked[key(cur.ix+dx, cur.iz)] || n.blocked[key(cur.ix, cur.iz+dz)])) continue;
        const ng = cur.g + Math.hypot(dx, dz), nk = key(ix, iz);
        if (ng < (gs.get(nk) ?? 1e9)){ gs.set(nk, ng); came.set(nk, ck); open.push({ ix, iz, g:ng, f:ng + h(ix, iz) }); }
      }
      if (closed.size > 2500) break;
    }
    if (!found) return [to.clone()];
    const cells = []; let k = key(found.ix, found.iz);
    while (k !== undefined){ cells.unshift(k); k = came.get(k); }
    let pts = cells.map(c => this.cellCenter(c % n.nx, Math.floor(c / n.nx)));
    pts.push(to.clone());
    const clear = (a, b) => { const st = Math.ceil(a.distanceTo(b)/0.2); for (let i=1;i<st;i++){ const p = a.clone().lerp(b, i/st); const c = this.cellOf(p); if (n.blocked[c.ix + c.iz*n.nx]) return false; } return true; };
    const out = [pts[0]]; let cur = 0;
    while (cur < pts.length-1){ let nxt = pts.length-1; while (nxt > cur+1 && !clear(pts[cur], pts[nxt])) nxt--; out.push(pts[nxt]); cur = nxt; }
    return out.slice(1).length ? out.slice(1) : [to.clone()];
  }
  walk(mv, dt, speed){
    if (!mv.path || mv.navV !== this.navVersion){ mv.path = this.findPath(mv.g.position, mv.target); mv.navV = this.navVersion; }
    const dst = mv.path[0];
    const dir = dst.clone().sub(mv.g.position); dir.y = 0; const dist = dir.length();
    if (dist < 0.06){ mv.path.shift(); if (!mv.path.length) return true; return false; }
    dir.normalize(); mv.g.position.add(dir.multiplyScalar(Math.min(dist, speed*dt)));
    mv.g.rotation.y = Math.atan2(dir.x, dir.z);
    this.setAnim(mv.g, speed > 1.5 ? 'sprint' : 'walk', { speed: speed > 1.5 ? 1 : Math.max(0.8, speed/1.1) });
    return false;
  }

  // ---------- 직원 ----------
  hasStaff(id){ return !!(this.save.staff && this.save.staff[id]); }
  promoMult(){ const p = this.save.promo; let m = (p && p.until > Date.now()) ? p.mult : 1; if (this.hasStaff('barker')) m *= 1.25; return m; }
  rebuildStaff(){
    this.staffFigs.forEach(f => this.scene.remove(f)); this.staffFigs = [];
    if (this.floor > 0) return;
    const F = this.F; let i = 0;
    STAFF.forEach(st => {
      if (!this.hasStaff(st.id)) return;
      const g = this.makePerson('arcade-character-employee'); g.position.set(F.x0 + 0.9 + i*0.7, 0, F.z0 + 0.6); g.rotation.y = 0; this.setAnim(g, 'idle');
      const tag = makeTextSprite(`${st.icon} ${st.name}`, { size:56, color:'#241c2e', bg:'rgba(255,255,255,0.92)', width:512, height:128 }); tag.scale.set(0.9, 0.22, 1); tag.position.y = 1.15; g.add(tag);
      this.staffFigs.push(g); i++;
    });
  }
  simStaff(dt){
    const S = this.save;
    S.staffT = (S.staffT || 0) + dt;
    if (S.staffT >= 60){ S.staffT = 0; const wage = STAFF.filter(st => this.hasStaff(st.id)).reduce((a,st)=>a+st.wage, 0); if (wage > 0){ if (S.money >= wage){ S.money -= wage; S.stats.wages = (S.stats.wages||0) + wage; } else { S.staff = {}; this.rebuildStaff(); this.hooks.toast('돈이 없어서 직원이 전부 그만뒀다...'); } this.hooks.onChange(); } }
    // 알바: 20초마다 창고 → 기계 보충
    if (this.hasStaff('alba')){ S.albaT = (S.albaT || 0) + dt; if (S.albaT >= 20){ S.albaT = 0; this.autoRestock(); } }
    // 청소: 평점 회복, 화장실 청소
    if (this.hasStaff('cleaner')){ if ((S.rep ?? 3) < 3.5) S.rep = Math.min(3.5, S.rep + 0.01*dt/6); S.toiletDirt = Math.max(0, (S.toiletDirt||0) - dt*0.2); }
    // 기술자: 고장 자동 수리
    if (this.hasStaff('tech')){ S.slots.forEach((d, i) => { if (!d || !d.broken) return; d.repairT = (d.repairT || 0) + dt; if (d.repairT >= 30){ const bd = bdDef(d.broken); S.money -= Math.round(bd.repair*0.5); d.broken = null; d.cond = 100; d.repairT = 0; this.refreshStock(i); this.hooks.toast(`🔧 기술자가 ${machineDef(d.machine).name}을(를) 고쳤다 (${won(bd.repair*0.5)})`); this.hooks.onChange(); } }); }
  }
  autoRestock(){
    const S = this.save; let moved = 0;
    S.slots.forEach((d, i) => {
      if (!d) return; const m = machineDef(d.machine); if (m.type === 'facility') return;
      let total = Object.values(d.stock).reduce((a,b)=>a+b,0);
      const wantBox = m.kind === 'ufo' || m.kind === 'pusher';
      const keys = Object.keys(S.inv).filter(k => S.inv[k] > 0).filter(k => m.type === 'gacha' ? true : wantBox ? !isPlush(k) : (m.kind === 'mini' ? PLUSH_TYPES[k].size ? PLUSH_TYPES[k].size < 0.9 : true : true));
      for (const k of keys){ while (total < m.capacity && S.inv[k] > 0){ S.inv[k]--; if (S.inv[k] <= 0) delete S.inv[k]; d.stock[k] = (d.stock[k]||0)+1; total++; moved++; } if (total >= m.capacity) break; }
      if (moved) this.refreshStock(i);
    });
    if (moved){ this.hooks.toast(`🧑‍🔧 알바가 상품 ${moved}개를 채웠다`); this.hooks.onChange(); }
  }

  // ---------- 경제 시뮬 ----------
  sim(dt, visuals){
    this.simStaff(dt);
    this.save.slots.forEach((data, i) => {
      if (!data) return;
      const eco = slotEconomy(data, this.save.rep, this.promoMult());
      if (eco.facility){ if (eco.kind === 'vending'){ data.vendT = (data.vendT||0) + dt; if (data.vendT >= 10){ data.vendT = 0; const n = this.customers.length + this.wanderers.length; if (n > 0 && Math.random() < 0.6){ const inc = 1500 + 300*Math.min(n, 10); this.save.money += inc; data.stats.revenue += inc; if (visuals && this.slots[i] && this.onFloor(i)) this.hooks.floatText(new THREE.Vector3(data.x, 2.2, data.z), '+' + won(inc), 'money'); this.hooks.onChange(); } } } return; }
      if (eco.total <= 0 || eco.rate <= 0) return;
      if (Math.random() < eco.rate/60*dt && this.customers.length < 18){
        const apply = () => this.customerPlay(i);
        if (visuals && this.slots[i] && this.onFloor(i)) this.spawnCustomer(i, apply); else apply();
      }
    });
  }
  customerPlay(i){
    const data = this.save.slots[i]; if (!data) return null;
    const eco = slotEconomy(data); if (eco.total <= 0) return null;
    const gain = Math.round(data.price * eco.revMult);
    this.save.money += gain; data.stats.plays++; data.stats.revenue += gain;
    data.pityCount = (data.pityCount||0) + 1;
    // 마모 → 고장
    data.cond = (data.cond ?? 100) - (this.hasStaff('tech') ? 0.35 : 0.7);
    let justBroke = false;
    if (!data.broken && data.cond < 35 && Math.random() < 0.03){ data.broken = BREAKDOWNS[Math.floor(Math.random()*BREAKDOWNS.length)].id; justBroke = true; data.repairT = 0; this.refreshStock(i); this.hooks.onChange(); }
    let win = Math.random() < eco.winRate;
    if (!eco.gacha && data.pity && data.pityCount >= data.pity){ win = true; }
    let key = null, complaint = false, call = false;
    const rep = this.save.rep ?? 3;
    if (data.broken){
      const bd = bdDef(data.broken);
      if (bd.eats){ win = false; complaint = Math.random() < 0.5; call = Math.random() < 0.3; }
      this.save.rep = Math.max(1, rep - 0.02);
      if (Math.random() < 0.15) this.addReview('broken', null, 1, machineDef(data.machine).name);
    }
    if (eco.gacha){
      if (data.price > eco.avg*1.1 && Math.random() < 0.25){ complaint = true; this.save.rep = Math.max(1, rep - 0.05); this.addReview('rip', null, 1); }
      else this.save.rep = Math.min(5, rep + 0.008);
    } else if (win) this.save.rep = Math.min(5, rep + 0.03);
    else if (!data.broken) {
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
      if (this.slots[i]?.cab && !this.slots[i].cab.isFacility) this.slots[i].cab.display.setText(data.broken ? 'ERROR' : `${won(data.price)}  PLAY ${data.stats.plays}`);
      const anyKey = Object.keys(data.stock)[0];
      if (complaint && !data.broken) this.addReview('complaint', anyKey, 1);
      else if (!data.broken && Math.random() < 0.08) this.addReview('lose', anyKey, 2 + Math.floor(Math.random()*2));
    }
    this.hooks.onChange();
    if (call && this.hooks.onCall) this.hooks.onCall(i, data.price);
    return { win, key, price:gain, complaint, broken:!!data.broken, justBroke };
  }
  setAnim(g, name, opts){ if (g.userData.model) playAnim(g.userData.model, name, opts); }
  makePerson(force){
    const g = new THREE.Group();
    const name = force || CHARACTERS[Math.floor(Math.random()*CHARACTERS.length)];
    const model = spawn(name);
    if (model){
      fitHeight(model, rand(0.92, 1.06)); g.add(model); g.userData.model = model; playAnim(model, 'idle');
      g.position.copy(this.DOOR).add(new THREE.Vector3(rand(-0.5,0.5), 0, rand(0, 0.3)));
      this.scene.add(g); return g;
    }
    const c = PASTELS[Math.floor(Math.random()*PASTELS.length)];
    g.scale.setScalar(rand(0.85, 1.1));
    g.add(cyl(0.13, 0.16, 0.42, c, 0, 0.36, 0, 8));
    g.add(sphere(0.13, [0xffd9b3, 0xf1c8a0, 0xd9a577][Math.floor(Math.random()*3)], 0, 0.72, 0));
    g.add(sphere(0.135, [0x3b2a1e, 0x1e1e26, 0x9b6b3d, 0xd88aa6, 0xe8c07a][Math.floor(Math.random()*5)], 0, 0.78, -0.02, 1, 0.7, 1));
    [-1,1].forEach(sg => g.add(sphere(0.02, 0x1c1c22, sg*0.045, 0.73, 0.115)));
    [-1,1].forEach(sg => g.add(cyl(0.04, 0.04, 0.3, [0x5566aa, 0x333344, 0x88aa66][Math.floor(Math.random()*3)], sg*0.07, 0.15, 0, 6)));
    g.position.copy(this.DOOR).add(new THREE.Vector3(rand(-0.5,0.5), 0, rand(0, 0.3)));
    this.scene.add(g);
    return g;
  }
  say(g, kind, key){
    if (!this.hooks.say) return;
    let pool = BUBBLES[kind], k = key;
    if (kind === 'wander'){
      // 실제 상황 기반: 이 층의 재고·고장·가격·붐빔·화장실
      const here = this.save.slots.map((d,i)=>({d,i})).filter(x => x.d && (x.d.floor||0) === this.floor && machineDef(x.d.machine).type !== 'facility');
      const stocked = here.filter(x => Object.values(x.d.stock).some(n => n > 0));
      const broken = here.filter(x => x.d.broken);
      const r = Math.random();
      if (broken.length && r < 0.2) pool = BUBBLES.wanderBroken;
      else if ((this.save.toiletDirt||0) > 15 && this.facilitySlots('toilet').length && r < 0.32) pool = BUBBLES.toiletDirty;
      else if (!stocked.length) pool = BUBBLES.wanderEmpty;
      else {
        const x = stocked[Math.floor(Math.random()*stocked.length)];
        const keys = Object.keys(x.d.stock).filter(kk => x.d.stock[kk] > 0); k = keys[Math.floor(Math.random()*keys.length)];
        const eco = slotEconomy(x.d, this.save.rep);
        const n = this.customers.length + this.wanderers.length;
        if (eco.fairness < 0.25 && r < 0.6) pool = BUBBLES.wanderPricey;
        else if (eco.fairness > 1.2 && r < 0.6) pool = BUBBLES.wanderCheap;
        else if (n >= 12 && r < 0.75) pool = BUBBLES.wanderCrowd;
        else if (n <= 2 && r < 0.75) pool = BUBBLES.wanderQuiet;
        else if ((this.save.floors||1) > 1 && this.floor === 0 && r < 0.85) pool = BUBBLES.stairs;
        else pool = BUBBLES.wanderItem;
      }
    }
    if (!pool) return;
    const t = pool[Math.floor(Math.random()*pool.length)].replace(/\{item\}/g, k ? PLUSH_TYPES[k].name : '인형');
    this.hooks.say(g, t, kind === 'angry' ? 'angry' : kind === 'win' ? 'win' : '');
  }
  addReview(kind, key, stars, machineName){
    const pool = REVIEWS[kind]; if (!pool) return;
    const item = key ? PLUSH_TYPES[key].name : '인형';
    const pick = kind === 'toilet' ? (stars >= 4 ? pool[Math.random() < 0.5 ? 0 : 1] : pool[2]) : pool[Math.floor(Math.random()*pool.length)];
    const text = pick.replace(/\{item\}/g, item).replace(/\{machine\}/g, machineName || '기계');
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
  facilitySlots(kind){ return this.slots.map((s,i)=>s?i:-1).filter(i => i>=0 && machineDef(this.save.slots[i].machine).kind === kind); }
  wanderTarget(w){
    const idx = this.slots.map((s,i)=>s?i:-1).filter(i=>i>=0 && machineDef(this.save.slots[i].machine).type !== 'facility');
    const toilets = this.facilitySlots('toilet'), benches = this.facilitySlots('bench');
    const r = Math.random();
    if (w && toilets.length && r < 0.12){ w.visit = { kind:'toilet', i:toilets[Math.floor(Math.random()*toilets.length)] }; return this.standPos(w.visit.i, 0.05, 0); }
    if (w && benches.length && r < 0.3){ w.visit = { kind:'bench', i:benches[Math.floor(Math.random()*benches.length)] }; const d = this.save.slots[w.visit.i]; const a = (d.rot||0)*Math.PI/2; return new THREE.Vector3(d.x + Math.sin(a)*0.12 + Math.cos(a)*rand(-0.4,0.4), 0, d.z + Math.cos(a)*0.12 - Math.sin(a)*rand(-0.4,0.4)); }
    if (idx.length && r < 0.75){ const i = idx[Math.floor(Math.random()*idx.length)]; return this.standPos(i, rand(0.3, 1.2), rand(-0.9, 0.9)); }
    const F = this.F; return new THREE.Vector3(rand(F.x0+0.5, F.x1-0.5), 0, rand(F.z0+0.6, F.z1-0.6));
  }
  updateWanderers(dt){
    const machines = this.save.slots.filter(d => d && machineDef(d.machine).type !== 'facility').length;
    const benches = this.facilitySlots('bench').length;
    const want = machines === 0 ? 0 : Math.min(20, Math.round((1 + machines*1.5 + (this.save.rep ?? 3)*1.2 + benches*2) * Math.min(1.8, this.promoMult())));
    this.wanderT = (this.wanderT || 0) + dt;
    if (this.wanderers.length < want && this.wanderT > 0.8){ this.wanderT = 0; const w = { g:this.makePerson(), target:null, wait:0, t:rand(0,10), speed:rand(0.8, 1.3), leaving:false, path:null, sayT:rand(5,20) }; w.target = this.wanderTarget(w); this.wanderers.push(w); }
    if (this.wanderers.length > want && this.wanderT > 0.8){ this.wanderT = 0; const w = this.wanderers.find(x => !x.leaving && !x.visit); if (w){ w.leaving = true; w.target = this.DOOR.clone(); w.path = null; w.wait = 0; } }
    for (let k=this.wanderers.length-1; k>=0; k--){
      const w = this.wanderers[k]; w.t += dt; w.sayT -= dt;
      if (w.sayT <= 0 && !w.leaving && w.g.visible){ w.sayT = rand(12, 30); if (Math.random() < 0.5) this.say(w.g, 'wander'); }
      tickAnim(w.g.userData.model, dt);
      if (w.wait > 0){
        w.wait -= dt; w.g.position.y = w.sitting ? -0.02 : (w.g.userData.model ? 0 : Math.abs(Math.sin(w.t*2))*0.01);
        this.setAnim(w.g, w.sitting ? 'sit' : 'idle');
        if (w.wait <= 0 && w.visit){
          if (w.visit.kind === 'toilet'){ w.g.visible = true; const s = this.slots[w.visit.i]; if (s?.cab?.door) s.cab.door.rotation.y = 0; this.save.toiletDirt = (this.save.toiletDirt||0) + 1; const dirty = this.save.toiletDirt > 15; this.save.rep = clamp((this.save.rep??3) + (dirty ? -0.01 : 0.012), 1, 5); if (Math.random() < 0.25) this.addReview('toilet', null, dirty ? 2 : 5); if (dirty && this.save.reviews) { /* 더러운 화장실 리뷰는 index 2 */ } this.say(w.g, 'toilet'); }
          if (w.visit.kind === 'bench'){ w.sitting = false; w.g.position.y = 0; }
          w.visit = null; w.target = this.wanderTarget(w); w.path = null;
        }
        continue;
      }
      if (this.walk(w, dt, w.speed)){
        if (w.leaving){ this.scene.remove(w.g); this.wanderers.splice(k,1); continue; }
        if (w.visit && w.visit.kind === 'toilet'){ const s = this.slots[w.visit.i]; if (s?.cab?.door) s.cab.door.rotation.y = -1.6; w.g.visible = false; w.wait = rand(3, 5); continue; }
        if (w.visit && w.visit.kind === 'bench'){ w.sitting = true; const d = this.save.slots[w.visit.i]; w.g.rotation.y = (d.rot||0)*Math.PI/2; w.wait = rand(4, 9); continue; }
        w.wait = rand(1.5, 5); w.target = this.wanderTarget(w); w.path = null;
      } else if (!w.g.userData.model) w.g.position.y = Math.abs(Math.sin(w.t*9))*0.035;
    }
    this.staffFigs.forEach(f => tickAnim(f.userData.model, dt));
  }
  update(dt){
    for (let k=this.customers.length-1; k>=0; k--){
      const cu = this.customers[k]; cu.t += dt;
      const bob = cu.g.userData.model ? 0 : Math.abs(Math.sin(cu.t*10))*0.04;
      tickAnim(cu.g.userData.model, dt);
      if (cu.phase === 'in' || cu.phase === 'out'){
        if (cu.phase === 'out' && !cu.target.equals(this.DOOR)){ cu.target = this.DOOR.clone(); cu.path = null; }
        if (this.walk(cu, dt, cu.speed||1.7)){
          if (cu.phase === 'in'){ cu.phase = 'play'; cu.wait = 2.2 + Math.random(); const d = this.save.slots[cu.i]; if (d) cu.g.rotation.y = (d.rot||0)*Math.PI/2 + Math.PI; this.setAnim(cu.g, 'interact-right'); }
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
            if (res.win){ this.hooks.floatText(pos.clone().add(new THREE.Vector3(0,0.35,0)), '🎉 ' + PLUSH_TYPES[res.key].name + ' 당첨!', 'win'); this.say(cu.g, 'win', res.key); this.setAnim(cu.g, 'emote-yes', { loop:false }); cu.react = 1.2; }
            else if (res.complaint || res.broken){ this.hooks.floatText(pos.clone().add(new THREE.Vector3(0,0.35,0)), res.broken ? '😡 고장 났잖아!!' : '😡 너무해!! 집게 뭐야', 'bad'); this.say(cu.g, 'angry'); this.setAnim(cu.g, 'attack-kick-right', { loop:false }); cu.react = 1.0; }
            else if (Math.random() < 0.45){ this.setAnim(cu.g, 'emote-no', { loop:false }); cu.react = 1.0; const d = this.save.slots[cu.i]; const ks = d ? Object.keys(d.stock).filter(kk => d.stock[kk] > 0) : []; this.say(cu.g, 'lose', ks.length ? ks[Math.floor(Math.random()*ks.length)] : null); }
          }
          if (s && s.cab && s.cab.claw){ const m = machineDef(this.save.slots[cu.i]?.machine); if (m) placeClaw(s.cab, -m.w/2+CHUTE/2, m.h-0.24, m.d/2-CHUTE/2); }
          cu.phase = 'react'; cu.wait = cu.react || 0.3;
        }
      } else if (cu.phase === 'react'){
        cu.wait -= dt;
        if (cu.wait <= 0){
          if (Math.random() < 0.4){ const w = { g:cu.g, target:null, wait:0, t:cu.t, speed:rand(0.8,1.3), leaving:false, path:null, sayT:rand(8,20) }; w.target = this.wanderTarget(w); this.wanderers.push(w); this.customers.splice(k,1); continue; }
          cu.phase = 'out'; cu.target = this.DOOR.clone(); cu.path = null;
        }
      }
    }
    this.updateWanderers(dt);
    const tt = performance.now()/1000;
    this.slots.forEach(s => { if (!s || !s.cab) return; if (s.cab.plate) s.cab.plate.position.z = -machineDef(this.save.slots[s.i].machine).d/2 + 0.02 + 0.25 + 0.16*(1+Math.sin(tt*1.85)); const broken = !!this.save.slots[s.i]?.broken; s.cab.lights.forEach((l,i) => { l.material.emissiveIntensity = broken ? (Math.random() < 0.1 ? 1 : 0.05) : ((Math.floor(tt*3)+i)%2 ? 1 : 0.15); }); });
  }
}
