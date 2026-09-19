// 게임 데이터 카탈로그
export const START_MONEY = 30000;
export const SAVE_KEY = 'claw-tycoon-save-v1';

// 상품 종류. kind: plush(인형) / box(박스형) / ball(구형). value 없으면 희귀도 시세
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
  // 인형 아닌 상품들
  keyring: { name:'키캡 키링', rarity:0, kind:'box', dims:[0.09,0.055,0.09], mass:0.07, value:2000,   color:0xff6f91, accent:0xffffff, icon:'⌨' },
  squishy: { name:'말랑이',    rarity:1, kind:'ball', r:0.1,  mass:0.14, value:4000,   color:0xa0e7ff, face:true, icon:'🫧' },
  figure:  { name:'피규어',    rarity:2, kind:'box', dims:[0.15,0.21,0.11], mass:0.32, value:15000,  color:0xfff2b3, accent:0xff4f8b, window:true, icon:'🧍' },
  airpods: { name:'에어팟',    rarity:3, kind:'box', dims:[0.11,0.06,0.11], mass:0.11, value:250000, color:0xf7f7f7, accent:0xdddddd, icon:'🎧' },
  watch:   { name:'애플워치',  rarity:3, kind:'box', dims:[0.13,0.1,0.13],  mass:0.18, value:500000, color:0x1f1f22, accent:0x3a3a40, screen:true, icon:'⌚' },
  ipad:    { name:'아이패드',  rarity:3, kind:'box', dims:[0.27,0.045,0.2], mass:0.5,  value:1200000, color:0xd0d4da, accent:0x111111, screen:true, icon:'📱' },
};
export const RARITY = [
  { name:'일반', value:3000,  color:'#8fa3b1' },
  { name:'고급', value:8000,  color:'#3fbf7f' },
  { name:'희귀', value:20000, color:'#4f8cff' },
  { name:'전설', value:60000, color:'#ff5fa2' },
];
export const RARITY_WEIGHT = [6, 3, 1.4, 0.5];
export const itemValue = k => PLUSH_TYPES[k].value ?? RARITY[PLUSH_TYPES[k].rarity].value;
export const isPlush = k => !PLUSH_TYPES[k].kind || PLUSH_TYPES[k].kind === 'plush';

// 집게 세팅 프리셋: torque = 손가락 모터 토크(N·m). 들어올린 상품 무게가 만드는 벌림 토크가 이를 넘으면 흘러내린다.
// (게임적 보정: 실측치보다 후하게. 느슨해도 가벼운 건 든다)
export const GRIP_PRESETS = {
  loose:  { label:'느슨함 (너무해)', torque:0.28, torqueVar:0.2 },
  normal: { label:'보통',           torque:0.6,  torqueVar:0.15 },
  strong: { label:'짱짱함',         torque:1.5,  torqueVar:0.1 },
};

// 다른 가게들 (원정)
// swing: 케이블 감쇠(작을수록 회오리(스윙) 테크닉이 잘 먹힘). pity: N판마다 1번 토크 4배. clawSize: 집게 크기
export const SHOPS = [
  { id:'stationery', name:'동네 문방구 뽑기', cost:500, desc:'집게가 느슨하다. 가벼운 인형은 들지만 무거운 건 흘러내린다. 상품구 옆 인형을 밀거나 탑을 쌓아라.',
    grip:'loose', pity:0, clawSize:1.0, swing:0.35, pool:['bear','bunny','duck','keyring'], weights:[3,3,3,2], count:20, color:0xff8fab, w:1.5,d:1.1,h:1.65 },
  { id:'station', name:'역전 뽑기샵', cost:1000, desc:'평소엔 느슨. 소문으로는 30판마다 한 번 꽉 잡아준다고... LED 카운터를 세라.',
    grip:'loose', pity:30, clawSize:1.0, swing:0.35, pool:['bear','bunny','duck','cat','frog','penguin'], count:18, color:0x7cc6fe, w:1.6,d:1.2,h:1.75 },
  { id:'tiny', name:'작은집게 오락실', cost:500, desc:'집게가 작다. 큰 인형은 손가락이 감싸지 못해 빠진다. 오리·키링처럼 작은 걸 정중앙으로.',
    grip:'normal', pity:0, clawSize:0.65, swing:0.35, pool:['duck','bunny','keyring','squishy','panda'], count:18, color:0xa0e7a0, w:1.5,d:1.1,h:1.65 },
  { id:'tornado', name:'회오리 크레인', cost:1000, desc:'케이블이 길고 잘 흔들린다. 조이스틱을 0.5초 간격으로 흔들어 집게를 스윙시킨 채 내리면 인형을 쳐서 날릴 수 있다.',
    grip:'normal', pity:0, clawSize:1.0, swing:0.06, cable:0.32, pool:['cat','frog','penguin','unicorn'], count:16, color:0xb28dff, w:1.6,d:1.2,h:1.75 },
  { id:'figure', name:'피규어·굿즈 뽑기', cost:1000, desc:'박스 피규어와 말랑이, 키링. 박스는 모서리를 걸어야 들린다. 말랑이는 잘 잡히지만 잘 미끄러진다.',
    grip:'normal', pity:0, clawSize:1.0, swing:0.35, pool:['keyring','squishy','figure'], weights:[3,3,2], count:16, color:0xffd6a5, w:1.6,d:1.2,h:1.7 },
  { id:'strong', name:'짱짱 프리미엄', cost:2000, desc:'집게가 짱짱하다. 정중앙으로 집으면 웬만하면 온다. 대신 비싸고 인형이 크고 무겁다.',
    grip:'strong', pity:0, clawSize:1.0, swing:0.35, pool:['panda','unicorn','penguin','dragon'], count:14, color:0xffb36b, w:1.7,d:1.3,h:1.85 },
  { id:'apple', name:'애플 뽑기 (합법)', cost:5000, desc:'에어팟·애플워치·아이패드. 아이패드는 납작해서 손가락이 못 들어간다. 밀어서 떨어뜨리는 게 정석.',
    grip:'normal', pity:0, clawSize:1.0, swing:0.35, pool:['keyring','airpods','watch','ipad'], weights:[5,2.2,2,1.3], count:14, color:0xe8e8ec, w:1.7,d:1.3,h:1.75 },
  { id:'mini', name:'미니 크레인 (300원)', cost:300, kind:'mini', desc:'탁자 위 초소형 크레인. 집게가 콩알만 하다. 키링·말랑이·오리 전용.',
    grip:'normal', pity:0, clawSize:0.55, swing:0.4, pool:['keyring','squishy','duck'], weights:[4,3,2], count:12, color:0xa0e7ff, w:0.75,d:0.6,h:0.75 },
  { id:'sweet', name:'스위트박스 (2단 밀판)', cost:1000, kind:'sweet', desc:'왼쪽 2단 선반의 윗판이 앞뒤로 왕복한다. 집게로 인형을 집어 판 위에 올려두면 판이 밀어서 앞 구덩이로 떨어뜨린다. 한 판에 못 뽑아도 쌓아두는 게 전략.',
    grip:'normal', pity:0, clawSize:1.0, swing:0.35, pool:['bear','bunny','duck','cat','frog','squishy'], count:18, color:0xff8fab, w:1.9,d:1.3,h:1.75 },
  { id:'ufo', name:'UFO 캐처 (橋渡し)', cost:2000, kind:'ufo', desc:'일본식 2발 집게. 버튼 1회차: 누르는 동안 오른쪽, 2회차: 누르는 동안 안쪽. 상품 박스가 두 봉 위에 얹혀 있고 봉 끝(오른쪽)까지 밀어 떨어뜨리면 획득.',
    grip:'normal', pity:0, clawSize:1.1, swing:0.35, pool:['figure','figure','airpods'], weights:[4,4,1], count:6, color:0xff5c8a, w:1.7,d:1.2,h:1.75 },
  { id:'pusher', name:'푸시 캐처 (밀어뽑기)', cost:1000, kind:'pusher', desc:'선반 위 상품을 막대로 한 판에 7cm씩 민다. 떨어질 때까지 6~8판. 누가 밀어놓은 상품을 가로채는 게 꿀.',
    grip:'normal', pity:0, clawSize:1.0, swing:0.35, pool:['figure','watch','airpods'], weights:[5,1,2], count:6, color:0x8fd3ff, w:1.6,d:1.2,h:1.6 },
  { id:'legend', name:'전설의 황금기계', cost:5000, desc:'느슨한데 20판 피티가 있다는 소문. 황금곰이 산다.',
    grip:'loose', pity:20, clawSize:1.1, swing:0.35, pool:['panda','unicorn','dragon','goldbear'], count:10, color:0xffd166, w:1.8,d:1.4,h:1.85 },
];

// 내 가게에서 살 수 있는 기계. type: claw(인형뽑기) / gacha(랜덤 뽑기, 손님은 무조건 하나 받아감)
export const MY_MACHINES = [
  { id:'mini',  name:'미니 크레인', type:'claw', kind:'mini', price:25000, capacity:6, baseRate:7, color:0xa0e7ff, w:0.75,d:0.6,h:0.75, desc:'탁자 위 초소형. 키링·말랑이용. 자리 적게 차지.' },
  { id:'small', name:'소형 크레인', type:'claw', kind:'claw', price:40000,  capacity:8,  baseRate:8,  color:0xffa4c4, w:1.3,d:1.0,h:1.2 },
  { id:'mid',   name:'중형 크레인', type:'claw', kind:'claw', price:120000, capacity:14, baseRate:12, color:0x8fd3ff, w:1.6,d:1.2,h:1.4 },
  { id:'big',   name:'대형 크레인', type:'claw', kind:'claw', price:350000, capacity:24, baseRate:18, color:0xffe08a, w:1.9,d:1.4,h:1.6 },
  { id:'sweet', name:'스위트박스 크레인', type:'claw', kind:'sweet', price:280000, capacity:20, baseRate:16, color:0xff8fab, w:1.9,d:1.3,h:1.75, desc:'2단 밀판. 손님이 쌓아두고 가서 다음 손님이 뽑는 구조라 회전이 빠르다.' },
  { id:'ufo',   name:'UFO 캐처',     type:'claw', kind:'ufo', price:260000, capacity:6, baseRate:9, color:0xff5c8a, w:1.7,d:1.2,h:1.75, desc:'박스 상품 전용(피규어·전자기기). 고급 손님이 온다.' },
  { id:'pusher',name:'푸시 캐처',    type:'claw', kind:'pusher', price:180000, capacity:6, baseRate:11, color:0x8fd3ff, w:1.6,d:1.2,h:1.6, desc:'박스 상품을 밀어서 떨어뜨림. 당첨률은 낮지만 손님이 연속으로 돈을 쓴다.' },
  { id:'toilet', name:'화장실', type:'facility', kind:'toilet', price:300000, capacity:0, baseRate:0, color:0xdff3ff, w:1.0,d:1.0,h:2.2, desc:'손님이 급할 때 쓴다. 평점이 오르고 "화장실 있는 뽑기집" 리뷰가 달린다. 청소 안 하면 역효과.' },
  { id:'vending', name:'음료 자판기', type:'facility', kind:'vending', price:120000, capacity:0, baseRate:0, color:0xff5c5c, w:0.8,d:0.7,h:1.9, desc:'가게에 사람이 많을수록 음료가 팔린다. 분당 소액 수익.' },
  { id:'bench', name:'벤치', type:'facility', kind:'bench', price:60000, capacity:0, baseRate:0, color:0xcfa77a, w:1.4,d:0.6,h:0.9, desc:'구경꾼이 앉아 쉰다. 가게에 머무는 사람이 늘어난다.' },
  { id:'gacha', name:'가챠 머신',   type:'gacha', price:60000, capacity:30, baseRate:10, color:0xff8fab, w:0.9,d:0.9,h:1.3, desc:'넣어둔 상품 중 하나가 무조건 나온다. 재고 처리용. 가격을 평균 시세보다 낮게 두면 손님이 몰린다.' },
];
// 손님이 이길 확률(집게 세팅별). 작은 집게면 ×0.6
export const CUSTOMER_WINRATE = { loose:0.05, normal:0.13, strong:0.32 };
// 기계 종류별 당첨률 배율 (푸시 캐처는 집게 힘 무관 고정)
export const KIND_WIN = { claw:1, mini:1, sweet:1.5, ufo:0.8, pusher:null };
export const PUSHER_WINRATE = 1/6;
// 도매 시장: 10분마다 일반/고급 상품 입고 (희귀·전설은 원정 전용)
export const WHOLESALE_INTERVAL = 10*60*1000;
export function makeWholesaleOffers(){
  const keys = Object.keys(PLUSH_TYPES).filter(k => PLUSH_TYPES[k].rarity <= 1);
  const pick = [...keys].sort(() => Math.random()-0.5).slice(0, 4);
  return pick.map(k => { const r = PLUSH_TYPES[k].rarity; return { key:k, qty: r===0 ? 16+Math.floor(Math.random()*16) : 8+Math.floor(Math.random()*10), price: Math.round(itemValue(k)*(r===0?0.7:0.8)/100)*100 }; });
}
export const SLOT_POS = [[-2.7,-1.7],[0,-1.7],[2.7,-1.7],[-2.7,1.1],[0,1.1],[2.7,1.1]];
export const FLOOR = { x0:-5.25, x1:5.25, z0:-3.75, z1:4.15, door:{ x0:-1.0, x1:1.0, z0:3.3 } };
export const GRID = 0.5;

// 가게 꾸미기 (한 번 사면 계속 쓸 수 있음)
export const DECOR = {
  floor: [
    { id:'tile',   name:'체크 타일',  price:0,      base:0xf7d9b5, tile:0xfbe4c8, pattern:'checker' },
    { id:'wood',   name:'원목 마루',  price:150000, base:0xd9a066, tile:0xc98d55, pattern:'plank' },
    { id:'marble', name:'대리석',     price:400000, base:0xf3f3f6, tile:0xe6e6ec, pattern:'checker' },
    { id:'carpet', name:'오락실 카펫', price:250000, base:0x2b2f6b, tile:0x4a3fa8, pattern:'checker' },
    { id:'grass',  name:'잔디 매트',  price:120000, base:0x9fd68f, tile:0x8cc97d, pattern:'plain' },
  ],
  wall: [
    { id:'sky',   name:'하늘색 벽',   price:0,      color:0xcfe8ff },
    { id:'pink',  name:'핑크 벽',     price:80000,  color:0xffd1e0 },
    { id:'mint',  name:'민트 벽',     price:80000,  color:0xc8f2e0 },
    { id:'brick', name:'붉은 벽돌',   price:200000, color:0xb8624a },
    { id:'dark',  name:'네온 다크',   price:300000, color:0x2a2438 },
  ],
  light: [
    { id:'day',   name:'밝은 낮',     price:0,      hemi:0xffffff, ground:0xffc0cb, sun:0xffffff, sunI:1.4, hemiI:0.9, bg:0xffe9f0, neon:[] },
    { id:'warm',  name:'따뜻한 조명', price:100000, hemi:0xfff0d0, ground:0xffb080, sun:0xffd9a0, sunI:1.2, hemiI:0.8, bg:0xffe4cf, neon:[] },
    { id:'neon',  name:'네온 오락실', price:350000, hemi:0x8877ff, ground:0x442266, sun:0xffffff, sunI:0.5, hemiI:0.5, bg:0x1a1430, neon:[0xff2d95, 0x2dffec, 0xffe12d, 0xa12dff] },
    { id:'night', name:'심야 영업',   price:200000, hemi:0x6677aa, ground:0x223355, sun:0x99aaff, sunI:0.6, hemiI:0.6, bg:0x101a33, neon:[0xffd166] },
  ],
};

// 직원 (시급은 분당 차감)
export const STAFF = [
  { id:'alba',    name:'알바생',     wage:3000, icon:'🧑‍🔧', desc:'20초마다 창고 상품을 빈 기계에 자동으로 채운다.' },
  { id:'barker',  name:'호객꾼',     wage:5000, icon:'📢', desc:'입구에서 호객. 손님 1.25배.' },
  { id:'cleaner', name:'청소 담당',  wage:2500, icon:'🧹', desc:'평점이 3.5 아래면 서서히 회복. 화장실도 깨끗하게.' },
  { id:'tech',    name:'기술자',     wage:6000, icon:'🔧', desc:'고장 난 기계를 30초 안에 고치고, 기계 마모를 절반으로.' },
];
// 건물 증축
export const EXPANSIONS = [
  { level:0, name:'기본 매장', price:0,       w:11, d:9 },
  { level:1, name:'옆 가게 인수', price:1500000, w:15, d:9 },
  { level:2, name:'2호점 합병', price:4000000, w:15, d:13 },
];
// 기계 고장 종류
export const BREAKDOWNS = [
  { id:'screw',  name:'집게 나사 풀림',   desc:'집게가 흐물흐물. 당첨률 반토막.', repair:40000,  win:0.5, rate:0.6 },
  { id:'coin',   name:'동전 투입구 막힘', desc:'돈은 먹는데 시작이 안 된다. 전화가 온다.', repair:25000, win:0, rate:0.4, eats:true },
  { id:'stick',  name:'조이스틱 고장',    desc:'한 방향으로만 간다. 손님이 화낸다.', repair:30000, win:0.15, rate:0.5 },
  { id:'fake',   name:'위조 동전 사건',   desc:'누가 게임머니를 넣고 갔다. 매출 60%만 들어온다.', repair:15000, win:1, rate:1, revenue:0.6 },
];
// 손님 말풍선
export const BUBBLES = {
  win:  ['와 이게 한번에 나오네', '됐다!!!', '개이득 ㅋㅋㅋ', '이 집 뽑기 되네', '사장님 감사합니다', '{item} 겟!'],
  lose: ['아 XX!!', '분명 잡았는데...', '한 판만 더', '집게 뭐야 진짜', '내 돈...', '다음엔 된다'],
  angry:['너무해!!!', '사장 나오라 해', '돈 먹는 기계네', '별점 1개 확정'],
  toilet:['급하다 급해', '휴 살았다', '화장실 깨끗하네'],
  wander:['구경만 할게요', '저거 귀엽다', '이거 얼마지', '판다 있다!'],
  vending:['목마르다', '음료 하나'],
};
export const CALLS = [
  '여보세요, 거기 {store}죠? 아까 {machine}에 돈 넣었는데 시작이 안 돼요. 환불해주세요.',
  '저기요, {machine} 돈만 먹고 안 움직이는데요? 3판 값 날렸어요.',
  '사장님 {machine} 고장 난 거 알고 계세요? 애가 울어요.',
];

// 홍보
export const PROMOS = [
  { id:'flyer', name:'전단지 돌리기', price:20000,  mins:5,  mult:1.5, rep:0,    desc:'동네에 전단지. 5분간 손님 1.5배.' },
  { id:'sns',   name:'SNS 이벤트',   price:100000, mins:10, mult:2.2, rep:0.15, desc:'"인증샷 올리면 1판 무료". 10분간 손님 2.2배, 평점 +0.15.' },
  { id:'influ', name:'인플루언서 초청', price:400000, mins:15, mult:3.2, rep:0.4, desc:'뽑기 유튜버가 방문. 15분간 손님 3.2배, 평점 +0.4, 리뷰 폭발.' },
];

// 리뷰 문구 ({item} 치환)
export const NICKS = ['뽑기장인', '인형수집가', '동네주민', '지나가던행인', '뽑기초보', '집게분석가', '토끼덕후', '현금박치기', '오늘도꽝', '회오리마스터', '판다사랑', '월급루팡', '대학생A', '초딩아들엄마', '뽑기유튜버', '가챠중독', '아이패드원함'];
export const REVIEWS = {
  win: ['{item} 한 번에 뽑음 ㅋㅋㅋ 여기 집게 괜찮네', '{item} 득템!! 사장님 짱짱', '3판만에 {item} 뽑았어요 인생가게', '{item} 뽑고 기분 좋아서 리뷰 남김', '집게가 진짜로 잡아요 여기', '{item} 뽑음. 여자친구가 좋아함', '와 {item} 나왔다 이 집 뽑기 잘됨'],
  lose: ['{item} 들었다가 떨어짐 ㅠㅠ 아깝', '오늘은 꽝. 근데 재밌어서 또 옴', '집게가 살짝 느슨한 듯? 그래도 할만', '5천원 쓰고 빈손... 내일 또 감', '{item} 노렸는데 옆에 거만 밀림'],
  complaint: ['집게 너무해!!! 잡았다가 다 놓침', '돈 먹는 기계. 사장님 양심 어디', '여기 집게 힘 0임. 절대 가지 마셈', '{item} 3번 들었다가 3번 다 떨어짐 이게 맞냐', '너무해 진짜 ㅡㅡ 별 하나도 아까움', '집게가 젓가락임'],
  gacha: ['가챠에서 {item} 나옴 개이득', '가챠 돌렸는데 {item}... 뭐 이 가격이면 ㅇㅈ', '재고처리 가챠 냄새나는데 {item} 나와서 용서', '가챠 {item} 당첨. 랜덤이라 짜릿함'],
  rip: ['가챠 가격이 너무 비쌈. 바가지', '이 가격에 이 상품? 사기 아님?'],
  broken: ['{machine} 고장인데 방치 중. 돈만 먹음', '기계 고장 났는데 사장 없음. 별 1개', '동전 넣었는데 시작 안 됨 ㅡㅡ'],
  toilet: ['화장실 있는 뽑기집 처음 봄. 개편함', '애랑 오기 좋음. 화장실 깨끗', '화장실 더러움... 청소 좀'],
  refund: ['돈 먹었는데 바로 환불해줌. 양심 사장', '고장 났다니까 3판 값 돌려줌 ㅇㅈ'],
  ignore: ['돈 먹은 거 전화했는데 씹음. 최악', '환불 안 해주는 가게. 가지 마세요'],
  promo: ['SNS 보고 왔는데 사람 엄청 많네', '이벤트 한다길래 옴. 분위기 좋음', '유튜버 왔다 갔대서 구경옴'],
};

export function poolWeights(pool, weights){
  return weights || pool.map(k => RARITY_WEIGHT[PLUSH_TYPES[k].rarity]);
}
export function pickWeighted(keys, weights){
  let t = weights.reduce((a,b)=>a+b,0), r = Math.random()*t;
  for (let i=0;i<keys.length;i++){ r -= weights[i]; if (r<=0) return keys[i]; }
  return keys[keys.length-1];
}
export const won = n => Math.round(n).toLocaleString('ko-KR') + '원';
