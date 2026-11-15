"""Smoke test for RSW's Clean page, in headless Chromium: python3 check.py
Drives what a visitor does: the front door and the mode picker, the 変身 transformation into the Manga page
(../manga/, with its own check.py) and the way back, moving through the seven scenes (wheel, keys, links, swipe),
the Lab's products and the cart, the batch check, Sensei, the phone layout, and the page with reduced motion.
Exits non-zero on the first failure."""
import os
import pathlib
import re
import sys
import time
import urllib.parse

from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By

here = pathlib.Path(__file__).resolve().parent
# RSW_BASE=https://…/rsw-site-next runs it against a published copy instead of these files
base = os.environ.get("RSW_BASE", "").rstrip("/")
page = f"{base}/clean/index.html" if base else (here / "index.html").as_uri()
front_door = f"{base}/index.html" if base else (here.parent / "index.html").as_uri()
SCENES = ["power", "lab", "science", "proof", "sensei", "warriors", "final"]


def browser(reduced=False):
    opts = webdriver.ChromeOptions()
    for arg in ("--headless=new", "--enable-unsafe-swiftshader", "--mute-audio", "--window-size=1440,900"):
        opts.add_argument(arg)
    if reduced:
        opts.add_argument("--force-prefers-reduced-motion")
    opts.binary_location = "/usr/bin/chromium"
    opts.set_capability("goog:loggingPrefs", {"browser": "ALL"})
    return webdriver.Chrome(options=opts, service=Service("/usr/bin/chromedriver"))


def ok(cond, what):
    if not cond:
        sys.exit(f"FAIL: {what}")
    print(f"ok   {what}")


def wait(d, script, what, timeout=6):
    end = time.time() + timeout
    while time.time() < end:
        if d.execute_script(script):
            return
        time.sleep(0.1)
    ok(False, what)


def size(d, w, h):
    d.execute_cdp_cmd("Emulation.setDeviceMetricsOverride", {"width": w, "height": h, "deviceScaleFactor": 1, "mobile": w < 800})


def fresh(d, asked=True, hash_=""):
    d.get(page)
    d.execute_script("localStorage.clear(); sessionStorage.clear();" + ("sessionStorage.setItem('rsw-asked', '1');" if asked else ""))
    d.get(page + hash_)
    if hash_:
        d.refresh()  # a hash-only change doesn't reload the page
    d.execute_script("addEventListener('rsw:scene', (e) => { window.__world = e.detail; })")
    time.sleep(1)


def world(d):
    """What the page last told the world to show"""
    return d.execute_script("return window.__world || null") or {}


def active(d):
    return d.execute_script("return document.querySelector('.scene.is-active').id")


def settle(d):
    time.sleep(1.2)  # a scene change takes about a second; input waits for it


def page_is(d, name):
    return d.current_url.split("#")[0].endswith(f"/{name}/index.html")


def no_errors(d, label):
    bad = [m["message"] for m in d.get_log("browser") if m["level"] == "SEVERE"]
    ok(not bad, f"{label}: no console errors {bad[:2]}")


# Every Japanese letter on the page is in the Dela Gothic One subset (a missing one falls back to a box)
html = (here / "index.html").read_text()
used = set(re.findall(r"[぀-ヿ㐀-鿿]", "".join((here / f).read_text() for f in ("index.html", "styles.css", "main.js", "world.js"))))
subset = urllib.parse.unquote(re.search(r"Dela\+Gothic\+One&text=([^&\"]+)", html).group(1))
ok(used <= set(subset), f"font subset has every Japanese letter (missing: {''.join(sorted(used - set(subset)))})")

d = browser()
try:
    size(d, 1440, 900)

    # ---------- First visit: the front door, the mode picker, then 変身 into the Manga page and back ----------
    # Every page logs how <html>'s classes change from its very start, and when it tells the world what to show
    d.execute_cdp_cmd("Page.addScriptToEvaluateOnNewDocument", {"source": """
        window.classLog = []; window.sceneLog = [];
        const t0 = performance.now(), now = () => Math.round(performance.now() - t0);
        new MutationObserver(() => classLog.push([now(), document.documentElement.className]))
          .observe(document, {attributes: true, attributeFilter: ['class'], subtree: true});
        addEventListener('rsw:scene', () => sceneLog.push([now(), document.documentElement.className]));"""})
    d.get(page)
    d.execute_script("localStorage.clear(); sessionStorage.clear()")
    d.get(front_door)
    wait(d, "return location.pathname.endsWith('/clean/index.html')", "the front door opens Clean for a first visit")
    time.sleep(1)
    ok(d.execute_script("return document.querySelector('.mode-dialog').open"), "first visit opens the mode picker")
    ok(d.execute_script("return localStorage.getItem('rsw-mode')") == "clean", "Clean is kept as the mode")
    d.execute_script("document.querySelector('[data-add=whey]').click()")  # straight away: the change mustn't lose it mid-flight
    pick = d.find_element(By.CSS_SELECTOR, ".choice-manga")
    centre = d.execute_script("const r = arguments[0].getBoundingClientRect(); return [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)]", pick)
    pick.click()
    ok("is-leaving" in d.execute_script("return document.documentElement.className") and "is-henshin" in d.execute_script("return document.documentElement.className"),
       "picking Manga plays 変身 over this page")
    wait(d, "return location.pathname.endsWith('/manga/index.html')", "then goes on to the Manga page", 4)
    wait(d, "return !/is-arriving|is-revealing/.test(document.documentElement.className)", "the Manga page shatters the burst", 4)
    log = d.execute_script("return classLog")
    ok("is-arriving" in log[0][1] and "is-henshin" in log[0][1], f"the Manga page opens under the same burst {log[:2]}")
    ok(any("is-revealing" in c for _, c in log), "and then shatters it")
    vt = d.execute_script("const s = document.documentElement.style; return [parseInt(s.getPropertyValue('--vt-x')), parseInt(s.getPropertyValue('--vt-y'))]")
    ok(vt == centre, f"the burst stays centred on the button that was picked ({vt} vs {centre})")
    ok(d.execute_script("return localStorage.getItem('rsw-mode')") == "manga", "Manga is kept as the mode")
    ok(d.execute_script("return document.querySelector('.cart-count').textContent") == "1", "the cart carries over to Manga")
    ok(not d.execute_script("return document.querySelector('.mode-dialog').open"), "the Manga page doesn't ask for the mode again")
    time.sleep(1)
    d.find_element(By.CSS_SELECTOR, ".mode-switch").click()
    ok("is-launching" in d.execute_script("return document.documentElement.className"), "Manga's switch sweeps Clean's bars up")
    wait(d, "return location.pathname.endsWith('/clean/index.html')", "and goes back to the Clean page", 4)
    wait(d, "return !/is-arriving|is-revealing/.test(document.documentElement.className)", "the Clean page lifts the bars", 5)
    log, scenes = d.execute_script("return [classLog, sceneLog]")
    ok("is-arriving" in log[0][1] and "is-launching" in log[0][1], f"the Clean page opens under the same bars {log[:2]}")
    ok(bool(scenes) and "is-revealing" in scenes[0][1], f"the big bang waits for the bars to lift {scenes[:1]}")
    ok(d.execute_script("return document.querySelector('.hud .cart-count').textContent") == "1", "the cart carries back to Clean")
    no_errors(d, "switching")

    # A first visit that picks Clean: the big bang waits behind the picker and plays once it closes
    fresh(d, asked=False)
    time.sleep(1.5)
    ok(d.execute_script("return document.querySelector('.mode-dialog').open") and not world(d), "the big bang waits while the picker asks")
    d.find_element(By.CSS_SELECTOR, ".choice-clean").click()
    time.sleep(0.3)
    ok(page_is(d, "clean") and world(d).get("shape") == "logo", "picking Clean sets it off")

    for mode in ("clean",):
        label = f"{mode} 1440"
        fresh(d)
        wait(d, "return document.querySelector('.world').classList.contains('is-live')", f"{label}: the world draws", 15)
        ok(d.execute_script("return document.documentElement.classList.contains('deck-on')"), f"{label}: the deck is on")
        ok(active(d) == "power", f"{label}: it opens on Power up")
        ok(d.execute_script("return [...document.querySelectorAll('.scene')].filter((s) => getComputedStyle(s).visibility === 'visible').length") == 1, f"{label}: one scene shows")
        ok(d.execute_script("return [...document.querySelectorAll('.product')].filter((p) => p.checkVisibility({visibilityProperty: true})).length") == 0, f"{label}: the Lab's products stay hidden outside it")

        # Moving through the scenes: wheel, keys, the next button, a link, and no double step from one flick
        d.execute_script("window.dispatchEvent(new WheelEvent('wheel', {deltaY: 120, bubbles: true, cancelable: true}))")
        ok(active(d) == "lab", f"{label}: one wheel notch moves to the Lab")
        d.execute_script("for (let i = 0; i < 6; i++) window.dispatchEvent(new WheelEvent('wheel', {deltaY: 60, bubbles: true, cancelable: true}))")
        ok(active(d) == "lab", f"{label}: the rest of the flick doesn't move it again")
        settle(d)
        ok(d.execute_script("return location.hash") == "#lab", f"{label}: the address follows the scene")
        ok(d.execute_script("return document.querySelector('.hud-now [data-now=name]').textContent") == "The Lab", f"{label}: the HUD names it")

        # The Lab: the products and the cart
        d.execute_script("document.querySelector('[data-product=pre]').click()")
        ok(d.execute_script("return document.querySelector('.product.is-on').dataset.id") == "pre", f"{label}: the switcher shows Pre-Workout")
        d.execute_script("document.querySelector('[data-step=\"1\"]').click()")
        ok(d.execute_script("return document.querySelector('.product.is-on').dataset.id") == "hydrate", f"{label}: the arrow moves on to Hydration")
        d.execute_script("document.querySelector('.product.is-on [data-add]').click()")
        wait(d, "return document.querySelector('.hud .cart-count').textContent === '1'", f"{label}: Add to cart flies it in", 3)
        wait(d, "return !document.querySelector('.flyer')", f"{label}: the flying tub lands", 2)
        d.execute_script("document.querySelector('.hud .cart-btn').click()")
        ok(d.execute_script("return document.querySelector('.cart').open && document.querySelectorAll('.cart-lines li').length === 1"), f"{label}: the cart opens with it")
        ok(d.execute_script("return document.querySelector('.cart-ship').textContent.includes('away')"), f"{label}: it says how far from free shipping")
        d.execute_script("document.querySelector('.cart-lines [data-qty=\"-1\"]').click(); document.querySelector('.cart-close').click()")
        ok(d.execute_script("return !document.querySelector('.cart').open"), f"{label}: the cart closes")

        d.execute_script("window.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowDown', bubbles: true}))")
        ok(active(d) == "science", f"{label}: the down arrow moves on")
        drain = "hero-rep-1200" if mode == "clean" else "dark-barbell"
        ok(world(d).get("shape") == "photo" and drain in world(d).get("photo", ""), f"{label}: the science opens on the drained lifter in particles")
        d.execute_script("document.querySelectorAll('.steps button')[1].click()")
        ok(world(d) == {"shape": "tub", "product": "creatine", "side": "right"}, f"{label}: Recharge condenses the creatine tub")
        ok(d.execute_script("return document.querySelectorAll('.steps button')[1].getAttribute('aria-pressed')") == "true", f"{label}: and lights its step")
        time.sleep(4)
        ok(d.execute_script("return document.querySelectorAll('.steps button')[1].getAttribute('aria-pressed')") == "true", f"{label}: a picked step stays")
        settle(d)
        d.find_element(By.CSS_SELECTOR, ".next").click()
        ok(active(d) == "proof", f"{label}: the next button moves on")
        settle(d)

        # The batch check, in a sheet
        d.execute_script("const f = document.querySelector('.check-form'); f.elements.batch.value = 'CR-2611-07'; f.elements.check.value = 'XXXXXX'; f.requestSubmit()")
        ok(d.execute_script("return document.querySelector('.check-error').textContent.length > 0"), f"{label}: a wrong code says so")
        d.execute_script("document.querySelector('[data-fill]').click()")
        wait(d, "return !document.querySelector('.report').hidden", f"{label}: the sample code opens the report", 3)
        wait(d, "return document.querySelector('.report [data-slot=found]').textContent === '99.7%'", f"{label}: the lab's number counts up to 99.7%", 3)
        d.execute_script("window.dispatchEvent(new WheelEvent('wheel', {deltaY: 120, bubbles: true, cancelable: true}))")
        ok(active(d) == "proof", f"{label}: an open sheet keeps the scene")
        d.execute_script("document.querySelector('.report .sheet-close').click()")
        ok(d.execute_script("return document.querySelector('.report').hidden"), f"{label}: the report closes")

        # Sensei, through a link in the index
        d.execute_script("document.querySelector('.index a[href=\"#sensei\"]').click()")
        ok(active(d) == "sensei", f"{label}: the index jumps to Sensei")
        for value in ("muscle", "veg", "gym"):
            d.execute_script(f"document.querySelector('.q:not([hidden]) [data-value={value}]').click()")
        ok(d.execute_script("return !document.querySelector('.plan').hidden"), f"{label}: three taps open a plan")
        ok(d.execute_script("return document.querySelector('.plan [data-add]').dataset.add") == "whey", f"{label}: vegetarian gets whey as the pick")
        d.execute_script("document.querySelector('.plan-again').click()")
        ok(d.execute_script("return document.querySelector('.plan').hidden && !document.querySelector('[data-key=goal]').hidden"), f"{label}: start over goes back to the goal")

        settle(d)
        d.execute_script("window.dispatchEvent(new WheelEvent('wheel', {deltaY: 120, bubbles: true, cancelable: true}))")
        ok(active(d) == "warriors", f"{label}: on to the Warriors")
        first = "warrior-pulldown" if mode == "clean" else "manga-punch"
        ok(first in world(d).get("photo", ""), f"{label}: the first warrior forms in particles")
        d.execute_script("document.querySelectorAll('.crew button')[2].click()")
        third = "warrior-getup" if mode == "clean" else "manga-leap"
        ok(third in world(d).get("photo", ""), f"{label}: a thumbnail picks the warrior")
        ok(d.execute_script("return document.querySelector('.crew-now').textContent").startswith("03 / 05"), f"{label}: its caption shows")
        settle(d)
        d.execute_script("window.dispatchEvent(new KeyboardEvent('keydown', {key: 'End', bubbles: true}))")
        ok(active(d) == "final", f"{label}: End goes to the last scene")
        ok(world(d).get("shape") == "burst", f"{label}: the final form opens on the burst")
        wait(d, "return (window.__world || {}).photo?.includes('hero-warrior-tall')", f"{label}: then condenses into the warrior", 4)

        # Hold the empty stage: it charges, and held to the full, the final form flashes
        d.execute_script("""const deck = document.querySelector('.deck');
          deck.dispatchEvent(new PointerEvent('pointerdown', {pointerId: 7, clientX: 1100, clientY: 300, bubbles: true}));""")
        time.sleep(0.9)
        ok(d.execute_script("return document.documentElement.classList.contains('is-charging')"), f"{label}: holding the stage charges it")
        wait(d, "return document.documentElement.classList.contains('is-final')", f"{label}: held to the full, the final form", 3)
        wait(d, "return !document.documentElement.classList.contains('is-final') && !document.documentElement.classList.contains('is-charging')", f"{label}: then it settles", 3)
        ok(d.execute_script("return document.querySelector('.next-text').textContent") == "Back to the start", f"{label}: the last scene offers the way back")
        no_errors(d, label)

    # ---------- The visitor's name: the energy writes it; it goes on their stack, their plan, their final form ----------
    fresh(d)
    box = d.find_element(By.ID, "warrior-name")
    box.send_keys("Kiran")
    time.sleep(0.6)
    ok(world(d).get("shape") == "name" and world(d).get("text") == "Kiran", f"typing a name: the energy writes it {world(d)}")
    ok(d.execute_script("return localStorage.getItem('rsw-name')") == "Kiran", "the name stays on this device")
    ok(d.execute_script("return document.querySelector('#cart-title').textContent") == "Kiran’s stack", "the cart becomes their stack")
    ok(d.execute_script("return [...document.querySelectorAll('#final-title .sr')].map((s) => s.textContent).join(' ')") == "Kiran’s final form.", "the final form is theirs")
    box.send_keys("\n")
    ok(d.execute_script("return document.activeElement !== document.querySelector('#warrior-name')"), "Enter locks it in (the keyboard goes away)")
    d.get(page)
    d.execute_script("addEventListener('rsw:scene', (e) => { window.__world = e.detail; })")
    time.sleep(1.5)
    ok(world(d).get("shape") == "name" and d.find_element(By.ID, "warrior-name").get_attribute("value") == "Kiran", "next visit, the big bang opens on their name")
    d.execute_script("location.hash = '#warriors'")
    wait(d, "const p = document.querySelector('.portrait'); return p.classList.contains('is-shown') && p.src.includes('warrior-pulldown')", "a warrior's real photo comes through, sharp", 6)
    d.execute_script("location.hash = '#final'")
    wait(d, "return !document.querySelector('.portrait').classList.contains('is-shown')", "and steps aside when the scene changes", 2)
    wait(d, "const w = window.__world || {}; return w.shape === 'name' && w.text === 'Kiran' && w.aura > 1", "the final form is their name, burning", 5)
    d.execute_script("location.hash = '#power'")
    settle(d)
    d.execute_script("const i = document.querySelector('#warrior-name'); i.value = ''; i.dispatchEvent(new Event('input', {bubbles: true}))")
    time.sleep(0.6)
    ok(world(d).get("shape") == "logo" and d.execute_script("return localStorage.getItem('rsw-name')") is None, "an empty name brings RSW back, and forgets it")
    no_errors(d, "the name")

    # A link straight to a scene opens on it
    fresh(d, hash_="#warriors")
    ok(active(d) == "warriors", "an address with #warriors opens on Warriors")

    # ---------- A phone: the world on top, big; a story bar for the scenes; swipes up and sideways ----------
    size(d, 390, 664)
    for mode in ("clean",):
        label = f"{mode} phone"
        fresh(d)
        ok(d.execute_script("return !document.querySelector('.tabbar')"), f"{label}: no tab bar")
        ok(d.execute_script("""const r = [...document.querySelectorAll('.index a')].map((a) => a.getBoundingClientRect());
          return r.every((b) => Math.abs(b.top - r[0].top) < 1 && b.width > 20) && r[0].top < 90"""), f"{label}: the story bar runs across the top")
        ok(d.execute_script("""const logo = document.querySelector('.logo').getBoundingClientRect();
          const acts = document.querySelector('.hud .actions').getBoundingClientRect();
          const cart = document.querySelector('.hud .cart-btn').getBoundingClientRect();
          return logo.right < acts.left && acts.right <= innerWidth && cart.width > 0"""), f"{label}: the HUD fits, cart and all")
        ok(d.find_element(By.ID, "power-title").accessible_name.lower() == "tap into your final form.", f"{label}: the title, in letters, still reads whole")
        swipe = """const t = (x, y) => new Touch({identifier: 1, target: document.body, clientX: x, clientY: y});
          document.body.dispatchEvent(new TouchEvent('touchstart', {touches: [t(arguments[0], arguments[1])], bubbles: true}));
          document.body.dispatchEvent(new TouchEvent('touchend', {changedTouches: [t(arguments[2], arguments[3])], bubbles: true}));"""
        d.execute_script(swipe, 200, 500, 200, 300)
        ok(active(d) == "lab", f"{label}: a swipe up moves on")
        settle(d)
        ok(d.execute_script("const b = document.querySelector('.product.is-on [data-add]').getBoundingClientRect(); return b.bottom <= innerHeight && b.top > innerHeight * 0.4"), f"{label}: Add to cart is on screen, under the world")
        d.execute_script(swipe, 320, 200, 80, 210)
        ok(d.execute_script("return document.querySelector('.product.is-on').dataset.id") == "creatine", f"{label}: a swipe sideways brings on the next tub")
        d.execute_script(swipe, 80, 200, 320, 190)
        ok(d.execute_script("return document.querySelector('.product.is-on').dataset.id") == "whey", f"{label}: and back")
        d.execute_script("document.querySelector('.index a[href=\"#sensei\"]').click()")
        ok(active(d) == "sensei", f"{label}: a story segment jumps to Sensei")
        ok(d.execute_script("return document.querySelector('.index a[aria-current]').getAttribute('href')") == "#sensei", f"{label}: and lights up")
        ok(d.execute_script("return document.documentElement.scrollWidth <= innerWidth"), f"{label}: no sideways scroll")
        no_errors(d, label)

    # ---------- Small phones, tablets: every scene's words fit, nothing clipped ----------
    for w, h, label in ((360, 640, "small phone"), (820, 1180, "tablet upright"), (1180, 820, "tablet on its side"), (844, 390, "phone on its side")):
        size(d, w, h)
        fresh(d, hash_="#final")
        settle(d)
        ok(d.execute_script("""const b = document.querySelector('.scene-final .btn').getBoundingClientRect();
          const c = document.querySelector('.scene-final .scene-copy');
          return b.height > 30 && b.bottom <= innerHeight && c.scrollHeight <= c.clientHeight + 1"""), f"{label}: the last scene's button shows whole")
        ok(d.execute_script("return document.documentElement.scrollWidth <= innerWidth"), f"{label}: no sideways scroll")
        no_errors(d, label)
finally:
    d.quit()

# ---------- Reduced motion: no storm, scenes still change, and the switch goes straight to Manga ----------
d = browser(reduced=True)
try:
    size(d, 1440, 900)
    fresh(d)
    d.execute_script("window.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowDown', bubbles: true}))")
    ok(active(d) == "lab", "reduced motion: scenes still change")
    no_errors(d, "reduced motion")
    d.find_element(By.CSS_SELECTOR, ".hud .mode-switch").click()
    wait(d, "return location.pathname.endsWith('/manga/index.html')", "reduced motion: the switch goes to Manga", 3)
    ok("is-henshin" not in d.execute_script("return document.documentElement.className"), "reduced motion: with nothing covering it")
finally:
    d.quit()
print("all checks passed")
