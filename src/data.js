// 게임 데이터 카탈로그
export const START_MONEY = 30000;
export const SAVE_KEY = 'claw-tycoon-save-v1';

// 인형 종류 (희귀도 0~3)
export const PLUSH_TYPES = {
  bear:    { name:'곰돌이',   rarity:0, color:0xc98a4b, belly:0xf1d3a5, ear:'round',  size:1.0 },
  bunny:   { name:'토끼',     rarity:0, color:0xf6f0f0, belly:0xffc7d6, ear:'long',   size:0.95 },
  duck:    { name:'오리',     rarity:0, color:0xffd94a, belly:0xffe98c, ear:'none',   beak:true, size:0.85 },
  cat:     { name:'고양이',   rarity:1, color:0x8f8f9a, belly:0xffffff, ear:'pointy', size:0.95 },
  frog:    { name:'개구리',   rarity:1, color:0x6bc46a, belly:0xd8f3b0, ear:'none',   frogEyes:true, size:0.9 },
  penguin: { name:'펭귄',     rarity:1, color:0x2f3742, belly:0xffffff, ear:'none',   beak:true, size:1.0 },
  panda:   { name:'판다',     rarity:2, color:0xf5f5f5, belly:0xf5f5f5, ear:'round',  earColor:0x222222, patches:true, size:1.15 },
  unicorn: { name:'유니콘',   rarity:2, color:0xf3e6ff, belly:0xffffff, ear:'pointy', horn:true, size:1.05 },
  dragon:  { name:'아기용',   rarity:3, color:0x7b4dd6, belly:0xffd166, ear:'pointy', wings:true, size:1.2 },
  goldbear:{ name:'황금곰',   rarity:3, color:0xffc321, belly:0xfff1b8, ear:'round',  size:1.3, shiny:true },
};
export const RARITY = [
  { name:'일반', value:3000,  color:'#8fa3b1' },
  { name:'고급', value:8000,  color:'#3fbf7f' },
  { name:'희귀', value:20000, color:'#4f8cff' },
  { name:'전설', value:60000, color:'#ff5fa2' },
];
export const RARITY_WEIGHT = [6, 3, 1.4, 0.5];

// 집게 세팅 프리셋: torque = 손가락 모터 토크(N·m). 인형은 손가락 마찰로만 잡힌다.
// 인형 1개 무게 ≈ 4N, 지렛대 0.15m 기준 3손가락이 버티려면 토크 ≈ 0.25 이상 필요
// 측정: 들어올린 인형이 손가락 하나에 주는 준정적 반력 ≈ 곰/토끼 0.25, 판다 0.35, 용 0.45 N·m
export const GRIP_PRESETS = {
  loose:  { label:'느슨함 (너무해)', torque:0.15, torqueVar:0.2 },
  normal: { label:'보통',           torque:0.32, torqueVar:0.15 },
  strong: { label:'짱짱함',         torque:0.7,  torqueVar:0.1 },
};

// 다른 가게들 (원정)
// swing: 케이블 감쇠(작을수록 회오리(스윙) 테크닉이 잘 먹힘). pity: N판마다 1번 토크 4배. clawSize: 집게 크기
export const SHOPS = [
  { id:'stationery', name:'동네 문방구 뽑기', cost:500, desc:'집게가 너무 느슨하다. 들어올리면 흘러내린다. 상품구 옆 인형을 밀거나, 떨어뜨려 탑을 쌓거나, 흔들어서 쳐 넣어라.',
    grip:'loose', pity:0, clawSize:1.0, swing:0.35, pool:['bear','bunny','duck'], count:20, color:0xff8fab, w:1.5,d:1.1,h:1.65 },
  { id:'station', name:'역전 뽑기샵', cost:1000, desc:'평소엔 느슨. 소문으로는 30판마다 한 번 꽉 잡아준다고... LED 카운터를 세라.',
    grip:'loose', pity:30, clawSize:1.0, swing:0.35, pool:['bear','bunny','duck','cat','frog','penguin'], count:18, color:0x7cc6fe, w:1.6,d:1.2,h:1.75 },
  { id:'tiny', name:'작은집게 오락실', cost:500, desc:'집게가 작다. 큰 인형은 손가락이 감싸지 못해 빠진다. 오리처럼 작은 인형을 정중앙으로.',
    grip:'normal', pity:0, clawSize:0.65, swing:0.35, pool:['duck','bunny','bear','panda'], count:18, color:0xa0e7a0, w:1.5,d:1.1,h:1.65 },
  { id:'tornado', name:'회오리 크레인', cost:1000, desc:'케이블이 길고 잘 흔들린다. 조이스틱을 빠르게 흔들어 집게를 스윙시킨 채 내리면 인형을 쳐서 날릴 수 있다.',
    grip:'normal', pity:0, clawSize:1.0, swing:0.06, cable:0.32, pool:['cat','frog','penguin','unicorn'], count:16, color:0xb28dff, w:1.6,d:1.2,h:1.75 },
  { id:'strong', name:'짱짱 프리미엄', cost:2000, desc:'집게가 짱짱하다. 정중앙으로 집으면 웬만하면 온다. 대신 비싸고 인형이 크고 무겁다.',
    grip:'strong', pity:0, clawSize:1.0, swing:0.35, pool:['panda','unicorn','penguin','dragon'], count:14, color:0xffb36b, w:1.7,d:1.3,h:1.85 },
  { id:'legend', name:'전설의 황금기계', cost:5000, desc:'느슨한데 20판 피티가 있다는 소문. 황금곰이 산다.',
    grip:'loose', pity:20, clawSize:1.1, swing:0.35, pool:['panda','unicorn','dragon','goldbear'], count:10, color:0xffd166, w:1.8,d:1.4,h:1.85 },
];

// 내 가게에서 살 수 있는 기계
export const MY_MACHINES = [
  { id:'small', name:'소형 크레인', price:40000,  capacity:8,  baseRate:3, color:0xffa4c4, w:1.3,d:1.0,h:1.2 },
  { id:'mid',   name:'중형 크레인', price:120000, capacity:14, baseRate:5, color:0x8fd3ff, w:1.6,d:1.2,h:1.4 },
  { id:'big',   name:'대형 크레인', price:350000, capacity:24, baseRate:8, color:0xffe08a, w:1.9,d:1.4,h:1.6 },
];
// 손님이 이길 확률(집게 세팅별). 작은 집게면 ×0.6
export const CUSTOMER_WINRATE = { loose:0.05, normal:0.13, strong:0.32 };
// 도매 시장: 10분마다 일반/고급 인형 입고 (희귀·전설은 원정 전용)
export const WHOLESALE_INTERVAL = 10*60*1000;
export function makeWholesaleOffers(){
  const keys = Object.keys(PLUSH_TYPES).filter(k => PLUSH_TYPES[k].rarity <= 1);
  const pick = [...keys].sort(() => Math.random()-0.5).slice(0, 4);
  return pick.map(k => { const r = PLUSH_TYPES[k].rarity; return { key:k, qty: r===0 ? 4+Math.floor(Math.random()*4) : 2+Math.floor(Math.random()*3), price: Math.round(RARITY[r].value*(r===0?0.7:0.8)/100)*100 }; });
}
export const SLOT_POS = [[-2.7,-1.7],[0,-1.7],[2.7,-1.7],[-2.7,1.1],[0,1.1],[2.7,1.1]];

export function poolWeights(pool){
  return pool.map(k => RARITY_WEIGHT[PLUSH_TYPES[k].rarity]);
}
export function pickWeighted(keys, weights){
  let t = weights.reduce((a,b)=>a+b,0), r = Math.random()*t;
  for (let i=0;i<keys.length;i++){ r -= weights[i]; if (r<=0) return keys[i]; }
  return keys[keys.length-1];
}
export const won = n => Math.round(n).toLocaleString('ko-KR') + '원';
