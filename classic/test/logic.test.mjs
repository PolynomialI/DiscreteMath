// Run: node classic/test/logic.test.mjs
import assert from 'node:assert/strict';
import * as L from '../src/logic.js';
import { packEdgework, edgeItems, bombSize } from '../src/bomb3d.js';

let passed = 0;
const t = (name, fn) => { fn(); passed++; console.log('  ok  ' + name); };
const E = (serial, holders = ['AA'], indicators = [{ label: 'ARM', lit: false }], ports = [['USB']]) => ({ serial, holders, indicators, ports });
const ctx0 = { strikes: () => 0 };

t('casing always has every item the rules ask about', () => {
  const seen = { b2: new Set(), lit: new Set(), vowel: new Set(), odd: new Set(), par: new Set(), usb: new Set(), b3: new Set() };
  for (let i = 0; i < 3000; i++) {
    const e = L.genEdgework(L.makeRng('e' + i));
    const f = L.edgeFacts(e);
    assert.ok(/\d$/.test(e.serial) && /[A-Z]/.test(e.serial) && e.serial.length === 6);
    assert.ok(e.holders.length >= 1 && e.indicators.length >= 1 && e.ports.length >= 1);
    seen.b2.add(f.b >= 2); seen.b3.add(f.b >= 3); seen.lit.add(f.anyLit); seen.vowel.add(f.vowel);
    seen.odd.add(f.lastOdd); seen.par.add(f.ports.has('PARALLEL')); seen.usb.add(f.ports.has('USB'));
  }
  for (const s of Object.values(seen)) assert.equal(s.size, 2, 'every casing question can be both yes and no');
});

t('casing widgets always fit', () => {
  const { W, H } = bombSize({ rows: 2, cols: 3 });
  for (let i = 0; i < 3000; i++) {
    const items = edgeItems(L.genEdgework(L.makeRng('w' + i)));
    const r = packEdgework(items, W, H);
    assert.ok(!r.overflow);
  }
});

t('wires: hand-checked + every rule reachable', () => {
  const even = E('AB1CD4'), odd = E('BC2DF5', ['AA', 'D']), litVowel = E('AE3CD4', ['D'], [{ label: 'BAT', lit: true }]);
  assert.deepEqual(L.solveWires(['red', 'red', 'white'], even), { cut: 3, rule: 1 });
  assert.deepEqual(L.solveWires(['white', 'blue', 'red'], even), { cut: 1, rule: 2 });
  assert.deepEqual(L.solveWires(['red', 'blue', 'blue'], even), { cut: 3, rule: 3 });
  assert.deepEqual(L.solveWires(['red', 'blue', 'red'], even), { cut: 2, rule: 4 });
  assert.deepEqual(L.solveWires(['yellow', 'black', 'yellow', 'red'], even), { cut: 1, rule: 1 });
  assert.deepEqual(L.solveWires(['white', 'blue', 'red', 'white'], odd), { cut: 4, rule: 2 });
  assert.deepEqual(L.solveWires(['white', 'black', 'red', 'blue'], odd), { cut: 3, rule: 3 });
  assert.deepEqual(L.solveWires(['blue', 'black', 'blue', 'white'], odd), { cut: 1, rule: 4 });
  assert.deepEqual(L.solveWires(['blue', 'black', 'blue', 'blue'], odd), { cut: 2, rule: 5 });
  assert.deepEqual(L.solveWires(['red', 'black', 'red', 'red', 'blue'], litVowel), { cut: 2, rule: 1 });
  const edges = [even, odd, litVowel, E('XY7ZQ8', ['AA', 'D'])];
  for (let n = 3; n <= 6; n++) {
    const seen = new Set();
    const rec = (c) => { if (c.length === n) { for (const e of edges) seen.add(L.solveWires(c, e).rule); return; } for (const x of L.WIRE_COLORS) rec([...c, x]); };
    rec([]);
    assert.equal(seen.size, n === 3 ? 4 : 5, 'n=' + n);
  }
});

t('button: every rule reachable', () => {
  const seen = new Set();
  for (let i = 0; i < 300; i++) {
    const e = L.genEdgework(L.makeRng('b' + i));
    for (const c of L.BUTTON_COLORS) for (const l of L.BUTTON_LABELS) seen.add(L.solveButton(c, l, e).rule);
  }
  assert.deepEqual([...seen].sort(), [1, 2, 3, 4, 5, 6]);
});

t('keypad: columns valid, generated keys always have exactly one column', () => {
  for (const col of L.KEYPAD_COLUMNS) assert.equal(new Set(col).size, 7);
  for (let i = 0; i < 500; i++) {
    const k = L.MODULE_TYPES.keypad.gen(L.makeRng('k' + i)).keys;
    assert.ok(L.keypadOrder(k));
  }
});

t('simon maps are bijections', () => {
  for (const tbl of Object.values(L.SIMON_MAP)) for (const m of tbl) assert.equal(new Set(Object.values(m)).size, 4);
});

t('word board: lists are permutations, answer always on the board', () => {
  for (const w of L.BUTTON_WORDS) assert.deepEqual([...L.WORD_LISTS[w]].sort(), [...L.BUTTON_WORDS].sort());
  for (let i = 0; i < 500; i++) {
    const d = L.MODULE_TYPES.words.gen(L.makeRng('wd' + i));
    for (const st of d.stages) assert.ok(L.solveWords(st.display, st.buttons) >= 0);
  }
});

t('memory rules only refer to earlier stages', () => {
  L.MEMORY_RULES.forEach((stage, si) => stage.forEach(([k, n]) => { if (k.startsWith('same')) assert.ok(n <= si); }));
});

t('morse: distinct words and frequencies', () => {
  assert.equal(new Set(L.MORSE_WORDS.map((w) => w[0])).size, 16);
  assert.equal(new Set(L.MORSE_WORDS.map((w) => w[1])).size, 16);
});

t('complex wires: table covers all 16 combinations', () => {
  assert.equal(Object.keys(L.CWIRE_TABLE).length, 16);
  for (const v of Object.values(L.CWIRE_TABLE)) assert.ok(L.CWIRE_LETTERS[v]);
});

t('mazes: fully connected, markers unique', () => {
  const all = L.MAZES.flatMap((m) => m.markers.map((p) => p.join(',')));
  assert.equal(new Set(all).size, 18);
  for (const m of L.MAZES) for (let r = 0; r < 6; r++) for (let c = 0; c < 6; c++) {
    assert.ok(r === 0 && c === 0 || L.mazePath(m, [0, 0], [r, c]).length > 0, 'reachable');
  }
});

t('passwords: 35 five-letter words, exactly one answer per module', () => {
  assert.equal(new Set(L.PASSWORDS).size, 35);
  for (const w of L.PASSWORDS) assert.equal(w.length, 5);
  for (let i = 0; i < 300; i++) assert.equal(L.passwordMatches(L.MODULE_TYPES.password.gen(L.makeRng('p' + i)).columns).length, 1);
});

t('knob patterns all distinct', () => {
  const pats = Object.values(L.KNOB_PATTERNS).flat().map((p) => p.join('/'));
  assert.equal(new Set(pats).size, 8);
});

t('1000 random bombs: every module solvable through its API', () => {
  const types = new Set();
  for (let i = 0; i < 1000; i++) {
    const mode = L.MODES[i % L.MODES.length];
    const b = L.generateBomb('S' + i, L.settingsForMode(mode));
    assert.equal(b.modules.length, mode.count);
    assert.equal(b.modules.filter((m) => m.type in L.NEEDY_TYPES).length, mode.needy);
    for (const m of b.modules) {
      const lg = L.createLogic(m, b.edge, ctx0);
      types.add(m.type);
      if (lg.needy) continue;
      switch (m.type) {
        case 'wires': lg.cutWire(lg.solution.cut); break;
        case 'button':
          if (lg.solution.action === 'TAP') lg.release(false, '1:00');
          else { const s = lg.startHold(); lg.release(true, `${L.RELEASE_DIGIT[s]}:00`); }
          break;
        case 'keypad': for (const k of lg.order) lg.press(k); break;
        case 'simon': for (let s = 1; s <= m.data.seq.length; s++) for (let j = 0; j < s; j++) lg.press(lg.map()[m.data.seq[j]]); break;
        case 'words': for (let s = 0; s < 3; s++) { const st = lg.current(); lg.press(L.solveWords(st.display, st.buttons)); } break;
        case 'memory': for (let s = 0; s < 5; s++) lg.press(lg.answer()); break;
        case 'morse': while (lg.freq < m.data.word) lg.step(1); lg.transmit(); break;
        case 'cwires': for (const k of lg.K) lg.cutWire(k); break;
        case 'sequence': for (let p = 0; p < 4; p++) { lg.cuts[p].forEach((must, j) => must && lg.cutWire(j)); lg.next(); } break;
        case 'maze': for (const d of L.mazePath(lg.m, m.data.start, m.data.goal)) lg.move(d); break;
        case 'password': for (let c = 0; c < 5; c++) while (lg.letter(c) !== m.data.word[c]) lg.step(c, 1); lg.submit(); break;
      }
      assert.ok(lg.solved, m.type + ' not solved');
    }
  }
  assert.equal(types.size, 14, [...types].join(','));
});

t('wrong actions strike', () => {
  const b = L.generateBomb('WRONG', L.settingsForMode(L.MODES[5]));
  for (const m of b.modules) {
    const lg = L.createLogic(m, b.edge, ctx0);
    if (m.type === 'memory') { const a = lg.answer(); assert.ok(lg.press((a + 1) % 4).strike); }
    if (m.type === 'morse') { lg.step(m.data.word === 0 ? 1 : -1 * 0); if (lg.freq !== m.data.word) assert.ok(lg.transmit().strike); }
    if (m.type === 'maze') {
      const d = ['n', 'e', 's', 'w'].find((x) => lg.m.walls[lg.pos[0]][lg.pos[1]][x]);
      if (d) assert.ok(lg.move(d).strike);
    }
    if (m.type === 'password') { lg.step(0, 1); assert.ok(lg.idx[0] === m.data.start[0] || lg.submit().strike !== undefined); }
  }
});

console.log(`\nALL ${passed} CLASSIC TESTS PASSED`);
