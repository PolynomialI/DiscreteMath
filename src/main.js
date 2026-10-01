import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { initKit, M, T, updateTweens } from './kit.js';
import * as TX from './tex.js';
import { buildCase, buildDesk, bayCenter, PLATE_Z, DEPTH } from './bomb3d.js';
import { VIEW_TYPES, TimerView } from './modules3d.js';
import { generateBomb, createLogic, DEFAULT_SETTINGS, MODULE_TYPES, randomSeed, formatTime, RELEASE_DIGIT, WORD_FORMS } from './logic.js';
import { initAudio, sfx } from './audio.js';

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
  settings: { ...DEFAULT_SETTINGS },
  blink: false,
  timerText: () => formatTime(game.timeLeft),
  sfx: (n, v) => sfx(n, v),
  report: (view, res) => report(view, res),
};

let bomb = null; // { root, views, timer, W, H, desk }
let focused = null;
const bombQuat = new THREE.Quaternion();
const bombQuatTarget = new THREE.Quaternion();
const camPos = new THREE.Vector3(), camPosTarget = new THREE.Vector3();
const camLook = new THREE.Vector3(), camLookTarget = new THREE.Vector3();
let zoom = 1;
let shake = 0;
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
  scene.remove(bomb.root);
  scene.remove(bomb.desk);
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
  for (const m of def.modules) {
    const logic = createLogic(m, def.edge);
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
  const fitH = (bomb.H / 2 + 0.35) / t;
  const fitW = (bomb.W / 2 + 0.35) / (t * camera.aspect);
  return Math.max(fitH, fitW) + DEPTH / 2;
}

function setOverview() {
  focused = null;
  const d = overviewDistance() * zoom;
  camPosTarget.set(0, d * 0.1, d);
  camLookTarget.set(0, 0, 0);
  scene.fog.near = overviewDistance() + 2.5;
  scene.fog.far = scene.fog.near + 14;
  document.body.classList.remove('focused');
}

function focusOn(view) {
  focused = view;
  const face = view.slot.face;
  bombQuatTarget.setFromAxisAngle(new THREE.Vector3(0, 1, 0), face === 0 ? 0 : Math.PI);
  const local = view.group.position.clone();
  const world = local.applyQuaternion(bombQuatTarget);
  const t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const d = Math.max(0.62 / t, 0.62 / (t * camera.aspect));
  camLookTarget.copy(world);
  camPosTarget.set(world.x, world.y + 0.04, world.z + d);
  document.body.classList.add('focused');
}

// ───────────────────────── Flow ─────────────────────────
function readSettings() {
  const mods = [...document.querySelectorAll('#mods input:checked')].map((i) => i.value);
  return {
    rows: +$('rows').value,
    cols: +$('cols').value,
    twoSided: $('twoSided').checked,
    minutes: +$('minutes').value,
    strikes: +$('strikes').value,
    needy: $('needy').checked,
    modules: mods.length ? mods : Object.keys(MODULE_TYPES),
  };
}

function startGame(seed, settings) {
  initAudio();
  game.seed = seed;
  game.settings = settings;
  buildBomb(seed, settings);
  game.timeLeft = settings.minutes * 60;
  game.strikes = 0;
  game.maxStrikes = settings.strikes;
  game.state = 'playing';
  idleSpin = false;
  zoom = 1;
  bombQuat.identity();
  bombQuatTarget.identity();
  setOverview();
  camPos.copy(camPosTarget).multiplyScalar(1.6);
  camLook.copy(camLookTarget);
  showScreen(null);
  document.body.classList.add('playing');
}

function showMenuBomb() {
  buildBomb('MENU', { ...DEFAULT_SETTINGS });
  game.state = 'menu';
  game.timeLeft = DEFAULT_SETTINGS.minutes * 60;
  game.strikes = 0;
  idleSpin = true;
  zoom = 1.05;
  bombQuat.identity();
  bombQuatTarget.setFromEuler(new THREE.Euler(0.25, -0.5, 0));
  setOverview();
  // keep the bomb clear of the settings card on wide screens
  const shift = window.innerWidth > 900 ? -Math.min(2.2, 0.0016 * window.innerWidth) : 0;
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
  setOverview();
  const f = $('flash');
  if (!won) {
    sfx('boom');
    shake = 2.2;
    f.className = '';
    void f.offsetWidth;
    f.className = 'boom';
  } else sfx('win');
  const s = game.settings;
  $('resTitle').textContent = won ? 'BOMB DEFUSED' : 'BOOM';
  $('resTitle').className = won ? 'win' : 'lose';
  $('resReason').textContent = won ? 'Every module disarmed. The logic held.' : reason;
  $('resTime').textContent = formatTime(game.timeLeft);
  $('resStrikes').textContent = `${game.strikes} / ${game.maxStrikes}`;
  $('resSeed').textContent = game.seed;
  $('resLayout').textContent = `${s.rows}×${s.cols}${s.twoSided ? ' · two-sided' : ''}${s.needy ? ' · needy' : ''}`;
  setTimeout(() => { showScreen('result'); document.body.classList.remove('playing', 'focused'); }, won ? 900 : 1600);
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
canvasEl.addEventListener('pointerdown', (ev) => {
  if (game.state !== 'playing') return;
  canvasEl.setPointerCapture(ev.pointerId);
  if (ev.button === 2) { setOverview(); return; }
  const p = pick(ev);
  down = { x: ev.clientX, y: ev.clientY, lx: ev.clientX, ly: ev.clientY, moved: false, ...p };
  if (focused && p.part && p.view === focused) {
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
    if (!focused && down.moved) {
      const qy = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), dx * 0.008);
      const qx = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), dy * 0.008);
      bombQuatTarget.premultiply(qy).premultiply(qx);
    }
    return;
  }
  const p = pick(ev);
  setHover(focused && p.view === focused ? p.part : null);
  if (!focused && p.view) canvasEl.style.cursor = 'zoom-in';
});
canvasEl.addEventListener('pointerup', (ev) => {
  if (activePart) { activePart.up?.(ev); activePart = null; }
  if (!down || game.state !== 'playing') { down = null; return; }
  const d = down;
  down = null;
  if (d.moved) return;
  if (focused) {
    if (!d.view) setOverview();
    else if (d.view !== focused) focusOn(d.view);
  } else if (d.view) focusOn(d.view);
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
  if (ev.key === 'f' || ev.key === 'F') { setOverview(); bombQuatTarget.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI)); }
  const step = 0.25;
  const rot = { ArrowLeft: [0, -step], ArrowRight: [0, step], ArrowUp: [-step, 0], ArrowDown: [step, 0] }[ev.key];
  if (rot && !focused) {
    bombQuatTarget.premultiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(rot[0], rot[1], 0)));
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
function buildModuleChecks() {
  const box = $('mods');
  for (const [k, def] of Object.entries(MODULE_TYPES)) {
    const l = document.createElement('label');
    l.className = 'chk';
    l.innerHTML = `<input type="checkbox" value="${k}" checked><span>${def.name}</span>`;
    box.appendChild(l);
  }
  box.addEventListener('change', updateCount);
}
function updateCount() {
  const s = readSettings();
  const slots = s.rows * s.cols * (s.twoSided ? 2 : 1) - 1;
  $('slotInfo').textContent = `${slots} module${slots === 1 ? '' : 's'} + timer` + (s.needy ? ' (1 needy)' : '');
}
for (const id of ['rows', 'cols', 'twoSided', 'needy']) $(id).addEventListener('change', updateCount);
$('seed').value = randomSeed();
$('dice').addEventListener('click', () => { $('seed').value = randomSeed(); });
$('start').addEventListener('click', () => {
  const seed = ($('seed').value || randomSeed()).trim().toUpperCase();
  $('seed').value = seed;
  startGame(seed, readSettings());
});
$('retry').addEventListener('click', () => startGame(game.seed, game.settings));
$('newBomb').addEventListener('click', () => { const s = randomSeed(); $('seed').value = s; startGame(s, game.settings); });
$('toMenu').addEventListener('click', () => { $('seed').value = randomSeed(); showMenuBomb(); });
$('quit').addEventListener('click', () => { if (confirm('Abandon this bomb?')) showMenuBomb(); });
$('backBtn').addEventListener('click', () => setOverview());
$('flipBtn').addEventListener('click', () => { setOverview(); bombQuatTarget.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI)); });

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
  if (idleSpin) bombQuatTarget.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), dt * 0.12));
  const k = 1 - Math.exp(-dt * 9);
  bombQuat.slerp(bombQuatTarget, k);
  if (bomb) bomb.root.quaternion.copy(bombQuat);
  camPos.lerp(camPosTarget, 1 - Math.exp(-dt * 6));
  camLook.lerp(camLookTarget, 1 - Math.exp(-dt * 6));
  camera.position.copy(camPos);
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
const snap = () => { bombQuat.copy(bombQuatTarget); camPos.copy(camPosTarget); camLook.copy(camLookTarget); };
window.__lb = {
  game,
  count: () => bomb.views.length,
  views: () => bomb.views,
  focus: (i) => { i < 0 ? focusOn(bomb.timer) : focusOn(bomb.views[i]); snap(); },
  rotate: (rx, ry) => { setOverview(); bombQuatTarget.setFromEuler(new THREE.Euler(rx, ry, 0)); snap(); },
  overview: () => { setOverview(); snap(); },
  async autoplay() {
    const log = [];
    const tap = async (part) => { part.down?.(); await wait(60); part.up?.(); await wait(120); };
    const grid = bomb.views.find((v) => v.mod.type === 'grid');
    if (grid) { const wrong = ['red', 'blue', 'green', 'yellow'].findIndex((c) => c !== grid.logic.solution.color); await tap(grid.parts[wrong].userData.part); log.push('deliberate strike -> strikes=' + game.strikes); }
    for (const v of bomb.views) {
      const L = v.logic, P = v.parts.map((m) => m.userData.part);
      focusOn(v);
      await wait(400);
      switch (v.mod.type) {
        case 'wires': await tap(P[L.solution.cut - 1]); break;
        case 'venn': for (const k of L.K) await tap(P[k - 1]); break;
        case 'keypad': for (const k of L.order) await tap(P[k]); break;
        case 'grid': await tap(P[['red', 'blue', 'green', 'yellow'].indexOf(L.solution.color)]); break;
        case 'simon': {
          const idx = { red: 0, blue: 1, green: 2, yellow: 3 };
          for (let s = 1; s <= v.mod.data.seq.length; s++) for (let j = 0; j < s; j++) await tap(P[idx[L.map[v.mod.data.seq[j]]]]);
          break;
        }
        case 'words': for (let s = 0; s < 3; s++) { const st = L.current(); await tap(P[st.buttons.indexOf(WORD_FORMS[st.form].word)]); } break;
        case 'truth':
          for (let i = 0; i < 4; i++) if (L.cols[i] !== L.solution[i]) await tap(P[i * 2]);
          await tap(P[8]);
          break;
        case 'button':
          if (L.solution.action === 'TAP') await tap(P[0]);
          else {
            P[0].down();
            await wait(800);
            const d = String(RELEASE_DIGIT[L.strip]);
            for (let i = 0; i < 400 && !game.timerText().includes(d); i++) await wait(50);
            P[0].up();
          }
          break;
        case 'needy':
          for (let i = 0; i < 3 && !L.active; i++) await wait(10);
          if (L.active) await tap(P[L.current[2] ? 0 : 1]);
          break;
      }
      log.push(`${v.mod.type}: ${v.mod.type === 'needy' ? 'ok' : L.solved ? 'solved' : 'NOT SOLVED'} (strikes=${game.strikes})`);
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
  buildModuleChecks();
  updateCount();
  showMenuBomb();
  $('loading').classList.add('gone');
  requestAnimationFrame(frame);
}
boot();
