import * as THREE from 'three';

export function mat(color, opts={}){
  return new THREE.MeshStandardMaterial({ color, roughness:0.85, metalness:0.0, flatShading:true, ...opts });
}
export function box(w,h,d,color,x=0,y=0,z=0,opts={}){
  const m = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), mat(color,opts));
  m.position.set(x,y,z); m.castShadow = true; m.receiveShadow = true; return m;
}
export function sphere(r,color,x=0,y=0,z=0,sx=1,sy=1,sz=1,opts={}){
  const m = new THREE.Mesh(new THREE.SphereGeometry(r,8,6), mat(color,opts));
  m.position.set(x,y,z); m.scale.set(sx,sy,sz); m.castShadow = true; return m;
}
export function cyl(rt,rb,h,color,x=0,y=0,z=0,seg=10,opts={}){
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt,rb,h,seg), mat(color,opts));
  m.position.set(x,y,z); m.castShadow = true; return m;
}
export function cone(r,h,color,x=0,y=0,z=0,opts={}){
  const m = new THREE.Mesh(new THREE.ConeGeometry(r,h,8), mat(color,opts));
  m.position.set(x,y,z); m.castShadow = true; return m;
}
// 캔버스 텍스트 스프라이트 (라벨/디스플레이용)
export function makeTextSprite(text, { size=48, color='#fff', bg='rgba(0,0,0,0.55)', width=512, height=128, font='Jua, sans-serif' }={}){
  const c = document.createElement('canvas'); c.width = width; c.height = height;
  const g = c.getContext('2d');
  const draw = (t) => {
    g.clearRect(0,0,width,height);
    if (bg){ g.fillStyle = bg; roundRect(g, 4, 4, width-8, height-8, 24); g.fill(); }
    g.fillStyle = color; g.font = size + 'px ' + font; g.textAlign='center'; g.textBaseline='middle';
    const lines = String(t).split('\n');
    lines.forEach((l,i)=> g.fillText(l, width/2, height/2 + (i-(lines.length-1)/2)*size*1.15));
  };
  draw(text);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map:tex, transparent:true, depthTest:true }));
  sp.scale.set(width/height, 1, 1);
  let last = text;
  sp.setText = (t) => { last = t; draw(t); tex.needsUpdate = true; };
  // 웹폰트가 아직 안 실렸으면 로드 뒤 다시 그린다 (대체 폰트로 굳는 것 방지)
  if (document.fonts && document.fonts.status !== 'loaded') document.fonts.ready.then(() => { draw(last); tex.needsUpdate = true; });
  return sp;
}
function roundRect(g,x,y,w,h,r){ g.beginPath(); g.moveTo(x+r,y); g.arcTo(x+w,y,x+w,y+h,r); g.arcTo(x+w,y+h,x,y+h,r); g.arcTo(x,y+h,x,y,r); g.arcTo(x,y,x+w,y,r); g.closePath(); }
export const clamp = (v,a,b) => Math.max(a, Math.min(b, v));
export const lerp = (a,b,t) => a + (b-a)*t;
export const rand = (a,b) => a + Math.random()*(b-a);
