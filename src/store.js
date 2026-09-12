import * as THREE from 'three';
import { PLUSH_TYPES, RARITY, MY_MACHINES, SLOT_POS, CUSTOMER_WINRATE, GRIP_PRESETS, won } from './data.js';
import { buildPlushMesh } from './plush.js';
import { buildCabinet, placeClaw, setClawOpen, BASE_H, CHUTE } from './machine.js';
import { box, cyl, sphere, mat, makeTextSprite, rand, lerp, clamp } from './util.js';
import { sfx } from './audio.js';

const DOOR = new THREE.Vector3(0, 0, 4.6);
const PASTELS = [0xffb3c6, 0xa0d8ff, 0xc3f0a8, 0xffe08a, 0xd9b8ff, 0xffc39a];

// 슬롯 하나의 수익 정보
export function slotEconomy(slot, rep){
  const m = MY_MACHINES.find(x => x.id === slot.machine);
  const total = Object.values(slot.stock).reduce((a,b)=>a+b, 0);
  let avg = 0;
  if (total > 0){
    let sum = 0; for (const [k,n] of Object.entries(slot.stock)) sum += RARITY[PLUSH_TYPES[k].rarity].value * n;
    avg = sum/total;
  }
  const winRate = CUSTOMER_WINRATE[slot.grip] * ((slot.clawSize||1) < 1 ? 0.6 : 1) + (slot.pity ? 1/slot.pity : 0);
  const ev = winRate * avg;                       // 손님 기대값
  const fairness = slot.price > 0 ? ev/slot.price : 0;
  const repMult = 0.35 + 0.65*((rep ?? 3)/5);     // 평점 낮으면 손님이 안 온다
  const mult = total > 0 ? clamp(fairness*2.5, 0.03, 2.5) * repMult : 0;
  const rate = m.baseRate * mult;                 // 손님/분
  return { m, total, avg, winRate, ev, fairness, rate, repMult, profitPerMin: rate*(slot.price - winRate*avg) };
}

export class StoreScene {
  constructor(save, hooks){
    this.save = save; this.hooks = hooks; // hooks: { onChange(), floatText(pos, text, cls) }
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xffe9f0);
    this.scene.fog = new THREE.Fog(0xffe9f0, 12, 22);
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 60);
    this.camera.position.set(0, 6.2, 8.2); this.camera.lookAt(0, 0.9, -0.2);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xffc0cb, 0.9));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4); sun.position.set(4, 9, 5); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left:-8, right:8, top:8, bottom:-8, near:1, far:30 });
    this.scene.add(sun);
    // 바닥/벽
    const floor = box(11, 0.1, 9, 0xf7d9b5, 0, -0.05, 0.4); floor.receiveShadow = true; this.scene.add(floor);
    // 타일 무늬
    for (let x=-5; x<=5; x++) for (let z=-4; z<=4; z++) if ((x+z)%2===0){ const t = box(0.98, 0.012, 0.98, 0xfbe4c8, x, 0.006, z+0.4); t.receiveShadow = true; this.scene.add(t); }
    this.scene.add(box(11, 3.2, 0.2, 0xcfe8ff, 0, 1.6, -4.0));
    this.scene.add(box(0.2, 3.2, 9, 0xcfe8ff, -5.5, 1.6, 0.4));
    this.scene.add(box(0.2, 3.2, 9, 0xcfe8ff, 5.5, 1.6, 0.4));
    // 간판 + 문
    const sign = makeTextSprite('🧸 내 인형뽑기 가게', { size:64, color:'#ff4f8b', bg:'rgba(255,255,255,0.9)', width:768, height:128 });
    sign.scale.set(4.2, 0.7, 1); sign.position.set(0, 2.6, -3.85); this.scene.add(sign);
    this.scene.add(box(1.4, 0.06, 0.8, 0xff8fab, 0, 0.03, 4.4));
    const mat_ = makeTextSprite('입구', { size:56, color:'#fff', bg:null }); mat_.scale.set(1, 0.25, 1); mat_.position.set(0, 0.12, 4.4); this.scene.add(mat_);
    // 슬롯
    this.slots = SLOT_POS.map(([x,z], i) => {
      const pad = cyl(1.0, 1.0, 0.04, 0xffffff, x, 0.02, z, 24); pad.receiveShadow = true; pad.userData.slot = i; this.scene.add(pad);
      const label = makeTextSprite('빈 자리\n클릭해서 구매', { size:44, color:'#ff4f8b', bg:'rgba(255,255,255,0.85)', width:384, height:160 });
      label.scale.set(1.5, 0.62, 1); label.position.set(x, 0.9, z); this.scene.add(label);
      return { i, x, z, pad, label, cab:null, plushMeshes:[], clawT:rand(0,10) };
    });
    this.customers = []; this.wanderers = []; this.acc = 0;
    this.raycaster = new THREE.Raycaster();
    this.slots.forEach((_, i) => this.rebuildSlot(i));
  }
  resize(w, h){ this.camera.aspect = w/h; this.camera.updateProjectionMatrix(); }

  rebuildSlot(i){
    const s = this.slots[i], data = this.save.slots[i];
    if (s.cab){ this.scene.remove(s.cab.root); s.cab = null; }
    s.plushMeshes = [];
    if (!data){ s.label.visible = true; s.pad.visible = true; return; }
    const m = MY_MACHINES.find(x => x.id === data.machine);
    const spec = { ...m, name:m.name, clawSize:1 };
    const cab = buildCabinet(spec);
    cab.root.position.set(s.x, 0, s.z);
    cab.root.traverse(o => { o.userData.slot = i; });
    this.scene.add(cab.root); s.cab = cab;
    s.label.visible = false; s.pad.visible = false;
    setClawOpen(cab, 1); placeClaw(cab, -m.w/2+CHUTE/2, m.h-0.24, m.d/2-CHUTE/2);
    this.refreshStock(i);
  }
  // 재고 인형을 정적으로 배치
  refreshStock(i){
    const s = this.slots[i], data = this.save.slots[i]; if (!s.cab || !data) return;
    s.plushMeshes.forEach(m => s.cab.interior.remove(m)); s.plushMeshes = [];
    const m = MY_MACHINES.find(x => x.id === data.machine);
    const keys = []; for (const [k,n] of Object.entries(data.stock)) for (let j=0;j<n;j++) keys.push(k);
    const cols = Math.max(2, Math.floor((m.w-0.3)/0.3));
    keys.forEach((k, j) => {
      const mesh = buildPlushMesh(k);
      const col = j % cols, row = Math.floor(j/cols);
      const layer = Math.floor(row / Math.max(1, Math.floor((m.d-0.2)/0.3)));
      const r2 = row % Math.max(1, Math.floor((m.d-0.2)/0.3));
      let x = -m.w/2 + 0.2 + col*0.3 + rand(-0.03,0.03), z = -m.d/2 + 0.2 + r2*0.3 + rand(-0.03,0.03);
      if (x < -m.w/2+CHUTE+0.1 && z > m.d/2-CHUTE-0.1) z -= CHUTE;
      mesh.position.set(x, 0.14 + layer*0.28, z); mesh.rotation.y = rand(0, Math.PI*2);
      s.cab.interior.add(mesh); s.plushMeshes.push(mesh);
    });
    const eco = slotEconomy(data);
    s.cab.display.setText(`${won(data.price)}  PLAY ${data.stats.plays}`);
    s.cab.sign.setText(m.name);
  }
  pick(ndc){
    this.raycaster.setFromCamera(ndc, this.camera);
    const hits = this.raycaster.intersectObjects(this.scene.children, true);
    for (const h of hits){ if (h.object.userData.slot !== undefined) return h.object.userData.slot; }
    return null;
  }
  // ---------- 경제 시뮬 ----------
  sim(dt, visuals){
    this.save.slots.forEach((data, i) => {
      if (!data) return;
      const eco = slotEconomy(data, this.save.rep);
      if (eco.total <= 0 || eco.rate <= 0) return;
      if (Math.random() < eco.rate/60*dt && this.customers.length < 18){
        const apply = () => this.customerPlay(i);
        if (visuals) this.spawnCustomer(i, apply); else apply();
      }
    });
  }
  customerPlay(i){
    const data = this.save.slots[i]; if (!data) return null;
    const eco = slotEconomy(data); if (eco.total <= 0) return null;
    this.save.money += data.price; data.stats.plays++; data.stats.revenue += data.price;
    data.pityCount = (data.pityCount||0) + 1;
    let win = Math.random() < CUSTOMER_WINRATE[data.grip] * ((data.clawSize||1) < 1 ? 0.6 : 1);
    if (data.pity && data.pityCount >= data.pity){ win = true; }
    let key = null, complaint = false;
    // 평점: 당첨이면 오르고, 꽝이면 조금 내림. 너무해(느슨) 세팅은 불만이 터진다
    const rep = this.save.rep ?? 3;
    if (win) this.save.rep = Math.min(5, rep + 0.03);
    else {
      let d = data.grip === 'loose' ? 0.012 : data.grip === 'strong' ? 0.003 : 0.006;
      if (data.grip === 'loose' && Math.random() < 0.1){ complaint = true; d += 0.08; }
      this.save.rep = Math.max(1, rep - d);
    }
    if (win){
      data.pityCount = 0;
      const keys = Object.keys(data.stock).filter(k => data.stock[k] > 0);
      key = keys[Math.floor(Math.random()*keys.length)];
      data.stock[key]--; if (data.stock[key] <= 0) delete data.stock[key];
      data.stats.wins++;
      this.refreshStock(i);
    } else if (this.slots[i].cab) this.slots[i].cab.display.setText(`${won(data.price)}  PLAY ${data.stats.plays}`);
    this.hooks.onChange();
    return { win, key, price:data.price, complaint };
  }
  makePerson(){
    const g = new THREE.Group();
    const c = PASTELS[Math.floor(Math.random()*PASTELS.length)];
    const sc = rand(0.85, 1.1); g.scale.setScalar(sc);
    g.add(cyl(0.13, 0.16, 0.42, c, 0, 0.36, 0, 8));
    g.add(sphere(0.13, [0xffd9b3, 0xf1c8a0, 0xd9a577][Math.floor(Math.random()*3)], 0, 0.72, 0));
    g.add(sphere(0.135, [0x3b2a1e, 0x1e1e26, 0x9b6b3d, 0xd88aa6, 0xe8c07a][Math.floor(Math.random()*5)], 0, 0.78, -0.02, 1, 0.7, 1));
    [-1,1].forEach(sg => g.add(sphere(0.02, 0x1c1c22, sg*0.045, 0.73, 0.115)));
    [-1,1].forEach(sg => g.add(cyl(0.04, 0.04, 0.3, [0x5566aa, 0x333344, 0x88aa66][Math.floor(Math.random()*3)], sg*0.07, 0.15, 0, 6)));
    g.position.copy(DOOR).add(new THREE.Vector3(rand(-0.5,0.5), 0, rand(0, 0.3)));
    this.scene.add(g);
    return g;
  }
  spawnCustomer(i, apply){
    const s = this.slots[i], data = this.save.slots[i];
    const m = MY_MACHINES.find(x => x.id === data.machine);
    const g = this.makePerson();
    // 같은 기계에 이미 온 손님이 있으면 뒤에 줄 선다
    const ahead = this.customers.filter(c => c.i === i && c.phase !== 'out').length;
    const target = new THREE.Vector3(s.x + rand(-0.15,0.15) + (ahead%2 ? 0.25 : -0.25)*(ahead>0), 0, s.z + m.d/2 + 0.55 + ahead*0.45);
    this.customers.push({ g, i, apply, phase:'in', target, wait:0, t:0, speed:rand(1.4, 2.0) });
  }
  // 구경꾼: 놀지는 않고 가게 안을 돌아다닌다. 평점·기계 수에 비례
  wanderTarget(){
    const slots = this.slots.filter(s => s.cab);
    if (slots.length && Math.random() < 0.7){ const s = slots[Math.floor(Math.random()*slots.length)]; return new THREE.Vector3(s.x + rand(-0.8, 0.8), 0, s.z + 1.0 + rand(0.2, 0.9)); }
    return new THREE.Vector3(rand(-4.5, 4.5), 0, rand(-0.6, 3.8));
  }
  updateWanderers(dt){
    const machines = this.save.slots.filter(Boolean).length;
    const want = machines === 0 ? 0 : Math.min(14, Math.round(1 + machines*1.5 + (this.save.rep ?? 3)*1.2));
    this.wanderT = (this.wanderT || 0) + dt;
    if (this.wanderers.length < want && this.wanderT > 0.8){ this.wanderT = 0; this.wanderers.push({ g:this.makePerson(), target:this.wanderTarget(), wait:0, t:rand(0,10), speed:rand(0.8, 1.3), leaving:false }); }
    if (this.wanderers.length > want && this.wanderT > 0.8){ this.wanderT = 0; const w = this.wanderers.find(x => !x.leaving); if (w){ w.leaving = true; w.target = DOOR.clone(); w.wait = 0; } }
    for (let k=this.wanderers.length-1; k>=0; k--){
      const w = this.wanderers[k]; w.t += dt;
      if (w.wait > 0){ w.wait -= dt; w.g.position.y = Math.abs(Math.sin(w.t*2))*0.01; continue; }
      const dir = w.target.clone().sub(w.g.position); dir.y = 0; const dist = dir.length();
      if (dist < 0.08){
        if (w.leaving){ this.scene.remove(w.g); this.wanderers.splice(k,1); continue; }
        w.wait = rand(1.5, 5); w.target = this.wanderTarget();
      } else {
        dir.normalize(); w.g.position.add(dir.multiplyScalar(Math.min(dist, w.speed*dt)));
        w.g.rotation.y = Math.atan2(dir.x, dir.z) + Math.PI; w.g.position.y = Math.abs(Math.sin(w.t*9))*0.035;
      }
    }
  }
  update(dt){
    // 손님
    for (let k=this.customers.length-1; k>=0; k--){
      const cu = this.customers[k]; cu.t += dt;
      const bob = Math.abs(Math.sin(cu.t*10))*0.04;
      if (cu.phase === 'in' || cu.phase === 'out'){
        const dst = cu.phase === 'in' ? cu.target : DOOR;
        const dir = dst.clone().sub(cu.g.position); dir.y = 0; const dist = dir.length();
        if (dist < 0.05){
          if (cu.phase === 'in'){ cu.phase = 'play'; cu.wait = 2.2 + Math.random(); cu.g.rotation.y = 0; }
          else { this.scene.remove(cu.g); this.customers.splice(k,1); continue; }
        } else {
          dir.normalize(); cu.g.position.add(dir.multiplyScalar(Math.min(dist, (cu.speed||1.7)*dt)));
          cu.g.rotation.y = Math.atan2(dir.x, dir.z) + Math.PI; cu.g.position.y = bob;
        }
      } else if (cu.phase === 'play'){
        cu.wait -= dt; cu.g.position.y = bob*0.3;
        const s = this.slots[cu.i];
        if (s.cab){ const m = MY_MACHINES.find(x => x.id === this.save.slots[cu.i]?.machine); if (m){ const p = 0.5+0.5*Math.sin(cu.t*3); placeClaw(s.cab, lerp(-m.w/4, m.w/4, p), m.h-0.24 - Math.max(0, Math.sin(cu.t*2))*0.4, lerp(-m.d/4, m.d/4, 0.5+0.5*Math.cos(cu.t*2)), 0); } }
        if (cu.wait <= 0){
          const res = cu.apply();
          const pos = cu.g.position.clone().add(new THREE.Vector3(0, 1.3, 0));
          if (res){
            this.hooks.floatText(pos, '+' + won(res.price), 'money'); sfx.cash();
            if (res.win) this.hooks.floatText(pos.clone().add(new THREE.Vector3(0,0.35,0)), '🎉 ' + PLUSH_TYPES[res.key].name + ' 당첨!', 'win');
            else if (res.complaint) this.hooks.floatText(pos.clone().add(new THREE.Vector3(0,0.35,0)), '😡 너무해!! 집게 뭐야', 'bad');
          }
          cu.phase = 'out';
          if (Math.random() < 0.4){ this.wanderers.push({ g:cu.g, target:this.wanderTarget(), wait:0, t:cu.t, speed:rand(0.8,1.3), leaving:false }); this.customers.splice(k,1); if (s.cab){ const m2 = MY_MACHINES.find(x => x.id === this.save.slots[cu.i]?.machine); if (m2) placeClaw(s.cab, -m2.w/2+CHUTE/2, m2.h-0.24, m2.d/2-CHUTE/2); } continue; }
          if (s.cab){ const m = MY_MACHINES.find(x => x.id === this.save.slots[cu.i]?.machine); if (m) placeClaw(s.cab, -m.w/2+CHUTE/2, m.h-0.24, m.d/2-CHUTE/2); }
        }
      }
    }
    this.updateWanderers(dt);
    // 조명
    const tt = performance.now()/1000;
    this.slots.forEach(s => { if (s.cab) s.cab.lights.forEach((l,i) => { l.material.emissiveIntensity = (Math.floor(tt*3)+i)%2 ? 1 : 0.15; }); });
  }
}
