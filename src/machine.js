import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { PLUSH_TYPES, GRIP_PRESETS, poolWeights, pickWeighted } from './data.js';
import { buildPlushMesh, makePlushBody, plushRadius, plushTop, animatePlush } from './plush.js';
import { box, cyl, sphere, mat, makeTextSprite, clamp, rand } from './util.js';
import { sfx } from './audio.js';

export const BASE_H = 0.9;   // 캐비닛 받침 높이 (내부 바닥 = 월드 y BASE_H)
export const CHUTE = 0.42;   // 상품구 한 변
export const TRIM = 0.12;
const FINGER_LEN = 0.26;     // 손가락 길이 (clawSize 배율 적용)
const HINGE_R = 0.06;        // 헤드에서 힌지까지 반경
// 손가락 모양(힌지 기준 로컬, y 아래로 / z 바깥쪽): 바깥으로 불룩했다가 끝이 안으로 감기는 갈고리
const FINGER_PTS = [[0,0],[-0.05,0.045],[-0.10,0.075],[-0.15,0.085],[-0.20,0.065],[-0.24,0.025],[-0.26,-0.01]];
// 기계 종류별 특성
export const KIND = {
  claw:   { fingers:3, control:'free', bridge:false, style:'claw' },
  mini:   { fingers:3, control:'free', bridge:false, style:'mini' },
  ufo:    { fingers:2, control:'two',  bridge:true,  style:'ufo' },
  sweet:  { fingers:3, control:'free', bridge:false, deck:true, style:'sweet' },
  pusher: { style:'pusher' },
};
// 기계 바닥 점유 크기 (가게 배치용): 콘솔 앞부분 포함
export const SWEET = { DW:0.5, deckY:0.28, amp:0.1, period:3.2 };
export function footprint(spec){
  const k = KIND[spec.kind || 'claw'] || KIND.claw;
  if (spec.type === 'gacha') return { w: spec.w + 0.2, d: spec.d + 0.3 };
  return { w: spec.w + 2*TRIM + 0.1, d: spec.d + 2*TRIM + (k.style === 'mini' ? 0.3 : 0.45) };
}

// ---------- 캐비닛 메시 (플레이/가게 공용) ----------
export function buildCabinet(spec){
  const kind = spec.kind || 'claw';
  if (kind === 'pusher') return buildPusherCabinet(spec);
  return buildClawCabinet(spec, KIND[kind]?.style || 'claw');
}

function buildClawCabinet(spec, style){
  const { w, d, h, color } = spec;
  const cs = spec.clawSize || 1;
  const root = new THREE.Group();
  const accent = style === 'ufo' ? 0xff5c8a : style === 'mini' ? 0xffffff : 0x3b3b48;
  const bodyC = style === 'ufo' ? 0xfafafa : color;
  if (style === 'mini'){
    // 탁자 위 미니 크레인: 다리 + 상판 + 작은 몸통
    [[-1,-1],[1,-1],[-1,1],[1,1]].forEach(([sx,sz]) => root.add(box(0.05, 0.72, 0.05, 0xcfa77a, sx*(w/2+0.02), 0.36, sz*(d/2+0.02))));
    root.add(box(w+2*TRIM+0.2, 0.06, d+2*TRIM+0.2, 0xe4bf8f, 0, 0.75, 0));
    root.add(box(w+2*TRIM, BASE_H-0.78, d+2*TRIM, color, 0, 0.78 + (BASE_H-0.78)/2, 0));
    // 앞면 스티커 + 큰 버튼 2개
    root.add(box(0.36, 0.09, 0.012, 0xffffff, 0, BASE_H-0.06, d/2+TRIM+0.006));
    root.add(cyl(0.035, 0.035, 0.03, 0xff4f8b, -0.1, BASE_H+0.015, d/2+TRIM-0.08));
    root.add(cyl(0.035, 0.035, 0.03, 0x5ce1ff, 0.1, BASE_H+0.015, d/2+TRIM-0.08));
  } else {
    // 받침: 속이 빈 상자 (상품구 구멍이 보이도록)
    root.add(box(w+2*TRIM, BASE_H, TRIM, bodyC, 0, BASE_H/2,  d/2+TRIM/2));
    root.add(box(w+2*TRIM, BASE_H, TRIM, bodyC, 0, BASE_H/2, -d/2-TRIM/2));
    root.add(box(TRIM, BASE_H, d, bodyC, -w/2-TRIM/2, BASE_H/2, 0));
    root.add(box(TRIM, BASE_H, d, bodyC,  w/2+TRIM/2, BASE_H/2, 0));
    root.add(box(w+2*TRIM+0.03, 0.08, d+2*TRIM+0.03, accent, 0, 0.04, 0));
    if (style === 'ufo') root.add(box(w+2*TRIM+0.01, 0.5, d+2*TRIM+0.01, color, 0, 0.35, 0)); // 하단 컬러 밴드
  }
  // 콘솔
  const cz = d/2 + TRIM + 0.1;
  const stick = new THREE.Group(); const button = new THREE.Group(); root.add(stick); root.add(button);
  if (style === 'ufo'){
    root.add(box(w*0.55, 0.14, 0.32, 0xffffff, 0, BASE_H-0.07, cz));
    // 버튼 두 개 (1: 옆 이동, 2: 안쪽 이동)
    const b1 = cyl(0.045, 0.045, 0.03, 0xff5c8a, -0.14, BASE_H+0.015, cz); root.add(b1);
    const b2 = cyl(0.045, 0.045, 0.03, 0x5ce1ff, 0.14, BASE_H+0.015, cz); root.add(b2);
    button.add(new THREE.Object3D()); button.position.set(0, BASE_H, cz);
  } else if (style === 'mini'){
    button.position.set(0.1, BASE_H, cz);
  } else {
    root.add(box(w*0.55, 0.14, 0.32, 0xfff6e8, 0.1, BASE_H-0.07, cz));
    stick.position.set(-0.05, BASE_H, cz);
    stick.add(cyl(0.012, 0.012, 0.12, 0x333, 0, 0.06, 0));
    stick.add(sphere(0.032, 0xff3b5c, 0, 0.13, 0));
    const b = cyl(0.035, 0.035, 0.02, 0xffd400, 0, 0, 0); button.add(b); button.position.set(0.15, BASE_H+0.01, cz);
  }
  // 상품구 문 (앞면 왼쪽) — UFO는 바닥 전체가 배출구라 문이 넓다
  if (style === 'ufo'){
    root.add(box(w*0.8, 0.36, 0.012, 0x22222a, 0, BASE_H-0.3, d/2+TRIM+0.012));
    root.add(box(w*0.8+0.04, 0.4, 0.008, 0xff5c8a, 0, BASE_H-0.3, d/2+TRIM+0.004));
  } else {
    root.add(box(CHUTE+0.04, 0.4, 0.012, 0xfafafa, -w/2+CHUTE/2, BASE_H-0.32, d/2+TRIM+0.004));
    root.add(box(CHUTE-0.02, 0.34, 0.012, 0x22222a, -w/2+CHUTE/2, BASE_H-0.32, d/2+TRIM+0.012));
  }
  // LED 디스플레이
  root.add(box(0.4, 0.16, 0.012, 0x101014, w/2-0.3, BASE_H-0.22, d/2+TRIM+0.004));
  const display = makeTextSprite('CREDIT 0', { size:54, color:'#ff3a3a', bg:null, width:512, height:128 });
  display.scale.set(0.38, 0.095, 1); display.position.set(w/2-0.3, BASE_H-0.22, d/2+TRIM+0.02);
  root.add(display);

  // 내부 (물리 좌표계)
  const interior = new THREE.Group(); interior.position.y = BASE_H; root.add(interior);
  const floorC = style === 'ufo' ? 0xffe6ee : 0xfff3d6;
  const bridge = style === 'ufo';
  let plate = null;
  if (style === 'sweet'){
    const DW = 0.5, deckY = 0.28, zBack = -d/2+0.02, zFront = d/2-0.28;
    interior.add(box(w-DW, 0.06, d, 0x9fd68f, DW/2, -0.03, 0));                 // 오른쪽 더미 바닥(잔디)
    interior.add(box(DW, 0.06, zFront+d/2, 0xffffff, -w/2+DW/2, -0.03, (zFront-d/2)/2)); // 왼쪽 바닥(구덩이 앞까지)
    interior.add(box(DW, deckY, zFront-zBack, 0xf6f6f8, -w/2+DW/2, deckY/2, (zBack+zFront)/2));   // 아랫판(고정 받침)
    interior.add(box(0.03, deckY+0.16, zFront-zBack, 0xff8fab, -w/2+DW+0.015, (deckY+0.16)/2, (zBack+zFront)/2)); // 오른쪽 낮은 칸막이
    // 배출구(앞쪽 구덩이)
    interior.add(box(DW, 0.02, d/2-zFront-0.02, 0x0d0d12, -w/2+DW/2, -0.5, (zFront+d/2)/2));
    interior.add(box(DW, 0.5, 0.02, 0x1a1a22, -w/2+DW/2, -0.25, zFront+0.01));
    interior.add(box(0.02, 0.5, d/2-zFront, 0x1a1a22, -w/2+DW-0.01, -0.25, (zFront+d/2)/2));
    // 윗판(왕복)
    plate = box(DW-0.02, 0.06, 0.46, 0xffd6e6, 0, 0, 0); plate.position.set(-w/2+DW/2, deckY+0.03, zBack+0.23); interior.add(plate);
    const stripe = box(DW-0.02, 0.01, 0.05, 0xff5c8a, 0, 0.035, 0.2); plate.add(stripe);
  }
  if (bridge){
    // 브릿지: 바닥 전체가 구덩이, 봉 두 개 위에 상품이 얹힘
    interior.add(box(w, 0.02, d, 0x0d0d12, 0, -0.5, 0));
    [[-1,-1],[1,-1],[-1,1],[1,1]].forEach(([sx,sz]) => interior.add(box(sx>0?0.02:0.02, 0.5, sz>0?0.02:0.02, 0x1a1a22, 0, -0.25, 0)));
    interior.add(box(0.02, 0.5, d, 0x1a1a22, -w/2+0.01, -0.25, 0)); interior.add(box(0.02, 0.5, d, 0x1a1a22, w/2-0.01, -0.25, 0));
    interior.add(box(w, 0.5, 0.02, 0x1a1a22, 0, -0.25, -d/2+0.01)); interior.add(box(w, 0.5, 0.02, 0x1a1a22, 0, -0.25, d/2-0.01));
    const bx0 = -w/2+0.1, bx1 = w/2-0.38, gap = 0.09;
    [-1,1].forEach(sg => { const b = box(bx1-bx0, 0.05, 0.05, 0xc9ced8, (bx0+bx1)/2, 0.3, sg*(gap/2+0.025), { metalness:0.6, roughness:0.35 }); interior.add(b); });
    [-1,1].forEach(sg => { interior.add(box(0.05, 0.3, 0.05, 0xc9ced8, bx0+0.025, 0.15, sg*(gap/2+0.025))); interior.add(box(0.05, 0.3, 0.05, 0xc9ced8, bx1-0.025, 0.15, sg*(gap/2+0.025))); });
    // 낙하 구역 표시
    interior.add(box(w/2-bx1-0.02, 0.01, d-0.1, 0xff5c8a, (bx1+w/2)/2, -0.49, 0));
  } else if (style !== 'sweet') {
    interior.add(box(w-CHUTE, 0.06, d, floorC, CHUTE/2, -0.03, 0));
    interior.add(box(CHUTE, 0.06, d-CHUTE, floorC, -w/2+CHUTE/2, -0.03, -CHUTE/2));
    const chx = -w/2+CHUTE/2, chz = d/2-CHUTE/2;
    interior.add(box(CHUTE, 0.02, CHUTE, 0x0d0d12, chx, -0.5, chz));
    interior.add(box(0.02, 0.5, CHUTE, 0x1a1a22, -w/2+CHUTE+0.01, -0.28, chz));
    interior.add(box(CHUTE, 0.5, 0.02, 0x1a1a22, chx, -0.28, d/2-CHUTE-0.01));
    interior.add(box(0.02, 0.5, CHUTE, 0x1a1a22, -w/2+0.01, -0.28, chz));
    interior.add(box(CHUTE, 0.5, 0.02, 0x1a1a22, chx, -0.28, d/2-0.01));
    interior.add(box(0.03, 0.1, CHUTE+0.03, 0xff6b8a, -w/2+CHUTE+0.015, 0.05, chz));
    interior.add(box(CHUTE+0.03, 0.1, 0.03, 0xff6b8a, chx, 0.05, d/2-CHUTE-0.015));
  }
  // 유리
  const glass = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({
    color:0xd8f3ff, transparent:true, opacity:0.16, roughness:0.05, side:THREE.DoubleSide, depthWrite:false }));
  glass.position.y = h/2; glass.renderOrder = 20; interior.add(glass);
  [[-1,-1],[1,-1],[-1,1],[1,1]].forEach(([sx,sz]) => interior.add(box(0.06, h, 0.06, bodyC, sx*w/2, h/2, sz*d/2)));
  // 천장 + 간판
  const lights = [];
  if (style === 'ufo'){
    interior.add(box(w+2*TRIM, 0.16, d+2*TRIM, bodyC, 0, h+0.08, 0));
    const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12, 0, Math.PI*2, 0, Math.PI/2), mat(color)); dome.scale.set((w+2*TRIM)/2, 0.32, (d+2*TRIM)/2); dome.position.y = h+0.16; dome.castShadow = true; interior.add(dome);
    interior.add(box(w+2*TRIM, 0.22, 0.06, 0xffffff, 0, h+0.27, d/2+TRIM-0.03));
    for (let i=0;i<9;i++){ const c = [0xff5c8a, 0xffffff][i%2]; const l = sphere(0.03, c, -w/2-TRIM+0.1 + i*(w+2*TRIM-0.2)/8, h+0.42, d/2+TRIM-0.02, 1,1,1, { emissive:c, emissiveIntensity:1 }); lights.push(l); interior.add(l); }
  } else if (style === 'mini'){
    const cap = cyl((d+2*TRIM)/2, (d+2*TRIM)/2, w+2*TRIM, color, 0, h+0.02, 0, 16); cap.rotation.z = Math.PI/2; cap.scale.y = 1; interior.add(cap);
    interior.add(box(w+2*TRIM, 0.2, 0.05, 0xffffff, 0, h+0.18, d/2+TRIM-0.1));
    for (let i=0;i<5;i++){ const c = [0xff5c8a, 0xffd34d, 0x5ce1ff, 0x9dff6b][i%4]; const l = sphere(0.025, c, -w/2-TRIM+0.08 + i*(w+2*TRIM-0.16)/4, h+0.3, d/2+TRIM-0.1, 1,1,1, { emissive:c, emissiveIntensity:1 }); lights.push(l); interior.add(l); }
  } else {
    interior.add(box(w+2*TRIM, 0.16, d+2*TRIM, color, 0, h+0.08, 0));
    interior.add(box(w+2*TRIM, 0.26, 0.08, 0xffffff, 0, h+0.29, d/2+TRIM-0.04));
    for (let i=0;i<7;i++){ const c = [0xff5c8a, 0xffd34d, 0x5ce1ff, 0x9dff6b][i%4]; const l = sphere(0.03, c, -w/2-TRIM+0.1 + i*(w+2*TRIM-0.2)/6, h+0.44, d/2+TRIM-0.04, 1,1,1, { emissive:c, emissiveIntensity:1 }); lights.push(l); interior.add(l); }
  }
  const sign = makeTextSprite(spec.name, { size:60, color: style==='ufo' ? '#ff5c8a' : '#ff4f8b', bg:null, width:640, height:128 });
  sign.scale.set(Math.min(w+0.1, 1.6), 0.32, 1); sign.position.set(0, h + (style==='mini' ? 0.18 : 0.29), d/2+TRIM+0.01); // 이름표는 표시하지 않음
  // 레일 + 캐리지
  const railY = h-0.09;
  interior.add(box(0.05, 0.05, d, 0x555566, -w/2+0.04, railY, 0));
  interior.add(box(0.05, 0.05, d, 0x555566,  w/2-0.04, railY, 0));
  const crossBar = box(w, 0.04, 0.04, 0x777788, 0, railY, 0); interior.add(crossBar);
  const carriage = box(0.13, 0.1, 0.13, style==='ufo' ? 0xff5c8a : 0xff4f8b, 0, railY, 0); interior.add(carriage);
  const cable = cyl(0.006, 0.006, 1, 0x333333, 0, 0, 0, 6); interior.add(cable);
  // 집게
  const nF = KIND[spec.kind || 'claw']?.fingers || 3;
  const claw = new THREE.Group(); interior.add(claw);
  const head = cyl(0.08*cs, 0.065*cs, 0.1*cs, 0xc9ced8, 0, 0, 0, 10, { metalness:0.6, roughness:0.35 }); claw.add(head);
  claw.add(sphere(0.06*cs, style==='ufo' ? 0xff5c8a : 0xff4f8b, 0, 0.07*cs, 0));
  const fingers = [];
  for (let i=0;i<nF;i++){
    const th = fingerAngleY(i, nF);
    const pivot = new THREE.Group(); pivot.rotation.y = th; pivot.position.set(HINGE_R*cs*Math.sin(th), -0.05*cs, HINGE_R*cs*Math.cos(th)); claw.add(pivot);
    const arm = new THREE.Group(); pivot.add(arm);
    const curve = new THREE.CatmullRomCurve3(FINGER_PTS.map(([y,z]) => new THREE.Vector3(0, y*cs, z*cs)));
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 12, 0.015*cs, 6, false), mat(0xe4e8f0, { metalness:0.6, roughness:0.35 }));
    tube.castShadow = true; arm.add(tube);
    arm.add(sphere(0.022*cs, 0xff8fab, 0, -0.26*cs, -0.01*cs));
    fingers.push({ pivot, arm });
  }
  return { root, interior, display, sign, lights, crossBar, carriage, cable, claw, head, fingers, stick, button, plate, dims:{w,d,h}, cs, style };
}
function fingerAngleY(i, n){ return n === 2 ? (i===0 ? Math.PI/2 : -Math.PI/2) : i*Math.PI*2/3; }

// 밀어뽑기(푸시 캐처) 캐비닛: 선반 위 상품을 막대로 밀어 떨어뜨림
function buildPusherCabinet(spec){
  const { w, d, h, color } = spec;
  const root = new THREE.Group();
  root.add(box(w+2*TRIM, BASE_H, d+2*TRIM, color, 0, BASE_H/2, 0));
  root.add(box(w+2*TRIM+0.03, 0.08, d+2*TRIM+0.03, 0x3b3b48, 0, 0.04, 0));
  const cz = d/2 + TRIM + 0.1;
  root.add(box(w*0.55, 0.14, 0.32, 0xfff6e8, 0, BASE_H-0.07, cz));
  const stick = new THREE.Group(); root.add(stick);
  root.add(cyl(0.035, 0.035, 0.03, 0x5ce1ff, -0.15, BASE_H+0.015, cz)); root.add(cyl(0.035, 0.035, 0.03, 0x5ce1ff, -0.05, BASE_H+0.015, cz));
  const button = new THREE.Group(); root.add(button); button.position.set(0.15, BASE_H+0.01, cz); button.add(cyl(0.045, 0.045, 0.03, 0xff3b5c, 0, 0, 0));
  root.add(box(w*0.8, 0.36, 0.012, 0x22222a, 0, BASE_H-0.3, d/2+TRIM+0.012));
  root.add(box(0.4, 0.16, 0.012, 0x101014, w/2-0.3, BASE_H-0.22, d/2+TRIM+0.004));
  const display = makeTextSprite('CREDIT 0', { size:54, color:'#ff3a3a', bg:null, width:512, height:128 });
  display.scale.set(0.38, 0.095, 1); display.position.set(w/2-0.3, BASE_H-0.22, d/2+TRIM+0.02); root.add(display);
  const interior = new THREE.Group(); interior.position.y = BASE_H; root.add(interior);
  // 앞쪽 낙하 구역(낮은 바닥) + 뒤쪽 선반
  interior.add(box(w, 0.02, d/2-0.1, 0x22222a, 0, -0.3, d/4+0.05));
  interior.add(box(w, 0.06, d/2+0.1, 0xfff3d6, 0, 0.33, -d/4+0.05, {}));
  interior.add(box(w, 0.3, 0.02, 0x555566, 0, 0.18, 0.1));  // 선반 앞면
  interior.add(box(0.02, 0.3, d, 0x1a1a22, -w/2+0.01, -0.15, 0)); interior.add(box(0.02, 0.3, d, 0x1a1a22, w/2-0.01, -0.15, 0));
  const glass = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color:0xd8f3ff, transparent:true, opacity:0.16, roughness:0.05, side:THREE.DoubleSide, depthWrite:false }));
  glass.position.y = h/2; glass.renderOrder = 20; interior.add(glass);
  [[-1,-1],[1,-1],[-1,1],[1,1]].forEach(([sx,sz]) => interior.add(box(0.06, h, 0.06, color, sx*w/2, h/2, sz*d/2)));
  interior.add(box(w+2*TRIM, 0.16, d+2*TRIM, color, 0, h+0.08, 0));
  interior.add(box(w+2*TRIM, 0.26, 0.08, 0xffffff, 0, h+0.29, d/2+TRIM-0.04));
  const sign = makeTextSprite(spec.name, { size:60, color:'#ff4f8b', bg:null, width:640, height:128 });
  sign.scale.set(Math.min(w+0.1, 1.6), 0.32, 1); sign.position.set(0, h+0.29, d/2+TRIM+0.01);
  const lights = [];
  for (let i=0;i<7;i++){ const c = [0x5ce1ff, 0xffd34d][i%2]; const l = sphere(0.03, c, -w/2-TRIM+0.1 + i*(w+2*TRIM-0.2)/6, h+0.44, d/2+TRIM-0.04, 1,1,1, { emissive:c, emissiveIntensity:1 }); lights.push(l); interior.add(l); }
  // 막대 레일(뒤쪽 위) + 막대
  interior.add(box(w, 0.04, 0.04, 0x777788, 0, 0.62, -d/2+0.1));
  const rod = new THREE.Group(); interior.add(rod);
  rod.add(box(0.06, 0.2, 0.06, 0x777788, 0, 0.5, 0));            // 수직 지지대
  rod.add(box(0.12, 0.06, 0.4, 0xff4f8b, 0, 0.4, 0.2));           // 밀대
  return { root, interior, display, sign, lights, rod, stick, button, dims:{w,d,h}, isPusher:true };
}

// 가게 장식용
export function setClawOpen(cab, open){
  if (!cab.fingers) return;
  cab.fingers.forEach(({arm}) => { arm.rotation.x = -(0.1 + open*0.8); });
}
export function placeClaw(cab, x, y, z){
  if (!cab.claw) return;
  const railY = cab.dims.h-0.09;
  cab.claw.position.set(x, y, z); cab.claw.quaternion.identity();
  cab.carriage.position.set(x, railY, z);
  cab.crossBar.position.z = z;
  const len = railY - 0.05 - y;
  cab.cable.position.set(x, y + len/2, z); cab.cable.quaternion.identity(); cab.cable.scale.y = Math.max(0.01, len);
}

// ---------- 공통 물리 월드 ----------
const H = 1/120;
function makeWorld(self, w, d, h, opts={}){
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
  world.broadphase = new CANNON.SAPBroadphase(world);
  world.allowSleep = false;
  world.solver.iterations = 20;
  self.world = world;
  self.plushMat = new CANNON.Material('plush'); self.wallMat = new CANNON.Material('wall');
  self.fingerMat = new CANNON.Material('finger'); self.headMat = new CANNON.Material('head');
  const soft = { contactEquationStiffness:8e5, contactEquationRelaxation:4, frictionEquationStiffness:8e5, frictionEquationRelaxation:4 };
  world.defaultContactMaterial.restitution = 0; world.defaultContactMaterial.contactEquationStiffness = 8e5; world.defaultContactMaterial.contactEquationRelaxation = 4;
  world.addContactMaterial(new CANNON.ContactMaterial(self.plushMat, self.plushMat, { friction:0.8, restitution:0, ...soft }));
  world.addContactMaterial(new CANNON.ContactMaterial(self.plushMat, self.wallMat, { friction:0.7, restitution:0, ...soft }));
  world.addContactMaterial(new CANNON.ContactMaterial(self.plushMat, self.fingerMat, { friction:0.95, restitution:0, contactEquationStiffness:1.5e6, contactEquationRelaxation:4, frictionEquationStiffness:1.5e6, frictionEquationRelaxation:4 }));
  world.addContactMaterial(new CANNON.ContactMaterial(self.plushMat, self.headMat, { friction:0.4, restitution:0, ...soft }));
  world.addContactMaterial(new CANNON.ContactMaterial(self.fingerMat, self.fingerMat, { friction:0.2, restitution:0 }));
  world.addContactMaterial(new CANNON.ContactMaterial(self.fingerMat, self.wallMat, { friction:0.3, restitution:0 }));
  const addBox = (hx,hy,hz,x,y,z) => { const b = new CANNON.Body({ mass:0, material:self.wallMat }); b.addShape(new CANNON.Box(new CANNON.Vec3(hx,hy,hz))); b.position.set(x,y,z); world.addBody(b); return b; };
  self.addStaticBox = addBox;
  // 벽 + 천장 (바닥은 종류별)
  addBox(0.05, h, d/2+0.1, -w/2-0.05, h/2-0.6, 0);
  addBox(0.05, h, d/2+0.1,  w/2+0.05, h/2-0.6, 0);
  addBox(w/2+0.1, h, 0.05, 0, h/2-0.6, -d/2-0.05);
  addBox(w/2+0.1, h, 0.05, 0, h/2-0.6,  d/2+0.05);
  addBox(w/2+0.1, 0.05, d/2+0.1, 0, h+0.05, 0);
  return world;
}
function addPlushTo(self, key, x, y, z, quat){
  const mesh = buildPlushMesh(key);
  const body = makePlushBody(key, self.plushMat);
  body.position.set(x, y, z);
  if (quat) body.quaternion.copy(quat); else body.quaternion.setFromEuler(rand(-0.4,0.4), rand(0, Math.PI*2), rand(-0.4,0.4));
  self.world.addBody(body); self.cab.interior.add(mesh);
  const p = { key, mesh, body, prevVel:new CANNON.Vec3() };
  self.plushes.push(p); return p;
}
function syncPlushMeshes(self, dt){
  for (const p of self.plushes){ p.mesh.position.copy(p.body.position); p.mesh.quaternion.copy(p.body.quaternion); animatePlush(p.mesh, p.body.velocity, p.prevVel, dt); p.prevVel.copy(p.body.velocity); }
}
function pickKeys(spec){
  const list = spec.stockList; if (list) return list.slice();
  const weights = poolWeights(spec.pool, spec.weights);
  const out = []; for (let i=0;i<spec.count;i++) out.push(pickWeighted(spec.pool, weights)); return out;
}

// ---------- 집게 기계 (일반/미니/UFO) ----------
const AIM_TIME = 25;
const MOTOR_SPEED = 1.8;
export class ClawMachine {
  constructor(spec, opts={}){
    this.spec = spec; this.kind = spec.kind || 'claw'; this.K = KIND[this.kind] || KIND.claw;
    this.nF = this.K.fingers; this.bridge = this.K.bridge; this.control = this.K.control; this.deck = !!this.K.deck; this.fast = false;
    this.playCount = opts.playCount || 0;
    this.credits = 0;
    this.onWin = opts.onWin || (()=>{}); this.onPlayEnd = opts.onPlayEnd || (()=>{}); this.onMessage = opts.onMessage || (()=>{}); this.onCredits = opts.onCredits || (()=>{});
    this.cab = buildCabinet(spec);
    this.group = this.cab.root;
    const { w, d, h } = spec;
    this.cs = this.cab.cs;
    this.home = this.bridge ? { x:-w/2+0.25, z:0 } : this.deck ? { x:-w/2+SWEET.DW/2, z:-d/2+0.02+0.3 } : { x:-w/2+CHUTE/2, z:d/2-CHUTE/2 };
    this.railY = h - 0.09;
    this.anchorY = this.railY - 0.05;
    this.L0 = spec.cable || 0.22;
    this.Lmax = this.anchorY - (FINGER_LEN*this.cs + 0.05);
    this.L = this.L0;
    this.anchor = { x:this.home.x, z:this.home.z };
    this.state = 'idle'; this.t = 0; this.timer = 0; this.phase = 0; this.wasHold = false;
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
    makeWorld(this, w, d, h);
    const addBox = this.addStaticBox;
    if (this.bridge){
      const bx0 = -w/2+0.1, bx1 = w/2-0.38, gap = 0.09;
      [-1,1].forEach(sg => addBox((bx1-bx0)/2, 0.025, 0.025, (bx0+bx1)/2, 0.3, sg*(gap/2+0.025)));
      this.bridgeEnd = bx1;
    } else if (this.deck){
      const DW = SWEET.DW, deckY = SWEET.deckY, zBack = -d/2+0.02, zFront = d/2-0.28;
      addBox((w-DW)/2, 0.05, d/2, DW/2, -0.05, 0);                                   // 오른쪽 바닥
      addBox(DW/2, 0.05, (zFront-zBack)/2 + 0.0, -w/2+DW/2, -0.05, (zBack+zFront)/2 - 0.0); // 왼쪽 바닥(구덩이 앞 제외)
      addBox(DW/2, deckY/2, (zFront-zBack)/2, -w/2+DW/2, deckY/2, (zBack+zFront)/2);   // 아랫판
      addBox(0.015, (deckY+0.16)/2, (zFront-zBack)/2, -w/2+DW+0.015, (deckY+0.16)/2, (zBack+zFront)/2); // 칸막이
      this.plateBody = new CANNON.Body({ mass:0, type:CANNON.Body.KINEMATIC, material:this.wallMat });
      this.plateBody.addShape(new CANNON.Box(new CANNON.Vec3(DW/2-0.01, 0.03, 0.23)));
      this.plateBody.position.set(-w/2+DW/2, deckY+0.03, zBack+0.23); this.world.addBody(this.plateBody);
      this.deckZFront = zFront; this.deckZBack = zBack;
    } else {
      addBox((w-CHUTE)/2, 0.05, d/2, CHUTE/2, -0.05, 0);
      addBox(CHUTE/2, 0.05, (d-CHUTE)/2, -w/2+CHUTE/2, -0.05, -CHUTE/2);
      addBox(0.015, 0.05, CHUTE/2+0.015, -w/2+CHUTE+0.015, 0.05, d/2-CHUTE/2);
      addBox(CHUTE/2+0.015, 0.05, 0.015, -w/2+CHUTE/2, 0.05, d/2-CHUTE-0.015);
    }
    this.anchorBody = new CANNON.Body({ mass:0, type:CANNON.Body.KINEMATIC });
    this.anchorBody.addShape(new CANNON.Sphere(0.01)); this.anchorBody.collisionResponse = false;
    this.anchorBody.position.set(this.home.x, this.anchorY, this.home.z); this.world.addBody(this.anchorBody);
    this.head = new CANNON.Body({ mass:0, type:CANNON.Body.KINEMATIC, material:this.headMat });
    this.head.addShape(new CANNON.Sphere(0.075*cs));
    this.head.position.set(this.home.x, this.anchorY - this.L0, this.home.z); this.world.addBody(this.head);
    this.swing = { ox:0, oz:0, vx:0, vz:0 };
    this.prevAnchorV = { x:0, z:0 }; this.prevAnchor = { x:this.home.x, z:this.home.z }; this.anchorAcc = { x:0, z:0 }; this.acc = 0;
    const n = this.nF;
    this.fingers = []; this.angles = Array(n).fill(0.8); this.reaction = Array(n).fill(0); this.touch = Array(n).fill(false); this.latched = Array(n).fill(false); this.moving = Array(n).fill(false); this.depth = Array(n).fill(0); this.still = Array(n).fill(0); this.closeTime = 0; this.headTouch = false;
    const L = FINGER_LEN*cs;
    for (let i=0;i<n;i++){
      const f = new CANNON.Body({ mass:0, type:CANNON.Body.KINEMATIC, material:this.fingerMat });
      FINGER_PTS.forEach(([y,z], k) => { const r = k===FINGER_PTS.length-1 ? 0.022*cs : 0.016*cs; f.addShape(new CANNON.Sphere(r), new CANNON.Vec3(0, y*cs + L/2, z*cs)); });
      this.world.addBody(f); this.fingers.push(f);
    }
    this.placeFingers(0);
    this.cab.fingers.forEach(({pivot, arm}) => { this.cab.claw.remove(pivot); this.cab.interior.add(pivot); arm.rotation.x = 0; });
  }
  placeFingers(dt){
    const cs = this.cs, L = FINGER_LEN*cs;
    const hq = this.headTarget ? this.headTarget.q : this.head.quaternion;
    const hp = this.headTarget ? new CANNON.Vec3(this.headTarget.x, this.headTarget.y, this.headTarget.z) : this.head.position;
    for (let i=0;i<this.nF;i++){
      const f = this.fingers[i], th = fingerAngleY(i, this.nF);
      const qY = new CANNON.Quaternion().setFromAxisAngle(new CANNON.Vec3(0,1,0), th);
      const qX = new CANNON.Quaternion().setFromAxisAngle(new CANNON.Vec3(1,0,0), -this.angles[i]);
      const q = hq.mult(qY).mult(qX);
      const hinge = hp.vadd(hq.vmult(new CANNON.Vec3(HINGE_R*cs*Math.sin(th), -0.05*cs, HINGE_R*cs*Math.cos(th))));
      const pos = hinge.vadd(q.vmult(new CANNON.Vec3(0, -L/2, 0)));
      if (dt > 0){
        f.velocity.set((pos.x-f.position.x)/dt, (pos.y-f.position.y)/dt, (pos.z-f.position.z)/dt);
        const dq = q.mult(f.quaternion.inverse()); if (dq.w < 0){ dq.x=-dq.x; dq.y=-dq.y; dq.z=-dq.z; }
        f.angularVelocity.set(2*dq.x/dt, 2*dq.y/dt, 2*dq.z/dt);
      } else { f.position.copy(pos); f.quaternion.copy(q); f.velocity.setZero(); f.angularVelocity.setZero(); }
      f.hingeWorld = hinge; f.axisWorld = hq.vmult(qY.vmult(new CANNON.Vec3(1,0,0))); f.targetQ = q;
    }
  }
  readReactions(){
    const plushSet = new Set(this.plushes.map(p => p.body));
    this.headTouch = this.world.contacts.some(e => (e.bi === this.head && plushSet.has(e.bj)) || (e.bj === this.head && plushSet.has(e.bi)));
    const eqs = [...this.world.contacts, ...this.world.frictionEquations];
    for (let i=0;i<this.nF;i++){
      const f = this.fingers[i]; let tau = 0, depth = 0, touch = false;
      for (const e of eqs){
        const isI = e.bi === f, isJ = e.bj === f;
        if (!isI && !isJ) continue;
        const other = isI ? e.bj : e.bi;
        if (!plushSet.has(other)) continue;
        touch = true;
        if (e.ni){ const pi = e.bi.position.vadd(e.ri), pj = e.bj.position.vadd(e.rj); const dsep = pj.vsub(pi).dot(e.ni); if (dsep < 0) depth = Math.max(depth, -dsep); }
        if (!(e.multiplier > 0)) continue;
        const dir = e.ni || e.t;
        const F = dir.scale(isI ? -e.multiplier : e.multiplier);
        if (F.y > -0.35*F.length()) continue;
        const p = f.position.vadd(isI ? e.ri : e.rj);
        tau += p.vsub(f.hingeWorld).cross(F).dot(f.axisWorld);
      }
      this.touch[i] = touch; this.depth[i] = depth;
      const open = clamp(-tau, -4, 4);
      if (this.still[i] < 0.1) this.reaction[i] = 0; else this.reaction[i] = this.reaction[i]*0.92 + open*0.08;
    }
  }
  spawnPlushes(){
    const { w, d } = this.spec;
    this.plushes = [];
    const keys = pickKeys(this.spec);
    if (this.bridge){
      // 봉 위에 눕혀서 일렬로
      const q = new CANNON.Quaternion().setFromEuler(Math.PI/2, 0, 0);
      keys.slice(0, 6).forEach((key, i) => addPlushTo(this, key, -w/2+0.3 + i*0.22, 0.42, 0, q));
      return;
    }
    keys.forEach((key, i) => {
      let x, z, tries = 0;
      const xmin = this.deck ? -w/2 + SWEET.DW + 0.2 : -w/2+0.18;
      do { x = rand(xmin, w/2-0.18); z = rand(-d/2+0.18, d/2-0.18); tries++; }
      while (tries < 20 && !this.deck && x < -w/2+CHUTE+0.15 && z > d/2-CHUTE-0.15);
      addPlushTo(this, key, x, 0.25 + Math.floor(i/7)*0.32 + rand(0,0.1), z);
    });
  }
  updateDisplay(){ this.cab.display.setText(`CREDIT ${this.credits}   PLAY ${this.playCount}`); this.onCredits(this.credits); }
  insertCoin(){ this.credits++; sfx.coin(); this.updateDisplay(); }
  canStart(){ return this.state === 'idle' && this.credits > 0; }
  start(){
    if (!this.canStart()) return false;
    this.credits--; this.playCount++;
    const pr = GRIP_PRESETS[this.spec.grip];
    this.pityPlay = this.spec.pity > 0 && this.playCount % this.spec.pity === 0;
    this.torque = pr.torque * (1 + rand(-pr.torqueVar, pr.torqueVar)) * (this.pityPlay ? 4 : 1);
    this.wonThisPlay = false; this.droppedThisPlay = false; this.carried = null; this.fast = false;
    this.state = 'aim'; this.timer = AIM_TIME; this.phase = 0; this.wasHold = false;
    sfx.start(); this.updateDisplay();
    return true;
  }
  beginDescend(){ this.state = 'descend'; sfx.motor(false); }
  applyMotors(dt){
    const OPEN = 0.8, SPEED = MOTOR_SPEED;
    for (let i=0;i<this.nF;i++){
      const a = this.angles[i], r = this.reaction[i];
      let da = 0;
      if (this.fingerMode === 'close'){
        const T = this.torque;
        const depthLimit = 0.003 + T*0.004;
        if (this.depth[i] > depthLimit && this.closeTime > 0.05) this.latched[i] = true;
        if (!this.latched[i]){ if (a > -0.15) da = this.touch[i] ? -SPEED*0.25 : -SPEED; }
        else {
          const dd = this.depth[i] - 0.001;
          const servo = clamp(dd*60, -0.25, 0.25);
          if (this.touch[i]) da = servo; else if (a > -0.15) da = -0.35;
          if (r > T) da += Math.min(SPEED*0.7, SPEED*0.7*(r - T)/T);
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
  stepPhysics(dt){
    if (dt <= 0) return;
    const avx = (this.anchor.x - this.prevAnchor.x)/dt, avz = (this.anchor.z - this.prevAnchor.z)/dt;
    this.anchorAcc = { x:(avx - this.prevAnchorV.x)/dt, z:(avz - this.prevAnchorV.z)/dt };
    this.prevAnchorV = { x:avx, z:avz }; this.prevAnchor = { x:this.anchor.x, z:this.anchor.z };
    this.anchorBody.position.set(this.anchor.x, this.anchorY, this.anchor.z);
    this.acc += dt; let n = 0;
    while (this.acc >= H && n < 6){ this.substep(H); this.acc -= H; n++; }
    if (n >= 6) this.acc = 0;
  }
  substep(h){
    const sw = this.swing, L = this.L, g = 9.82, damp = (this.spec.swing ?? 0.3) * 6;
    const { w, d } = this.spec;
    sw.vx += (-(g/L)*sw.ox - damp*sw.vx - this.anchorAcc.x*0.6) * h;
    sw.vz += (-(g/L)*sw.oz - damp*sw.vz - this.anchorAcc.z*0.6) * h;
    sw.ox += sw.vx*h; sw.oz += sw.vz*h;
    const maxO = L*0.8, mag = Math.hypot(sw.ox, sw.oz);
    if (mag > maxO){ sw.ox *= maxO/mag; sw.oz *= maxO/mag; sw.vx *= 0.5; sw.vz *= 0.5; }
    let hx = this.anchor.x + sw.ox, hz = this.anchor.z + sw.oz;
    const bx = w/2 - 0.09, bz = d/2 - 0.09;
    if (hx > bx){ hx = bx; sw.ox = hx - this.anchor.x; sw.vx = Math.min(0, sw.vx)*0.3; }
    if (hx < -bx){ hx = -bx; sw.ox = hx - this.anchor.x; sw.vx = Math.max(0, sw.vx)*0.3; }
    if (hz > bz){ hz = bz; sw.oz = hz - this.anchor.z; sw.vz = Math.min(0, sw.vz)*0.3; }
    if (hz < -bz){ hz = -bz; sw.oz = hz - this.anchor.z; sw.vz = Math.max(0, sw.vz)*0.3; }
    const hy = this.anchorY - Math.sqrt(Math.max(0.0001, L*L - sw.ox*sw.ox - sw.oz*sw.oz));
    const hb = this.head;
    hb.velocity.set((hx-hb.position.x)/h, (hy-hb.position.y)/h, (hz-hb.position.z)/h);
    const dir = new CANNON.Vec3(hx-this.anchor.x, hy-this.anchorY, hz-this.anchor.z); dir.normalize();
    const q = new CANNON.Quaternion(); q.setFromVectors(new CANNON.Vec3(0,-1,0), dir);
    const dq = q.mult(hb.quaternion.inverse()); if (dq.w < 0){ dq.x=-dq.x; dq.y=-dq.y; dq.z=-dq.z; }
    hb.angularVelocity.set(2*dq.x/h, 2*dq.y/h, 2*dq.z/h);
    this.headTarget = { x:hx, y:hy, z:hz, q };
    this.applyMotors(h);
    this.placeFingers(h);
    if (this.plateBody){
      const pb = this.plateBody, tz = this.deckZBack + 0.23 + SWEET.amp*(1+Math.sin(this.time*Math.PI*2/SWEET.period))/1;
      pb.velocity.set(0, 0, (tz - pb.position.z)/h);
    }
    this.world.step(H);
    this.readReactions();
  }
  syncMeshes(){
    const dt = this.lastDt || 1/60;
    syncPlushMeshes(this, dt);
    const cab = this.cab;
    const ht = this.headTarget;
    if (ht){ cab.claw.position.set(ht.x, ht.y, ht.z); cab.claw.quaternion.copy(ht.q); }
    this.fingers.forEach((f, i) => { const q = f.targetQ || f.quaternion; cab.fingers[i].pivot.position.copy(f.hingeWorld || f.position); cab.fingers[i].pivot.quaternion.copy(q); });
    cab.carriage.position.set(this.anchor.x, this.railY, this.anchor.z);
    cab.crossBar.position.z = this.anchor.z;
    const A = new THREE.Vector3(this.anchor.x, this.anchorY, this.anchor.z), Hd = new THREE.Vector3().copy(this.head.position);
    const dir = Hd.clone().sub(A), len = dir.length();
    cab.cable.position.copy(A.clone().add(Hd).multiplyScalar(0.5));
    cab.cable.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), dir.normalize());
    cab.cable.scale.y = Math.max(0.01, len);
    if (this.plateBody && cab.plate) cab.plate.position.z = this.plateBody.position.z;
    cab.stick.rotation.set(this.input?.down ? 0.4 : this.input?.up ? -0.4 : 0, 0, this.input?.left ? 0.4 : this.input?.right ? -0.4 : 0);
    cab.button.position.y = BASE_H + (this.input?.hold ? -0.008 : 0.01);
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
  findCarried(){
    let best = null, bd = 1e9;
    for (const p of this.plushes){ const d = p.body.position.distanceTo(this.head.position); if (d < 0.32*this.cs + plushRadius(p.key) && d < bd){ best = p; bd = d; } }
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
        if (this.control === 'two'){
          // UFO: 버튼 1회차 누르는 동안 오른쪽, 2회차 누르는 동안 안쪽, 놓으면 하강
          const hold = !!input.hold;
          if (this.phase === 0 && hold) this.phase = 1;
          if (this.phase === 1){ if (hold) mx = 1; else this.phase = 2; }
          else if (this.phase === 2){ if (hold && !this.wasHold) this.phase = 3; }
          if (this.phase === 3){ if (hold) mz = -1; else this.phase = 4; }
          this.wasHold = hold;
          if (this.phase === 4 || this.timer <= 0) this.beginDescend();
        } else {
          if (input.left) mx -= 1; if (input.right) mx += 1; if (input.up) mz -= 1; if (input.down) mz += 1;
          if (mx || mz){ const l = Math.hypot(mx, mz); mx/=l; mz/=l; }
          if (input.drop || this.timer <= 0) this.beginDescend();
        }
        this.anchor.x = clamp(this.anchor.x + mx*sp*dt, -w/2+0.1, w/2-0.1);
        this.anchor.z = clamp(this.anchor.z + mz*sp*dt, -d/2+0.1, d/2-0.1);
        sfx.motor(!!(mx||mz));
        this.fingerMode = 'open';
        break;
      }
      case 'descend': {
        this.fingerMode = 'open'; this.closeTime = 0;
        this.L += 0.42*dt;
        const targetY = this.pileTopUnderHead() + 0.075*this.cs + 0.008;
        const lmax = this.bridge ? this.anchorY - 0.3 - FINGER_LEN*this.cs*0.55 : this.Lmax;
        if ((this.head.position.y <= targetY && this.L > this.L0 + 0.05) || (this.headTouch && this.L > this.L0 + 0.05) || this.L >= lmax){
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
        const fastK = this.fast ? 3 : 1;
        this.L = Math.max(this.L0, this.L - 0.35*dt*fastK);
        this.t += dt;
        if (this.t > 0.5 && !this.carried){ const c = this.findCarried(); if (c && c.body.position.y > 0.2) this.carried = c; }
        if (this.t > 0.7 && !this.carried) this.fast = true;   // 헛손질: 빨리 돌아간다
        this.dropCheck();
        if (this.L <= this.L0 + 1e-6){ this.state = 'travel'; }
        break;
      }
      case 'travel': {
        this.fingerMode = 'close';
        if (!this.carried) this.carried = this.findCarried();
        this.dropCheck();
        // UFO는 상품을 든 채로 봉 끝(낙하 구역)으로, 일반은 상품구로
        if (!this.carried) this.fast = true;
        const tx = this.bridge ? w/2-0.2 : this.home.x, tz = this.bridge ? 0 : this.home.z;
        if (this.moveAnchorToward(tx, tz, 0.5*(this.fast ? 3 : 1), dt)){ this.state = 'release'; this.t = 0; }
        break;
      }
      case 'release': {
        this.fingerMode = 'open'; this.t += dt;
        const hold = this.fast ? 0.7 : 2.0;
        if (this.t >= hold*0.8 && this.bridge && this.state === 'release'){ if (this.moveAnchorToward(this.home.x, this.home.z, 0.6, dt) && this.t >= hold) this.finish(); }
        else if (this.t >= hold) this.finish();
        break;
      }
    }
    this.stepPhysics(dt);
    this.syncMeshes();
    // 배출 판정: 일반은 상품구 아래, 브릿지는 봉 아래
    const winY = this.bridge ? -0.15 : this.deck ? -0.2 : -0.42;
    for (let i=this.plushes.length-1; i>=0; i--){
      const p = this.plushes[i];
      if (p.body.position.y < winY){
        this.world.removeBody(p.body); this.cab.interior.remove(p.mesh); this.plushes.splice(i,1);
        if (p === this.carried) this.carried = null;
        this.wonThisPlay = true; sfx.win(); this.onWin(p.key);
      }
    }
    this.cab.lights.forEach((l,i) => { l.material.emissiveIntensity = (Math.floor(this.time*3)+i)%2 ? 1 : 0.15; });
  }
  // 헛손질일 때 남은 동작 건너뛰기
  skip(){ if ((this.state === 'lift' || this.state === 'travel' || this.state === 'release') && !this.carried){ this.fast = true; this.L = this.L0; this.anchor.x = this.home.x; this.anchor.z = this.home.z; this.swing = { ox:0, oz:0, vx:0, vz:0 }; this.finish(); return true; } return false; }
  get canSkip(){ return (this.state === 'lift' || this.state === 'travel' || this.state === 'release') && !this.carried; }
  finish(){
    this.state = 'idle'; this.carried = null; sfx.motor(false); if (!this.wonThisPlay) sfx.fail();
    this.onPlayEnd({ won:this.wonThisPlay, dropped:this.droppedThisPlay, pity:this.pityPlay });
  }
  dropCheck(){
    const c = this.carried; if (!c) return;
    if (c.body.position.distanceTo(this.head.position) > 0.4*this.cs + plushRadius(c.key)){
      this.carried = null; this.droppedThisPlay = true; sfx.drop(); this.onMessage('앗! 흘러내렸다...');
    }
  }
  get aimRatio(){ return this.state === 'aim' ? this.timer/AIM_TIME : 0; }
  get hint(){
    if (this.control === 'two') return this.state === 'aim' ? (this.phase <= 1 ? '버튼(스페이스/내리기)을 누르는 동안 오른쪽으로 이동. 놓으면 멈춤' : '다시 누르는 동안 안쪽으로 이동. 놓으면 내려간다') : '';
    if (this.deck) return '집게는 왼쪽 2단 선반 위로 돌아와 놓는다. 윗판이 왕복하며 밀어내니 판 위에 쌓아 앞 구덩이로 떨어뜨려라';
    return '';
  }
}

// ---------- 밀어뽑기 (푸시 캐처) ----------
const PUSH_DIST = 0.07;
export class PusherMachine {
  constructor(spec, opts={}){
    this.spec = spec; this.kind = 'pusher';
    this.playCount = opts.playCount || 0; this.credits = 0;
    this.onWin = opts.onWin || (()=>{}); this.onPlayEnd = opts.onPlayEnd || (()=>{}); this.onMessage = opts.onMessage || (()=>{}); this.onCredits = opts.onCredits || (()=>{});
    this.cab = buildCabinet(spec); this.group = this.cab.root;
    const { w, d, h } = spec;
    this.shelfY = 0.36; this.edgeZ = 0.1; this.rodRestZ = -d/2 + 0.02;
    this.rod = { x:0, z:this.rodRestZ, ext:0 };
    this.state = 'idle'; this.t = 0; this.timer = 0; this.time = 0; this.wonThisPlay = false; this.acc = 0;
    makeWorld(this, w, d, h);
    // 선반(뒤쪽 절반) + 앞쪽 낮은 바닥
    this.addStaticBox(w/2, 0.03, (d/2 + this.edgeZ)/2, 0, this.shelfY - 0.03, -(d/2 - this.edgeZ)/2);
    this.addStaticBox(w/2, 0.02, (d/2 - this.edgeZ)/2, 0, -0.32, (d/2 + this.edgeZ)/2);
    // 밀대 (키네마틱 박스)
    this.rodBody = new CANNON.Body({ mass:0, type:CANNON.Body.KINEMATIC, material:this.wallMat });
    this.rodBody.addShape(new CANNON.Box(new CANNON.Vec3(0.06, 0.03, 0.2)));
    this.rodBody.position.set(0, this.shelfY + 0.04, this.rodRestZ + 0.2); this.world.addBody(this.rodBody);
    this.plushes = [];
    const keys = pickKeys(spec).slice(0, Math.max(1, Math.min(6, Math.floor((w-0.2)/0.25))));
    keys.forEach((key, i) => {
      const x = -w/2 + 0.25 + i*0.25 + rand(-0.02, 0.02);
      const t = PLUSH_TYPES[key];
      const y = this.shelfY + (t.kind==='box' ? t.dims[1]/2 : plushRadius(key)) + 0.01;
      addPlushTo(this, key, x, y, -d/2 + 0.42 + rand(0, 0.03), new CANNON.Quaternion());
    });
    for (let i=0;i<120;i++) this.stepPhysics(1/60);
    this.syncMeshes(); this.updateDisplay();
  }
  updateDisplay(){ this.cab.display.setText(`CREDIT ${this.credits}   PLAY ${this.playCount}`); this.onCredits(this.credits); }
  insertCoin(){ this.credits++; sfx.coin(); this.updateDisplay(); }
  canStart(){ return this.state === 'idle' && this.credits > 0; }
  start(){ if (!this.canStart()) return false; this.credits--; this.playCount++; this.wonThisPlay = false; this.state = 'aim'; this.timer = AIM_TIME; sfx.start(); this.updateDisplay(); return true; }
  stepPhysics(dt){
    if (dt <= 0) return;
    this.acc += dt; let n = 0;
    while (this.acc >= H && n < 6){
      const rb = this.rodBody, tx = this.rod.x, tz = this.rod.z + this.rod.ext + 0.2;
      rb.velocity.set((tx - rb.position.x)/H, 0, (tz - rb.position.z)/H);
      this.world.step(H); this.acc -= H; n++;
    }
    if (n >= 6) this.acc = 0;
  }
  syncMeshes(){
    syncPlushMeshes(this, this.lastDt || 1/60);
    this.cab.rod.position.set(this.rodBody.position.x, 0, this.rodBody.position.z - 0.2);
    this.cab.button.position.y = BASE_H + (this.state === 'push' ? 0.0 : 0.01);
  }
  update(dt, input){
    dt = Math.min(dt, 0.05); this.time += dt; this.input = input; this.lastDt = dt;
    const { w } = this.spec;
    switch (this.state){
      case 'aim': {
        this.timer -= dt;
        let mx = 0, mz = 0; if (input.left) mx -= 1; if (input.right) mx += 1; if (input.up) mz -= 1; if (input.down) mz += 1;
        this.rod.x = clamp(this.rod.x + mx*0.5*dt, -w/2+0.12, w/2-0.12);
        this.rod.z = clamp(this.rod.z + mz*0.4*dt, this.rodRestZ, this.edgeZ - 0.36);   // 앞뒤로도 시작 위치 조절
        sfx.motor(!!(mx||mz));
        if (input.drop || this.timer <= 0){ this.state = 'push'; this.t = 0; sfx.motor(false); sfx.close(); }
        break;
      }
      case 'push': { this.t += dt; this.rod.ext = Math.min(PUSH_DIST, this.t*0.12); if (this.t >= 0.9){ this.state = 'retract'; this.t = 0; } break; }
      case 'retract': { this.t += dt; this.rod.ext = Math.max(0, PUSH_DIST - this.t*0.15); if (this.t >= 0.8){ this.state = 'idle'; this.rod.z = this.rodRestZ; if (!this.wonThisPlay) sfx.fail(); this.onPlayEnd({ won:this.wonThisPlay, dropped:false, pity:false }); } break; }
    }
    this.stepPhysics(dt); this.syncMeshes();
    for (let i=this.plushes.length-1; i>=0; i--){
      const p = this.plushes[i];
      if (p.body.position.z > this.edgeZ + 0.05 && p.body.position.y < -0.05){
        this.world.removeBody(p.body); this.cab.interior.remove(p.mesh); this.plushes.splice(i,1);
        this.wonThisPlay = true; sfx.win(); this.onWin(p.key);
      }
    }
    this.cab.lights.forEach((l,i) => { l.material.emissiveIntensity = (Math.floor(this.time*3)+i)%2 ? 1 : 0.15; });
  }
  skip(){ return false; }
  get canSkip(){ return false; }
  get aimRatio(){ return this.state === 'aim' ? this.timer/AIM_TIME : 0; }
  get hint(){ return this.state === 'aim' ? '◀▶ 좌우 · ▲▼ 앞뒤로 밀대 시작 위치를 맞추고 스페이스/내리기로 민다. 한 판에 7cm.' : ''; }
}

export function createMachine(spec, opts){
  return (spec.kind === 'pusher') ? new PusherMachine(spec, opts) : new ClawMachine(spec, opts);
}
