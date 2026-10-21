// LOGIC BOMB: Classic Edition — pure game logic (no DOM, no three.js).
// Every rule here is written into manual.html by tools/manual-classic.mjs, so the two can't disagree.

// ───────────────────────── Seeded RNG ─────────────────────────
export function makeRng(seed) {
  let h = 1779033703 ^ String(seed).length;
  for (const ch of String(seed)) {
    h = Math.imul(h ^ ch.charCodeAt(0), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rng = {
    next,
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    chance: (p) => next() < p,
    shuffle: (arr) => {
      const a2 = arr.slice();
      for (let i = a2.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [a2[i], a2[j]] = [a2[j], a2[i]];
      }
      return a2;
    },
    fork: (tag) => makeRng(String(seed) + '/' + tag),
  };
  return rng;
}

export function randomSeed() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

export function formatTime(sec) {
  const s = Math.max(0, Math.ceil(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// ───────────────────────── Casing (edgework) ─────────────────────────
export const INDICATOR_LABELS = ['ARM', 'BAT', 'CAB', 'DOC', 'FIG', 'GEM', 'HUB', 'LUX', 'NOX', 'SOL', 'VEX'];
export const PORT_TYPES = ['PARALLEL', 'SERIAL', 'USB', 'HDMI', 'RJ-45'];
const SERIAL_LETTERS = 'ABCDEFGHIJKLMNPQRSTUVWXZ';

// Every bomb has a serial, at least one battery holder, one indicator and one port plate,
// so "none" never has to be told apart from "I didn't find it".
export function genEdgework(rng) {
  let serial = '';
  for (let i = 0; i < 5; i++) serial += rng.chance(0.55) ? rng.pick(SERIAL_LETTERS) : String(rng.int(0, 9));
  serial += String(rng.int(0, 9));
  if (!/[A-Z]/.test(serial)) serial = rng.pick(SERIAL_LETTERS) + serial.slice(1);
  const holders = Array.from({ length: rng.int(1, 3) }, () => (rng.chance(0.5) ? 'AA' : 'D'));
  const indicators = rng.shuffle(INDICATOR_LABELS).slice(0, rng.int(1, 3)).map((label) => ({ label, lit: rng.chance(0.5) }));
  const ports = Array.from({ length: rng.int(1, 2) }, () => rng.shuffle(PORT_TYPES).slice(0, rng.int(1, 2)));
  return { serial, holders, indicators, ports };
}

export function edgeFacts(e) {
  const last = Number(e.serial[e.serial.length - 1]);
  return {
    lastDigit: last,
    lastOdd: last % 2 === 1,
    vowel: /[AEIOU]/.test(e.serial),
    b: e.holders.reduce((n, h) => n + (h === 'AA' ? 2 : 1), 0),
    anyLit: e.indicators.some((i) => i.lit),
    lit: new Set(e.indicators.filter((i) => i.lit).map((i) => i.label)),
    ports: new Set(e.ports.flat()),
  };
}

// ───────────────────────── 1. Wires ─────────────────────────
export const WIRE_COLORS = ['red', 'blue', 'yellow', 'black', 'white'];

// colors top → bottom. Returns { cut (1-based), rule }.
export function solveWires(c, e) {
  const f = edgeFacts(e);
  const n = c.length;
  const count = (x) => c.filter((y) => y === x).length;
  const first = (x) => c.indexOf(x) + 1;
  const last = (x) => c.lastIndexOf(x) + 1;
  if (n === 3) {
    if (count('blue') === 0) return { cut: 3, rule: 1 };
    if (c[0] === 'white') return { cut: 1, rule: 2 };
    if (count('blue') > 1) return { cut: last('blue'), rule: 3 };
    return { cut: 2, rule: 4 };
  }
  if (n === 4) {
    if (count('yellow') > 1 && !f.lastOdd) return { cut: first('yellow'), rule: 1 };
    if (count('black') === 0) return { cut: 4, rule: 2 };
    if (count('red') === 1) return { cut: 3, rule: 3 };
    if (c[3] === 'white') return { cut: 1, rule: 4 };
    return { cut: 2, rule: 5 };
  }
  if (n === 5) {
    if (c[1] === 'black' && f.anyLit) return { cut: 2, rule: 1 };
    if (count('red') === 2) return { cut: first('red'), rule: 2 };
    if (count('white') === 0 && f.vowel) return { cut: 5, rule: 3 };
    if (count('yellow') > count('blue')) return { cut: last('yellow'), rule: 4 };
    return { cut: 3, rule: 5 };
  }
  if (n === 6) {
    if (count('red') === 0 && f.b >= 3) return { cut: 2, rule: 1 };
    if (c[0] === c[5]) return { cut: 4, rule: 2 };
    if (count('black') === 1) return { cut: first('black'), rule: 3 };
    if (f.lastOdd) return { cut: 6, rule: 4 };
    return { cut: 5, rule: 5 };
  }
  throw new Error('bad wire count');
}

function genWires(rng, e) {
  const n = rng.int(3, 6);
  const maxRule = n === 3 ? 4 : 5;
  const target = rng.int(1, maxRule);
  let colors;
  for (let i = 0; i < 400; i++) {
    colors = Array.from({ length: n }, () => rng.pick(WIRE_COLORS));
    if (solveWires(colors, e).rule === target) break;
  }
  return { colors };
}

class WiresLogic {
  constructor(data, e) { this.data = data; this.solution = solveWires(data.colors, e); this.cut = new Set(); this.solved = false; }
  cutWire(i) {
    if (this.solved || this.cut.has(i)) return {};
    this.cut.add(i);
    if (i === this.solution.cut) { this.solved = true; return { solved: true }; }
    return { strike: true };
  }
}

// ───────────────────────── 2. The Button ─────────────────────────
export const BUTTON_COLORS = ['red', 'blue', 'yellow', 'white'];
export const BUTTON_LABELS = ['PUSH', 'STOP', 'WAIT', 'ARM'];
export const STRIP_COLORS = ['blue', 'white', 'yellow', 'red'];
export const RELEASE_DIGIT = { blue: 3, white: 2, yellow: 6, red: 7 };
export const TAP_MAX_MS = 500;

export function solveButton(color, label, e) {
  const f = edgeFacts(e);
  if (color === 'white' && label === 'WAIT') return { action: 'HOLD', rule: 1 };
  if (color === 'red' && f.b >= 2) return { action: 'TAP', rule: 2 };
  if (label === 'PUSH' && f.anyLit) return { action: 'TAP', rule: 3 };
  if (color === 'blue') return { action: 'HOLD', rule: 4 };
  if (f.ports.has('PARALLEL')) return { action: 'TAP', rule: 5 };
  return { action: 'HOLD', rule: 6 };
}

function genButton(rng, e) {
  const target = rng.int(1, 6);
  let color, label;
  for (let i = 0; i < 200; i++) {
    color = rng.pick(BUTTON_COLORS);
    label = rng.pick(BUTTON_LABELS);
    if (solveButton(color, label, e).rule === target) break;
  }
  return { color, label };
}

class ButtonLogic {
  constructor(data, e, rng) { this.data = data; this.rng = rng; this.solution = solveButton(data.color, data.label, e); this.solved = false; this.strip = null; }
  startHold() { this.strip = this.rng.pick(STRIP_COLORS); return this.strip; }
  release(wasHold, timerText) {
    if (this.solved) return {};
    const strip = this.strip;
    this.strip = null;
    if (this.solution.action === 'TAP') {
      if (!wasHold) { this.solved = true; return { solved: true }; }
      return { strike: true };
    }
    if (!wasHold) return { strike: true };
    if (timerText.includes(String(RELEASE_DIGIT[strip]))) { this.solved = true; return { solved: true }; }
    return { strike: true };
  }
}

// ───────────────────────── 3. Keypad ─────────────────────────
// Exactly one column holds all four symbols on the module; press them in that column's order (top → bottom).
export const KEYPAD_COLUMNS = [
  ['☾', '✦', 'Ψ', '⚓', '♞', '¶', '☂'],
  ['✿', '☾', '☂', 'ϟ', '♜', 'Ж', '⚑'],
  ['Ω', '✈', 'ϟ', '☯', '✦', '‡', '♪'],
  ['☘', '¶', '♪', '⚙', 'Ψ', '☀', '✂'],
  ['⚡', '☀', '♞', '✂', 'Ω', 'Я', '∞'],
  ['☎', '⚑', 'Ж', '☯', '⚡', '✉', '☘'],
];

export function keypadOrder(keys) {
  const cols = KEYPAD_COLUMNS.filter((col) => keys.every((k) => col.includes(k)));
  if (cols.length !== 1) return null;
  return [0, 1, 2, 3].sort((a, b) => cols[0].indexOf(keys[a]) - cols[0].indexOf(keys[b]));
}

function genKeypad(rng) {
  for (;;) {
    const keys = rng.shuffle(rng.pick(KEYPAD_COLUMNS)).slice(0, 4);
    if (keypadOrder(keys)) return { keys };
  }
}

class KeypadLogic {
  constructor(data) { this.data = data; this.order = keypadOrder(data.keys); this.done = new Set(); this.step = 0; this.solved = false; }
  press(k) {
    if (this.solved || this.done.has(k)) return {};
    if (k !== this.order[this.step]) return { strike: true };
    this.done.add(k);
    if (++this.step === 4) { this.solved = true; return { solved: true, correct: true }; }
    return { correct: true };
  }
}

// ───────────────────────── 4. Simon ─────────────────────────
export const SIMON_COLORS = ['red', 'blue', 'green', 'yellow'];
// SIMON_MAP[vowel ? 'vowel' : 'none'][min(strikes, 2)][flashed] = color to press
export const SIMON_MAP = {
  vowel: [
    { red: 'green', blue: 'yellow', green: 'blue', yellow: 'red' },
    { red: 'yellow', blue: 'green', green: 'red', yellow: 'blue' },
    { red: 'green', blue: 'red', green: 'yellow', yellow: 'blue' },
  ],
  none: [
    { red: 'yellow', blue: 'blue', green: 'red', yellow: 'green' },
    { red: 'blue', blue: 'green', green: 'yellow', yellow: 'red' },
    { red: 'red', blue: 'yellow', green: 'blue', yellow: 'green' },
  ],
};

function genSimon(rng) {
  return { seq: Array.from({ length: rng.int(3, 5) }, () => rng.pick(SIMON_COLORS)) };
}

class SimonLogic {
  constructor(data, e, rng, ctx) {
    this.data = data; this.ctx = ctx; this.table = edgeFacts(e).vowel ? SIMON_MAP.vowel : SIMON_MAP.none;
    this.stage = 1; this.input = 0; this.solved = false;
  }
  map() { return this.table[Math.min(2, this.ctx.strikes())]; }
  expected() { return this.map()[this.data.seq[this.input]]; }
  press(color) {
    if (this.solved) return {};
    if (color !== this.expected()) { this.input = 0; return { strike: true }; }
    if (++this.input < this.stage) return { correct: true };
    this.input = 0;
    if (++this.stage > this.data.seq.length) { this.solved = true; return { solved: true }; }
    return { advance: true };
  }
}

// ───────────────────────── 5. Word Board ─────────────────────────
// Step 1: the display word says which button to read (positions: TL, TR, ML, MR, BL, BR).
export const POSITIONS = ['top left', 'top right', 'middle left', 'middle right', 'bottom left', 'bottom right'];
export const DISPLAY_WORDS = {
  THERE: 3, THEIR: 0, "THEY'RE": 5, LEAD: 1, LED: 4, READ: 2, RED: 5, REED: 0, WAIT: 4,
  WEIGHT: 1, TWO: 2, TOO: 3, TO: 1, KNOW: 5, NO: 0, NOW: 4, YES: 3, YEAH: 2,
};
// Step 2: that button's word picks a list; press the first word in the list that is on a button.
export const BUTTON_WORDS = ['HERE', 'HEAR', 'HIGHER', 'HIRE', 'WRITE', 'RIGHT', 'RITE', 'LOW', 'LO', 'PEAK', 'PEEK', 'PIQUE', 'SO', 'SEW'];
export const WORD_LISTS = Object.fromEntries(BUTTON_WORDS.map((w) => [w, makeRng('wordlist/' + w).shuffle(BUTTON_WORDS)]));

export function solveWords(display, buttons) {
  const label = buttons[DISPLAY_WORDS[display]];
  const word = WORD_LISTS[label].find((w) => buttons.includes(w));
  return buttons.indexOf(word);
}

function genWords(rng) {
  const stages = [0, 1, 2].map(() => ({ display: rng.pick(Object.keys(DISPLAY_WORDS)), buttons: rng.shuffle(BUTTON_WORDS).slice(0, 6) }));
  return { stages };
}

class WordsLogic {
  constructor(data) { this.data = data; this.stage = 0; this.solved = false; }
  current() { return this.data.stages[Math.min(this.stage, 2)]; }
  press(i) {
    if (this.solved) return {};
    const st = this.current();
    if (i !== solveWords(st.display, st.buttons)) return { strike: true };
    if (++this.stage === 3) { this.solved = true; return { solved: true }; }
    return { advance: true };
  }
}

// ───────────────────────── 6. Memory ─────────────────────────
// MEMORY_RULES[stage-1][display-1] = ['pos', n] | ['label', n] | ['samePos', stage] | ['sameLabel', stage]
export const MEMORY_RULES = [
  [['pos', 3], ['pos', 1], ['label', 4], ['pos', 2]],
  [['sameLabel', 1], ['pos', 4], ['label', 1], ['samePos', 1]],
  [['label', 2], ['samePos', 2], ['pos', 1], ['sameLabel', 1]],
  [['pos', 4], ['sameLabel', 3], ['samePos', 1], ['label', 3]],
  [['sameLabel', 2], ['samePos', 3], ['pos', 2], ['sameLabel', 4]],
];

function memoryStage(rng) {
  return { display: rng.int(1, 4), labels: rng.shuffle([1, 2, 3, 4]) };
}

// Index (0-3) of the button to press, given the history of earlier presses.
export function solveMemory(stageIdx, st, history) {
  const [kind, n] = MEMORY_RULES[stageIdx][st.display - 1];
  if (kind === 'pos') return n - 1;
  if (kind === 'label') return st.labels.indexOf(n);
  if (kind === 'samePos') return history[n - 1].pos;
  return st.labels.indexOf(history[n - 1].label);
}

function genMemory() { return {}; }

class MemoryLogic {
  constructor(data, e, rng) { this.data = data; this.rng = rng; this.solved = false; this.reset(); }
  reset() { this.stageIdx = 0; this.history = []; this.st = memoryStage(this.rng); }
  answer() { return solveMemory(this.stageIdx, this.st, this.history); }
  press(i) {
    if (this.solved) return {};
    if (i !== this.answer()) { this.reset(); return { strike: true, reset: true }; }
    this.history.push({ pos: i, label: this.st.labels[i] });
    if (++this.stageIdx === 5) { this.solved = true; return { solved: true }; }
    this.st = memoryStage(this.rng);
    return { advance: true };
  }
}

// ───────────────────────── 7. Morse Code ─────────────────────────
export const MORSE = {
  A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.', G: '--.', H: '....', I: '..', J: '.---', K: '-.-', L: '.-..', M: '--',
  N: '-.', O: '---', P: '.--.', Q: '--.-', R: '.-.', S: '...', T: '-', U: '..-', V: '...-', W: '.--', X: '-..-', Y: '-.--', Z: '--..',
};
export const MORSE_WORDS = [
  ['ALARM', '3.410'], ['BRAVE', '3.418'], ['CLOCK', '3.424'], ['DRIFT', '3.437'], ['EMBER', '3.441'], ['FLASH', '3.456'],
  ['GLOBE', '3.462'], ['HOUND', '3.475'], ['IVORY', '3.483'], ['JOLLY', '3.497'], ['KNOCK', '3.506'], ['LUNAR', '3.519'],
  ['MOTOR', '3.528'], ['NOBLE', '3.534'], ['OCEAN', '3.547'], ['PIANO', '3.560'],
];

function genMorse(rng) { return { word: rng.int(0, MORSE_WORDS.length - 1) }; }

class MorseLogic {
  constructor(data) { this.data = data; this.freq = 0; this.solved = false; }
  step(d) { if (!this.solved) this.freq = Math.max(0, Math.min(MORSE_WORDS.length - 1, this.freq + d)); return {}; }
  transmit() {
    if (this.solved) return {};
    if (this.freq === this.data.word) { this.solved = true; return { solved: true }; }
    return { strike: true };
  }
}

// ───────────────────────── 8. Complex Wires ─────────────────────────
// Key: red?, blue?, star?, LED? → instruction letter.
export const CWIRE_TABLE = {
  '0000': 'C', '0001': 'L', '0010': 'E', '0011': 'A',
  '1000': 'A', '1001': 'E', '1010': 'C', '1011': 'L',
  '0100': 'E', '0101': 'U', '0110': 'L', '0111': 'C',
  '1100': 'U', '1101': 'C', '1110': 'A', '1111': 'L',
};
export const CWIRE_LETTERS = {
  C: 'Cut the wire',
  L: 'Leave the wire',
  E: 'Cut the wire if the last digit of the serial number is even',
  U: 'Cut the wire if the bomb has a USB port',
  A: 'Cut the wire if the bomb has two or more batteries',
};
export function cwireShouldCut(w, e) {
  const f = edgeFacts(e);
  const letter = CWIRE_TABLE[`${+w.red}${+w.blue}${+w.star}${+w.led}`];
  return letter === 'C' || (letter === 'E' && !f.lastOdd) || (letter === 'U' && f.ports.has('USB')) || (letter === 'A' && f.b >= 2);
}

function genCwires(rng, e) {
  for (;;) {
    const wires = Array.from({ length: rng.int(4, 6) }, () => {
      const kind = rng.pick(['red', 'blue', 'both', 'white']);
      return { red: kind === 'red' || kind === 'both', blue: kind === 'blue' || kind === 'both', led: rng.chance(0.5), star: rng.chance(0.45) };
    });
    if (wires.some((w) => cwireShouldCut(w, e))) return { wires };
  }
}

class CwiresLogic {
  constructor(data, e) {
    this.data = data; this.cut = new Set(); this.solved = false;
    this.K = new Set(data.wires.map((w, i) => (cwireShouldCut(w, e) ? i + 1 : 0)).filter(Boolean));
  }
  cutWire(i) {
    if (this.solved || this.cut.has(i)) return {};
    this.cut.add(i);
    if (!this.K.has(i)) return { strike: true };
    if ([...this.K].every((k) => this.cut.has(k))) { this.solved = true; return { solved: true }; }
    return { correct: true };
  }
}

// ───────────────────────── 9. Wire Sequence ─────────────────────────
// SEQ_TABLE[color][occurrence-1] = letters the wire may connect to and still need cutting.
export const SEQ_TABLE = {
  red: ['C', 'A', 'B', 'AC', 'B', 'AB', 'C', 'BC', 'A'],
  blue: ['B', 'AC', 'C', 'A', 'BC', 'C', 'AB', 'A', 'B'],
  black: ['AB', 'C', 'A', 'BC', 'A', 'B', 'AC', 'C', 'ABC'],
};
export const SEQ_COLORS = ['red', 'blue', 'black'];

export function sequenceCuts(panels) {
  const seen = { red: 0, blue: 0, black: 0 };
  return panels.map((p) => p.map((w) => SEQ_TABLE[w.color][seen[w.color]++].includes(w.to)));
}

function genSequence(rng) {
  const panels = [];
  const seen = { red: 0, blue: 0, black: 0 };
  for (let i = 0; i < 4; i++) {
    const froms = rng.shuffle([1, 2, 3]).slice(0, rng.int(1, 3)).sort();
    const panel = [];
    for (const from of froms) {
      const ok = SEQ_COLORS.filter((c) => seen[c] < 9);
      const color = rng.pick(ok);
      seen[color]++;
      panel.push({ from, to: rng.pick(['A', 'B', 'C']), color });
    }
    panels.push(panel);
  }
  return { panels };
}

class SequenceLogic {
  constructor(data) { this.data = data; this.cuts = sequenceCuts(data.panels); this.panel = 0; this.cut = new Set(); this.solved = false; }
  cutWire(i) {
    const key = this.panel + ':' + i;
    if (this.solved || this.cut.has(key)) return {};
    this.cut.add(key);
    return this.cuts[this.panel][i] ? { correct: true } : { strike: true };
  }
  next() {
    if (this.solved) return {};
    const need = this.cuts[this.panel].some((must, i) => must && !this.cut.has(this.panel + ':' + i));
    if (need) return { strike: true };
    if (++this.panel === 4) { this.solved = true; return { solved: true }; }
    return { advance: true };
  }
}

// ───────────────────────── 10. Maze ─────────────────────────
// 9 fixed 6×6 mazes. Walls: walls[r][c] = { n, e, s, w } (true = wall). Two marker cells identify each maze.
const DIRS = { n: [-1, 0, 's'], s: [1, 0, 'n'], e: [0, 1, 'w'], w: [0, -1, 'e'] };
function carveMaze(seed) {
  const rng = makeRng('maze/' + seed);
  const walls = Array.from({ length: 6 }, () => Array.from({ length: 6 }, () => ({ n: true, e: true, s: true, w: true })));
  const seen = new Set(['0,0']);
  const stack = [[0, 0]];
  while (stack.length) {
    const [r, c] = stack[stack.length - 1];
    const opts = Object.entries(DIRS).filter(([, [dr, dc]]) => {
      const nr = r + dr, nc = c + dc;
      return nr >= 0 && nr < 6 && nc >= 0 && nc < 6 && !seen.has(nr + ',' + nc);
    });
    if (!opts.length) { stack.pop(); continue; }
    const [d, [dr, dc, back]] = rng.pick(opts);
    walls[r][c][d] = false;
    walls[r + dr][c + dc][back] = false;
    seen.add(r + dr + ',' + (c + dc));
    stack.push([r + dr, c + dc]);
  }
  // knock out a few extra walls so there is more than one route
  for (let k = 0; k < 4; k++) {
    const r = rng.int(0, 4), c = rng.int(0, 4);
    const d = rng.pick(['s', 'e']);
    const [dr, dc, back] = DIRS[d];
    walls[r][c][d] = false;
    walls[r + dr][c + dc][back] = false;
  }
  return walls;
}
// Marker cells [row, col] (0-based). The first marker of each maze is unique, so either one identifies it.
const MARKERS = [
  [[1, 0], [2, 5]], [[0, 4], [3, 1]], [[3, 3], [5, 0]], [[0, 0], [3, 4]], [[4, 2], [1, 3]],
  [[2, 2], [5, 5]], [[5, 3], [0, 2]], [[4, 5], [2, 0]], [[1, 1], [4, 4]],
];
export const MAZES = MARKERS.map((markers, i) => ({ walls: carveMaze(i + 1), markers }));

function genMaze(rng) {
  const maze = rng.int(0, 8);
  let start, goal;
  do {
    start = [rng.int(0, 5), rng.int(0, 5)];
    goal = [rng.int(0, 5), rng.int(0, 5)];
  } while (Math.abs(start[0] - goal[0]) + Math.abs(start[1] - goal[1]) < 4);
  return { maze, start, goal };
}

export function mazePath(m, start, goal) {
  const key = (p) => p.join(',');
  const prev = new Map([[key(start), null]]);
  const q = [start];
  while (q.length) {
    const p = q.shift();
    if (key(p) === key(goal)) break;
    for (const [d, [dr, dc]] of Object.entries(DIRS)) {
      if (m.walls[p[0]][p[1]][d]) continue;
      const np = [p[0] + dr, p[1] + dc];
      if (!prev.has(key(np))) { prev.set(key(np), [p, d]); q.push(np); }
    }
  }
  const path = [];
  for (let k = key(goal); prev.get(k); ) { const [p, d] = prev.get(k); path.unshift(d); k = key(p); }
  return path;
}

class MazeLogic {
  constructor(data) { this.data = data; this.m = MAZES[data.maze]; this.pos = data.start.slice(); this.solved = false; }
  move(d) {
    if (this.solved) return {};
    if (this.m.walls[this.pos[0]][this.pos[1]][d]) return { strike: true, wall: true };
    const nr = this.pos[0] + DIRS[d][0], nc = this.pos[1] + DIRS[d][1];
    if (nr < 0 || nr > 5 || nc < 0 || nc > 5) return { strike: true, wall: true };
    this.pos = [nr, nc];
    if (nr === this.data.goal[0] && nc === this.data.goal[1]) { this.solved = true; return { solved: true }; }
    return { moved: true };
  }
}

// ───────────────────────── 11. Password ─────────────────────────
export const PASSWORDS = [
  'AMBER', 'BLAZE', 'CABIN', 'CANDY', 'CHAIR', 'CLOUD', 'CRANE', 'DANCE', 'EAGLE', 'FAITH', 'FROST', 'GHOST',
  'GRAPE', 'HEART', 'HONEY', 'JUICE', 'KNIFE', 'LEMON', 'MAGIC', 'MOUSE', 'NIGHT', 'OLIVE', 'PAINT', 'PEARL',
  'QUEEN', 'RIVER', 'ROBOT', 'SHEEP', 'SMILE', 'STORM', 'TIGER', 'TOAST', 'UNCLE', 'VOICE', 'WHEAT',
];
const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export function passwordMatches(columns) {
  return PASSWORDS.filter((w) => [...w].every((ch, i) => columns[i].includes(ch)));
}

function genPassword(rng) {
  for (;;) {
    const word = rng.pick(PASSWORDS);
    const columns = [...word].map((ch) => rng.shuffle([ch, ...rng.shuffle([...ALPHA].filter((x) => x !== ch)).slice(0, 5)]));
    if (passwordMatches(columns).length === 1) return { word, columns, start: columns.map(() => rng.int(0, 5)) };
  }
}

class PasswordLogic {
  constructor(data) { this.data = data; this.idx = data.start.slice(); this.solved = false; }
  letter(i) { return this.data.columns[i][this.idx[i]]; }
  step(i, d) { if (!this.solved) this.idx[i] = (this.idx[i] + d + 6) % 6; return {}; }
  submit() {
    if (this.solved) return {};
    if (this.idx.map((_, i) => this.letter(i)).join('') === this.data.word) { this.solved = true; return { solved: true }; }
    return { strike: true };
  }
}

// ───────────────────────── Needy modules ─────────────────────────
export const VENT_QUESTIONS = [['PURGE COOLANT?', true], ['SELF DESTRUCT?', false]];
export const VENT_SECONDS = 40;

class VentLogic {
  constructor(data, e, rng) { this.data = data; this.rng = rng; this.needy = true; this.solved = true; this.active = false; this.remaining = 0; this.untilNext = 25; this.q = null; }
  update(dt) {
    if (this.active) {
      this.remaining -= dt;
      if (this.remaining <= 0) { this.sleep(); return { strike: true }; }
      return {};
    }
    if ((this.untilNext -= dt) <= 0) { this.active = true; this.remaining = VENT_SECONDS; this.q = this.rng.pick(VENT_QUESTIONS); return { activated: true }; }
    return {};
  }
  sleep() { this.active = false; this.q = null; this.untilNext = this.rng.int(20, 40); }
  answer(yes) {
    if (!this.active) return {};
    const ok = yes === this.q[1];
    this.sleep();
    return ok ? { correct: true } : { strike: true };
  }
}

export const CAPACITOR_SECONDS = 45;
class CapacitorLogic {
  constructor(data, e, rng) { this.data = data; this.rng = rng; this.needy = true; this.solved = true; this.active = false; this.charge = 0; this.untilNext = 35; this.holding = false; }
  get remaining() { return CAPACITOR_SECONDS - this.charge; }
  update(dt) {
    if (!this.active) {
      if ((this.untilNext -= dt) <= 0) { this.active = true; this.charge = 0; return { activated: true }; }
      return {};
    }
    this.charge = this.holding ? Math.max(0, this.charge - dt * 6) : this.charge + dt;
    if (this.charge >= CAPACITOR_SECONDS) { this.charge = 0; return { strike: true }; }
    return {};
  }
  hold(on) { this.holding = on; return {}; }
}

// Two LED rows of six. Each position has two patterns.
export const KNOB_POSITIONS = ['UP', 'RIGHT', 'DOWN', 'LEFT'];
export const KNOB_PATTERNS = {
  UP: [['101010', '011001'], ['111001', '010010']],
  RIGHT: [['110101', '000011'], ['000111', '111000']],
  DOWN: [['010110', '100101'], ['001101', '110100']],
  LEFT: [['100011', '001110'], ['011100', '101001']],
};
export const KNOB_SECONDS = 30;
class KnobLogic {
  constructor(data, e, rng) { this.data = data; this.rng = rng; this.needy = true; this.solved = true; this.active = false; this.remaining = 0; this.untilNext = 45; this.turn = 0; this.target = null; this.pattern = null; }
  update(dt) {
    if (this.active) {
      this.remaining -= dt;
      if (this.remaining <= 0) {
        const ok = KNOB_POSITIONS[this.turn] === this.target;
        this.active = false; this.pattern = null; this.untilNext = this.rng.int(25, 45);
        return ok ? { correct: true } : { strike: true };
      }
      return {};
    }
    if ((this.untilNext -= dt) <= 0) {
      this.active = true; this.remaining = KNOB_SECONDS;
      this.target = this.rng.pick(KNOB_POSITIONS);
      this.pattern = this.rng.pick(KNOB_PATTERNS[this.target]);
      return { activated: true };
    }
    return {};
  }
  rotate() { this.turn = (this.turn + 1) % 4; return {}; }
}

// ───────────────────────── Registry, modes, generation ─────────────────────────
export const MODULE_TYPES = {
  wires: { name: 'Wires', gen: genWires, Logic: WiresLogic },
  button: { name: 'The Button', gen: genButton, Logic: ButtonLogic },
  keypad: { name: 'Keypad', gen: genKeypad, Logic: KeypadLogic },
  simon: { name: 'Simon', gen: genSimon, Logic: SimonLogic },
  words: { name: 'Word Board', gen: genWords, Logic: WordsLogic },
  memory: { name: 'Memory', gen: genMemory, Logic: MemoryLogic },
  morse: { name: 'Morse Code', gen: genMorse, Logic: MorseLogic },
  cwires: { name: 'Complex Wires', gen: genCwires, Logic: CwiresLogic },
  sequence: { name: 'Wire Sequence', gen: genSequence, Logic: SequenceLogic },
  maze: { name: 'Maze', gen: genMaze, Logic: MazeLogic },
  password: { name: 'Password', gen: genPassword, Logic: PasswordLogic },
};
export const NEEDY_TYPES = {
  vent: { name: 'Venting', gen: () => ({}), Logic: VentLogic },
  capacitor: { name: 'Capacitor', gen: () => ({}), Logic: CapacitorLogic },
  knob: { name: 'Knob', gen: () => ({}), Logic: KnobLogic },
};

const ALL = Object.keys(MODULE_TYPES);
export const MODES = [
  { id: 'intro', name: 'Introduction', count: 3, needy: 0, strikes: 3, minutes: 5, modules: ['wires', 'button', 'keypad'] },
  { id: 'basics', name: 'The Basics', count: 4, needy: 0, strikes: 3, minutes: 5, modules: ['wires', 'button', 'keypad', 'simon', 'words', 'memory', 'cwires'] },
  { id: 'moderate', name: 'Moderate', count: 5, needy: 0, strikes: 3, minutes: 4, modules: ALL },
  { id: 'needy', name: 'Needy', count: 5, needy: 2, strikes: 3, minutes: 5, modules: ALL },
  { id: 'challenging', name: 'Challenging', count: 8, needy: 1, strikes: 2, minutes: 6, modules: ALL },
  { id: 'extreme', name: 'Extreme', count: 11, needy: 2, strikes: 1, minutes: 7, modules: ALL },
];

export function settingsForMode(mode) {
  return { rows: 2, cols: 3, twoSided: mode.count > 5, minutes: mode.minutes, strikes: mode.strikes, needy: mode.needy, modules: mode.modules, count: mode.count, mode: mode.id };
}

export function generateBomb(seed, settings) {
  const rng = makeRng(seed);
  const edge = genEdgework(rng.fork('edge'));
  const slots = [];
  for (let f = 0; f < (settings.twoSided ? 2 : 1); f++)
    for (let r = 0; r < settings.rows; r++)
      for (let c = 0; c < settings.cols; c++) slots.push({ face: f, row: r, col: c });
  const timerIdx = slots.findIndex((s) => s.face === 0 && s.row === 0 && s.col === Math.floor((settings.cols - 1) / 2));
  const timerSlot = slots[timerIdx];
  const shuffled = rng.fork('slots').shuffle(slots.filter((_, i) => i !== timerIdx));
  const n = settings.count ?? shuffled.length;
  const order = shuffled.slice(0, n);
  const empties = shuffled.slice(n);
  const typeRng = rng.fork('types');
  const needyTypes = typeRng.shuffle(Object.keys(NEEDY_TYPES)).slice(0, settings.needy || 0);
  let bag = [];
  const modules = order.map((slot, i) => {
    let type, def;
    if (i < needyTypes.length) { type = needyTypes[i]; def = NEEDY_TYPES[type]; }
    else {
      if (!bag.length) bag = typeRng.shuffle(settings.modules);
      type = bag.pop();
      def = MODULE_TYPES[type];
    }
    const mrng = rng.fork('mod' + i);
    return { id: i, type, slot, data: def.gen(mrng, edge), def, rng: mrng.fork('live') };
  });
  return { seed, settings, edge, timerSlot, modules, empties };
}

// ctx: { strikes: () => number } — some rules depend on the current strike count.
export function createLogic(m, edge, ctx) {
  return new m.def.Logic(m.data, edge, m.rng, ctx);
}
