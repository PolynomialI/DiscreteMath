// Procedural sound effects (Web Audio). No audio files.
let ac = null, master = null, noiseBuf = null, muted = false;

export function setMuted(m) {
  muted = m;
  if (master) master.gain.value = m ? 0 : 0.55;
}

export function initAudio() {
  if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ac = new AC();
  master = ac.createGain();
  master.gain.value = muted ? 0 : 0.55;
  master.connect(ac.destination);
  noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}

function env(g, t, a, peak, decay) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + decay);
}
function tone(type, freq, dur, vol, { at = 0, slide = 0 } = {}) {
  const t = ac.currentTime + at;
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
  env(g, t, 0.004, vol, dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.05);
}
function noise(dur, vol, { at = 0, type = 'highpass', freq = 2000, q = 0.7, attack = 0.002 } = {}) {
  const t = ac.currentTime + at;
  const s = ac.createBufferSource();
  s.buffer = noiseBuf;
  const f = ac.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ac.createGain();
  env(g, t, attack, vol, dur);
  s.connect(f).connect(g).connect(master);
  s.start(t, Math.random());
  s.stop(t + dur + 0.1);
}

const SIMON = { red: 392, blue: 523, green: 659, yellow: 784 };

export function sfx(name, vol = 1) {
  if (!ac) return;
  switch (name) {
    case 'tick': tone('square', 1250, 0.035, 0.05 * vol); break;
    case 'tick2': tone('square', 1800, 0.02, 0.06 * vol); noise(0.015, 0.08, { freq: 4000 }); break;
    case 'click': noise(0.03, 0.35 * vol, { freq: 2500 }); tone('sine', 180, 0.04, 0.15 * vol, { slide: 0.5 }); break;
    case 'snip': noise(0.05, 0.6 * vol, { freq: 3500, q: 2 }); noise(0.04, 0.4 * vol, { at: 0.06, freq: 5000, q: 2 }); break;
    case 'strike':
      tone('sawtooth', 110, 0.5, 0.28 * vol); tone('square', 116, 0.5, 0.12 * vol);
      noise(0.25, 0.25 * vol, { type: 'lowpass', freq: 800 }); break;
    case 'solve': tone('sine', 880, 0.18, 0.18 * vol); tone('sine', 1320, 0.3, 0.16 * vol, { at: 0.1 }); break;
    case 'needy': tone('triangle', 660, 0.12, 0.15 * vol); tone('triangle', 660, 0.12, 0.15 * vol, { at: 0.18 }); break;
    case 'boom':
      noise(2.5, 1.0 * vol, { type: 'lowpass', freq: 600, attack: 0.005 });
      noise(1.2, 0.6 * vol, { type: 'bandpass', freq: 1500, attack: 0.005 });
      tone('sine', 70, 1.6, 0.9 * vol, { slide: 0.35 }); break;
    case 'win': [523, 659, 784, 1046].forEach((f, i) => tone('triangle', f, 0.4, 0.18 * vol, { at: i * 0.12 })); break;
    default:
      if (name.startsWith('simon-')) tone('sine', SIMON[name.slice(6)], 0.3, 0.22 * vol);
  }
}
