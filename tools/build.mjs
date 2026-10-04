// Builds index.html: bundles src/ with esbuild and inlines everything (JS + subset fonts)
// so the game is ONE file that also works offline (double-click / USB stick / Chromebook).
// Usage: node tools/build.mjs     (needs python3 + fonttools for the font subset; falls back to system fonts)
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const repo = new URL('..', import.meta.url).pathname;
// optional project folder (e.g. `node tools/build.mjs classic`); defaults to the repo root
const root = process.argv[2] ? repo + process.argv[2].replace(/\/?$/, '/') : repo;
const tmp = repo + '.build/';
mkdirSync(tmp, { recursive: true });

// Every character the game draws (ASCII + math symbols used on modules and screens).
const GLYPHS = Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i)).join('') +
  '¬∧∨→↔∀∃∈∉∪∩−′∅∴★≡≠φ⊆⊂ℤℕ·…’‘“”×—–⟳◀▶✓⚙▼' +
  // classic keypad symbols
  '☾✦Ψ⚓♞¶☂✿ϟ♜Ж⚑Ω✈☯‡♪☘⚙☀✂⚡Я∞☎✉';

const FONT_DIR = '/usr/share/fonts/truetype/dejavu/';
const fonts = [
  ['LBMono', 'normal', 'DejaVuSansMono.ttf'],
  ['LBMono', 'bold', 'DejaVuSansMono-Bold.ttf'],
  ['LBSans', 'bold', 'DejaVuSans-Bold.ttf'],
  ['LBSans', 'normal', 'DejaVuSans.ttf'],
];
let fontCss = '';
for (const [family, weight, file] of fonts) {
  const src = FONT_DIR + file;
  const out = tmp + file.replace('.ttf', '.woff2');
  try {
    if (!existsSync(src)) throw new Error('missing ' + src);
    execFileSync('pyftsubset', [src, `--text=${GLYPHS}`, '--flavor=woff2', `--output-file=${out}`, '--layout-features=*']);
    const b64 = readFileSync(out).toString('base64');
    fontCss += `@font-face{font-family:"${family}";font-weight:${weight};font-display:block;src:url(data:font/woff2;base64,${b64}) format("woff2");}\n`;
  } catch (e) {
    console.warn('font subset skipped:', e.message);
  }
}

const res = await build({
  entryPoints: [root + 'src/main.js'],
  bundle: true,
  minify: true,
  format: 'iife',
  target: ['chrome100'],
  write: false,
  legalComments: 'none',
});
const js = res.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const html = readFileSync(root + 'src/template.html', 'utf8')
  .replace('/*__FONTS__*/', () => fontCss)
  .replace('/*__BUNDLE__*/', () => js);
writeFileSync(root + 'index.html', html);
console.log(`index.html written: ${(html.length / 1024).toFixed(0)} KB (js ${(js.length / 1024).toFixed(0)} KB, fonts ${(fontCss.length / 1024).toFixed(0)} KB)`);
