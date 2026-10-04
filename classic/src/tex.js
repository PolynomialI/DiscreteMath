// Procedural PBR textures drawn on canvases at load time (no image files needed).
import * as THREE from 'three';
import { makeRng } from './logic.js';

export const FONT_MONO = '"LBMono", "DejaVu Sans Mono", "Noto Sans Mono", "Cousine", Consolas, monospace';
export const FONT_SANS = '"LBSans", "DejaVu Sans", "Noto Sans", "Noto Sans Math", Arial, sans-serif';
export const FONT_STENCIL = '"LBSans", "DejaVu Sans", Impact, Arial, sans-serif';

let maxAniso = 4;
export function setMaxAnisotropy(n) { maxAniso = n; }

export function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function toTexture(c, { srgb = true, repeat = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = maxAniso;
  t.needsUpdate = true;
  return t;
}

// Tileable value noise with separate lattice periods in x and y (anisotropic → brushed streaks).
function noiseLayer(w, h, px, py, rng) {
  const lat = new Float32Array(px * py);
  for (let i = 0; i < lat.length; i++) lat[i] = rng.next();
  const out = new Float32Array(w * h);
  const sx = px / w, sy = py / h;
  for (let y = 0; y < h; y++) {
    const fy = y * sy, y0 = Math.floor(fy), ty = fy - y0, y1 = (y0 + 1) % py;
    const uy = ty * ty * (3 - 2 * ty);
    for (let x = 0; x < w; x++) {
      const fx = x * sx, x0 = Math.floor(fx), tx = fx - x0, x1 = (x0 + 1) % px;
      const ux = tx * tx * (3 - 2 * tx);
      const a = lat[y0 * px + x0], b = lat[y0 * px + x1], c = lat[y1 * px + x0], d = lat[y1 * px + x1];
      out[y * w + x] = (a + (b - a) * ux) + ((c + (d - c) * ux) - (a + (b - a) * ux)) * uy;
    }
  }
  return out;
}

function fbm(w, h, octaves, rng) {
  // octaves: [[px, py, amp], ...]
  const out = new Float32Array(w * h);
  for (const [px, py, amp] of octaves) {
    const n = noiseLayer(w, h, px, py, rng);
    for (let i = 0; i < out.length; i++) out[i] += (n[i] - 0.5) * amp;
  }
  return out;
}

// Height field → tangent-space normal map (wraps at edges so it tiles).
function heightToNormal(hf, w, h, strength) {
  const c = canvas(w, h);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    const ym = ((y - 1 + h) % h) * w, yp = ((y + 1) % h) * w, yc = y * w;
    for (let x = 0; x < w; x++) {
      const xm = (x - 1 + w) % w, xp = (x + 1) % w;
      const dx = (hf[yc + xp] - hf[yc + xm]) * strength;
      const dy = (hf[yp + x] - hf[ym + x]) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (yc + x) * 4;
      d[i] = (-dx / len * 0.5 + 0.5) * 255;
      d[i + 1] = (dy / len * 0.5 + 0.5) * 255;
      d[i + 2] = (1 / len * 0.5 + 0.5) * 255;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

// Draws scratches/scuffs into a grayscale "damage" canvas and returns its pixels (0..1).
function damageLayer(w, h, rng, { scratches = 260, scuffs = 40, horiz = 0.6, maxLen = 0.25 } = {}) {
  const c = canvas(w, h);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w, h);
  ctx.lineCap = 'round';
  for (let i = 0; i < scratches; i++) {
    const x = rng.next() * w, y = rng.next() * h;
    const ang = rng.chance(horiz) ? (rng.next() - 0.5) * 0.25 : rng.next() * Math.PI;
    const len = (0.02 + rng.next() ** 2 * maxLen) * w;
    ctx.strokeStyle = `rgba(255,255,255,${0.15 + rng.next() * 0.55})`;
    ctx.lineWidth = 0.6 + rng.next() * 1.4;
    ctx.beginPath();
    ctx.moveTo(x, y);
    // slightly curved scratches look hand-made
    const cx = x + Math.cos(ang) * len * 0.5 + (rng.next() - 0.5) * 8;
    const cy = y + Math.sin(ang) * len * 0.5 + (rng.next() - 0.5) * 8;
    ctx.quadraticCurveTo(cx, cy, x + Math.cos(ang) * len, y + Math.sin(ang) * len);
    ctx.stroke();
  }
  for (let i = 0; i < scuffs; i++) {
    const x = rng.next() * w, y = rng.next() * h, r = (0.01 + rng.next() * 0.05) * w;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(255,255,255,${0.08 + rng.next() * 0.18})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const px = ctx.getImageData(0, 0, w, h).data;
  const out = new Float32Array(w * h);
  for (let i = 0; i < out.length; i++) out[i] = px[i * 4] / 255;
  return out;
}

function grimeLayer(w, h, rng) {
  return fbm(w, h, [[4, 4, 1.0], [8, 8, 0.6], [16, 16, 0.35], [64, 64, 0.15]], rng);
}

function writeGray(w, h, fn) {
  const c = canvas(w, h);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    const v = Math.max(0, Math.min(255, fn(i) * 255));
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function writeColor(w, h, fn) {
  const c = canvas(w, h);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  const rgb = [0, 0, 0];
  for (let i = 0; i < w * h; i++) {
    fn(i, rgb);
    img.data[i * 4] = Math.max(0, Math.min(255, rgb[0] * 255));
    img.data[i * 4 + 1] = Math.max(0, Math.min(255, rgb[1] * 255));
    img.data[i * 4 + 2] = Math.max(0, Math.min(255, rgb[2] * 255));
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

const hex = (h) => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; };
// THREE.Color(hex) is linear; canvas pixels are sRGB, so convert back.
const srgb = (h) => { const c = new THREE.Color(h).convertLinearToSRGB(); return [c.r, c.g, c.b]; };

// ── Brushed / worn metal: albedo + roughness + normal ──
export function brushedMetal({ size = 1024, base = '#c9cfd5', seed = 'brushed', streak = 1, wear = 1, grime = 0.12, roughBase = 0.32 } = {}) {
  const rng = makeRng(seed);
  const w = size, h = size;
  const brush = fbm(w, h, [[3, 420, 1.0 * streak], [6, 900, 0.7 * streak], [12, 256, 0.35 * streak], [64, 64, 0.08]], rng);
  const dmg = damageLayer(w, h, rng, { scratches: Math.round(320 * wear), scuffs: Math.round(50 * wear) });
  const grm = grimeLayer(w, h, rng);
  const fine = noiseLayer(w, h, 512, 512, rng);
  const col = srgb(base);
  const albedo = writeColor(w, h, (i, out) => {
    const v = 1 + brush[i] * 0.12 + (fine[i] - 0.5) * 0.04 + dmg[i] * 0.08 - Math.max(0, grm[i]) * grime * 2.2;
    out[0] = col[0] * v; out[1] = col[1] * v; out[2] = col[2] * v * 1.01;
  });
  const rough = writeGray(w, h, (i) => roughBase + brush[i] * 0.1 + dmg[i] * 0.12 + Math.max(0, grm[i]) * 0.3 + (fine[i] - 0.5) * 0.04);
  const height = new Float32Array(w * h);
  for (let i = 0; i < height.length; i++) height[i] = brush[i] * 0.6 + fine[i] * 0.15 - dmg[i] * 1.6;
  const normal = heightToNormal(height, w, h, 1.6);
  return {
    map: toTexture(albedo),
    roughnessMap: toTexture(rough, { srgb: false }),
    normalMap: toTexture(normal, { srgb: false }),
  };
}

// ── Powder-coated / painted metal with chips showing bare steel underneath ──
export function paintedMetal({ size = 1024, base = '#55606b', seed = 'paint', chips = 1 } = {}) {
  const rng = makeRng(seed);
  const w = size, h = size;
  const peel = fbm(w, h, [[128, 128, 0.6], [256, 256, 0.4]], rng);
  const grm = grimeLayer(w, h, rng);
  const dmg = damageLayer(w, h, rng, { scratches: Math.round(120 * chips), scuffs: Math.round(70 * chips), horiz: 0.5, maxLen: 0.08 });
  const chipN = fbm(w, h, [[24, 24, 1.0], [48, 48, 0.5], [96, 96, 0.25]], rng);
  const col = srgb(base), steel = srgb('#6f777e');
  const chipMask = new Float32Array(w * h);
  for (let i = 0; i < chipMask.length; i++) chipMask[i] = Math.max(0, Math.min(1, (chipN[i] - 0.5) * 12)) * Math.min(1, chips);
  const albedo = writeColor(w, h, (i, out) => {
    const m = Math.max(chipMask[i], dmg[i] > 0.7 ? 0.6 : 0);
    const v = 1 + peel[i] * 0.06 - Math.max(0, grm[i]) * 0.35 + dmg[i] * 0.1;
    for (let k = 0; k < 3; k++) out[k] = (col[k] * v) * (1 - m) + steel[k] * (0.9 + peel[i] * 0.2) * m;
  });
  const rough = writeGray(w, h, (i) => 0.55 + peel[i] * 0.1 + Math.max(0, grm[i]) * 0.3 - chipMask[i] * 0.25 + dmg[i] * 0.1);
  const metal = writeGray(w, h, (i) => 0.3 + Math.max(chipMask[i], dmg[i] > 0.7 ? 0.6 : 0) * 0.6);
  const height = new Float32Array(w * h);
  for (let i = 0; i < height.length; i++) height[i] = peel[i] * 0.25 - chipMask[i] * 1.2 - dmg[i] * 0.9;
  return {
    map: toTexture(albedo),
    roughnessMap: toTexture(rough, { srgb: false }),
    metalnessMap: toTexture(metal, { srgb: false }),
    normalMap: toTexture(heightToNormal(height, w, h, 2.2), { srgb: false }),
  };
}

// ── Textured rubber (bumpers, gaskets) ──
export function rubber({ size = 512, base = '#2a2e33', seed = 'rubber' } = {}) {
  const rng = makeRng(seed);
  const w = size, h = size;
  const grain = fbm(w, h, [[256, 256, 1.0], [128, 128, 0.5], [16, 16, 0.4]], rng);
  const dmg = damageLayer(w, h, rng, { scratches: 90, scuffs: 30, horiz: 0.2, maxLen: 0.1 });
  const col = srgb(base);
  const albedo = writeColor(w, h, (i, out) => {
    const v = 1 + grain[i] * 0.18 + dmg[i] * 0.35;
    out[0] = col[0] * v; out[1] = col[1] * v; out[2] = col[2] * v;
  });
  const rough = writeGray(w, h, (i) => 0.78 + grain[i] * 0.15 - dmg[i] * 0.2);
  const height = new Float32Array(w * h);
  for (let i = 0; i < height.length; i++) height[i] = grain[i] - dmg[i] * 0.6;
  return {
    map: toTexture(albedo),
    roughnessMap: toTexture(rough, { srgb: false }),
    normalMap: toTexture(heightToNormal(height, w, h, 2.5), { srgb: false }),
  };
}

// ── Molded plastic with a light speckle (keys, button caps, terminal blocks) ──
export function plastic({ size = 512, seed = 'plastic' } = {}) {
  const rng = makeRng(seed);
  const w = size, h = size;
  const n = fbm(w, h, [[200, 200, 0.6], [32, 32, 0.4]], rng);
  const dmg = damageLayer(w, h, rng, { scratches: 60, scuffs: 25, horiz: 0.3, maxLen: 0.1 });
  const rough = writeGray(w, h, (i) => 0.3 + n[i] * 0.12 + dmg[i] * 0.25);
  const height = new Float32Array(w * h);
  for (let i = 0; i < height.length; i++) height[i] = n[i] * 0.4 - dmg[i] * 0.5;
  return {
    roughnessMap: toTexture(rough, { srgb: false }),
    normalMap: toTexture(heightToNormal(height, w, h, 1.2), { srgb: false }),
  };
}

// ── Wooden desk ──
export function wood({ size = 1024, seed = 'wood' } = {}) {
  const rng = makeRng(seed);
  const w = size, h = size;
  const warp = fbm(w, h, [[4, 24, 1.0], [8, 48, 0.5]], rng);
  const fine = fbm(w, h, [[2, 600, 1.0], [6, 300, 0.4]], rng);
  const grm = grimeLayer(w, h, rng);
  const dmg = damageLayer(w, h, rng, { scratches: 120, scuffs: 40, horiz: 0.7, maxLen: 0.3 });
  const light = srgb('#7a4f2e'), dark = srgb('#3e2414');
  const ring = new Float32Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const v = (y / h) * 26 + warp[i] * 7;
      ring[i] = Math.pow(Math.abs(Math.sin(v * Math.PI)), 0.45);
    }
  const albedo = writeColor(w, h, (i, out) => {
    const t = Math.min(1, Math.max(0, ring[i] * 0.65 + fine[i] * 0.9 + 0.2 + grm[i] * 0.3));
    for (let k = 0; k < 3; k++) out[k] = (dark[k] + (light[k] - dark[k]) * t) * (1 + dmg[i] * 0.25);
  });
  const rough = writeGray(w, h, (i) => 0.55 + ring[i] * 0.12 + dmg[i] * 0.2);
  const height = new Float32Array(w * h);
  for (let i = 0; i < height.length; i++) height[i] = ring[i] * 0.4 + fine[i] * 0.6 - dmg[i];
  return {
    map: toTexture(albedo),
    roughnessMap: toTexture(rough, { srgb: false }),
    normalMap: toTexture(heightToNormal(height, w, h, 1.5), { srgb: false }),
  };
}

// ── Screw head: domed with a Phillips cross, as a normal map + AO-ish albedo ──
export function screwHead(size = 128) {
  const w = size, h = size;
  const hf = new Float32Array(w * h);
  const ao = new Float32Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const u = (x + 0.5) / w * 2 - 1, v = (y + 0.5) / h * 2 - 1;
      const r = Math.hypot(u, v);
      let z = r < 1 ? Math.sqrt(1 - r * r) * 0.9 : 0;
      const cw = 0.12, cl = 0.62;
      const inCross = (Math.abs(u) < cw && Math.abs(v) < cl) || (Math.abs(v) < cw && Math.abs(u) < cl);
      if (inCross) z -= 0.55;
      hf[y * w + x] = z * 6;
      ao[y * w + x] = inCross ? 0.25 : 1 - Math.max(0, r - 0.8) * 1.5;
    }
  const nrm = heightToNormal(hf, w, h, 1.2);
  const albedo = writeGray(w, h, (i) => 0.75 * ao[i] + 0.15);
  return { normalMap: toTexture(nrm, { srgb: false, repeat: false }), map: toTexture(albedo, { repeat: false }) };
}

// ── Soft radial glow sprite ──
export function glowTexture(size = 128) {
  const c = canvas(size, size);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.2, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.12)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return toTexture(c, { repeat: false });
}

// ── Background: dim room gradient with a vignette ──
export function backdrop() {
  const c = canvas(1024, 1024);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(512, 380, 40, 512, 512, 760);
  g.addColorStop(0, '#3b4552');
  g.addColorStop(0.45, '#1d232b');
  g.addColorStop(1, '#07090c');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1024, 1024);
  const rng = makeRng('backdrop');
  const img = ctx.getImageData(0, 0, 1024, 1024);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (rng.next() - 0.5) * 6;
    img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
  return toTexture(c, { repeat: false });
}

// ── Generic text/graphics texture ──
export function drawnTexture(w, h, draw, opts = {}) {
  const c = canvas(w, h);
  const ctx = c.getContext('2d');
  draw(ctx, w, h);
  const t = toTexture(c, { repeat: false, ...opts });
  t.userData = { canvas: c, ctx, draw };
  return t;
}

export function redraw(tex, draw) {
  const { canvas: c, ctx } = tex.userData;
  ctx.clearRect(0, 0, c.width, c.height);
  (draw || tex.userData.draw)(ctx, c.width, c.height);
  tex.needsUpdate = true;
}

// Fits text into a box by shrinking the font; supports multi-line arrays.
export function fitText(ctx, lines, x, y, maxW, maxH, { font = FONT_MONO, weight = 'bold', size = 64, color = '#fff', align = 'center', lineGap = 1.15, shadow = null } = {}) {
  if (!Array.isArray(lines)) lines = [lines];
  let s = size;
  for (; s > 6; s -= 1) {
    ctx.font = `${weight} ${s}px ${font}`;
    const wMax = Math.max(...lines.map((l) => ctx.measureText(l).width));
    if (wMax <= maxW && s * lineGap * lines.length <= maxH) break;
  }
  ctx.font = `${weight} ${s}px ${font}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  if (shadow) { ctx.shadowColor = shadow.color; ctx.shadowBlur = shadow.blur; }
  const total = s * lineGap * lines.length;
  lines.forEach((l, i) => ctx.fillText(l, x, y - total / 2 + s * lineGap * (i + 0.5)));
  ctx.shadowBlur = 0;
  return s;
}

// Word-wrap helper for screen text.
export function wrapText(ctx, text, maxW) {
  const words = text.split(' ');
  const lines = [];
  let cur = '';
  for (const wd of words) {
    const t = cur ? cur + ' ' + wd : wd;
    if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = wd; } else cur = t;
  }
  if (cur) lines.push(cur);
  return lines;
}

// Seven-segment digit renderer (used by timer and needy counters).
const SEGS = {
  0: 'abcdef', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc', 5: 'afgcd', 6: 'afgedc', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg', ' ': '',
};
export function draw7(ctx, ch, x, y, w, h, on, off) {
  const t = w * 0.19, gap = t * 0.12, slant = 0.1;
  const H = (x0, x1, yc) => [[x0, yc], [x0 + t / 2, yc - t / 2], [x1 - t / 2, yc - t / 2], [x1, yc], [x1 - t / 2, yc + t / 2], [x0 + t / 2, yc + t / 2]];
  const V = (xc, y0, y1) => [[xc, y0], [xc + t / 2, y0 + t / 2], [xc + t / 2, y1 - t / 2], [xc, y1], [xc - t / 2, y1 - t / 2], [xc - t / 2, y0 + t / 2]];
  const xl = x + t / 2, xr = x + w - t / 2, yt = y + t / 2, ym = y + h / 2, yb = y + h - t / 2;
  const seg = {
    a: H(xl + gap, xr - gap, yt), g: H(xl + gap, xr - gap, ym), d: H(xl + gap, xr - gap, yb),
    f: V(xl, yt + gap, ym - gap), b: V(xr, yt + gap, ym - gap), e: V(xl, ym + gap, yb - gap), c: V(xr, ym + gap, yb - gap),
  };
  const lit = SEGS[ch] ?? '';
  for (const [name, pts] of Object.entries(seg)) {
    ctx.fillStyle = lit.includes(name) ? on : off;
    ctx.beginPath();
    pts.forEach(([px, py], i) => {
      const sx = px + (y + h - py) * slant;
      i ? ctx.lineTo(sx, py) : ctx.moveTo(sx, py);
    });
    ctx.closePath();
    ctx.fill();
  }
}
