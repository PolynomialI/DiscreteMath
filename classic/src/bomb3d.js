// The bomb casing, edgework widgets and module layout.
import * as THREE from 'three';
import * as TX from './tex.js';
import { M, T, mesh, slab, roundedRectShape, holePath, roundedSlab, screw, planeWith, glowSprite } from './kit.js';
import { makeRng } from './logic.js';

export const DEPTH = 1.0;

// Footprint of each casing widget: [length along its long axis, width]. The builders below use these.
export const EDGE_SIZES = {
  serial: [0.62, 0.29], AA: [0.52, 0.28], D: [0.5, 0.27], indicator: [0.42, 0.17],
  port: (n) => [0.16 + n * 0.2, 0.22],
};
export function edgeItems(edge) {
  return [
    ['serial', ...EDGE_SIZES.serial],
    ...edge.holders.map((k) => [k, ...EDGE_SIZES[k]]),
    ...edge.indicators.map(() => ['indicator', ...EDGE_SIZES.indicator]),
    ...edge.ports.map((p) => ['port', ...EDGE_SIZES.port(p.length)]),
  ].map(([kind, len, wid]) => ({ kind, len, wid }));
}

// Packs casing widgets onto the four sides. Top/bottom tracks run along the widget's length;
// left/right tracks (split by the latch) stack widgets by their width. Pure: tested in node.
export function packEdgework(items, W, H) {
  const lrCap = (H - 0.75 - 0.4) / 2;
  const sides = [
    { pos: [0, H / 2, 0], rot: [-Math.PI / 2, 0, 0], axis: 'x', tracks: [{ off: 0, len: W - 0.75 }] },
    { pos: [0, -H / 2, 0], rot: [Math.PI / 2, 0, 0], axis: 'x', tracks: [{ off: 0, len: W - 0.75 }] },
    { pos: [-W / 2, 0, 0], rot: [0, -Math.PI / 2, 0], axis: 'y', latch: true, tracks: [{ off: lrCap / 2 + 0.2, len: lrCap }, { off: -(lrCap / 2 + 0.2), len: lrCap }] },
    { pos: [W / 2, 0, 0], rot: [0, Math.PI / 2, 0], axis: 'y', latch: true, tracks: [{ off: lrCap / 2 + 0.2, len: lrCap }, { off: -(lrCap / 2 + 0.2), len: lrCap }] },
  ];
  const GAP = 0.08;
  const tracks = sides.flatMap((sd) => sd.tracks.map((t) => Object.assign(t, { items: [], axis: sd.axis })));
  const size = (it, t) => (t.axis === 'x' ? it.len : it.wid);
  const used = (t) => t.items.reduce((n, it) => n + size(it, t) + GAP, 0);
  const free = (t) => t.len - used(t);
  let overflow = false;
  items.forEach((it, i) => {
    const order = i === 0 ? [tracks[0]] : tracks.slice().sort((a, b) => free(b) - free(a));
    const tr = order.find((t) => free(t) >= size(it, t));
    if (!tr) overflow = true;
    (tr || order[0]).items.push(it);
  });
  for (const t of tracks) {
    let x = t.off - (used(t) - GAP) / 2;
    for (const it of t.items) { it.at = x + size(it, t) / 2; it.axis = t.axis; x += size(it, t) + GAP; }
  }
  return { sides, overflow };
}
const FRAME_T = 0.05; // front frame thickness
export const PLATE_Z = DEPTH / 2 + 0.045; // module plate front face

export function bombSize(settings) {
  return { W: settings.cols + 0.56, H: settings.rows + 0.56 };
}

export function bayCenter(settings, row, col) {
  return new THREE.Vector2(col - (settings.cols - 1) / 2, (settings.rows - 1) / 2 - row);
}

function stencilTexture(lines, w, h, seed) {
  const rng = makeRng(seed);
  return TX.drawnTexture(w, h, (ctx) => {
    ctx.clearRect(0, 0, w, h);
    const sizes = [0.3, 0.17, 0.13];
    let y = h * 0.1;
    lines.forEach((l, i) => {
      const s = h * (sizes[i] ?? 0.12);
      TX.fitText(ctx, l, w / 2, y + s * 0.6, w * 0.94, s * 1.2, {
        font: TX.FONT_STENCIL, size: s, color: i === 0 ? 'rgba(232,180,40,0.92)' : 'rgba(230,232,235,0.85)', lineGap: 1,
      });
      y += s * 1.35;
    });
    // worn paint: knock holes out of the stencil
    ctx.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 900; i++) {
      ctx.fillStyle = `rgba(0,0,0,${0.3 + rng.next() * 0.7})`;
      const r = rng.next() ** 2 * 7 + 0.5;
      ctx.beginPath();
      ctx.arc(rng.next() * w, rng.next() * h, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  });
}

// ── Edgework widgets (built facing +z, x = along the side, y = across the side) ──
function batteryTexture(kind) {
  return TX.drawnTexture(512, 256, (ctx, w, h) => {
    const grad = ctx.createLinearGradient(0, 0, w, 0);
    if (kind === 'AA') { grad.addColorStop(0, '#1b1d20'); grad.addColorStop(0.5, '#2c3036'); grad.addColorStop(1, '#1b1d20'); }
    else { grad.addColorStop(0, '#5a3b10'); grad.addColorStop(0.5, '#a8731f'); grad.addColorStop(1, '#5a3b10'); }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = kind === 'AA' ? '#d9a42a' : '#1a1a1a';
    ctx.fillRect(0, h * 0.68, w, h * 0.32);
    ctx.save();
    ctx.translate(w / 2, h * 0.36);
    ctx.fillStyle = kind === 'AA' ? '#e8e8e8' : '#fff4dc';
    ctx.font = `bold ${h * 0.24}px ${TX.FONT_SANS}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(kind === 'AA' ? 'LOGICELL  AA  1.5V' : 'LOGICELL  D  1.5V', 0, 0);
    ctx.restore();
  });
}

function battery(kind) {
  const r = kind === 'AA' ? 0.05 : 0.095, len = kind === 'AA' ? 0.4 : 0.36;
  const g = new THREE.Group();
  const tex = batteryTexture(kind);
  tex.center.set(0.5, 0.5);
  tex.rotation = Math.PI / 2;
  const mat = new THREE.MeshPhysicalMaterial({ map: tex, roughness: 0.35, metalness: 0.3, clearcoat: 0.6 });
  const body = mesh(new THREE.CylinderGeometry(r, r, len, 32, 1, true), mat);
  body.rotation.z = Math.PI / 2;
  const capP = mesh(new THREE.CylinderGeometry(r * 0.98, r * 0.98, 0.01, 32), M.steel);
  capP.rotation.z = Math.PI / 2;
  capP.position.x = len / 2;
  const nub = mesh(new THREE.CylinderGeometry(r * 0.35, r * 0.38, 0.025, 20), M.steel);
  nub.rotation.z = Math.PI / 2;
  nub.position.x = len / 2 + 0.015;
  const capN = capP.clone();
  capN.position.x = -len / 2;
  g.add(body, capP, nub, capN);
  g.userData.r = r;
  return g;
}

function batteryHolder(kind) {
  const g = new THREE.Group();
  const n = kind === 'AA' ? 2 : 1;
  const [w, h] = EDGE_SIZES[kind];
  const tray = mesh(roundedSlab(w, h, 0.04, 0.05, 0.012), M.blackPlastic);
  tray.position.z = 0.05;
  g.add(tray);
  for (let i = 0; i < n; i++) {
    const b = battery(kind);
    b.position.set(0, n === 1 ? 0 : (i - 0.5) * 0.115, 0.05 + b.userData.r * 0.75);
    g.add(b);
  }
  // spring clips
  for (const sx of [-1, 1]) {
    const clip = mesh(new THREE.BoxGeometry(0.02, h * 0.8, 0.07), M.steel);
    clip.position.set(sx * (w / 2 - 0.035), 0, 0.08);
    g.add(clip);
  }
  return g;
}

function indicator(label, lit) {
  const g = new THREE.Group();
  const base = mesh(roundedSlab(0.42, 0.17, 0.03, 0.03, 0.008), M.blackPlastic);
  base.position.z = 0.03;
  g.add(base);
  const lensMat = new THREE.MeshPhysicalMaterial({ color: lit ? 0xfff6d6 : 0x22252a, emissive: lit ? 0xfff0c0 : 0, emissiveIntensity: 2.4, roughness: 0.1, clearcoat: 1 });
  const lens = mesh(new THREE.SphereGeometry(0.045, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), lensMat);
  lens.rotation.x = Math.PI / 2;
  lens.scale.set(1, 0.6, 1);
  lens.position.set(-0.13, 0, 0.03);
  const bez = mesh(new THREE.TorusGeometry(0.048, 0.01, 10, 28), M.steel);
  bez.position.set(-0.13, 0, 0.032);
  g.add(lens, bez);
  if (lit) {
    const gl = glowSprite(0xfff0c0, 0.4);
    gl.material.opacity = 0.75;
    gl.position.set(-0.13, 0, 0.07);
    g.add(gl);
  }
  const tex = TX.drawnTexture(256, 128, (ctx, w, h) => {
    ctx.fillStyle = '#f1ede2';
    ctx.fillRect(0, 0, w, h);
    TX.fitText(ctx, label, w / 2, h / 2 + 4, w * 0.84, h * 0.8, { color: '#141414', size: 96, font: TX.FONT_MONO });
  });
  const plate = planeWith(tex, 0.21, 0.105, { transparent: false, rough: 0.55 });
  plate.position.set(0.075, 0, 0.0305);
  g.add(plate);
  return g;
}

function serialPlate(serial) {
  const g = new THREE.Group();
  const tex = TX.drawnTexture(640, 300, (ctx, w, h) => {
    ctx.fillStyle = '#f3efe4';
    ctx.fillRect(0, 0, w, h);
    const rng = makeRng(serial);
    for (let i = 0; i < 2500; i++) { ctx.fillStyle = `rgba(80,60,30,${rng.next() * 0.05})`; ctx.fillRect(rng.next() * w, rng.next() * h, 2, 2); }
    ctx.fillStyle = '#c62828';
    ctx.fillRect(0, 0, w, 54);
    ctx.fillStyle = '#fff';
    ctx.font = `bold 34px ${TX.FONT_SANS}`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillText('SERIAL NO.', 22, 28);
    TX.fitText(ctx, serial, w / 2, h * 0.6, w * 0.88, h * 0.5, { color: '#141414', size: 150, font: TX.FONT_MONO });
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 6;
    ctx.strokeRect(3, 3, w - 6, h - 6);
  });
  const plate = mesh(roundedSlab(0.62, 0.29, 0.02, 0.008, 0.003), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.75 }));
  // map the texture onto the front cap (ExtrudeGeometry UVs are in shape units)
  plate.geometry.attributes.uv.array.forEach((_, i, arr) => { if (i % 2 === 0) arr[i] = arr[i] / 0.62 + 0.5; else arr[i] = arr[i] / 0.29 + 0.5; });
  plate.position.z = 0.008;
  plate.rotation.z = 0.015;
  g.add(plate);
  return g;
}

function portPlate(ports) {
  const g = new THREE.Group();
  const [w, h] = EDGE_SIZES.port(ports.length);
  const base = mesh(roundedSlab(w, h, 0.025, 0.035, 0.008), M.frame);
  base.position.z = 0.035;
  g.add(base);
  const tex = TX.drawnTexture(Math.round(512 * w / 0.5), Math.round(512 * h / 0.5), (ctx, cw, ch) => {
    const s = cw / w;
    ports.forEach((p, i) => {
      const cx = (0.08 + 0.1 + i * 0.2) * s, cy = ch * 0.42;
      ctx.fillStyle = '#0b0c0d';
      ctx.strokeStyle = '#8f969c';
      ctx.lineWidth = 6;
      const shape = (pw, ph, trap) => {
        ctx.beginPath();
        ctx.moveTo(cx - pw / 2, cy - ph / 2); ctx.lineTo(cx + pw / 2, cy - ph / 2);
        ctx.lineTo(cx + pw / 2 - trap, cy + ph / 2); ctx.lineTo(cx - pw / 2 + trap, cy + ph / 2);
        ctx.closePath(); ctx.fill(); ctx.stroke();
      };
      if (p === 'PARALLEL') { shape(0.17 * s, 0.06 * s, 0.012 * s); ctx.fillStyle = '#c9a54a'; for (let k = 0; k < 12; k++) { ctx.beginPath(); ctx.arc(cx - 0.065 * s + k * 0.0118 * s, cy - 0.012 * s, 3, 0, 7); ctx.fill(); } for (let k = 0; k < 11; k++) { ctx.beginPath(); ctx.arc(cx - 0.059 * s + k * 0.0118 * s, cy + 0.012 * s, 3, 0, 7); ctx.fill(); } }
      if (p === 'SERIAL') { shape(0.11 * s, 0.05 * s, 0.01 * s); ctx.fillStyle = '#c9a54a'; for (let k = 0; k < 5; k++) { ctx.beginPath(); ctx.arc(cx - 0.034 * s + k * 0.017 * s, cy - 0.01 * s, 4, 0, 7); ctx.fill(); } for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.arc(cx - 0.026 * s + k * 0.017 * s, cy + 0.011 * s, 4, 0, 7); ctx.fill(); } }
      if (p === 'USB') { shape(0.09 * s, 0.035 * s, 0); ctx.fillStyle = '#e6e6e6'; ctx.fillRect(cx - 0.035 * s, cy - 0.008 * s, 0.07 * s, 0.01 * s); }
      if (p === 'HDMI') { shape(0.11 * s, 0.035 * s, 0.012 * s); ctx.fillStyle = '#d0d0d0'; ctx.fillRect(cx - 0.04 * s, cy - 0.006 * s, 0.08 * s, 0.008 * s); }
      if (p === 'RJ-45') { shape(0.07 * s, 0.065 * s, 0); ctx.fillStyle = '#c9a54a'; for (let k = 0; k < 8; k++) ctx.fillRect(cx - 0.024 * s + k * 0.0064 * s, cy - 0.028 * s, 3, 0.012 * s); }
      ctx.fillStyle = 'rgba(235,238,240,0.9)';
      ctx.font = `bold ${0.026 * s}px ${TX.FONT_SANS}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(p, cx, ch * 0.84);
    });
  });
  const face = planeWith(tex, w, h, { rough: 0.5, metal: 0.2 });
  face.position.z = 0.0355;
  g.add(face);
  for (const sx of [-1, 1]) { const sc = screw(0.7); sc.position.set(sx * (w / 2 - 0.035), 0, 0.035); g.add(sc); }
  return g;
}

function latch() {
  const g = new THREE.Group();
  const base = mesh(roundedSlab(0.26, 0.2, 0.03, 0.03, 0.008), M.steel);
  base.position.set(0, -0.2, 0.03);
  const lever = mesh(roundedSlab(0.2, 0.3, 0.04, 0.035, 0.01), M.brass);
  lever.position.set(0, 0.07, 0.045);
  lever.rotation.x = -0.06;
  const hinge = mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.22, 20), M.steel);
  hinge.rotation.z = Math.PI / 2;
  hinge.position.set(0, -0.09, 0.04);
  const hook = mesh(new THREE.TorusGeometry(0.05, 0.012, 8, 20, Math.PI), M.steel);
  hook.position.set(0, -0.12, 0.04);
  hook.rotation.z = Math.PI;
  g.add(base, lever, hinge, hook);
  for (const sx of [-1, 1]) { const sc = screw(0.7); sc.position.set(sx * 0.09, -0.24, 0.03); g.add(sc); }
  return g;
}

// ── Whole casing ──
export function buildCase(settings, edge) {
  const { W, H } = bombSize(settings);
  const g = new THREE.Group();
  const bev = 0.07;
  const half = DEPTH / 2 - 0.03;

  // two shell halves with a rubber seam between them
  const shellShape = roundedRectShape(W - bev * 2, H - bev * 2, 0.2);
  const shellGeo = slab(shellShape, half, bev, 6, 14);
  const front = mesh(shellGeo, M.shell);
  front.position.z = DEPTH / 2;
  const back = mesh(shellGeo, M.shell);
  back.rotation.y = Math.PI;
  back.position.z = -DEPTH / 2;
  const seam = mesh(slab(roundedRectShape(W - 0.07, H - 0.07, 0.23), 0.08, 0.012, 2, 14), M.rubber);
  seam.position.z = 0.04;
  g.add(front, back, seam);

  // corner bumpers
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    const bump = mesh(new THREE.CapsuleGeometry(0.17, DEPTH - 0.3, 8, 24), M.rubber);
    bump.rotation.x = Math.PI / 2;
    bump.position.set(sx * (W / 2 - 0.12), sy * (H / 2 - 0.12), 0);
    g.add(bump);
    for (const sz of [-1, 1]) {
      const cap = mesh(new THREE.CylinderGeometry(0.075, 0.08, 0.03, 28), M.steel);
      cap.rotation.x = Math.PI / 2;
      cap.position.set(sx * (W / 2 - 0.12), sy * (H / 2 - 0.12), sz * (DEPTH / 2 + 0.02));
      g.add(cap);
      const sc = screw(1.3);
      sc.position.set(sx * (W / 2 - 0.12), sy * (H / 2 - 0.12), sz * (DEPTH / 2 + 0.035));
      if (sz < 0) sc.rotation.y = Math.PI;
      g.add(sc);
    }
  }

  // faces
  const faces = settings.twoSided ? 2 : 1;
  for (let f = 0; f < 2; f++) {
    const face = new THREE.Group();
    if (f === 1) face.rotation.y = Math.PI;
    const outer = roundedRectShape(W - 0.24, H - 0.24, 0.12);
    const floor = mesh(new THREE.BoxGeometry(W - 0.3, H - 0.3, 0.01), M.bayFloor, { cast: false });
    floor.position.z = DEPTH / 2 + 0.004;
    face.add(floor);
    if (f < faces) {
      for (let r = 0; r < settings.rows; r++) for (let c = 0; c < settings.cols; c++) {
        const p = bayCenter(settings, r, c);
        outer.holes.push(holePath(0.94, 0.94, 0.06, p.x, p.y));
      }
      // rivets where frame bars cross
      for (let r = 0; r <= settings.rows; r++) for (let c = 0; c <= settings.cols; c++) {
        const x = c - settings.cols / 2, y = settings.rows / 2 - r;
        const edge = r === 0 || r === settings.rows || c === 0 || c === settings.cols;
        if (edge && (r === 0 || r === settings.rows) && (c === 0 || c === settings.cols)) continue;
        const sc = screw(0.9);
        sc.position.set(x * 1.0 + (c === 0 ? 0.02 : c === settings.cols ? -0.02 : 0), y + (r === 0 ? -0.02 : r === settings.rows ? 0.02 : 0), DEPTH / 2 + FRAME_T);
        face.add(sc);
      }
    } else {
      // plain back: vents + stencil
      const vw = 0.07, vh = H * 0.55;
      for (let i = 0; i < 6; i++) {
        outer.holes.push(holePath(vw, vh, 0.03, -W / 2 + 0.42 + i * 0.13, 0));
        outer.holes.push(holePath(vw, vh, 0.03, W / 2 - 0.42 - i * 0.13, 0));
      }
      const sw = W - 2 * (0.42 + 6 * 0.13) + 0.1;
      if (sw > 0.6) {
        const st = stencilTexture(['LOGIC BOMB', 'HANDLE WITH CARE', 'DO NOT DROP · DO NOT SHAKE'], 1024, 512, 'stencil');
        const pl = planeWith(st, sw, sw / 2, { rough: 0.6 });
        pl.position.set(0, 0, DEPTH / 2 + FRAME_T + 0.001);
        face.add(pl);
      }
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
        const sc = screw(0.9);
        sc.position.set(sx * (W / 2 - 0.3), sy * (H / 2 - 0.25), DEPTH / 2 + FRAME_T);
        face.add(sc);
      }
    }
    const frame = mesh(slab(outer, FRAME_T, 0.016, 3, 10), M.frame);
    frame.position.z = DEPTH / 2 + FRAME_T;
    face.add(frame);
    g.add(face);
  }

  // edgework on the four sides
  const items = edgeItems(edge);
  const widgets = [serialPlate(edge.serial)];
  edge.holders.forEach((k) => widgets.push(batteryHolder(k)));
  edge.indicators.forEach((i) => widgets.push(indicator(i.label, i.lit)));
  edge.ports.forEach((p) => widgets.push(portPlate(p)));
  const { sides } = packEdgework(items, W, H);
  for (const sd of sides) {
    const sg = new THREE.Group();
    sg.position.set(...sd.pos);
    sg.rotation.set(...sd.rot);
    for (const t of sd.tracks) for (const it of t.items) {
      const w = widgets[items.indexOf(it)];
      if (sd.axis === 'x') w.position.x = it.at; else w.position.y = -it.at;
      sg.add(w);
    }
    if (sd.latch) { const l = latch(); l.rotation.z = Math.PI / 2; sg.add(l); }
    g.add(sg);
  }
  return { group: g, W, H };
}

// Desk the bomb hovers over (only receives the shadow).
export function buildDesk(y) {
  const g = new THREE.Group();
  const geo = new THREE.PlaneGeometry(40, 40);
  geo.attributes.uv.array.forEach((v, i, a) => { a[i] = v * 8; });
  const desk = mesh(geo, M.wood, { cast: false, receive: true });
  desk.rotation.x = -Math.PI / 2;
  desk.position.y = y;
  g.add(desk);
  return g;
}
