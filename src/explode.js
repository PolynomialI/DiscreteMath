// The explosion: the casing and modules fly apart as debris, with a fireball, sparks,
// smoke and a shockwave. Everything lives in one group so it can be disposed with the bomb.
import * as THREE from 'three';
import * as TX from './tex.js';

let fireTex = null, smokeTex = null, sparkTex = null;
function textures() {
  if (fireTex) return;
  fireTex = TX.drawnTexture(256, 256, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(255,255,240,1)');
    g.addColorStop(0.18, 'rgba(255,230,140,1)');
    g.addColorStop(0.42, 'rgba(255,140,40,0.85)');
    g.addColorStop(0.7, 'rgba(200,50,10,0.35)');
    g.addColorStop(1, 'rgba(120,20,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
  smokeTex = TX.drawnTexture(256, 256, (ctx, w, h) => {
    for (let i = 0; i < 26; i++) {
      const x = w / 2 + (Math.random() - 0.5) * w * 0.4, y = h / 2 + (Math.random() - 0.5) * h * 0.4, r = w * (0.15 + Math.random() * 0.2);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      const c = 40 + Math.random() * 30;
      g.addColorStop(0, `rgba(${c},${c},${c + 4},0.35)`);
      g.addColorStop(1, `rgba(${c},${c},${c},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
  });
  sparkTex = TX.drawnTexture(64, 64, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(255,255,220,1)');
    g.addColorStop(0.3, 'rgba(255,190,80,0.8)');
    g.addColorStop(1, 'rgba(255,120,20,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
}

// pieces: objects to fling (they are re-parented into the blast group, keeping their world pose).
// floorY: the desk height.
export function createExplosion(scene, pieces, floorY) {
  textures();
  const blast = new THREE.Group();
  scene.add(blast);
  const rnd = (a, b) => a + Math.random() * (b - a);
  const box = new THREE.Box3(), c = new THREE.Vector3(), size = new THREE.Vector3();

  const debris = pieces.map((p) => {
    blast.attach(p);
    box.setFromObject(p);
    box.getCenter(c);
    box.getSize(size);
    // fly outward in the screen plane and upward; never straight at the camera
    const dir = new THREE.Vector3(c.x + rnd(-0.3, 0.3), c.y + rnd(-0.2, 0.4), 0);
    if (dir.lengthSq() < 0.01) dir.set(rnd(-1, 1), 1, 0);
    dir.normalize();
    const big = Math.max(size.x, size.y, size.z);
    const speed = rnd(3, 6.5) * (big > 1.5 ? 0.35 : big > 0.8 ? 0.7 : 1);
    const vz = rnd(-2.5, 0.8) * (big > 1.5 ? 0.3 : 1);
    return {
      obj: p,
      v: dir.multiplyScalar(speed).add(new THREE.Vector3(0, rnd(2.5, 5), vz)),
      w: new THREE.Vector3(rnd(-7, 7), rnd(-7, 7), rnd(-7, 7)),
      half: Math.max(0.05, Math.min(size.x, size.y, size.z) / 2),
      rest: false,
    };
  });

  // fireball
  const fire = [];
  for (let i = 0; i < 18; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: fireTex, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false }));
    s.position.set(rnd(-0.8, 0.8), rnd(-0.6, 0.8), rnd(-0.3, 0.9));
    s.userData = { v: s.position.clone().multiplyScalar(rnd(1.5, 3.5)), grow: rnd(3, 6), delay: rnd(0, 0.15), life: rnd(0.7, 1.3) };
    s.scale.setScalar(0.01);
    blast.add(s);
    fire.push(s);
  }
  // smoke
  const smoke = [];
  for (let i = 0; i < 16; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, transparent: true, depthWrite: false, opacity: 0, color: 0x777777 }));
    s.position.set(rnd(-1, 1), rnd(-0.3, 1), rnd(-0.5, 0.8));
    s.userData = { v: new THREE.Vector3(rnd(-0.6, 0.6), rnd(0.5, 1.4), rnd(-0.3, 0.5)), grow: rnd(4, 7), delay: rnd(0.15, 0.5), life: rnd(2.5, 4), spin: rnd(-0.5, 0.5) };
    s.scale.setScalar(0.01);
    blast.add(s);
    smoke.push(s);
  }
  // sparks
  const N = 260;
  const sparkGeo = new THREE.BufferGeometry();
  const pos = new Float32Array(N * 3), vel = [];
  for (let i = 0; i < N; i++) {
    const d = new THREE.Vector3(rnd(-1, 1), rnd(-0.4, 1), rnd(-1, 1)).normalize().multiplyScalar(rnd(4, 13));
    vel.push(d);
  }
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const sparkMat = new THREE.PointsMaterial({ map: sparkTex, size: 0.16, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, color: 0xffc070 });
  const sparks = new THREE.Points(sparkGeo, sparkMat);
  blast.add(sparks);
  // shockwave
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.95, 1, 96), new THREE.MeshBasicMaterial({ color: 0xffb060, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  blast.add(ring);
  // light
  const light = new THREE.PointLight(0xff8a3a, 400, 30, 2);
  light.position.set(0, 0.3, 1);
  blast.add(light);

  let t = 0;
  const g = -9.8;
  const q = new THREE.Quaternion(), e = new THREE.Euler();
  function update(dt, camera) {
    t += dt;
    for (const d of debris) {
      if (d.rest) continue;
      d.v.y += g * dt;
      d.obj.position.addScaledVector(d.v, dt);
      e.set(d.w.x * dt, d.w.y * dt, d.w.z * dt);
      d.obj.quaternion.premultiply(q.setFromEuler(e));
      if (d.obj.position.y - d.half < floorY) {
        d.obj.position.y = floorY + d.half;
        d.v.y *= -0.32;
        d.v.x *= 0.6; d.v.z *= 0.6;
        d.w.multiplyScalar(0.55);
        if (Math.abs(d.v.y) < 0.4 && d.v.length() < 0.5) d.rest = true;
      }
    }
    for (const s of fire) {
      const k = (t - s.userData.delay) / s.userData.life;
      if (k < 0) continue;
      s.position.addScaledVector(s.userData.v, dt * Math.max(0, 1 - k));
      s.scale.setScalar(0.3 + s.userData.grow * Math.min(1, Math.sqrt(k * 2)));
      s.material.opacity = Math.max(0, 1 - k);
      s.material.color.setRGB(1, Math.max(0.35, 1 - k * 0.8), Math.max(0.2, 1 - k * 1.4));
    }
    for (const s of smoke) {
      const k = (t - s.userData.delay) / s.userData.life;
      if (k < 0 || k > 1) { s.material.opacity = 0; continue; }
      s.position.addScaledVector(s.userData.v, dt);
      s.material.rotation += s.userData.spin * dt;
      s.scale.setScalar(1 + s.userData.grow * k);
      s.material.opacity = Math.sin(Math.PI * k) * 0.85;
    }
    const kp = Math.min(1, t / 1.6);
    for (let i = 0; i < N; i++) {
      const v = vel[i];
      v.y += g * 0.5 * dt;
      pos[i * 3] += v.x * dt; pos[i * 3 + 1] += v.y * dt; pos[i * 3 + 2] += v.z * dt;
    }
    sparkGeo.attributes.position.needsUpdate = true;
    sparkMat.opacity = 1 - kp;
    const kr = Math.min(1, t / 0.7);
    ring.scale.setScalar(0.2 + kr * 9);
    ring.material.opacity = (1 - kr) * 0.7;
    if (camera) ring.quaternion.copy(camera.quaternion);
    light.intensity = 400 * Math.exp(-t * 3.2) + 15 * Math.max(0, 1 - t / 3) * (0.7 + Math.random() * 0.3);
  }
  return { group: blast, update };
}
