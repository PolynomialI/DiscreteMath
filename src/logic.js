// Keep Proving and Nobody Explodes — pure game logic (no DOM, no three.js).
// Every rule here must match manual.html. test/logic.test.mjs checks them.

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

// ───────────────────────── Edgework ─────────────────────────
export const INDICATOR_LABELS = ['NEG', 'AND', 'ALL', 'SET', 'IFF', 'NUL', 'ONE'];
export const PORT_TYPES = ['PARALLEL', 'SERIAL', 'USB', 'HDMI', 'RJ-45'];
const VOWELS = 'AEIU'; // no O in serials (looks like 0)
const SERIAL_LETTERS = 'ABCDEFGHIJKLMNPQRSTUVWXZ';

export function genEdgework(rng) {
  // Serial: 6 characters, at least one letter and one digit, last character always a digit.
  let serial = '';
  for (let i = 0; i < 5; i++) serial += rng.chance(0.55) ? rng.pick(SERIAL_LETTERS) : String(rng.int(0, 9));
  serial += String(rng.int(0, 9));
  if (!/[A-Z]/.test(serial)) serial = rng.pick(SERIAL_LETTERS) + serial.slice(1);

  // Every bomb shows every casing item the manual asks about (serial, batteries, indicators),
  // so "there are none" never looks like "I missed it". Rules can still come out FALSE:
  // one D holder is a single battery, and indicators can all be unlit.
  const holders = [];
  const nHolders = rng.int(1, 3);
  for (let i = 0; i < nHolders; i++) holders.push(rng.chance(0.5) ? 'AA' : 'D');

  const indicators = rng.shuffle(INDICATOR_LABELS).slice(0, rng.int(1, 3)).map((label) => ({ label, lit: rng.chance(0.5) }));

  const ports = [];
  const nPlates = rng.int(0, 2);
  for (let i = 0; i < nPlates; i++) ports.push(rng.shuffle(PORT_TYPES).slice(0, rng.int(1, 2)));

  return { serial, holders, indicators, ports };
}

// Derived values used by the manual (Appendix: "The Casing").
export function edgeFacts(e) {
  const D = new Set([...e.serial].filter((c) => /\d/.test(c)).map(Number));
  const V = new Set([...e.serial].filter((c) => 'AEIOU'.includes(c)));
  const b = e.holders.reduce((n, h) => n + (h === 'AA' ? 2 : 1), 0);
  const lit = new Set(e.indicators.filter((i) => i.lit).map((i) => i.label));
  return { D, V, b, lit };
}

// ───────────────────────── Propositional formulas ─────────────────────────
// AST: ['var',x] ['not',a] ['and',a,b] ['or',a,b] ['imp',a,b] ['iff',a,b]
// Precedence (tightest first): ¬ ∧ ∨ → ↔ ; → and ↔ are right-associative.
export function parse(src) {
  const toks = [...src.replace(/\s+/g, '')];
  let pos = 0;
  const peek = () => toks[pos];
  const eat = (c) => {
    const t = toks[pos++];
    if (c && t !== c) throw new SyntaxError(`expected ${c} got ${t} in ${src}`);
    return t;
  };
  const iff = () => { const l = imp(); if (peek() === '↔') { eat(); return ['iff', l, iff()]; } return l; };
  const imp = () => { const l = disj(); if (peek() === '→') { eat(); return ['imp', l, imp()]; } return l; };
  const disj = () => { let n = conj(); while (peek() === '∨') { eat(); n = ['or', n, conj()]; } return n; };
  const conj = () => { let n = unary(); while (peek() === '∧') { eat(); n = ['and', n, unary()]; } return n; };
  const unary = () => {
    if (peek() === '¬') { eat(); return ['not', unary()]; }
    if (peek() === '(') { eat('('); const n = iff(); eat(')'); return n; }
    const t = eat();
    if (!t || !/[A-Za-z]/.test(t)) throw new SyntaxError(`bad token ${t} in ${src}`);
    return ['var', t];
  };
  const tree = iff();
  if (pos !== toks.length) throw new SyntaxError(`trailing input in ${src}`);
  return tree;
}

export function evaluate(n, env) {
  switch (n[0]) {
    case 'var': return env[n[1]];
    case 'not': return !evaluate(n[1], env);
    case 'and': return evaluate(n[1], env) && evaluate(n[2], env);
    case 'or': return evaluate(n[1], env) || evaluate(n[2], env);
    case 'imp': return !evaluate(n[1], env) || evaluate(n[2], env);
    case 'iff': return evaluate(n[1], env) === evaluate(n[2], env);
  }
  throw new Error(n[0]);
}

// ───────────────────────── Module 1: Wires ─────────────────────────
export const WIRE_COLORS = ['red', 'blue', 'yellow', 'black', 'white'];

// colors listed top → bottom. Returns { cut: 1-based wire, rule: 1..4 }.
export function solveWires(colors, e) {
  const f = edgeFacts(e);
  const n = colors.length;
  const count = (c) => colors.filter((x) => x === c).length;
  const has = (c) => count(c) > 0;
  const last = (c) => colors.lastIndexOf(c) + 1;
  if (n === 3) {
    if (!has('red')) return { cut: 2, rule: 1 };
    if (colors.every((c) => c === 'red' || c === 'blue')) return { cut: 3, rule: 2 };
    if (has('white')) return { cut: last('white'), rule: 3 };
    return { cut: 1, rule: 4 };
  }
  if (n === 4) {
    if (!has('yellow')) return { cut: 1, rule: 1 };
    if (has('black')) return { cut: last('black'), rule: 2 };
    if (colors.every((c) => c === 'red' || c === 'yellow')) return { cut: 3, rule: 3 };
    return { cut: 4, rule: 4 };
  }
  if (n === 5) {
    if (has('black') && has('white')) return { cut: 4, rule: 1 };
    if (!has('red')) return { cut: 1, rule: 2 };
    if ([...f.D].some((d) => d % 2 === 1)) return { cut: 5, rule: 3 };
    return { cut: 2, rule: 4 };
  }
  if (n === 6) {
    if (!has('yellow')) return { cut: 3, rule: 1 };
    if (has('white')) return { cut: last('white'), rule: 2 };
    if (count('red') >= 2) return { cut: last('red'), rule: 3 };
    return { cut: 6, rule: 4 };
  }
  throw new Error('bad wire count');
}

function genWires(rng, e) {
  const n = rng.int(3, 6);
  const target = rng.int(1, 4);
  let colors;
  for (let tries = 0; tries < 400; tries++) {
    colors = Array.from({ length: n }, () => rng.pick(WIRE_COLORS));
    if (solveWires(colors, e).rule === target) break;
  }
  return { colors };
}

class WiresLogic {
  constructor(data, e) {
    this.data = data;
    this.solution = solveWires(data.colors, e);
    this.cut = new Set();
    this.solved = false;
  }
  cutWire(i) {
    if (this.solved || this.cut.has(i)) return {};
    this.cut.add(i);
    if (i === this.solution.cut) { this.solved = true; return { solved: true }; }
    return { strike: true };
  }
  answer() { return `Cut wire ${this.solution.cut} (rule ${this.solution.rule})`; }
}

// ───────────────────────── Module 2: The Button ─────────────────────────
export const BUTTON_COLORS = ['red', 'blue', 'yellow', 'white'];
export const BUTTON_LABELS = ['TRUE', 'FALSE', 'NOT', 'ALL'];
export const STRIP_COLORS = ['blue', 'white', 'yellow', 'red'];
// Release sets from the manual: Blue {1,2,3,4} ∩ {4,5,6}; White {1,3,5} − {3,5};
// Yellow {5,6,7} ∩ {1,3,5}; Red {x ∈ ℤ | 1 < x < 3}.
export const RELEASE_DIGIT = { blue: 4, white: 1, yellow: 5, red: 2 };
export const TAP_MAX_MS = 500;

export function solveButton(color, label, e) {
  const f = edgeFacts(e);
  const p = color === 'red';
  const q = label === 'TRUE';
  const r = f.b >= 2;
  const s = f.lit.size > 0;
  if (p && q) return { action: 'TAP', rule: 1 };
  if (!p && !r) return { action: 'HOLD', rule: 2 };
  if (q || s) return { action: 'TAP', rule: 3 };
  return { action: 'HOLD', rule: 4 };
}

export function timerShowsDigit(text, digit) {
  return text.includes(String(digit));
}

function genButton(rng, e) {
  const target = rng.int(1, 4);
  let color, label;
  for (let tries = 0; tries < 200; tries++) {
    color = rng.pick(BUTTON_COLORS);
    label = rng.pick(BUTTON_LABELS);
    if (solveButton(color, label, e).rule === target) break;
  }
  return { color, label };
}

class ButtonLogic {
  constructor(data, e, rng) {
    this.data = data;
    this.rng = rng;
    this.solution = solveButton(data.color, data.label, e);
    this.solved = false;
    this.strip = null;
  }
  // Called when a press has lasted TAP_MAX_MS: the strip lights up.
  startHold() {
    this.strip = this.rng.pick(STRIP_COLORS);
    return this.strip;
  }
  release(wasHold, timerText) {
    if (this.solved) return {};
    const strip = this.strip;
    this.strip = null;
    if (this.solution.action === 'TAP') {
      if (!wasHold) { this.solved = true; return { solved: true }; }
      return { strike: true };
    }
    if (!wasHold) return { strike: true };
    if (timerShowsDigit(timerText, RELEASE_DIGIT[strip])) { this.solved = true; return { solved: true }; }
    return { strike: true };
  }
  answer() {
    return this.solution.action === 'TAP'
      ? `TAP (rule ${this.solution.rule})`
      : `HOLD (rule ${this.solution.rule}); release on blue 4 · white 1 · yellow 5 · red 2`;
  }
}

// ───────────────────────── Module 3: Set Keypad ─────────────────────────
export const KEYPAD_SETS = { A: [1, 2, 3, 4], B: [3, 4, 5], C: [2, 4, 6, 8] };
export const KEYPAD_UNIVERSE = [1, 2, 3, 4, 5, 6, 7, 8];
const S = (arr) => new Set(arr);
const A_ = S(KEYPAD_SETS.A), B_ = S(KEYPAD_SETS.B), C_ = S(KEYPAD_SETS.C), U_ = S(KEYPAD_UNIVERSE);
const uni = (x, y) => new Set([...x, ...y]);
const inter = (x, y) => new Set([...x].filter((v) => y.has(v)));
const diff = (x, y) => new Set([...x].filter((v) => !y.has(v)));
// Each entry: [text shown on key, cardinality computed from the definitions above].
export const KEYPAD_EXPRS = [
  ['∅', 0],
  ['A', A_.size],
  ['B', B_.size],
  ['C', C_.size],
  ['A ∩ B', inter(A_, B_).size],
  ['A ∪ B', uni(A_, B_).size],
  ['A − B', diff(A_, B_).size],
  ['B − A', diff(B_, A_).size],
  ['A ∩ C', inter(A_, C_).size],
  ['A ∪ C', uni(A_, C_).size],
  ['C − A', diff(C_, A_).size],
  ['B ∩ C', inter(B_, C_).size],
  ['B ∪ C', uni(B_, C_).size],
  ['C − B', diff(C_, B_).size],
  ['A ∩ B ∩ C', inter(inter(A_, B_), C_).size],
  ['A ∪ B ∪ C', uni(uni(A_, B_), C_).size],
  ['(A ∪ B) − C', diff(uni(A_, B_), C_).size],
  ["A′", diff(U_, A_).size],
  ["B′", diff(U_, B_).size],
  ["C′", diff(U_, C_).size],
  ['{∅}', 1],
  ['{A, B}', 2],
  ['A ∪ A′', U_.size],
];

function genKeypad(rng) {
  for (;;) {
    const pick = rng.shuffle(KEYPAD_EXPRS).slice(0, 4);
    if (new Set(pick.map((p) => p[1])).size === 4) return { keys: pick.map((p) => p[0]) };
  }
}

export function keypadOrder(keys) {
  const card = (t) => KEYPAD_EXPRS.find((x) => x[0] === t)[1];
  return [0, 1, 2, 3].sort((a, b) => card(keys[a]) - card(keys[b]));
}

class KeypadLogic {
  constructor(data) {
    this.data = data;
    this.order = keypadOrder(data.keys);
    this.done = new Set();
    this.step = 0;
    this.solved = false;
  }
  press(k) {
    if (this.solved || this.done.has(k)) return {};
    if (k === this.order[this.step]) {
      this.done.add(k);
      this.step++;
      if (this.step === 4) { this.solved = true; return { solved: true, correct: true }; }
      return { correct: true };
    }
    return { strike: true };
  }
  answer() {
    const pos = ['TL', 'TR', 'BL', 'BR'];
    return 'Press ' + this.order.map((i) => `${pos[i]} (${this.data.keys[i]})`).join(' → ');
  }
}

// ───────────────────────── Module 4: Simon Maps ─────────────────────────
export const SIMON_COLORS = ['red', 'blue', 'green', 'yellow'];
// f is used when V ≠ ∅ (the serial has a vowel), g when V = ∅.
export const SIMON_F = { red: 'blue', blue: 'red', green: 'yellow', yellow: 'green' };
export const SIMON_G = { red: 'yellow', blue: 'green', green: 'blue', yellow: 'red' };

function genSimon(rng) {
  const n = rng.int(3, 5);
  return { seq: Array.from({ length: n }, () => rng.pick(SIMON_COLORS)) };
}

class SimonLogic {
  constructor(data, e) {
    this.data = data;
    this.map = edgeFacts(e).V.size > 0 ? SIMON_F : SIMON_G;
    this.stage = 1;
    this.input = 0;
    this.solved = false;
  }
  expected() { return this.map[this.data.seq[this.input]]; }
  press(color) {
    if (this.solved) return {};
    if (color !== this.expected()) { this.input = 0; return { strike: true }; }
    this.input++;
    if (this.input < this.stage) return { correct: true };
    this.input = 0;
    this.stage++;
    if (this.stage > this.data.seq.length) { this.solved = true; return { solved: true }; }
    return { advance: true };
  }
  answer() {
    const fn = this.map === SIMON_F ? 'f' : 'g';
    return `Use ${fn}: press ` + this.data.seq.map((c) => this.map[c]).join(', ');
  }
}

// ───────────────────────── Module 5: Who's on ∀irst (quantifier words) ─────────────────────────
// Domain: the students in this class. T(x, y): "x is taller than y".
export const WORD_FORMS = [
  { sym: '∀x ∀y T(x,y)', english: 'Everyone is taller than everyone.', word: 'ATLAS' },
  { sym: '∀x ∃y T(x,y)', english: 'Everyone is taller than someone.', word: 'BISHOP' },
  { sym: '∃x ∀y T(x,y)', english: 'Someone is taller than everyone.', word: 'COMET' },
  { sym: '∃x ∃y T(x,y)', english: 'Someone is taller than someone.', word: 'DYNAMO' },
  { sym: '∀y ∃x T(x,y)', english: 'Everyone has someone taller than them.', word: 'EMBER' },
  { sym: '∃y ∀x T(x,y)', english: 'Someone has everyone taller than them.', word: 'FALCON' },
  { sym: '¬∃x ∃y T(x,y)', english: 'No one is taller than anyone.', word: 'GLACIER' },
  { sym: '∃x ¬∃y T(x,y)', english: 'Someone is taller than no one.', word: 'HARBOR' },
];

function genWords(rng) {
  const forms = rng.shuffle([...WORD_FORMS.keys()]).slice(0, 3);
  const stages = forms.map((f) => {
    const others = rng.shuffle([...WORD_FORMS.keys()].filter((i) => i !== f)).slice(0, 5);
    return { form: f, buttons: rng.shuffle([f, ...others]).map((i) => WORD_FORMS[i].word) };
  });
  return { stages };
}

class WordsLogic {
  constructor(data) {
    this.data = data;
    this.stage = 0;
    this.solved = false;
  }
  current() { return this.data.stages[Math.min(this.stage, 2)]; }
  press(i) {
    if (this.solved) return {};
    const st = this.current();
    if (st.buttons[i] !== WORD_FORMS[st.form].word) return { strike: true };
    this.stage++;
    if (this.stage === 3) { this.solved = true; return { solved: true }; }
    return { advance: true };
  }
  answer() {
    return this.data.stages.map((s) => `${WORD_FORMS[s.form].sym} → ${WORD_FORMS[s.form].word}`).join(' · ');
  }
}

// ───────────────────────── Module 6: Venn Wires ─────────────────────────
// R = red-colored wires (incl. striped), B = blue-colored (incl. striped),
// L = LED on, S = ★ below. Cut every wire in K = (R ∩ L) ∪ (S − B).
export function vennCutSet(wires) {
  const K = new Set();
  wires.forEach((w, i) => {
    const inRL = w.red && w.led;
    const inSB = w.star && !w.blue;
    if (inRL || inSB) K.add(i + 1);
  });
  return K;
}

function genVenn(rng) {
  const n = rng.int(4, 6);
  for (;;) {
    const wires = Array.from({ length: n }, () => {
      const kind = rng.pick(['red', 'blue', 'both', 'white']);
      return {
        red: kind === 'red' || kind === 'both',
        blue: kind === 'blue' || kind === 'both',
        led: rng.chance(0.5),
        star: rng.chance(0.45),
      };
    });
    const K = vennCutSet(wires);
    if (K.size >= 1 && K.size <= n - 1) return { wires };
  }
}

class VennLogic {
  constructor(data) {
    this.data = data;
    this.K = vennCutSet(data.wires);
    this.cut = new Set();
    this.solved = false;
  }
  cutWire(i) {
    if (this.solved || this.cut.has(i)) return {};
    this.cut.add(i);
    if (!this.K.has(i)) return { strike: true };
    if ([...this.K].every((k) => this.cut.has(k))) { this.solved = true; return { solved: true }; }
    return { correct: true };
  }
  answer() { return `Cut {${[...this.K].sort().join(', ')}}`; }
}

// ───────────────────────── Module 7: Quantifier Grid ─────────────────────────
export const GRID_BUTTONS = ['red', 'blue', 'green', 'yellow'];

export function solveGrid(g) {
  const R = [0, 1, 2], C = [0, 1, 2];
  if (R.some((r) => C.every((c) => g[r][c] % 2 === 0))) return { color: 'red', rule: 1 };
  if (R.every((r) => C.some((c) => g[r][c] === 0))) return { color: 'blue', rule: 2 };
  if (C.some((c) => R.every((r) => g[r][c] > 5))) return { color: 'green', rule: 3 };
  return { color: 'yellow', rule: 4 };
}

function genGrid(rng) {
  const target = rng.int(1, 4);
  for (let tries = 0; ; tries++) {
    const g = [0, 1, 2].map(() => [0, 1, 2].map(() => rng.int(0, 9)));
    if (target === 2) for (const row of g) row[rng.int(0, 2)] = 0;
    if (target === 3) { const c = rng.int(0, 2); for (const row of g) row[c] = rng.int(6, 9); }
    if (solveGrid(g).rule === target || tries > 500) return { grid: g };
  }
}

class GridLogic {
  constructor(data) {
    this.data = data;
    this.solution = solveGrid(data.grid);
    this.solved = false;
  }
  press(color) {
    if (this.solved) return {};
    if (color === this.solution.color) { this.solved = true; return { solved: true }; }
    return { strike: true };
  }
  answer() { return `Press ${this.solution.color} (rule ${this.solution.rule})`; }
}

// ───────────────────────── Module 8: Truth Table ─────────────────────────
export const TT_FORMULAS = [
  'P ∧ Q', 'P ∨ Q', 'P → Q', 'Q → P', 'P ↔ Q', '¬P ∨ Q', '¬(P ∧ Q)', '¬(P ∨ Q)',
  'P ∧ ¬Q', '¬P → Q', '¬(P → Q)', '¬(P ↔ Q)', '¬P ∧ Q', 'P ∨ ¬Q', '¬Q → ¬P',
];
// Column order (left → right): 1 = (P T, Q T), 2 = (T, F), 3 = (F, T), 4 = (F, F).
export const TT_ROWS = [[true, true], [true, false], [false, true], [false, false]];

export function truthColumn(formula) {
  const tree = parse(formula);
  return TT_ROWS.map(([P, Q]) => evaluate(tree, { P, Q }));
}

function genTruth(rng) {
  const formula = rng.pick(TT_FORMULAS);
  const sol = truthColumn(formula);
  let start;
  do start = TT_ROWS.map(() => rng.chance(0.5)); while (start.every((v, i) => v === sol[i]));
  return { formula, start };
}

class TruthLogic {
  constructor(data) {
    this.data = data;
    this.solution = truthColumn(data.formula);
    this.cols = data.start.slice();
    this.solved = false;
  }
  toggle(i) { if (!this.solved) this.cols[i] = !this.cols[i]; return {}; }
  submit() {
    if (this.solved) return {};
    if (this.cols.every((v, i) => v === this.solution[i])) { this.solved = true; return { solved: true }; }
    return { strike: true };
  }
  answer() { return `Set ${this.solution.map((v) => (v ? 'T' : 'F')).join(' ')} then SUBMIT`; }
}

// ───────────────────────── Needy: Argument Check ─────────────────────────
// [premises, conclusion, valid, name in the manual]
export const ARGUMENTS = [
  [['p → q', 'p'], 'q', true, 'Modus ponens'],
  [['p → q', '¬q'], '¬p', true, 'Modus tollens'],
  [['p → q', 'q → r'], 'p → r', true, 'Hypothetical syllogism'],
  [['p ∨ q', '¬p'], 'q', true, 'Disjunctive syllogism'],
  [['p'], 'p ∨ q', true, 'Addition'],
  [['p ∧ q'], 'p', true, 'Simplification'],
  [['p → q', 'q'], 'p', false, 'Affirming the conclusion'],
  [['p → q', '¬p'], '¬q', false, 'Denying the hypothesis'],
  [['p ∨ q', 'p'], '¬q', false, 'Exclusive-or trap'],
  [['∀x P(x)'], 'P(c)', true, 'Universal instantiation'],
  [['P(c)'], '∃x P(x)', true, 'Existential generalization'],
  [['∀x (P(x) → Q(x))', 'P(c)'], 'Q(c)', true, 'Universal modus ponens'],
  [['∀x (P(x) → Q(x))', 'Q(c)'], 'P(c)', false, 'Affirming the conclusion (∀)'],
  [['∃x P(x)'], '∀x P(x)', false, 'Hasty generalization'],
  [['¬∀x P(x)'], '∃x ¬P(x)', true, 'Negating ∀'],
  [['¬∀x P(x)'], '∀x ¬P(x)', false, 'Bad negation'],
];
export const NEEDY_SECONDS = 40;

export function propositionalValid(premises, conclusion) {
  const trees = premises.map(parse);
  const concl = parse(conclusion);
  const vars = new Set();
  const collect = (n) => (n[0] === 'var' ? vars.add(n[1]) : n.slice(1).forEach(collect));
  [...trees, concl].forEach(collect);
  const vs = [...vars];
  for (let m = 0; m < 1 << vs.length; m++) {
    const env = Object.fromEntries(vs.map((v, i) => [v, !!(m & (1 << i))]));
    if (trees.every((t) => evaluate(t, env)) && !evaluate(concl, env)) return false;
  }
  return true;
}

class NeedyLogic {
  constructor(data, e, rng) {
    this.data = data;
    this.rng = rng;
    this.needy = true;
    this.solved = true; // needy modules never block the win
    this.active = false;
    this.remaining = 0;
    this.untilNext = 30; // first activation 30 s into the bomb
    this.current = null;
  }
  update(dt) {
    if (this.active) {
      this.remaining -= dt;
      if (this.remaining <= 0) { this.deactivate(); return { strike: true, timeout: true }; }
      return {};
    }
    this.untilNext -= dt;
    if (this.untilNext <= 0) {
      this.active = true;
      this.remaining = NEEDY_SECONDS;
      this.current = this.rng.pick(ARGUMENTS);
      return { activated: true };
    }
    return {};
  }
  deactivate() {
    this.active = false;
    this.current = null;
    this.untilNext = this.rng.int(20, 40);
  }
  answer(saysValid) {
    if (!this.active) return {};
    const ok = saysValid === this.current[2];
    this.deactivate();
    return ok ? { correct: true } : { strike: true };
  }
  answerText() { return this.current ? (this.current[2] ? 'Y (valid)' : 'N (invalid)') : 'inactive'; }
}

// ───────────────────────── Registry & bomb generation ─────────────────────────
export const MODULE_TYPES = {
  wires: { name: 'Wires', gen: genWires, Logic: WiresLogic },
  button: { name: 'The Button', gen: genButton, Logic: ButtonLogic },
  keypad: { name: 'Set Keypad', gen: genKeypad, Logic: KeypadLogic },
  simon: { name: 'Simon Maps', gen: genSimon, Logic: SimonLogic },
  words: { name: 'Who’s on ∀irst', gen: genWords, Logic: WordsLogic },
  venn: { name: 'Venn Wires', gen: genVenn, Logic: VennLogic },
  grid: { name: 'Quantifier Grid', gen: genGrid, Logic: GridLogic },
  truth: { name: 'Truth Table', gen: genTruth, Logic: TruthLogic },
};
export const NEEDY_TYPE = { name: 'Argument Check', gen: () => ({}), Logic: NeedyLogic };

// Difficulty modes (the only choice on the title screen). The case is always 2 × 3;
// bombs with more than 5 modules get a second face on the back. Unused bays get blank covers.
const ALL = ['wires', 'button', 'keypad', 'simon', 'words', 'venn', 'grid', 'truth'];
export const MODES = [
  { id: 'intro', name: 'Introduction', count: 3, strikes: 3, minutes: 5, needy: false, modules: ['wires', 'button', 'keypad'] },
  { id: 'basics', name: 'The Basics', count: 4, strikes: 3, minutes: 5, needy: false, modules: ['wires', 'button', 'keypad', 'simon', 'grid'] },
  { id: 'moderate', name: 'Moderate', count: 5, strikes: 3, minutes: 4, needy: false, modules: ALL },
  { id: 'needy', name: 'Needy', count: 5, strikes: 2, minutes: 5, needy: true, modules: ALL },
  { id: 'challenging', name: 'Challenging', count: 8, strikes: 2, minutes: 6, needy: false, modules: ALL },
  { id: 'extreme', name: 'Extreme', count: 11, strikes: 1, minutes: 6, needy: true, modules: ALL },
];

export function settingsForMode(mode) {
  return { rows: 2, cols: 3, twoSided: mode.count > 5, minutes: mode.minutes, strikes: mode.strikes, needy: mode.needy, modules: mode.modules, count: mode.count, mode: mode.id };
}

export const DEFAULT_SETTINGS = {
  rows: 2,
  cols: 3,
  twoSided: false,
  minutes: 5,
  strikes: 3,
  needy: false,
  modules: Object.keys(MODULE_TYPES),
};

// Builds a whole bomb from a seed and settings. Pure and deterministic.
export function generateBomb(seed, settings) {
  const rng = makeRng(seed);
  const edge = genEdgework(rng.fork('edge'));
  const faces = settings.twoSided ? 2 : 1;
  const slots = [];
  for (let f = 0; f < faces; f++)
    for (let r = 0; r < settings.rows; r++)
      for (let c = 0; c < settings.cols; c++) slots.push({ face: f, row: r, col: c });

  const timerSlot = slots.findIndex((s) => s.face === 0 && s.row === 0 && s.col === Math.floor((settings.cols - 1) / 2));
  const free = slots.filter((_, i) => i !== timerSlot);
  const shuffled = rng.fork('slots').shuffle(free);
  const n = settings.count ?? shuffled.length; // modules on the bomb (needy included)
  const order = shuffled.slice(0, n);
  const empties = shuffled.slice(n);

  const types = settings.modules.length ? settings.modules : Object.keys(MODULE_TYPES);
  const mods = [];
  let needyLeft = settings.needy ? 1 : 0;
  let bag = [];
  const typeRng = rng.fork('types');
  order.forEach((slot, i) => {
    let type;
    if (needyLeft > 0 && i === order.length - 1) { type = 'needy'; needyLeft--; }
    else {
      if (!bag.length) bag = typeRng.shuffle(types);
      type = bag.pop();
    }
    const def = type === 'needy' ? NEEDY_TYPE : MODULE_TYPES[type];
    const mrng = rng.fork('mod' + i);
    const data = def.gen(mrng, edge);
    mods.push({ id: i, type, slot, data, def, rng: mrng.fork('live') });
  });
  return { seed, settings, edge, timerSlot: slots[timerSlot], modules: mods, empties, seconds: settings.minutes * 60 };
}

export function createLogic(m, edge) {
  return new m.def.Logic(m.data, edge, m.rng);
}

export function formatTime(sec) {
  const s = Math.max(0, Math.ceil(sec));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}
