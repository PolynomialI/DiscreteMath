// 3D views for every module. Views only draw state and forward input to the pure logic objects.
import * as THREE from 'three';
import * as TX from './tex.js';
import { M, T, G, PLATE, chassis, mesh, roundedSlab, slab, roundedRectShape, holePath, screw, screen, planeWith, glowSprite, own, pressAnim, tween, ease, statusLed } from './kit.js';
import { TAP_MAX_MS, RELEASE_DIGIT, formatTime, MORSE, MORSE_WORDS, MAZES, mazePath, solveWords, VENT_SECONDS, CAPACITOR_SECONDS, KNOB_POSITIONS } from './logic.js';

const COLOR_HEX = {
  red: 0xc81e1e, blue: 0x1c55d0, yellow: 0xf0b81c, black: 0x151515, white: 0xe9e9e4, green: 0x1f9d45,
};
const LIGHT_HEX = { red: 0xff2a1f, blue: 0x3b7bff, yellow: 0xffcc2e, white: 0xf4f6ff, green: 0x35ff6a };

function insulation(color) {
  return new THREE.MeshPhysicalMaterial({
    color: COLOR_HEX[color], roughness: color === 'black' ? 0.5 : 0.36, metalness: 0,
    clearcoat: 0.55, clearcoatRoughness: 0.35, normalMap: T.plastic.normalMap, normalScale: new THREE.Vector2(0.3, 0.3),
  });
}
function capPlastic(hex, rough = 0.32) {
  return new THREE.MeshPhysicalMaterial({
    color: hex, roughness: rough, metalness: 0, clearcoat: 0.8, clearcoatRoughness: 0.18,
    roughnessMap: T.plastic.roughnessMap, normalMap: T.plastic.normalMap, normalScale: new THREE.Vector2(0.25, 0.25),
    emissive: 0x000000,
  });
}
const invisible = new THREE.MeshBasicMaterial({ visible: false });

// Printed (screen-printed / stamped) text plane on a plate.
function printed(w, h, lines, opts = {}) {
  const px = 512, py = Math.round(512 * h / w);
  const tex = TX.drawnTexture(px, py, (ctx) => {
    TX.fitText(ctx, lines, px / 2, py / 2, px * 0.96, py * 0.9, { color: opts.color || 'rgba(25,28,32,0.88)', size: opts.size || 200, font: opts.font || TX.FONT_SANS, weight: opts.weight || 'bold' });
  });
  const m = planeWith(tex, w, h, { rough: 0.7 });
  m.position.z = 0.0015;
  return m;
}

// ───────────────────────── Base ─────────────────────────
class ModuleView {
  constructor(game, mod, logic, { led = true } = {}) {
    this.game = game;
    this.mod = mod;
    this.logic = logic;
    const ch = chassis({ led });
    this.group = ch.group;
    this.led = ch.led;
    this.parts = [];
    this.group.userData.view = this;
  }
  addPart(meshObj, handlers, mats) {
    const part = { view: this, mats: mats || [meshObj.material].flat(), ...handlers };
    meshObj.userData.part = part;
    // Labels, LEDs and other details sit in front of the clickable cap inside the same
    // group, so the whole group must count as the button (otherwise only the rim clicks).
    if (meshObj.parent && meshObj.parent !== this.group) meshObj.parent.userData.part = part;
    this.parts.push(meshObj);
    return meshObj;
  }
  report(res) {
    this.game.report(this, res);
  }
  onStrike() {
    if (!this.led) return;
    this.led.userData.set('red');
    setTimeout(() => this.led.userData.set(this.logic.solved ? 'green' : 'off'), 600);
  }
  onSolved() {
    this.led?.userData.set('green');
  }
  update() {}
}

// ───────────────────────── Timer ─────────────────────────
export class TimerView extends ModuleView {
  constructor(game) {
    super(game, null, { solved: true }, { led: false });
    this.text = '';
    this.strikes = -1;
    this.tex = TX.drawnTexture(1024, 400, () => {});
    const scr = screen(this.tex, 0.66, 0.26, { intensity: 1.6 });
    scr.position.set(0, -0.06, 0);
    this.group.add(scr);
    this.glow = glowSprite(0xff2a1a, 0.9);
    this.glow.position.set(0, -0.06, 0.08);
    this.glow.material.opacity = 0.12;
    this.group.add(this.glow);

    this.stex = TX.drawnTexture(512, 160, () => {});
    const sscr = screen(this.stex, 0.3, 0.095, { intensity: 1.5 });
    sscr.position.set(0, 0.215, 0);
    this.group.add(sscr);
    const lbl = printed(0.3, 0.04, 'STRIKES');
    lbl.position.set(0, 0.315, 0.0015);
    this.group.add(lbl);
    const brand = printed(0.5, 0.035, 'LOGIC BOMB  ·  MODEL K-117', { color: 'rgba(30,34,40,0.75)' });
    brand.position.set(0, -0.31, 0.0015);
    this.group.add(brand);
  }
  update() {
    const g = this.game;
    const text = formatTime(g.timeLeft);
    if (text !== this.text) {
      this.text = text;
      const [m, s] = text.split(':');
      const digits = (m.length < 2 ? ' ' + m : m) + s;
      TX.redraw(this.tex, (ctx, w, h) => {
        ctx.fillStyle = '#080303';
        ctx.fillRect(0, 0, w, h);
        const on = '#ff1c0c', off = 'rgba(255,30,20,0.075)';
        const dw = 170, dh = 300, y = 50;
        const xs = [80, 290, 560, 770];
        ctx.shadowColor = 'rgba(255,40,20,0.9)';
        ctx.shadowBlur = 18;
        for (let i = 0; i < 4; i++) {
          TX.draw7(ctx, '8', xs[i], y, dw, dh, off, off);
          TX.draw7(ctx, digits[i], xs[i], y, dw, dh, on, 'rgba(0,0,0,0)');
        }
        ctx.fillStyle = on;
        for (const cy of [y + dh * 0.32, y + dh * 0.7]) { ctx.beginPath(); ctx.arc(505, cy, 17, 0, Math.PI * 2); ctx.fill(); }
        ctx.shadowBlur = 0;
      });
    }
    if (g.strikes !== this.strikes) {
      this.strikes = g.strikes;
      const slots = Math.max(1, g.maxStrikes - 1);
      TX.redraw(this.stex, (ctx, w, h) => {
        ctx.fillStyle = '#070303';
        ctx.fillRect(0, 0, w, h);
        const cell = Math.min(110, (w - 40) / slots);
        for (let i = 0; i < slots; i++) {
          const cx = w / 2 + (i - (slots - 1) / 2) * cell, cy = h / 2, r = cell * 0.3;
          const lit = i < g.strikes;
          ctx.strokeStyle = lit ? '#ff2a1a' : 'rgba(255,40,30,0.09)';
          ctx.lineWidth = r * 0.42;
          ctx.lineCap = 'round';
          if (lit) { ctx.shadowColor = '#ff2a1a'; ctx.shadowBlur = 16; }
          ctx.beginPath();
          ctx.moveTo(cx - r, cy - r); ctx.lineTo(cx + r, cy + r);
          ctx.moveTo(cx + r, cy - r); ctx.lineTo(cx - r, cy + r);
          ctx.stroke();
          ctx.shadowBlur = 0;
        }
      });
    }
    this.glow.material.opacity = 0.1 + (this.game.blink ? 0.03 : 0);
  }
}

// ───────────────────────── Wires ─────────────────────────
function wireCurve(a, b, lift, wobble) {
  const mid = a.clone().lerp(b, 0.5);
  const pts = [
    a,
    a.clone().lerp(b, 0.08).add(new THREE.Vector3(0, 0, lift * 0.5)),
    a.clone().lerp(b, 0.3).add(new THREE.Vector3(wobble.x * 0.5, wobble.y, lift)),
    mid.clone().add(new THREE.Vector3(wobble.x, -wobble.y * 0.6, lift * 1.15)),
    a.clone().lerp(b, 0.7).add(new THREE.Vector3(-wobble.x * 0.5, wobble.y * 0.8, lift)),
    a.clone().lerp(b, 0.92).add(new THREE.Vector3(0, 0, lift * 0.5)),
    b,
  ];
  return new THREE.CatmullRomCurve3(pts);
}

// Builds a wire that can be cut. Returns { group, hit, cut() }.
function cuttableWire(curve, mat, radius, rng) {
  const group = new THREE.Group();
  const whole = mesh(new THREE.TubeGeometry(curve, 64, radius, 12, false), mat);
  const hit = new THREE.Mesh(new THREE.TubeGeometry(curve, 16, radius * 2.6, 6, false), invisible);
  group.add(whole, hit);
  const cut = () => {
    whole.visible = false;
    const pts = curve.getPoints(60);
    const gapA = 0.45, gapB = 0.55;
    const piece = (from, to, droop) => {
      const sel = pts.filter((_, i) => i / 60 >= from && i / 60 <= to).map((p) => p.clone());
      // the loose end springs away a little
      const n = sel.length;
      sel.forEach((p, i) => {
        const k = droop > 0 ? i / (n - 1) : 1 - i / (n - 1);
        p.z += Math.pow(k, 3) * 0.035;
        p.y += Math.pow(k, 3) * (rng() - 0.5) * 0.05;
      });
      const c = new THREE.CatmullRomCurve3(sel);
      const m = mesh(new THREE.TubeGeometry(c, 32, radius, 12, false), mat);
      group.add(m);
      // exposed copper strands at the cut end
      const end = droop > 0 ? sel[n - 1] : sel[0];
      const tan = c.getTangent(droop > 0 ? 1 : 0).multiplyScalar(droop > 0 ? 1 : -1);
      for (let s = 0; s < 5; s++) {
        const cu = mesh(new THREE.CylinderGeometry(radius * 0.18, radius * 0.18, radius * 1.6, 5), M.copper, { cast: false });
        cu.position.copy(end).add(tan.clone().multiplyScalar(radius * 0.7));
        cu.position.x += (rng() - 0.5) * radius * 0.9;
        cu.position.y += (rng() - 0.5) * radius * 0.9;
        cu.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tan.clone().add(new THREE.Vector3((rng() - 0.5) * 0.6, (rng() - 0.5) * 0.6, 0)).normalize());
        group.add(cu);
      }
    };
    piece(0, gapA, 1);
    piece(gapB, 1, -1);
  };
  return { group, hit, cut };
}

export class WiresView extends ModuleView {
  constructor(game, mod, logic) {
    super(game, mod, logic);
    const colors = mod.data.colors;
    const n = colors.length;
    const rng = mod.rng.fork('wirelook').next;
    // terminal blocks
    for (const sx of [-1, 1]) {
      const blk = mesh(roundedSlab(0.085, 0.66, 0.02, 0.05, 0.01), M.blackPlastic);
      blk.position.set(sx * 0.29, -0.04, 0.05);
      this.group.add(blk);
      for (const y of [0.25, -0.33]) { const sc = screw(0.7); sc.position.set(sx * 0.29, y, 0.05); this.group.add(sc); }
    }
    const top = 0.19, bot = -0.27;
    colors.forEach((c, i) => {
      const y = n === 1 ? 0 : top - (i * (top - bot)) / (n - 1);
      const a = new THREE.Vector3(-0.27, y, 0.055), b = new THREE.Vector3(0.27, y + (rng() - 0.5) * 0.02, 0.055);
      const curve = wireCurve(a, b, 0.03 + rng() * 0.03, new THREE.Vector2((rng() - 0.5) * 0.04, (rng() - 0.5) * 0.04));
      const mat = insulation(c);
      const w = cuttableWire(curve, mat, 0.0165, rng);
      this.group.add(w.group);
      // metal sockets
      for (const p of [a, b]) {
        const sock = mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.02, 14), M.steel, { cast: false });
        sock.rotation.z = Math.PI / 2;
        sock.position.copy(p).add(new THREE.Vector3(p.x < 0 ? 0.01 : -0.01, 0, 0));
        this.group.add(sock);
      }
      this.addPart(w.hit, {
        down: () => {
          if (logic.cut.has(i + 1) || logic.solved) return;
          w.cut();
          game.sfx('snip');
          this.report(logic.cutWire(i + 1));
        },
      }, [mat]);
    });
  }
}

// ───────────────────────── The Button ─────────────────────────
export class ButtonView extends ModuleView {
  constructor(game, mod, logic) {
    super(game, mod, logic);
    const { color, label } = mod.data;
    const cx = -0.07, cy = -0.03;
    // collar
    const collarShape = new THREE.Shape();
    collarShape.absarc(0, 0, 0.255, 0, Math.PI * 2);
    const hole = new THREE.Path();
    hole.absarc(0, 0, 0.215, 0, Math.PI * 2, true);
    collarShape.holes.push(hole);
    const collar = mesh(slab(collarShape, 0.05, 0.012, 3, 48), M.blackPlastic);
    collar.position.set(cx, cy, 0.05);
    this.group.add(collar);
    const well = mesh(new THREE.CylinderGeometry(0.216, 0.216, 0.01, 48), M.socket);
    well.rotation.x = Math.PI / 2;
    well.position.set(cx, cy, 0.006);
    this.group.add(well);
    // cap (lathe profile: flat top, rounded rim)
    const prof = [];
    prof.push(new THREE.Vector2(0, 0.085));
    prof.push(new THREE.Vector2(0.15, 0.085));
    for (let i = 0; i <= 10; i++) {
      const a = (i / 10) * Math.PI / 2;
      prof.push(new THREE.Vector2(0.15 + Math.sin(a) * 0.05, 0.035 + Math.cos(a) * 0.05));
    }
    prof.push(new THREE.Vector2(0.2, 0));
    prof.reverse(); // lathe profiles must run bottom → top so faces point outward
    const capMat = capPlastic(COLOR_HEX[color]);
    const cap = mesh(new THREE.LatheGeometry(prof, 64), capMat);
    cap.rotation.x = Math.PI / 2;
    const capGroup = new THREE.Group();
    capGroup.add(cap);
    const labelTex = TX.drawnTexture(512, 512, (ctx, w, h) => {
      const dark = color === 'white' || color === 'yellow';
      TX.fitText(ctx, label, w / 2, h / 2, w * 0.78, h * 0.5, { color: dark ? 'rgba(20,20,20,0.92)' : 'rgba(255,255,255,0.95)', size: 170, font: TX.FONT_SANS });
    });
    const lab = new THREE.Mesh(new THREE.CircleGeometry(0.15, 48), new THREE.MeshStandardMaterial({ map: labelTex, transparent: true, roughness: 0.4 }));
    lab.position.z = 0.0855;
    capGroup.add(lab);
    capGroup.position.set(cx, cy, 0.008);
    this.group.add(capGroup);
    // light strip
    const stripBody = mesh(roundedSlab(0.085, 0.56, 0.03, 0.05, 0.01), M.blackPlastic);
    stripBody.position.set(0.31, -0.04, 0.05);
    this.group.add(stripBody);
    this.stripMat = new THREE.MeshStandardMaterial({ color: 0x111316, emissive: 0x000000, roughness: 0.25 });
    const stripLight = mesh(roundedSlab(0.05, 0.5, 0.02, 0.01, 0.004), this.stripMat, { cast: false });
    stripLight.position.set(0.31, -0.04, 0.056);
    this.group.add(stripLight);
    this.stripGlow = glowSprite(0xffffff, 0.5);
    this.stripGlow.scale.set(0.3, 0.8, 1);
    this.stripGlow.position.set(0.31, -0.04, 0.09);
    this.group.add(this.stripGlow);
    this.cap = capGroup;

    let downAt = 0, holdTimer = null, holding = false;
    this.addPart(cap, {
      down: () => {
        if (logic.solved || downAt) return;
        downAt = performance.now();
        game.sfx('click');
        tween(0.08, (k) => { capGroup.position.z = 0.008 - 0.03 * k; });
        holdTimer = setTimeout(() => {
          holding = true;
          const strip = logic.startHold();
          this.setStrip(strip);
        }, TAP_MAX_MS);
      },
      up: () => {
        if (!downAt) return;
        clearTimeout(holdTimer);
        downAt = 0;
        const wasHold = holding;
        holding = false;
        tween(0.1, (k) => { capGroup.position.z = 0.008 - 0.03 * (1 - k); });
        game.sfx('click');
        this.setStrip(null);
        this.report(logic.release(wasHold, game.timerText()));
      },
    }, [capMat]);
  }
  setStrip(strip) {
    if (!strip) {
      this.stripMat.color.setHex(0x111316);
      this.stripMat.emissive.setHex(0x000000);
      this.stripGlow.material.opacity = 0;
      return;
    }
    this.stripMat.color.setHex(LIGHT_HEX[strip]);
    this.stripMat.emissive.setHex(LIGHT_HEX[strip]);
    this.stripMat.emissiveIntensity = 1.4;
    this.stripGlow.material.color.setHex(LIGHT_HEX[strip]);
    this.stripGlow.material.opacity = 0.55;
  }
}

// ───────────────────────── Set Keypad ─────────────────────────
function keycap(w, h, text, { base = 0xe9e2cf, textColor = 'rgba(25,25,25,0.92)', font = TX.FONT_MONO, size = 120 } = {}) {
  const g = new THREE.Group();
  const housing = mesh(roundedSlab(w + 0.03, h + 0.03, 0.03, 0.03, 0.008), M.blackPlastic);
  housing.position.z = 0.03;
  const mat = capPlastic(base, 0.45);
  const cap = mesh(roundedSlab(w, h, 0.022, 0.045, 0.012, 4), mat);
  cap.position.z = 0.06;
  const tex = TX.drawnTexture(512, Math.round(512 * h / w), (ctx, cw, ch) => {
    // slight inner shading for a molded look
    const grad = ctx.createLinearGradient(0, 0, 0, ch);
    grad.addColorStop(0, 'rgba(255,255,255,0.10)');
    grad.addColorStop(1, 'rgba(0,0,0,0.10)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, cw, ch);
    TX.fitText(ctx, text, cw / 2, ch / 2, cw * 0.86, ch * 0.7, { color: textColor, font, size });
  });
  const face = planeWith(tex, w - 0.02, h - 0.02, { rough: 0.5 });
  face.position.z = 0.0605;
  const capGroup = new THREE.Group();
  capGroup.add(cap, face);
  g.add(housing, capGroup);
  g.userData = { cap, capGroup, mat, tex, face };
  return g;
}

function miniLed(w = 0.05, h = 0.018) {
  const mat = new THREE.MeshStandardMaterial({ color: 0x14181a, emissive: 0x000000, roughness: 0.2 });
  const m = mesh(roundedSlab(w, h, 0.008, 0.008, 0.003), mat, { cast: false });
  m.userData.set = (c) => {
    const hex = { off: [0x14181a, 0], green: [0x1c6b2e, 0x2bff5a], red: [0x6b1c1c, 0xff2a2a], amber: [0x6b4a1c, 0xffb02a], white: [0x6b6b5c, 0xfff2c8] }[c];
    mat.color.setHex(hex[0]);
    mat.emissive.setHex(hex[1]);
    mat.emissiveIntensity = 1.8;
  };
  return m;
}

export class KeypadView extends ModuleView {
  constructor(game, mod, logic) {
    super(game, mod, logic);
    const pos = [[-0.165, 0.065], [0.165, 0.065], [-0.165, -0.225], [0.165, -0.225]];
    mod.data.keys.forEach((txt, i) => {
      const k = keycap(0.27, 0.2, txt, { font: TX.FONT_SANS, size: 300 });
      k.position.set(pos[i][0], pos[i][1], 0);
      this.group.add(k);
      const led = miniLed();
      led.position.set(0, 0.075, 0.106);
      k.userData.capGroup.add(led);
      led.userData.set('off');
      this.addPart(k.userData.cap, {
        down: () => {
          if (logic.solved) return;
          pressAnim(k.userData.capGroup, 0.018);
          game.sfx('click');
          const r = logic.press(i);
          if (r.correct) led.userData.set('green');
          if (r.strike) { led.userData.set('red'); setTimeout(() => led.userData.set(logic.done.has(i) ? 'green' : 'off'), 500); }
          this.report(r);
        },
      }, [k.userData.mat]);
    });
  }
}

// ───────────────────────── Simon Maps ─────────────────────────
export class SimonView extends ModuleView {
  constructor(game, mod, logic) {
    super(game, mod, logic);
    // diamond housing
    const housing = mesh(roundedSlab(0.5, 0.5, 0.05, 0.04, 0.012), M.blackPlastic);
    housing.rotation.z = Math.PI / 4;
    housing.position.set(-0.02, -0.04, 0.04);
    this.group.add(housing);
    const layout = { red: [0, 0.16], blue: [0.16, 0], green: [0, -0.16], yellow: [-0.16, 0] };
    this.lenses = {};
    for (const [c, [x, y]] of Object.entries(layout)) {
      const mat = new THREE.MeshPhysicalMaterial({
        color: COLOR_HEX[c], roughness: 0.18, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.1,
        emissive: LIGHT_HEX[c], emissiveIntensity: 0, transparent: false,
        normalMap: T.plastic.normalMap, normalScale: new THREE.Vector2(0.15, 0.15),
      });
      const lens = mesh(roundedSlab(0.19, 0.19, 0.03, 0.035, 0.012, 4), mat);
      lens.rotation.z = Math.PI / 4;
      const grp = new THREE.Group();
      grp.position.set(x - 0.02, y - 0.04, 0.075);
      grp.add(lens);
      const glow = glowSprite(LIGHT_HEX[c], 0.5);
      glow.position.z = 0.03;
      grp.add(glow);
      this.group.add(grp);
      this.lenses[c] = { mat, glow, grp };
      this.addPart(lens, {
        down: () => {
          if (logic.solved) return;
          pressAnim(grp, 0.015);
          this.light(c, 0.25);
          game.sfx('simon-' + c);
          this.pauseUntil = this.t + 3.2;
          const r = logic.press(c);
          if (r.advance) { this.pauseUntil = this.t + 1.0; this.cursor = 0; this.phase = 0; }
          this.report(r);
        },
      }, [mat]);
    }
    this.t = 0;
    this.pauseUntil = 1.5;
    this.cursor = 0;
    this.phase = 0;
    this.lit = {};
  }
  light(c, dur) {
    this.lit[c] = this.t + dur;
  }
  update(dt) {
    this.t += dt;
    if (!this.logic.solved && this.t > this.pauseUntil) {
      // play the sequence for the current stage, then wait
      const seq = this.mod.data.seq.slice(0, this.logic.stage);
      this.phase -= dt;
      if (this.phase <= 0) {
        if (this.cursor < seq.length) {
          this.light(seq[this.cursor], 0.38);
          this.game.sfx('simon-' + seq[this.cursor], 0.35);
          this.cursor++;
          this.phase = 0.62;
        } else {
          this.cursor = 0;
          this.phase = 0;
          this.pauseUntil = this.t + 2.6;
        }
      }
    }
    for (const [c, L] of Object.entries(this.lenses)) {
      const on = (this.lit[c] || 0) > this.t;
      const target = on ? 1 : 0;
      L.mat.emissiveIntensity += (target * 2.2 - L.mat.emissiveIntensity) * Math.min(1, dt * 25);
      L.glow.material.opacity = L.mat.emissiveIntensity * 0.32;
    }
  }
}

// ───────────────────────── Complex Wires ─────────────────────────
let stripeTex = null;
function stripes() {
  if (stripeTex) return stripeTex;
  stripeTex = TX.drawnTexture(256, 64, (ctx, w, h) => {
    ctx.fillStyle = '#c81e1e';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#1c55d0';
    for (let x = -h; x < w + h; x += 64) {
      ctx.beginPath();
      ctx.moveTo(x, 0); ctx.lineTo(x + 32, 0); ctx.lineTo(x + 32 + h, h); ctx.lineTo(x + h, h);
      ctx.fill();
    }
  });
  stripeTex.wrapS = stripeTex.wrapT = THREE.RepeatWrapping;
  stripeTex.repeat.set(10, 1);
  return stripeTex;
}

export class CwiresView extends ModuleView {
  constructor(game, mod, logic) {
    super(game, mod, logic);
    const wires = mod.data.wires;
    const n = wires.length;
    const rng = mod.rng.fork('vennlook').next;
    const topBar = mesh(roundedSlab(0.66, 0.085, 0.03, 0.05, 0.01), M.blackPlastic);
    topBar.position.set(-0.04, 0.23, 0.05);
    const botBar = mesh(roundedSlab(0.66, 0.11, 0.03, 0.05, 0.01), M.blackPlastic);
    botBar.position.set(-0.04, -0.3, 0.05);
    this.group.add(topBar, botBar);
    const span = 0.54;
    wires.forEach((w, i) => {
      const x = -0.04 - span / 2 + (i + 0.5) * (span / n);
      // LED
      const ledMat = new THREE.MeshPhysicalMaterial({ color: w.led ? 0xfff0b0 : 0x2a2a26, emissive: w.led ? 0xffe08a : 0x000000, emissiveIntensity: 2.2, roughness: 0.15, clearcoat: 1 });
      const led = mesh(G.ledLens, ledMat, { cast: false });
      led.rotation.x = Math.PI / 2;
      led.scale.set(0.9, 0.7, 0.9);
      led.position.set(x, 0.23, 0.052);
      this.group.add(led);
      if (w.led) {
        const gl = glowSprite(0xffd47a, 0.22);
        gl.material.opacity = 0.7;
        gl.position.set(x, 0.23, 0.08);
        this.group.add(gl);
      }
      // star panel
      const pTex = TX.drawnTexture(128, 160, (ctx, cw, ch) => {
        ctx.fillStyle = '#ece6d4';
        ctx.fillRect(0, 0, cw, ch);
        ctx.strokeStyle = 'rgba(0,0,0,0.25)';
        ctx.lineWidth = 6;
        ctx.strokeRect(3, 3, cw - 6, ch - 6);
        if (w.star) TX.fitText(ctx, '★', cw / 2, ch / 2 + 4, cw * 0.8, ch * 0.8, { color: '#151515', size: 110, font: TX.FONT_SANS });
      });
      const panel = planeWith(pTex, (span / n) * 0.72, 0.08, { rough: 0.7, transparent: false });
      panel.position.set(x, -0.3, 0.0505);
      this.group.add(panel);
      // wire
      const a = new THREE.Vector3(x, 0.185, 0.055), b = new THREE.Vector3(x + (rng() - 0.5) * 0.02, -0.245, 0.055);
      const curve = wireCurve(a, b, 0.035 + rng() * 0.03, new THREE.Vector2((rng() - 0.5) * 0.05, 0));
      let mat;
      if (w.red && w.blue) {
        mat = new THREE.MeshPhysicalMaterial({ map: stripes(), roughness: 0.36, clearcoat: 0.55, clearcoatRoughness: 0.35, normalMap: T.plastic.normalMap, normalScale: new THREE.Vector2(0.3, 0.3) });
      } else mat = insulation(w.red ? 'red' : w.blue ? 'blue' : 'white');
      const cw = cuttableWire(curve, mat, 0.015, rng);
      this.group.add(cw.group);
      for (const p of [a, b]) {
        const sock = mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.02, 14), M.steel, { cast: false });
        sock.position.copy(p).add(new THREE.Vector3(0, p.y > 0 ? -0.008 : 0.008, 0));
        this.group.add(sock);
      }
      this.addPart(cw.hit, {
        down: () => {
          if (logic.cut.has(i + 1) || logic.solved) return;
          cw.cut();
          game.sfx('snip');
          this.report(logic.cutWire(i + 1));
        },
      }, [mat]);
    });
  }
}

function roundButton(colorName, r = 0.062) {
  const prof = [new THREE.Vector2(0, 0.04)];
  for (let i = 0; i <= 10; i++) {
    const a = (i / 10) * Math.PI / 2;
    prof.push(new THREE.Vector2(Math.sin(a) * r, 0.04 * Math.cos(a) * 0.5 + 0.02));
  }
  prof.push(new THREE.Vector2(r, 0));
  prof.reverse();
  const mat = capPlastic(COLOR_HEX[colorName], 0.25);
  const cap = mesh(new THREE.LatheGeometry(prof, 40), mat);
  cap.rotation.x = Math.PI / 2;
  const ring = mesh(new THREE.TorusGeometry(r + 0.008, 0.012, 10, 40), M.blackPlastic);
  ring.position.z = 0.006;
  const g = new THREE.Group();
  const capGroup = new THREE.Group();
  capGroup.add(cap);
  capGroup.position.z = 0.004;
  g.add(ring, capGroup);
  g.userData = { cap, capGroup, mat };
  return g;
}

function arrowButton(up) {
  const g = new THREE.Group();
  const housing = mesh(roundedSlab(0.1, 0.07, 0.02, 0.025, 0.006), M.blackPlastic);
  housing.position.z = 0.025;
  const mat = capPlastic(0xd9d4c6, 0.4);
  const tri = new THREE.Shape();
  const s = 0.026;
  if (up) { tri.moveTo(-s * 1.3, -s * 0.6); tri.lineTo(s * 1.3, -s * 0.6); tri.lineTo(0, s * 0.8); }
  else { tri.moveTo(-s * 1.3, s * 0.6); tri.lineTo(0, -s * 0.8); tri.lineTo(s * 1.3, s * 0.6); }
  tri.closePath();
  const capGroup = new THREE.Group();
  const cap = mesh(slab(tri, 0.025, 0.006, 2), mat);
  cap.position.z = 0.05;
  const hit = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.07), invisible);
  hit.position.z = 0.052;
  capGroup.add(cap, hit);
  g.add(housing, capGroup);
  g.userData = { hit, capGroup, mat };
  return g;
}

// ───────────────────────── Blank cover for unused bays ─────────────────────────
export class EmptyView extends ModuleView {
  constructor(game) {
    super(game, null, { solved: true }, { led: false });
    // vent slots stamped into a darker inset plate
    const inset = mesh(roundedSlab(0.6, 0.5, 0.04, 0.012, 0.004), M.dark);
    inset.position.z = 0.012;
    this.group.add(inset);
    for (let i = 0; i < 7; i++) {
      const slot = mesh(roundedSlab(0.045, 0.36, 0.022, 0.008, 0.003), M.bayFloor, { cast: false });
      slot.position.set(-0.24 + i * 0.08, 0, 0.0135);
      this.group.add(slot);
    }
  }
}



const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Small helpers shared by the classic views.
function stageLeds(view, n, x, yTop, gap) {
  return Array.from({ length: n }, (_, i) => {
    const l = miniLed(0.035, 0.035);
    l.position.set(x, yTop - i * gap, 0.005);
    view.group.add(l);
    l.userData.set('off');
    return l;
  });
}
function lcdText(tex, text, { bg = '#04101c', color = '#cfe8ff', glow = 'rgba(120,190,255,0.8)', size = 130, font = TX.FONT_MONO } = {}) {
  TX.redraw(tex, (ctx, w, h) => {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    if (text) TX.fitText(ctx, text, w / 2, h / 2 + 3, w * 0.88, h * 0.72, { color, size, font, shadow: { color: glow, blur: 14 } });
  });
}
function countdown(tex, text) {
  TX.redraw(tex, (ctx, w, h) => {
    ctx.fillStyle = '#080303';
    ctx.fillRect(0, 0, w, h);
    ctx.shadowColor = 'rgba(255,40,20,0.9)';
    ctx.shadowBlur = 12;
    for (let i = 0; i < 2; i++) {
      TX.draw7(ctx, '8', 38 + i * 100, 22, 75, 116, 'rgba(255,40,30,0.07)', 'rgba(255,40,30,0.07)');
      TX.draw7(ctx, text[i], 38 + i * 100, 22, 75, 116, '#ff2a1a', 'rgba(0,0,0,0)');
    }
    ctx.shadowBlur = 0;
  });
}
function sideArrow(dir) {
  // arrowButton points up/down; rotate it for left/right
  const b = arrowButton(dir === 'n' || dir === 'e' || dir === 'w' ? true : false);
  if (dir === 'w') b.rotation.z = Math.PI / 2;
  if (dir === 'e') b.rotation.z = -Math.PI / 2;
  return b;
}

// ───────────────────────── Word Board ─────────────────────────
export class WordsView extends ModuleView {
  constructor(game, mod, logic) {
    super(game, mod, logic);
    this.dispTex = TX.drawnTexture(1024, 256, () => {});
    const scr = screen(this.dispTex, 0.5, 0.14, { intensity: 1.6 });
    scr.position.set(-0.07, 0.235, 0);
    this.group.add(scr);
    this.keys = [];
    const xs = [-0.185, 0.115], ys = [0.03, -0.11, -0.25];
    for (let i = 0; i < 6; i++) {
      const k = keycap(0.25, 0.095, '', { base: 0xe6e1d4, size: 110 });
      k.position.set(xs[i % 2], ys[Math.floor(i / 2)], 0);
      this.group.add(k);
      this.keys.push(k);
      this.addPart(k.userData.cap, {
        down: () => {
          if (logic.solved) return;
          pressAnim(k.userData.capGroup, 0.015);
          game.sfx('click');
          const r = logic.press(i);
          this.report(r);
          if (r.advance || r.solved) this.refresh();
        },
      }, [k.userData.mat]);
    }
    this.leds = stageLeds(this, 3, 0.345, 0.0, 0.12);
    this.refresh();
  }
  refresh() {
    const L = this.logic, st = L.current();
    lcdText(this.dispTex, L.solved ? '' : st.display);
    this.keys.forEach((k, i) => TX.redraw(k.userData.tex, (ctx, cw, ch) => {
      TX.fitText(ctx, L.solved ? '' : st.buttons[i], cw / 2, ch / 2, cw * 0.86, ch * 0.7, { color: 'rgba(25,25,25,0.92)', size: 120, font: TX.FONT_MONO });
    }));
    this.leds.forEach((l, i) => l.userData.set(i < L.stage ? 'green' : 'off'));
  }
  async auto(tap) {
    for (let s = 0; s < 3; s++) { const st = this.logic.current(); await tap(this.parts[solveWords(st.display, st.buttons)]); }
  }
}

// ───────────────────────── Memory ─────────────────────────
export class MemoryView extends ModuleView {
  constructor(game, mod, logic) {
    super(game, mod, logic);
    this.dispTex = TX.drawnTexture(512, 300, () => {});
    const scr = screen(this.dispTex, 0.36, 0.22, { intensity: 1.5 });
    scr.position.set(-0.06, 0.16, 0);
    this.group.add(scr);
    this.keys = [];
    for (let i = 0; i < 4; i++) {
      const k = keycap(0.12, 0.19, '', { base: 0xe6e1d4, size: 150 });
      k.position.set(-0.27 + i * 0.145, -0.17, 0);
      this.group.add(k);
      this.keys.push(k);
      this.addPart(k.userData.cap, {
        down: () => {
          if (logic.solved) return;
          pressAnim(k.userData.capGroup, 0.018);
          game.sfx('click');
          this.report(logic.press(i));
          this.refresh();
        },
      }, [k.userData.mat]);
    }
    this.leds = stageLeds(this, 5, 0.345, 0.17, 0.11);
    this.refresh();
  }
  refresh() {
    const L = this.logic;
    TX.redraw(this.dispTex, (ctx, w, h) => {
      ctx.fillStyle = '#04120a';
      ctx.fillRect(0, 0, w, h);
      if (L.solved) return;
      ctx.shadowColor = 'rgba(90,255,130,0.9)';
      ctx.shadowBlur = 14;
      TX.draw7(ctx, '8', w / 2 - 55, 40, 110, 220, 'rgba(90,255,130,0.06)', 'rgba(90,255,130,0.06)');
      TX.draw7(ctx, String(L.st.display), w / 2 - 55, 40, 110, 220, '#7dff9c', 'rgba(0,0,0,0)');
      ctx.shadowBlur = 0;
    });
    this.keys.forEach((k, i) => TX.redraw(k.userData.tex, (ctx, cw, ch) => {
      TX.fitText(ctx, L.solved ? '' : String(L.st.labels[i]), cw / 2, ch / 2, cw * 0.7, ch * 0.6, { color: 'rgba(25,25,25,0.92)', size: 200, font: TX.FONT_MONO });
    }));
    this.leds.forEach((l, i) => l.userData.set(i < (L.solved ? 5 : L.stageIdx) ? 'green' : 'off'));
  }
  async auto(tap) { for (let s = 0; s < 5 && !this.logic.solved; s++) await tap(this.parts[this.logic.answer()]); }
}

// ───────────────────────── Morse Code ─────────────────────────
export class MorseView extends ModuleView {
  constructor(game, mod, logic) {
    super(game, mod, logic);
    // the lamp
    const bezel = mesh(new THREE.TorusGeometry(0.06, 0.016, 12, 36), M.steel);
    bezel.position.set(-0.2, 0.22, 0.01);
    this.lampMat = new THREE.MeshPhysicalMaterial({ color: 0x5a4320, emissive: 0xffb340, emissiveIntensity: 0, roughness: 0.15, clearcoat: 1 });
    const lamp = mesh(new THREE.SphereGeometry(0.058, 28, 16, 0, Math.PI * 2, 0, Math.PI / 2), this.lampMat);
    lamp.rotation.x = Math.PI / 2;
    lamp.scale.set(1, 0.6, 1);
    lamp.position.set(-0.2, 0.22, 0.008);
    this.glow = glowSprite(0xffb340, 0.45);
    this.glow.position.set(-0.2, 0.22, 0.07);
    this.group.add(bezel, lamp, this.glow);
    const lbl = printed(0.2, 0.035, 'SIGNAL');
    lbl.position.set(0.02, 0.22, 0.0015);
    this.group.add(lbl);
    // frequency display + arrows + TX
    this.fTex = TX.drawnTexture(768, 200, () => {});
    const scr = screen(this.fTex, 0.38, 0.1, { intensity: 1.6 });
    scr.position.set(-0.04, 0.02, 0);
    this.group.add(scr);
    [['w', -1, -0.3], ['e', 1, 0.22]].forEach(([d, step, x]) => {
      const b = sideArrow(d);
      b.position.set(x, 0.02, 0);
      this.group.add(b);
      this.addPart(b.userData.hit, {
        down: () => { if (logic.solved) return; pressAnim(b.userData.capGroup, 0.01); game.sfx('tick2'); logic.step(step); this.refresh(); },
      }, [b.userData.mat]);
    });
    const tx = keycap(0.22, 0.1, 'TX', { base: 0xd8d2c2, font: TX.FONT_SANS, size: 120 });
    tx.position.set(-0.04, -0.22, 0);
    this.group.add(tx);
    this.addPart(tx.userData.cap, {
      down: () => { if (logic.solved) return; pressAnim(tx.userData.capGroup, 0.016); game.sfx('click'); this.report(logic.transmit()); },
    }, [tx.userData.mat]);
    // flash schedule: [on?, seconds]
    const U = 0.26;
    const word = MORSE_WORDS[mod.data.word][0];
    this.sched = [];
    [...word].forEach((ch, li) => {
      [...MORSE[ch]].forEach((sym, si) => {
        this.sched.push([true, sym === '.' ? U : U * 3]);
        if (si < MORSE[ch].length - 1) this.sched.push([false, U]);
      });
      this.sched.push([false, li < word.length - 1 ? U * 3 : U * 10]);
    });
    this.t = 0;
    this.period = this.sched.reduce((n, s) => n + s[1], 0);
    this.refresh();
  }
  refresh() { lcdText(this.fTex, `${MORSE_WORDS[this.logic.freq][1]} MHz`, { bg: '#100a02', color: '#ffb84a', glow: 'rgba(255,170,60,0.9)' }); }
  update(dt) {
    this.t = (this.t + dt) % this.period;
    let acc = 0, on = false;
    for (const [s, d] of this.sched) { if (this.t < acc + d) { on = s; break; } acc += d; }
    if (this.logic.solved) on = false;
    this.lampMat.emissiveIntensity += ((on ? 2.6 : 0) - this.lampMat.emissiveIntensity) * Math.min(1, dt * 30);
    this.glow.material.opacity = this.lampMat.emissiveIntensity * 0.3;
  }
  async auto(tap) {
    const L = this.logic;
    while (L.freq !== this.mod.data.word) await tap(this.parts[L.freq < this.mod.data.word ? 1 : 0]);
    await tap(this.parts[2]);
  }
}

// ───────────────────────── Wire Sequence ─────────────────────────
const SEQ_HEX = { red: 0xc81e1e, blue: 0x1c55d0, black: 0x151515 };
export class SequenceView extends ModuleView {
  constructor(game, mod, logic) {
    super(game, mod, logic);
    this.rows = [0.17, 0.03, -0.11];
    for (const [x, labels] of [[-0.25, ['1', '2', '3']], [0.13, ['A', 'B', 'C']]]) {
      const bar = mesh(roundedSlab(0.075, 0.42, 0.02, 0.04, 0.008), M.blackPlastic);
      bar.position.set(x, 0.03, 0.04);
      this.group.add(bar);
      labels.forEach((t, i) => {
        const l = printed(0.06, 0.06, t, { color: 'rgba(12,14,16,1)', size: 400 });
        l.position.set(x + (x < 0 ? -0.07 : 0.07), this.rows[i], 0.0015);
        this.group.add(l);
      });
    }
    this.wireGroup = new THREE.Group();
    this.group.add(this.wireGroup);
    const next = keycap(0.22, 0.085, 'NEXT ▼', { base: 0xd8d2c2, font: TX.FONT_SANS, size: 100 });
    next.position.set(-0.06, -0.29, 0);
    this.group.add(next);
    this.nextPart = this.addPart(next.userData.cap, {
      down: () => {
        if (logic.solved) return;
        pressAnim(next.userData.capGroup, 0.016);
        game.sfx('click');
        const r = logic.next();
        this.report(r);
        if (r.advance || r.solved) this.build();
      },
    }, [next.userData.mat]);
    this.leds = stageLeds(this, 4, 0.345, 0.16, 0.1);
    this.build();
  }
  build() {
    const L = this.logic;
    for (const o of [...this.wireGroup.children]) { this.wireGroup.remove(o); o.traverse((x) => x.geometry?.dispose()); }
    this.parts = this.parts.filter((p) => p === this.nextPart);
    this.wireParts = [];
    this.leds.forEach((l, i) => l.userData.set(i < L.panel || L.solved ? 'green' : 'off'));
    if (L.solved) return;
    const rng = this.mod.rng.fork('seq' + L.panel).next;
    L.data.panels[L.panel].forEach((w, j) => {
      const a = new THREE.Vector3(-0.235, this.rows[w.from - 1], 0.05);
      const b = new THREE.Vector3(0.115, this.rows['ABC'.indexOf(w.to)], 0.05);
      const curve = wireCurve(a, b, 0.03 + rng() * 0.02, new THREE.Vector2(0, (rng() - 0.5) * 0.03));
      const mat = new THREE.MeshPhysicalMaterial({ color: SEQ_HEX[w.color], roughness: 0.4, clearcoat: 0.5, normalMap: T.plastic.normalMap, normalScale: new THREE.Vector2(0.3, 0.3) });
      const cw = cuttableWire(curve, mat, 0.014, rng);
      this.wireGroup.add(cw.group);
      const part = this.addPart(cw.hit, {
        down: () => {
          if (L.solved || L.cut.has(L.panel + ':' + j)) return;
          cw.cut();
          this.game.sfx('snip');
          this.report(L.cutWire(j));
        },
      }, [mat]);
      this.wireParts.push(part);
    });
  }
  async auto(tap) {
    const L = this.logic;
    for (let p = 0; p < 4; p++) {
      for (let j = 0; j < L.cuts[L.panel].length; j++) if (L.cuts[L.panel][j]) await tap(this.wireParts[j]);
      await tap(this.nextPart);
    }
  }
}

// ───────────────────────── Maze ─────────────────────────
export class MazeView extends ModuleView {
  constructor(game, mod, logic) {
    super(game, mod, logic);
    this.tex = TX.drawnTexture(480, 480, () => {});
    const scr = screen(this.tex, 0.42, 0.42, { intensity: 1.4 });
    scr.position.set(-0.05, 0.02, 0);
    this.group.add(scr);
    this.dirParts = {};
    for (const [d, x, y] of [['n', -0.05, 0.31], ['s', -0.05, -0.27], ['w', -0.33, 0.02], ['e', 0.23, 0.02]]) {
      const b = sideArrow(d);
      b.position.set(x, y, 0);
      this.group.add(b);
      this.dirParts[d] = this.addPart(b.userData.hit, {
        down: () => {
          if (logic.solved) return;
          pressAnim(b.userData.capGroup, 0.01);
          game.sfx('tick2');
          this.report(logic.move(d));
          this.refresh();
        },
      }, [b.userData.mat]);
    }
    this.refresh();
  }
  refresh() {
    const L = this.logic, m = L.m;
    TX.redraw(this.tex, (ctx, w, h) => {
      ctx.fillStyle = '#05080c';
      ctx.fillRect(0, 0, w, h);
      const cell = w / 6, cx = (c) => c * cell + cell / 2, cy = (r) => r * cell + cell / 2;
      for (let r = 0; r < 6; r++) for (let c = 0; c < 6; c++) {
        ctx.fillStyle = 'rgba(140,170,200,0.35)';
        ctx.beginPath(); ctx.arc(cx(c), cy(r), 5, 0, 7); ctx.fill();
      }
      ctx.strokeStyle = '#3dff7a';
      ctx.lineWidth = 6;
      ctx.shadowColor = '#3dff7a';
      ctx.shadowBlur = 10;
      for (const [r, c] of m.markers) { ctx.beginPath(); ctx.arc(cx(c), cy(r), cell * 0.32, 0, 7); ctx.stroke(); }
      const [gr, gc] = L.data.goal;
      ctx.fillStyle = '#ff3b2a';
      ctx.shadowColor = '#ff3b2a';
      ctx.beginPath();
      ctx.moveTo(cx(gc), cy(gr) - cell * 0.25); ctx.lineTo(cx(gc) + cell * 0.24, cy(gr) + cell * 0.2); ctx.lineTo(cx(gc) - cell * 0.24, cy(gr) + cell * 0.2);
      ctx.closePath(); ctx.fill();
      if (!L.solved) {
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = '#ffffff';
        const [pr, pc] = L.pos;
        ctx.fillRect(cx(pc) - cell * 0.15, cy(pr) - cell * 0.15, cell * 0.3, cell * 0.3);
      }
      ctx.shadowBlur = 0;
    });
  }
  async auto(tap) {
    for (const d of mazePath(this.logic.m, this.logic.pos, this.mod.data.goal)) await tap(this.dirParts[d]);
  }
}

// ───────────────────────── Password ─────────────────────────
export class PasswordView extends ModuleView {
  constructor(game, mod, logic) {
    super(game, mod, logic);
    this.cells = [];
    this.upParts = [];
    for (let i = 0; i < 5; i++) {
      const x = -0.29 + i * 0.12;
      const tex = TX.drawnTexture(160, 200, () => {});
      const cell = screen(tex, 0.085, 0.11, { intensity: 1.5, depth: 0.025, bezel: 0.013 });
      cell.position.set(x, 0.04, 0);
      this.group.add(cell);
      this.cells.push(tex);
      for (const up of [true, false]) {
        const b = arrowButton(up);
        b.scale.set(0.9, 0.9, 1);
        b.position.set(x, up ? 0.16 : -0.08, 0);
        this.group.add(b);
        const part = this.addPart(b.userData.hit, {
          down: () => { if (logic.solved) return; pressAnim(b.userData.capGroup, 0.01); game.sfx('tick2'); logic.step(i, up ? 1 : -1); this.refresh(); },
        }, [b.userData.mat]);
        if (up) this.upParts.push(part);
      }
    }
    const sub = keycap(0.3, 0.085, 'SUBMIT', { base: 0xd8d2c2, font: TX.FONT_SANS, size: 100 });
    sub.position.set(-0.05, -0.27, 0);
    this.group.add(sub);
    this.submitPart = this.addPart(sub.userData.cap, {
      down: () => { if (logic.solved) return; pressAnim(sub.userData.capGroup, 0.016); game.sfx('click'); this.report(logic.submit()); },
    }, [sub.userData.mat]);
    this.refresh();
  }
  refresh() {
    this.cells.forEach((tex, i) => lcdText(tex, this.logic.letter(i), { bg: '#04120a', color: '#7dff9c', glow: 'rgba(90,255,130,0.9)', size: 150 }));
  }
  async auto(tap) {
    const L = this.logic;
    for (let c = 0; c < 5; c++) while (L.letter(c) !== this.mod.data.word[c]) await tap(this.upParts[c]);
    await tap(this.submitPart);
  }
}

// ───────────────────────── Needy: Venting ─────────────────────────
export class VentView extends ModuleView {
  constructor(game, mod, logic) {
    super(game, mod, logic, { led: false });
    this.ctex = TX.drawnTexture(256, 160, () => {});
    const cscr = screen(this.ctex, 0.15, 0.085, { intensity: 1.6, bezel: 0.02 });
    cscr.position.set(0, 0.32, 0);
    this.group.add(cscr);
    this.stex = TX.drawnTexture(1024, 400, () => {});
    const scr = screen(this.stex, 0.66, 0.26, { intensity: 1.5 });
    scr.position.set(0, 0.07, 0);
    this.group.add(scr);
    this.yn = {};
    [['Y', true, -0.14], ['N', false, 0.14]].forEach(([t, v, x]) => {
      const k = keycap(0.17, 0.1, t, { base: 0xe9e4d6, font: TX.FONT_SANS, size: 150 });
      k.position.set(x, -0.26, 0);
      this.group.add(k);
      this.yn[t] = this.addPart(k.userData.cap, {
        down: () => { pressAnim(k.userData.capGroup, 0.016); game.sfx('click'); if (logic.active) this.report(logic.answer(v)); },
      }, [k.userData.mat]);
    });
    this.last = '';
  }
  update() {
    const L = this.logic;
    const key = (L.q ? L.q[0] : '') + '|' + (L.active ? Math.ceil(L.remaining) : '');
    if (key === this.last) return;
    this.last = key;
    countdown(this.ctex, L.active ? String(Math.max(0, Math.ceil(L.remaining))).padStart(2, '0') : '  ');
    lcdText(this.stex, L.q ? L.q[0] : '', { size: 110 });
  }
  async auto(tap) { if (this.logic.active) await tap(this.yn[this.logic.q[1] ? 'Y' : 'N']); }
}

// ───────────────────────── Needy: Capacitor ─────────────────────────
export class CapacitorView extends ModuleView {
  constructor(game, mod, logic) {
    super(game, mod, logic, { led: false });
    this.ctex = TX.drawnTexture(256, 160, () => {});
    const cscr = screen(this.ctex, 0.15, 0.085, { intensity: 1.6, bezel: 0.02 });
    cscr.position.set(-0.16, 0.3, 0);
    this.group.add(cscr);
    // charge meter
    const meterBack = mesh(roundedSlab(0.1, 0.5, 0.02, 0.03, 0.008), M.blackPlastic);
    meterBack.position.set(-0.25, -0.06, 0.03);
    this.meterMat = new THREE.MeshStandardMaterial({ color: 0x220a04, emissive: 0xff5a1a, emissiveIntensity: 1.4 });
    this.meter = mesh(new THREE.BoxGeometry(0.06, 0.46, 0.004), this.meterMat, { cast: false });
    this.meter.position.set(-0.25, -0.06, 0.032);
    this.group.add(meterBack, this.meter);
    // lever
    const slot = mesh(roundedSlab(0.08, 0.46, 0.03, 0.02, 0.006), M.bayFloor, { cast: false });
    slot.position.set(0.08, -0.05, 0.02);
    this.group.add(slot);
    this.lever = new THREE.Group();
    const arm = mesh(new THREE.BoxGeometry(0.035, 0.035, 0.16), M.steel);
    arm.position.z = 0.08;
    const gripMat = capPlastic(0x1a1a1a, 0.5);
    const grip = mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.2, 24), gripMat);
    grip.rotation.z = Math.PI / 2;
    grip.position.z = 0.17;
    this.lever.add(arm, grip);
    this.lever.position.set(0.08, 0.12, 0.02);
    this.group.add(this.lever);
    const lbl = printed(0.24, 0.035, 'DISCHARGE');
    lbl.position.set(0.08, -0.33, 0.0015);
    this.group.add(lbl);
    this.part = this.addPart(grip, {
      down: () => { logic.hold(true); game.sfx('click'); },
      up: () => { logic.hold(false); },
    }, [gripMat]);
    this.last = '';
  }
  update() {
    const L = this.logic;
    const ty = L.holding ? -0.2 : 0.12;
    this.lever.position.y += (ty - this.lever.position.y) * 0.25;
    const frac = L.active ? L.charge / CAPACITOR_SECONDS : 0;
    this.meter.scale.y = Math.max(0.001, frac);
    this.meter.position.y = -0.06 - 0.23 * (1 - frac);
    const txt = L.active ? String(Math.max(0, Math.ceil(L.remaining))).padStart(2, '0') : '  ';
    if (txt !== this.last) { this.last = txt; countdown(this.ctex, txt); }
  }
  async auto() { this.logic.hold(true); await wait(300); this.logic.hold(false); }
}

// ───────────────────────── Needy: Knob ─────────────────────────
export class KnobView extends ModuleView {
  constructor(game, mod, logic) {
    super(game, mod, logic, { led: false });
    this.ctex = TX.drawnTexture(256, 160, () => {});
    const cscr = screen(this.ctex, 0.15, 0.085, { intensity: 1.6, bezel: 0.02 });
    cscr.position.set(0, 0.33, 0);
    this.group.add(cscr);
    this.ledMats = [];
    for (let r = 0; r < 2; r++) for (let c = 0; c < 6; c++) {
      const mat = new THREE.MeshPhysicalMaterial({ color: 0x24261f, emissive: 0x000000, emissiveIntensity: 2.2, roughness: 0.15, clearcoat: 1 });
      const led = mesh(G.ledLens, mat, { cast: false });
      led.rotation.x = Math.PI / 2;
      led.scale.set(0.8, 0.6, 0.8);
      led.position.set(-0.27 + c * 0.108, 0.22 - r * 0.075, 0.004);
      this.group.add(led);
      this.ledMats.push(mat);
    }
    const up = printed(0.08, 0.035, 'UP');
    up.position.set(0, 0.06, 0.0015);
    this.group.add(up);
    const base = mesh(new THREE.CylinderGeometry(0.15, 0.16, 0.02, 48), M.blackPlastic);
    base.rotation.x = Math.PI / 2;
    base.position.set(0, -0.15, 0.01);
    this.group.add(base);
    this.knob = new THREE.Group();
    const knobMat = capPlastic(0x2a2d31, 0.45);
    const body = mesh(new THREE.CylinderGeometry(0.11, 0.12, 0.07, 40), knobMat);
    body.rotation.x = Math.PI / 2;
    body.position.z = 0.035;
    const ptr = mesh(new THREE.BoxGeometry(0.02, 0.09, 0.012), M.steel);
    ptr.position.set(0, 0.06, 0.072);
    this.knob.add(body, ptr);
    this.knob.position.set(0, -0.15, 0.02);
    this.group.add(this.knob);
    this.part = this.addPart(body, {
      down: () => { logic.rotate(); game.sfx('tick2'); },
    }, [knobMat]);
    this.last = '';
  }
  update() {
    const L = this.logic;
    const target = -L.turn * Math.PI / 2;
    let d = target - this.knob.rotation.z;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.knob.rotation.z += d * 0.3;
    const key = (L.pattern ? L.pattern.join('') : '') + '|' + (L.active ? Math.ceil(L.remaining) : '');
    if (key === this.last) return;
    this.last = key;
    const bits = L.pattern ? L.pattern.join('') : '000000000000';
    this.ledMats.forEach((m, i) => { const on = bits[i] === '1'; m.color.setHex(on ? 0xd8ffb0 : 0x24261f); m.emissive.setHex(on ? 0x9dff6a : 0); });
    countdown(this.ctex, L.active ? String(Math.max(0, Math.ceil(L.remaining))).padStart(2, '0') : '  ');
  }
  async auto(tap) {
    const L = this.logic;
    if (!L.active) return;
    while (KNOB_POSITIONS[L.turn] !== L.target) await tap(this.part);
  }
}

// ───────────────────────── Auto-solvers for the reused views ─────────────────────────
WiresView.prototype.auto = async function (tap) { await tap(this.parts[this.logic.solution.cut - 1]); };
CwiresView.prototype.auto = async function (tap) { for (const k of this.logic.K) await tap(this.parts[k - 1]); };
KeypadView.prototype.auto = async function (tap) { for (const k of this.logic.order) await tap(this.parts[k]); };
SimonView.prototype.auto = async function (tap) {
  const L = this.logic, idx = { red: 0, blue: 1, green: 2, yellow: 3 };
  for (let s = L.stage; s <= this.mod.data.seq.length; s++) for (let j = 0; j < s; j++) await tap(this.parts[idx[L.map()[this.mod.data.seq[j]]]]);
};
ButtonView.prototype.auto = async function (tap) {
  const L = this.logic, P = this.parts[0].userData.part;
  if (L.solution.action === 'TAP') return tap(this.parts[0]);
  P.down();
  await wait(800);
  const d = String(RELEASE_DIGIT[L.strip]);
  for (let i = 0; i < 400 && !this.game.timerText().includes(d); i++) await wait(50);
  P.up();
};

export const VIEW_TYPES = {
  wires: WiresView, button: ButtonView, keypad: KeypadView, simon: SimonView, words: WordsView, memory: MemoryView,
  morse: MorseView, cwires: CwiresView, sequence: SequenceView, maze: MazeView, password: PasswordView,
  vent: VentView, capacitor: CapacitorView, knob: KnobView,
};
