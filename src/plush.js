import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { PLUSH_TYPES } from './data.js';
import { sphere, cone, box } from './util.js';

const BLACK = 0x1c1c22;
// 로우폴리 인형 메시 (원점 = 몸통 중심)
export function buildPlushMesh(key){
  const t = PLUSH_TYPES[key], s = t.size, g = new THREE.Group();
  const shiny = t.shiny ? { metalness:0.6, roughness:0.35 } : {};
  g.add(sphere(0.14*s, t.color, 0,0,0, 1,0.95,0.9, shiny));
  g.add(sphere(0.1*s, t.belly, 0,-0.02*s,0.075*s, 1,0.9,0.6));
  g.add(sphere(0.115*s, t.color, 0,0.17*s,0.01*s, 1,1,1, shiny));
  // 팔다리
  [[-0.13,-0.02,0.04],[0.13,-0.02,0.04],[-0.07,-0.13,0.06],[0.07,-0.13,0.06]].forEach(p=>
    g.add(sphere(0.045*s, t.color, p[0]*s,p[1]*s,p[2]*s, 1,1,1, shiny)));
  // 눈
  if (t.frogEyes){
    [-1,1].forEach(sg=>{ g.add(sphere(0.04*s, 0xffffff, sg*0.06*s, 0.27*s, 0.05*s)); g.add(sphere(0.02*s, BLACK, sg*0.06*s, 0.275*s, 0.085*s)); });
  } else {
    [-1,1].forEach(sg=>{
      if (t.patches) g.add(sphere(0.038*s, BLACK, sg*0.047*s, 0.19*s, 0.095*s, 1,1.2,0.5));
      g.add(sphere(0.018*s, BLACK, sg*0.045*s, 0.19*s, 0.11*s));
    });
  }
  // 귀
  const ec = t.earColor ?? t.color;
  if (t.ear==='round') [-1,1].forEach(sg=> g.add(sphere(0.042*s, ec, sg*0.085*s, 0.27*s, 0)));
  if (t.ear==='long')  [-1,1].forEach(sg=> g.add(sphere(0.035*s, ec, sg*0.05*s, 0.34*s, 0, 1,2.6,0.7)));
  if (t.ear==='pointy')[-1,1].forEach(sg=>{ const c = cone(0.04*s, 0.09*s, ec, sg*0.07*s, 0.29*s, 0); c.rotation.z = -sg*0.3; g.add(c); });
  if (t.beak){ const b = cone(0.03*s, 0.07*s, 0xff9f2e, 0, 0.15*s, 0.14*s); b.rotation.x = Math.PI/2; g.add(b); }
  if (t.horn){ const h = cone(0.025*s, 0.11*s, 0xffd54a, 0, 0.31*s, 0.03*s, {metalness:0.5, roughness:0.4}); h.rotation.x = -0.2; g.add(h); }
  if (t.wings) [-1,1].forEach(sg=>{ const w = box(0.14*s, 0.09*s, 0.02*s, 0xb08cff, sg*0.16*s, 0.06*s, -0.09*s); w.rotation.z = sg*0.5; g.add(w); });
  g.traverse(o=>{ if (o.isMesh){ o.castShadow = true; } });
  g.userData.key = key;
  return g;
}
// 물리 바디: 몸통 구 + 머리 구
export function makePlushBody(key, material){
  const t = PLUSH_TYPES[key], s = t.size;
  const body = new CANNON.Body({ mass: 0.4*s*s, material, linearDamping:0.4, angularDamping:0.75,
    allowSleep:true, sleepSpeedLimit:0.2, sleepTimeLimit:0.5 });
  body.addShape(new CANNON.Sphere(0.145*s));
  body.addShape(new CANNON.Sphere(0.11*s), new CANNON.Vec3(0, 0.17*s, 0));
  return body;
}
export const plushRadius = key => 0.145*PLUSH_TYPES[key].size;
export const plushTop = key => 0.285*PLUSH_TYPES[key].size;
