import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { PLUSH_TYPES, GRIP_PRESETS, poolWeights, pickWeighted } from './data.js';
import { buildPlushMesh, makePlushBody, plushRadius, plushTop } from './plush.js';
import { box, cyl, sphere, mat, makeTextSprite, clamp, rand } from './util.js';
import { sfx } from './audio.js';

export const BASE_H = 0.9;   // 캐비닛 받침 높이 (내부 바닥 = 월드 y BASE_H)
export const CHUTE = 0.42;   // 상품구 한 변
const TRIM = 0.12;

// ---------- 캐비닛 메시 (플레이/가게 공용) ----------
export function buildCabinet(spec){
  const { w, d, h, color } = spec;
  const cs = spec.clawSize || 1;
  const root = new THREE.Group();
  // 받침: 속이 빈 상자 (상품구 구멍이 보이도록)
  root.add(box(w+2*TRIM, BASE_H, TRIM, color, 0, BASE_H/2,  d/2+TRIM/2));
  root.add(box(w+2*TRIM, BASE_H, TRIM, color, 0, BASE_H/2, -d/2-TRIM/2));
  root.add(box(TRIM, BASE_H, d, color, -w/2-TRIM/2, BASE_H/2, 0));
  root.add(box(TRIM, BASE_H, d, color,  w/2+TRIM/2, BASE_H/2, 0));
  root.add(box(w+2*TRIM+0.03, 0.08, d+2*TRIM+0.03, 0x3b3b48, 0, 0.04, 0));
  // 콘솔 + 조이스틱 + 버튼
  const cz = d/2 + TRIM + 0.1;
  root.add(box(w*0.55, 0.14, 0.32, 0xfff6e8, 0.1, BASE_H-0.07, cz));
  root.add(cyl(0.012, 0.012, 0.12, 0x333, -0.05, BASE_H+0.06, cz));
  root.add(sphere(0.032, 0xff3b5c, -0.05, BASE_H+0.13, cz));
  root.add(cyl(0.035, 0.035, 0.02, 0xffd400, 0.15, BASE_H+0.01, cz));
  // 상품구 문 (앞면 왼쪽)
  root.add(box(CHUTE+0.04, 0.4, 0.012, 0xfafafa, -w/2+CHUTE/2, BASE_H-0.32, d/2+TRIM+0.004));
  root.add(box(CHUTE-0.02, 0.34, 0.012, 0x22222a, -w/2+CHUTE/2, BASE_H-0.32, d/2+TRIM+0.012));
  // LED 디스플레이 (앞면 오른쪽)
  root.add(box(0.4, 0.16, 0.012, 0x101014, w/2-0.3, BASE_H-0.22, d/2+TRIM+0.004));
  const display = makeTextSprite('CREDIT 0', { size:54, color:'#ff3a3a', bg:null, width:512, height:128 });
  display.scale.set(0.38, 0.095, 1); display.position.set(w/2-0.3, BASE_H-0.22, d/2+TRIM+0.02);
  root.add(display);

  // 내부 (물리 좌표계)
  const interior = new THREE.Group(); interior.position.y = BASE_H; root.add(interior);
  const floorC = 0xfff3d6;
  interior.add(box(w-CHUTE, 0.06, d, floorC, CHUTE/2, -0.03, 0));
  interior.add(box(CHUTE, 0.06, d-CHUTE, floorC, -w/2+CHUTE/2, -0.03, -CHUTE/2));
  // 상품구 구덩이
  const chx = -w/2+CHUTE/2, chz = d/2-CHUTE/2;
  interior.add(box(CHUTE, 0.02, CHUTE, 0x0d0d12, chx, -0.5, chz));
  interior.add(box(0.02, 0.5, CHUTE, 0x1a1a22, -w/2+CHUTE+0.01, -0.28, chz));
  interior.add(box(CHUTE, 0.5, 0.02, 0x1a1a22, chx, -0.28, d/2-CHUTE-0.01));
  interior.add(box(0.02, 0.5, CHUTE, 0x1a1a22, -w/2+0.01, -0.28, chz));
  interior.add(box(CHUTE, 0.5, 0.02, 0x1a1a22, chx, -0.28, d/2-0.01));
  // 상품구 턱
  interior.add(box(0.03, 0.1, CHUTE+0.03, 0xff6b8a, -w/2+CHUTE+0.015, 0.05, chz));
  interior.add(box(CHUTE+0.03, 0.1, 0.03, 0xff6b8a, chx, 0.05, d/2-CHUTE-0.015));
  // 유리
  const glass = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({
    color:0xd8f3ff, transparent:true, opacity:0.16, roughness:0.05, side:THREE.DoubleSide, depthWrite:false }));
  glass.position.y = h/2; glass.renderOrder = 20; interior.add(glass);
  [[-1,-1],[1,-1],[-1,1],[1,1]].forEach(([sx,sz]) => interior.add(box(0.06, h, 0.06, color, sx*w/2, h/2, sz*d/2)));
  // 천장 + 간판
  interior.add(box(w+2*TRIM, 0.16, d+2*TRIM, color, 0, h+0.08, 0));
  interior.add(box(w+2*TRIM, 0.26, 0.08, 0xffffff, 0, h+0.29, d/2+TRIM-0.04));
  const sign = makeTextSprite(spec.name, { size:60, color:'#ff4f8b', bg:null, width:640, height:128 });
  sign.scale.set(Math.min(w+0.1, 1.6), 0.32, 1); sign.position.set(0, h+0.29, d/2+TRIM+0.01); interior.add(sign);
  const lights = [];
  const n = 7;
  for (let i=0;i<n;i++){
    const c = [0xff5c8a, 0xffd34d, 0x5ce1ff, 0x9dff6b][i%4];
    const l = sphere(0.03, c, -w/2-TRIM+0.1 + i*(w+2*TRIM-0.2)/(n-1), h+0.44, d/2+TRIM-0.04, 1,1,1, { emissive:c, emissiveIntensity:1 });
    lights.push(l); interior.add(l);
  }
  // 레일 + 캐리지
  const railY = h-0.09;
  interior.add(box(0.05, 0.05, d, 0x555566, -w/2+0.04, railY, 0));
  interior.add(box(0.05, 0.05, d, 0x555566,  w/2-0.04, railY, 0));
  const crossBar = box(w, 0.04, 0.04, 0x777788, 0, railY, 0); interior.add(crossBar);
  const carriage = box(0.13, 0.1, 0.13, 0xff4f8b, 0, railY, 0); interior.add(carriage);
  const cable = cyl(0.006, 0.006, 1, 0x333333, 0, 0, 0, 6); interior.add(cable);
  // 집게
  const claw = new THREE.Group(); interior.add(claw);
  const head = cyl(0.09*cs, 0.07*cs, 0.1*cs, 0xc9ced8, 0, 0, 0, 10, { metalness:0.6, roughness:0.35 }); claw.add(head);
  claw.add(sphere(0.06*cs, 0xff4f8b, 0, 0.07*cs, 0));
  const arms = [], tips = [];
  const L1 = 0.16*cs, L2 = 0.1*cs;
  for (let i=0;i<3;i++){
    const pivot = new THREE.Group(); pivot.rotation.y = i*Math.PI*2/3; pivot.position.y = -0.04*cs; claw.add(pivot);
    const arm = new THREE.Group(); pivot.add(arm);
    arm.add(cyl(0.014*cs, 0.012*cs, L1, 0xe4e8f0, 0, -L1/2, 0, 6, { metalness:0.6, roughness:0.35 }));
    const seg2 = new THREE.Group(); seg2.position.y = -L1; arm.add(seg2);
    seg2.add(cyl(0.012*cs, 0.006*cs, L2, 0xe4e8f0, 0, -L2/2, 0, 6, { metalness:0.6, roughness:0.35 }));
    const tip = new THREE.Object3D(); tip.position.y = -L2; seg2.add(tip);
    arms.push({ arm, seg2 }); tips.push(tip);
  }
  return { root, interior, display, sign, lights, crossBar, carriage, cable, claw, head, arms, tips, dims:{w,d,h}, cs,
    TIP: 0.04*cs + L1*0.9 + L2*0.6 };  // 헤드 중심에서 닫힌 집게 끝까지 대략 거리
}
export function setClawOpen(cab, open){ // open 0(닫힘)~1(벌림)
  const a = 0.12 + open*0.95;
  cab.arms.forEach(({arm, seg2}) => { arm.rotation.x = -a; seg2.rotation.x = a*1.6; });
}
export function placeClaw(cab, x, y, z, rotY=0){
  const railY = cab.dims.h-0.09;
  cab.claw.position.set(x, y, z); cab.claw.rotation.y = rotY;
  cab.carriage.position.set(x, railY, z);
  cab.crossBar.position.z = z;
  const len = railY - 0.05 - y;
  cab.cable.position.set(x, y + len/2, z); cab.cable.scale.y = Math.max(0.01, len);
}

// ---------- 플레이 가능한 기계 (물리 포함) ----------
const AIM_TIME = 25;
export class ClawMachine {
  constructor(spec, opts={}){
    this.spec = spec;
    this.playCount = opts.playCount || 0;
    this.credits = 0;
    this.onWin = opts.onWin || (()=>{});
    this.onPlayEnd = opts.onPlayEnd || (()=>{});
    this.onMessage = opts.onMessage || (()=>{});
    this.onCredits = opts.onCredits || (()=>{});
    this.cab = buildCabinet(spec);
    this.group = this.cab.root;
    const { w, d, h } = spec;
    this.home = { x:-w/2+CHUTE/2, z:d/2-CHUTE/2 };
    this.topY = h - 0.24;
    this.claw = { x:this.home.x, y:this.topY, z:this.home.z, open:1, rot:0, vx:0, vz:0 };
    this.state = 'idle'; this.t = 0; this.timer = 0;
    this.held = null; this.wonThisPlay = false; this.droppedThisPlay = false;
    this.time = 0;
    this.buildPhysics();
    this.spawnPlushes();
    for (let i=0;i<240;i++) this.world.step(1/60);
    this.syncPlushes();
    this.updateDisplay();
    setClawOpen(this.cab, 1);
    placeClaw(this.cab, this.claw.x, this.claw.y, this.claw.z);
  }
  buildPhysics(){
    const { w, d, h } = this.spec;
    const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
    world.broadphase = new CANNON.SAPBroadphase(world);
    world.allowSleep = true;
    world.solver.iterations = 8;
    this.world = world;
    this.plushMat = new CANNON.Material('plush');
    this.wallMat = new CANNON.Material('wall');
    this.clawMat = new CANNON.Material('claw');
    world.addContactMaterial(new CANNON.ContactMaterial(this.plushMat, this.plushMat, { friction:0.6, restitution:0.05 }));
    world.addContactMaterial(new CANNON.ContactMaterial(this.plushMat, this.wallMat, { friction:0.5, restitution:0.05 }));
    world.addContactMaterial(new CANNON.ContactMaterial(this.plushMat, this.clawMat, { friction:0.4, restitution:0.0 }));
    const addBox = (hx,hy,hz,x,y,z) => {
      const b = new CANNON.Body({ mass:0, material:this.wallMat });
      b.addShape(new CANNON.Box(new CANNON.Vec3(hx,hy,hz))); b.position.set(x,y,z); world.addBody(b); return b;
    };
    // 바닥 (상품구 제외)
    addBox((w-CHUTE)/2, 0.05, d/2, CHUTE/2, -0.05, 0);
    addBox(CHUTE/2, 0.05, (d-CHUTE)/2, -w/2+CHUTE/2, -0.05, -CHUTE/2);
    // 상품구 턱
    addBox(0.015, 0.05, CHUTE/2+0.015, -w/2+CHUTE+0.015, 0.05, d/2-CHUTE/2);
    addBox(CHUTE/2+0.015, 0.05, 0.015, -w/2+CHUTE/2, 0.05, d/2-CHUTE-0.015);
    // 벽 + 천장
    addBox(0.05, h, d/2+0.1, -w/2-0.05, h/2-0.6, 0);
    addBox(0.05, h, d/2+0.1,  w/2+0.05, h/2-0.6, 0);
    addBox(w/2+0.1, h, 0.05, 0, h/2-0.6, -d/2-0.05);
    addBox(w/2+0.1, h, 0.05, 0, h/2-0.6,  d/2+0.05);
    addBox(w/2+0.1, 0.05, d/2+0.1, 0, h+0.05, 0);
    // 집게 키네마틱 바디 (헤드 + 손가락 끝 3개)
    const cs = this.cab.cs;
    this.headBody = new CANNON.Body({ mass:0, type:CANNON.Body.KINEMATIC, material:this.clawMat });
    this.headBody.addShape(new CANNON.Sphere(0.09*cs)); world.addBody(this.headBody);
    this.tipBodies = [];
    for (let i=0;i<3;i++){
      const b = new CANNON.Body({ mass:0, type:CANNON.Body.KINEMATIC, material:this.clawMat });
      b.addShape(new CANNON.Sphere(0.03*cs)); world.addBody(b); this.tipBodies.push(b);
    }
  }
  spawnPlushes(){
    const { w, d, pool, count } = this.spec;
    const weights = poolWeights(pool);
    this.plushes = [];
    for (let i=0;i<count;i++){
      const key = pickWeighted(pool, weights);
      let x, z, tries = 0;
      do { x = rand(-w/2+0.18, w/2-0.18); z = rand(-d/2+0.18, d/2-0.18); tries++; }
      while (tries < 20 && x < -w/2+CHUTE+0.15 && z > d/2-CHUTE-0.15);
      this.addPlush(key, x, 0.25 + Math.floor(i/7)*0.32 + rand(0,0.1), z);
    }
  }
  addPlush(key, x, y, z){
    const mesh = buildPlushMesh(key);
    const body = makePlushBody(key, this.plushMat);
    body.position.set(x, y, z);
    body.quaternion.setFromEuler(rand(-0.4,0.4), rand(0, Math.PI*2), rand(-0.4,0.4));
    this.world.addBody(body); this.cab.interior.add(mesh);
    const p = { key, mesh, body };
    this.plushes.push(p); return p;
  }
  syncPlushes(){
    for (const p of this.plushes){ if (p === this.held) continue; p.mesh.position.copy(p.body.position); p.mesh.quaternion.copy(p.body.quaternion); }
  }
  updateDisplay(){
    this.cab.display.setText(`CREDIT ${this.credits}   PLAY ${this.playCount}`);
    this.onCredits(this.credits);
  }
  // 돈 넣기: 1크레딧
  insertCoin(){ this.credits++; sfx.coin(); this.updateDisplay(); }
  canStart(){ return this.state === 'idle' && this.credits > 0; }
  start(){
    if (!this.canStart()) return false;
    this.credits--; this.playCount++;
    const pr = GRIP_PRESETS[this.spec.grip];
    this.pityPlay = this.spec.pity > 0 && this.playCount % this.spec.pity === 0;
    this.grip = this.pityPlay ? 9 : pr.grip + rand(-pr.gripVar, pr.gripVar);
    this.wonThisPlay = false; this.droppedThisPlay = false;
    this.state = 'aim'; this.timer = AIM_TIME;
    sfx.start(); this.updateDisplay();
    return true;
  }
  drop(){ if (this.state === 'aim') this.beginDescend(); }
  beginDescend(){ this.state = 'descend'; sfx.motor(false); }

  // 집게 아래 인형 중 가장 높은 꼭대기
  pileTopUnderClaw(){
    let top = 0;
    const r = 0.2*this.cab.cs + 0.08;
    for (const p of this.plushes){
      if (p === this.held) continue;
      const dx = p.body.position.x - this.claw.x, dz = p.body.position.z - this.claw.z;
      if (dx*dx+dz*dz < r*r) top = Math.max(top, p.body.position.y + plushTop(p.key)*0.7);
    }
    return top;
  }
  // 집게 닫힘 시 잡기 판정
  evaluateGrab(){
    const cs = this.cab.cs, TIP = this.cab.TIP;
    const tipY = this.claw.y - TIP;
    let best = null, bestD = 1e9;
    for (const p of this.plushes){
      const dx = p.body.position.x - this.claw.x, dz = p.body.position.z - this.claw.z;
      const dxz = Math.hypot(dx, dz);
      const R = 0.2*cs + 0.5*plushRadius(p.key);
      const top = p.body.position.y + plushTop(p.key);
      if (dxz < R && top > tipY + 0.03 && p.body.position.y < this.claw.y - 0.02 && dxz < bestD){ best = p; bestD = dxz; best._R = R; best._dx = dx; best._dz = dz; }
    }
    if (!best) return null;
    const s = PLUSH_TYPES[best.key].size;
    const offset = bestD / best._R;                 // 0 중앙 ~ 1 가장자리
    const tooBig = plushRadius(best.key)*2 > 0.5*cs; // 집게보다 큰 인형
    const load = best.body.mass * 10 * (1 + 1.8*offset) * (tooBig ? 2.6 : 1);
    return { p:best, offset, load, dx:best._dx, dz:best._dz, s };
  }
  attach(g){
    const p = g.p;
    this.world.removeBody(p.body);
    this.held = p; this.holdLoad = g.load; this.holdOffset = g.offset;
    this.cab.interior.remove(p.mesh); this.cab.claw.add(p.mesh);
    const r = plushRadius(p.key);
    p.mesh.position.set(g.dx*0.7, -this.cab.TIP + r*0.7, g.dz*0.7);
    p.mesh.rotation.set(g.dz*2.5, rand(0, Math.PI*2), -g.dx*2.5);
  }
  detach(vx=0, vz=0, spinV=0){
    const p = this.held; if (!p) return;
    this.held = null;
    const wp = new THREE.Vector3(), wq = new THREE.Quaternion();
    p.mesh.getWorldPosition(wp); p.mesh.getWorldQuaternion(wq);
    this.cab.claw.remove(p.mesh); this.cab.interior.add(p.mesh);
    const lp = this.cab.interior.worldToLocal(wp.clone());
    p.body.position.set(lp.x, lp.y, lp.z);
    p.body.quaternion.set(wq.x, wq.y, wq.z, wq.w);
    // 회오리: 접선 속도
    const rx = lp.x - this.claw.x, rz = lp.z - this.claw.z;
    p.body.velocity.set(vx - rz*spinV, 0, vz + rx*spinV);
    p.body.angularVelocity.set(rand(-3,3), rand(-3,3), rand(-3,3));
    p.body.wakeUp();
    this.world.addBody(p.body);
    p.mesh.position.copy(p.body.position); p.mesh.quaternion.copy(p.body.quaternion);
  }
  // 하중이 집게 힘을 넘으면 놓침
  holdCheck(dt, loadMult){
    if (!this.held) return;
    const ratio = this.holdLoad * loadMult / this.grip;
    const hazard = Math.max(0, ratio - 0.85) * 3;
    if (Math.random() < hazard * dt){
      const spinV = this.spec.spin ? 4 : 0;
      this.detach(this.claw.vx, this.claw.vz, spinV);
      this.droppedThisPlay = true;
      sfx.drop(); this.onMessage(this.spec.spin && spinV ? '회오리에 날아갔다!' : '앗! 떨어졌다...');
    }
  }
  moveToward(tx, tz, speed, dt){
    const dx = tx - this.claw.x, dz = tz - this.claw.z, dist = Math.hypot(dx, dz);
    if (dist < 0.005){ this.claw.x = tx; this.claw.z = tz; this.claw.vx = this.claw.vz = 0; return true; }
    const step = Math.min(dist, speed*dt);
    this.claw.x += dx/dist*step; this.claw.z += dz/dist*step;
    this.claw.vx = dx/dist*speed; this.claw.vz = dz/dist*speed;
    return false;
  }
  update(dt, input){
    dt = Math.min(dt, 0.05); this.time += dt;
    const c = this.claw, { w, d } = this.spec, cs = this.cab.cs;
    const px = c.x, pz = c.z;
    c.vx = 0; c.vz = 0;
    switch (this.state){
      case 'aim': {
        this.timer -= dt;
        const sp = 0.55;
        let mx = 0, mz = 0;
        if (input.left) mx -= 1; if (input.right) mx += 1; if (input.up) mz -= 1; if (input.down) mz += 1;
        if (mx || mz){ const l = Math.hypot(mx, mz); mx/=l; mz/=l; }
        c.x = clamp(c.x + mx*sp*dt, -w/2+0.12, w/2-0.12);
        c.z = clamp(c.z + mz*sp*dt, -d/2+0.12, d/2-0.12);
        sfx.motor(!!(mx||mz));
        if (input.drop || this.timer <= 0) this.beginDescend();
        break;
      }
      case 'descend': {
        const target = clamp(this.pileTopUnderClaw() - 0.18 + this.cab.TIP, this.cab.TIP + 0.02, this.topY - 0.2);
        c.y -= 0.85*dt;
        if (c.y <= target){ c.y = target; this.state = 'close'; this.t = 0; sfx.close(); }
        break;
      }
      case 'close': {
        this.t += dt; c.open = Math.max(0, 1 - this.t/0.5);
        if (this.t >= 0.5){
          const g = this.evaluateGrab();
          if (g){ this.attach(g); c.open = Math.max(0.05, 0.25 - g.s*0.05 + 0.25*plushRadius(g.p.key)/(0.2*cs)); }
          else c.open = 0;
          this.state = 'lift'; this.t = 0;
        }
        break;
      }
      case 'lift': {
        c.y += 0.5*dt;
        if (this.spec.spin && this.held) c.rot += 4*dt;
        this.holdCheck(dt, this.spec.spin ? 1.7 : 1.0);
        if (c.y >= this.topY){ c.y = this.topY; this.state = 'travel'; this.holdCheck(1, 1.5); }
        break;
      }
      case 'travel': {
        if (this.spec.spin && this.held) c.rot += 4*dt;
        const arrived = this.moveToward(this.home.x, this.home.z, 0.6, dt);
        this.holdCheck(dt, this.spec.spin ? 1.9 : 1.25);
        if (arrived){ this.state = 'release'; this.t = 0; }
        break;
      }
      case 'release': {
        this.t += dt; c.open = Math.min(1, this.t/0.4);
        if (this.t > 0.15 && this.held) this.detach(0, 0, 0);
        if (this.t >= 1.8){ this.state = 'return'; }
        break;
      }
      case 'return': {
        c.rot = 0;
        const arrived = this.moveToward(this.home.x, this.home.z, 0.6, dt);
        if (arrived){
          this.state = 'idle';
          sfx.motor(false);
          if (!this.wonThisPlay) sfx.fail();
          this.onPlayEnd({ won:this.wonThisPlay, dropped:this.droppedThisPlay, pity:this.pityPlay });
        }
        break;
      }
    }
    // 메시/키네마틱 갱신
    setClawOpen(this.cab, c.open);
    placeClaw(this.cab, c.x, c.y, c.z, c.rot);
    this.cab.claw.updateMatrixWorld(true);
    const setKin = (body, v3) => {
      const lp = this.cab.interior.worldToLocal(v3);
      body.velocity.set((lp.x-body.position.x)/dt, (lp.y-body.position.y)/dt, (lp.z-body.position.z)/dt);
      body.position.set(lp.x, lp.y, lp.z);
    };
    const tmp = new THREE.Vector3();
    setKin(this.headBody, this.cab.head.getWorldPosition(tmp).clone());
    this.cab.tips.forEach((t,i) => setKin(this.tipBodies[i], t.getWorldPosition(tmp).clone()));
    this.world.step(1/60, dt, 4);
    this.syncPlushes();
    // 상품구 판정
    for (let i=this.plushes.length-1; i>=0; i--){
      const p = this.plushes[i];
      if (p !== this.held && p.body.position.y < -0.42){
        this.world.removeBody(p.body); this.cab.interior.remove(p.mesh); this.plushes.splice(i,1);
        this.wonThisPlay = true; sfx.win(); this.onWin(p.key);
      }
    }
    // 조명 깜빡임
    this.cab.lights.forEach((l,i) => { l.material.emissiveIntensity = (Math.floor(this.time*3)+i)%2 ? 1 : 0.15; });
  }
  get aimRatio(){ return this.state === 'aim' ? this.timer/AIM_TIME : 0; }
}
