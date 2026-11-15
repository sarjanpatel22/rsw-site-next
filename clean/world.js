// ---------- RSW v3, the world: one three.js canvas behind every scene ----------
// Tens of thousands of particles of energy flow from one shape to the next as you move between scenes (main.js sends
// 'rsw:scene'), and in the Lab the RSW tub condenses out of them ('rsw:product' changes it). Clean draws the particles
// as glowing light on black; Manga as ink dots on paper, screentone coming alive. They flee the pointer. Without
// WebGL the scenes stand on their own; with reduced motion the shapes change without the storm.
// A classic script (a module wouldn't load from a file:// page), so three.js comes in by dynamic import.
(async () => {
  const root = document.documentElement;
  const canvas = document.querySelector('.world');
  if (!canvas) return;
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const coarse = matchMedia('(pointer: coarse)').matches;
  const manga = () => root.dataset.mode === 'manga';

  let THREE, RoomEnvironment, renderer;
  try {
    [THREE, { RoomEnvironment }] = await Promise.all([import('three'), import('three/addons/environments/RoomEnvironment.js')]);
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch {
    return; // offline, blocked or no WebGL: the scenes carry on without it
  }
  // The shapes and the labels are drawn with the page's fonts, so wait for them; a missing one just falls back
  await Promise.all([
    '900 100px Archivo', '800 40px Montserrat', '500 20px "IBM Plex Mono"', '60px "Dela Gothic One"', '700 60px "Anek Gujarati"',
  ].map((font) => document.fonts.load(font, font.includes('Dela') ? 'プロテインクレアチンプレワークアウトハイドレーション先生' : font.includes('Anek') ? 'પ્રોટીન' : 'RSW'))).catch(() => {});
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);

  // A touch screen draws fewer; a tablet's is big enough to need more than a phone's to look as dense
  const N = !coarse ? 24000 : Math.min(screen.width, screen.height) >= 700 ? 16000 : 9000;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
  camera.position.set(0, 0, 7);
  const world = new THREE.Group(); // the particles and the tub; it slides to whichever side the scene leaves free
  scene.add(world);

  // ---------- Shapes: N points each ----------
  // From a picture drawn on a canvas: every opaque pixel is a place a particle can land
  function drawn(width, height, size, draw) {
    const c = document.createElement('canvas');
    c.width = width;
    c.height = height;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#fff';
    g.strokeStyle = '#fff';
    draw(g, width, height);
    const data = g.getImageData(0, 0, width, height).data;
    const spots = [];
    for (let y = 0; y < height; y += 2) {
      for (let x = 0; x < width; x += 2) if (data[(y * width + x) * 4 + 3] > 140) spots.push(x, y);
    }
    if (!spots.length) return shell(1.6, 0.1);
    const scale = size / Math.max(width, height);
    const out = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const k = 2 * Math.floor((Math.random() * spots.length) / 2);
      out[i * 3] = (spots[k] - width / 2 + Math.random() * 2) * scale;
      out[i * 3 + 1] = (height / 2 - spots[k + 1] + Math.random() * 2) * scale;
      out[i * 3 + 2] = (Math.random() - 0.5) * 0.16;
    }
    return out;
  }

  // A ball of points: a shell of radius r with some depth to it
  function shell(r, depth) {
    const out = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const u = Math.random() * 2 - 1;
      const a = Math.random() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      const rr = r + (Math.random() - 0.5) * depth;
      out.set([s * Math.cos(a) * rr, u * rr, s * Math.sin(a) * rr], i * 3);
    }
    return out;
  }

  const TUB = 1.65; // the tub's size in the world
  // The tub's surface: most of the energy just inside it, so the solid tub swallows it as it grows, and a fifth of it
  // loose round its sides and back, a halo that frames it without covering the label
  function tubField() {
    const out = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const halo = i % 5 === 0;
      const spread = halo ? 1.22 + Math.random() * 0.6 : 0.95;
      let a = Math.random() * Math.PI * 2;
      if (halo && Math.sin(a) > 0.15) a = -a; // nothing in front of the label
      const pick = Math.random();
      let r = 0.62;
      let y = 0.06 + Math.random() * 1.24; // the body
      if (pick > 0.94) {
        y = 1.575;
        r = Math.sqrt(Math.random()) * 0.64; // the lid's top
      } else if (pick > 0.8) {
        y = 1.34 + Math.random() * 0.22;
        r = 0.656; // the lid's side
      }
      r *= spread * (1 + (Math.random() - 0.5) * (halo ? 0.1 : 0.02));
      out.set([Math.cos(a) * r * TUB, (y - 0.79) * TUB, Math.sin(a) * r * TUB], i * 3);
    }
    return out;
  }

  // A ring of light, tilted towards you, with dust round it
  function ring() {
    const out = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const a = Math.random() * Math.PI * 2;
      const dust = i % 6 === 0;
      const r = 2.5 + (Math.random() - 0.5) * (dust ? 1.6 : 0.16);
      out.set([Math.cos(a) * r, Math.sin(a) * r * 0.32 + (Math.random() - 0.5) * (dust ? 0.5 : 0.05), Math.sin(a) * r * 0.6], i * 3);
    }
    return out;
  }

  // The final burst: a bright core, a shell, and rays shooting out of it
  function burst() {
    const out = new Float32Array(N * 3);
    const rays = Array.from({ length: 48 }, () => {
      const u = Math.random() * 2 - 1;
      const a = Math.random() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      return [s * Math.cos(a), u, s * Math.sin(a) * 0.6];
    });
    const core = shell(1.25, 0.15);
    for (let i = 0; i < N; i++) {
      if (i % 3) {
        out.set(core.subarray(i * 3, i * 3 + 3), i * 3);
        continue;
      }
      const [x, y, z] = rays[i % rays.length];
      const r = 1.3 + Math.random() ** 0.7 * 2.4;
      out.set([x * r + (Math.random() - 0.5) * 0.05, y * r + (Math.random() - 0.5) * 0.05, z * r], i * 3);
    }
    return out;
  }

  const shapes = {
    logo: drawn(1500, 560, 3.6, (g, w, h) => {
      g.font = '900 360px Archivo';
      g.letterSpacing = '-14px';
      g.fillText('RSW', w / 2, h / 2 + 14);
    }),
    tub: tubField(),
    bolt: drawn(720, 920, 3.3, (g) => {
      g.beginPath();
      g.moveTo(440, 20);
      g.lineTo(130, 520);
      g.lineTo(340, 520);
      g.lineTo(250, 900);
      g.lineTo(600, 370);
      g.lineTo(390, 370);
      g.lineTo(540, 20);
      g.closePath();
      g.fill();
    }),
    shield: drawn(820, 920, 3.1, (g) => {
      g.beginPath();
      g.moveTo(410, 40);
      g.lineTo(740, 160);
      g.quadraticCurveTo(750, 650, 410, 880);
      g.quadraticCurveTo(70, 650, 80, 160);
      g.closePath();
      g.fill();
      g.globalCompositeOperation = 'destination-out';
      g.lineWidth = 78;
      g.lineCap = 'round';
      g.lineJoin = 'round';
      g.beginPath();
      g.moveTo(250, 470);
      g.lineTo(370, 600);
      g.lineTo(590, 340);
      g.stroke();
    }),
    kanji: drawn(1280, 680, 3.9, (g, w, h) => {
      g.font = '560px "Dela Gothic One"';
      g.fillText('先生', w / 2, h / 2 + 24);
    }),
    // On a tall screen 先生 is written the Japanese way, top to bottom, so it fills the screen rather than a strip of it
    kanjiTall: drawn(680, 1280, 3.9, (g, w, h) => {
      g.font = '560px "Dela Gothic One"';
      g.fillText('先', w / 2, h * 0.27);
      g.fillText('生', w / 2, h * 0.74);
    }),
    ring: ring(),
    burst: burst(),
  };
  // How much room a shape takes (a tall screen sizes the world to fit it): its middle 98%, so a stray spark doesn't count
  function measure(pos, col) {
    const xs = [];
    const ys = [];
    for (let i = 0; i < N; i += 5) {
      if (col && col[i * 4 + 3] < 0.3) continue; // a picture's faded edge
      xs.push(pos[i * 3]);
      ys.push(pos[i * 3 + 1]);
    }
    const q = (list, k) => list.sort((a, b) => a - b)[Math.floor((list.length - 1) * k)] ?? 0;
    const [x0, x1, y0, y1] = [q(xs, 0.01), q(xs, 0.99), q(ys, 0.01), q(ys, 0.99)];
    return { w: Math.max(0.5, x1 - x0), h: Math.max(0.5, y1 - y0), cy: (y0 + y1) / 2 };
  }
  for (const name of Object.keys(shapes)) shapes[name] = { pos: shapes[name], col: null, box: measure(shapes[name]) };
  shapes.tub.box = { w: 2.7, h: 3.2, cy: 0 }; // the solid tub (its near rim looms larger) and a little of its halo
  shapes.burst.box = { w: 3.3, h: 3.3, cy: 0 }; // its core: the rays may leave the screen
  // The opening is a big bang: all the energy starts as one point and explodes into the first shape
  const scatter = shell(0.06, 0.04);

  // ---------- The particles ----------
  const from = scatter.slice();
  const to = scatter.slice();
  // Each particle's colour: a picture's particles carry its pixel (alpha: how much of it shows); a shape's, alpha -1
  const iconColour = new Float32Array(N * 4);
  for (let i = 3; i < iconColour.length; i += 4) iconColour[i] = -1;
  const colFrom = iconColour.slice();
  const colTo = iconColour.slice();
  const rand = new Float32Array(N * 4).map(Math.random);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(to, 3));
  geometry.setAttribute('aFrom', new THREE.BufferAttribute(from, 3));
  geometry.setAttribute('aTo', new THREE.BufferAttribute(to, 3));
  geometry.setAttribute('aColFrom', new THREE.BufferAttribute(colFrom, 4));
  geometry.setAttribute('aColTo', new THREE.BufferAttribute(colTo, 4));
  geometry.setAttribute('aRand', new THREE.BufferAttribute(rand, 4));

  const uniforms = {
    uT: { value: 1 },
    uTime: { value: 0 },
    uChaos: { value: 1 },
    uSize: { value: 1 },
    uMouse: { value: new THREE.Vector3(99, 99, 0) },
    uPush: { value: 0 },
    uInk: { value: new THREE.Color('#f4f3ef') },
    uTone: { value: new THREE.Color('#e3132f') },
    uManga: { value: 0 },
    uDot: { value: 0.02 }, // a picture's grid pitch, in world units
    uUnitPx: { value: 1000 }, // device pixels per world unit at a distance of 1
    uScale: { value: 1 }, // the world's scale
    uCharge: { value: 0 }, // held: 0 to 1
    uFlowY: { value: 0 }, // a scene change: the energy streams the way you're travelling as it re-forms
  };
  const particles = new THREE.Points(geometry, new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      uniform float uT, uTime, uChaos, uSize, uPush, uManga, uDot, uUnitPx, uScale, uCharge, uFlowY;
      uniform vec3 uMouse;
      attribute vec3 aFrom;
      attribute vec3 aTo;
      attribute vec4 aColFrom;
      attribute vec4 aColTo;
      attribute vec4 aRand;
      varying float vGlow;
      varying float vTone;
      varying float vPhoto;
      varying float vRed;
      varying float vSize;
      varying vec3 vColor;

      float ease(float t) { return t < 0.5 ? 4.0 * t * t * t : 1.0 - pow(-2.0 * t + 2.0, 3.0) / 2.0; }

      void main() {
        // Each particle leaves a little after or before the others, so the shape pours rather than jumps
        float t = clamp((uT - aRand.x * 0.4) / 0.6, 0.0, 1.0);
        float e = ease(t);
        vec3 p = mix(aFrom, aTo, e);
        vec4 col = mix(aColFrom, aColTo, e);
        float photo = smoothstep(-1.0, 0.0, col.a);
        float shown = max(col.a, 0.0);
        float flight = sin(t * 3.14159);
        vec3 swirl = vec3(
          sin(p.y * 2.1 + uTime * 1.3 + aRand.y * 6.28),
          cos(p.x * 1.7 + uTime * 1.1 + aRand.z * 6.28),
          sin(p.x * 1.3 + p.y * 1.9 + uTime * 0.9)
        );
        p += swirl * flight * uChaos * (0.35 + aRand.w * 0.9);
        p += normalize(p + 0.0001) * flight * uChaos * 1.1 * aRand.y; // blown outwards half way
        p.y += flight * uFlowY * (0.5 + aRand.z); // and swept along with you, from one scene to the next
        p += swirl * 0.018 * (1.0 + aRand.w) * (1.0 - photo * 0.85); // and never quite still (a picture nearly so)
        // Held: the shape winds into a vortex, tighter and faster the longer you hold
        float turn = uCharge * uCharge * (uTime * 3.5 + 2.4 / (0.35 + length(p.xy)));
        p.xy = mat2(cos(turn), sin(turn), -sin(turn), cos(turn)) * p.xy * (1.0 - uCharge * 0.3);
        p += swirl * uCharge * 0.12;
        // The pointer pushes them aside
        vec2 away = p.xy - uMouse.xy;
        float near = smoothstep(1.1, 0.0, length(away));
        p.xy += normalize(away + 0.0001) * near * near * uPush * 0.55;
        vec4 view = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * view;
        float depth = -view.z;
        float spark = min(uSize * (0.45 + aRand.w * 1.1) / depth, uSize * 0.12);
        // A picture's dot follows its grid's pitch on screen. Manga prints halftone: the darker the spot, the bigger the
        // ink dot. Clean lights soft, overlapping glows in the picture's own colours.
        float pitch = uDot * uUnitPx * uScale / depth;
        float dark = clamp(1.0 - dot(col.rgb, vec3(0.299, 0.587, 0.114)), 0.0, 1.0) * shown;
        float pixel = uManga > 0.5 ? pitch * 1.45 * pow(dark, 0.75) : pitch * 1.7;
        vSize = mix(spark, pixel, photo) * (1.0 + uCharge * 0.5);
        gl_PointSize = max(vSize, 1.0);
        vGlow = 0.5 + 0.5 * aRand.z + near * 0.6 + uCharge;
        vTone = aRand.y;
        vPhoto = photo;
        vColor = pow(col.rgb, vec3(1.45)) * shown;
        vRed = step(0.22, col.r - max(col.g, col.b)) * step(0.3, shown); // strongly red in the picture: printed in red
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uInk, uTone;
      uniform float uManga;
      varying float vGlow;
      varying float vTone;
      varying float vPhoto;
      varying float vRed;
      varying float vSize;
      varying vec3 vColor;

      void main() {
        float r = length(gl_PointCoord - 0.5);
        vec3 spark = mix(uInk, uTone, step(0.82, vTone));
        if (uManga > 0.5) {
          // Ink dots with a hard edge, like screentone; a picture's white parts print no dot at all
          if (r > 0.5 || vSize < 0.9) discard;
          gl_FragColor = vec4(mix(spark, mix(uInk, uTone, vRed), vPhoto), 1.0);
          return;
        }
        float a = smoothstep(0.5, 0.0, r);
        gl_FragColor = vec4(mix(spark, vColor, vPhoto), mix(a * a * vGlow, a * 1.1, vPhoto));
      }`,
  }));
  particles.frustumCulled = false;
  world.add(particles);

  // ---------- Dust: motes of light all through the space, so the screen is never an empty black ----------
  // They drift; a scene change streaks them past like a jump to light speed (rsw:warp), the way you're going. Each is a
  // little quad facing you, stretched by the speed.
  const DUST = coarse ? 380 : 700;
  const quad = new THREE.PlaneGeometry(1, 1);
  const dustGeometry = new THREE.InstancedBufferGeometry();
  dustGeometry.index = quad.index;
  dustGeometry.setAttribute('position', quad.getAttribute('position'));
  dustGeometry.setAttribute('uv', quad.getAttribute('uv'));
  dustGeometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(new Float32Array(DUST * 4).map(Math.random), 4));
  dustGeometry.instanceCount = DUST;
  const dustUniforms = {
    uTime: uniforms.uTime,
    uUnitPx: uniforms.uUnitPx,
    uFlow: { value: 0 }, // how far it has travelled, in world units
    uSpeed: { value: 0 }, // how fast now
    uAspect: { value: 1 },
    uPx: { value: 1 }, // device pixels per CSS pixel
    uCamZ: { value: 7 },
    uLook: { value: new THREE.Vector2() },
    uTone: uniforms.uTone,
  };
  const dust = new THREE.Mesh(dustGeometry, new THREE.ShaderMaterial({
    uniforms: dustUniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      uniform float uTime, uUnitPx, uFlow, uSpeed, uAspect, uPx, uCamZ;
      uniform vec2 uLook;
      attribute vec4 aSeed;
      varying vec2 vUv;
      varying float vA;
      varying float vRed;

      void main() {
        float z = mix(-10.0, 4.0, aSeed.z * aSeed.z); // most of them far off
        float depth = uCamZ - z;
        float halfH = depth * 0.3153; // tan(17.5°): half the camera's view at that depth
        float span = halfH * 2.3;
        float x = (aSeed.x * 2.0 - 1.0) * halfH * uAspect * 1.05 - uLook.x * 0.35;
        float y = mod(aSeed.y * span + uFlow, span) - span * 0.5 - uLook.y * 0.25;
        float w = (1.0 + aSeed.w * 2.2) * uPx * depth / uUnitPx; // 1 to 3 pixels wide, whatever the depth
        float len = w + uSpeed * 0.05 * (0.5 + aSeed.x);
        gl_Position = projectionMatrix * viewMatrix * vec4(x + position.x * w, y + position.y * len, z, 1.0);
        vUv = uv;
        float twinkle = 0.55 + 0.45 * sin(uTime * (0.6 + aSeed.y * 1.4) + aSeed.x * 40.0);
        vA = twinkle * mix(0.9, 0.22, smoothstep(2.0, 16.0, depth)) * (1.0 + min(uSpeed * 0.06, 1.4));
        vRed = step(0.86, aSeed.w);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uTone;
      varying vec2 vUv;
      varying float vA;
      varying float vRed;

      void main() {
        vec2 d = abs(vUv - 0.5) * 2.0;
        float a = (1.0 - smoothstep(0.0, 1.0, d.x)) * (1.0 - smoothstep(0.3, 1.0, d.y));
        gl_FragColor = vec4(mix(vec3(0.96, 0.95, 0.93), uTone, vRed), a * vA);
      }`,
  }));
  dust.frustumCulled = false;
  scene.add(dust);

  // ---------- The aura: energy rising off the shape like flame, faint at rest, roaring while you hold ----------
  // Each spark starts on a point of the shape on show (auraFrom) and rises, white-hot, cooling to red as it goes.
  const AURA = coarse ? 900 : 2200;
  const auraBase = new Float32Array(AURA * 3);
  const auraGeometry = new THREE.BufferGeometry();
  auraGeometry.setAttribute('position', new THREE.BufferAttribute(auraBase, 3));
  auraGeometry.setAttribute('aSeed', new THREE.BufferAttribute(new Float32Array(AURA * 4).map(Math.random), 4));
  const auraUniforms = { uTime: uniforms.uTime, uCharge: uniforms.uCharge, uSize: uniforms.uSize, uTone: uniforms.uTone, uAura: { value: 0 } };
  const aura = new THREE.Points(auraGeometry, new THREE.ShaderMaterial({
    uniforms: auraUniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      uniform float uTime, uCharge, uSize, uAura;
      attribute vec4 aSeed;
      varying float vA;
      varying float vHeat;

      void main() {
        vec3 p = position;
        // The same vortex the shape winds into while held
        float turn = uCharge * uCharge * (uTime * 3.5 + 2.4 / (0.35 + length(p.xy)));
        p.xy = mat2(cos(turn), sin(turn), -sin(turn), cos(turn)) * p.xy * (1.0 - uCharge * 0.3);
        float life = fract(uTime * (0.3 + aSeed.x * 0.4) * (1.0 + uCharge * 1.6) + aSeed.y);
        p.y += life * (0.3 + aSeed.z * 0.8) * (1.0 + uCharge * 1.8);
        p.x += sin(uTime * 2.1 + aSeed.w * 6.2832 + life * 6.0) * 0.07 * life * (1.0 + uCharge * 2.0);
        p.z += cos(uTime * 1.7 + aSeed.w * 9.0) * 0.05 * life;
        vec4 view = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * view;
        vA = smoothstep(0.0, 0.15, life) * pow(1.0 - life, 1.6) * uAura;
        vHeat = 1.0 - life;
        gl_PointSize = max(1.0, min(uSize * (0.3 + aSeed.x * 0.55) * (1.0 - life * 0.45) / -view.z, uSize * 0.1));
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uTone;
      varying float vA;
      varying float vHeat;

      void main() {
        float a = smoothstep(0.5, 0.0, length(gl_PointCoord - 0.5));
        gl_FragColor = vec4(mix(uTone, vec3(1.0, 0.93, 0.86), vHeat * vHeat), a * a * vA);
      }`,
  }));
  aura.frustumCulled = false;
  world.add(aura);
  let auraWant = 0;
  // The sparks rise from the new shape; off the tub, only round its back and sides, so the label stays clean
  function auraFrom(shape) {
    const behind = shape === shapes.tub;
    for (let i = 0; i < AURA; i++) {
      let k = Math.floor(Math.random() * N);
      for (let tries = 0; tries < 8; tries++) {
        const faded = shape.col && shape.col[k * 4 + 3] < 0.5;
        if (!faded && !(behind && shape.pos[k * 3 + 2] > 0.05)) break;
        k = Math.floor(Math.random() * N);
      }
      auraBase.set(shape.pos.subarray(k * 3, k * 3 + 3), i * 3);
    }
    auraGeometry.attributes.position.needsUpdate = true;
    auraWant = shape.col ? 0.1 : 0.4; // a picture just smoulders
  }

  // ---------- Shockwaves: a ring of light out of the middle, at a tap, a scene change, the big bang ----------
  const ringGeometry = new THREE.PlaneGeometry(1, 1);
  const rings = Array.from({ length: 3 }, () => {
    const mesh = new THREE.Mesh(ringGeometry, new THREE.ShaderMaterial({
      uniforms: { uK: { value: 1 }, uPower: { value: 1 }, uTone: uniforms.uTone },
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform float uK, uPower;
        uniform vec3 uTone;
        varying vec2 vUv;
        void main() {
          float r = length(vUv - 0.5) * 2.0;
          float edge = smoothstep(0.8, 0.95, r) * (1.0 - smoothstep(0.95, 1.0, r));
          float a = edge * pow(1.0 - uK, 1.4) * min(1.0, 0.4 + uPower * 0.25) + smoothstep(1.0, 0.0, r) * pow(1.0 - uK, 4.0) * 0.1;
          gl_FragColor = vec4(mix(vec3(1.0, 0.95, 0.9), uTone, smoothstep(0.86, 1.0, r)), a);
        }`,
    }));
    mesh.visible = false;
    mesh.frustumCulled = false;
    world.add(mesh);
    return { mesh, at: -1, power: 1 };
  });
  let ringNext = 0;
  function shock(power = 1) {
    if (still) return;
    const ring = rings[ringNext++ % rings.length];
    ring.at = performance.now();
    ring.power = power;
  }

  // ---------- The tub (the same one as the second design's hero), built once ----------
  function paint(width, height, draw) {
    const c = document.createElement('canvas');
    c.width = width;
    c.height = height;
    const g = c.getContext('2d');
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    draw(g, width, height);
    const texture = new THREE.CanvasTexture(c);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    return texture;
  }

  function text(g, str, x, y, font, fill, spacing = 0) {
    g.font = font;
    g.letterSpacing = `${spacing}px`;
    g.fillStyle = fill;
    g.fillText(str, x, y);
  }

  // The products come from the Lab scene's list, so the labels never disagree with the shop
  const products = new Map([...document.querySelectorAll('.product[data-id]')].map((el) => {
    const css = getComputedStyle(el);
    const [stat] = el.querySelectorAll('.product-stats div');
    return [el.dataset.id, {
      name: (el.querySelector('.product-name .sr') || el.querySelector('.product-name')).textContent, // main.js splits it into letters
      flavour: el.querySelector('.product-flavour').textContent,
      kana: el.dataset.kana,
      gu: el.dataset.gu,
      code: el.dataset.code,
      stat: `${stat.querySelector('dd').textContent} ${stat.querySelector('dt').textContent}`,
      tone: css.getPropertyValue('--tone').trim(),
      on: css.getPropertyValue('--on').trim(),
      tub: css.getPropertyValue('--tub').trim(),
    }];
  }));

  // The label unrolled: the front in the middle, the katakana and the code either side, the barcode round the back
  function label(p) {
    return paint(2048, 560, (g, w, h) => {
      const mid = w / 2;
      g.fillStyle = p.tone;
      g.fillRect(0, 0, w, h);
      g.fillStyle = p.on;
      g.globalAlpha = 0.09;
      for (let y = 10; y < h; y += 14) {
        for (let x = 10; x < w; x += 14) {
          g.beginPath();
          g.arc(x, y, 0.4 + (3.4 * y) / h, 0, Math.PI * 2);
          g.fill();
        }
      }
      g.globalAlpha = 1;
      g.fillRect(0, 0, w, 12);
      g.fillRect(0, h - 12, w, 12);
      g.fillRect(mid - 300, 36, 600, 2);
      if (visitor) { // the visitor's own tub: their name on a pill where the brand line was
        const who = `MADE FOR ${visitor.toUpperCase()}`;
        g.font = '800 24px Montserrat';
        g.letterSpacing = '6px';
        const wide = g.measureText(who).width + 52;
        g.fillStyle = p.on;
        g.beginPath();
        g.roundRect(mid - wide / 2, 50, wide, 44, 22);
        g.fill();
        text(g, who, mid, 73, '800 24px Montserrat', p.tone, 6);
      } else text(g, 'REAL SAIYAN WELLNESS', mid, 72, '800 22px Montserrat', p.on, 9);
      text(g, 'RSW', mid + 6, 207, '900 172px Archivo', 'rgb(0 0 0 / 0.28)', -4);
      text(g, 'RSW', mid, 200, '900 172px Archivo', p.on, -4);
      let size = 46;
      g.letterSpacing = '7px';
      do g.font = `800 ${size}px Montserrat`;
      while (g.measureText(p.name.toUpperCase()).width > 560 && (size -= 2) > 24);
      text(g, p.name.toUpperCase(), mid, 336, g.font, p.on, 7);
      g.font = '800 22px Montserrat';
      g.letterSpacing = '5px';
      const pill = g.measureText(p.flavour.toUpperCase()).width + 56;
      g.fillStyle = p.on;
      g.beginPath();
      g.roundRect(mid - pill / 2, 388, pill, 46, 23);
      g.fill();
      text(g, p.flavour.toUpperCase(), mid, 412, '800 22px Montserrat', p.tone, 5);
      text(g, p.stat.toUpperCase(), mid, 488, '500 22px "IBM Plex Mono"', p.on, 4);
      const chars = [...p.kana];
      const step = Math.min(70, 400 / chars.length);
      chars.forEach((ch, i) => text(g, ch, mid - 370, 88 + step / 2 + i * step, `${step * 0.86}px "Dela Gothic One"`, p.on));
      if (p.gu) text(g, p.gu, mid + 380, 170, '700 76px "Anek Gujarati"', p.on);
      text(g, p.code, mid + 380, p.gu ? 270 : 200, '500 26px "IBM Plex Mono"', p.on, 4);
      ['LAB TESTED', 'EVERY BATCH'].forEach((line, i) => text(g, line, mid + 380, (p.gu ? 330 : 260) + i * 40, '800 22px Montserrat', p.on, 6));
      g.fillStyle = p.on;
      g.fillRect(150, 180, 230, 170);
      g.fillStyle = p.tone;
      for (let i = 0, x = 0; x < 200; i++) {
        const bar = 2 + ((i * 7) % 4);
        g.fillRect(165 + x, 196, bar, 120);
        x += bar + 3 + ((i * 5) % 4);
      }
      ['TAP INTO', 'YOUR FINAL', 'FORM'].forEach((line, i) => text(g, line, w - 250, 200 + i * 62, '900 50px Archivo', p.on, 2));
    });
  }

  const ridges = paint(1024, 8, (g, w, h) => {
    g.fillStyle = '#808080';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#fff';
    for (let x = 0; x < w; x += 8) g.fillRect(x, 0, 3, h);
  });
  const seal = paint(512, 512, (g, w, h) => {
    g.fillStyle = '#1b1817';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#c8102e';
    g.lineWidth = 16;
    g.beginPath();
    g.arc(w / 2, h / 2, w * 0.36, 0, Math.PI * 2);
    g.stroke();
    text(g, 'RSW', w / 2, h / 2 + 4, '900 118px Archivo', '#f6efe2');
  });

  const lathe = (points) => {
    const shape = new THREE.LatheGeometry(points.map(([x, y]) => new THREE.Vector2(x, y)), 128);
    shape.computeBoundingBox();
    const middle = shape.boundingBox.getCenter(new THREE.Vector3()).y;
    shape.translate(0, -middle, 0); // centred, so an outline copy scales evenly round it
    return [shape, middle];
  };
  const [bodyShape, bodyMid] = lathe([[0, 0], [0.52, 0], [0.585, 0.012], [0.612, 0.045], [0.62, 0.09], [0.62, 1.26], [0.612, 1.3], [0.595, 1.325], [0.57, 1.335]]);
  const [lidShape, lidMid] = lathe([[0.57, 1.3], [0.64, 1.305], [0.652, 1.32], [0.656, 1.36], [0.656, 1.52], [0.651, 1.55], [0.636, 1.566], [0.6, 1.573], [0, 1.575]]);
  const bands = new THREE.DataTexture(new Uint8Array([90, 170, 255]), 3, 1, THREE.RedFormat); // cel shading
  bands.needsUpdate = true;
  const looks = {
    clean: {
      plastic: (color) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.34, clearcoat: 0.9, clearcoatRoughness: 0.16 }),
      printed: (map) => new THREE.MeshPhysicalMaterial({ map, roughness: 0.46, clearcoat: 0.55, clearcoatRoughness: 0.22 }),
      lid: (color) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.4, clearcoat: 0.7, bumpMap: ridges, bumpScale: 1.4 }),
    },
    manga: {
      plastic: (color) => new THREE.MeshToonMaterial({ color, gradientMap: bands }),
      printed: (map) => new THREE.MeshToonMaterial({ map, gradientMap: bands }),
      lid: (color) => new THREE.MeshToonMaterial({ color, gradientMap: bands }),
    },
  };
  const body = new THREE.Mesh(bodyShape);
  body.position.y = bodyMid;
  const lid = new THREE.Mesh(lidShape);
  lid.position.y = lidMid;
  const wrap = new THREE.Mesh(new THREE.CylinderGeometry(0.6215, 0.6215, 1.0, 128, 1, true));
  wrap.position.y = 0.66;
  wrap.rotation.y = Math.PI;
  const top = new THREE.Mesh(new THREE.CircleGeometry(0.5, 96));
  top.rotation.x = -Math.PI / 2;
  top.position.y = 1.577;
  const inkLine = new THREE.MeshBasicMaterial({ color: '#151312', side: THREE.BackSide });
  const outlines = [body, lid].map((part) => {
    const line = new THREE.Mesh(part.geometry, inkLine);
    line.scale.setScalar(1.028);
    part.add(line);
    return line;
  });
  const tubModel = new THREE.Group();
  tubModel.add(body, lid, wrap, top);
  tubModel.position.y = -0.79;
  const tub = new THREE.Group(); // turns round its middle; grows out of the particles
  tub.add(tubModel);
  tub.scale.setScalar(0.0001);
  world.add(tub);

  const ambient = new THREE.AmbientLight(0xfff4e6, 0);
  const key = new THREE.DirectionalLight(0xffffff, 1);
  key.position.set(-3, 4, 5);
  const redRim = new THREE.DirectionalLight(0xff2a3d, 0);
  redRim.position.set(-3.5, 1.2, -2.2);
  const backRim = new THREE.DirectionalLight(0xffe2c4, 0);
  backRim.position.set(3, 2, -4);
  scene.add(ambient, key, redRim, backRim);
  const studio = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;

  let product = products.keys().next().value;
  let dressed = '';
  const kits = {};
  const labels = new Map();
  function dress() {
    const look = manga() ? 'manga' : 'clean';
    const p = products.get(product);
    const kit = (kits[look] ||= {});
    const make = looks[look];
    if (!labels.has(product)) labels.set(product, label(p));
    body.material = kit[`body-${p.tub}`] ||= make.plastic(new THREE.Color(p.tub));
    lid.material = kit[`lid-${p.tub}`] ||= make.lid(new THREE.Color(p.tub));
    wrap.material = kit[`label-${product}`] ||= make.printed(labels.get(product));
    top.material = kit.seal ||= make.printed(seal);
    const ink = look === 'manga';
    outlines.forEach((line) => { line.visible = ink; });
    scene.environment = ink ? null : studio;
    renderer.toneMapping = ink ? THREE.NoToneMapping : THREE.NeutralToneMapping;
    ambient.intensity = ink ? 1.25 : 0;
    key.intensity = ink ? 2.2 : 1.1;
    redRim.intensity = ink ? 0 : 2.6;
    backRim.intensity = ink ? 0 : 1.2;
    // The particles: light on black, or ink on paper; the Lab tints them with the product's colour
    particles.material.blending = ink ? THREE.NormalBlending : THREE.AdditiveBlending;
    particles.material.needsUpdate = true;
    uniforms.uManga.value = ink ? 1 : 0;
    uniforms.uInk.value.set(ink ? '#141010' : '#f4f3ef');
    const tone = current === 'tub' && !['#efe6d6', '#1b1817'].includes(p.tone) ? p.tone : ink ? '#d8001f' : '#e3132f';
    uniforms.uTone.value.set(tone);
    dressed = `${look}-${product}-${current}`;
  }

  // ---------- Moving between shapes ----------
  const ease = (k) => (k < 0.5 ? 4 * k ** 3 : 1 - (-2 * k + 2) ** 3 / 2);
  let current = 'logo';
  let morph = { at: -1, length: 1, chaos: 0 };
  let tubWant = 0; // 0: gone, 1: there
  let tubAt = 0;
  let tubSpin = 0;
  let tubDelay = 0;

  let currentShape = shapes.logo;
  let opening = true;
  let flowNext = 0; // set by a scene change (rsw:warp) for the morph that comes with it
  function morphTo(shape, length = 1700, chaos = 1) {
    if (opening) { // the very first shape comes out of the big bang
      opening = false;
      length = 2600;
      chaos = 2.4;
      shock(2.6);
    }
    if (shape !== currentShape || !auraWant) auraFrom(shape);
    currentShape = shape;
    uniforms.uFlowY.value = still ? 0 : flowNext;
    flowNext = 0;
    const t = uniforms.uT.value;
    // Wherever the particles are now becomes the start (the swirl aside), so a change mid-flight carries on smoothly
    for (let i = 0; i < N; i++) {
      const e = ease(Math.min(1, Math.max(0, (t - rand[i * 4] * 0.4) / 0.6)));
      for (let j = i * 3; j < i * 3 + 3; j++) from[j] += (to[j] - from[j]) * e;
      for (let j = i * 4; j < i * 4 + 4; j++) colFrom[j] += (colTo[j] - colFrom[j]) * e;
    }
    to.set(shape.pos);
    colTo.set(shape.col || iconColour);
    for (const name of ['aFrom', 'aTo', 'aColFrom', 'aColTo']) geometry.attributes[name].needsUpdate = true;
    uniforms.uT.value = still ? 1 : 0;
    morph = { at: performance.now(), length: still ? 1 : length, chaos: still ? 0 : chaos };
  }

  // ---------- Pictures as particles ----------
  // A photo becomes a grid of particles, one per cell, each with its pixel's colour, fading out towards the edges. The
  // cells are dealt to the particles in a shuffled order (the same for a given photo), so one picture swirls into the
  // next instead of just changing colour.
  const PHOTO_AREA = 9; // world units², whatever the photo's shape
  const pitch = Math.sqrt(PHOTO_AREA / N);
  uniforms.uDot.value = pitch;
  const photoCache = new Map();
  function photoShape(src) {
    if (!photoCache.has(src)) {
      photoCache.set(src, new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = window.RSW_PHOTOS?.[src] || src; // photos.js: a copy the page may read, even opened as a file
      }).then((img) => {
        const aspect = Math.min(1.25, Math.max(0.8, img.naturalHeight / img.naturalWidth));
        const width = Math.sqrt(PHOTO_AREA / aspect);
        const cols = Math.round(width / pitch);
        const rows = Math.min(Math.round((width * aspect) / pitch), Math.floor(N / cols));
        const c = document.createElement('canvas');
        c.width = cols;
        c.height = rows;
        const g = c.getContext('2d', { willReadFrequently: true });
        const fit = Math.max(cols / img.naturalWidth, rows / img.naturalHeight); // cover the frame, centred
        const sw = cols / fit;
        const sh = rows / fit;
        g.filter = 'contrast(1.2) saturate(1.2)';
        g.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, 0, 0, cols, rows);
        const data = g.getImageData(0, 0, cols, rows).data;
        // Levels: the darkest 2% of the picture becomes black and the brightest 2% white, so a dark photo still reads
        const lums = [];
        for (let k = 0; k < data.length; k += 4) if (data[k + 3] > 128) lums.push(0.299 * data[k] + 0.587 * data[k + 1] + 0.114 * data[k + 2]);
        lums.sort((a, b) => a - b);
        const lo = lums[Math.floor(lums.length * 0.02)] ?? 0;
        const hi = Math.max(lo + 1, lums[Math.floor(lums.length * 0.98)] ?? 255);
        const level = (v) => Math.min(1, Math.max(0, (v - lo) / (hi - lo)));
        const order = Uint32Array.from({ length: N }, (_, i) => i);
        let seed = [...src].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);
        for (let i = N - 1; i > 0; i--) {
          seed = (seed * 1664525 + 1013904223) >>> 0;
          const j = seed % (i + 1);
          [order[i], order[j]] = [order[j], order[i]];
        }
        const pos = new Float32Array(N * 3);
        const col = new Float32Array(N * 4);
        for (let i = 0; i < N; i++) {
          const cell = order[i];
          const x = cell % cols;
          const y = Math.floor(cell / cols);
          if (y >= rows) { // more particles than cells: the spare ones wait, unseen, inside the picture
            pos.set([(Math.random() - 0.5) * cols * pitch, (Math.random() - 0.5) * rows * pitch, 0], i * 3);
            continue;
          }
          const k = (y * cols + x) * 4;
          const [r, gr, b] = [level(data[k]), level(data[k + 1]), level(data[k + 2])];
          const lum = 0.299 * r + 0.587 * gr + 0.114 * b;
          // A soft-cornered frame: full strength in the middle, fading out towards the edges
          const ux = Math.abs(((x + 0.5) / cols) * 2 - 1);
          const uy = Math.abs(((y + 0.5) / rows) * 2 - 1);
          const edge = (ux ** 4 + uy ** 4) ** 0.25;
          const fade = 1 - THREE.MathUtils.smoothstep(edge, 0.68, 1);
          pos.set([(x - cols / 2 + 0.5 + (y % 2) * 0.5) * pitch, (rows / 2 - y - 0.5) * pitch, (lum - 0.5) * 0.3], i * 3);
          col.set([r, gr, b, fade * (data[k + 3] / 255)], i * 4);
        }
        return { pos, col, box: measure(pos, col), full: { w: cols * pitch, h: rows * pitch } };
      }));
    }
    return photoCache.get(src);
  }

  // ---------- The visitor's name, in energy (main.js: shape 'name') ----------
  // As big as the logo; a long name gets smaller type. Typing makes a new one each time, so only the last few are kept.
  const names = new Map();
  function nameShape(text) {
    const key = String(text || '').toUpperCase();
    if (!names.has(key)) {
      const pos = drawn(1600, 600, 3.9, (g, w, h) => {
        let px = 360;
        g.letterSpacing = '-6px';
        do g.font = `900 ${px}px Archivo, "Anek Gujarati", sans-serif`;
        while (g.measureText(key).width > w * 0.92 && (px -= 6) > 60);
        g.fillText(key, w / 2, h / 2 + px * 0.04);
      });
      names.set(key, { pos, col: null, box: measure(pos) });
      if (names.size > 24) names.delete(names.keys().next().value);
    }
    return names.get(key);
  }

  // The name goes on the tub's label too: the labels are painted again the next time the tub shows
  let visitor = document.querySelector('#warrior-name')?.value.trim() || '';
  addEventListener('rsw:name', (e) => {
    const next = String(e.detail || '');
    if (next === visitor) return;
    visitor = next;
    for (const texture of labels.values()) texture.dispose();
    labels.clear();
    for (const kit of Object.values(kits)) {
      for (const name of Object.keys(kit)) {
        if (!name.startsWith('label-')) continue;
        kit[name].dispose();
        delete kit[name];
      }
    }
    if (current === 'tub') dress();
  });

  // ---------- Real people, for real ----------
  // A photo still forms in particles, and once they've landed the photo itself comes through over them, sharp
  // (.portrait, between this canvas and the words). The world holds still for it (flat), so the two line up.
  const portrait = document.querySelector('.portrait');
  let framed = null; // the photo on show: { src, full, at, from }; from: when it may show
  let flat = 0;
  function frameOn(src, shape) {
    framed = { src, full: shape.full || { w: shape.box.w, h: shape.box.h }, at: performance.now(), from: morph.at + morph.length * 0.85 };
    portrait?.classList.remove('is-shown');
  }
  function frameOff() {
    framed = null;
    portrait?.classList.remove('is-shown');
  }

  // Where the world sits: right of the words on a wide screen (data-side="right"). On a tall one (a phone, a tablet
  // held upright) it fills whatever the scene leaves free between the story bar and the words, as big as it fits.
  let side = 'right';
  const place = { x: 0, y: 0, s: 1, tx: 0, ty: 0, ts: 1 };
  const isTall = () => innerWidth / innerHeight < 0.9; // styles.css: (max-aspect-ratio: 9/10)
  let box = shapes.logo.box; // the room the shape on show takes
  function layout() {
    const visibleH = 2 * 7 * Math.tan(THREE.MathUtils.degToRad(17.5));
    const visibleW = visibleH * camera.aspect;
    if (!isTall()) {
      place.ts = Math.min(1, visibleW / 7.4, (visibleW * 0.46) / box.w); // under half the screen: a long name never reaches the words
      place.tx = side === 'right' ? visibleW * 0.23 : 0;
      place.ty = 0;
      return;
    }
    const perPx = visibleH / innerHeight;
    const copy = document.querySelector('.scene.is-active .scene-copy');
    const top = (document.querySelector('.index')?.getBoundingClientRect().bottom || innerHeight * 0.12) + 6;
    const bottom = copy && copy.offsetHeight ? copy.offsetTop - 16 : innerHeight * 0.55; // where the words start, unmoved
    const roomH = Math.max(innerHeight * 0.2, bottom - top) * perPx;
    place.ts = Math.min((visibleW * 0.84) / box.w, (roomH * 0.9) / box.h, 1.4); // room to breathe, and for the swirl
    place.tx = 0;
    place.ty = (innerHeight / 2 - (top + bottom) / 2) * perPx - box.cy * place.ts;
  }

  function size() {
    const width = innerWidth;
    const height = innerHeight;
    renderer.setPixelRatio(Math.min(devicePixelRatio, coarse ? 1.5 : 2));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    uniforms.uSize.value = (manga() ? 34 : 62) * renderer.getPixelRatio();
    uniforms.uUnitPx.value = renderer.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
    dustUniforms.uAspect.value = camera.aspect;
    dustUniforms.uPx.value = renderer.getPixelRatio();
    // Turned between upright and sideways: a shape with an upright version (先生) is drawn again the other way
    if (lastScene && wasTall !== isTall()) {
      wanted = '';
      show(lastScene);
    }
    wasTall = isTall();
    layout();
  }

  // What to show, from main.js: a shape by name, the tub (with its product), or a picture
  let wanted = '';
  let lastScene = null;
  let wasTall = isTall();
  addEventListener('rsw:scene', (e) => show(e.detail));
  async function show(detail) {
    lastScene = detail;
    const { side: where, photo, product: pick } = detail;
    const shape = isTall() && shapes[`${detail.shape}Tall`] ? `${detail.shape}Tall` : detail.shape;
    side = where || 'right';
    layout();
    const key = `${shape}|${photo || ''}|${pick || ''}|${detail.text || ''}`;
    if (key === wanted) return;
    wanted = key;
    if (shape === 'tub') {
      const next = products.has(pick) ? pick : product;
      if (current === 'tub') {
        if (next !== product) switchProduct(next);
        return;
      }
      product = next;
      current = 'tub';
      frameOff();
      const delay = opening ? 1800 : 750; // the solid tub condenses once the energy has gathered
      box = shapes.tub.box;
      layout();
      morphTo(shapes.tub, 1600, 0.8);
      tubWant = 1;
      tubDelay = performance.now() + (still ? 0 : delay);
      dress();
      return;
    }
    const fromTub = current === 'tub';
    let target = shape === 'name' ? nameShape(detail.text) : shapes[shape] || shapes.logo;
    if (shape === 'photo') {
      try {
        target = await photoShape(photo);
      } catch {
        target = shapes.burst; // a picture that won't load: the scene still gets a shape
      }
      if (wanted !== key) return; // moved on while it loaded
    }
    tubWant = 0;
    current = shape;
    box = target.box;
    layout();
    if (detail.quick) { // a letter typed: the energy rewrites itself, quickly
      morphTo(target, 750, 0.55);
      shock(0.45);
    } else morphTo(target, fromTub ? 1500 : 1700, fromTub ? 1.4 : 1);
    if (detail.aura) auraWant = detail.aura;
    if (shape === 'photo') frameOn(photo, target);
    else frameOff();
    dress();
  }

  // The tub bursts back into energy and re-forms as the next product, spun the way it was swiped
  function switchProduct(id, dir = 1) {
    product = id;
    if (current !== 'tub') return dress();
    tubWant = 0;
    tubSpin += Math.PI * 2 * dir;
    morphTo(shapes.tub, 1100, 1.5);
    setTimeout(() => {
      if (current !== 'tub' || product !== id) return;
      dress();
      tubWant = 1;
      tubDelay = performance.now();
    }, still ? 0 : 380);
  }
  addEventListener('rsw:product', (e) => {
    const { id, dir } = typeof e.detail === 'object' ? e.detail : { id: e.detail, dir: 1 };
    if (products.has(id) && id !== product) switchProduct(id, dir);
  });

  // A tap on the empty stage sends a shockwave through the shape; letting go of a charge sends a bigger one
  addEventListener('rsw:pulse', (e) => {
    const strength = Number(e.detail) || 1;
    morphTo(currentShape, 700 + strength * 300, 0.9 + strength * 0.5);
    shock(strength);
    if (framed) frameOn(framed.src, currentShape); // the photo steps aside for the shockwave, then comes back
  });

  // A scene change: the dust streaks past the way you're going, the view punches out, a ring goes off
  let warpAt = -1;
  let warpDir = 1;
  addEventListener('rsw:warp', (e) => {
    if (still) return;
    warpAt = performance.now();
    warpDir = Number(e.detail) < 0 ? -1 : 1;
    flowNext = warpDir * 1.1;
    shock(1.3);
  });
  let chargeTo = 0;
  addEventListener('rsw:charge', (e) => { chargeTo = still ? 0 : Number(e.detail) || 0; });

  new MutationObserver(() => {
    dress();
    size();
  }).observe(root, { attributes: true, attributeFilter: ['data-mode'] });

  // ---------- The pointer, the finger and the tilt ----------
  // The mouse pushes the particles aside and turns the world a little; on a touch screen a finger pushes them while it's
  // down (swiping parts them), and tilting the phone turns the world.
  const pointer = new THREE.Vector2(9, 9);
  const look = new THREE.Vector2(); // where you look at the world from: the mouse, or the phone's tilt
  const lookTo = new THREE.Vector2();
  let lastMove = 0;
  let fingers = 0;
  const aim = (x, y) => pointer.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1);
  addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    aim(e.clientX, e.clientY);
    lookTo.copy(pointer);
    lastMove = performance.now();
  }, { passive: true });
  const finger = (e) => {
    fingers = e.touches.length;
    if (fingers) aim(e.touches[0].clientX, e.touches[0].clientY);
  };
  for (const type of ['touchstart', 'touchmove', 'touchend', 'touchcancel']) addEventListener(type, finger, { passive: true });
  if (coarse && !still) {
    let rest = null; // how it's being held: the tilt is measured from there, and slowly follows it
    addEventListener('deviceorientation', (e) => {
      if (e.beta === null || e.gamma === null) return;
      const angle = screen.orientation?.angle || 0;
      let [x, y] = [e.gamma, e.beta];
      if (angle === 90) [x, y] = [e.beta, -e.gamma];
      else if (angle === 270 || angle === -90) [x, y] = [-e.beta, e.gamma];
      rest ||= { x, y };
      rest.x += (x - rest.x) * 0.02;
      rest.y += (y - rest.y) * 0.02;
      lookTo.set(THREE.MathUtils.clamp((x - rest.x) / 22, -1, 1), THREE.MathUtils.clamp((rest.y - y) / 22, -1, 1));
    });
  }
  const ray = new THREE.Raycaster();
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  const hit = new THREE.Vector3();

  // ---------- Every frame ----------
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    uniforms.uTime.value = now / 1000;
    uniforms.uT.value = morph.at < 0 ? 1 : Math.min(1, (now - morph.at) / morph.length);
    uniforms.uChaos.value = morph.chaos;

    // The world glides to its place for the scene
    const glide = Math.min(1, dt * 3);
    place.x += (place.tx - place.x) * glide;
    place.y += (place.ty - place.y) * glide;
    place.s += (place.ts - place.s) * glide;
    world.position.set(place.x, place.y, 0);
    world.scale.setScalar(place.s);
    uniforms.uScale.value = place.s;
    const charge = uniforms.uCharge.value + (chargeTo - uniforms.uCharge.value) * Math.min(1, dt * (chargeTo > uniforms.uCharge.value ? 10 : 6));
    uniforms.uCharge.value = charge;
    const t = now / 1000;
    look.lerp(lookTo, Math.min(1, dt * 3));
    flat += ((framed ? 1 : 0) - flat) * Math.min(1, dt * 4);
    world.rotation.y = still ? 0 : (Math.sin(t * 0.32) * 0.16 + look.x * 0.12) * (1 - flat);
    world.rotation.x = still ? 0 : look.y * -0.06 * (1 - flat);
    dustUniforms.uLook.value.copy(look);

    // The jump between scenes: a quick surge, then it eases off; the field of view widens with the speed
    const since = warpAt < 0 ? 9 : (now - warpAt) / 1000;
    const surge = since < 0.16 ? since / 0.16 : Math.exp(-(since - 0.16) / 0.3);
    if (since > 0.4) flowNext = 0; // no morph came with that scene change
    const speed = still ? 0 : 0.07 + surge * 26;
    dustUniforms.uFlow.value += speed * (surge > 0.02 ? warpDir : 1) * dt;
    dustUniforms.uSpeed.value = surge * 26;
    const fov = 35 + surge * 9;
    if (Math.abs(camera.fov - fov) > 0.005) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
      uniforms.uUnitPx.value = renderer.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(fov / 2)));
    }

    // The aura shows once the shape has landed, and roars with a charge
    const landed = uniforms.uT.value ** 3;
    const auraTo = still ? 0 : auraWant * landed * (1 - charge) + charge * 1.4;
    auraUniforms.uAura.value += (auraTo - auraUniforms.uAura.value) * Math.min(1, dt * 5);

    for (const ring of rings) {
      const k = ring.at < 0 ? 1 : (now - ring.at) / (650 + ring.power * 180);
      ring.mesh.visible = k < 1;
      if (k >= 1) continue;
      ring.mesh.scale.setScalar(0.4 + (1 - (1 - k) ** 3) * (2.6 + ring.power * 1.4) * 2);
      ring.mesh.material.uniforms.uK.value = k;
      ring.mesh.material.uniforms.uPower.value = ring.power;
    }

    // The tub: grows out of the energy, spins in, shrinks back into it
    const want = tubWant && now >= tubDelay ? 1 : 0;
    tubAt += (want - tubAt) * Math.min(1, dt * (want ? 4.5 : 9));
    const pop = want ? 1 + Math.sin(Math.min(1, tubAt) * Math.PI) * 0.06 : 1;
    tub.scale.setScalar(Math.max(0.0001, tubAt * pop * TUB));
    tubSpin = tubSpin * Math.exp(-dt * 3.2) + charge * charge * dt * 18; // a charge spins the tub up too
    tub.rotation.y = 0.12 + (still ? 0 : Math.sin(t * 0.5) * 0.3) + tubSpin;
    tub.visible = tubAt > 0.01;

    // The pointer, in the world's own space; it stops pushing a moment after it stops moving
    ray.setFromCamera(pointer, camera);
    if (ray.ray.intersectPlane(plane, hit)) {
      world.worldToLocal(hit);
      uniforms.uMouse.value.copy(hit);
    }
    const active = (coarse ? fingers > 0 : now - lastMove < 1800) ? 1 : 0;
    uniforms.uPush.value += (active - uniforms.uPush.value) * Math.min(1, dt * (coarse ? 8 : 4));

    // The sharp photo over its particles: where the world puts them, once they've landed (and not while held)
    if (framed && portrait) {
      const unit = innerHeight / (2 * 7 * Math.tan(THREE.MathUtils.degToRad(17.5)));
      portrait.style.setProperty('--px', (innerWidth / 2 + place.x * unit).toFixed(1));
      portrait.style.setProperty('--py', (innerHeight / 2 - place.y * unit).toFixed(1));
      portrait.style.setProperty('--pw', (framed.full.w * place.s * unit).toFixed(1));
      portrait.style.setProperty('--ph', (framed.full.h * place.s * unit).toFixed(1));
      if (now - framed.at > 400 && portrait.getAttribute('src') !== framed.src) portrait.src = framed.src; // once the last one faded
      const show = now >= framed.from && charge < 0.05 && portrait.complete && portrait.naturalWidth > 0 && portrait.getAttribute('src') === framed.src;
      if (show !== portrait.classList.contains('is-shown')) portrait.classList.toggle('is-shown', show);
    }

    renderer.render(scene, camera);
  }

  size();
  dress();
  // The tub's materials compile now, in the background (compile() only looks at what's visible), so the tub doesn't
  // stall the page the first time it condenses in the Lab
  tub.visible = true;
  renderer.compileAsync(scene, camera).catch(() => {});
  tub.visible = false;
  addEventListener('resize', size);
  // Placed for the first scene straight away; main.js then says what it shows (rsw:ready) and the big bang plays
  const first = document.querySelector('.scene.is-active') || document.querySelector('.scene');
  side = first?.dataset.side || 'right';
  layout();
  place.x = place.tx;
  place.y = place.ty;
  place.s = place.ts;
  canvas.classList.add('is-live');
  dispatchEvent(new Event('rsw:ready'));
  // Every picture the scenes use is turned into particles ahead of time, one at a time while the page is idle
  const idle = window.requestIdleCallback || ((f) => setTimeout(f, 200));
  const pictures = [...new Set([...document.querySelectorAll('[data-photo], [data-photo-manga]')]
    .flatMap((el) => [el.dataset.photo, el.dataset.photoManga]).filter(Boolean))];
  setTimeout(function warm() {
    const src = pictures.shift();
    if (src) idle(() => photoShape(src).catch(() => {}).finally(() => setTimeout(warm, 80)));
  }, 3000);

  let running = false;
  const loop = (now) => {
    if (!running) return;
    frame(now);
    requestAnimationFrame(loop);
  };
  const wake = () => {
    if (document.hidden) {
      running = false;
      return;
    }
    if (!running) {
      running = true;
      last = performance.now();
      requestAnimationFrame(loop);
    }
  };
  document.addEventListener('visibilitychange', wake);
  wake();
})();
