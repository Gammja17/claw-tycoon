let ctx = null, motorOsc = null, motorGain = null;
function ac(){
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}
function beep(freq=440, dur=0.1, type='square', vol=0.08, delay=0){
  try {
    const c = ac(), o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, c.currentTime + delay);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + delay + dur);
    o.connect(g); g.connect(c.destination);
    o.start(c.currentTime + delay); o.stop(c.currentTime + delay + dur + 0.02);
  } catch(e) {}
}
export const sfx = {
  click(){ beep(700, 0.05, 'square', 0.05); },
  coin(){ beep(1200, 0.06, 'sine', 0.1); beep(1800, 0.12, 'sine', 0.1, 0.07); },
  start(){ [660,880].forEach((f,i)=>beep(f,0.1,'square',0.06,i*0.1)); },
  close(){ beep(240, 0.18, 'sawtooth', 0.04); },
  drop(){ beep(330, 0.12, 'triangle', 0.08); beep(200, 0.3, 'triangle', 0.08, 0.1); },
  thud(){ beep(90, 0.12, 'sine', 0.12); },
  win(){ [523,659,784,1047,1319].forEach((f,i)=>beep(f,0.2,'square',0.07,i*0.11)); },
  fail(){ beep(220, 0.2, 'sawtooth', 0.04); beep(150, 0.4, 'sawtooth', 0.04, 0.2); },
  cash(){ beep(1500, 0.05, 'sine', 0.08); beep(2000, 0.1, 'sine', 0.08, 0.05); },
  buy(){ [440,554,659].forEach((f,i)=>beep(f,0.12,'triangle',0.07,i*0.08)); },
  motor(on){
    try {
      const c = ac();
      if (on && !motorOsc){
        motorOsc = c.createOscillator(); motorGain = c.createGain();
        motorOsc.type = 'sawtooth'; motorOsc.frequency.value = 55;
        motorGain.gain.value = 0.025;
        motorOsc.connect(motorGain); motorGain.connect(c.destination); motorOsc.start();
      } else if (!on && motorOsc){
        motorOsc.stop(); motorOsc.disconnect(); motorOsc = null; motorGain = null;
      }
    } catch(e) {}
  },
};
