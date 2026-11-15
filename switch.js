// ---------- One site, two modes (shared by clean/ and manga/, loaded before each page's main.js) ----------
// Clean and Manga are two pages. Switching plays the next mode's transformation over this page (switch.css), and
// under full cover moves to the other page, leaving it a note in this tab ('rsw-via'). The other page's head script
// reads the note before its first paint, so that paint is the same cover, and the page lifts it once it's ready
// (arrive). The music carries on where it was.
const modes = (() => {
  const root = document.documentElement;
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const pages = { clean: '../clean/index.html', manga: '../manga/index.html' };
  const covered = { manga: 560, clean: 760 }; // ms until the leaving page is under full cover
  const lifting = { manga: 900, clean: 800 }; // ms the arriving page takes to uncover
  const via = window.rswVia || null; // the note this page arrived with (its head script)
  const music = document.querySelector('.music');
  let leaving = false;

  // The covers' words must never change font halfway, so their fonts load ahead
  if (!still) {
    const idle = window.requestIdleCallback || ((f) => setTimeout(f, 1500));
    idle(() => Promise.all([['400 1em Anton', 'CLEAN TRANSFORM'], ['800 1em Montserrat', 'LIGHT ON BLACK'], ['1em "Dela Gothic One"', '変身!!クリーン']]
      .map(([font, text]) => document.fonts.load(font, text))).catch(() => {}));
  }

  // While a cover is up, the wheel and the keys don't reach the page underneath (touch: switch.css)
  const hold = (e) => {
    if (!leaving && !root.classList.contains('is-arriving')) return;
    e.preventDefault();
    e.stopImmediatePropagation();
  };
  addEventListener('wheel', hold, { capture: true, passive: false });
  addEventListener('keydown', hold, { capture: true });

  // Cover this page from the origin (the switch, or a side of the mode picker), then go to the mode's page. It
  // replaces this page in the history, as an in-page switch would: Back leaves the site rather than flipping modes.
  function leave(mode, origin) {
    if (leaving || root.dataset.mode === mode) return;
    leaving = true;
    try { localStorage.setItem('rsw-mode', mode); } catch { /* private mode: not kept */ }
    const go = () => location.replace(pages[mode]);
    if (still || !origin) return go();
    const r = origin.getBoundingClientRect();
    const x = Math.round(r.left + r.width / 2);
    const y = Math.round(r.top + r.height / 2);
    root.style.setProperty('--vt-x', `${x}px`);
    root.style.setProperty('--vt-y', `${y}px`);
    const playing = music && !music.paused ? music.currentTime : null;
    try {
      sessionStorage.setItem('rsw-via', JSON.stringify({ mode, x, y, music: playing, at: Date.now() }));
    } catch { /* the next page just shows, without the cover */ }
    root.classList.add('is-leaving', mode === 'manga' ? 'is-henshin' : 'is-launching');
    setTimeout(go, covered[mode]);
  }

  // The music picks up where the last page left it (the browser may still wait for a click: main.js starts it then)
  if (via && typeof via.music === 'number' && music) {
    music.currentTime = via.music;
    music.play().catch(() => {});
  }

  // Lift the cover this page arrived under once ready() resolves, or after 2.5 s whatever happens; then() runs as it
  // starts to lift
  function arrive(ready, then) {
    if (!via) return;
    Promise.race([ready, new Promise((resolve) => { setTimeout(resolve, 2500); })])
      .catch(() => {})
      .then(() => requestAnimationFrame(() => {
        root.classList.add('is-revealing');
        then?.();
        setTimeout(() => root.classList.remove('is-arriving', 'is-revealing', 'is-henshin', 'is-launching'), lifting[via.mode]);
      }));
  }

  return { leave, arrive, via };
})();
