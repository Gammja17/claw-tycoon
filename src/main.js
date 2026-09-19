import * as THREE from 'three';
import { PLUSH_TYPES, RARITY, SHOPS, MY_MACHINES, GRIP_PRESETS, START_MONEY, SAVE_KEY, WHOLESALE_INTERVAL, PROMOS, DECOR, SLOT_POS, STAFF, EXPANSIONS, FLOOR_EXPANSIONS, BREAKDOWNS, CALLS, itemValue, makeWholesaleOffers, won } from './data.js';
import { createMachine, BASE_H } from './machine.js';
import { StoreScene, slotEconomy, machineDef, bdDef } from './store.js';
import { box, lerp } from './util.js';
import { sfx, setVolume, getVolume } from './audio.js';
import { preload, CHARACTERS, PROPS, ENV } from './assets.js';

// ---------- 저장 ----------
function loadSave(){
  let s = null;
  try { s = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch(e){}
  if (!s) s = { money:START_MONEY, inv:{}, slots:[], playCounts:{}, lastTime:Date.now(), stats:{plays:0, wins:0, spent:0} };
  s.slots = (s.slots || []).map((sl, i) => {
    if (!sl) return null;
    const d = { grip:'normal', pity:0, pityCount:0, clawSize:1, rot:0, cond:100, broken:null, ...sl, stats:{plays:0,wins:0,revenue:0, ...(sl.stats||{})} };
    if (d.x == null){ const p = SLOT_POS[i] || [0, 1]; d.x = p[0]; d.z = p[1]; }
    if (!machineDef(d.machine)) return null;
    return d;
  });
  if (s.rep == null) s.rep = 3;
  if (!s.wholesale) s.wholesale = { time:0, offers:[] };
  if (!s.reviews) s.reviews = [];
  if (!s.promo) s.promo = null;
  if (!s.decor) s.decor = { floor:'tile', wall:'sky', light:'day', env:'city', owned:['tile','sky','day','city','none'] };
  if (!s.decor.env) s.decor.env = 'city';
  if (!s.storeName) s.storeName = '내 인형뽑기 가게';
  if (!s.settings) s.settings = { autoStart:true, mainView:'front' };
  if (!s.staff) s.staff = {};
  if (s.expansion == null) s.expansion = 0;
  if (!s.floors) s.floors = 1;
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
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
app.appendChild(renderer.domElement);
renderer.domElement.tabIndex = 0; renderer.domElement.style.outline = 'none';

const $ = id => document.getElementById(id);
function projectTo(pos3){ const cam = mode === 'store' ? store.camera : play.camera; const v = pos3.clone().project(cam); return { x:(v.x+1)/2*innerWidth, y:(1-v.y)/2*innerHeight, behind:v.z > 1 }; }
function floatText(pos3, text, cls){
  const p = projectTo(pos3);
  const el = document.createElement('div'); el.className = 'float ' + (cls||''); el.textContent = text;
  el.style.left = p.x + 'px'; el.style.top = p.y + 'px';
  document.body.appendChild(el); setTimeout(()=>el.remove(), 1700);
}
// 말풍선: 대상 오브젝트를 따라다닌다
const bubbles = [];
function say(obj, text, cls){
  const el = document.createElement('div'); el.className = 'bubble ' + (cls||''); el.textContent = text; document.body.appendChild(el);
  bubbles.push({ el, obj, until:performance.now() + 2600 });
}
function updateBubbles(){
  const now = performance.now();
  for (let i=bubbles.length-1;i>=0;i--){
    const b = bubbles[i];
    if (now > b.until || mode !== 'store' || !b.obj.visible){ b.el.remove(); bubbles.splice(i,1); continue; }
    const p = projectTo(b.obj.position.clone().add(new THREE.Vector3(0, 1.05*b.obj.scale.y, 0)));
    b.el.style.left = p.x + 'px'; b.el.style.top = p.y + 'px'; b.el.style.opacity = now > b.until - 400 ? String((b.until-now)/400) : '1';
  }
}
let toastT = null;
function toast(t){ const e = $('toast'); e.textContent = t; e.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(()=>e.classList.remove('show'), 2400); }

// ---------- 가게 씬 ----------
const store = new StoreScene(save, { onChange: refreshStoreHUD, floatText, say, toast, onReview: () => { if (!$('m-reviews').classList.contains('hidden')) renderReviews(); }, onCall: (i, price) => queueCall(i, price) });
let mode = 'store';
let play = null;
// Kenney 모델 프리로드 → 소품·직원 다시 그리기
preload([...CHARACTERS, ...PROPS, ...ENV]).then(() => { store.buildProps(); store.buildEnv(); store.buildNav(); store.rebuildStaff(); store.rebuildAll(); });

function resize(){
  renderer.setSize(innerWidth, innerHeight);
  store.resize(innerWidth, innerHeight);
  if (play){ play.camera.aspect = innerWidth/innerHeight; play.camera.updateProjectionMatrix(); }
}
addEventListener('resize', resize); resize();

function refreshStoreHUD(){
  $('su-money').textContent = won(save.money);
  const n = save.slots.filter(Boolean).length;
  const pm = store.promoMult();
  let rate = 0; save.slots.forEach(s => { if (s) rate += slotEconomy(s, save.rep, pm).profitPerMin; });
  $('su-info').textContent = `${n}대 · ${rate >= 0 ? '+' : ''}${won(rate)}/분`;
  $('su-rep').textContent = `⭐ ${save.rep.toFixed(1)}`;
  const staffList = STAFF.filter(st => save.staff[st.id]);
  $('su-staff').textContent = staffList.length ? `${staffList.map(s=>s.icon).join('')} −${won(staffList.reduce((a,s)=>a+s.wage,0))}/분` : '없음';
  const pr = save.promo && save.promo.until > Date.now() ? save.promo : null;
  $('su-promo-chip').classList.toggle('hidden', !pr);
  if (pr) $('su-promo-chip').textContent = `📣 ${pr.name} ×${pr.mult} · ${Math.ceil((pr.until-Date.now())/60000)}분`;
  const broken = save.slots.filter(s => s && s.broken).length;
  const fl = $('su-floors'); fl.classList.toggle('hidden', save.floors <= 1);
  if (save.floors > 1 && fl.dataset.n != String(save.floors) + '-' + store.floor){ fl.dataset.n = String(save.floors) + '-' + store.floor; fl.innerHTML = ''; for (let f=0; f<save.floors; f++){ const b = document.createElement('button'); b.className = 'sm' + (store.floor === f ? '' : ' ghost'); b.textContent = `${f+1}F`; b.onclick = () => { sfx.click(); if (build.on) cancelGhost(); store.setFloor(f); refreshStoreHUD(); }; fl.appendChild(b); } }
  $('su-alert').classList.toggle('hidden', !broken);
  if (broken) $('su-alert').textContent = `⚠ 고장 ${broken}대 — 기계를 클릭해 수리`;
  if (mode === 'play') $('pu-money').textContent = won(save.money);
}

// ---------- 모달 ----------
function openModal(id){ closeModals(); $('backdrop').classList.remove('hidden'); $(id).classList.remove('hidden'); }
function closeModals(){ document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden')); $('backdrop').classList.add('hidden'); }
document.querySelectorAll('.modal .close').forEach(b => b.onclick = () => { sfx.click(); closeModals(); });
$('backdrop').onclick = () => { if ($('m-call').classList.contains('hidden')) closeModals(); };

function plushItem(key, right){
  const t = PLUSH_TYPES[key], r = RARITY[t.rarity];
  const el = document.createElement('div'); el.className = 'item';
  el.innerHTML = `<div class="dot" style="background:#${t.color.toString(16).padStart(6,'0')}">${t.icon ? `<span style="font-size:16px">${t.icon}</span>` : ''}</div>
    <div class="name">${t.name} <span class="tag" style="background:${r.color}">${r.name}</span><div class="sub">시세 ${won(itemValue(key))}</div></div>`;
  if (right) el.appendChild(right);
  return el;
}
const statBox = (v, l) => `<div class="stat"><b>${v}</b><span>${l}</span></div>`;

// 원정 목록
$('su-trip').onclick = () => {
  sfx.click();
  const list = $('trip-list'); list.innerHTML = '';
  SHOPS.forEach(sh => {
    const el = document.createElement('div'); el.className = 'shop-card tile';
    const pool = [...new Set(sh.pool)].map(k => PLUSH_TYPES[k].name).join(', ');
    el.innerHTML = `<div class="head"><div class="swatch" style="background:#${sh.color.toString(16).padStart(6,'0')}">${{mini:'🔬', sweet:'🍬', ufo:'🛸', pusher:'👉'}[sh.kind] || '🕹'}</div>
      <div class="title">${sh.name}<br><span class="tag" style="background:#16a34a">1판 ${won(sh.cost)}</span></div></div>
      <div class="desc" title="${sh.desc}">${sh.desc}</div><div class="desc" title="${pool}">집게 ${GRIP_PRESETS[sh.grip].label}${sh.clawSize<1?' · 작은집게':''}${sh.swing<0.2?' · 회오리':''}${sh.pity?` · 피티 ${sh.pity}판`:''} · ${pool}</div>`;
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
  if (!keys.length) list.innerHTML = '<div class="hint">창고가 비었다. 원정 가서 뽑아오거나 도매에서 사자.</div>';
  keys.sort((a,b)=>PLUSH_TYPES[b].rarity-PLUSH_TYPES[a].rarity).forEach(k => {
    const right = document.createElement('div'); right.className = 'row';
    const v = itemValue(k);
    right.innerHTML = `<span class="chip">×${save.inv[k]}</span>`;
    const b = document.createElement('button'); b.className = 'sm ghost'; b.textContent = `1개 팔기 ${won(v*0.5)}`;
    b.onclick = () => { save.inv[k]--; if (save.inv[k]<=0) delete save.inv[k]; save.money += v*0.5; sfx.cash(); refreshStoreHUD(); renderInv(); persist(); };
    right.appendChild(b); list.appendChild(plushItem(k, right));
  });
}
$('su-inv').onclick = () => { sfx.click(); renderInv(); openModal('m-inv'); };
// 도매
function refreshWholesale(){ if (Date.now() - save.wholesale.time > WHOLESALE_INTERVAL){ save.wholesale = { time:Date.now(), offers:makeWholesaleOffers() }; persist(); } }
function renderWholesale(){
  refreshWholesale();
  const left = Math.max(0, WHOLESALE_INTERVAL - (Date.now() - save.wholesale.time));
  $('whole-timer').textContent = `다음 입고까지 ${Math.ceil(left/60000)}분`;
  const list = $('whole-list'); list.innerHTML = '';
  const offers = save.wholesale.offers.filter(o => o.qty > 0);
  if (!offers.length) list.innerHTML = '<div class="hint">다 팔렸다. 다음 입고를 기다리자.</div>';
  offers.forEach(o => {
    const right = document.createElement('div'); right.className = 'row';
    right.innerHTML = `<span class="chip">재고 ${o.qty} · ${won(o.price)}</span>`;
    [1, 5, o.qty].forEach((n, idx) => {
      if (idx === 2 && o.qty <= 5) return;
      const b = document.createElement('button'); b.className = 'sm' + (idx ? ' ghost' : ''); b.textContent = idx === 2 ? `전부 ${won(o.price*n)}` : `${n}개`; b.disabled = save.money < o.price*Math.min(n, o.qty);
      b.onclick = () => { const q = Math.min(n, o.qty); if (save.money < o.price*q) return; save.money -= o.price*q; o.qty -= q; save.inv[o.key] = (save.inv[o.key]||0)+q; sfx.buy(); refreshStoreHUD(); renderWholesale(); persist(); };
      right.appendChild(b);
    });
    list.appendChild(plushItem(o.key, right));
  });
}
$('su-whole').onclick = () => { sfx.click(); renderWholesale(); openModal('m-whole'); };
$('su-help').onclick = () => { sfx.click(); openModal('m-help'); };
$('su-settings').onclick = () => { sfx.click(); $('set-vol').value = Math.round(getVolume()*100); $('set-vol-v').textContent = $('set-vol').value + '%'; openModal('m-settings'); };
$('set-vol').oninput = e => { setVolume(e.target.value/100); $('set-vol-v').textContent = e.target.value + '%'; };
$('set-vol').onchange = () => sfx.click();
$('set-reset').onclick = () => { if (!confirm('정말 초기화할까? 가게·돈·창고·리뷰가 전부 사라진다.')) return; try { localStorage.removeItem(SAVE_KEY); } catch(e){} location.reload(); };
// 직원
function renderStaff(){
  const list = $('staff-list'); list.innerHTML = '';
  STAFF.forEach(st => {
    const on = !!save.staff[st.id];
    const el = document.createElement('div'); el.className = 'shop-card';
    el.innerHTML = `<div class="swatch" style="background:${on ? '#dcfce7' : '#f3f0f5'}">${st.icon}</div><div class="body"><div class="title">${st.name} <span class="tag" style="background:${on ? '#16a34a' : '#8a7a86'}">${on ? '근무 중' : won(st.wage) + '/분'}</span></div><div class="desc">${st.desc}</div></div>`;
    const b = document.createElement('button'); b.className = on ? 'danger' : ''; b.textContent = on ? '해고' : '고용';
    b.onclick = () => { if (on){ delete save.staff[st.id]; sfx.click(); } else { if (save.money < st.wage*3){ toast('최소 3분치 시급은 있어야 고용된다'); return; } save.staff[st.id] = true; sfx.buy(); toast(`${st.icon} ${st.name} 출근!`); } store.rebuildStaff(); refreshStoreHUD(); renderStaff(); persist(); };
    el.appendChild(b); list.appendChild(el);
  });
}
$('su-staffbtn').onclick = () => { sfx.click(); renderStaff(); openModal('m-staff'); };
// 홍보
function renderPromo(){
  const list = $('promo-list'); list.innerHTML = '';
  const cur = save.promo && save.promo.until > Date.now() ? save.promo : null;
  $('promo-now').textContent = cur ? `진행 중: ${cur.name} ×${cur.mult}, ${Math.ceil((cur.until-Date.now())/60000)}분 남음` : '진행 중인 홍보 없음';
  PROMOS.forEach(p => {
    const el = document.createElement('div'); el.className = 'shop-card';
    el.innerHTML = `<div class="swatch" style="background:#fff3c4">📣</div><div class="body"><div class="title">${p.name}</div><div class="desc">${p.desc}</div></div>`;
    const b = document.createElement('button'); b.textContent = won(p.price); b.disabled = save.money < p.price || !!cur;
    b.onclick = () => {
      save.money -= p.price; save.promo = { id:p.id, name:p.name, mult:p.mult, until:Date.now() + p.mins*60000 };
      save.rep = Math.min(5, save.rep + p.rep); sfx.buy(); toast(`${p.name} 시작! ${p.mins}분간 손님 ×${p.mult}`);
      for (let k=0;k<(p.id==='influ'?4:2);k++) store.addReview('promo', null, 4 + Math.round(Math.random()));
      refreshStoreHUD(); renderPromo(); persist();
    };
    el.appendChild(b); list.appendChild(el);
  });
}
$('su-promo').onclick = () => { sfx.click(); renderPromo(); openModal('m-promo'); };
// 리뷰
function renderReviews(){
  const list = $('review-list'); list.innerHTML = '';
  const rs = save.reviews || [];
  const avg = rs.length ? rs.slice(0, 20).reduce((a,r)=>a+r.stars,0)/Math.min(20, rs.length) : 0;
  $('review-summary').innerHTML = statBox(`⭐ ${save.rep.toFixed(1)}`, '가게 평점') + statBox(avg ? avg.toFixed(1) : '-', '최근 리뷰 평균') + statBox(rs.length, '리뷰 수');
  if (!rs.length) list.innerHTML = '<div class="hint">아직 리뷰가 없다. 손님이 다녀가면 달린다.</div>';
  rs.forEach(r => {
    const el = document.createElement('div'); el.className = 'item';
    const ago = Math.max(0, Math.round((Date.now() - r.t)/60000));
    el.innerHTML = `<div class="name"><b>${r.nick}</b> <span style="color:#f5a623">${'★'.repeat(r.stars)}${'☆'.repeat(5-r.stars)}</span><div style="font-weight:400;margin-top:2px">${r.text}</div><div class="sub">${ago < 1 ? '방금' : ago + '분 전'}</div></div>`;
    list.appendChild(el);
  });
}
$('su-reviews').onclick = () => { sfx.click(); renderReviews(); openModal('m-reviews'); };

// ---------- 전화 이벤트 (기계가 돈 먹음) ----------
const callQueue = [];
function queueCall(i, price){ if (callQueue.some(c => c.i === i)) return; callQueue.push({ i, price }); if ($('m-call').classList.contains('hidden') && mode === 'store') showCall(); }
function showCall(){
  const c = callQueue[0]; if (!c) return;
  const d = save.slots[c.i]; if (!d){ callQueue.shift(); return; }
  const mname = machineDef(d.machine).name;
  $('call-text').textContent = CALLS[Math.floor(Math.random()*CALLS.length)].replace('{store}', save.storeName).replace('{machine}', mname);
  $('call-refund').textContent = `환불해준다 (−${won(c.price*3)})`;
  $('call-hint').textContent = `${mname}: ${bdDef(d.broken)?.name || '고장'} · 수리비 ${won(bdDef(d.broken)?.repair || 0)}`;
  sfx.coin(); openModal('m-call');
}
$('call-refund').onclick = () => { const c = callQueue.shift(); save.money -= c.price*3; save.rep = Math.min(5, save.rep + 0.05); store.addReview('refund', null, 5); sfx.cash(); toast('환불해줬다. 평점 +0.05'); closeModals(); refreshStoreHUD(); persist(); if (callQueue.length) showCall(); };
$('call-ignore').onclick = () => { callQueue.shift(); save.rep = Math.max(1, save.rep - 0.15); store.addReview('ignore', null, 1); sfx.fail(); toast('끊었다. 평점 −0.15, 리뷰가 달렸다'); closeModals(); refreshStoreHUD(); persist(); if (callQueue.length) showCall(); };

// ---------- 건축 모드 ----------
const build = { on:false, ghostMode:null, moveIdx:-1, moveData:null };
function setBuild(on){ build.on = on; store.setBuildMode(on); $('build-bar').classList.toggle('hidden', !on); if (!on) cancelGhost(); }
function cancelGhost(){
  if (build.ghostMode === 'move' && build.moveData){ save.slots[build.moveIdx] = build.moveData; store.rebuildSlot(build.moveIdx); }
  build.ghostMode = null; build.moveIdx = -1; build.moveData = null; store.hideGhost();
}
$('su-build').onclick = () => { sfx.click(); setBuild(true); };
$('bb-done').onclick = () => { sfx.click(); setBuild(false); persist(); };
$('bb-cancel').onclick = () => { sfx.click(); cancelGhost(); };
$('bb-rot').onclick = () => { sfx.click(); store.rotateGhost(build.moveIdx); };
$('bb-buy').onclick = () => { sfx.click(); openBuyPanel(); };
$('bb-decor').onclick = () => { sfx.click(); renderDecor(); openModal('m-decor'); };
$('bb-expand').onclick = () => { sfx.click(); renderExpand(); openModal('m-expand'); };
$('bb-name').onclick = () => renameStore();
const KIND_ICON = { mini:'🔬', claw:'🕹', sweet:'🍬', ufo:'🛸', pusher:'👉', toilet:'🚻', vending:'🥤', bench:'🪑' };
function openBuyPanel(){
  const list = $('buy-list'); list.innerHTML = '';
  MY_MACHINES.forEach(m => {
    const el = document.createElement('div'); el.className = 'shop-card';
    el.innerHTML = `<div class="swatch" style="background:#${m.color.toString(16).padStart(6,'0')}">${m.type==='gacha' ? '🎰' : KIND_ICON[m.kind] || '🕹'}</div>
      <div class="body"><div class="title">${m.name} <span class="tag" style="background:${m.type==='facility' ? '#7c5cff' : '#8a7a86'}">${m.type==='facility' ? '시설' : m.type==='gacha' ? '가챠' : '뽑기'}</span></div><div class="desc">${m.desc ? m.desc + ' ' : ''}${m.type !== 'facility' ? `상품 ${m.capacity}개 · 기본 손님 ${m.baseRate}명/분` : ''}</div></div>`;
    const b = document.createElement('button'); b.textContent = won(m.price); b.disabled = save.money < m.price;
    b.onclick = () => { sfx.click(); closeModals(); cancelGhost(); build.ghostMode = 'buy'; store.showGhost(m.id, 0); toast('바닥을 클릭해 놓을 자리를 정하세요. R로 회전'); };
    el.appendChild(b); list.appendChild(el);
  });
  openModal('m-buy');
}
function renderDecor(){
  const owned = save.decor.owned || (save.decor.owned = ['tile','sky','day']);
  const sw = (cat, o) => cat === 'floor' ? `#${o.base.toString(16).padStart(6,'0')}` : cat === 'wall' ? `#${o.color.toString(16).padStart(6,'0')}` : cat === 'env' ? `#${o.sky.toString(16).padStart(6,'0')}` : `#${o.bg.toString(16).padStart(6,'0')}`;
  ['floor','wall','light','env'].forEach(cat => {
    const list = $('decor-'+cat); list.innerHTML = '';
    DECOR[cat].forEach(o => {
      const el = document.createElement('div'); el.className = 'decor-card' + (save.decor[cat] === o.id ? ' on' : '');
      const has = owned.includes(o.id) || o.price === 0;
      el.innerHTML = `<div class="sw" style="background:${sw(cat,o)}"></div><div class="name">${o.name}<div class="hint">${has ? '보유' : won(o.price)}</div></div>`;
      const b = document.createElement('button'); b.className = 'sm'; b.textContent = save.decor[cat] === o.id ? '적용 중' : has ? '적용' : '구매·적용'; b.disabled = save.decor[cat] === o.id || (!has && save.money < o.price);
      b.onclick = () => { if (!has){ save.money -= o.price; owned.push(o.id); sfx.buy(); save.rep = Math.min(5, save.rep + 0.05); } else sfx.click(); save.decor[cat] = o.id; if (cat === 'env') store.buildEnv(); store.applyDecor(); refreshStoreHUD(); renderDecor(); persist(); };
      el.appendChild(b); list.appendChild(el);
    });
  });
}
function renderExpand(){
  const list = $('expand-list'); list.innerHTML = '';
  EXPANSIONS.forEach(ex => {
    const cur = save.expansion === ex.level, past = save.expansion > ex.level, next = ex.level === save.expansion + 1;
    const el = document.createElement('div'); el.className = 'shop-card';
    el.innerHTML = `<div class="swatch" style="background:${cur ? '#dcfce7' : '#f3f0f5'}">🏗</div><div class="body"><div class="title">${ex.name} <span class="tag" style="background:#8a7a86">${ex.w}×${ex.d}m</span></div><div class="desc">${cur ? '현재 매장' : past ? '완료' : next ? won(ex.price) : '이전 단계부터'}</div></div>`;
    if (next){ const b = document.createElement('button'); b.textContent = won(ex.price); b.disabled = save.money < ex.price; b.onclick = () => { save.money -= ex.price; store.expand(ex.level); sfx.buy(); toast(`🏗 ${ex.name} 완료! 바닥이 ${ex.w}×${ex.d}m가 됐다`); refreshStoreHUD(); renderExpand(); persist(); }; el.appendChild(b); }
    list.appendChild(el);
  });
  const h3 = document.createElement('h3'); h3.textContent = '층 올리기'; list.appendChild(h3);
  FLOOR_EXPANSIONS.forEach(fx => {
    const done = save.floors >= fx.floors, next = save.floors === fx.floors - 1;
    const el = document.createElement('div'); el.className = 'shop-card';
    el.innerHTML = `<div class="swatch" style="background:${done ? '#dcfce7' : '#f3f0f5'}">🏢</div><div class="body"><div class="title">${fx.name} <span class="tag" style="background:#7c5cff">${fx.floors}층</span></div><div class="desc">${fx.desc} ${done ? '· 완료' : next ? '' : '· 이전 층부터'}</div></div>`;
    if (next){ const b = document.createElement('button'); b.textContent = won(fx.price); b.disabled = save.money < fx.price; b.onclick = () => { save.money -= fx.price; save.floors = fx.floors; store.buildRoom(); store.buildNav(); sfx.buy(); toast(`🏢 ${fx.name} 완료! 상단 층 버튼으로 이동`); refreshStoreHUD(); renderExpand(); persist(); }; el.appendChild(b); }
    list.appendChild(el);
  });
}

// 캔버스 클릭/이동
let pointerStart = null, dragging = false, lastPt = null, dragBtn = 0;
renderer.domElement.addEventListener('contextmenu', e => e.preventDefault());
let hold = null; // { i, t }
const HOLD_T = 2.2;
function startHold(i, e){ hold = { i, t:0 }; const h = $('hold'); h.style.left = e.clientX + 'px'; h.style.top = e.clientY + 'px'; h.style.setProperty('--p', '0%'); h.classList.add('on'); }
function endHold(){ if (hold){ hold = null; $('hold').classList.remove('on'); } }
function tickHold(dt){
  if (!hold) return; hold.t += dt; $('hold').style.setProperty('--p', Math.min(100, hold.t/HOLD_T*100) + '%');
  if (hold.t >= HOLD_T){ store.cleanToilet(); const d = save.slots[hold.i]; if (d) floatText(new THREE.Vector3(d.x, 2.2, d.z), '✨ 청소 완료', 'win'); toast('화장실 청소 완료 ✨ 평점 +0.05'); endHold(); pointerStart = null; persist(); }
}
renderer.domElement.addEventListener('pointerdown', e => { if (mode==='store'){ pointerStart = { x:e.clientX, y:e.clientY }; lastPt = { x:e.clientX, y:e.clientY }; dragging = false; dragBtn = e.button;
  if (e.button === 0 && !build.on){ const i = store.pick(new THREE.Vector2(e.clientX/innerWidth*2-1, -(e.clientY/innerHeight*2-1))); const d = i !== null ? save.slots[i] : null; if (d && MY_MACHINES.find(m => m.id === d.machine)?.kind === 'toilet' && (save.toiletDirt||0) > 2) startHold(i, e); }
} });
renderer.domElement.addEventListener('pointerleave', endHold); renderer.domElement.addEventListener('pointercancel', endHold);
renderer.domElement.addEventListener('pointermove', e => {
  if (mode !== 'store') return;
  if (pointerStart && e.buttons){
    if (!dragging && Math.hypot(e.clientX-pointerStart.x, e.clientY-pointerStart.y) > 6){ dragging = true; endHold(); }
    if (dragging && !(build.on && store.ghost && dragBtn === 0)){
      const dx = e.clientX - lastPt.x, dy = e.clientY - lastPt.y;
      if (dragBtn === 2 || e.shiftKey) store.rotateBy(dx); else store.panBy(dx, dy);
    }
    lastPt = { x:e.clientX, y:e.clientY };
  }
  if (!build.on || !store.ghost) return;
  const p = store.pickFloor(new THREE.Vector2(e.clientX/innerWidth*2-1, -(e.clientY/innerHeight*2-1)));
  if (p) store.moveGhost(p.x, p.z, build.moveIdx);
});
renderer.domElement.addEventListener('wheel', e => { if (mode !== 'store') return; e.preventDefault(); store.zoomBy(e.deltaY > 0 ? 1.1 : 0.9); }, { passive:false });
renderer.domElement.addEventListener('dblclick', e => { if (mode === 'store'){ store.resetCamera(); } });
renderer.domElement.addEventListener('pointerup', e => {
  endHold();
  if (mode !== 'store' || !pointerStart) return;
  const wasDrag = dragging; dragging = false; const ps = pointerStart; pointerStart = null;
  if (wasDrag || e.button !== 0) return;
  if (Math.hypot(e.clientX-ps.x, e.clientY-ps.y) > 8) return;
  const ndc = new THREE.Vector2(e.clientX/innerWidth*2-1, -(e.clientY/innerHeight*2-1));
  if (build.on){
    if (store.ghost){
      const p = store.pickFloor(ndc); if (!p) return;
      store.moveGhost(p.x, p.z, build.moveIdx);
      if (!store.ghost.valid){ toast('여기엔 놓을 수 없다 (겹침/벽/입구)'); return; }
      const g = store.ghost;
      if (build.ghostMode === 'buy'){
        const m = machineDef(g.mId); if (save.money < m.price){ toast('돈이 모자라다'); return; }
        save.money -= m.price;
        const data = { machine:m.id, x:g.x, z:g.z, rot:g.rot, floor:store.floor, stock:{}, price:1000, grip:'normal', pity:0, pityCount:0, clawSize:1, cond:100, broken:null, stats:{plays:0,wins:0,revenue:0} };
        let idx = save.slots.indexOf(null); if (idx < 0){ idx = save.slots.length; } save.slots[idx] = data;
        store.rebuildSlot(idx); sfx.buy();
      } else if (build.ghostMode === 'move'){
        const d = build.moveData; d.x = g.x; d.z = g.z; d.rot = g.rot; save.slots[build.moveIdx] = d; store.rebuildSlot(build.moveIdx); sfx.click(); build.moveData = null;
      }
      build.ghostMode = null; build.moveIdx = -1; store.hideGhost(); refreshStoreHUD(); persist();
      return;
    }
    const i = store.pick(ndc); if (i === null || !save.slots[i]) return;
    sfx.click(); build.ghostMode = 'move'; build.moveIdx = i; build.moveData = save.slots[i];
    const d = save.slots[i]; save.slots[i] = null; store.rebuildSlot(i);
    store.showGhost(d.machine, d.rot||0); store.moveGhost(d.x, d.z, i);
    toast('놓을 자리를 클릭. Esc로 취소');
    return;
  }
  if (store.pickSign(ndc)){ sfx.click(); renameStore(); return; }
  const i = store.pick(ndc); if (i === null) return;
  sfx.click();
  if (save.slots[i]) openMachinePanel(i);
});
function renameStore(){
  const n = prompt('가게 이름을 정하세요 (12자 이내)', save.storeName);
  if (n && n.trim()){ store.setName(n.trim().slice(0, 12)); sfx.buy(); persist(); toast(`가게 이름: ${save.storeName}`); }
}
addEventListener('keydown', e => {
  if (mode === 'store' && build.on){
    if (e.key === 'r' || e.key === 'R') store.rotateGhost(build.moveIdx);
    if (e.key === 'Escape'){ if (store.ghost) cancelGhost(); else setBuild(false); }
  }
});

// 기계 패널 (탭)
document.querySelectorAll('#pm-tabs button').forEach(b => b.onclick = () => { document.querySelectorAll('#pm-tabs button').forEach(x => x.classList.toggle('on', x === b)); document.querySelectorAll('#m-machine .tab').forEach(t => t.classList.toggle('on', t.dataset.tab === b.dataset.tab)); });
function openMachinePanel(i){
  const s = save.slots[i]; if (!s) return;
  const m = machineDef(s.machine);
  $('pm-title').textContent = `${m.type==='gacha' ? '🎰' : KIND_ICON[m.kind] || '🕹'} ${m.name}`;
  $('pm-price').value = s.price; $('pm-grip').value = s.grip; $('pm-pity').value = String(s.pity||0); $('pm-claw').value = String(s.clawSize||1);
  const gacha = m.type === 'gacha', pusher = m.kind === 'pusher', fac = m.type === 'facility';
  $('pm-clawrow').classList.toggle('hidden', gacha || pusher || fac); $('pm-try').classList.toggle('hidden', gacha || fac); $('pm-clawhint').classList.toggle('hidden', gacha || pusher || fac);
  $('pm-gachahint').classList.toggle('hidden', !gacha); $('pm-facilityhint').classList.toggle('hidden', !fac);
  $('pm-price').parentElement.classList.toggle('hidden', fac); $('pm-eco').classList.toggle('hidden', fac);
  document.querySelectorAll('#pm-tabs button')[1].classList.toggle('hidden', fac);
  if (fac) $('pm-facilityhint').textContent = m.desc + (m.kind === 'toilet' ? ` 청결도: ${save.toiletDirt > 15 ? '더러움 😷' : save.toiletDirt > 8 ? '보통' : '깨끗 ✨'} — 가게 화면에서 화장실을 꾹 누르면 직접 청소(2초). 청소 담당을 고용하면 자동.` : '');
  document.querySelectorAll('#pm-tabs button')[0].click();
  const draw = () => {
    const eco = slotEconomy(s, save.rep, store.promoMult());
    const bd = s.broken ? bdDef(s.broken) : null;
    $('pm-broken').classList.toggle('hidden', !bd);
    if (bd) $('pm-broken').innerHTML = `⚠ 고장: <b>${bd.name}</b> — ${bd.desc} 수리비 ${won(bd.repair)}`;
    $('pm-repair').classList.toggle('hidden', !bd); $('pm-repair').textContent = bd ? `🔧 수리 (${won(bd.repair)})` : '🔧 수리';
    $('pm-stats').innerHTML = statBox(s.stats.plays, '누적 플레이') + statBox(s.stats.wins, '당첨') + statBox(won(s.stats.revenue), '매출') + (fac ? '' : statBox(`${Math.max(0, Math.round(s.cond ?? 100))}%`, '기계 상태'));
    $('pm-cond').textContent = fac ? '' : `기계 상태가 35% 아래로 내려가면 고장 확률이 생긴다. 기술자를 고용하면 마모가 절반, 고장은 자동 수리.`;
    $('pm-count').textContent = `${eco.total}/${m.capacity}`;
    $('pm-hint').textContent = eco.total ? `평균 시세 ${won(eco.avg)} · 추천 ${won(Math.round(eco.ev*(gacha ? 0.75 : 1.6)/100)*100)}` : '';
    $('pm-eco').textContent = fac ? '' : eco.total ? `${gacha ? '무조건 당첨' : `손님 당첨률 ${(eco.winRate*100).toFixed(0)}%`} · 손님 ${eco.rate.toFixed(1)}명/분 · 예상 순이익 ${won(eco.profitPerMin)}/분 (매출 ${won(eco.rate*s.price*eco.revMult)}/분 − 상품 유출 ${won(eco.rate*eco.winRate*eco.avg)}/분)` : '상품을 넣어야 손님이 온다. (재고 탭)';
    const st = $('pm-stock'); st.innerHTML = '';
    Object.keys(s.stock).filter(k=>s.stock[k]>0).forEach(k => {
      const right = document.createElement('div'); right.className='row';
      right.innerHTML = `<span class="chip">×${s.stock[k]}</span>`;
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
      right.innerHTML = `<span class="chip">창고 ×${save.inv[k]}</span>`;
      const b = document.createElement('button'); b.className='sm'; b.textContent='넣기'; b.disabled = eco.total >= m.capacity;
      b.onclick = () => { save.inv[k]--; if (save.inv[k]<=0) delete save.inv[k]; s.stock[k]=(s.stock[k]||0)+1; sfx.click(); store.refreshStock(i); draw(); refreshStoreHUD(); persist(); };
      const b5 = document.createElement('button'); b5.className='sm ghost'; b5.textContent='+5'; b5.disabled = eco.total >= m.capacity;
      b5.onclick = () => { for (let n=0;n<5;n++){ const tot = Object.values(s.stock).reduce((a,b)=>a+b,0); if (!save.inv[k] || tot >= m.capacity) break; save.inv[k]--; if (save.inv[k]<=0) delete save.inv[k]; s.stock[k]=(s.stock[k]||0)+1; } sfx.click(); store.refreshStock(i); draw(); refreshStoreHUD(); persist(); };
      right.appendChild(b); right.appendChild(b5); iv.appendChild(plushItem(k, right));
    });
  };
  $('pm-price').oninput = () => { s.price = Math.max(100, Math.round((+$('pm-price').value||100)/100)*100); store.refreshStock(i); draw(); refreshStoreHUD(); persist(); };
  $('pm-grip').onchange = () => { s.grip = $('pm-grip').value; draw(); refreshStoreHUD(); persist(); };
  $('pm-pity').onchange = () => { s.pity = +$('pm-pity').value; s.pityCount = 0; draw(); refreshStoreHUD(); persist(); };
  $('pm-claw').onchange = () => { s.clawSize = +$('pm-claw').value; draw(); refreshStoreHUD(); persist(); };
  $('pm-repair').onclick = () => { const bd = bdDef(s.broken); if (!bd) return; if (save.money < bd.repair){ toast('수리비가 모자라다'); return; } save.money -= bd.repair; s.broken = null; s.cond = 100; s.repairT = 0; sfx.buy(); toast('🔧 수리 완료'); store.refreshStock(i); draw(); refreshStoreHUD(); persist(); };
  $('pm-try').onclick = () => {
    const eco = slotEconomy(s, save.rep);
    if (eco.total <= 0){ toast('상품을 먼저 넣어야 해볼 수 있다. (재고 탭)'); return; }
    sfx.click(); closeModals();
    const stockList = []; for (const [k,n] of Object.entries(s.stock)) for (let j=0;j<n;j++) stockList.push(k);
    enterPlay({ ...m, name:`내 ${m.name}`, cost:0, desc:'내 기계 테스트. 뽑으면 창고로 돌아온다 (무료).', grip:s.grip, pity:s.pity||0, clawSize:(s.clawSize||1)*(m.kind==='mini'?0.55:1), swing:0.35, stockList }, { own:i });
  };
  $('pm-sell').onclick = () => {
    if (!confirm('팔면 안의 상품은 창고로 돌아갑니다. 팔까요?')) return;
    for (const [k,n] of Object.entries(s.stock)) save.inv[k]=(save.inv[k]||0)+n;
    save.money += m.price*0.5; save.slots[i] = null; sfx.cash(); store.rebuildSlot(i); refreshStoreHUD(); persist(); closeModals();
  };
  draw(); openModal('m-machine');
}

// ---------- 플레이 모드 ----------
const input = { left:false, right:false, up:false, down:false, drop:false, hold:false };
const KEYMAP = { ArrowLeft:'left', a:'left', ArrowRight:'right', d:'right', ArrowUp:'up', w:'up', ArrowDown:'down', s:'down' };
addEventListener('keydown', e => {
  if (mode !== 'play') return;
  const k = KEYMAP[e.key] || KEYMAP[e.key.toLowerCase()];
  if (k){ input[k] = true; e.preventDefault(); }
  if (e.code === 'Space' || e.key === 'Enter'){
    e.preventDefault(); if (e.repeat) return;
    const m = play.machine; input.hold = true;
    if (m.state === 'aim') input.drop = true;
    else if (m.canSkip) m.skip();
    else if (m.canStart()) startPlay();
  }
  if (e.key === 'c' || e.key === 'C') toggleCam();
});
addEventListener('keyup', e => { const k = KEYMAP[e.key] || KEYMAP[e.key.toLowerCase()]; if (k) input[k] = false; if (e.code === 'Space' || e.key === 'Enter') input.hold = false; });
document.querySelectorAll('#dpad button').forEach(b => {
  const k = b.dataset.k;
  const on = e => { e.preventDefault(); input[k] = true; }, off = e => { e.preventDefault(); input[k] = false; };
  b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointerleave', off); b.addEventListener('pointercancel', off);
});
$('pu-drop').addEventListener('pointerdown', e => { e.preventDefault(); if (!play) return; input.hold = true; const m = play.machine; if (m.state === 'aim') input.drop = true; else if (m.canSkip) m.skip(); else if (m.canStart()) startPlay(); });
['pointerup','pointerleave','pointercancel'].forEach(ev => $('pu-drop').addEventListener(ev, () => { input.hold = false; }));
$('pu-coin').onclick = () => {
  if (!play) return;
  if (save.money < play.shop.cost){ toast('돈이 모자라다... 창고 상품을 팔거나 가게 수익을 기다리자.'); return; }
  save.money -= play.shop.cost; save.stats.spent += play.shop.cost; play.machine.insertCoin(); refreshStoreHUD(); persist();
  if (save.settings.autoStart && play.machine.canStart()) startPlay();
};
$('pu-start').onclick = () => startPlay();
$('pu-skip').onclick = () => { if (play && play.machine.canSkip) play.machine.skip(); };
$('pu-auto').checked = save.settings.autoStart;
$('pu-auto').onchange = () => { save.settings.autoStart = $('pu-auto').checked; persist(); };
function startPlay(){
  if (!play || !play.machine.canStart()) return;
  play.machine.start(); save.stats.plays++;
  $('pu-start').disabled = true;
  showMsg(play.machine.pityPlay ? '...집게가 왠지 든든하다?' : '');
}
$('pu-exit').onclick = () => { sfx.click(); exitPlay(); };
$('pu-cam').onclick = () => toggleCam();
function toggleCam(){ if (play){ save.settings.mainView = save.settings.mainView === 'top' ? 'front' : 'top'; sfx.click(); persist(); } }
let msgT = null;
function showMsg(t){ const e = $('pu-msg'); if (!t){ e.classList.remove('show'); return; } e.textContent = t; e.classList.add('show'); clearTimeout(msgT); msgT = setTimeout(()=>e.classList.remove('show'), 1800); }

function enterPlay(shop, opts={}){
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xdcefff);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xffd0e0, 1.15));
  const sun = new THREE.DirectionalLight(0xffffff, 1.9); sun.position.set(2.5, 5, 3); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left:-3, right:3, top:4, bottom:-2, near:0.5, far:15 }); scene.add(sun);
  const fill = new THREE.PointLight(0xfff0f5, 0.6, 6); fill.position.set(0, BASE_H + shop.h, 1.5); scene.add(fill);
  const ground = box(14, 0.1, 14, 0xf7d9b5, 0, -0.05, 0); ground.receiveShadow = true; scene.add(ground);
  scene.add(box(14, 4, 0.2, 0xcfe8ff, 0, 2, -3));
  const camera = new THREE.PerspectiveCamera(innerWidth/innerHeight < 1 ? 64 : 50, innerWidth/innerHeight, 0.1, 50);
  let machine;
  machine = createMachine(shop, {
    playCount: save.playCounts[shop.id] || 0,
    onWin: key => {
      save.inv[key] = (save.inv[key]||0)+1; save.stats.wins++;
      if (opts.own != null){ const sl = save.slots[opts.own]; if (sl && sl.stock[key]){ sl.stock[key]--; if (sl.stock[key] <= 0) delete sl.stock[key]; store.refreshStock(opts.own); } }
      showMsg(`🎉 ${PLUSH_TYPES[key].name} 획득!`); toast(`${PLUSH_TYPES[key].name}이(가) 창고에 들어갔다 (${RARITY[PLUSH_TYPES[key].rarity].name})`); persist(); },
    onPlayEnd: r => {
      $('pu-start').disabled = !machine.canStart(); $('pu-coin').disabled = false;
      if (!r.won) showMsg(r.dropped ? '아깝다!' : '헛손질...');
      if (opts.own == null) save.playCounts[shop.id] = machine.playCount; persist();
      if (save.settings.autoStart && machine.canStart()) setTimeout(() => { if (play && play.machine === machine && machine.canStart()) startPlay(); }, 900);
    },
    onMessage: showMsg,
    onCredits: c => { $('pu-credit').textContent = opts.own != null ? '무료' : `${c}`; $('pu-start').disabled = !(machine && machine.state==='idle' && c>0); },
  });
  scene.add(machine.group);
  const topCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 1.12, 6);
  topCam.position.set(0, BASE_H + shop.h + 1, 0); topCam.up.set(0, 0, -1); topCam.lookAt(0, BASE_H, 0);
  if (opts.own != null){ machine.credits = 99; machine.updateDisplay(); }
  play = { scene, camera, topCam, machine, shop, own:opts.own, camPos:new THREE.Vector3(0, 2.1, 3.1), camLook:new THREE.Vector3(0, 1.45, 0) };
  camera.position.copy(play.camPos);
  mode = 'play'; renderer.domElement.focus();
  if (build.on) setBuild(false);
  bubbles.forEach(b => b.el.remove()); bubbles.length = 0;
  $('store-ui').classList.add('hidden'); $('play-ui').classList.remove('hidden');
  $('pu-shop').textContent = shop.name; $('pu-desc').textContent = shop.desc;
  $('pu-coin').textContent = `💰 ${won(shop.cost)} 넣기`; $('pu-coin').disabled = false; $('pu-coin').classList.toggle('hidden', opts.own != null);
  $('pu-credit').textContent = opts.own != null ? '무료' : '0'; $('pu-start').disabled = opts.own == null;
  const k = shop.kind || 'claw';
  $('keys').textContent = k === 'ufo' ? '스페이스/내리기 버튼: 1회차 누르는 동안 오른쪽, 2회차 누르는 동안 안쪽 · C 시점' : k === 'pusher' ? '◀▶ 좌우 · ▲▼ 앞뒤 밀대 위치 · 스페이스 밀기 · C 시점' : '방향키/WASD 이동 · 스페이스 내리기 · C 시점 바꾸기';
  refreshStoreHUD();
}
function exitPlay(){
  if (!play) return;
  if (play.own == null && play.machine.credits > 0){ save.money += play.machine.credits * play.shop.cost; toast('남은 크레딧을 환불받았다.'); }
  sfx.motor(false);
  if (play.own == null) save.playCounts[play.shop.id] = play.machine.playCount;
  play = null; mode = 'store'; input.hold = false;
  renderer.setScissorTest(false); renderer.setViewport(0, 0, innerWidth, innerHeight);
  $('play-ui').classList.add('hidden'); $('store-ui').classList.remove('hidden');
  refreshStoreHUD(); persist();
  if (callQueue.length) showCall();
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
      const eco = slotEconomy(s, save.rep); if (eco.total <= 0) break;
      const plays = eco.rate; earned += plays*s.price*(eco.revMult||1); s.stats.plays += Math.round(plays); s.stats.revenue += plays*s.price;
      acc += plays*eco.winRate;
      while (acc >= 1){ acc -= 1; const keys = Object.keys(s.stock).filter(k=>s.stock[k]>0); if (!keys.length) break; const k = keys[Math.floor(Math.random()*keys.length)]; s.stock[k]--; if (s.stock[k]<=0) delete s.stock[k]; s.stats.wins++; lost.push(PLUSH_TYPES[k].name); }
    }
  });
  const wage = STAFF.filter(st => save.staff[st.id]).reduce((a,st)=>a+st.wage,0) * mins;
  if (earned <= 0 && wage <= 0) return;
  save.money += Math.round(earned) - Math.round(wage);
  $('offline-body').innerHTML = statBox(`${Math.round(mins)}분`, '자리 비운 시간') + statBox('+' + won(earned), '매출') + statBox(lost.length + '개', '손님이 가져간 상품') + (wage ? statBox('−' + won(wage), '인건비') : '');
  store.slots.forEach((s, i) => { if (s) store.refreshStock(i); });
  openModal('m-offline');
})();

// ---------- 루프 ----------
let last = performance.now();
function loop(now){
  requestAnimationFrame(loop);
  const dt = Math.min(0.1, Math.max(0, (now - last)/1000)); last = now;
  if (renderer.domElement.width !== Math.floor(innerWidth*renderer.getPixelRatio()) || renderer.domElement.height !== Math.floor(innerHeight*renderer.getPixelRatio())) resize();
  store.sim(dt, mode === 'store');
  if (mode === 'store'){
    store.update(dt); tickHold(dt);
    renderer.setScissorTest(false); renderer.setViewport(0, 0, innerWidth, innerHeight);
    renderer.render(store.scene, store.camera);
    updateBubbles();
  } else if (play){
    const m = play.machine;
    m.update(dt, input); input.drop = false;
    $('pu-timer-fill').style.width = (m.aimRatio*100) + '%';
    $('pu-skip').classList.toggle('hidden', !m.canSkip);
    const hint = m.hint || ''; if ($('pu-hint').textContent !== hint) $('pu-hint').textContent = hint;
    const sh = play.shop;
    const v = { pos:new THREE.Vector3(0, BASE_H+1.25, sh.d/2+2.55), look:new THREE.Vector3(0, BASE_H+0.42, 0), fov:50 };
    const k = 1-Math.pow(0.001, dt);
    play.camPos.lerp(v.pos, k); play.camLook.lerp(v.look, k);
    const W = innerWidth, Hh = innerHeight;
    const topMain = save.settings.mainView === 'top';
    const pipW = Math.max(180, Math.floor(W*0.3)), pipH = Math.floor(pipW*0.78), pipX = W - pipW - 12, pipTop = 84, pipY = Hh - pipTop - pipH;
    const fr = $('pip-frame'); fr.style.left = pipX + 'px'; fr.style.top = pipTop + 'px'; fr.style.width = pipW + 'px'; fr.style.height = pipH + 'px'; $('pip-cap').textContent = topMain ? '정면' : '탑뷰';
    const setTop = (w, h) => { const a = w/h, hh = Math.max(sh.d/2 + 0.2, (sh.w/2 + 0.2)/a), hw = hh*a; Object.assign(play.topCam, { left:-hw, right:hw, top:hh, bottom:-hh }); play.topCam.updateProjectionMatrix(); };
    const setFront = (w, h) => { play.camera.aspect = w/h; play.camera.fov = lerp(play.camera.fov, w/h < 1 ? v.fov + 14 : v.fov, k); play.camera.updateProjectionMatrix(); play.camera.position.copy(play.camPos); play.camera.lookAt(play.camLook); };
    renderer.setScissorTest(false); renderer.setViewport(0, 0, W, Hh);
    if (topMain){ setTop(W, Hh); renderer.render(play.scene, play.topCam); } else { setFront(W, Hh); renderer.render(play.scene, play.camera); }
    renderer.setScissorTest(true); renderer.setViewport(pipX, pipY, pipW, pipH); renderer.setScissor(pipX, pipY, pipW, pipH);
    renderer.clear(true, true, false);
    if (topMain){ setFront(pipW, pipH); renderer.render(play.scene, play.camera); } else { setTop(pipW, pipH); renderer.render(play.scene, play.topCam); }
    renderer.setScissorTest(false);
  }
  saveTimer += dt; if (saveTimer > 5){ saveTimer = 0; persist(); }
}
refreshStoreHUD();
requestAnimationFrame(loop);
window.__game = { save, store, get play(){ return play; }, enterPlay, exitPlay, input, loop, setBuild, build, queueCall };
