// Dev helper: screenshots + scripted play-through in headless Chromium.
// node tools/shot.mjs <outdir> [scenario]
import { chromium } from 'playwright-core';
import { existsSync } from 'node:fs';

const out = process.argv[2] || '.build/shots';
const scenario = process.argv[3] || 'overview';
const exe = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium'].find(existsSync);
const browser = await chromium.launch({ executablePath: exe, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: +(process.env.VW || 1366), height: +(process.env.VH || 768) } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
await page.goto('file://' + new URL('../index.html', import.meta.url).pathname);
await page.waitForSelector('#loading.gone', { timeout: 120000 });
await page.waitForTimeout(1500);
const shot = async (name) => { await page.screenshot({ path: `${out}/${name}.png` }); console.log('shot', name); };

// opts.mode = index into MODES (0 Introduction … 5 Extreme)
const startWith = async (opts = {}) => {
  await page.evaluate((i) => window.__lb.start(i), opts.mode ?? 2);
  await page.waitForTimeout(2500);
};

const focusModule = async (i) => {
  await page.evaluate((i) => {
    const g = window.__lb.game;
    window.__lb.focus(i);
  }, i);
  await page.waitForTimeout(1600);
};

if (scenario === 'overview') {
  await shot('title');
  await startWith({ mode: 2 });
  await shot('game');
}
if (scenario === 'modules') {
  await startWith({ mode: +(process.argv[4] || 3) });
  const n = await page.evaluate(() => window.__lb.count());
  for (let i = -1; i < n; i++) { await focusModule(i); await shot('mod' + (i + 1)); }
}
if (scenario === 'sides') {
  await startWith({ mode: 2 });
  for (const [name, rx, ry] of [['top', 1.2, 0], ['bottom', -1.2, 0], ['left', 0, 1.2], ['right', 0, -1.2], ['back', 0, Math.PI], ['angle', 0.5, -0.6]]) {
    await page.evaluate(([rx, ry]) => window.__lb.rotate(rx, ry), [rx, ry]);
    await page.waitForTimeout(1500);
    await shot('side-' + name);
  }
}
if (scenario === 'play') {
  // Solves every module through the real input handlers, after one deliberate strike.
  await startWith({ mode: +(process.argv[4] || 3) });
  const log = await page.evaluate(() => window.__lb.autoplay());
  console.log(log);
  await page.waitForTimeout(3000);
  await shot('play-result');
}
if (scenario === 'boom') {
  // Extreme mode has 1 strike: a single wrong action must blow the bomb apart.
  await startWith({ mode: 5 });
  const state = await page.evaluate(() => {
    const g = window.__lb.game;
    const v = window.__lb.views().find((x) => ['grid', 'keypad', 'wires'].includes(x.mod.type));
    const L = v.logic;
    if (v.mod.type === 'grid') v.parts[['red', 'blue', 'green', 'yellow'].findIndex((c) => c !== L.solution.color)].userData.part.down();
    if (v.mod.type === 'keypad') v.parts[L.order[3]].userData.part.down();
    if (v.mod.type === 'wires') v.parts[L.solution.cut === 1 ? 1 : 0].userData.part.down();
    return g.state + ' strikes=' + g.strikes;
  });
  console.log('after wrong action:', state);
  await page.addStyleTag({ content: '#result{visibility:hidden}' });
  for (const ms of [300, 700, 1200]) { await page.waitForTimeout(ms); await shot('boom-' + ms); }
  await page.waitForTimeout(3500);
  console.log('result title:', await page.textContent('#resTitle'), '| shown:', await page.evaluate(() => document.getElementById('result').classList.contains('show')));
  await shot('boom-result');
}
if (scenario === 'click') {
  // Real mouse clicks at the centre of every key-style button, without zooming in.
  await startWith({ mode: 4 });
  await page.evaluate(() => { window.__lb.game.maxStrikes = 999; window.__lb.overview(); });
  await page.waitForTimeout(800);
  const targets = await page.evaluate(() => window.__lb.views().map((v, vi) => ({ vi, type: v.mod.type, face: v.slot.face, n: v.parts.length })));
  let ok = 0, miss = 0;
  for (const t of targets) {
    if (t.face !== 0 || !['keypad', 'words', 'grid', 'truth', 'simon'].includes(t.type)) continue;
    for (let pi = 0; pi < t.n; pi++) {
      const before = await page.evaluate(([vi]) => { const g = window.__lb.game; window.__lb._hits = 0; const v = window.__lb.views()[vi]; v.parts.forEach((m) => { const p = m.userData.part; if (!p._w) { const d = p.down; p.down = (...a) => { window.__lb._hits++; return d?.(...a); }; p._w = 1; } }); return 0; }, [t.vi]);
      const [x, y] = await page.evaluate(([vi, pi]) => window.__lb.screenPos(vi, pi), [t.vi, pi]);
      await page.mouse.click(x, y);
      const hits = await page.evaluate(() => window.__lb._hits);
      if (hits === 1) ok++; else { miss++; console.log('MISS', t.type, 'part', pi, 'at', Math.round(x), Math.round(y)); }
      if ((await page.evaluate(() => window.__lb.game.state)) !== 'playing') { console.log('bomb ended during click test'); break; }
    }
  }
  console.log(`centre clicks registered: ${ok}, missed: ${miss}`);
}
console.log(errors.length ? 'CONSOLE:\n' + errors.join('\n') : 'no console errors');
await browser.close();
