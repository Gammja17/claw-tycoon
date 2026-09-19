// 효과음: Kenney CC0 오디오 팩 (assets/sfx). 모터 소리만 합성
const FILES = { click:'click', coin:'coin', start:'start', close:'close', drop:'drop', thud:'thud', thud2:'thud2', win:'win', fail:'fail', cash:'cash', buy:'buy', bell:'bell', ring:'ring', broken:'broken', switch:'switch', plate:'plate', step:'step' };
const pool = {};
let master = 1;
try { const v = localStorage.getItem('claw-tycoon-vol'); if (v !== null) master = Math.max(0, Math.min(1, parseFloat(v))); } catch(e) {}
export function setVolume(v){ master = Math.max(0, Math.min(1, v)); try { localStorage.setItem('claw-tycoon-vol', String(master)); } catch(e) {} if (motorGain) motorGain.gain.value = 0.006*master; }
export function getVolume(){ return master; }
function play(name, vol=0.5, rate=1){
  try {
    let a = pool[name]; if (!a){ a = new Audio(`assets/sfx/${FILES[name] || name}.ogg`); a.preload = 'auto'; pool[name] = a; }
    if (master <= 0) return;
    const c = a.cloneNode(); c.volume = Math.min(1, vol*master); c.playbackRate = rate; c.play().catch(()=>{});
  } catch(e) {}
}
let ctx = null, motorOsc = null, motorGain = null;
function ac(){
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}
export const sfx = {
  click(){ play('click', 0.4); },
  coin(){ play('coin', 0.6); },
  start(){ play('start', 0.5); },
  close(){ play('close', 0.45, 0.9); },
  drop(){ play('drop', 0.55); setTimeout(() => play('thud', 0.5), 120); },
  thud(){ play('thud2', 0.5); },
  win(){ play('win', 0.7); setTimeout(() => play('bell', 0.4, 1.2), 150); },
  fail(){ play('fail', 0.4); },
  cash(){ play('cash', 0.35, 1.3); },
  buy(){ play('buy', 0.55); },
  ring(){ play('ring', 0.6); },
  broken(){ play('broken', 0.5); },
  switch(){ play('switch', 0.4); },
  motor(on){
    try {
      const c = ac();
      if (on && !motorOsc){
        motorOsc = c.createOscillator(); motorGain = c.createGain();
        const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 220;
        motorOsc.type = 'triangle'; motorOsc.frequency.value = 60;
        motorGain.gain.value = 0.006*master;
        motorOsc.connect(lp); lp.connect(motorGain); motorGain.connect(c.destination); motorOsc.start();
      } else if (!on && motorOsc){
        motorOsc.stop(); motorOsc.disconnect(); motorOsc = null; motorGain = null;
      }
    } catch(e) {}
  },
};
