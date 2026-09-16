import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { PLUSH_TYPES, GRIP_PRESETS, poolWeights, pickWeighted } from './data.js';
import { buildPlushMesh, makePlushBody, plushRadius, plushTop, animatePlush } from './plush.js';
import { box, cyl, sphere, mat, makeTextSprite, clamp, rand } from './util.js';
import { sfx } from './audio.js';

export const BASE_H = 0.9;   // 캐비닛 받침 높이 (내부 바닥 = 월드 y BASE_H)
export const CHUTE = 0.42;   // 상품구 한 변
const TRIM = 0.12;
const FINGER_LEN = 0.26;     // 손가락 길이 (clawSize 배율 적용)
const HINGE_R = 0.06;        // 헤드에서 힌지까지 반경
// 손가락 모양(힌지 기준 로컬, y 아래로 / z 바깥쪽): 바깥으로 불룩했다가 끝이 안으로 감기는 갈고리
const FINGER_PTS = [[0,0],[-0.05,0.045],[-0.10,0.075],[-0.15,0.085],[-0.20,0.065],[-0.24,0.025],[-0.26,-0.01]];

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
  const stick = new THREE.Group(); stick.position.set(-0.05, BASE_H, cz); root.add(stick);
  stick.add(cyl(0.012, 0.012, 0.12, 0x333, 0, 0.06, 0));
  stick.add(sphere(0.032, 0xff3b5c, 0, 0.13, 0));
  const button = cyl(0.035, 0.035, 0.02, 0xffd400, 0.15, BASE_H+0.01, cz); root.add(button);
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
  // 집게: 헤드 + 손가락 3개 (pivot = 힌지 위치, arm이 아래로 매달림)
  const claw = new THREE.Group(); interior.add(claw);
  const head = cyl(0.08*cs, 0.065*cs, 0.1*cs, 0xc9ced8, 0, 0, 0, 10, { metalness:0.6, roughness:0.35 }); claw.add(head);
  claw.add(sphere(0.06*cs, 0xff4f8b, 0, 0.07*cs, 0));
  const fingers = [];
  const L = FINGER_LEN*cs;
  for (let i=0;i<3;i++){
    const th = i*Math.PI*2/3;
    const pivot = new THREE.Group(); pivot.rotation.y = th; pivot.position.set(HINGE_R*cs*Math.sin(th), -0.05*cs, HINGE_R*cs*Math.cos(th)); claw.add(pivot);
    const arm = new THREE.Group(); pivot.add(arm);
    const curve = new THREE.CatmullRomCurve3(FINGER_PTS.map(([y,z]) => new THREE.Vector3(0, y*cs, z*cs)));
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 12, 0.015*cs, 6, false), mat(0xe4e8f0, { metalness:0.6, roughness:0.35 }));
    tube.castShadow = true; arm.add(tube);
    arm.add(sphere(0.022*cs, 0xff8fab, 0, -0.26*cs, -0.01*cs));
    fingers.push({ pivot, arm });
  }
  return { root, interior, display, sign, lights, crossBar, carriage, cable, claw, head, fingers, stick, button, dims:{w,d,h}, cs };
}
// 가게 장식용: open 0(닫힘)~1(벌림)
export function setClawOpen(cab, open){
  cab.fingers.forEach(({arm}) => { arm.rotation.x = -(0.1 + open*0.8); });
}
export function placeClaw(cab, x, y, z){
  const railY = cab.dims.h-0.09;
  cab.claw.position.set(x, y, z); cab.claw.quaternion.identity();
  cab.carriage.position.set(x, railY, z);
  cab.crossBar.position.z = z;
  const len = railY - 0.05 - y;
  cab.cable.position.set(x, y + len/2, z); cab.cable.quaternion.identity(); cab.cable.scale.y = Math.max(0.01, len);
}

// ---------- 플레이 가능한 기계 (완전 물리) ----------
const AIM_TIME = 25;
const MOTOR_SPEED = 1.8;
const H = 1/120;            // 물리 고정 스텝
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
    this.cs = this.cab.cs;
    this.home = { x:-w/2+CHUTE/2, z:d/2-CHUTE/2 };
    this.railY = h - 0.09;
    this.anchorY = this.railY - 0.05;
    this.L0 = spec.cable || 0.22;                       // 대기 케이블 길이
    this.Lmax = this.anchorY - (FINGER_LEN*this.cs + 0.05);  // 손가락 끝이 바닥에 닿는 길이
    this.L = this.L0;
    this.anchor = { x:this.home.x, z:this.home.z, vx:0, vz:0 };
    this.state = 'idle'; this.t = 0; this.timer = 0; this.stall = 0;
    this.fingerMode = 'open'; this.torque = 0.2;
    this.carried = null; this.wonThisPlay = false; this.droppedThisPlay = false;
    this.time = 0;
    this.buildPhysics();
    this.spawnPlushes();
    for (let i=0;i<300;i++) this.stepPhysics(1/60);
    this.syncMeshes();
    this.updateDisplay();
  }
  buildPhysics(){
    const { w, d, h } = this.spec, cs = this.cs;
    const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
    world.broadphase = new CANNON.SAPBroadphase(world);
    world.allowSleep = false;   // 키네마틱 집게는 잠든 바디와 충돌하지 않으므로 슬립 금지
    world.solver.iterations = 20;
    this.world = world;
    this.plushMat = new CANNON.Material('plush');
    this.wallMat = new CANNON.Material('wall');
    this.fingerMat = new CANNON.Material('finger');
    this.headMat = new CANNON.Material('head');
    // 천인형: 반발 0, 마찰 높게, 접촉은 부드럽게(눌리는 느낌)
    const soft = { contactEquationStiffness:8e5, contactEquationRelaxation:4, frictionEquationStiffness:8e5, frictionEquationRelaxation:4 };
    world.defaultContactMaterial.restitution = 0; world.defaultContactMaterial.contactEquationStiffness = 8e5; world.defaultContactMaterial.contactEquationRelaxation = 4;
    world.addContactMaterial(new CANNON.ContactMaterial(this.plushMat, this.plushMat, { friction:0.8, restitution:0, ...soft }));
    world.addContactMaterial(new CANNON.ContactMaterial(this.plushMat, this.wallMat, { friction:0.7, restitution:0, ...soft }));
    world.addContactMaterial(new CANNON.ContactMaterial(this.plushMat, this.fingerMat, { friction:0.95, restitution:0, contactEquationStiffness:1.5e6, contactEquationRelaxation:4, frictionEquationStiffness:1.5e6, frictionEquationRelaxation:4 }));
    world.addContactMaterial(new CANNON.ContactMaterial(this.plushMat, this.headMat, { friction:0.4, restitution:0, ...soft }));
    world.addContactMaterial(new CANNON.ContactMaterial(this.fingerMat, this.fingerMat, { friction:0.2, restitution:0.0 }));
    world.addContactMaterial(new CANNON.ContactMaterial(this.fingerMat, this.wallMat, { friction:0.3, restitution:0.0 }));
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
    // 앵커(캐리지 위치, 충돌 없음)
    this.anchorBody = new CANNON.Body({ mass:0, type:CANNON.Body.KINEMATIC });
    this.anchorBody.addShape(new CANNON.Sphere(0.01)); this.anchorBody.collisionResponse = false;
    this.anchorBody.position.set(this.home.x, this.anchorY, this.home.z); world.addBody(this.anchorBody);

    // 헤드(키네마틱, 진자 모델로 이동) + 손가락 3개(키네마틱, 반력 제한 서보)
    this.head = new CANNON.Body({ mass:0, type:CANNON.Body.KINEMATIC, material:this.headMat });
    this.head.addShape(new CANNON.Sphere(0.075*cs));
    this.head.position.set(this.home.x, this.anchorY - this.L0, this.home.z); world.addBody(this.head);
    this.swing = { ox:0, oz:0, vx:0, vz:0 };          // 진자 수평 오프셋/속도
    this.prevAnchorV = { x:0, z:0 }; this.prevAnchor = { x:this.home.x, z:this.home.z }; this.anchorAcc = { x:0, z:0 }; this.acc = 0;
    this.fingers = []; this.angles = [0.8, 0.8, 0.8]; this.reaction = [0, 0, 0]; this.touch = [false,false,false]; this.latched = [false,false,false]; this.moving = [false,false,false]; this.touchCount = [0,0,0]; this.depth = [0,0,0]; this.still = [0,0,0]; this.closeTime = 0; this.headTouch = false;
    const L = FINGER_LEN*cs;
    for (let i=0;i<3;i++){
      const f = new CANNON.Body({ mass:0, type:CANNON.Body.KINEMATIC, material:this.fingerMat });
      FINGER_PTS.forEach(([y,z], k) => { const r = k===FINGER_PTS.length-1 ? 0.022*cs : 0.016*cs; f.addShape(new CANNON.Sphere(r), new CANNON.Vec3(0, y*cs + L/2, z*cs)); });
      world.addBody(f); this.fingers.push(f);
    }
    this.placeFingers(0);
    // 손가락 메시를 interior 직속으로 옮겨 물리로 구동
    this.cab.fingers.forEach(({pivot, arm}) => { this.cab.claw.remove(pivot); this.cab.interior.add(pivot); arm.rotation.x = 0; });
  }
  // 손가락 키네마틱 배치 (dt>0이면 속도도 갱신)
  placeFingers(dt){
    const cs = this.cs, L = FINGER_LEN*cs;
    const hq = this.headTarget ? this.headTarget.q : this.head.quaternion;
    const hp = this.headTarget ? new CANNON.Vec3(this.headTarget.x, this.headTarget.y, this.headTarget.z) : this.head.position;
    for (let i=0;i<3;i++){
      const f = this.fingers[i], th = i*Math.PI*2/3;
      const qY = new CANNON.Quaternion().setFromAxisAngle(new CANNON.Vec3(0,1,0), th);
      const qX = new CANNON.Quaternion().setFromAxisAngle(new CANNON.Vec3(1,0,0), -this.angles[i]);
      const q = hq.mult(qY).mult(qX);
      const hinge = hp.vadd(hq.vmult(new CANNON.Vec3(HINGE_R*cs*Math.sin(th), -0.05*cs, HINGE_R*cs*Math.cos(th))));
      const pos = hinge.vadd(q.vmult(new CANNON.Vec3(0, -L/2, 0)));
      if (dt > 0){
        // 키네마틱: 위치를 덮어쓰지 않고 속도만 줘서 엔진이 목표로 적분하게 (P 제어)
        f.velocity.set((pos.x-f.position.x)/dt, (pos.y-f.position.y)/dt, (pos.z-f.position.z)/dt);
        const dq = q.mult(f.quaternion.inverse()); if (dq.w < 0){ dq.x=-dq.x; dq.y=-dq.y; dq.z=-dq.z; }
        f.angularVelocity.set(2*dq.x/dt, 2*dq.y/dt, 2*dq.z/dt);
      } else { f.position.copy(pos); f.quaternion.copy(q); f.velocity.setZero(); f.angularVelocity.setZero(); }
      f.hingeWorld = hinge; f.axisWorld = hq.vmult(qY.vmult(new CANNON.Vec3(1,0,0))); f.targetQ = q;
    }
  }
  // 손가락별: (1) 인형과의 최대 눌림 깊이 (2) 인형이 손가락을 아래로 누르는 힘(무게)이 만드는 벌림 토크
  readReactions(){
    const plushSet = new Set(this.plushes.map(p => p.body));
    this.headTouch = this.world.contacts.some(e => (e.bi === this.head && plushSet.has(e.bj)) || (e.bj === this.head && plushSet.has(e.bi)));
    const eqs = [...this.world.contacts, ...this.world.frictionEquations];
    for (let i=0;i<3;i++){
      const f = this.fingers[i]; let tau = 0, depth = 0, touch = false;
      for (const e of eqs){
        const isI = e.bi === f, isJ = e.bj === f;
        if (!isI && !isJ) continue;
        const other = isI ? e.bj : e.bi;
        if (!plushSet.has(other)) continue;
        touch = true;
        if (e.ni){ // 접촉 방정식: 눌림 깊이
          const pi = e.bi.position.vadd(e.ri), pj = e.bj.position.vadd(e.rj);
          const dsep = pj.vsub(pi).dot(e.ni);
          if (dsep < 0) depth = Math.max(depth, -dsep);
        }
        if (!(e.multiplier > 0)) continue;
        const dir = e.ni || e.t;
        const F = dir.scale(isI ? -e.multiplier : e.multiplier);
        if (F.y > -0.35*F.length()) continue;         // 옆에서 끼는 힘은 제외, 위에서 누르는 하중(무게)만
        const p = f.position.vadd(isI ? e.ri : e.rj);
        tau += p.vsub(f.hingeWorld).cross(F).dot(f.axisWorld);
      }
      this.touch[i] = touch; this.depth[i] = depth;
      const open = clamp(-tau, -4, 4);
      // 서보가 쉬고 있을 때만(닫는 중 충격 제외) 반력을 누적
      if (this.still[i] < 0.1) this.reaction[i] = 0; else this.reaction[i] = this.reaction[i]*0.92 + open*0.08;
    }
  }
  spawnPlushes(){
    const { w, d, pool, count } = this.spec;
    const weights = pool ? poolWeights(pool, this.spec.weights) : null;
    this.plushes = [];
    const list = this.spec.stockList;
    const n = list ? list.length : count;
    for (let i=0;i<n;i++){
      const key = list ? list[i] : pickWeighted(pool, weights);
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
    const p = { key, mesh, body, prevVel:new CANNON.Vec3() };
    this.plushes.push(p); return p;
  }
  updateDisplay(){
    this.cab.display.setText(`CREDIT ${this.credits}   PLAY ${this.playCount}`);
    this.onCredits(this.credits);
  }
  insertCoin(){ this.credits++; sfx.coin(); this.updateDisplay(); }
  canStart(){ return this.state === 'idle' && this.credits > 0; }
  start(){
    if (!this.canStart()) return false;
    this.credits--; this.playCount++;
    const pr = GRIP_PRESETS[this.spec.grip];
    this.pityPlay = this.spec.pity > 0 && this.playCount % this.spec.pity === 0;
    this.torque = pr.torque * (1 + rand(-pr.torqueVar, pr.torqueVar)) * (this.pityPlay ? 4 : 1);
    this.wonThisPlay = false; this.droppedThisPlay = false; this.carried = null;
    this.state = 'aim'; this.timer = AIM_TIME;
    sfx.start(); this.updateDisplay();
    return true;
  }
  drop(){ if (this.state === 'aim') this.beginDescend(); }
  beginDescend(){ this.state = 'descend'; this.stall = 0; sfx.motor(false); }

  fingerAngle(i){ return this.angles[i]; }
  // 2단계 서보: 닫힘 = 인형에 닿으면 멈춤 / 유지 = 준정적 반력이 토크를 넘으면 밀려 벌어짐(흘러내림)
  applyMotors(dt){
    const OPEN = 0.8, SPEED = MOTOR_SPEED;
    for (let i=0;i<3;i++){
      const a = this.angles[i], r = this.reaction[i];
      let da = 0;
      if (this.fingerMode === 'close'){
        const T = this.torque;
        // 인형이 토크에 비례하는 깊이만큼 눌리면(=안 밀리면) 거기서 멈춤. 센 집게일수록 더 파고든다
        const depthLimit = 0.003 + T*0.004;
        if (this.depth[i] > depthLimit && this.closeTime > 0.05) this.latched[i] = true;
        if (!this.latched[i]){ if (a > -0.15) da = this.touch[i] ? -SPEED*0.25 : -SPEED; }   // 오므림 (닿으면 천천히: 인형을 밀어내지 않게)
        else {
          // 눌림 깊이 서보: 살짝 닿아 있는 정도(2mm)만 유지해서 끼임 힘을 없앤다
          const dd = this.depth[i] - 0.001;
          const servo = clamp(dd*60, -0.25, 0.25);                     // +: 너무 눌림 → 벌림
          if (this.touch[i]) da = servo; else if (a > -0.15) da = -0.35; // 놓쳤으면 천천히 더 오므림
          if (r > T) da += Math.min(SPEED*0.7, SPEED*0.7*(r - T)/T);  // 힘 부족: 밀려서 벌어짐(흘러내림)
        }
      } else {
        this.latched[i] = false;
        if (a < OPEN) da = SPEED; else if (a > OPEN + 0.1) da = -SPEED*0.5;
      }
      this.moving[i] = Math.abs(da) > 0.3;
      this.still[i] = this.moving[i] ? 0 : this.still[i] + dt;
      this.angles[i] = clamp(a + da*dt, -0.2, 1.4);
    }
  }
  // 프레임 dt를 1/120 고정 서브스텝으로 나눠 돌린다. 키네마틱 속도 제어가 서브스텝마다 정확히 목표에 도착하도록.
  stepPhysics(dt){
    if (dt <= 0) return;
    // 앵커 속도/가속(프레임 단위): 진자 구동원
    const avx = (this.anchor.x - this.prevAnchor.x)/dt, avz = (this.anchor.z - this.prevAnchor.z)/dt;
    this.anchorAcc = { x:(avx - this.prevAnchorV.x)/dt, z:(avz - this.prevAnchorV.z)/dt };
    this.prevAnchorV = { x:avx, z:avz }; this.prevAnchor = { x:this.anchor.x, z:this.anchor.z };
    this.anchorBody.position.set(this.anchor.x, this.anchorY, this.anchor.z);
    this.acc += dt; let n = 0;
    while (this.acc >= H && n < 6){ this.substep(H); this.acc -= H; n++; }
    if (n >= 6) this.acc = 0;
  }
  substep(h){
    // 진자: 앵커 가속에 반응해 흔들림 (회오리 테크닉의 근원)
    const sw = this.swing, L = this.L, g = 9.82, damp = (this.spec.swing ?? 0.3) * 6;
    const { w, d } = this.spec;
    sw.vx += (-(g/L)*sw.ox - damp*sw.vx - this.anchorAcc.x*0.6) * h;
    sw.vz += (-(g/L)*sw.oz - damp*sw.vz - this.anchorAcc.z*0.6) * h;
    sw.ox += sw.vx*h; sw.oz += sw.vz*h;
    const maxO = L*0.8, mag = Math.hypot(sw.ox, sw.oz);
    if (mag > maxO){ sw.ox *= maxO/mag; sw.oz *= maxO/mag; sw.vx *= 0.5; sw.vz *= 0.5; }
    // 유리벽 안쪽으로 제한
    let hx = this.anchor.x + sw.ox, hz = this.anchor.z + sw.oz;
    const bx = w/2 - 0.09, bz = d/2 - 0.09;
    if (hx > bx){ hx = bx; sw.ox = hx - this.anchor.x; sw.vx = Math.min(0, sw.vx)*0.3; }
    if (hx < -bx){ hx = -bx; sw.ox = hx - this.anchor.x; sw.vx = Math.max(0, sw.vx)*0.3; }
    if (hz > bz){ hz = bz; sw.oz = hz - this.anchor.z; sw.vz = Math.min(0, sw.vz)*0.3; }
    if (hz < -bz){ hz = -bz; sw.oz = hz - this.anchor.z; sw.vz = Math.max(0, sw.vz)*0.3; }
    const hy = this.anchorY - Math.sqrt(Math.max(0.0001, L*L - sw.ox*sw.ox - sw.oz*sw.oz));
    const hb = this.head;
    hb.velocity.set((hx-hb.position.x)/h, (hy-hb.position.y)/h, (hz-hb.position.z)/h);
    // 케이블 방향으로 기울기 (각속도 P 제어)
    const dir = new CANNON.Vec3(hx-this.anchor.x, hy-this.anchorY, hz-this.anchor.z); dir.normalize();
    const q = new CANNON.Quaternion(); q.setFromVectors(new CANNON.Vec3(0,-1,0), dir);
    const dq = q.mult(hb.quaternion.inverse()); if (dq.w < 0){ dq.x=-dq.x; dq.y=-dq.y; dq.z=-dq.z; }
    hb.angularVelocity.set(2*dq.x/h, 2*dq.y/h, 2*dq.z/h);
    this.headTarget = { x:hx, y:hy, z:hz, q };
    this.applyMotors(h);
    this.placeFingers(h);
    this.world.step(H);
    this.readReactions();
  }
  syncMeshes(){
    const dt = this.lastDt || 1/60;
    for (const p of this.plushes){ p.mesh.position.copy(p.body.position); p.mesh.quaternion.copy(p.body.quaternion); animatePlush(p.mesh, p.body.velocity, p.prevVel, dt); p.prevVel.copy(p.body.velocity); }
    const cab = this.cab, L = FINGER_LEN*this.cs;
    const ht = this.headTarget;
    if (ht){ cab.claw.position.set(ht.x, ht.y, ht.z); cab.claw.quaternion.copy(ht.q); }
    else { cab.claw.position.copy(this.head.position); cab.claw.quaternion.copy(this.head.quaternion); }
    this.fingers.forEach((f, i) => {
      const q = f.targetQ || f.quaternion;
      cab.fingers[i].pivot.position.copy(f.hingeWorld || f.position); cab.fingers[i].pivot.quaternion.copy(q);
    });
    cab.carriage.position.set(this.anchor.x, this.railY, this.anchor.z);
    cab.crossBar.position.z = this.anchor.z;
    const A = new THREE.Vector3(this.anchor.x, this.anchorY, this.anchor.z), H = new THREE.Vector3().copy(this.head.position);
    const dir = H.clone().sub(A), len = dir.length();
    cab.cable.position.copy(A.clone().add(H).multiplyScalar(0.5));
    cab.cable.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), dir.normalize());
    cab.cable.scale.y = Math.max(0.01, len);
    // 조이스틱/버튼 연출
    cab.stick.rotation.set(this.input?.down ? 0.4 : this.input?.up ? -0.4 : 0, 0, this.input?.left ? 0.4 : this.input?.right ? -0.4 : 0);
    cab.button.position.y = BASE_H + (this.state === 'descend' ? 0.0 : 0.01);
  }
  pileTopUnderHead(){
    let top = 0;
    for (const p of this.plushes){
      const r = plushRadius(p.key), dx = p.body.position.x - this.head.position.x, dz = p.body.position.z - this.head.position.z;
      const dxz = Math.hypot(dx, dz);
      if (dxz < 0.075*this.cs + r){ const dy = Math.sqrt(Math.max(0, r*r - Math.max(0, dxz - 0.075*this.cs)**2)); top = Math.max(top, p.body.position.y + dy, p.body.position.y + plushTop(p.key)*0.3); }
    }
    return top;
  }
  // 집게 근처에 들려 있는 인형
  findCarried(){
    let best = null, bd = 1e9;
    for (const p of this.plushes){
      const d = p.body.position.distanceTo(this.head.position);
      if (d < 0.32*this.cs + plushRadius(p.key) && d < bd){ best = p; bd = d; }
    }
    return best;
  }
  moveAnchorToward(tx, tz, speed, dt){
    const dx = tx - this.anchor.x, dz = tz - this.anchor.z, dist = Math.hypot(dx, dz);
    if (dist < 0.005){ this.anchor.x = tx; this.anchor.z = tz; return true; }
    const step = Math.min(dist, speed*dt);
    this.anchor.x += dx/dist*step; this.anchor.z += dz/dist*step;
    return false;
  }
  update(dt, input){
    dt = Math.min(dt, 0.05); this.time += dt; this.input = input; this.lastDt = dt;
    const { w, d } = this.spec;
    switch (this.state){
      case 'aim': {
        this.timer -= dt;
        const sp = 0.6;
        let mx = 0, mz = 0;
        if (input.left) mx -= 1; if (input.right) mx += 1; if (input.up) mz -= 1; if (input.down) mz += 1;
        if (mx || mz){ const l = Math.hypot(mx, mz); mx/=l; mz/=l; }
        this.anchor.x = clamp(this.anchor.x + mx*sp*dt, -w/2+0.1, w/2-0.1);
        this.anchor.z = clamp(this.anchor.z + mz*sp*dt, -d/2+0.1, d/2-0.1);
        sfx.motor(!!(mx||mz));
        this.fingerMode = 'open';
        if (input.drop || this.timer <= 0) this.beginDescend();
        break;
      }
      case 'descend': {
        this.fingerMode = 'open'; this.closeTime = 0;
        this.L += 0.42*dt;
        // 헤드 바로 아래 인형 꼭대기 직전(건드리지 않게)에서 멈춤. 접촉하면 즉시 정지. 손가락 끝이 바닥이면 정지
        const targetY = this.pileTopUnderHead() + 0.075*this.cs + 0.008;
        if ((this.head.position.y <= targetY && this.L > this.L0 + 0.05) || (this.headTouch && this.L > this.L0 + 0.05) || this.L >= this.Lmax){
          this.L = Math.min(this.L, this.anchorY - this.head.position.y - (this.headTouch ? 0.006 : 0));
          this.state = 'close'; this.t = 0; sfx.close();
        }
        break;
      }
      case 'close': {
        this.fingerMode = 'close'; this.t += dt; this.closeTime = this.t;
        if (this.t >= 0.8){ this.state = 'lift'; this.carried = null; this.t = 0; }
        break;
      }
      case 'lift': {
        this.fingerMode = 'close';
        this.L = Math.max(this.L0, this.L - 0.35*dt);
        this.t += dt;
        if (this.t > 0.5 && !this.carried){ const c = this.findCarried(); if (c && c.body.position.y > 0.2) this.carried = c; }
        this.dropCheck();
        if (this.L <= this.L0 + 1e-6){ this.state = 'travel'; }
        break;
      }
      case 'travel': {
        this.fingerMode = 'close';
        if (!this.carried) this.carried = this.findCarried();
        this.dropCheck();
        if (this.moveAnchorToward(this.home.x, this.home.z, 0.5, dt)){ this.state = 'release'; this.t = 0; }
        break;
      }
      case 'release': {
        this.fingerMode = 'open'; this.t += dt;
        if (this.t >= 2.0){ this.state = 'idle'; this.carried = null; sfx.motor(false); if (!this.wonThisPlay) sfx.fail();
          this.onPlayEnd({ won:this.wonThisPlay, dropped:this.droppedThisPlay, pity:this.pityPlay }); }
        break;
      }
    }
    this.stepPhysics(dt);
    this.syncMeshes();
    // 상품구 판정
    for (let i=this.plushes.length-1; i>=0; i--){
      const p = this.plushes[i];
      if (p.body.position.y < -0.42){
        this.world.removeBody(p.body); this.cab.interior.remove(p.mesh); this.plushes.splice(i,1);
        if (p === this.carried) this.carried = null;
        this.wonThisPlay = true; sfx.win(); this.onWin(p.key);
      }
    }
    this.cab.lights.forEach((l,i) => { l.material.emissiveIntensity = (Math.floor(this.time*3)+i)%2 ? 1 : 0.15; });
  }
  dropCheck(){
    const c = this.carried; if (!c) return;
    if (c.body.position.distanceTo(this.head.position) > 0.4*this.cs + plushRadius(c.key)){
      this.carried = null; this.droppedThisPlay = true; sfx.drop(); this.onMessage('앗! 흘러내렸다...');
    }
  }
  get aimRatio(){ return this.state === 'aim' ? this.timer/AIM_TIME : 0; }
}
