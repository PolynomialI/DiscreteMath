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

const startWith = async (opts = {}) => {
  await page.evaluate((o) => {
    for (const [k, v] of Object.entries(o)) {
      const el = document.getElementById(k);
      if (el.type === 'checkbox') el.checked = v; else el.value = v;
    }
  }, opts);
  await page.click('#start');
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
  await startWith({ seed: 'KQ4T74' });
  await shot('game');
}
if (scenario === 'modules') {
  await startWith({ seed: process.argv[4] || 'KQ4T74', rows: process.argv[5] || '2', cols: process.argv[6] || '3', needy: true });
  const n = await page.evaluate(() => window.__lb.count());
  for (let i = -1; i < n; i++) { await focusModule(i); await shot('mod' + (i + 1)); }
}
if (scenario === 'sides') {
  await startWith({ seed: process.argv[4] || 'KQ4T74' });
  for (const [name, rx, ry] of [['top', 1.2, 0], ['bottom', -1.2, 0], ['left', 0, 1.2], ['right', 0, -1.2], ['back', 0, Math.PI], ['angle', 0.5, -0.6]]) {
    await page.evaluate(([rx, ry]) => window.__lb.rotate(rx, ry), [rx, ry]);
    await page.waitForTimeout(1500);
    await shot('side-' + name);
  }
}
if (scenario === 'play') {
  // Solves every module through the real input handlers, after one deliberate strike.
  await startWith({ seed: process.argv[4] || 'PLAY1', rows: process.argv[5] || '3', cols: process.argv[6] || '4', twoSided: process.argv[7] === 'two', needy: true, minutes: '10' });
  const log = await page.evaluate(() => window.__lb.autoplay());
  console.log(log);
  await page.waitForTimeout(3000);
  await shot('play-result');
}
if (scenario === 'boom') {
  // One strike allowed: a wrong Grid press must explode the bomb and show the result screen.
  await startWith({ seed: 'PLAY1', strikes: '1' });
  await page.evaluate(async () => {
    const v = window.__lb.game && [...Array(window.__lb.count()).keys()].map((i) => i);
    window.__lb.focus(0);
  });
  const state = await page.evaluate(async () => {
    const g = window.__lb.game;
    const views = window.__lb.views();
    const grid = views.find((v) => v.mod.type === 'grid');
    const wrong = ['red', 'blue', 'green', 'yellow'].findIndex((c) => c !== grid.logic.solution.color);
    grid.parts[wrong].userData.part.down();
    return g.state + ' strikes=' + g.strikes;
  });
  console.log('after wrong press:', state);
  await page.waitForTimeout(4000);
  console.log('result title:', await page.textContent('#resTitle'), '| visible:', await page.isVisible('#result'));
  await shot('boom-result');
}
console.log(errors.length ? 'CONSOLE:\n' + errors.join('\n') : 'no console errors');
await browser.close();
