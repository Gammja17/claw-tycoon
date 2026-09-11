import * as THREE from 'three';
import { PLUSH_TYPES, RARITY, SHOPS, MY_MACHINES, GRIP_PRESETS, START_MONEY, SAVE_KEY, won } from './data.js';
import { ClawMachine, BASE_H } from './machine.js';
import { StoreScene, slotEconomy } from './store.js';
import { box, clamp, lerp } from './util.js';
import { sfx } from './audio.js';

// ---------- 저장 ----------
function loadSave(){
  let s = null;
  try { s = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch(e){}
  if (!s) s = { money:START_MONEY, inv:{}, slots:[null,null,null,null,null,null], playCounts:{}, lastTime:Date.now(), stats:{plays:0, wins:0, spent:0} };
  s.slots = s.slots.map(sl => sl ? { grip:'normal', pity:0, pityCount:0, ...sl, stats:{plays:0,wins:0,revenue:0, ...(sl.stats||{})} } : null);
  return s;
}
const save = loadSave();
let saveTimer = 0;
function persist(){ save.lastTime = Date.now(); try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch(e){} }

// ---------- 렌더러 ----------
const app = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias:true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
app.appendChild(renderer.domElement);
renderer.domElement.tabIndex = 0; renderer.domElement.style.outline = 'none';

const $ = id => document.getElementById(id);
const floatLayer = document.body;
function floatText(pos3, text, cls){
  const cam = mode === 'store' ? store.camera : play.camera;
  const v = pos3.clone().project(cam);
  const el = document.createElement('div'); el.className = 'float ' + (cls||''); el.textContent = text;
  el.style.left = ((v.x+1)/2*innerWidth) + 'px'; el.style.top = ((1-v.y)/2*innerHeight) + 'px';
  floatLayer.appendChild(el); setTimeout(()=>el.remove(), 1700);
}
let toastT = null;
function toast(t){ const e = $('toast'); e.textContent = t; e.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(()=>e.classList.remove('show'), 2200); }

// ---------- 가게 씬 ----------
const store = new StoreScene(save, { onChange: refreshStoreHUD, floatText });
let mode = 'store';
let play = null; // { machine, scene, camera, shop, camIdx }

function resize(){
  renderer.setSize(innerWidth, innerHeight);
  store.resize(innerWidth, innerHeight);
  if (play){
    play.camera.aspect = innerWidth/innerHeight; play.camera.updateProjectionMatrix();
  }
}
addEventListener('resize', resize); resize();

function refreshStoreHUD(){
  $('su-money').textContent = won(save.money);
  const n = save.slots.filter(Boolean).length;
  let rate = 0; save.slots.forEach(s => { if (s) rate += slotEconomy(s).profitPerMin; });
  $('su-info').textContent = `기계 ${n}대 · 예상 ${won(rate)}/분`;
  if (mode === 'play') $('pu-money').textContent = won(save.money);
}

// ---------- 모달 ----------
function openModal(id){ closeModals(); $('backdrop').classList.remove('hidden'); $(id).classList.remove('hidden'); }
function closeModals(){ document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden')); $('backdrop').classList.add('hidden'); }
document.querySelectorAll('.modal .close').forEach(b => b.onclick = () => { sfx.click(); closeModals(); });
$('backdrop').onclick = closeModals;

function invTotal(){ return Object.values(save.inv).reduce((a,b)=>a+b,0); }
function plushItem(key, right){
  const t = PLUSH_TYPES[key], r = RARITY[t.rarity];
  const el = document.createElement('div'); el.className = 'item';
  el.innerHTML = `<div class="dot" style="background:#${t.color.toString(16).padStart(6,'0')}"></div>
    <div class="name">${t.name} <span class="tag" style="background:${r.color}">${r.name}</span><div class="sub">시세 ${won(r.value)}</div></div>`;
  if (right) el.appendChild(right);
  return el;
}

// 원정 목록
$('su-trip').onclick = () => {
  sfx.click();
  const list = $('trip-list'); list.innerHTML = '';
  SHOPS.forEach(sh => {
    const el = document.createElement('div'); el.className = 'shop-card';
    const pool = sh.pool.map(k => PLUSH_TYPES[k].name).join(', ');
    el.innerHTML = `<div class="swatch" style="background:#${sh.color.toString(16).padStart(6,'0')}"></div>
      <div class="body"><div class="title">${sh.name} <span class="tag" style="background:#1f9d55">1판 ${won(sh.cost)}</span></div>
      <div class="desc">${sh.desc}</div><div class="desc">인형: ${pool} · 집게 ${GRIP_PRESETS[sh.grip].label}${sh.clawSize<1?' · 작은집게':''}${sh.spin?' · 회오리':''}${sh.pity?` · 피티 ${sh.pity}판`:''}</div></div>`;
    const b = document.createElement('button'); b.textContent = '가기';
    b.onclick = () => { sfx.click(); closeModals(); enterPlay(sh); };
    el.appendChild(b); list.appendChild(el);
  });
  openModal('m-trip');
};
// 창고
function renderInv(){
  const list = $('inv-list'); list.innerHTML = '';
  const keys = Object.keys(save.inv).filter(k => save.inv[k] > 0);
  if (!keys.length) list.innerHTML = '<div class="hint">창고가 비었다. 원정 가서 뽑아오자.</div>';
  keys.sort((a,b)=>PLUSH_TYPES[b].rarity-PLUSH_TYPES[a].rarity).forEach(k => {
    const right = document.createElement('div'); right.className = 'row';
    const v = RARITY[PLUSH_TYPES[k].rarity].value;
    right.innerHTML = `<span class="stat">×${save.inv[k]}</span>`;
    const b = document.createElement('button'); b.className = 'sm'; b.textContent = `1개 팔기 ${won(v*0.5)}`;
    b.onclick = () => { save.inv[k]--; if (save.inv[k]<=0) delete save.inv[k]; save.money += v*0.5; sfx.cash(); refreshStoreHUD(); renderInv(); persist(); };
    right.appendChild(b); list.appendChild(plushItem(k, right));
  });
}
$('su-inv').onclick = () => { sfx.click(); renderInv(); openModal('m-inv'); };
$('su-help').onclick = () => { sfx.click(); openModal('m-help'); };

// 슬롯 클릭
let curSlot = -1;
renderer.domElement.addEventListener('pointerdown', e => { if (mode==='store') pointerStart = { x:e.clientX, y:e.clientY }; });
let pointerStart = null;
renderer.domElement.addEventListener('pointerup', e => {
  if (mode !== 'store' || !pointerStart) return;
  if (Math.hypot(e.clientX-pointerStart.x, e.clientY-pointerStart.y) > 8) return;
  const ndc = new THREE.Vector2(e.clientX/innerWidth*2-1, -(e.clientY/innerHeight*2-1));
  const i = store.pick(ndc); if (i === null) return;
  sfx.click(); curSlot = i;
  if (save.slots[i]) openMachinePanel(i); else openBuyPanel(i);
});
function openBuyPanel(i){
  const list = $('buy-list'); list.innerHTML = '';
  MY_MACHINES.forEach(m => {
    const el = document.createElement('div'); el.className = 'shop-card';
    el.innerHTML = `<div class="swatch" style="background:#${m.color.toString(16).padStart(6,'0')}"></div>
      <div class="body"><div class="title">${m.name}</div><div class="desc">인형 ${m.capacity}개 수납 · 기본 손님 ${m.baseRate}명/분</div></div>`;
    const b = document.createElement('button'); b.textContent = won(m.price); b.disabled = save.money < m.price;
    b.onclick = () => {
      save.money -= m.price; save.slots[i] = { machine:m.id, stock:{}, price:1000, grip:'normal', pity:0, pityCount:0, stats:{plays:0,wins:0,revenue:0} };
      sfx.buy(); store.rebuildSlot(i); refreshStoreHUD(); persist(); openMachinePanel(i);
    };
    el.appendChild(b); list.appendChild(el);
  });
  openModal('m-buy');
}
function openMachinePanel(i){
  const s = save.slots[i]; if (!s) return;
  const m = MY_MACHINES.find(x => x.id === s.machine);
  $('pm-title').textContent = `${m.name} (자리 ${i+1})`;
  $('pm-price').value = s.price; $('pm-grip').value = s.grip; $('pm-pity').value = String(s.pity||0);
  const draw = () => {
    const eco = slotEconomy(s);
    $('pm-stats').innerHTML = `<span class="stat">누적 플레이 ${s.stats.plays}</span><span class="stat">당첨 ${s.stats.wins}</span><span class="stat">매출 ${won(s.stats.revenue)}</span>`;
    $('pm-count').textContent = `${eco.total}/${m.capacity}`;
    $('pm-hint').textContent = eco.total ? `평균 시세 ${won(eco.avg)} · 추천 ${won(Math.round(eco.ev*1.6/100)*100)}` : '';
    $('pm-eco').textContent = eco.total ? `손님 당첨률 ${(eco.winRate*100).toFixed(0)}% · 손님 ${eco.rate.toFixed(1)}명/분 · 예상 순이익 ${won(eco.profitPerMin)}/분 (매출 ${won(eco.rate*s.price)}/분 − 인형 유출 ${won(eco.rate*eco.winRate*eco.avg)}/분)` : '인형을 넣어야 손님이 온다.';
    const st = $('pm-stock'); st.innerHTML = '';
    Object.keys(s.stock).filter(k=>s.stock[k]>0).forEach(k => {
      const right = document.createElement('div'); right.className='row';
      right.innerHTML = `<span class="stat">×${s.stock[k]}</span>`;
      const b = document.createElement('button'); b.className='sm ghost'; b.textContent='빼기';
      b.onclick = () => { s.stock[k]--; if (s.stock[k]<=0) delete s.stock[k]; save.inv[k]=(save.inv[k]||0)+1; sfx.click(); store.refreshStock(i); draw(); refreshStoreHUD(); persist(); };
      right.appendChild(b); st.appendChild(plushItem(k, right));
    });
    if (!Object.keys(s.stock).length) st.innerHTML = '<div class="hint">비어 있음</div>';
    const iv = $('pm-inv'); iv.innerHTML = '';
    const keys = Object.keys(save.inv).filter(k => save.inv[k] > 0);
    if (!keys.length) iv.innerHTML = '<div class="hint">창고가 비었다.</div>';
    keys.forEach(k => {
      const right = document.createElement('div'); right.className='row';
      right.innerHTML = `<span class="stat">창고 ×${save.inv[k]}</span>`;
      const b = document.createElement('button'); b.className='sm'; b.textContent='넣기'; b.disabled = eco.total >= m.capacity;
      b.onclick = () => { save.inv[k]--; if (save.inv[k]<=0) delete save.inv[k]; s.stock[k]=(s.stock[k]||0)+1; sfx.click(); store.refreshStock(i); draw(); refreshStoreHUD(); persist(); };
      right.appendChild(b); iv.appendChild(plushItem(k, right));
    });
  };
  $('pm-price').oninput = () => { s.price = Math.max(100, Math.round((+$('pm-price').value||100)/100)*100); store.refreshStock(i); draw(); refreshStoreHUD(); persist(); };
  $('pm-grip').onchange = () => { s.grip = $('pm-grip').value; draw(); refreshStoreHUD(); persist(); };
  $('pm-pity').onchange = () => { s.pity = +$('pm-pity').value; s.pityCount = 0; draw(); refreshStoreHUD(); persist(); };
  $('pm-sell').onclick = () => {
    if (!confirm('기계를 팔면 안의 인형은 창고로 돌아갑니다. 팔까요?')) return;
    for (const [k,n] of Object.entries(s.stock)) save.inv[k]=(save.inv[k]||0)+n;
    save.money += m.price*0.5; save.slots[i] = null; sfx.cash(); store.rebuildSlot(i); refreshStoreHUD(); persist(); closeModals();
  };
  draw(); openModal('m-machine');
}

// ---------- 플레이 모드 ----------
const input = { left:false, right:false, up:false, down:false, drop:false };
const KEYMAP = { ArrowLeft:'left', a:'left', ArrowRight:'right', d:'right', ArrowUp:'up', w:'up', ArrowDown:'down', s:'down' };
addEventListener('keydown', e => {
  if (mode !== 'play') return;
  const k = KEYMAP[e.key] || KEYMAP[e.key.toLowerCase()];
  if (k){ input[k] = true; e.preventDefault(); }
  if (e.code === 'Space' || e.key === 'Enter'){ e.preventDefault(); if (play.machine.state==='aim') input.drop = true; else if (play.machine.canStart()) startPlay(); }
  if (e.key === 'c' || e.key === 'C') toggleCam();
});
addEventListener('keyup', e => { const k = KEYMAP[e.key] || KEYMAP[e.key.toLowerCase()]; if (k) input[k] = false; });
document.querySelectorAll('#dpad button').forEach(b => {
  const k = b.dataset.k;
  const on = e => { e.preventDefault(); input[k] = true; }, off = e => { e.preventDefault(); input[k] = false; };
  b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointerleave', off); b.addEventListener('pointercancel', off);
});
$('pu-drop').addEventListener('pointerdown', e => { e.preventDefault(); if (play) input.drop = true; });
$('pu-coin').onclick = () => {
  if (!play) return;
  if (save.money < play.shop.cost){ toast('돈이 모자라다... 창고 인형을 팔거나 가게 수익을 기다리자.'); return; }
  save.money -= play.shop.cost; save.stats.spent += play.shop.cost; play.machine.insertCoin(); refreshStoreHUD(); persist();
};
$('pu-start').onclick = () => startPlay();
function startPlay(){
  if (!play || !play.machine.canStart()) return;
  play.machine.start(); save.stats.plays++;
  $('pu-start').disabled = true; $('pu-coin').disabled = true;
  showMsg(play.machine.pityPlay ? '...집게가 왠지 든든하다?' : '');
}
$('pu-exit').onclick = () => { sfx.click(); exitPlay(); };
$('pu-cam').onclick = () => toggleCam();
const CAM_NAMES = ['정면', '옆', '탑뷰'];
function toggleCam(){ if (play){ play.camIdx = (play.camIdx+1)%3; sfx.click(); $('pu-cam').textContent = `📷 ${CAM_NAMES[play.camIdx]}`; } }
let msgT = null;
function showMsg(t){ const e = $('pu-msg'); if (!t){ e.classList.remove('show'); return; } e.textContent = t; e.classList.add('show'); clearTimeout(msgT); msgT = setTimeout(()=>e.classList.remove('show'), 1800); }

function enterPlay(shop){
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xdcefff);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xffd0e0, 0.9));
  const sun = new THREE.DirectionalLight(0xffffff, 1.5); sun.position.set(2.5, 5, 3); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left:-3, right:3, top:4, bottom:-2, near:0.5, far:15 }); scene.add(sun);
  const fill = new THREE.PointLight(0xfff0f5, 0.6, 6); fill.position.set(0, BASE_H + shop.h, 1.5); scene.add(fill);
  const ground = box(14, 0.1, 14, 0xf7d9b5, 0, -0.05, 0); ground.receiveShadow = true; scene.add(ground);
  scene.add(box(14, 4, 0.2, 0xcfe8ff, 0, 2, -3));
  // 옆 장식 기계 (분위기)
  const camera = new THREE.PerspectiveCamera(innerWidth/innerHeight < 1 ? 64 : 50, innerWidth/innerHeight, 0.1, 50);
  let machine;
  machine = new ClawMachine(shop, {
    playCount: save.playCounts[shop.id] || 0,
    onWin: key => { save.inv[key] = (save.inv[key]||0)+1; save.stats.wins++; showMsg(`🎉 ${PLUSH_TYPES[key].name} 획득!`); toast(`${PLUSH_TYPES[key].name}이(가) 창고에 들어갔다 (${RARITY[PLUSH_TYPES[key].rarity].name})`); persist(); },
    onPlayEnd: r => { $('pu-start').disabled = !machine.canStart(); $('pu-coin').disabled = false; if (!r.won) showMsg(r.dropped ? '아깝다!' : '헛손질...'); save.playCounts[shop.id] = machine.playCount; persist(); },
    onMessage: showMsg,
    onCredits: c => { $('pu-credit').textContent = `크레딧 ${c}`; $('pu-start').disabled = !(machine && machine.state==='idle' && c>0); },
  });
  scene.add(machine.group);
  const topCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 1.12, 6);
  topCam.position.set(0, BASE_H + shop.h + 1, 0); topCam.up.set(0, 0, -1); topCam.lookAt(0, BASE_H, 0);
  play = { scene, camera, topCam, machine, shop, camIdx:0, camPos:new THREE.Vector3(0, 2.1, 3.1), camLook:new THREE.Vector3(0, 1.45, 0) };
  camera.position.copy(play.camPos);
  mode = 'play'; renderer.domElement.focus();
  $('store-ui').classList.add('hidden'); $('play-ui').classList.remove('hidden');
  $('pu-shop').textContent = shop.name; $('pu-desc').textContent = shop.desc;
  $('pu-coin').textContent = `💰 ${won(shop.cost)} 넣기`; $('pu-coin').disabled = false;
  $('pu-credit').textContent = '크레딧 0'; $('pu-start').disabled = true; $('pu-cam').textContent = '📷 정면';
  refreshStoreHUD();
}
function exitPlay(){
  if (!play) return;
  if (play.machine.credits > 0){ save.money += play.machine.credits * play.shop.cost; toast('남은 크레딧을 환불받았다.'); }
  sfx.motor(false);
  save.playCounts[play.shop.id] = play.machine.playCount;
  play = null; mode = 'store';
  $('play-ui').classList.add('hidden'); $('store-ui').classList.remove('hidden');
  refreshStoreHUD(); persist();
}

// ---------- 부재중 수익 ----------
(function offline(){
  const mins = Math.min(120, (Date.now() - (save.lastTime||Date.now()))/60000);
  if (mins < 1) return;
  let earned = 0, lost = [];
  save.slots.forEach(s => {
    if (!s) return;
    let acc = 0;
    for (let t=0; t<mins; t++){
      const eco = slotEconomy(s); if (eco.total <= 0) break;
      const plays = eco.rate; earned += plays*s.price; s.stats.plays += Math.round(plays); s.stats.revenue += plays*s.price;
      acc += plays*eco.winRate;
      while (acc >= 1){ acc -= 1; const keys = Object.keys(s.stock).filter(k=>s.stock[k]>0); if (!keys.length) break; const k = keys[Math.floor(Math.random()*keys.length)]; s.stock[k]--; if (s.stock[k]<=0) delete s.stock[k]; s.stats.wins++; lost.push(PLUSH_TYPES[k].name); }
    }
  });
  if (earned <= 0) return;
  save.money += Math.round(earned);
  $('offline-body').innerHTML = `<div class="stat">${Math.round(mins)}분 동안</div><div class="stat" style="color:#1f9d55">매출 +${won(earned)}</div><div class="stat">손님이 가져간 인형 ${lost.length}개</div>`;
  store.slots.forEach((_, i) => store.refreshStock(i));
  openModal('m-offline');
})();

// ---------- 루프 ----------
let last = performance.now();
function loop(now){
  requestAnimationFrame(loop);
  const dt = Math.min(0.1, (now - last)/1000); last = now;
  store.sim(dt, mode === 'store');
  if (mode === 'store'){
    store.update(dt);
    renderer.render(store.scene, store.camera);
  } else if (play){
    const m = play.machine;
    m.update(dt, input); input.drop = false;
    $('pu-timer-fill').style.width = (m.aimRatio*100) + '%';
    // 카메라: 정면 / 옆 / 탑뷰(뚜껑 안쪽에서 수직 하향)
    const sh = play.shop;
    const views = [
      { pos:new THREE.Vector3(0, BASE_H+1.25, sh.d/2+2.55), look:new THREE.Vector3(0, BASE_H+0.42, 0), fov:50 },
      { pos:new THREE.Vector3(sh.w/2+2.3, BASE_H+1.1, 0.4), look:new THREE.Vector3(0, BASE_H+0.5, 0), fov:50 },
    ];
    if (play.camIdx === 2){
      const a = innerWidth/innerHeight, hh = Math.max(sh.d/2 + 0.2, (sh.w/2 + 0.2)/a), hw = hh*a;
      Object.assign(play.topCam, { left:-hw, right:hw, top:hh, bottom:-hh }); play.topCam.updateProjectionMatrix();
      renderer.render(play.scene, play.topCam);
    }
    else {
      const v = views[play.camIdx];
      const k = 1-Math.pow(0.001, dt);
      play.camPos.lerp(v.pos, k); play.camLook.lerp(v.look, k);
      play.camera.fov = lerp(play.camera.fov, play.camera.aspect < 1 ? v.fov + 14 : v.fov, k); play.camera.updateProjectionMatrix();
      play.camera.position.copy(play.camPos); play.camera.lookAt(play.camLook);
      renderer.render(play.scene, play.camera);
    }
  }
  saveTimer += dt; if (saveTimer > 5){ saveTimer = 0; persist(); }
}
refreshStoreHUD();
requestAnimationFrame(loop);
window.__game = { save, store, get play(){ return play; }, enterPlay, exitPlay, input };
