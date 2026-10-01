// Run: node test/logic.test.mjs
import assert from 'node:assert/strict';
import {
  solveWires, solveButton, keypadOrder, KEYPAD_EXPRS, vennCutSet, solveGrid, truthColumn, parse,
  propositionalValid, ARGUMENTS, WORD_FORMS, generateBomb, createLogic, DEFAULT_SETTINGS, MODULE_TYPES,
  edgeFacts, formatTime, RELEASE_DIGIT, SIMON_F, SIMON_G, WIRE_COLORS,
} from '../src/logic.js';

let passed = 0;
const t = (name, fn) => { fn(); passed++; console.log('  ok  ' + name); };
const E = (serial, holders = [], indicators = []) => ({ serial, holders, indicators, ports: [] });

t('edge facts', () => {
  const f = edgeFacts(E('KA4T74', ['AA', 'D'], [{ label: 'NEG', lit: true }, { label: 'SET', lit: false }]));
  assert.deepEqual([...f.D].sort(), [4, 7]);
  assert.deepEqual([...f.V], ['A']);
  assert.equal(f.b, 3);
  assert.deepEqual([...f.lit], ['NEG']);
});

t('wires: hand-checked rules', () => {
  const odd = E('AB1CD3'), even = E('AB2CD4'), bat2 = E('AB2CD4', ['AA']), bat1 = E('AB2CD4', ['D']);
  assert.deepEqual(solveWires(['blue', 'blue', 'white'], even), { cut: 2, rule: 1 });
  assert.deepEqual(solveWires(['red', 'blue', 'red'], even), { cut: 3, rule: 2 });
  assert.deepEqual(solveWires(['white', 'red', 'yellow'], even), { cut: 1, rule: 3 });
  assert.deepEqual(solveWires(['red', 'yellow', 'black'], even), { cut: 1, rule: 4 });
  assert.deepEqual(solveWires(['blue', 'red', 'blue', 'yellow'], even), { cut: 2, rule: 1 });
  assert.deepEqual(solveWires(['red', 'red', 'blue', 'black'], even), { cut: 1, rule: 2 });
  assert.deepEqual(solveWires(['black', 'yellow', 'black', 'blue'], bat2), { cut: 3, rule: 3 });
  assert.deepEqual(solveWires(['black', 'yellow', 'black', 'blue'], bat1), { cut: 4, rule: 4 });
  assert.deepEqual(solveWires(['black', 'red', 'white', 'red', 'red'], even), { cut: 4, rule: 1 });
  assert.deepEqual(solveWires(['blue', 'yellow', 'blue', 'black', 'blue'], even), { cut: 1, rule: 2 });
  assert.deepEqual(solveWires(['red', 'yellow', 'blue', 'black', 'blue'], odd), { cut: 5, rule: 3 });
  assert.deepEqual(solveWires(['red', 'yellow', 'blue', 'black', 'blue'], even), { cut: 2, rule: 4 });
  assert.deepEqual(solveWires(['red', 'blue', 'black', 'white', 'red', 'blue'], even), { cut: 3, rule: 1 });
  assert.deepEqual(solveWires(['yellow', 'white', 'red', 'black', 'red', 'blue'], even), { cut: 2, rule: 2 });
  assert.deepEqual(solveWires(['yellow', 'red', 'red', 'black', 'blue', 'blue'], even), { cut: 3, rule: 3 });
  assert.deepEqual(solveWires(['yellow', 'red', 'white', 'white', 'blue', 'blue'], even), { cut: 6, rule: 4 });
});

t('wires: every rule reachable for every wire count', () => {
  const edges = [E('AB1CD3'), E('AB2CD4', ['AA'])];
  for (let n = 3; n <= 6; n++) {
    const seen = new Set();
    const rec = (cols) => {
      if (cols.length === n) { for (const e of edges) seen.add(solveWires(cols, e).rule); return; }
      for (const c of WIRE_COLORS) rec([...cols, c]);
    };
    rec([]);
    assert.deepEqual([...seen].sort(), [1, 2, 3, 4], `n=${n}`);
  }
});

t('button: rules + reachability', () => {
  const none = E('BCD2FG'), lit2 = E('BCD2FG', ['AA'], [{ label: 'NEG', lit: true }]), unlit2 = E('BCD2FG', ['AA']);
  assert.equal(solveButton('red', 'TRUE', none).rule, 1);
  assert.equal(solveButton('blue', 'ALL', none).rule, 2);
  assert.equal(solveButton('blue', 'TRUE', lit2).rule, 3);
  assert.equal(solveButton('red', 'NOT', lit2).rule, 3);
  assert.equal(solveButton('red', 'NOT', none).rule, 4);
  assert.equal(solveButton('yellow', 'FALSE', unlit2).rule, 4);
  assert.deepEqual(RELEASE_DIGIT, { blue: 4, white: 1, yellow: 5, red: 2 });
});

t('keypad: cardinalities + order', () => {
  const card = Object.fromEntries(KEYPAD_EXPRS);
  assert.equal(card['A ∩ B'], 2); assert.equal(card['A ∪ B ∪ C'], 7); assert.equal(card["A′"], 4);
  assert.equal(card['{∅}'], 1); assert.equal(card['∅'], 0); assert.equal(card['C − B'], 3);
  assert.deepEqual(keypadOrder(['A ∪ B', '∅', 'C − B', 'B ∩ C']), [1, 3, 2, 0]);
});

t('simon maps are bijections', () => {
  for (const m of [SIMON_F, SIMON_G]) assert.equal(new Set(Object.values(m)).size, 4);
});

t('words: 8 distinct code words', () => {
  assert.equal(new Set(WORD_FORMS.map((w) => w.word)).size, 8);
});

t('venn cut set', () => {
  const w = (red, blue, led, star) => ({ red, blue, led, star });
  // 1 red+LED → cut · 2 blue+LED+★ → no · 3 white ★ → cut · 4 striped LED → cut · 5 red ★ → cut · 6 blue → no
  assert.deepEqual([...vennCutSet([w(1, 0, 1, 0), w(0, 1, 1, 1), w(0, 0, 0, 1), w(1, 1, 1, 0), w(1, 0, 0, 1), w(0, 1, 0, 0)])], [1, 3, 4, 5]);
});

t('grid rules', () => {
  assert.equal(solveGrid([[2, 4, 6], [1, 3, 5], [7, 7, 7]]).color, 'red');
  assert.equal(solveGrid([[0, 1, 3], [5, 0, 7], [9, 9, 0]]).color, 'blue');
  assert.equal(solveGrid([[7, 1, 3], [8, 2, 1], [9, 5, 1]]).color, 'green');
  assert.equal(solveGrid([[1, 2, 3], [4, 5, 6], [7, 8, 9]]).color, 'yellow');
});

t('truth table columns', () => {
  const s = (f) => truthColumn(f).map((v) => (v ? 'T' : 'F')).join('');
  assert.equal(s('P → Q'), 'TFTT'); assert.equal(s('P ↔ Q'), 'TFFT'); assert.equal(s('¬(P ∨ Q)'), 'FFFT');
  assert.equal(s('¬P → Q'), 'TTTF'); assert.equal(s('¬Q → ¬P'), 'TFTT');
});

t('argument bank: propositional entries verified by truth table', () => {
  for (const [prem, concl, valid] of ARGUMENTS) {
    const txt = prem.join('') + concl;
    if (/[∀∃(]/.test(txt)) continue;
    assert.equal(propositionalValid(prem, concl), valid, prem.join(', ') + ' ∴ ' + concl);
  }
  parse('¬(P ∧ Q) ↔ ¬P ∨ ¬Q');
});

t('timer format', () => {
  assert.equal(formatTime(300), '5:00'); assert.equal(formatTime(277), '4:37'); assert.equal(formatTime(5), '0:05');
  assert.equal(formatTime(-1), '0:00');
});

t('1000 random bombs: generation valid and every module solvable by its answer', () => {
  const ruleHits = {};
  for (let i = 0; i < 1000; i++) {
    const settings = { ...DEFAULT_SETTINGS, rows: 1 + (i % 3), cols: 2 + (i % 3), twoSided: i % 2 === 0, needy: i % 4 === 0 };
    const bomb = generateBomb('T' + i, settings);
    const again = generateBomb('T' + i, settings);
    assert.deepEqual(JSON.stringify(bomb.modules.map((m) => m.data)), JSON.stringify(again.modules.map((m) => m.data)));
    const slots = settings.rows * settings.cols * (settings.twoSided ? 2 : 1);
    assert.equal(bomb.modules.length, slots - 1);
    assert.equal(bomb.modules.filter((m) => m.type === 'needy').length, settings.needy ? 1 : 0);
    for (const m of bomb.modules) {
      const L = createLogic(m, bomb.edge);
      if (m.type === 'needy') continue;
      ruleHits[m.type] ??= new Set();
      // Solve each module through its public API.
      if (m.type === 'wires') { ruleHits.wires.add(L.data.colors.length + ':' + L.solution.rule); assert.ok(L.cutWire(L.solution.cut).solved); }
      if (m.type === 'button') {
        ruleHits.button.add(L.solution.rule);
        if (L.solution.action === 'TAP') assert.ok(L.release(false, '4:37').solved);
        else { const strip = L.startHold(); assert.ok(L.release(true, `${RELEASE_DIGIT[strip]}:00`).solved); }
      }
      if (m.type === 'keypad') { let r; for (const k of L.order) r = L.press(k); assert.ok(r.solved); }
      if (m.type === 'simon') {
        let r; for (let s = 1; s <= m.data.seq.length; s++) for (let j = 0; j < s; j++) r = L.press(L.map[m.data.seq[j]]);
        assert.ok(r.solved);
      }
      if (m.type === 'words') { let r; for (const st of m.data.stages) r = L.press(st.buttons.indexOf(WORD_FORMS[st.form].word)); assert.ok(r.solved); }
      if (m.type === 'venn') { let r; for (const k of L.K) r = L.cutWire(k); assert.ok(r.solved); }
      if (m.type === 'grid') { ruleHits.grid.add(L.solution.rule); assert.ok(L.press(L.solution.color).solved); }
      if (m.type === 'truth') {
        L.solution.forEach((v, i) => { if (L.cols[i] !== v) L.toggle(i); });
        assert.ok(L.submit().solved);
      }
      assert.ok(L.solved, m.type);
    }
  }
  assert.equal(ruleHits.button.size, 4);
  assert.equal(ruleHits.grid.size, 4);
  assert.ok(ruleHits.wires.size >= 15, [...ruleHits.wires].join(' '));
  assert.deepEqual(Object.keys(ruleHits).sort(), Object.keys(MODULE_TYPES).sort());
});

t('wrong actions give strikes', () => {
  const bomb = generateBomb('STRIKES', { ...DEFAULT_SETTINGS, rows: 3, cols: 4, twoSided: true });
  for (const m of bomb.modules) {
    const L = createLogic(m, bomb.edge);
    if (m.type === 'wires') assert.ok(L.cutWire(L.solution.cut === 1 ? 2 : 1).strike);
    if (m.type === 'button') assert.ok(L.release(L.solution.action === 'TAP', '0:00').strike);
    if (m.type === 'keypad') assert.ok(L.press(L.order[3]).strike);
    if (m.type === 'grid') assert.ok(L.press(['red', 'blue', 'green', 'yellow'].find((c) => c !== L.solution.color)).strike);
    if (m.type === 'truth') { L.cols = L.solution.map((v) => !v); assert.ok(L.submit().strike); }
    if (m.type === 'venn') { const bad = m.data.wires.findIndex((_, i) => !L.K.has(i + 1)) + 1; assert.ok(L.cutWire(bad).strike); }
  }
});

console.log(`\nALL ${passed} LOGIC TESTS PASSED`);
