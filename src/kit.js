// Shared materials, geometry helpers and the module chassis (plate + screws + status LED).
import * as THREE from 'three';
import * as TX from './tex.js';
import { makeRng } from './logic.js';

export let M = null; // materials, created once by initKit()
export let G = null; // shared geometries
export let T = null; // shared textures

export const PLATE = 0.86; // module plate size (bay pitch is 1.0)

export function initKit() {
  T = {
    alu: TX.brushedMetal({ base: '#c3c9cf', seed: 'alu', wear: 0.7, grime: 0.1, roughBase: 0.4 }),
    shell: TX.brushedMetal({ base: '#93a3b4', seed: 'shell', streak: 1.2, wear: 0.9, grime: 0.1, roughBase: 0.42 }),
    frame: TX.paintedMetal({ base: '#3e4a56', seed: 'frame', chips: 0.8 }),
    dark: TX.paintedMetal({ base: '#1c2127', seed: 'dark', chips: 0.35 }),
    rubber: TX.rubber({}),
    plastic: TX.plastic({}),
    wood: TX.wood({}),
    screw: TX.screwHead(),
    glow: TX.glowTexture(),
  };
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const phys = (o) => new THREE.MeshPhysicalMaterial(o);
  M = {
    alu: std({ ...T.alu, color: 0xffffff, metalness: 0.88, roughness: 1, envMapIntensity: 1.1 }),
    shell: std({ ...T.shell, color: 0xffffff, metalness: 0.82, roughness: 1, envMapIntensity: 1.05 }),
    frame: std({ ...T.frame, color: 0xffffff, metalness: 1, roughness: 1 }),
    dark: std({ ...T.dark, color: 0xffffff, metalness: 1, roughness: 1 }),
    rubber: std({ ...T.rubber, color: 0xffffff, metalness: 0, roughness: 1 }),
    steel: std({ color: 0xb7bec6, metalness: 1, roughness: 0.28, normalMap: T.alu.normalMap, normalScale: new THREE.Vector2(0.3, 0.3) }),
    brass: std({ color: 0xc2a56a, metalness: 1, roughness: 0.32, roughnessMap: T.alu.roughnessMap }),
    copper: std({ color: 0xd2774a, metalness: 1, roughness: 0.3 }),
    screwTop: std({ map: T.screw.map, normalMap: T.screw.normalMap, color: 0xc9ced4, metalness: 1, roughness: 0.3 }),
    blackPlastic: phys({ color: 0x16181b, roughness: 1, roughnessMap: T.plastic.roughnessMap, normalMap: T.plastic.normalMap, normalScale: new THREE.Vector2(0.4, 0.4), metalness: 0, clearcoat: 0.3, clearcoatRoughness: 0.4 }),
    socket: std({ color: 0x0b0c0e, roughness: 0.6, metalness: 0.2 }),
    bayFloor: std({ color: 0x0c0e11, roughness: 0.85, metalness: 0.3 }),
    glass: phys({ color: 0x000000, roughness: 0.06, metalness: 0, transparent: true, opacity: 0.16, clearcoat: 1, clearcoatRoughness: 0.05, depthWrite: false }),
    wood: std({ ...T.wood, color: 0xffffff, metalness: 0, roughness: 1 }),
    screenBack: std({ color: 0x050607, roughness: 0.4, metalness: 0 }),
  };
  M.frame.metalness = 1; // metalnessMap drives paint vs. bare steel
  G = {
    screwSide: new THREE.CylinderGeometry(0.026, 0.028, 0.016, 20, 1, true),
    screwTop: new THREE.CylinderGeometry(0.026, 0.026, 0.001, 20),
    ledBezel: new THREE.TorusGeometry(0.03, 0.009, 10, 28),
    ledLens: new THREE.SphereGeometry(0.026, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2),
  };
}

// ── Geometry helpers ──
export function roundedRectShape(w, h, r) {
  const s = new THREE.Shape();
  roundedRectPath(s, w, h, r);
  return s;
}
function roundedRectPath(p, w, h, r, cx = 0, cy = 0) {
  const x = cx - w / 2, y = cy - h / 2;
  r = Math.min(r, w / 2, h / 2);
  p.moveTo(x + r, y);
  p.lineTo(x + w - r, y);
  p.quadraticCurveTo(x + w, y, x + w, y + r);
  p.lineTo(x + w, y + h - r);
  p.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  p.lineTo(x + r, y + h);
  p.quadraticCurveTo(x, y + h, x, y + h - r);
  p.lineTo(x, y + r);
  p.quadraticCurveTo(x, y, x + r, y);
  return p;
}
export function holePath(w, h, r, cx, cy) {
  // Holes must wind opposite to the outer shape.
  const p = new THREE.Path();
  const x = cx - w / 2, y = cy - h / 2;
  r = Math.min(r, w / 2, h / 2);
  p.moveTo(x + r, y);
  p.quadraticCurveTo(x, y, x, y + r);
  p.lineTo(x, y + h - r);
  p.quadraticCurveTo(x, y + h, x + r, y + h);
  p.lineTo(x + w - r, y + h);
  p.quadraticCurveTo(x + w, y + h, x + w, y + h - r);
  p.lineTo(x + w, y + r);
  p.quadraticCurveTo(x + w, y, x + w - r, y);
  p.lineTo(x + r, y);
  return p;
}

// Extruded slab whose FRONT face sits at z = 0 (body extends to -depth).
export function slab(shape, depth, bevel = 0.012, segs = 3, curveSegs = 8) {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.0001, depth - bevel * 2), bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel,
    bevelSegments: segs, curveSegments: curveSegs,
  });
  g.translate(0, 0, -depth + bevel);
  g.computeVertexNormals();
  return g;
}

export function roundedSlab(w, h, r, depth, bevel = 0.012, segs = 3) {
  return slab(roundedRectShape(w - bevel * 2, h - bevel * 2, Math.max(0.001, r - bevel)), depth, bevel, segs);
}

export function mesh(geo, mat, { cast = true, receive = true } = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}

const screwRng = makeRng('screws');
export function screw(scale = 1) {
  const g = new THREE.Group();
  const side = mesh(G.screwSide, M.steel, { cast: false });
  side.rotation.x = Math.PI / 2;
  side.position.z = 0.008;
  const top = mesh(G.screwTop, M.screwTop, { cast: false });
  top.rotation.x = Math.PI / 2;
  top.position.z = 0.0165;
  top.rotation.y = screwRng.next() * Math.PI;
  g.add(side, top);
  g.scale.setScalar(scale);
  return g;
}

export function glowSprite(color, size) {
  const mat = new THREE.SpriteMaterial({ map: T.glow, color, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0 });
  const s = new THREE.Sprite(mat);
  s.scale.setScalar(size);
  return s;
}

// Status LED with chrome bezel; .set('off'|'green'|'red').
export function statusLed() {
  const g = new THREE.Group();
  const bezel = mesh(G.ledBezel, M.steel, { cast: false });
  bezel.position.z = 0.004;
  const lensMat = new THREE.MeshPhysicalMaterial({ color: 0x1a1d20, emissive: 0x000000, roughness: 0.15, metalness: 0, clearcoat: 1, transmission: 0 });
  const lens = mesh(G.ledLens, lensMat, { cast: false });
  lens.rotation.x = Math.PI / 2;
  lens.scale.set(1, 0.55, 1);
  const glow = glowSprite(0x33ff66, 0.22);
  glow.position.z = 0.03;
  g.add(bezel, lens, glow);
  g.userData.set = (state) => {
    const c = { off: [0x1a1d20, 0x000000, 0], green: [0x1c6b2e, 0x2bff5a, 0.9], red: [0x6b1c1c, 0xff2a2a, 1] }[state];
    lensMat.color.setHex(c[0]);
    lensMat.emissive.setHex(c[1]);
    lensMat.emissiveIntensity = 1.6;
    glow.material.color.setHex(c[1] || 0x000000);
    glow.material.opacity = c[2];
  };
  g.userData.set('off');
  return g;
}

// Flat textured label/screen plane (front-facing, +z).
export function planeWith(tex, w, h, { emissive = false, rough = 0.6, metal = 0, transparent = true, intensity = 1 } = {}) {
  const mat = emissive
    ? new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: intensity, roughness: 0.4, metalness: 0 })
    : new THREE.MeshStandardMaterial({ map: tex, transparent, roughness: rough, metalness: metal, alphaTest: transparent ? 0.02 : 0 });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  m.receiveShadow = !emissive;
  return m;
}

// Recessed screen: black bezel box + emissive canvas + glass pane.
export function screen(tex, w, h, { depth = 0.03, bezel = 0.03, intensity = 1.2, glass = true } = {}) {
  intensity *= 0.72;
  const g = new THREE.Group();
  const frame = mesh(roundedSlab(w + bezel * 2, h + bezel * 2, 0.025, depth, 0.008), M.blackPlastic);
  frame.position.z = depth;
  const disp = planeWith(tex, w, h, { emissive: true, intensity });
  disp.position.z = depth + 0.001;
  g.add(frame, disp);
  if (glass) {
    const gl = new THREE.Mesh(new THREE.PlaneGeometry(w, h), M.glass);
    gl.position.z = depth + 0.006;
    g.add(gl);
  }
  g.userData.display = disp;
  return g;
}

// A module's base: brushed plate + 4 screws + optional status LED. Front face of plate at z = 0.
export function chassis({ led = true } = {}) {
  const g = new THREE.Group();
  const plate = mesh(roundedSlab(PLATE, PLATE, 0.05, 0.05, 0.014, 4), M.alu);
  g.add(plate);
  const s = PLATE / 2 - 0.045;
  for (const [x, y] of [[-s, -s], [s, -s], [-s, s], [s, s]]) {
    const sc = screw();
    sc.position.set(x, y, 0);
    g.add(sc);
  }
  let ledObj = null;
  if (led) {
    ledObj = statusLed();
    ledObj.position.set(PLATE / 2 - 0.115, PLATE / 2 - 0.105, 0);
    g.add(ledObj);
  }
  return { group: g, led: ledObj };
}

// Clone a material so an interactive part can be highlighted on its own.
export function own(mat) {
  const m = mat.clone();
  if (!m.emissive) m.emissive = new THREE.Color(0, 0, 0);
  return m;
}

// Tiny tween system.
const tweens = [];
export function tween(duration, fn, done) {
  tweens.push({ t: 0, duration, fn, done });
}
export function updateTweens(dt) {
  for (let i = tweens.length - 1; i >= 0; i--) {
    const tw = tweens[i];
    tw.t += dt;
    const k = Math.min(1, tw.t / tw.duration);
    tw.fn(k);
    if (k >= 1) { tweens.splice(i, 1); tw.done?.(); }
  }
}
export const ease = {
  out: (k) => 1 - (1 - k) ** 3,
  inOut: (k) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2),
  bump: (k) => Math.sin(k * Math.PI),
};

// Animates a press: moves obj along -z and back.
export function pressAnim(obj, depth = 0.012, dur = 0.16) {
  const z0 = obj.userData.z0 ?? (obj.userData.z0 = obj.position.z);
  tween(dur, (k) => { obj.position.z = z0 - depth * ease.bump(k); });
}
