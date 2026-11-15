// RSW v3: the page's behaviour. Seven full-screen scenes, one at a time, over the world (world.js). Plain script, no
// build step. Sections follow the page; each one only touches its own part of it.
const root = document.documentElement;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = matchMedia('(pointer: fine)').matches;
const keep = {
  get: (key, store = localStorage) => { try { return store.getItem(key); } catch { return null; } },
  set: (key, value, store = localStorage) => { try { store.setItem(key, value); } catch { /* private mode: not kept */ } },
};
const clamp01 = (n) => Math.min(1, Math.max(0, n));
const rupees = (n) => `₹${n.toLocaleString('en-IN')}`;
const tell = (name, detail) => dispatchEvent(new CustomEvent(name, { detail })); // to world.js
// A tick under the thumb on phones that can (only after a tap: Chrome refuses, loudly, before one)
const buzz = (pattern) => { if (navigator.userActivation?.hasBeenActive) navigator.vibrate?.(pattern); };

// A scene's label decodes as the scene comes on, like a readout locking on
const glyphs = 'ABCDEFGHJKLMNPRSTUVWXYZ0123456789#%&*+=<>/';
function decode(el) {
  if (!el || reduceMotion) return;
  const parts = [...el.childNodes].filter((n) => n.nodeType === Node.TEXT_NODE && n.textContent.trim());
  const start = performance.now();
  for (const node of parts) node.final ??= node.textContent;
  requestAnimationFrame(function tick(now) {
    const k = clamp01((now - start - 380) / 520);
    for (const node of parts) {
      const done = Math.floor(node.final.length * k);
      node.textContent = [...node.final].map((ch, i) => (i < done || ch === ' ' ? ch : glyphs[Math.floor(Math.random() * glyphs.length)])).join('');
    }
    if (k < 1) requestAnimationFrame(tick);
  });
}

// ---------- Products: read once from the Lab's list, the one place they're written ----------
const products = new Map([...document.querySelectorAll('.product[data-id]')].map((el) => {
  const price = el.querySelector('.price b').textContent;
  return [el.dataset.id, {
    id: el.dataset.id,
    el,
    kana: el.dataset.kana,
    type: el.querySelector('.product-type').textContent,
    name: el.querySelector('.product-name').textContent,
    flavour: el.querySelector('.product-flavour').textContent,
    about: el.querySelector('.product-about').textContent,
    price,
    value: Number(price.replace(/\D/g, '')),
    picture: (mode) => (mode === 'manga' ? el.dataset.picManga : el.dataset.pic),
  }];
}));

// ---------- Titles rise letter by letter (styles.css); screen readers get each line whole ----------
// After the products are read: a product's name is one of these lines.
// Each word stays whole (it must not break between letters), each letter is an <i> with its place (--c) in the line.
function letters(line, text = line.textContent) {
  const said = document.createElement('span');
  said.className = 'sr';
  said.textContent = text;
  const shown = document.createElement('span');
  shown.className = 'letters';
  shown.setAttribute('aria-hidden', 'true');
  let c = 0;
  text.split(' ').forEach((word, i) => {
    if (i) shown.append(' ');
    const w = document.createElement('span');
    w.className = 'word';
    for (const ch of word) {
      const letter = document.createElement('i');
      letter.textContent = ch;
      letter.style.setProperty('--c', c++);
      w.append(letter);
    }
    shown.append(w);
  });
  line.replaceChildren(said, shown);
}
document.querySelectorAll('.title > span, .product-name').forEach((line) => letters(line));

// ---------- The visitor's name: the site becomes theirs ----------
// Typed in the first scene, the energy writes it as it comes (world.js, rsw:scene with shape 'name'). It's kept in this
// browser only, and it goes on their tub's label (rsw:name), their plan, their cart and their final form; next time the
// big bang opens on it.
const nameForm = document.querySelector('.name-form');
const nameInput = nameForm.elements.name;
const tidyName = (text) => text.replace(/[^\p{L}\p{M}\p{N} .'-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 14);
let you = tidyName(keep.get('rsw-name') || '');
let typed = you; // what the energy shows in the first scene: the name as it's being typed
nameInput.value = you;
const finalLines = [...document.querySelectorAll('#final-title > span')];
const flashName = document.querySelector('.flash small');
const cartTitle = document.querySelector('#cart-title');
function personalize() {
  root.classList.toggle('is-named', Boolean(you));
  letters(finalLines[0], you ? `${you}’s` : 'Tap into');
  letters(finalLines[1], you ? 'final form.' : 'your final form.');
  flashName.textContent = you ? `${you} · Final form` : 'Final form';
  cartTitle.textContent = you ? `${you}’s stack` : 'Your cart';
  tell('rsw:name', you);
}
let nameTimer = 0;
nameInput.addEventListener('input', () => {
  clearTimeout(nameTimer);
  nameTimer = setTimeout(() => {
    const next = tidyName(nameInput.value);
    if (next === typed) return;
    typed = next;
    if (scenes[at].id === 'power') tell('rsw:scene', { ...worldFor(scenes[at]), quick: true });
    you = next;
    if (you) keep.set('rsw-name', you);
    else { try { localStorage.removeItem('rsw-name'); } catch { /* not kept anyway */ } }
    personalize();
  }, 180);
});
// Enter, or the arrow: locked in. A burst of power, and the keyboard goes away
nameForm.addEventListener('submit', (e) => {
  e.preventDefault();
  nameInput.blur();
  if (!tidyName(nameInput.value)) return nameInput.focus();
  tell('rsw:pulse', 2.4);
  buzz([20, 40, 60]);
});

// ---------- The deck: one scene at a time ----------
// A scroll, a swipe, the arrow keys or a link move to a scene. The old one plays out, the world reshapes, the new one
// plays in (styles.css). While a scene changes, more scrolling waits; a trackpad's glide after a flick doesn't count
// as a new one. Without this script the scenes simply stack as a long page.
const scenes = [...document.querySelectorAll('.scene')];
const indexLinks = [...document.querySelectorAll('.index a')];
const nowNum = document.querySelector('[data-now="num"]');
const nowName = document.querySelector('[data-now="name"]');
const nextButton = document.querySelector('.next');
const nextText = nextButton.querySelector('.next-text');
const frame = document.querySelector('.frame');
const sfx = frame.querySelector('.frame-sfx');
const sounds = ['ドンッ', 'ゴゴゴ', 'バーン', 'シュッ', 'ピカッ', 'ズドン'];
let at = Math.max(0, scenes.findIndex((s) => location.hash === `#${s.id}`));
let busyUntil = 0;
let wantsFresh = false;
root.classList.add('deck-on');

function hud() {
  const scene = scenes[at];
  nowNum.textContent = String(at + 1).padStart(2, '0');
  nowName.textContent = scene.dataset.name;
  indexLinks.forEach((a, i) => (i === at ? a.setAttribute('aria-current', 'step') : a.removeAttribute('aria-current')));
  nextText.textContent = at === 0 ? `${finePointer ? 'Scroll' : 'Swipe up'} to power up` : at === scenes.length - 1 ? 'Back to the start' : `Next: ${scenes[at + 1].dataset.name}`;
  root.dataset.scene = scene.id;
}

function go(i, { focus = false } = {}) {
  i = Math.max(0, Math.min(scenes.length - 1, i));
  if (i === at) return;
  const leaving = scenes[at];
  const coming = scenes[i];
  const dir = i > at ? 1 : -1;
  root.style.setProperty('--dir', dir);
  tell('rsw:warp', dir); // before the new scene's shape, so the energy streams the way you're going
  buzz(9);
  at = i;
  leaving.classList.remove('is-active');
  leaving.classList.add('is-leaving');
  leaving.inert = true;
  coming.classList.remove('is-leaving');
  coming.classList.add('is-active');
  coming.inert = false;
  clearTimeout(leaving.leaveTimer);
  leaving.leaveTimer = setTimeout(() => leaving.classList.remove('is-leaving'), reduceMotion ? 0 : 700);
  busyUntil = performance.now() + (reduceMotion ? 250 : 1050);
  wantsFresh = true;
  closeSheets();
  hud();
  history.replaceState(null, '', `#${coming.id}`);
  enter(coming);
  decode(coming.querySelector('.kicker'));
  sync();
  // Manga cuts like a page turn: speed lines flash and a sound effect pops
  if (root.dataset.mode === 'manga' && !reduceMotion) {
    sfx.textContent = sounds[i % sounds.length];
    frame.classList.remove('is-hit');
    void frame.offsetWidth;
    frame.classList.add('is-hit');
  }
  if (focus) coming.focus({ preventScroll: true });
}

scenes.forEach((scene, i) => {
  scene.tabIndex = -1;
  scene.classList.toggle('is-active', i === at);
  scene.inert = i !== at;
});
hud();

// What may scroll on its own: an open dialog or sheet, or a part of the scene that still has room that way
function scrollsItself(target, dy) {
  if (document.querySelector('dialog[open]') || root.classList.contains('sheet-open')) return true;
  for (let el = target instanceof Element ? target : null; el && el !== document.body; el = el.parentElement) {
    const style = getComputedStyle(el);
    if (!/(auto|scroll)/.test(style.overflowY) || el.scrollHeight <= el.clientHeight + 1) continue;
    if (dy > 0 ? el.scrollTop + el.clientHeight < el.scrollHeight - 1 : el.scrollTop > 0) return true;
  }
  return false;
}

let wheelSum = 0;
let lastWheel = 0;
addEventListener('wheel', (e) => {
  if (scrollsItself(e.target, e.deltaY)) return;
  e.preventDefault();
  const now = performance.now();
  const fresh = now - lastWheel > 200;
  lastWheel = now;
  if (wantsFresh) {
    if (!fresh || now < busyUntil) return; // the tail of the last flick
    wantsFresh = false;
  }
  if (now < busyUntil) return;
  wheelSum = fresh ? e.deltaY : wheelSum + e.deltaY;
  if (Math.abs(wheelSum) > 40) {
    go(at + Math.sign(wheelSum));
    wheelSum = 0;
  }
}, { passive: false });

addEventListener('keydown', (e) => {
  if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
  if (e.target.closest?.('input, textarea, select, dialog') || root.classList.contains('sheet-open')) return;
  const onControl = e.target.closest?.('button, a');
  const step = { ArrowDown: 1, PageDown: 1, ArrowUp: -1, PageUp: -1 }[e.key] ?? (e.key === ' ' && !onControl ? (e.shiftKey ? -1 : 1) : 0);
  if (step) {
    e.preventDefault();
    if (performance.now() >= busyUntil) go(at + step);
  } else if (e.key === 'Home' || e.key === 'End') {
    e.preventDefault();
    go(e.key === 'Home' ? 0 : scenes.length - 1);
  }
});

let touch = null;
addEventListener('touchstart', (e) => {
  const t = e.touches[0];
  touch = { x: t.clientX, y: t.clientY, at: performance.now(), target: e.target };
}, { passive: true });
addEventListener('touchend', (e) => {
  if (!touch) return;
  const t = e.changedTouches[0];
  const dx = t.clientX - touch.x;
  const dy = touch.y - t.clientY;
  const quick = performance.now() - touch.at < 900;
  if (quick && Math.abs(dy) > 60 && Math.abs(dy) > Math.abs(dx) * 1.3 && !scrollsItself(touch.target, dy) && performance.now() >= busyUntil) {
    go(at + Math.sign(dy));
  } else if (quick && Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.3 && !touch.target.closest?.('.switcher, .crew, input, .sheet, dialog')) {
    sideways(dx < 0 ? 1 : -1); // the row of thumbnails scrolls itself
  }
  touch = null;
}, { passive: true });

// A swipe sideways changes what's on stage: the Lab's product, the science's step, the warrior
function sideways(step) {
  const scene = scenes[at].id;
  const turn = (i, n) => (i + step + n) % n;
  if (scene === 'lab') pick(order[turn(order.indexOf(onShow), order.length)], step);
  else if (scene === 'science' || scene === 'warriors') {
    clearInterval(sceneTimer); // you took over: no more turns
    if (scene === 'science') showStep(turn(stepAt, steps.length));
    else showWarrior(turn(crewAt, crew.length));
  } else return;
  buzz(6);
}

// Links to a scene move to it instead of jumping the page
document.addEventListener('click', (e) => {
  const link = e.target.closest('a[href^="#"]');
  if (!link) return;
  const i = scenes.findIndex((s) => link.hash === `#${s.id}`);
  if (link.hash === '#main') {
    e.preventDefault();
    scenes[at].focus();
    return;
  }
  if (i < 0) return;
  e.preventDefault();
  if (link.dataset.productLink) pick(link.dataset.productLink);
  if (link.closest('.cart')) cartDialog.close();
  go(i, { focus: link.closest('.index') !== null });
});
nextButton.addEventListener('click', () => go(at === scenes.length - 1 ? 0 : at + 1));
// A scene's address typed or pasted while the page is open
addEventListener('hashchange', () => {
  const i = scenes.findIndex((s) => location.hash === `#${s.id}`);
  if (i >= 0) go(i);
});

// ---------- Hold anywhere on the stage to power up ----------
// While you hold, the shape winds into a vortex (world.js) and the screen shakes harder; let go and it bursts. Held to
// the full: the final form flashes over everything. A quick tap just sends a shockwave; a swipe cancels the hold.
let hold = null;
function charge(level) {
  tell('rsw:charge', level);
  root.style.setProperty('--charge', level.toFixed(3));
  root.classList.toggle('is-charging', level > 0);
}
function charging(now) {
  if (!hold) return;
  hold.level = reduceMotion ? 0 : clamp01((now - hold.at - 200) / 1500); // the first 0.2 s is still a tap
  charge(hold.level);
  if (hold.level >= 1) finalForm();
  else requestAnimationFrame(charging);
}
function finalForm() {
  hold = null;
  charge(0);
  tell('rsw:pulse', 3.2);
  if (navigator.userActivation?.hasBeenActive) navigator.vibrate?.([30, 50, 120]); // phones only buzz after a tap
  root.classList.remove('is-final');
  void root.offsetWidth;
  root.classList.add('is-final');
  clearTimeout(finalForm.timer);
  finalForm.timer = setTimeout(() => root.classList.remove('is-final'), 1900);
}
document.querySelector('.deck').addEventListener('pointerdown', (e) => {
  if (e.button > 0 || e.target.closest('a, button, input, label, .product, .quiz, .crew, .end, .check-form, .steps, .name-form')) return;
  hold = { id: e.pointerId, x: e.clientX, y: e.clientY, at: performance.now(), level: 0 };
  requestAnimationFrame(charging);
});
addEventListener('pointermove', (e) => {
  if (hold && e.pointerId === hold.id && !hold.level && Math.hypot(e.clientX - hold.x, e.clientY - hold.y) > 12) hold = null;
});
addEventListener('pointerup', (e) => {
  if (!hold || e.pointerId !== hold.id) return;
  const { level } = hold;
  hold = null;
  charge(0);
  tell('rsw:pulse', 1 + level * 1.5);
});
addEventListener('pointercancel', () => {
  if (!hold) return;
  hold = null;
  charge(0);
});

// ---------- Clean / Manga: Manga is its own page (../manga/), and ../switch.js transforms you there ----------
const toggle = document.querySelector('.mode-switch');
toggle.setAttribute('aria-pressed', 'false');
toggle.addEventListener('click', () => modes.leave('manga', toggle));

// The scene on show plays its entrance again (once the mode picker closes, or the cover from Manga lifts), with a
// shockwave through the world unless the big bang is about to play
function replay(pulse = true) {
  const scene = scenes[at];
  scene.classList.remove('is-active');
  void scene.offsetWidth;
  scene.classList.add('is-active');
  decode(scene.querySelector('.kicker'));
  if (pulse) tell('rsw:pulse');
}

// Every visit opens on the choice of mode; a reload in the same tab doesn't ask again
const modeDialog = document.querySelector('.mode-dialog');
if (!keep.get('rsw-asked', sessionStorage)) {
  modeDialog.showModal();
  modeDialog.focus(); // not the first side's button, so neither side starts out picked
  keep.set('rsw-asked', '1', sessionStorage);
}
modeDialog.addEventListener('click', (e) => {
  const choice = e.target.closest('[data-pick]');
  if (!choice) return;
  if (choice.dataset.pick === 'manga') modes.leave('manga', choice); // first, while the button can still be measured
  modeDialog.close(choice.dataset.pick);
});
modeDialog.addEventListener('close', () => {
  if (modeDialog.returnValue === 'manga') return;
  if (held) release(); // the big bang waited for the choice
  else replay();
});

// ---------- The Lab: the product on show ----------
const switches = [...document.querySelectorAll('[data-product]')];
const labKana = document.querySelector('[data-lab-kana]');
const order = [...products.keys()];
let onShow = order[0];

// The numbers count up to their values when a product comes on
function countUp(dd) {
  const text = dd.dataset.value ||= dd.textContent;
  const [, number, unit] = text.match(/^([\d.]+)(.*)$/) || [];
  if (!number || reduceMotion) return;
  const to = Number(number);
  const places = number.includes('.') ? 1 : 0;
  const start = performance.now();
  requestAnimationFrame(function tick(now) {
    const k = clamp01((now - start - 250) / 700);
    dd.textContent = `${(to * (1 - (1 - k) ** 3)).toFixed(places)}${unit}`;
    if (k < 1) requestAnimationFrame(tick);
  });
}

// dir: which way it came (1 from the right), for the slide and the tub's spin; by default, its place in the range
function pick(id, dir = Math.sign(order.indexOf(id) - order.indexOf(onShow)) || 1) {
  const p = products.get(id);
  if (!p || id === onShow) return;
  onShow = id;
  root.style.setProperty('--pdir', dir);
  products.forEach((q) => {
    q.el.classList.toggle('is-on', q.id === id);
    q.el.inert = q.id !== id;
  });
  switches.forEach((b) => b.setAttribute('aria-pressed', b.dataset.product === id));
  labKana.textContent = p.kana;
  labKana.style.setProperty('--kana-len', [...p.kana].length);
  p.el.querySelectorAll('.product-stats dd').forEach(countUp);
  tell('rsw:product', { id, dir });
}
products.forEach((q) => { q.el.inert = q.id !== onShow; });
labKana.style.setProperty('--kana-len', [...products.get(onShow).kana].length);
switches.forEach((b) => b.addEventListener('click', () => pick(b.dataset.product)));
document.querySelectorAll('[data-step]').forEach((b) => b.addEventListener('click', () => {
  pick(order[(order.indexOf(onShow) + Number(b.dataset.step) + order.length) % order.length], Number(b.dataset.step));
}));

// ---------- What the world shows in each scene ----------
// Most scenes have one shape (data-shape). The Lab shows the tub on show; the science steps and the warriors each show
// a picture in particles (each mode has its own); the final form condenses from its burst into the warrior.
const steps = [...document.querySelectorAll('.steps button')];
const crew = [...document.querySelectorAll('.crew li')];
const crewNow = document.querySelector('.crew-now');
let stepAt = 0;
let crewAt = 0;
let finalPicture = false;
let sceneTimer = 0;
const picture = (el) => (root.dataset.mode === 'manga' ? el.dataset.photoManga : el.dataset.photo);

function worldFor(scene) {
  const side = scene.dataset.side;
  const step = steps[stepAt];
  switch (scene.id) {
    case 'lab': return { shape: 'tub', product: onShow, side };
    case 'science': return step.dataset.tub ? { shape: 'tub', product: step.dataset.tub, side } : { shape: 'photo', photo: picture(step), side };
    case 'warriors': return { shape: 'photo', photo: picture(crew[crewAt]), side };
    case 'power': return typed ? { shape: 'name', text: typed, side } : { shape: 'logo', side };
    case 'final': return !finalPicture ? { shape: 'burst', side }
      : you ? { shape: 'name', text: you, aura: 1.3, side } : { shape: 'photo', photo: picture(scene), side };
    default: return { shape: scene.dataset.shape, side };
  }
}
function sync() {
  tell('rsw:scene', worldFor(scenes[at]));
}
// The world has loaded: show it the scene, and the big bang plays. It waits while something covers the page, the
// cover from Manga or the mode picker of a first visit, and plays as that goes, with the scene's words.
let held = Boolean(modes.via) || modeDialog.open;
addEventListener('rsw:ready', () => {
  if (!held) sync();
});
function release() {
  held = false;
  sync();
  replay(false);
}
modes.arrive(Promise.all([new Promise((resolve) => { addEventListener('rsw:ready', resolve, { once: true }); }), document.fonts.ready]), release);

// Manga marks a new picture like a panel cut: speed lines and a sound effect
function cut(sound) {
  if (root.dataset.mode !== 'manga' || reduceMotion || !sound) return;
  sfx.textContent = sound;
  frame.classList.remove('is-hit');
  void frame.offsetWidth;
  frame.classList.add('is-hit');
}

function showStep(i, tellWorld = true) {
  stepAt = i;
  steps.forEach((b, k) => b.setAttribute('aria-pressed', k === i));
  if (tellWorld) {
    cut(steps[i].dataset.sfx);
    sync();
  }
}
function showWarrior(i, tellWorld = true) {
  crewAt = i;
  crew.forEach((li, k) => (k === i ? li.setAttribute('aria-current', 'true') : li.removeAttribute('aria-current')));
  const caption = crew[i].querySelector(root.dataset.mode === 'manga' ? 'p .manga-only' : 'p .clean-only');
  crewNow.textContent = `${String(i + 1).padStart(2, '0')} / ${String(crew.length).padStart(2, '0')} · ${caption.textContent}`;
  if (tellWorld) {
    cut(crew[i].dataset.sfx);
    sync();
  }
}
steps.forEach((b, i) => b.addEventListener('click', () => {
  clearInterval(sceneTimer); // you picked one: no more turns
  showStep(i);
}));
crew.forEach((li, i) => li.querySelector('button').addEventListener('click', () => {
  clearInterval(sceneTimer);
  showWarrior(i);
}));

// A scene coming on: the science and the warriors take turns every few seconds; the final burst condenses after two
function enter(scene) {
  clearInterval(sceneTimer);
  clearTimeout(sceneTimer);
  finalPicture = reduceMotion;
  if (scene.id === 'science') {
    showStep(0, false);
    if (!reduceMotion) sceneTimer = setInterval(() => showStep((stepAt + 1) % steps.length), 4600);
  } else if (scene.id === 'warriors') {
    if (!reduceMotion) sceneTimer = setInterval(() => showWarrior((crewAt + 1) % crew.length), 4600);
  } else if (scene.id === 'final' && !reduceMotion) {
    sceneTimer = setTimeout(() => {
      finalPicture = true;
      sync();
    }, 2000);
  }
}
showWarrior(0, false);
enter(scenes[at]);

// ---------- Cart: kept in this tab until the shop's real checkout exists ----------
const cartDialog = document.querySelector('.cart');
const cartLines = cartDialog.querySelector('.cart-lines');
const cart = new Map(JSON.parse(keep.get('rsw-cart', sessionStorage) || '[]').filter(([id]) => products.has(id)));
const freeShipping = 999;

function drawCart() {
  let count = 0;
  let total = 0;
  cartLines.replaceChildren(...[...cart].map(([id, qty]) => {
    const p = products.get(id);
    count += qty;
    total += p.value * qty;
    const li = document.createElement('li');
    li.innerHTML = `<img src="${p.picture(root.dataset.mode)}" alt="" width="80" height="100">
      <p><b>${p.name}</b> <span>${p.flavour}</span></p>
      <p class="qty"><button type="button" data-qty="-1" aria-label="One less ${p.name}">−</button>
      <output aria-label="Quantity">${qty}</output>
      <button type="button" data-qty="1" aria-label="One more ${p.name}">+</button></p>
      <b class="line-total">${rupees(p.value * qty)}</b>`;
    li.dataset.id = id;
    return li;
  }));
  cartDialog.classList.toggle('is-empty', !count);
  cartDialog.querySelector('.cart-total b').textContent = rupees(total);
  cartDialog.querySelector('.cart-ship').textContent = !count ? ''
    : total >= freeShipping ? 'Free shipping unlocked.'
    : `${rupees(freeShipping - total)} away from free shipping.`;
  document.querySelectorAll('.cart-count').forEach((b) => {
    b.textContent = count;
    b.dataset.count = count;
  });
  document.querySelectorAll('.cart-btn').forEach((b) => b.setAttribute('aria-label', count ? `Cart, ${count} item${count > 1 ? 's' : ''}` : 'Cart, empty'));
  keep.set('rsw-cart', JSON.stringify([...cart]), sessionStorage);
}

// The tub flies from where it stands into the cart, in an arc; the count bumps when it lands
function fly(id, button, then) {
  const target = [...document.querySelectorAll('.cart-btn')].find((b) => b.offsetParent);
  if (reduceMotion || !target) return then();
  const pickImg = button?.closest('.plan-pick')?.querySelector('img');
  const tall = innerWidth / innerHeight < 0.9;
  const size = pickImg ? null : Math.min(innerHeight * (tall ? 0.3 : 0.5), 420);
  const a = pickImg?.getBoundingClientRect() || {
    left: innerWidth * (tall ? 0.5 : 0.72) - size * 0.4,
    top: innerHeight * (tall ? 0.27 : 0.5) - size / 2,
    width: size * 0.8,
    height: size,
  };
  const b = target.getBoundingClientRect();
  const tub = new Image();
  tub.src = products.get(id).picture(root.dataset.mode);
  tub.className = 'flyer';
  tub.alt = '';
  Object.assign(tub.style, { left: `${a.left}px`, top: `${a.top}px`, width: `${a.width}px`, height: `${a.height}px` });
  document.body.append(tub);
  const dx = b.left + b.width / 2 - (a.left + a.width / 2);
  const dy = b.top + b.height / 2 - (a.top + a.height / 2);
  tub.animate([
    { transform: 'translate(0, 0) scale(0.9) rotate(0deg)', opacity: 0 },
    { transform: 'translate(0, -20px) scale(1) rotate(0deg)', opacity: 1, offset: 0.15 },
    { transform: `translate(${dx * 0.45}px, ${dy * 0.45 - 160}px) scale(0.5) rotate(-14deg)`, offset: 0.55 },
    { transform: `translate(${dx}px, ${dy}px) scale(0.06) rotate(-40deg)`, opacity: 0.4 },
  ], { duration: 900, easing: 'cubic-bezier(0.55, 0, 0.35, 1)' }).onfinish = () => {
    tub.remove();
    then();
  };
}

function add(id, button) {
  cart.set(id, (cart.get(id) || 0) + 1);
  keep.set('rsw-cart', JSON.stringify([...cart]), sessionStorage); // now, in case the page changes mode mid-flight
  fly(id, button, () => {
    drawCart();
    document.querySelectorAll('.cart-count').forEach((c) => {
      c.classList.remove('is-bumped');
      void c.offsetWidth;
      c.classList.add('is-bumped');
    });
  });
  if (button) {
    const label = button.dataset.label ||= button.textContent;
    button.textContent = 'Added ✓';
    button.classList.add('is-added');
    clearTimeout(button.addedTimer);
    button.addedTimer = setTimeout(() => {
      button.textContent = label;
      button.classList.remove('is-added');
    }, 1400);
  }
}

document.addEventListener('click', (e) => {
  const adder = e.target.closest('[data-add]');
  if (adder) add(adder.dataset.add, adder);
  if (e.target.closest('.cart-btn')) {
    drawCart(); // its pictures follow the mode
    cartDialog.showModal();
  }
});
cartLines.addEventListener('click', (e) => {
  const step = e.target.closest('[data-qty]');
  if (!step) return;
  const { id } = step.closest('li').dataset;
  const qty = (cart.get(id) || 0) + Number(step.dataset.qty);
  if (qty > 0) cart.set(id, qty);
  else cart.delete(id);
  drawCart();
});
cartDialog.querySelector('.cart-close').addEventListener('click', () => cartDialog.close());
cartDialog.addEventListener('click', (e) => {
  if (e.target === cartDialog) cartDialog.close(); // the backdrop
});
drawCart();
personalize();

// ---------- Sheets: the batch report and Sensei's plan slide over the scene ----------
const sheets = [...document.querySelectorAll('.sheet')];
function openSheet(sheet) {
  sheets.forEach((s) => { if (s !== sheet) s.hidden = true; });
  sheet.hidden = false;
  sheet.scrollTop = 0;
  root.classList.add('sheet-open');
  sheet.focus({ preventScroll: true });
}
function closeSheets() {
  sheets.forEach((s) => { s.hidden = true; });
  root.classList.remove('sheet-open');
}
document.querySelectorAll('.sheet-close').forEach((b) => b.addEventListener('click', closeSheets));
addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && root.classList.contains('sheet-open')) closeSheets();
});
document.querySelector('.deck').addEventListener('click', (e) => {
  if (root.classList.contains('sheet-open') && !e.target.closest('.check-form, .quiz, .code-chip')) closeSheets();
});

// ---------- Batch check ----------
// placeholder: two sample batches until the first real lab reports
const SAMPLE_BATCHES = [
  { batch: 'CR-2611-07', check: '4F9K2A', product: 'Creatine Monohydrate · 250 g', made: 'Nov 2026', best: 'Oct 2028',
    date: '05 Nov 2026', measure: 'Creatine purity', claim: 99.9, found: 99.7, unit: '%' },
  { batch: 'WP-2610-03', check: '7H2MX9', product: 'Whey Protein · Double Chocolate · 1 kg', made: 'Oct 2026', best: 'Apr 2028',
    date: '18 Oct 2026', measure: 'Protein per 30 g scoop', claim: 24, found: 24.6, unit: ' g' },
];
const checkForm = document.querySelector('.check-form');
const report = document.querySelector('.report');
const checkError = checkForm.querySelector('.check-error');
const [claimGauge, foundGauge] = report.querySelectorAll('.gauge');
const bare = (code) => code.toUpperCase().replace(/[^A-Z0-9]/g, '');
let checkRun = 0;
const fill = (name, text) => report.querySelectorAll(`[data-slot="${name}"]`).forEach((el) => { el.textContent = text; });

checkForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const batch = bare(checkForm.elements.batch.value);
  const check = bare(checkForm.elements.check.value);
  const found = SAMPLE_BATCHES.find((b) => bare(b.batch) === batch && b.check === check);
  checkError.textContent = !batch || !check ? 'Enter both codes from your tub.'
    : found ? ''
    : root.dataset.mode === 'manga' ? 'No reading. Check both codes on your tub, warrior.'
    : "We can't find that batch. Check both codes on your tub.";
  if (!found) return;
  if (reduceMotion) return showReport(found);
  // A beat of checking first, so the result feels looked up rather than instant
  const submit = checkForm.querySelector('[type="submit"]');
  submit.textContent = root.dataset.mode === 'manga' ? 'Scanning…' : 'Checking…';
  submit.disabled = true;
  tell('rsw:pulse');
  setTimeout(() => {
    submit.textContent = 'Check';
    submit.disabled = false;
    showReport(found);
  }, 700);
});

document.querySelector('[data-fill]').addEventListener('click', (e) => {
  const [batch, check] = e.currentTarget.dataset.fill.split(' ');
  checkForm.elements.batch.value = batch;
  checkForm.elements.check.value = check;
  checkForm.requestSubmit();
});

function showReport(found) {
  const run = ++checkRun;
  const amount = (n) => `${n.toFixed(1)}${found.unit}`;
  for (const key of ['product', 'batch', 'made', 'best', 'date', 'measure']) fill(key, found[key]);
  fill('claim', amount(found.claim));
  fill('found', amount(0));
  claimGauge.style.setProperty('--fill', 0);
  foundGauge.style.setProperty('--fill', 0);
  openSheet(report);
  report.classList.remove('is-verified');
  const start = performance.now();
  requestAnimationFrame(function tick(now) {
    if (run !== checkRun) return;
    const k = reduceMotion ? 1 : clamp01((now - start - 300) / 900);
    claimGauge.style.setProperty('--fill', k > 0 ? 1 : 0);
    foundGauge.style.setProperty('--fill', k > 0 ? Math.min(1, found.found / found.claim) : 0);
    fill('found', amount(found.found * (1 - (1 - k) ** 3)));
    if (k < 1) requestAnimationFrame(tick);
    else report.classList.add('is-verified');
  });
}

// ---------- Sensei: three taps, then a plan ----------
// placeholder: general advice; the brand should check it before launch
const diets = {
  muscle: 'Eat a little more than you burn: three meals and two snacks with protein in each, and rice, roti or oats around training.',
  lose: 'Eat a little less than you burn: half your plate vegetables, a quarter protein, a quarter roti or rice. Skip sugary drinks and fried snacks.',
};
const proteins = { veg: 'paneer, curd, dal, chana, rajma, soya chunks and milk', nonveg: 'eggs, chicken and fish, plus dal and curd' };
const workouts = {
  gym: {
    muscle: '4 days a week: chest and shoulders, back, legs, then full body. 3–4 sets of 6–12 reps, adding a little weight each week.',
    lose: '3 full-body weight sessions a week to keep your muscle, plus 2 brisk 30-minute cardio sessions. Walk 8,000 steps a day.',
  },
  home: {
    muscle: '4 days a week: push-ups, squats, lunges, pike push-ups and backpack rows. 3–4 slow sets close to your limit, harder each week.',
    lose: '5 days a week, 30 minutes: circuits of squats, push-ups, mountain climbers and burpees. Walk 8,000 steps a day.',
  },
};
const quiz = document.querySelector('.quiz');
const questions = [...quiz.querySelectorAll('.q')];
const plan = document.querySelector('.plan');
const picked = {};

function step(n) {
  quiz.dataset.step = n;
  questions.forEach((q, i) => { q.hidden = i !== n % questions.length; });
}

function writePlan() {
  const { goal, diet, train } = picked;
  const [id, why] = diet === 'veg' ? ['whey', 'Vegetarian meals often run short on protein, so a scoop of whey is an easy top-up.']
    : goal === 'muscle' ? ['creatine', 'Your meals already bring protein, so creatine is your next step.']
    : ['hydrate', 'Fat loss means lots of cardio, and electrolytes keep you going through it.'];
  const p = products.get(id);
  const chosen = questions.map((q) => q.querySelector(`[data-value="${picked[q.dataset.key]}"]`).textContent.trim());
  plan.innerHTML = `<button class="sheet-close" type="button" aria-label="Close the plan">×</button>
    <p class="plan-for">${chosen.join(' · ')}</p>
    <h3>${you ? `${you}’s` : 'Your'} Sensei plan</h3>
    <ol class="plan-parts">
      <li><b>Diet</b> ${diets[goal]} Protein from ${proteins[diet]}.</li>
      <li><b>Workout</b> ${workouts[train][goal]}</li>
      <li><b>Every day</b> About 1.6–2 g of protein per kg of body weight (110–140 g at 70 kg), water through the day and 7–9 hours of sleep.</li>
    </ol>
    <div class="plan-pick">
      <img src="${p.picture(root.dataset.mode)}" alt="" width="800" height="1000">
      <div>
        <p class="plan-pick-label">Sensei’s pick</p>
        <p class="plan-pick-name">${p.name} <span>${p.price}</span></p>
        <p>${why}</p>
        <button class="btn btn-main" type="button" data-add="${id}">Add to cart</button>
      </div>
    </div>
    <p class="plan-fine">General guidance, not medical advice. Talk to a doctor if you have a medical condition.</p>
    <button class="btn btn-ghost plan-again" type="button">Start over</button>`;
  plan.querySelector('.sheet-close').addEventListener('click', closeSheets);
}

quiz.addEventListener('click', (e) => {
  const choice = e.target.closest('.q button');
  if (!choice) return;
  const q = choice.closest('.q');
  picked[q.dataset.key] = choice.dataset.value;
  const n = questions.indexOf(q) + 1;
  if (n === questions.length) {
    writePlan();
    step(0);
    openSheet(plan);
    tell('rsw:pulse');
  } else {
    step(n);
    questions[n].querySelector('button').focus({ preventScroll: true });
  }
});
plan.addEventListener('click', (e) => {
  if (!e.target.closest('.plan-again')) return;
  closeSheets();
  step(0);
  questions[0].querySelector('button').focus({ preventScroll: true });
});
step(0);

// ---------- Music: on by default, from the visitor's first click or key (browsers allow sound only after one) ----------
// Picking a mode in the opening dialog is that first click. The switch mutes it and the choice is kept; it rests while
// the tab is hidden, and fades in whenever it starts.
const music = document.querySelector('.music');
const soundToggle = document.querySelector('.sound-toggle');
if (music) {
  let wanted = keep.get('rsw-music') !== 'off';
  let started = false;
  const loud = 0.6;
  const play = () => music.play().catch(() => { /* not allowed yet, or no song: stays off */ });
  const sync = () => soundToggle.setAttribute('aria-pressed', !music.paused);
  music.addEventListener('play', () => {
    sync();
    music.volume = 0;
    const from = performance.now();
    requestAnimationFrame(function fade(now) {
      music.volume = Math.min(loud, Math.max(0, (now - from) / 1500) * loud);
      if (music.volume < loud && !music.paused) requestAnimationFrame(fade);
    });
  });
  music.addEventListener('pause', sync);
  music.addEventListener('error', () => {
    started = true;
    soundToggle.hidden = true;
  });
  soundToggle.hidden = false;
  const start = (e) => {
    if (started || !wanted || (e.target instanceof Node && soundToggle.contains(e.target))) return;
    music.play().then(() => { started = true; }, () => { /* not allowed yet: the next click */ });
  };
  addEventListener('pointerdown', start, true);
  addEventListener('keydown', start, true);
  soundToggle.addEventListener('click', () => {
    started = true;
    wanted = music.paused;
    keep.set('rsw-music', wanted ? 'on' : 'off');
    if (wanted) play();
    else music.pause();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) music.pause();
    else if (wanted && started && !music.error) play();
  });
}
