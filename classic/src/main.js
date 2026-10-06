import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { initKit, M, T, updateTweens } from './kit.js';
import * as TX from './tex.js';
import { buildCase, buildDesk, bayCenter, PLATE_Z, DEPTH } from './bomb3d.js';
import { VIEW_TYPES, TimerView, EmptyView } from './modules3d.js';
import { createExplosion } from './explode.js';
import { generateBomb, createLogic, MODES, settingsForMode, randomSeed, formatTime } from './logic.js';
import { initAudio, sfx, setMuted } from './audio.js';

const $ = (id) => document.getElementById(id);

// ───────────────────────── Renderer & scene ─────────────────────────
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
$('stage').appendChild(renderer.domElement);
TX.setMaxAnisotropy(Math.min(8, renderer.capabilities.getMaxAnisotropy()));

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(32, window.innerWidth / window.innerHeight, 0.05, 100);
scene.add(camera);

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.6;
scene.fog = new THREE.Fog(0x0b0e12, 9, 22);

const key = new THREE.DirectionalLight(0xfff0dc, 2.4);
key.position.set(3.5, 6, 6.5);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.left = key.shadow.camera.bottom = -5;
key.shadow.camera.right = key.shadow.camera.top = 5;
key.shadow.camera.near = 1;
key.shadow.camera.far = 25;
key.shadow.bias = -0.0004;
key.shadow.normalBias = 0.02;
key.shadow.radius = 4;
scene.add(key);
const rim = new THREE.DirectionalLight(0x9cc4ff, 1.0);
rim.position.set(-6, 3, -4);
scene.add(rim);
const fill = new THREE.HemisphereLight(0xc8d8ff, 0x3a2a1e, 0.55);
scene.add(fill);
// a dim warm lamp from the lower right lights the bottom edge when the bomb is rotated
const lamp = new THREE.PointLight(0xffc98a, 6, 12, 2);
lamp.position.set(4, -2.5, 4);
scene.add(lamp);

// ───────────────────────── Game state ─────────────────────────
const game = {
  state: 'menu', // menu | playing | over
  timeLeft: 300,
  strikes: 0,
  maxStrikes: 3,
  seed: '',
  settings: settingsForMode(MODES[0]),
  mode: MODES[0],
  blink: false,
  timerText: () => formatTime(game.timeLeft),
  // Button release grace: every timer reading within 0.75 real seconds either side of now,
  // so a release that is a little early or late (human reaction time) still counts.
  releaseText: () => {
    const rate = 1 + 0.25 * game.strikes;
    const seen = [];
    for (let t = -0.75; t <= 0.75; t += 0.05) seen.push(formatTime(game.timeLeft + t * rate));
    return seen.join(' ');
  },
  sfx: (n, v) => sfx(n, v),
  report: (view, res) => report(view, res),
};

let bomb = null; // { root, views, timer, W, H, desk }
let focused = null;
// Orbit-style rotation: yaw spins freely, pitch tilts up to ~80°. No roll, so the bomb never ends up sideways.
let yaw = 0, pitch = 0, yawT = 0, pitchT = 0;
const PITCH_MAX = 1.4;
const bombEuler = new THREE.Euler(0, 0, 0, 'XYZ');
const nearestFace = (target) => Math.round((yawT - target) / (Math.PI * 2)) * Math.PI * 2 + target;
const camPos = new THREE.Vector3(), camPosTarget = new THREE.Vector3();
const camLook = new THREE.Vector3(), camLookTarget = new THREE.Vector3();
let zoom = 1;
let shake = 0;

// ── Player settings (title-screen gear). Saved in this browser only. ──
const prefs = { graphics: 'high', boom: 'full', sound: 'on', shake: 'on' };
try { Object.assign(prefs, JSON.parse(localStorage.getItem('logicbomb.settings') || '{}')); } catch { /* storage blocked */ }
function applyPrefs() {
  const low = prefs.graphics === 'low';
  renderer.setPixelRatio(low ? 1 : Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);
  key.castShadow = !low;
  setMuted(prefs.sound === 'off');
  try { localStorage.setItem('logicbomb.settings', JSON.stringify(prefs)); } catch { /* storage blocked */ }
}
applyPrefs();
let idleSpin = false;

const sharedMats = () => new Set(Object.values(M));
const sharedTex = () => {
  const s = new Set();
  for (const v of Object.values(T)) { if (v.isTexture) s.add(v); else for (const t of Object.values(v)) s.add(t); }
  return s;
};

function disposeBomb() {
  if (!bomb) return;
  const mats = sharedMats(), texs = sharedTex();
  bomb.root.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    const list = o.material ? [o.material].flat() : [];
    for (const m of list) {
      if (mats.has(m)) continue;
      for (const k of ['map', 'emissiveMap']) if (m[k] && !texs.has(m[k])) m[k].dispose();
      m.dispose();
    }
  });
  if (bomb.blast) bomb.blast.group.traverse((o) => { o.geometry?.dispose(); if (o.material && !mats.has(o.material)) o.material.dispose(); });
  scene.remove(bomb.root);
  scene.remove(bomb.desk);
  if (bomb.blast) scene.remove(bomb.blast.group);
  bomb = null;
}

function buildBomb(seed, settings) {
  disposeBomb();
  const def = generateBomb(seed, settings);
  const root = new THREE.Group();
  const { group, W, H } = buildCase(settings, def.edge);
  root.add(group);
  const views = [];
  const place = (view, slot) => {
    const p = bayCenter(settings, slot.row, slot.col);
    if (slot.face === 0) view.group.position.set(p.x, p.y, PLATE_Z);
    else { view.group.position.set(-p.x, p.y, -PLATE_Z); view.group.rotation.y = Math.PI; }
    view.slot = slot;
    root.add(view.group);
  };
  const timer = new TimerView(game);
  place(timer, def.timerSlot);
  for (const slot of def.empties) place(new EmptyView(game), slot);
  for (const m of def.modules) {
    const logic = createLogic(m, def.edge, { strikes: () => game.strikes });
    const view = new VIEW_TYPES[m.type](game, m, logic);
    place(view, m.slot);
    views.push(view);
  }
  const reach = Math.hypot(W, H, DEPTH) / 2;
  const desk = buildDesk(-reach - 0.35);
  scene.add(root, desk);
  bomb = { root, views, timer, W, H, desk, def };
  return bomb;
}

function overviewDistance() {
  const t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const fitH = (bomb.H / 2 + 0.12) / t;
  const fitW = (bomb.W / 2 + 0.12) / (t * camera.aspect);
  return Math.max(fitH, fitW) + DEPTH / 2;
}

function setOverview() {
  focused = null;
  const d = overviewDistance() * zoom;
  camPosTarget.set(0, d * 0.06, d);
  camLookTarget.set(0, 0, 0);
  scene.fog.near = overviewDistance() + 2.5;
  scene.fog.far = scene.fog.near + 14;
  document.body.classList.remove('focused');
}

function focusOn(view) {
  focused = view;
  const face = view.slot.face;
  yawT = nearestFace(face === 0 ? 0 : Math.PI);
  pitchT = 0;
  const local = view.group.position.clone();
  const world = local.applyQuaternion(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yawT, 0)));
  const t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const d = Math.max(0.62 / t, 0.62 / (t * camera.aspect));
  camLookTarget.copy(world);
  camPosTarget.set(world.x, world.y + 0.04, world.z + d);
  document.body.classList.add('focused');
}

// ───────────────────────── Flow ─────────────────────────
function startGame(seed, mode) {
  initAudio();
  const settings = settingsForMode(mode);
  game.seed = seed;
  game.mode = mode;
  game.settings = settings;
  buildBomb(seed, settings);
  game.timeLeft = settings.minutes * 60;
  game.strikes = 0;
  game.maxStrikes = settings.strikes;
  game.state = 'playing';
  idleSpin = false;
  zoom = 1;
  yaw = yawT = 0;
  pitch = pitchT = 0;
  setOverview();
  camPos.copy(camPosTarget).multiplyScalar(1.6);
  camLook.copy(camLookTarget);
  showScreen(null);
  document.body.classList.add('playing');
}

function showMenuBomb() {
  buildBomb('MENU', settingsForMode(MODES[2]));
  game.state = 'menu';
  game.timeLeft = 300;
  game.strikes = 0;
  game.maxStrikes = 3;
  idleSpin = true;
  zoom = 1.05;
  yaw = 0; pitch = 0;
  yawT = -0.5; pitchT = 0.25;
  setOverview();
  // keep the bomb clear of the menu card on wide screens
  const shift = window.innerWidth > 900 ? -Math.min(1.6, 0.0011 * window.innerWidth) : 0;
  camPosTarget.x += shift;
  camLookTarget.x += shift;
  camPos.copy(camPosTarget);
  camLook.copy(camLookTarget);
  document.body.classList.remove('playing', 'focused');
  showScreen('title');
}

function showScreen(id) {
  for (const el of document.querySelectorAll('.screen')) el.classList.toggle('show', el.id === id);
}

function report(view, res) {
  if (game.state !== 'playing' || !res) return;
  if (res.strike) {
    game.strikes++;
    sfx('strike');
    view.onStrike();
    shake = Math.max(shake, 0.6);
    const f = $('flash');
    f.className = '';
    void f.offsetWidth;
    f.className = 'strike';
    if (game.strikes >= game.maxStrikes) return endGame(false, 'Too many strikes');
  }
  if (res.solved) {
    sfx('solve');
    view.onSolved();
    if (bomb.views.every((v) => v.logic.solved)) endGame(true);
  }
  if (res.activated) sfx('needy');
}

function endGame(won, reason) {
  if (game.state !== 'playing') return;
  game.state = 'over';
  setHover(null);
  activePart = null;
  const f = $('flash');
  if (!won) {
    sfx('boom');
    shake = 3;
    f.className = '';
    void f.offsetWidth;
    f.className = 'boom';
    blowUp();
  } else { sfx('win'); setOverview(); }
  $('resTitle').textContent = won ? 'BOMB DEFUSED' : 'BOOM';
  $('resTitle').className = won ? 'win' : 'lose';
  $('resReason').textContent = won ? 'Every module disarmed. The logic held.' : reason;
  $('resTime').textContent = formatTime(game.timeLeft);
  $('resStrikes').textContent = `${game.strikes} / ${game.maxStrikes}`;
  $('resMode').textContent = game.mode.name;
  setTimeout(() => { showScreen('result'); document.body.classList.remove('playing', 'focused'); }, won ? 900 : 3400);
}

// Tears the bomb apart: every casing part and module becomes a piece of debris.
function blowUp() {
  zoom = 1.45;
  setOverview();
  bomb.root.updateMatrixWorld(true);
  const pieces = [];
  for (const child of [...bomb.root.children]) {
    if (child.userData.view) { pieces.push(child); continue; }
    // the casing group: break faces and edge strips into their parts too
    for (const part of [...child.children]) {
      if (part.isGroup && part.children.length > 1) pieces.push(...part.children);
      else pieces.push(part);
    }
  }
  bomb.blast = createExplosion(scene, pieces, bomb.desk.children[0].position.y, { reduced: prefs.boom === 'reduced' });
}

// ───────────────────────── Input ─────────────────────────
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
let down = null; // { x, y, part, view, moved }
let activePart = null;
let hoverPart = null;

function pick(ev) {
  if (!bomb) return {};
  const r = renderer.domElement.getBoundingClientRect();
  ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hits = ray.intersectObject(bomb.root, true);
  for (const h of hits) {
    let o = h.object, part = null, view = null;
    while (o) {
      if (!part && o.userData.part) part = o.userData.part;
      if (o.userData.view) { view = o.userData.view; break; }
      o = o.parent;
    }
    if (h.object.isSprite) continue;
    if (h.object.material && h.object.material.visible === false && !part) continue;
    return { part, view, hit: true };
  }
  return {};
}

function setHover(part) {
  if (hoverPart === part) return;
  const paint = (p, on) => {
    if (!p) return;
    for (const m of p.mats) {
      if (!m.emissive) continue;
      if (m.userData.baseEmissive === undefined) m.userData.baseEmissive = m.emissive.getHex();
      if (m.userData.baseEmissive !== 0) continue;
      m.emissive.setHex(on ? 0x1c1c1c : 0);
    }
  };
  paint(hoverPart, false);
  hoverPart = part;
  paint(hoverPart, true);
  renderer.domElement.style.cursor = part ? 'pointer' : '';
}

const canvasEl = renderer.domElement;
canvasEl.addEventListener('contextmenu', (e) => e.preventDefault());
// Buttons and wires work at any zoom level. Clicking a module's plate zooms in on it;
// clicking anywhere else (the case or empty space) zooms back out.
canvasEl.addEventListener('pointerdown', (ev) => {
  if (game.state !== 'playing') return;
  canvasEl.setPointerCapture(ev.pointerId);
  if (ev.button === 2) { setOverview(); return; }
  const p = pick(ev);
  down = { x: ev.clientX, y: ev.clientY, lx: ev.clientX, ly: ev.clientY, moved: false, ...p };
  if (p.part) {
    activePart = p.part;
    p.part.down?.(ev);
  }
});
canvasEl.addEventListener('pointermove', (ev) => {
  if (game.state !== 'playing') return;
  if (down) {
    const dx = ev.clientX - down.lx, dy = ev.clientY - down.ly;
    if (Math.hypot(ev.clientX - down.x, ev.clientY - down.y) > 6) down.moved = true;
    down.lx = ev.clientX;
    down.ly = ev.clientY;
    if (!focused && !down.part && down.moved) {
      yawT += dx * 0.006;
      pitchT = THREE.MathUtils.clamp(pitchT + dy * 0.005, -PITCH_MAX, PITCH_MAX);
    }
    return;
  }
  const p = pick(ev);
  setHover(p.part || null);
  if (!p.part && !focused && p.view && !(p.view instanceof EmptyView)) canvasEl.style.cursor = 'zoom-in';
});
canvasEl.addEventListener('pointerup', (ev) => {
  if (activePart) { activePart.up?.(ev); activePart = null; }
  if (!down || game.state !== 'playing') { down = null; return; }
  const d = down;
  down = null;
  if (d.moved || d.part) return;
  const target = d.view && !(d.view instanceof EmptyView) ? d.view : null;
  if (target) { if (target !== focused) focusOn(target); }
  else if (focused) setOverview();
});
canvasEl.addEventListener('pointercancel', () => { activePart?.up?.(); activePart = null; down = null; });
canvasEl.addEventListener('wheel', (ev) => {
  if (game.state !== 'playing' || focused) return;
  zoom = THREE.MathUtils.clamp(zoom * (ev.deltaY > 0 ? 1.08 : 0.92), 0.55, 1.6);
  setOverview();
}, { passive: true });
window.addEventListener('keydown', (ev) => {
  if (game.state !== 'playing') return;
  if (ev.key === 'Escape') setOverview();
  if (ev.key === 'f' || ev.key === 'F') { setOverview(); yawT += Math.PI; }
  const step = 0.25;
  const rot = { ArrowLeft: [0, -step], ArrowRight: [0, step], ArrowUp: [-step, 0], ArrowDown: [step, 0] }[ev.key];
  if (rot && !focused) {
    pitchT = THREE.MathUtils.clamp(pitchT + rot[0], -PITCH_MAX, PITCH_MAX);
    yawT += rot[1];
    ev.preventDefault();
  }
});
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  if (bomb) focused ? focusOn(focused) : setOverview();
});

// ───────────────────────── UI wiring ─────────────────────────
function buildModeList() {
  const box = $('modes');
  for (const mode of MODES) {
    const b = document.createElement('button');
    b.className = 'mode';
    const m = mode.count + (mode.count === 1 ? ' module' : ' modules');
    b.innerHTML = `<span class="mname">${mode.name}</span><span class="mstats">${m} · ${mode.strikes} strike${mode.strikes > 1 ? 's' : ''} · ${mode.minutes}:00</span>`;
    b.addEventListener('click', () => startGame(randomSeed(), mode));
    box.appendChild(b);
  }
}
function buildSettings() {
  const rows = [
    ['graphics', 'Graphics', [['high', 'High'], ['low', 'Low']]],
    ['boom', 'Explosion', [['full', 'Full'], ['reduced', 'Reduced']]],
    ['sound', 'Sound', [['on', 'On'], ['off', 'Off']]],
    ['shake', 'Screen shake', [['on', 'On'], ['off', 'Off']]],
  ];
  const box = $('settingsList');
  for (const [k, label, opts] of rows) {
    const row = document.createElement('div');
    row.className = 'setrow';
    row.innerHTML = `<span>${label}</span><div class="seg"></div>`;
    for (const [v, text] of opts) {
      const b = document.createElement('button');
      b.textContent = text;
      b.className = prefs[k] === v ? 'on' : '';
      b.addEventListener('click', () => {
        prefs[k] = v;
        row.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
        applyPrefs();
      });
      row.querySelector('.seg').appendChild(b);
    }
    box.appendChild(row);
  }
  $('gear').addEventListener('click', () => $('title').classList.add('settings'));
  $('closeSettings').addEventListener('click', () => $('title').classList.remove('settings'));
}
$('retry').addEventListener('click', () => startGame(game.seed, game.mode));
$('newBomb').addEventListener('click', () => startGame(randomSeed(), game.mode));
$('toMenu').addEventListener('click', () => showMenuBomb());
$('quit').addEventListener('click', () => { if (confirm('Abandon this bomb?')) showMenuBomb(); });

// ───────────────────────── Loop ─────────────────────────
let last = performance.now();
function frame() {
  const nowMs = performance.now();
  const realDt = Math.min(0.5, (nowMs - last) / 1000); // game clock (survives slow frames)
  const dt = Math.min(0.05, realDt); // animation step
  last = nowMs;
  if (game.state === 'playing') {
    const before = Math.ceil(game.timeLeft);
    game.timeLeft -= realDt * (1 + 0.25 * game.strikes);
    const now = Math.ceil(game.timeLeft);
    if (now !== before) { sfx('tick', game.timeLeft < 30 ? 1.6 : 1); game.blink = !game.blink; }
    for (const v of bomb.views) if (v.logic.needy) report(v, v.logic.update(realDt * (1 + 0.25 * game.strikes)));
    if (game.timeLeft <= 0) { game.timeLeft = 0; endGame(false, 'The timer ran out'); }
  }
  if (bomb) {
    bomb.timer.update(dt);
    for (const v of bomb.views) v.update(dt);
  }
  updateTweens(dt);
  if (idleSpin) yawT += dt * 0.12;
  const k = 1 - Math.exp(-dt * 9);
  yaw += (yawT - yaw) * k;
  pitch += (pitchT - pitch) * k;
  if (bomb) bomb.root.quaternion.setFromEuler(bombEuler.set(pitch, yaw, 0));
  if (bomb?.blast) bomb.blast.update(dt, camera);
  camPos.lerp(camPosTarget, 1 - Math.exp(-dt * 6));
  camLook.lerp(camLookTarget, 1 - Math.exp(-dt * 6));
  camera.position.copy(camPos);
  if (prefs.shake === 'off') shake = 0;
  if (shake > 0) {
    camera.position.x += (Math.random() - 0.5) * 0.05 * shake;
    camera.position.y += (Math.random() - 0.5) * 0.05 * shake;
    shake = Math.max(0, shake - dt * 2.2);
  }
  camera.lookAt(camLook);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

// ───────────────────────── Debug / test hooks ─────────────────────────
// Used by tools/shot.mjs to drive the real input handlers in a headless browser.
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const snap = () => { yaw = yawT; pitch = pitchT; camPos.copy(camPosTarget); camLook.copy(camLookTarget); };
window.__lb = {
  game,
  count: () => bomb.views.length,
  views: () => bomb.views,
  focus: (i) => { i < 0 ? focusOn(bomb.timer) : focusOn(bomb.views[i]); snap(); },
  rotate: (rx, ry) => { setOverview(); pitchT = rx; yawT = ry; snap(); },
  start: (i, seed) => startGame(seed || 'TEST' + i, MODES[i]),
  // screen pixel at the visual centre of a part (used to test real mouse clicks)
  screenPos(vi, pi) {
    const m = bomb.views[vi].parts[pi];
    const o = m.parent && m.parent !== bomb.views[vi].group ? m.parent : m;
    const box = new THREE.Box3().setFromObject(o);
    const c = box.getCenter(new THREE.Vector3());
    c.z = box.max.z; // front surface
    c.applyMatrix4(new THREE.Matrix4()); c.project(camera);
    const r = renderer.domElement.getBoundingClientRect();
    return [r.left + (c.x + 1) / 2 * r.width, r.top + (1 - c.y) / 2 * r.height];
  },
  overview: () => { setOverview(); snap(); },
  async autoplay() {
    const log = [];
    const tap = async (mesh) => { const p = mesh.userData.part; p.down?.(); await wait(60); p.up?.(); await wait(120); };
    // one deliberate strike first, on a Keypad / Wires / Maze if there is one
    const victim = bomb.views.find((v) => ['keypad', 'wires'].includes(v.mod.type));
    if (victim) {
      if (victim.mod.type === 'keypad') await tap(victim.parts[victim.logic.order[3]]);
      else await tap(victim.parts[victim.logic.solution.cut === 1 ? 1 : 0]);
      log.push('deliberate strike -> strikes=' + game.strikes);
    }
    for (const v of bomb.views) {
      focusOn(v);
      await wait(300);
      if (v.mod.type === 'wires' && v.logic.cut.size && v.logic.solved) { log.push('wires: solved'); continue; }
      await v.auto(tap);
      log.push(`${v.mod.type}: ${v.logic.needy ? 'needy ok' : v.logic.solved ? 'solved' : 'NOT SOLVED'} (strikes=${game.strikes})`);
    }
    setOverview();
    log.push('state=' + game.state);
    return log.join('\n');
  },
};

// ───────────────────────── Boot ─────────────────────────
async function boot() {
  try {
    await Promise.all([
      document.fonts.load(`bold 40px LBMono`), document.fonts.load(`40px LBMono`),
      document.fonts.load(`bold 40px LBSans`),
    ]);
  } catch { /* system fonts are fine */ }
  await new Promise((r) => setTimeout(r, 30)); // let the loading text paint
  initKit();
  scene.background = TX.backdrop();
  buildModeList();
  buildSettings();
  showMenuBomb();
  $('loading').classList.add('gone');
  requestAnimationFrame(frame);
}
boot();
