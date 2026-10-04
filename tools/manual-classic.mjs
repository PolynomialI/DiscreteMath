// Generates classic/manual.html from the game's own rule data (classic/src/logic.js),
// so the printed manual and the game can never disagree.  Usage: node tools/manual-classic.mjs
import { writeFileSync } from 'node:fs';
import * as L from '../classic/src/logic.js';

const VERSION = 'v. 1';
const TITLE = 'LOGIC BOMB: Classic Edition';
const pages = [];
const page = (section, body, { cls = '' } = {}) => pages.push({ section, body, cls });
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const ord = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth'];
const cap = (s) => s[0].toUpperCase() + s.slice(1);

// Deterministic printer's specks so every page looks a little worn.
const speckRng = L.makeRng('specks');
function specks() {
  let s = '';
  for (let i = 0; i < 26; i++) {
    const edge = speckRng.next() < 0.6;
    const x = edge ? (speckRng.next() < 0.5 ? speckRng.next() * 6 : 94 + speckRng.next() * 6) : speckRng.next() * 100;
    const y = speckRng.next() * 100;
    const r = 0.4 + speckRng.next() * 1.6;
    s += `<span class="speck" style="left:${x.toFixed(1)}%;top:${y.toFixed(1)}%;width:${r.toFixed(1)}px;height:${(r * (0.6 + speckRng.next())).toFixed(1)}px;opacity:${(0.25 + speckRng.next() * 0.5).toFixed(2)}"></span>`;
  }
  return s;
}

// ── small line-art icons for each module (original drawings) ──
const frame = (inner) => `<svg class="icon" viewBox="0 0 120 120"><rect x="3" y="3" width="114" height="114" fill="#fff" stroke="#111" stroke-width="2"/><circle cx="104" cy="15" r="5" fill="none" stroke="#111" stroke-width="1.6"/>${inner}</svg>`;
const ICON = {
  wires: frame('<rect x="18" y="22" width="8" height="78" fill="none" stroke="#111" stroke-width="2"/><rect x="92" y="22" width="8" height="78" fill="none" stroke="#111" stroke-width="2"/>' + [32, 50, 68, 86].map((y, i) => `<path d="M26 ${y} C50 ${y - 6 + i * 3} 70 ${y + 6} 92 ${y}" fill="none" stroke="#111" stroke-width="2"/>`).join('')),
  button: frame('<circle cx="52" cy="64" r="32" fill="none" stroke="#111" stroke-width="2"/><circle cx="52" cy="64" r="24" fill="none" stroke="#111" stroke-width="1.5"/><text x="52" y="69" font-size="12" text-anchor="middle" font-family="Courier Prime">[LABEL]</text><rect x="92" y="34" width="12" height="62" fill="none" stroke="#111" stroke-width="2"/>'),
  keypad: frame([[22, 28], [62, 28], [22, 68], [62, 68]].map(([x, y]) => `<rect x="${x}" y="${y}" width="34" height="34" fill="none" stroke="#111" stroke-width="2"/><rect x="${x + 12}" y="${y + 4}" width="10" height="4" fill="#111"/>`).join('')),
  simon: frame('<g transform="rotate(45 58 64)"><rect x="30" y="36" width="56" height="56" fill="none" stroke="#111" stroke-width="2"/><line x1="58" y1="36" x2="58" y2="92" stroke="#111" stroke-width="2"/><line x1="30" y1="64" x2="86" y2="64" stroke="#111" stroke-width="2"/></g>'),
  words: frame('<rect x="16" y="18" width="70" height="22" fill="none" stroke="#111" stroke-width="2"/>' + [0, 1, 2].map((r) => `<rect x="16" y="${50 + r * 21}" width="34" height="15" fill="none" stroke="#111" stroke-width="1.6"/><rect x="56" y="${50 + r * 21}" width="34" height="15" fill="none" stroke="#111" stroke-width="1.6"/>`).join('') + [0, 1, 2].map((r) => `<rect x="100" y="${54 + r * 18}" width="7" height="7" fill="none" stroke="#111" stroke-width="1.4"/>`).join('')),
  memory: frame('<rect x="22" y="18" width="56" height="38" fill="none" stroke="#111" stroke-width="2"/><text x="50" y="47" font-size="24" text-anchor="middle" font-family="Courier Prime">3</text>' + [0, 1, 2, 3].map((i) => `<rect x="${12 + i * 21}" y="68" width="17" height="32" fill="none" stroke="#111" stroke-width="1.6"/>`).join('') + [0, 1, 2, 3, 4].map((i) => `<rect x="102" y="${30 + i * 15}" width="7" height="7" fill="none" stroke="#111" stroke-width="1.4"/>`).join('')),
  morse: frame('<circle cx="34" cy="32" r="12" fill="none" stroke="#111" stroke-width="2"/><rect x="26" y="56" width="62" height="18" fill="none" stroke="#111" stroke-width="2"/><text x="57" y="69" font-size="10" text-anchor="middle" font-family="Courier Prime">3.410 MHz</text><path d="M12 65 l8 -6 v12z M102 65 l-8 -6 v12z" fill="#111"/><rect x="40" y="86" width="34" height="16" fill="none" stroke="#111" stroke-width="2"/><text x="57" y="98" font-size="10" text-anchor="middle" font-family="Courier Prime">TX</text>'),
  cwires: frame('<rect x="14" y="16" width="86" height="10" fill="none" stroke="#111" stroke-width="2"/><rect x="14" y="94" width="86" height="12" fill="none" stroke="#111" stroke-width="2"/>' + [24, 42, 60, 78, 94].map((x) => `<path d="M${x} 26 C${x - 5} 50 ${x + 5} 70 ${x} 94" fill="none" stroke="#111" stroke-width="2"/>`).join('') + '<text x="42" y="104" font-size="9" text-anchor="middle">★</text>'),
  sequence: frame('<rect x="16" y="20" width="10" height="70" fill="none" stroke="#111" stroke-width="2"/><rect x="80" y="20" width="10" height="70" fill="none" stroke="#111" stroke-width="2"/><path d="M26 32 C50 32 56 70 80 70 M26 55 C50 55 56 32 80 32 M26 78 C50 78 56 55 80 55" fill="none" stroke="#111" stroke-width="2"/><rect x="36" y="96" width="34" height="12" fill="none" stroke="#111" stroke-width="2"/>'),
  maze: frame('<rect x="22" y="24" width="64" height="64" fill="none" stroke="#111" stroke-width="2"/>' + Array.from({ length: 36 }, (_, i) => `<circle cx="${27 + (i % 6) * 10.8}" cy="${29 + Math.floor(i / 6) * 10.8}" r="1.3" fill="#111"/>`).join('') + '<path d="M54 12 l6 6 h-12z M54 100 l6 -6 h-12z M10 56 l6 6 v-12z M98 56 l-6 6 v-12z" fill="#111"/>'),
  password: frame([0, 1, 2, 3, 4].map((i) => `<path d="M${16 + i * 19} 36 l6 -7 l6 7z" fill="#111"/><rect x="${14 + i * 19}" y="44" width="16" height="22" fill="none" stroke="#111" stroke-width="1.6"/><path d="M${16 + i * 19} 74 l6 7 l6 -7z" fill="#111"/>`).join('') + '<rect x="34" y="92" width="44" height="14" fill="none" stroke="#111" stroke-width="2"/>'),
  vent: frame('<rect x="50" y="12" width="20" height="12" fill="none" stroke="#111" stroke-width="1.6"/><rect x="14" y="32" width="92" height="44" fill="none" stroke="#111" stroke-width="2"/><rect x="26" y="86" width="26" height="20" fill="none" stroke="#111" stroke-width="2"/><text x="39" y="101" font-size="12" text-anchor="middle">Y</text><rect x="68" y="86" width="26" height="20" fill="none" stroke="#111" stroke-width="2"/><text x="81" y="101" font-size="12" text-anchor="middle">N</text>'),
  capacitor: frame('<rect x="22" y="12" width="20" height="12" fill="none" stroke="#111" stroke-width="1.6"/><rect x="18" y="32" width="14" height="74" fill="none" stroke="#111" stroke-width="2"/><rect x="58" y="30" width="12" height="76" fill="none" stroke="#111" stroke-width="2"/><rect x="48" y="40" width="32" height="12" rx="6" fill="#111"/>'),
  knob: frame('<rect x="50" y="10" width="20" height="12" fill="none" stroke="#111" stroke-width="1.6"/>' + Array.from({ length: 12 }, (_, i) => `<circle cx="${22 + (i % 6) * 15}" cy="${34 + Math.floor(i / 6) * 12}" r="4" fill="none" stroke="#111" stroke-width="1.4"/>`).join('') + '<circle cx="60" cy="86" r="20" fill="none" stroke="#111" stroke-width="2"/><line x1="60" y1="86" x2="60" y2="68" stroke="#111" stroke-width="3"/><text x="60" y="62" font-size="8" text-anchor="middle">UP</text>'),
};

const moduleHead = (title, icon, flavor) => `<div class="modhead"><div><h1>${title}</h1><p class="flavor">${flavor}</p></div>${ICON[icon]}</div>`;
const ul = (items) => `<ul>${items.map((i) => `<li>${i}</li>`).join('')}</ul>`;

// ───────────── Cover ─────────────
page(null, `
  <div class="cover">
    <svg class="coverbomb" viewBox="0 0 120 120"><circle cx="54" cy="70" r="40" fill="#111"/><rect x="62" y="22" width="18" height="16" transform="rotate(35 71 30)" fill="#111"/><path d="M80 22 C88 10 96 12 100 6" fill="none" stroke="#111" stroke-width="3"/><path d="M100 6 l4 -6 M100 6 l7 -1 M100 6 l2 6 M100 6 l-5 -3" stroke="#111" stroke-width="2"/><circle cx="40" cy="56" r="8" fill="#fff" opacity=".85"/></svg>
    <div class="covertitle">LOGIC BOMB</div>
    <div class="coversub">CLASSIC EDITION</div>
    <hr><div class="covermanual">BOMB DEFUSAL<br>MANUAL</div><hr>
    <div class="coverver">Version 1</div>
    <div class="coverfoot">A classroom bomb-defusal game. All rules, text and art are original.</div>
  </div>`, { cls: 'nohead' });

// ───────────── Introduction ─────────────
page('Introduction', `
  <div class="intro">
    <p>You are holding the only copy of the instructions.</p>
    <p>Somewhere nearby, a colleague is staring at a ticking device and waiting for you to say something useful.
    They can see the bomb. You can't. You can read this manual. They can't.</p>
    <p><u>Read carefully, speak clearly, and never guess.</u><br>The clock does not care how close you were.</p>
  </div>`);

// ───────────── Defusing Bombs ─────────────
page('Defusing Bombs', `
  <h1>Defusing Bombs</h1>
  <p>A bomb explodes when its countdown timer reaches 0:00 or when it records too many strikes. The bomb is defused
  only when every module on it has been disarmed before time runs out.</p>
  <div class="center">
    <div class="caption">Example Bomb</div>
    <svg class="example" viewBox="0 0 420 170">
      <rect x="10" y="10" width="300" height="150" fill="none" stroke="#111" stroke-width="2"/>
      ${[0, 1, 2].map((c) => [0, 1].map((r) => `<rect x="${22 + c * 96}" y="${20 + r * 70}" width="86" height="62" fill="none" stroke="#111" stroke-width="1.5"/>`).join('')).join('')}
      <rect x="128" y="34" width="66" height="30" fill="none" stroke="#111" stroke-width="1.5"/><text x="161" y="56" font-size="18" text-anchor="middle" font-family="Courier Prime">5:00</text>
      <rect x="146" y="24" width="30" height="8" fill="none" stroke="#111" stroke-width="1.2"/>
      <circle cx="98" cy="28" r="3" fill="none" stroke="#111"/><circle cx="290" cy="28" r="3" fill="none" stroke="#111"/>
      <path d="M36 44 C50 40 70 50 92 44 M36 56 C50 60 70 52 92 56" fill="none" stroke="#111" stroke-width="1.5"/>
      <circle cx="259" cy="51" r="20" fill="none" stroke="#111" stroke-width="1.5"/>
      <rect x="340" y="10" width="44" height="150" fill="none" stroke="#111" stroke-width="2"/>
      <rect x="348" y="22" width="28" height="44" fill="none" stroke="#111" stroke-width="1.2"/><text x="362" y="48" font-size="7" text-anchor="middle" transform="rotate(90 362 46)">SERIAL</text>
      <rect x="348" y="80" width="28" height="22" fill="none" stroke="#111" stroke-width="1.2"/><rect x="348" y="112" width="28" height="36" fill="none" stroke="#111" stroke-width="1.2"/>
      <text x="160" y="182" font-size="12" text-anchor="middle">Front</text><text x="362" y="182" font-size="12" text-anchor="middle">Side</text>
    </svg>
  </div>
  <h2>Modules</h2>
  <p>A bomb can hold up to eleven modules. Each one is separate and can be disarmed in any order. Section 1 covers
  regular modules. "Needy" modules never stay disarmed and are covered in Section 2.</p>
  <h2>Strikes</h2>
  <p>Every mistake the Defuser makes records a strike, shown above the countdown timer. Each strike makes the timer run
  faster. When the last allowed strike is recorded, the bomb explodes.</p>
  <h2>Gathering Information</h2>
  <p>Many instructions need details printed on the bomb's casing, such as the serial number, batteries, indicators and
  ports. The Defuser can turn the bomb over to read the top, bottom and sides. See Appendices A, B and C.</p>`);

// ───────────── Section 1 divider ─────────────
page('Section 1: Modules', `
  <div class="divider"><div><h1>Section 1: Modules</h1>
  <p>A module has a status light in its top right corner.<br>When the light turns green, the module is disarmed.</p>
  <p>Every module must be disarmed to defuse the bomb.</p></div>
  <svg class="icon big" viewBox="0 0 120 120"><rect x="3" y="3" width="114" height="114" fill="#fff" stroke="#111" stroke-width="2"/><circle cx="104" cy="15" r="5" fill="none" stroke="#111" stroke-width="1.6"/></svg></div>`, { cls: 'mid' });

// ───────────── Wires ─────────────
page('Section 1: Modules', `
  ${moduleHead('On the Subject of Wires', 'wires', 'Several wires, one correct snip. Count twice, cut once.')}
  <p>A wires module has three to six wires. Only <b>one</b> of them must be cut. Wires are counted from the
  <b>top</b> down: the top wire is the first wire.</p>
  <div class="rulegrid">
  <div><h3>3 wires:</h3>${ul([
    'If there are no blue wires, cut the third wire.',
    'Otherwise, if the first wire is white, cut the first wire.',
    'Otherwise, if there is more than one blue wire, cut the last blue wire.',
    'Otherwise, cut the second wire.'])}</div>
  <div><h3>4 wires:</h3>${ul([
    'If there is more than one yellow wire and the last digit of the serial number is even, cut the first yellow wire.',
    'Otherwise, if there are no black wires, cut the fourth wire.',
    'Otherwise, if there is exactly one red wire, cut the third wire.',
    'Otherwise, if the last wire is white, cut the first wire.',
    'Otherwise, cut the second wire.'])}</div>
  <div><h3>5 wires:</h3>${ul([
    'If the second wire is black and the bomb has a lit indicator, cut the second wire.',
    'Otherwise, if there are exactly two red wires, cut the first red wire.',
    'Otherwise, if there are no white wires and the serial number contains a vowel, cut the fifth wire.',
    'Otherwise, if there are more yellow wires than blue wires, cut the last yellow wire.',
    'Otherwise, cut the third wire.'])}</div>
  <div><h3>6 wires:</h3>${ul([
    'If there are no red wires and the bomb has three or more batteries, cut the second wire.',
    'Otherwise, if the first and last wires are the same color, cut the fourth wire.',
    'Otherwise, if there is exactly one black wire, cut the black wire.',
    'Otherwise, if the last digit of the serial number is odd, cut the sixth wire.',
    'Otherwise, cut the fifth wire.'])}</div>
  </div>`);

// ───────────── Button ─────────────
page('Section 1: Modules', `
  ${moduleHead('On the Subject of The Button', 'button', 'It begs to be pressed. Sometimes it should be held instead.')}
  <p>Follow the <b>first</b> rule below that applies:</p>
  <ol>
    <li>If the button is white and the label says "WAIT", hold the button and see "Releasing a Held Button".</li>
    <li>If the button is red and the bomb has two or more batteries, press and immediately release the button.</li>
    <li>If the label says "PUSH" and the bomb has a lit indicator, press and immediately release the button.</li>
    <li>If the button is blue, hold the button and see "Releasing a Held Button".</li>
    <li>If the bomb has a parallel port, press and immediately release the button.</li>
    <li>Otherwise, hold the button and see "Releasing a Held Button".</li>
  </ol>
  <h2>Releasing a Held Button</h2>
  <p>While the button is held, a colored strip lights up to the right of it. Release the button when the countdown
  timer shows the digit below <b>in any position</b>.</p>
  <table class="small">
    <tr><th>Strip color</th><th>Release when the timer shows a</th></tr>
    ${Object.entries(L.RELEASE_DIGIT).map(([c, d]) => `<tr><td>${cap(c)}</td><td><b>${d}</b></td></tr>`).join('')}
  </table>`);

// ───────────── Keypad ─────────────
page('Section 1: Modules', `
  ${moduleHead('On the Subject of Keypads', 'keypad', 'Four strange symbols. Only one column knows their order.')}
  <p>Exactly one column below contains all four symbols on the keypad. Press the four keys in the order their symbols
  appear in that column, from <b>top to bottom</b>.</p>
  <table class="keypad">
    ${L.KEYPAD_COLUMNS[0].map((_, r) => `<tr>${L.KEYPAD_COLUMNS.map((col) => `<td>${col[r]}</td>`).join('')}</tr>`).join('')}
  </table>`);

// ───────────── Simon ─────────────
const SIMON_ROW = (tbl, s) => L.SIMON_COLORS.map((c) => `<td>${cap(tbl[s][c])}</td>`).join('');
page('Section 1: Modules', `
  ${moduleHead('On the Subject of Simon', 'simon', 'A pattern of lights that wants an answer in kind.')}
  <ol>
    <li>One of the four colored pads will flash.</li>
    <li>Using the table below, the Defuser presses the matching color.</li>
    <li>The original pad flashes again, followed by one more. Press the matching color for each one, in order.</li>
    <li>The sequence grows by one each time until the module is disarmed. A wrong press is a strike and the current sequence starts over.</li>
  </ol>
  ${['vowel', 'none'].map((k) => `
  <h3>If the serial number ${k === 'vowel' ? 'contains a vowel' : 'does not contain a vowel'}:</h3>
  <table class="simon">
    <tr><th></th><th>Red flash</th><th>Blue flash</th><th>Green flash</th><th>Yellow flash</th></tr>
    ${[0, 1, 2].map((s) => `<tr><th>${s === 2 ? '2 or more strikes' : s + ' strike' + (s === 1 ? '' : 's')}</th>${SIMON_ROW(L.SIMON_MAP[k], s)}</tr>`).join('')}
  </table>`).join('')}
  <p class="note">Use the number of strikes on the bomb at the moment of each press.</p>`);

// ───────────── Word Board (2 pages) ─────────────
const posGrid = (p) => `<svg class="pos" viewBox="0 0 30 40">${[0, 1, 2, 3, 4, 5].map((i) => `<rect x="${2 + (i % 2) * 14}" y="${2 + Math.floor(i / 2) * 12.5}" width="12" height="10" fill="${i === p ? '#111' : 'none'}" stroke="#111" stroke-width="1.4"/>`).join('')}</svg>`;
page('Section 1: Modules', `
  ${moduleHead('On the Subject of the Word Board', 'words', 'Six buttons, one display, and a lot of words that sound alike.')}
  <p>Disarm this module in three stages. Each stage has two steps.</p>
  <h2>Step 1</h2>
  <p>Have the Defuser read the display and spell it out. Find the word below. The highlighted box shows which
  <b>button</b> to read next. Then go to Step 2.</p>
  <table class="wordpos">
    ${Object.entries(L.DISPLAY_WORDS).reduce((rows, e, i) => { (rows[Math.floor(i / 3)] ||= []).push(e); return rows; }, [])
      .map((row) => `<tr>${row.map(([w, p]) => `<td><span class="dw">${esc(w)}</span>${posGrid(p)}</td>`).join('')}</tr>`).join('')}
  </table>`);
page('Section 1: Modules', `
  <h2>Step 2</h2>
  <p>Find the word on the button from Step 1 in the left column. Read its list from left to right and press the
  <b>first</b> word in the list that appears on any button. The list may include the word itself.</p>
  <table class="lists">
    ${L.BUTTON_WORDS.map((w) => `<tr><th>${w}</th><td>${L.WORD_LISTS[w].join(', ')}</td></tr>`).join('')}
  </table>`);

// ───────────── Memory ─────────────
const memRule = ([k, n]) => k === 'pos' ? `Press the button in position ${n}.`
  : k === 'label' ? `Press the button labeled "${n}".`
  : k === 'samePos' ? `Press the button in the same position as in stage ${n}.`
  : `Press the button with the same label as in stage ${n}.`;
page('Section 1: Modules', `
  ${moduleHead('On the Subject of Memory', 'memory', 'Remember what you did. The bomb certainly will.')}
  <p>Press the correct button to move on to the next stage. Disarm all five stages to disarm the module. A wrong press
  resets the module to stage 1. Buttons are numbered by <b>position</b> from left to right; their <b>label</b> is the
  number printed on them.</p>
  <p class="note">Write down the position and label of every button you press.</p>
  <table class="memory"><tr><th></th>${[1, 2, 3, 4].map((d) => `<th>Display ${d}</th>`).join('')}</tr>
  ${L.MEMORY_RULES.map((stage, si) => `<tr><th>Stage ${si + 1}</th>${stage.map((r) => `<td>${memRule(r)}</td>`).join('')}</tr>`).join('')}</table>`);

// ───────────── Morse ─────────────
const MORSE_SVG = (code) => [...code].map((c) => (c === '.' ? '<span class="dot">●</span>' : '<span class="dash">▬</span>')).join('');
page('Section 1: Modules', `
  ${moduleHead('On the Subject of Morse Code', 'morse', 'A blinking light that spells one word, over and over.')}
  <p>The light flashes a word in Morse code: short flashes are dots, long flashes are dashes. A long pause means the word
  is about to repeat. Find the word in the table, set the matching frequency with the arrows and press <b>TX</b>.</p>
  <div class="morsegrid">
    <table class="morse">${Object.entries(L.MORSE).slice(0, 13).map(([k, v]) => `<tr><th>${k}</th><td>${MORSE_SVG(v)}</td></tr>`).join('')}</table>
    <table class="morse">${Object.entries(L.MORSE).slice(13).map(([k, v]) => `<tr><th>${k}</th><td>${MORSE_SVG(v)}</td></tr>`).join('')}</table>
    <table class="freq"><tr><th>Word</th><th>Respond at</th></tr>${L.MORSE_WORDS.map(([w, f]) => `<tr><td>${w.toLowerCase()}</td><td>${f} MHz</td></tr>`).join('')}</table>
  </div>`);

// ───────────── Complex Wires ─────────────
const yes = (b) => (b ? 'Yes' : '—');
const cwRows = Object.entries(L.CWIRE_TABLE).map(([k, v]) => `<tr><td>${yes(k[0] === '1')}</td><td>${yes(k[1] === '1')}</td><td>${yes(k[2] === '1')}</td><td>${yes(k[3] === '1')}</td><td class="letter">${v}</td></tr>`).join('');
page('Section 1: Modules', `
  ${moduleHead('On the Subject of Complex Wires', 'cwires', 'Stripes, stars and little lights. Each wire is its own decision.')}
  <p>Each wire runs from top to bottom. Above each wire is an LED; below it is a space that may show a ★. A wire may be
  red, blue, striped red and blue, or white. Decide for each wire separately using the table. Order does not matter.</p>
  <div class="cwgrid">
  <table class="cw"><tr><th>Red</th><th>Blue</th><th>★</th><th>LED on</th><th>Letter</th></tr>${cwRows}</table>
  <table class="legend">${Object.entries(L.CWIRE_LETTERS).map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join('')}</table>
  </div>
  <p class="note">A striped wire counts as both red and blue. A white wire is neither.</p>`);

// ───────────── Wire Sequence ─────────────
page('Section 1: Modules', `
  ${moduleHead('On the Subject of Wire Sequences', 'sequence', 'Four panels of wires. Keep count as you go.')}
  <p>The module has four panels. Each panel connects plugs <b>1–3</b> on the left to plugs <b>A–C</b> on the right.
  Cut every wire the tables say to cut, then press <b>NEXT</b> to move to the next panel. Pressing NEXT while a wire still
  needs cutting is a strike.</p>
  <p>Keep a running count of each color across <b>all</b> panels, including wires you did not cut. On each panel, go
  from plug 1 to plug 3.</p>
  <div class="seqgrid">
  ${L.SEQ_COLORS.map((c) => `<table class="seq"><tr><th colspan="2">${cap(c)} wires</th></tr><tr><th>Occurrence</th><th>Cut if connected to</th></tr>
    ${L.SEQ_TABLE[c].map((s, i) => `<tr><td>${ord[i] ? cap(ord[i]) : ['Seventh', 'Eighth', 'Ninth'][i - 6]}</td><td>${s.split('').join(' or ')}</td></tr>`).join('')}</table>`).join('')}
  </div>`);

// ───────────── Maze ─────────────
function mazeSvg(m) {
  const s = 22, o = 6;
  let out = `<svg class="maze" viewBox="0 0 ${s * 6 + o * 2} ${s * 6 + o * 2}"><rect x="${o}" y="${o}" width="${s * 6}" height="${s * 6}" fill="none" stroke="#111" stroke-width="2.2"/>`;
  for (let r = 0; r < 6; r++) for (let c = 0; c < 6; c++) {
    const x = o + c * s, y = o + r * s, w = m.walls[r][c];
    if (w.e && c < 5) out += `<line x1="${x + s}" y1="${y}" x2="${x + s}" y2="${y + s}" stroke="#111" stroke-width="2.2"/>`;
    if (w.s && r < 5) out += `<line x1="${x}" y1="${y + s}" x2="${x + s}" y2="${y + s}" stroke="#111" stroke-width="2.2"/>`;
    out += `<circle cx="${x + s / 2}" cy="${y + s / 2}" r="1.4" fill="#777"/>`;
  }
  for (const [r, c] of m.markers) out += `<circle cx="${o + c * s + s / 2}" cy="${o + r * s + s / 2}" r="6.5" fill="none" stroke="#111" stroke-width="2"/>`;
  return out + '</svg>';
}
page('Section 1: Modules', `
  ${moduleHead('On the Subject of Mazes', 'maze', 'Invisible walls. Visible consequences.')}
  <p>The screen shows a 6×6 grid, two green circles, a white square (the Defuser) and a red triangle (the exit).
  Find the maze below with circles in the same places. Then guide the white square to the triangle with the arrow
  buttons. Moving into a wall is a strike. The walls are not shown on the bomb.</p>
  <div class="mazes">${L.MAZES.map(mazeSvg).join('')}</div>`);

// ───────────── Password ─────────────
page('Section 1: Modules', `
  ${moduleHead('On the Subject of Passwords', 'password', 'Five dials of letters, and only one word fits.')}
  <p>Each of the five windows cycles through six letters with its arrows. Only one word below can be spelled. Set the
  windows to that word and press <b>SUBMIT</b>. A wrong word is a strike.</p>
  <table class="pw">${L.PASSWORDS.reduce((rows, w, i) => { (rows[Math.floor(i / 5)] ||= []).push(w); return rows; }, [])
    .map((row) => `<tr>${row.map((w) => `<td>${w.toLowerCase()}</td>`).join('')}</tr>`).join('')}</table>
  <p class="note">Tip: ask for the letters in the first column, cross off every word that can't start that way, then do
  the next column.</p>`);

// ───────────── Section 2 ─────────────
page('Section 2: Needy Modules', `
  <div class="divider"><div><h1>Section 2: Needy Modules</h1>
  <p>Needy modules can't be disarmed. They switch on from time to time and must be dealt with before their own
  countdown runs out.</p>
  <p>Stay alert: a needy module can wake up at any moment.</p></div>
  <svg class="icon big" viewBox="0 0 120 120"><rect x="3" y="3" width="114" height="114" fill="#fff" stroke="#111" stroke-width="2"/><rect x="48" y="10" width="24" height="14" fill="none" stroke="#111" stroke-width="1.6"/><text x="60" y="21" font-size="10" text-anchor="middle">40</text></svg></div>`, { cls: 'mid' });

page('Section 2: Needy Modules', `
  ${moduleHead('On the Subject of Venting', 'vent', 'The system has a question. Answer it before it answers itself.')}
  <p>When active, the screen asks a question with a ${L.VENT_SECONDS}-second countdown above it. Answer with <b>Y</b> or
  <b>N</b>. A wrong answer, or no answer, is a strike.</p>
  <table class="small">${L.VENT_QUESTIONS.map(([q, a]) => `<tr><td>${q}</td><td><b>Press ${a ? 'Y' : 'N'}</b></td></tr>`).join('')}</table>`);

page('Section 2: Needy Modules', `
  ${moduleHead('On the Subject of Capacitors', 'capacitor', 'It fills up. You drain it. Forever.')}
  <p>When active, the capacitor slowly charges and its countdown falls from ${L.CAPACITOR_SECONDS}. Hold the
  <b>DISCHARGE</b> lever down to drain it and push the countdown back up. If the countdown reaches 0, it records a
  strike.</p>`);

const knobLeds = (p) => `<svg class="knobled" viewBox="0 0 96 34">${p.join('').split('').map((b, i) => `<circle cx="${8 + (i % 6) * 16}" cy="${9 + Math.floor(i / 6) * 16}" r="5.5" fill="${b === '1' ? '#111' : 'none'}" stroke="#111" stroke-width="1.4"/>`).join('')}</svg>`;
page('Section 2: Needy Modules', `
  ${moduleHead('On the Subject of Knobs', 'knob', 'Twelve little lights point the way.')}
  <p>When active, some of the twelve lights switch on and a ${L.KNOB_SECONDS}-second countdown starts. Turn the knob
  (each click turns it a quarter clockwise) so it points in the direction shown below, measured from the
  <b>UP</b> label. When the countdown reaches 0, the knob is checked. A wrong direction is a strike.</p>
  <p class="note">Filled circles are lit lights.</p>
  <table class="knob">${L.KNOB_POSITIONS.map((p) => `<tr><th>${p === 'UP' ? 'Up' : cap(p.toLowerCase())}</th><td>${L.KNOB_PATTERNS[p].map(knobLeds).join('')}</td></tr>`).join('')}</table>`);

// ───────────── Appendices ─────────────
page('Appendix A: Indicators', `
  <h1>Appendix A: Indicator Identification Reference</h1>
  <p>Indicators are small lights with a three-letter label, found on the sides of the casing. Some rules care only
  whether <b>any</b> indicator is lit.</p>
  <div class="center"><svg class="ind" viewBox="0 0 180 50"><rect x="2" y="2" width="176" height="46" rx="6" fill="none" stroke="#111" stroke-width="2"/><circle cx="34" cy="25" r="12" fill="#111"/><rect x="62" y="12" width="100" height="26" fill="none" stroke="#111" stroke-width="1.6"/><text x="112" y="31" font-size="16" text-anchor="middle">LUX</text></svg><div class="caption">A lit indicator</div></div>
  <h2>Labels you may see</h2>
  <p class="labels">${L.INDICATOR_LABELS.join(' &nbsp; ')}</p>`);
page('Appendix B: Batteries', `
  <h1>Appendix B: Battery Identification Reference</h1>
  <p>Batteries sit in holders on the sides of the casing. Count every battery, not every holder.</p>
  <table class="small">
    <tr><th>Holder</th><th>Batteries</th></tr>
    <tr><td><svg class="bat" viewBox="0 0 120 50"><rect x="4" y="4" width="112" height="42" fill="none" stroke="#111" stroke-width="2"/><rect x="12" y="10" width="90" height="13" rx="6" fill="none" stroke="#111" stroke-width="1.6"/><rect x="12" y="27" width="90" height="13" rx="6" fill="none" stroke="#111" stroke-width="1.6"/></svg><br>AA holder</td><td>2</td></tr>
    <tr><td><svg class="bat" viewBox="0 0 120 50"><rect x="4" y="4" width="112" height="42" fill="none" stroke="#111" stroke-width="2"/><rect x="12" y="10" width="90" height="30" rx="14" fill="none" stroke="#111" stroke-width="1.6"/></svg><br>D holder</td><td>1</td></tr>
  </table>`);
page('Appendix C: Ports', `
  <h1>Appendix C: Port Identification Reference</h1>
  <p>Ports are grouped on plates on the sides of the casing, with their names printed underneath.</p>
  <table class="small">
    ${L.PORT_TYPES.map((p) => `<tr><td class="portname">${p}</td><td>${{
      PARALLEL: '<svg class="port" viewBox="0 0 140 40"><path d="M6 8 H134 L126 32 H14 Z" fill="none" stroke="#111" stroke-width="2"/></svg>',
      SERIAL: '<svg class="port" viewBox="0 0 140 40"><path d="M36 8 H104 L98 32 H42 Z" fill="none" stroke="#111" stroke-width="2"/></svg>',
      USB: '<svg class="port" viewBox="0 0 140 40"><rect x="44" y="12" width="52" height="16" fill="none" stroke="#111" stroke-width="2"/><rect x="50" y="17" width="40" height="5" fill="#111"/></svg>',
      HDMI: '<svg class="port" viewBox="0 0 140 40"><path d="M36 10 H104 V22 L96 30 H44 L36 22 Z" fill="none" stroke="#111" stroke-width="2"/></svg>',
      'RJ-45': '<svg class="port" viewBox="0 0 140 40"><rect x="52" y="6" width="36" height="28" fill="none" stroke="#111" stroke-width="2"/><rect x="62" y="28" width="16" height="6" fill="#111"/></svg>',
    }[p]}</td></tr>`).join('')}
  </table>`);

// ───────────── Assemble ─────────────
const N = pages.length;
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${TITLE} · Bomb Defusal Manual</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
@font-face { font-family: "Elite"; src: url(fonts/special-elite.woff2) format("woff2"); }
@font-face { font-family: "Prime"; src: url(fonts/courier-prime.woff2) format("woff2"); }
@font-face { font-family: "Prime"; font-weight: bold; src: url(fonts/courier-prime-bold.woff2) format("woff2"); }
@font-face { font-family: "Prime"; font-style: italic; src: url(fonts/courier-prime-italic.woff2) format("woff2"); }
@page { size: Letter; margin: 0; }
* { box-sizing: border-box; }
body { margin: 0; background: #cfcfcf; color: #111; font: 11.5pt/1.45 "Prime", "Courier New", monospace; }
.page { position: relative; width: 8.5in; height: 11in; margin: 0.3in auto; padding: 0.75in 0.8in 0.8in; background: #fff; overflow: hidden; break-after: page; box-shadow: 0 3px 14px rgba(0,0,0,.2); }
.page:last-child { break-after: auto; }
@media print { body { background: #fff; } .page { margin: 0; box-shadow: none; } }
.hdr { position: absolute; top: 0.32in; left: 0.5in; right: 0.5in; display: flex; justify-content: space-between; font: 11pt "Elite", monospace; }
.ftr { position: absolute; bottom: 0.32in; left: 0; right: 0; text-align: center; font: 11pt "Prime", monospace; }
.speck { position: absolute; background: #111; border-radius: 50%; }
h1 { font: 26pt/1.1 "Elite", monospace; margin: 0 0 6px; }
h2 { font: bold 14pt "Prime", monospace; text-decoration: underline; margin: 16px 0 6px; }
h3 { font: bold 12pt "Prime", monospace; margin: 12px 0 4px; }
p { margin: 6px 0; }
ul, ol { margin: 4px 0; padding-left: 22px; }
li { margin: 3px 0; }
.flavor { font-style: italic; margin: 0 0 8px; }
.note { font-style: italic; font-size: 10.5pt; }
.modhead { display: flex; justify-content: space-between; align-items: flex-start; gap: 18px; margin-bottom: 8px; }
.icon { width: 1.25in; height: 1.25in; flex: none; }
.icon.big { width: 1.6in; height: 1.6in; }
table { border-collapse: collapse; margin: 8px 0; }
th, td { border: 1.5px solid #111; padding: 4px 8px; text-align: center; vertical-align: middle; }
th { font-weight: bold; }
table.small { min-width: 60%; margin: 10px auto; }
.rulegrid { display: grid; grid-template-columns: 1fr 1fr; gap: 0 22px; font-size: 10.5pt; }
.rulegrid ul { padding-left: 16px; }
table.keypad { margin: 18px auto; }
table.keypad td { width: 0.75in; height: 0.62in; font: 30pt "DejaVu Sans", sans-serif; }
table.simon { width: 100%; font-size: 10.5pt; }
table.simon th:first-child { text-align: left; }
table.wordpos { width: 100%; }
table.wordpos td { padding: 8px 6px; }
.dw { display: block; font: bold 13pt "Prime", monospace; margin-bottom: 4px; }
svg.pos { width: 28px; height: 36px; }
table.lists { width: 100%; font-size: 10pt; }
table.lists th { width: 1.1in; text-align: left; }
table.lists td { text-align: left; letter-spacing: .02em; }
.morsegrid { display: grid; grid-template-columns: 1fr 1fr 1.25fr; gap: 14px; align-items: start; }
table.morse { width: 100%; font-size: 10pt; }
table.morse td { text-align: left; letter-spacing: 2px; }
.dot { font-size: 7pt; vertical-align: 2px; } .dash { font-size: 10pt; }
table.freq { width: 100%; font-size: 10pt; }
.cwgrid { display: grid; grid-template-columns: 1fr 1.25fr; gap: 16px; align-items: start; }
table.cw { width: 100%; font-size: 10pt; }
table.cw td.letter { font-weight: bold; }
table.legend { font-size: 10pt; }
table.legend td { text-align: left; }
.seqgrid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
table.seq { width: 100%; font-size: 9.5pt; }
.mazes { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px 20px; margin-top: 12px; }
svg.maze { width: 100%; }
table.pw { width: 100%; margin-top: 16px; }
table.pw td { padding: 8px; font-size: 12pt; }
table.knob td { text-align: left; }
table.memory { width: 100%; font-size: 10pt; margin-top: 14px; }
table.memory td { text-align: left; height: 0.72in; }
svg.knobled { width: 1.5in; margin-right: 18px; }
table.knob th { width: 1in; }
.center { text-align: center; }
.caption { font: 11pt "Prime", monospace; margin: 4px 0; }
svg.example { width: 5.4in; margin: 4px auto 0; display: block; }
svg.ind { width: 2.6in; }
svg.bat { width: 1.6in; }
svg.port { width: 2in; }
.portname { font-weight: bold; }
.labels { font: bold 16pt "Prime", monospace; text-align: center; letter-spacing: .1em; }
.mid .divider { position: absolute; top: 3.6in; left: 0.8in; right: 0.8in; display: flex; gap: 30px; align-items: center; justify-content: space-between; }
.divider h1 { font-size: 28pt; }
.intro { position: absolute; top: 3.4in; left: 1in; right: 1in; text-align: center; font-style: italic; font-size: 13pt; }
.cover { text-align: center; padding-top: 0.6in; }
.coverbomb { width: 1.5in; height: 1.5in; }
.covertitle { font: 64pt/1 "Elite", monospace; margin-top: 10px; letter-spacing: .02em; }
.coversub { font: bold 16pt "Prime", monospace; letter-spacing: .4em; margin-top: 6px; }
.cover hr { border: 0; border-top: 2px solid #111; width: 75%; margin: 34px auto; }
.covermanual { font: 44pt/1.15 "Elite", monospace; }
.coverver { font: 22pt "Elite", monospace; margin-top: 60px; }
.coverfoot { position: absolute; bottom: 0.45in; left: 0; right: 0; font-size: 10pt; }
</style></head><body>
${pages.map((p, i) => `<section class="page ${p.cls}">${specks()}${p.section ? `<div class="hdr"><span>${TITLE} ${VERSION}</span><span>${p.section}</span></div>` : ''}${p.body}${i > 0 ? `<div class="ftr">Page ${i + 1} of ${N}</div>` : ''}</section>`).join('\n')}
</body></html>`;
writeFileSync(new URL('../classic/manual.html', import.meta.url), html);
console.log(`classic/manual.html written: ${N} pages`);
