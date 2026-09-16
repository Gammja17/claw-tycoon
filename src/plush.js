import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { PLUSH_TYPES } from './data.js';
import { cone, box } from './util.js';

const BLACK = 0x1c1c22;
// 부드러운(스무스 셰이딩) 재질 — 각지지 않은 인형용
function fluffMat(color, opts={}){
  return new THREE.MeshStandardMaterial({ color, roughness:1.0, metalness:0, flatShading:false, ...opts });
}
function fluff(r, color, x=0,y=0,z=0, sx=1,sy=1,sz=1, opts={}){
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), fluffMat(color, opts));
  m.position.set(x,y,z); m.scale.set(sx,sy,sz); m.castShadow = true;
  return m;
}
// 보송한 테두리: 살짝 큰 반투명 구를 덧씌움
function fuzz(mesh, r, color){
  const f = new THREE.Mesh(new THREE.SphereGeometry(r*1.07, 16, 12), new THREE.MeshStandardMaterial({ color, roughness:1, transparent:true, opacity:0.28, depthWrite:false }));
  mesh.add(f); return f;
}
function smoothMat(color, opts={}){ return new THREE.MeshStandardMaterial({ color, roughness:0.5, metalness:0.05, flatShading:false, ...opts }); }
function rbox(w,h,d,color,x=0,y=0,z=0,opts={}){
  const m = new THREE.Mesh(new THREE.BoxGeometry(w,h,d, 1,1,1), smoothMat(color,opts)); m.position.set(x,y,z); m.castShadow = true; return m;
}

// 관절: pivot 그룹 + 스프링 상태. limbs 배열은 애니메이션에서 사용
function joint(g, x, y, z, rest, build){
  const p = new THREE.Group(); p.position.set(x, y, z); g.add(p);
  build(p);
  p.userData.joint = { rx:0, rz:0, vx:0, vz:0, rest }; // rest: [rx, rz] 기본 자세
  p.rotation.x = rest[0]; p.rotation.z = rest[1];
  return p;
}

// 인형 메시 (원점 = 몸통 중심). 팔·다리·귀는 관절
function buildPlush(t, g){
  const s = t.size;
  const shiny = t.shiny ? { metalness:0.5, roughness:0.45 } : {};
  const body = fluff(0.14*s, t.color, 0,0,0, 1,0.95,0.9, shiny); g.add(body); fuzz(body, 0.14*s, t.color);
  g.add(fluff(0.1*s, t.belly, 0,-0.02*s,0.075*s, 1,0.9,0.6));
  // 머리 관절 (살짝 끄덕임)
  const head = joint(g, 0, 0.12*s, 0.01*s, [0,0], p => {
    const h = fluff(0.115*s, t.color, 0, 0.05*s, 0, 1,1,1, shiny); p.add(h); fuzz(h, 0.115*s, t.color);
    if (t.frogEyes){
      [-1,1].forEach(sg=>{ p.add(fluff(0.04*s, 0xffffff, sg*0.06*s, 0.15*s, 0.05*s)); p.add(fluff(0.02*s, BLACK, sg*0.06*s, 0.155*s, 0.085*s)); });
    } else {
      [-1,1].forEach(sg=>{
        if (t.patches) p.add(fluff(0.038*s, BLACK, sg*0.047*s, 0.07*s, 0.095*s, 1,1.2,0.5));
        p.add(fluff(0.018*s, BLACK, sg*0.045*s, 0.07*s, 0.11*s));
      });
      p.add(fluff(0.012*s, 0x3a2a2a, 0, 0.035*s, 0.118*s, 1.3, 0.8, 0.6)); // 코
    }
    if (t.beak){ const b = cone(0.03*s, 0.07*s, 0xff9f2e, 0, 0.03*s, 0.14*s); b.rotation.x = Math.PI/2; p.add(b); }
    if (t.horn){ const h2 = cone(0.025*s, 0.11*s, 0xffd54a, 0, 0.19*s, 0.03*s, {metalness:0.5, roughness:0.4}); h2.rotation.x = -0.2; p.add(h2); }
    const ec = t.earColor ?? t.color;
    // 귀 관절
    if (t.ear==='round') [-1,1].forEach(sg=> joint(p, sg*0.085*s, 0.13*s, 0, [0, -sg*0.15], q => q.add(fluff(0.042*s, ec, 0, 0.02*s, 0))));
    if (t.ear==='long')  [-1,1].forEach(sg=> joint(p, sg*0.05*s, 0.14*s, 0, [0, -sg*0.25], q => q.add(fluff(0.035*s, ec, 0, 0.07*s, 0, 1,2.6,0.7))));
    if (t.ear==='pointy')[-1,1].forEach(sg=> joint(p, sg*0.07*s, 0.15*s, 0, [0, -sg*0.3], q => q.add(cone(0.04*s, 0.09*s, ec, 0, 0.03*s, 0))));
  });
  head.userData.joint.limit = 0.25;
  // 팔 관절 (어깨에서 아래로 늘어짐)
  [-1,1].forEach(sg => joint(g, sg*0.1*s, 0.03*s, 0.04*s, [0.2, sg*0.9], p => { p.add(fluff(0.04*s, t.color, 0, -0.05*s, 0, 0.85, 1.4, 0.85, shiny)); p.add(fluff(0.045*s, t.color, 0, -0.1*s, 0, 1,1,1, shiny)); }));
  // 다리 관절
  [-1,1].forEach(sg => joint(g, sg*0.07*s, -0.09*s, 0.05*s, [0.5, sg*0.35], p => { p.add(fluff(0.045*s, t.color, 0, -0.05*s, 0, 1,1.2,1, shiny)); p.add(fluff(0.05*s, t.belly, 0, -0.09*s, 0.01*s, 1,0.7,1)); }));
  if (t.wings) [-1,1].forEach(sg=> joint(g, sg*0.1*s, 0.06*s, -0.09*s, [0, sg*0.5], p => { p.add(box(0.14*s, 0.09*s, 0.02*s, 0xb08cff, sg*0.06*s, 0, 0)); }));
}

// 박스형 상품 (피규어/에어팟/워치/아이패드/키링)
function buildBox(t, g){
  const [w,h,d] = t.dims;
  g.add(rbox(w,h,d, t.color));
  if (t.window){ // 피규어 박스: 앞면 투명창 + 안의 피규어
    g.add(new THREE.Mesh(new THREE.BoxGeometry(w*0.7, h*0.7, 0.01), new THREE.MeshStandardMaterial({ color:0xbfe9ff, transparent:true, opacity:0.5, roughness:0.1 })).translateZ(d/2+0.002));
    const fig = new THREE.Mesh(new THREE.CapsuleGeometry(w*0.14, h*0.35, 4, 8), smoothMat(t.accent)); fig.position.set(0, -h*0.05, d*0.1); g.add(fig);
    g.add(new THREE.Mesh(new THREE.SphereGeometry(w*0.16, 12, 10), smoothMat(0xffd9b3)).translateY(h*0.25));
    g.add(rbox(w, h*0.18, d+0.002, t.accent, 0, h*0.41, 0));
  }
  if (t.screen){ // 검은 화면
    const scr = new THREE.Mesh(new THREE.BoxGeometry(w*0.86, 0.004, d*0.86), new THREE.MeshStandardMaterial({ color:0x0a0a0c, roughness:0.15, metalness:0.3 })); scr.position.y = h/2+0.001; g.add(scr);
    if (t.name.includes('워치')){ // 밴드
      g.add(rbox(w*0.35, h*0.3, d*0.9, 0xff4f8b, 0, -h*0.2, 0)); g.add(new THREE.Mesh(new THREE.TorusGeometry(w*0.5, w*0.09, 8, 16), smoothMat(0xff4f8b)).rotateY(Math.PI/2).translateY(-h*0.1));
    } else { // 아이패드 카메라
      g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.003, 10), smoothMat(0x333)).translateY(h/2+0.002).translateX(-w*0.4).translateZ(-d*0.38));
    }
  }
  if (t.name.includes('에어팟')){ g.add(rbox(w*0.98, 0.003, d*0.98, t.accent, 0, h*0.15, 0)); g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.008,0.008,0.004,8), smoothMat(0x88ff88)).translateY(h/2+0.002).translateZ(d*0.3)); }
  if (t.name.includes('키링')){ // 키캡 + 고리
    g.add(rbox(w*0.8, h*0.5, d*0.8, t.accent, 0, h*0.45, 0));
    g.add(new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.004, 6, 14), new THREE.MeshStandardMaterial({ color:0xcfcfd6, metalness:0.8, roughness:0.3 })).translateX(w/2+0.015).translateY(h*0.2));
  }
}
function buildBall(t, g){
  const b = fluff(t.r, t.color, 0,0,0, 1,0.9,1, { roughness:0.4 }); g.add(b);
  if (t.face){ [-1,1].forEach(sg => g.add(fluff(0.012, BLACK, sg*0.035, 0.02, t.r*0.93))); g.add(fluff(0.008, 0xff8fab, 0, -0.02, t.r*0.97, 2.2, 0.8, 0.6)); }
}

export function buildPlushMesh(key){
  const t = PLUSH_TYPES[key], g = new THREE.Group();
  if (t.kind === 'box') buildBox(t, g); else if (t.kind === 'ball') buildBall(t, g); else buildPlush(t, g);
  g.traverse(o=>{ if (o.isMesh){ o.castShadow = true; } });
  g.userData.key = key;
  g.userData.joints = []; g.traverse(o => { if (o.userData.joint) g.userData.joints.push(o); });
  return g;
}

// 관절 애니메이션: 몸이 받는 가속/자세에 따라 팔다리·귀가 스프링처럼 흔들리고, 들리면 아래로 늘어진다
const _q = new THREE.Quaternion(), _down = new THREE.Vector3(), _dv = new THREE.Vector3();
export function animatePlush(mesh, vel, prevVel, dt){
  const joints = mesh.userData.joints; if (!joints || !joints.length || dt <= 0) return;
  _q.copy(mesh.quaternion).invert();
  _down.set(0,-1,0).applyQuaternion(_q);                       // 월드 아래 방향(로컬)
  _dv.set(vel.x-prevVel.x, vel.y-prevVel.y, vel.z-prevVel.z).applyQuaternion(_q).multiplyScalar(1/dt); // 로컬 가속
  const hang = Math.max(0, 1 - Math.abs(_down.y + 1)*1.5);       // 바로 서 있으면 0, 기울면 늘어짐
  for (const p of joints){
    const j = p.userData.joint, lim = j.limit ?? 0.7;
    // 목표: 기본자세 + (기울면) 아래로 늘어지는 방향
    const tx = j.rest[0] + Math.atan2(_down.z, -_down.y) * 0.8 * (1 - 0.3*hang);
    const tz = j.rest[1] - Math.atan2(_down.x, -_down.y) * 0.8;
    const k = 60, c = 7, gain = 0.06;
    j.vx += (-k*(j.rx - tx) - c*j.vx + gain*_dv.z) * dt;
    j.vz += (-k*(j.rz - tz) - c*j.vz - gain*_dv.x) * dt;
    j.rx += j.vx*dt; j.rz += j.vz*dt;
    j.rx = Math.max(j.rest[0]-lim, Math.min(j.rest[0]+lim, j.rx));
    j.rz = Math.max(j.rest[1]-lim, Math.min(j.rest[1]+lim, j.rz));
    p.rotation.x = j.rx; p.rotation.z = j.rz;
  }
}

// 물리 바디
export function makePlushBody(key, material){
  const t = PLUSH_TYPES[key];
  if (t.kind === 'box'){
    const [w,h,d] = t.dims;
    const body = new CANNON.Body({ mass:t.mass, material, linearDamping:0.5, angularDamping:0.85 });
    body.addShape(new CANNON.Box(new CANNON.Vec3(w/2, h/2, d/2)));
    return body;
  }
  if (t.kind === 'ball'){
    const body = new CANNON.Body({ mass:t.mass, material, linearDamping:0.55, angularDamping:0.9 });
    body.addShape(new CANNON.Sphere(t.r)); return body;
  }
  const s = t.size;
  const body = new CANNON.Body({ mass: 0.4*s*s, material, linearDamping:0.6, angularDamping:0.92 });
  body.addShape(new CANNON.Sphere(0.145*s));
  body.addShape(new CANNON.Sphere(0.11*s), new CANNON.Vec3(0, 0.17*s, 0));
  return body;
}
// 대략 반지름(집게 판정용)
export const plushRadius = key => { const t = PLUSH_TYPES[key]; if (t.kind==='box') return Math.hypot(t.dims[0], t.dims[2])/2; if (t.kind==='ball') return t.r; return 0.145*t.size; };
export const plushTop = key => { const t = PLUSH_TYPES[key]; if (t.kind==='box') return t.dims[1]/2; if (t.kind==='ball') return t.r; return 0.285*t.size; };
