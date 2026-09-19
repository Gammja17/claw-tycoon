// Kenney CC0 에셋 로더 (GLB + 애니메이션)
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as skClone } from 'three/addons/utils/SkeletonUtils.js';

const loader = new GLTFLoader();
const cache = new Map();   // name → { scene, animations }
const pending = new Map();

export const CHARACTERS = ['character-female-a','character-female-b','character-female-c','character-female-d','character-female-e','character-female-f','character-male-a','character-male-b','character-male-c','character-male-d','character-male-e','character-male-f'];
export const PROPS = ['arcade-cash-register','arcade-prizes','arcade-column','arcade-vending-machine','arcade-character-employee','furn-bench','furn-plantSmall1','furn-plantSmall2','furn-lampRoundFloor','arcade-arcade-machine','arcade-prize-wheel'];

export function load(name){
  if (cache.has(name)) return Promise.resolve(cache.get(name));
  if (pending.has(name)) return pending.get(name);
  const p = new Promise((res) => {
    const dir = name.startsWith('character-') ? 'chars' : name.startsWith('arcade-') ? 'arcade' : 'furn';
    loader.load(`assets/models/${dir}/${name}.glb`, g => {
      g.scene.traverse(o => { if (o.isMesh){ o.castShadow = true; o.receiveShadow = true; if (o.material && o.material.map) o.material.map.colorSpace = THREE.SRGBColorSpace; } });
      const entry = { scene:g.scene, animations:g.animations || [] };
      cache.set(name, entry); res(entry);
    }, undefined, () => { cache.set(name, null); res(null); });
  });
  pending.set(name, p); return p;
}
export function preload(names){ return Promise.all(names.map(load)); }
export function has(name){ return !!cache.get(name); }
// 복제 (스킨 메시 지원). 없으면 null
export function spawn(name){
  const e = cache.get(name); if (!e) return null;
  const obj = skClone(e.scene);
  obj.userData.asset = name;
  if (e.animations.length){
    const mixer = new THREE.AnimationMixer(obj);
    const actions = {};
    e.animations.forEach(c => { actions[c.name] = mixer.clipAction(c); });
    obj.userData.anim = { mixer, actions, cur:null };
  }
  return obj;
}
// 애니메이션 전환
export function play(obj, name, { loop=true, fade=0.18, speed=1 }={}){
  const a = obj && obj.userData.anim; if (!a || !a.actions[name]) return false;
  const next = a.actions[name];
  if (a.cur === next){ next.timeScale = speed; return true; }
  if (a.cur) a.cur.fadeOut(fade);
  next.reset(); next.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity); next.clampWhenFinished = !loop; next.timeScale = speed; next.fadeIn(fade).play();
  a.cur = next; return true;
}
export function tick(obj, dt){ const a = obj && obj.userData.anim; if (a) a.mixer.update(dt); }
// 바운딩 기준으로 목표 높이에 맞춰 스케일
export function fitHeight(obj, h){
  const box = new THREE.Box3().setFromObject(obj); const size = box.getSize(new THREE.Vector3());
  if (size.y > 0){ const s = h/size.y; obj.scale.setScalar(s); }
  return obj;
}
