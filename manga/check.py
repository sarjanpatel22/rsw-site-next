"""Smoke test for RSW's Manga page: python3 check.py [screenshot_dir]

Drives headless Chromium through the front door and the mode picker, the music, Manga's one-scroll 3D power-up,
the training arc, the batch check, the inked photos, the orbit, the comic strip, phones, tablets and touch, the
AI Sensei chat and older Safari, then the switch to the Clean page (../clean/, with its own check.py): the cover
sweeps up here, the Clean page lifts it, and the cart and the saved mode carry over. Ends with reduced motion.
The page still holds the first design's Clean parts, hidden; this page never shows them.
"""
import pathlib
import re
import sys
import time
import urllib.parse

from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.action_chains import ActionChains
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys

site = pathlib.Path(__file__).resolve().parent
PAGE = (site / "index.html").as_uri()
FRONT_DOOR = (site.parent / "index.html").as_uri()

# Dela Gothic One is loaded as a subset of just the Japanese the page uses (katakana, and the kanji of
# Sensei's stamp and 変身), so every letter must be in it
source = "".join((site / f).read_text() for f in ("index.html", "styles.css", "main.js", "hero.js"))
subset = urllib.parse.unquote(re.search(r"family=Dela\+Gothic\+One&text=([^\"&]+)", source).group(1))
missing = sorted({ch for ch in source if "぀" <= ch <= "ヿ" or "一" <= ch <= "鿿"} - set(subset))
assert not missing, f"Japanese missing from the Dela Gothic One subset in index.html: {''.join(missing)}"
shots = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else None

opts = webdriver.ChromeOptions()
opts.add_argument("--headless=new")
opts.add_argument("--enable-unsafe-swiftshader")  # headless Chromium only gets WebGL through SwiftShader
opts.add_argument("--mute-audio")
opts.binary_location = "/usr/bin/chromium"
opts.set_capability("goog:loggingPrefs", {"browser": "ALL"})  # so the console can be checked for errors
driver = webdriver.Chrome(options=opts, service=Service("/usr/bin/chromedriver"))
js = driver.execute_script


def mode():
    return js("return document.documentElement.dataset.mode")


def no_sideways_scroll(label):
    over = js("return document.documentElement.scrollWidth - innerWidth")
    assert over <= 0, f"{label}: page scrolls sideways by {over}px"


def page_shots(name, width):
    """Screenshot screen by screen; a page-tall window would stretch the 100svh hero."""
    if not shots:
        return
    driver.set_window_size(width, 900)
    js("scrollTo(0, 0)")
    time.sleep(1)
    height, screen = js("return [document.documentElement.scrollHeight, innerHeight]")
    for n, y in enumerate(range(0, height, screen)):
        js(f"scrollTo(0, {y})")
        time.sleep(1.2)  # smooth scroll + reveals settle
        driver.save_screenshot(str(shots / f"{name}-{n:02}.png"))


def page_is(name):
    return driver.current_url.split("?")[0].split("#")[0].endswith(f"/{name}/index.html")


def wait_until(test, what, seconds=6):
    end = time.time() + seconds
    while time.time() < end:
        if test():
            return
        time.sleep(0.05)
    raise AssertionError(what)


try:
    driver.set_window_size(1440, 900)

    # The front door sends a visitor to the mode they used last, Clean the first time
    driver.get(PAGE)
    js("localStorage.setItem('rsw-mode', 'manga')")
    driver.get(FRONT_DOOR)
    wait_until(lambda: page_is("manga"), f"the front door should open Manga for a Manga visitor, got {driver.current_url}")
    js("localStorage.clear(); sessionStorage.clear()")
    driver.refresh()
    assert js("return localStorage.getItem('rsw-mode')") == "manga" and mode() == "manga", "this page is always Manga, and is kept as the mode"

    dialog = driver.find_element(By.CSS_SELECTOR, ".mode-dialog")
    assert not dialog.get_attribute("open"), "popup should wait before opening"
    time.sleep(1.6)
    assert dialog.get_attribute("open") is not None, "popup did not open"
    assert js("return document.activeElement === document.querySelector('.mode-dialog')"), "neither side should start out picked"
    js("window.intros = 0; document.querySelector('.hero').addEventListener('intro', () => window.intros++)")
    driver.find_element(By.CSS_SELECTOR, '[data-pick="manga"]').click()
    time.sleep(0.5)
    assert page_is("manga") and dialog.get_attribute("open") is None and js("return window.intros") == 1, \
        "picking Manga here should close the picker and replay the hero's intro"

    driver.refresh()
    time.sleep(1.6)
    assert driver.find_element(By.CSS_SELECTOR, ".mode-dialog").get_attribute("open") is None, "a reload in the same tab shouldn't ask again"

    # A new visit asks again; Escape keeps Manga
    js("sessionStorage.clear()")
    driver.refresh()
    time.sleep(1.6)
    assert driver.find_element(By.CSS_SELECTOR, ".mode-dialog").get_attribute("open") is not None, "a new visit should ask again"
    ActionChains(driver).send_keys(Keys.ESCAPE).perform()
    time.sleep(0.4)
    assert driver.find_element(By.CSS_SELECTOR, ".mode-dialog").get_attribute("open") is None and page_is("manga"), \
        "Escape should close the popup and stay on Manga"

    # Music (once the page has its song): silent until the first click, which starts it; the switch mutes it
    # for good. Escape, the only key so far, doesn't count as a click.
    switch = driver.find_element(By.CSS_SELECTOR, ".sound-toggle")
    if js("return Boolean(document.querySelector('.music'))"):
        playing = lambda: not js("return document.querySelector('.music').paused")
        assert not playing(), "music started before any click"
        driver.find_element(By.CSS_SELECTOR, ".logo").click()
        time.sleep(0.5)
        assert playing() and switch.get_attribute("aria-pressed") == "true", "the first click should start the music"
        switch.click()
        assert not playing() and js("return localStorage.getItem('rsw-music')") == "off", "the switch should mute the music"
        driver.refresh()
        time.sleep(1.6)
        driver.find_element(By.CSS_SELECTOR, ".logo").click()
        time.sleep(0.5)
        assert not playing(), "muted music should stay off after a reload"
        driver.find_element(By.CSS_SELECTOR, ".sound-toggle").click()  # back on, for the switch to Clean below
        assert playing(), "the switch should turn the music back on"
    else:
        assert not switch.is_displayed(), "a music switch with no song to play"

    assert js("return [...document.fonts].some((f) => f.family.includes('Anek Gujarati') && f.status === 'loaded')"), \
        "Gujarati font did not load"

    def shown(sel):
        return js(f"return getComputedStyle(document.querySelector('{sel}')).display") != "none"

    # Only Manga's own hero, universe and creatine story show (the first design's Clean parts stay hidden)
    clean_parts, manga_parts = [".slider", ".hub", ".creatine", ".strip-photo", ".strip-facts"], [".hero-stage", ".universe > .orbit", ".strip"]
    assert all(map(shown, manga_parts)) and not any(map(shown, clean_parts)), "Manga should show only its own parts"
    assert js("return [...document.querySelectorAll('[lang=\"gu\"]')].some((el) => el.checkVisibility())"), "Manga should show the Gujarati words"

    # Keyboard and screen-reader order (the page's order) matches the order on screen
    dom, seen = js("""const kids = [...document.querySelector('main').children].filter((e) => e.checkVisibility());
        return [kids, [...kids].sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)].map((l) => l.map((e) => e.id || e.className))""")
    assert dom == seen, f"page order {dom} differs from screen order {seen}"

    vh = js("return innerHeight")
    assert js("return document.documentElement.classList.contains('lenis')"), "Lenis smooth scrolling not running"
    top_of = lambda sel: js(f"return document.querySelector('{sel}').getBoundingClientRect().top")

    def jump(y):
        js(f"scrollTo({{top: {y}, behavior: 'instant'}})")
        time.sleep(0.4)

    def wheel(dy=120):  # one notch of a mouse wheel, as a real input event; in the margin, so the mouse rests on nothing
        driver.execute_cdp_cmd("Input.dispatchMouseEvent", {"type": "mouseWheel", "x": 2, "y": 200, "deltaX": 0, "deltaY": dy})

    def rest_mouse():  # in the margin: a planet drifting under a resting mouse counts as hovered, and stops the orbit
        driver.execute_cdp_cmd("Input.dispatchMouseEvent", {"type": "mouseMoved", "x": 2, "y": 200})

    def mouse(kind, x, y, **more):
        driver.execute_cdp_cmd("Input.dispatchMouseEvent", {"type": kind, "x": x, "y": y, **more})

    # Its photos are inked panels: the Warriors' fight scenes and the training arc, whose power-up alone is in colour
    inked = js("""return [...document.querySelectorAll('.arc img, .warrior-shots img')].filter((img) => img.checkVisibility())
        .map((img) => [img.closest('.arc-power') ? 'power' : img.closest('.arc') ? 'arc' : img.getAttribute('src'), getComputedStyle(img).filter])""")
    warriors = [src for src, f in inked if src not in ("arc", "power")]
    assert len(inked) == 9 and len(warriors) == 5 and all(src.startswith("../img/manga-") for src in warriors), f"Manga should show its own photos, got {inked}"
    assert all(f == ("saturate(1.3) contrast(1.1)" if src == "power" else "grayscale(1) contrast(1.35)") for src, f in inked), \
        f"Manga's photos should be inked, the power-up in colour: {inked}"

    # The power-up hero: one scroll fires the whole 3D charge
    def wait_for_landing():
        for _ in range(80):  # the tub drops in (three.js may still be loading)
            if js("return document.querySelector('.hero').classList.contains('is-landed')"):
                return True
            time.sleep(0.1)
        return False

    def power():  # unset until the hero first charges or resets
        return float(js("return document.querySelector('.hero').style.getPropertyValue('--power')") or 0)

    def hero_has(name):
        return js(f"return document.querySelector('.hero').classList.contains('{name}')")

    # At either end, the animation comes round again every 5 s
    def replays_within(part, seconds):
        js(f"window.replays = 0; document.querySelector('.hero').addEventListener('{part}', () => window.replays++)")
        time.sleep(seconds)
        return js("return window.replays")

    jump(0)
    rest_mouse()
    assert wait_for_landing(), "the 3D tub never dropped in (three.js or WebGL failed)"
    assert power() == 0 and not hero_has("is-charging"), "hero should start uncharged"
    wheel()
    time.sleep(1.1)
    mid = power()
    assert 0.2 < mid < 0.9 and js("return scrollY") == 0, f"one scroll should start the charge and leave the page where it is: power {mid}"
    assert js("return document.querySelector('.sfx[data-at=\"0.2\"]').classList.contains('is-on')"), "the first sound effect should hit"
    assert js("return getComputedStyle(document.querySelector('.hero-copy')).visibility") == "hidden", "intro text should leave"
    time.sleep(1.6)
    assert power() == 1 and hero_has("is-final") and js("return scrollY") == 0, f"the charge should end in the final form, at the top: {power()}"
    assert js("return getComputedStyle(document.querySelector('.final')).visibility") == "visible", "final form hidden"
    assert replays_within("final", 5.6) >= 1, "at the final form, its burst should play again within 5 s"
    wheel()
    time.sleep(1)
    assert js("return scrollY") > 0, "after the final form, a scroll should move the page"

    # Back at the top, it's uncharged again and the intro plays: the tub drops and lands once more
    js("window.intros = 0; document.querySelector('.hero').addEventListener('intro', () => window.intros++)")
    jump(vh)
    jump(0)
    for _ in range(30):  # the reset follows the scroll, a frame or two later
        if js("return window.intros"):
            break
        time.sleep(0.1)
    assert js("return window.intros") == 1, "back at the top the intro should play again, once"
    assert power() == 0 and not hero_has("is-final"), f"back at the top the hero should be uncharged, power {power()}"
    assert wait_for_landing(), "the tub did not land again after scrolling back to the top"
    assert replays_within("intro", 5.6) >= 1, "sitting at the top, the intro should play again within 5 s"

    # A fresh scroll mid-charge skips straight to the final form
    wheel()
    time.sleep(0.6)
    wheel()
    time.sleep(0.3)
    assert hero_has("is-final") and js("return scrollY") == 0, f"a second scroll should skip to the final form, power {power()}"

    # The training arc: one scroll brings it on screen, the page glides to fit it and holds while the six
    # panels play, then lets go. A fresh scroll skips to the end; coming back up into it, it's already done.
    arc_state = lambda: js("return document.querySelector('.arc').className")
    arc_top = js("return document.querySelector('.arc').getBoundingClientRect().top + scrollY")
    arc_h = js("return document.querySelector('.arc').offsetHeight")
    jump(arc_top + 3 * vh)  # wholly off screen: it rewinds
    jump(arc_top - vh * 0.7)
    time.sleep(0.4)
    assert arc_state() == "arc", f"the arc should wait until a scroll brings it on screen, got {arc_state()}"
    wheel()
    time.sleep(1.0)
    held = js("return scrollY")
    top, bottom = js("const r = document.querySelector('.arc').getBoundingClientRect(); return [r.top, r.bottom]")
    assert "is-playing" in arc_state(), f"one scroll should play the arc, got {arc_state()}"
    assert top >= 0 and bottom <= vh + 1, f"the arc should glide fully onto the screen, it spans {top:.0f}-{bottom:.0f}"
    time.sleep(1.0)
    assert js("return scrollY") == held, "the page should hold still while the arc plays"
    time.sleep(2.0)
    assert "is-done" in arc_state(), f"the arc should finish, got {arc_state()}"
    unseen = js("""return [...document.querySelectorAll('.arc-panel')].filter((p) => getComputedStyle(p).opacity !== '1'
        || [...p.querySelectorAll(':scope > p, h3, .btn')].some((c) => c.checkVisibility() && getComputedStyle(c).opacity !== '1')).length""")
    assert unseen == 0, f"{unseen} arc panels still hidden after it played"
    wheel()
    time.sleep(0.8)
    assert js("return scrollY") > held, "once the arc has played, a scroll should move the page"
    # A fresh scroll mid-arc skips to its end
    jump(arc_top + 3 * vh)
    jump(arc_top - vh * 0.7)
    wheel()
    time.sleep(0.6)
    wheel()
    time.sleep(0.3)
    assert "is-done" in arc_state(), f"a second scroll should skip to the end of the arc, got {arc_state()}"
    # Back up into it from below the arc: it's already finished
    jump(arc_top + 3 * vh)
    jump(arc_top + arc_h - vh * 0.4)
    assert arc_state() == "arc is-done", f"coming back up into the arc it should be finished, got {arc_state()}"

    # The batch check: the two codes on a tub open its sample lab report (after a scan); a wrong code says so
    jump(js("return document.querySelector('#batch').getBoundingClientRect().top + scrollY - 100"))
    batch, check = driver.find_element(By.ID, "batch-code"), driver.find_element(By.ID, "check-code")
    batch.clear()
    check.clear()
    batch.send_keys("XX-0000-00")
    check.send_keys("000000")
    driver.find_element(By.CSS_SELECTOR, ".batch-form .btn").click()
    error, hidden = js("return [document.querySelector('.batch-error').textContent, document.querySelector('.batch-card').hidden]")
    assert error and hidden, "a wrong code should explain itself and show no report"
    batch.clear()
    check.clear()
    batch.send_keys("cr 2611 07")  # no case, spaces or dashes needed
    check.send_keys("4f9k2a")
    driver.find_element(By.CSS_SELECTOR, ".batch-form .btn").click()
    time.sleep(2.8)  # it scans first
    product, found, verified, error = js("""const c = document.querySelector('.batch-card');
        return [c.querySelector('[data-slot=product]').textContent, c.querySelector('[data-slot=found]').textContent,
          c.classList.contains('is-verified') && getComputedStyle(c.querySelector('.batch-stamp')).opacity === '1',
          document.querySelector('.batch-error').textContent]""")
    assert product.startswith("Creatine") and found == "99.7%" and verified and not error, \
        f"the sample codes should open the creatine report, stamped genuine: {product!r} {found!r} {verified} {error!r}"
    rest_mouse()

    # The orbit: the inked worlds drift round the logo; dragging spins them without leaving for their part of the page
    def planets(orbit):
        """[centre x, centre y, scale, z-index] of each planet: the Lab, the Warriors, the Vault"""
        return js(f"""return [...document.querySelectorAll('{orbit} .planet')].map((p) => {{ const b = p.getBoundingClientRect();
            return [b.left + b.width / 2, b.top + b.height / 2, parseFloat(p.style.scale), p.style.zIndex]; }})""")

    def drifts(orbit):
        before = planets(orbit)
        time.sleep(1)
        return any(abs(a[0] - b[0]) + abs(a[1] - b[1]) > 3 for a, b in zip(before, planets(orbit)))

    orbit = ".universe > .orbit"
    orbit_top = js(f"return document.querySelector('{orbit}').getBoundingClientRect().top + scrollY - 80")
    jump(orbit_top)
    time.sleep(1.5)
    assert drifts(orbit), "Manga's worlds should drift round the logo"
    ps = planets(orbit)
    k = max(range(3), key=lambda i: ps[i][2])  # the one in front
    x, y = ps[k][:2]
    where = js("return [location.hash, scrollY]")
    mouse("mouseMoved", x, y)
    mouse("mousePressed", x, y, button="left", clickCount=1)
    for n in range(1, 11):
        mouse("mouseMoved", x + 25 * n, y, button="left", buttons=1)
        time.sleep(0.016)
    mouse("mouseReleased", x + 250, y, button="left", clickCount=1)
    time.sleep(0.3)
    assert js("return [location.hash, scrollY]") == where, "dragging a planet should spin the worlds, not jump the page"
    assert planets(orbit)[k][0] - x > 100, "dragging right should carry the front world right"
    rest_mouse()

    # The creatine strip reveals as it scrolls in
    jump(js("return document.querySelector('.strip-panels').getBoundingClientRect().top + scrollY") - vh / 2)
    time.sleep(0.6)
    revealed = js("return [...document.querySelectorAll('.strip-panels li')].filter((li) => li.classList.contains('is-in')).length")
    assert revealed == 3, f"{revealed} of 3 comic panels revealed"

    # The photos all load (the lazy ones once scrolled to)
    shown_imgs = "[...document.querySelectorAll('main img')].filter((img) => img.checkVisibility())"
    for i in range(js(f"return {shown_imgs}.length")):
        js(f"{shown_imgs}[{i}].scrollIntoView({{block: 'center'}})")
        time.sleep(0.3)
    broken = js(f"return {shown_imgs}.filter((img) => !img.naturalWidth).map((img) => img.getAttribute('src'))")
    assert not broken, f"photos failed to load: {broken}"

    # Whatever has played its entrance shows: nothing is left invisible
    end = js("return document.documentElement.scrollHeight - innerHeight")
    for y in range(0, int(end) + 1, int(vh * 0.6)):
        jump(y)
    time.sleep(1.5)
    stuck = js("""return [...document.querySelectorAll('.reveal.is-in, [data-anim].is-in, [data-anim~=cards].is-in > *, [data-anim~=deal].is-in > *')]
        .filter((el) => el.checkVisibility() && getComputedStyle(el).opacity === '0').map((el) => el.tagName + '.' + el.className)""")
    assert not stuck, f"played its entrance but still invisible: {stuck}"
    # Firefox (on a GPU) draws a 3D carton in loose pieces when any parent is turned
    tilted = js("""return [...document.querySelectorAll('.box')].filter((box) => box.checkVisibility() && (() => {
        for (let el = box.parentElement; el; el = el.parentElement) {
          const cs = getComputedStyle(el), m = new DOMMatrix(cs.transform === 'none' ? undefined : cs.transform);
          if (cs.rotate !== 'none' || m.b || m.c) return true;
        }
      })()).map((box) => box.textContent)""")
    assert not tilted, f"cartons inside a tilted parent: {tilted}"

    # Phones: links live behind the Menu button; product cards swipe sideways
    driver.set_window_size(390, 844)
    jump(0)
    menu = driver.find_element(By.CSS_SELECTOR, "#menu")
    assert not menu.is_displayed(), "phone menu should start closed"
    driver.find_element(By.CSS_SELECTOR, ".menu-toggle").click()
    time.sleep(0.4)
    assert menu.is_displayed(), "Menu button did not open the links"
    menu.find_element(By.CSS_SELECTOR, 'a[href="#lab"]').click()
    time.sleep(2)  # Lenis eases the jump
    assert not menu.is_displayed(), "menu stayed open after picking a link"
    lab_top = top_of("#lab")
    assert 0 <= lab_top < 120, f"The Lab link landed {lab_top}px from the top"
    assert js("const p = document.querySelector('.products'); return p.scrollWidth > p.clientWidth"), "phone product cards should swipe"

    # The bar fits every phone, down to a folding phone's 280px outer screen
    for w in (280, 320, 360, 375):
        driver.set_window_size(w, 800)
        time.sleep(0.3)
        cut = js("return document.querySelector('.mode-switch').getBoundingClientRect().right - document.documentElement.clientWidth")
        assert cut <= 0, f"header cut off by {cut}px at {w}px wide"

    # Tablets: portrait ones get the phones' bar; from 901px the whole bar fits on one line
    for w in (768, 834, 901, 1024, 1180):
        driver.set_window_size(w, 900)
        time.sleep(0.3)
        cut, wrapped = js("""const r = document.createRange();
            const wrapped = [...document.querySelectorAll('.nav-links a')].filter((a) => {
              r.selectNodeContents(a); return new Set([...r.getClientRects()].map((x) => Math.round(x.top))).size > 1; });
            return [document.querySelector('.mode-switch').getBoundingClientRect().right - document.documentElement.clientWidth, wrapped.length]""")
        assert cut <= 0 and not wrapped, f"{w}px: the bar is cut by {cut}px and {wrapped} links wrap"

    for w in (360, 768, 1440):
        driver.set_window_size(w, 800)
        time.sleep(0.5)
        no_sideways_scroll(f"{w}px")
    page_shots("manga-desktop", 1440)
    page_shots("manga-mobile", 390)

    # A portrait iPad with touch: the page scrolls natively, a sideways swipe spins the orbit, and one swipe at
    # the top fires the power-up
    def swipe(dy, x=380, y0=800, steps=20):  # fewer steps make a quicker flick (each waits for the renderer)
        driver.execute_cdp_cmd("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": x, "y": y0}]})
        for k in range(1, steps + 1):
            driver.execute_cdp_cmd("Input.dispatchTouchEvent", {"type": "touchMove", "touchPoints": [{"x": x, "y": y0 - dy * k / steps}]})
            time.sleep(0.016)
        driver.execute_cdp_cmd("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
        time.sleep(0.9)  # the fling settles

    driver.execute_cdp_cmd("Emulation.setDeviceMetricsOverride", {"width": 768, "height": 1024, "deviceScaleFactor": 1, "mobile": True})
    driver.execute_cdp_cmd("Emulation.setTouchEmulationEnabled", {"enabled": True, "maxTouchPoints": 5})
    driver.refresh()
    time.sleep(1.5)
    assert not js("return document.documentElement.classList.contains('lenis')"), \
        "touch screens should scroll natively: Lenis's blocking touch listeners make swipes wait"
    # A sideways swipe on the orbit spins the worlds and leaves the page where it is
    jump(js(f"return document.querySelector('{orbit}').getBoundingClientRect().top + scrollY - 40"))
    time.sleep(1)
    ps = planets(orbit)
    k = min((i for i in range(3) if ps[i][2] > 1), key=lambda i: ps[i][0])  # the leftmost in front, which a swipe right carries right
    x, y = ps[k][:2]
    held = js("return scrollY")
    driver.execute_cdp_cmd("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": x, "y": y}]})
    for n in range(1, 21):
        driver.execute_cdp_cmd("Input.dispatchTouchEvent", {"type": "touchMove", "touchPoints": [{"x": x + 15 * n, "y": y}]})
        time.sleep(0.016)
    driver.execute_cdp_cmd("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
    moved = planets(orbit)[k][0] - x  # as the finger lifts: the throw then carries the worlds on round
    time.sleep(0.3)
    after = js("return scrollY")
    assert after == held, f"a sideways swipe on the orbit should not scroll the page: {held} -> {after}"
    assert moved > 100, f"a sideways swipe should spin the worlds: the front one moved {moved:.0f}px"

    # One swipe at the top fires the whole charge with the page held still; the next swipe scrolls
    jump(0)
    time.sleep(3)
    jump(0)  # a reload may restore the old scroll position late
    assert js("return scrollY") == 0 and power() == 0, "the hero should wait at the top, uncharged"
    swipe(400, steps=4)  # a flick, done well inside the charge's 2.9 s
    assert power() > 0 and js("return scrollY") == 0, f"a swipe at the top should fire the charge and hold the page, power {power()}, scrollY {js('return scrollY')}"
    time.sleep(2.5)
    assert hero_has("is-final") and js("return scrollY") == 0, f"one swipe should charge the hero all the way, power {power()}"
    swipe(400)
    assert js("return scrollY") > 0, "after the final form, a swipe should scroll the page"
    driver.execute_cdp_cmd("Emulation.setTouchEmulationEnabled", {"enabled": False})
    driver.execute_cdp_cmd("Emulation.clearDeviceMetricsOverride", {})

    # A phone held sideways (844x390): the hero's words fit between the bar and the bottom of the screen
    driver.execute_cdp_cmd("Emulation.setDeviceMetricsOverride", {"width": 844, "height": 390, "deviceScaleFactor": 1, "mobile": True})
    driver.refresh()
    jump(0)
    time.sleep(2)
    room = js("""const nav = document.querySelector('.nav').getBoundingClientRect().bottom, r = document.createRange();
        const boxes = [...document.querySelectorAll('.hero-copy > *')].map((e) => { r.selectNodeContents(e); return r.getBoundingClientRect(); });
        return [Math.min(...boxes.map((b) => b.top)) - nav, innerHeight - Math.max(...boxes.map((b) => b.bottom))]""")
    assert min(room) >= 0, f"on a sideways phone the hero's words should fit between the bar and the bottom, room {room}"
    driver.execute_cdp_cmd("Emulation.clearDeviceMetricsOverride", {})

    # AI Sensei chat: the launcher keeps off the hero and the footer; the chat asks the brief's three
    # questions, reads typed answers (Hinglish too), asks again rather than guess at a "no", builds a plan
    # whose pick goes in the cart, and answers shop questions with the page's own prices
    driver.set_window_size(1440, 900)
    js("sessionStorage.removeItem('rsw-cart')")
    driver.refresh()
    jump(0)
    time.sleep(1)
    launcher = driver.find_element(By.CSS_SELECTOR, ".chat-toggle")
    assert not launcher.is_displayed(), "the Sensei launcher should keep off the hero"
    driver.find_element(By.CSS_SELECTOR, '.nav-links a[href="#lab"]').click()
    time.sleep(2)
    assert launcher.is_displayed(), "after The Lab link, the Sensei launcher should show over the shop"
    jump(js("return document.querySelector('.footer').getBoundingClientRect().top + scrollY"))
    time.sleep(0.5)
    assert not launcher.is_displayed(), "the Sensei launcher should keep off the footer and its contact links"
    jump(js("return document.querySelector('#lab').getBoundingClientRect().top + scrollY"))
    time.sleep(0.5)
    launcher.click()
    chat_open = lambda: js("return document.querySelector('#chat').matches(':popover-open')")
    picks = lambda: js("return [...document.querySelectorAll('.chat-picks button')].map((b) => b.textContent)")
    said = lambda: driver.find_elements(By.CSS_SELECTOR, ".from-sensei:not(.is-typing)")[-1].text
    assert chat_open(), "the launcher should open the chat"
    assert js("return document.activeElement.name") == "q", "with a mouse, the chat should be ready to type in"
    assert picks() == ["Build muscle", "Lose weight"], f"Sensei should start with the goal, offering {picks()}"
    driver.find_element(By.CSS_SELECTOR, ".chat-picks button").click()
    time.sleep(1)
    box = driver.find_element(By.CSS_SELECTOR, ".chat-form input")
    box.send_keys("I don't eat meat", Keys.ENTER)
    time.sleep(1)
    assert said() == "What do you eat?" and picks() == ["Non-vegetarian", "Vegetarian"], "a 'no' should get the question again"
    for answer in ("main non veg khata hu", "ghar pe"):
        box.send_keys(answer, Keys.ENTER)
        time.sleep(1)
    plan = js("""const p = document.querySelector('.chat-plan'), name = p.querySelector('.chat-pick-name');
        return [p.querySelector('.chat-for').textContent, [name.textContent, name.nextElementSibling.textContent],
          p.querySelector('.chat-pick .box').getBoundingClientRect().width, document.querySelector('#chat').dataset.step]""")
    assert plan[0] == "Build muscle · Non-vegetarian · Home", f"the plan should be for the answers given, got {plan[0]}"
    assert plan[1] == ["Creatine Monohydrate", "₹999"], f"the plan should pick creatine, got {plan[1]}"
    assert plan[2] > 0 and plan[3] == "3", f"the pick should show its carton ({plan[2]}px) and the steps be full ({plan[3]})"
    driver.find_element(By.CSS_SELECTOR, ".chat-plan .add").click()
    assert driver.find_element(By.CSS_SELECTOR, ".cart-count").text == "1", "Sensei's pick should go in the cart"
    assert js("return sessionStorage.getItem('rsw-cart')") == '[["creatine",1]]', "the cart keeps the pick for the Clean page too"
    box.send_keys("price kitna hai?", Keys.ENTER)
    time.sleep(1)
    assert "Whey Protein ₹2,499" in said(), f"Sensei should quote the shop's prices, said: {said()}"
    box.send_keys(Keys.ESCAPE)
    assert not chat_open(), "Escape should close the chat"
    # Typed answers are read by keywords tried in order ("non veg" isn't veg, "gain weight" isn't losing it);
    # a "no" in the answer means ask again rather than guess. Picks are preset so any plan can be built.
    cases = [(0, "I want to lose weight", "lose"), (0, "gain weight", "muscle"), (0, "weight kam karna hai", "lose"),
             (0, "body banana hai", "muscle"), (0, "loose weight", "lose"), (0, "I don't want to gain fat", None),
             (1, "pure veg", "veg"), (1, "non-veg", "nonveg"), (1, "eggetarian", "nonveg"), (1, "meat nahi khata", None),
             (2, "Gym", "gym"), (2, "ghar pe", "home"), (2, "home gym", "gym"), (2, "outdoors", None)]
    read = js("""Object.assign(picked, {goal: 'muscle', diet: 'veg', train: 'gym'});
        return arguments[0].map(([s, text]) => { step = s; hear(text); return step > s ? picked[questions[s][0]] : null; })""", cases)
    wrong = [(text, want, got) for (_, text, want), got in zip(cases, read) if got != want]
    assert not wrong, f"Sensei misread typed answers (text, wanted, got): {wrong}"
    time.sleep(1)  # let the queued replies land before moving on
    # On a phone the chat is a sheet along the bottom edge
    driver.set_window_size(390, 844)
    time.sleep(0.5)
    js("document.querySelector('#chat').showPopover()")
    sheet = js("const r = document.querySelector('#chat').getBoundingClientRect(); return [r.left, r.right - document.documentElement.clientWidth, r.bottom - innerHeight, r.top]")
    assert sheet[:3] == [0, 0, 0] and sheet[3] > 0, f"on a phone the chat should be a full-width sheet at the bottom, got {sheet}"
    js("document.querySelector('#chat').hidePopover()")

    # Older Safari (before 17: older iPhones and iPads) has no popovers. Simulate it: no popover API for
    # main.js, no popover attributes, and the CSS fallback that only such browsers apply. The closed menu
    # and cart stay hidden, ☰ opens the menu, picking a link closes it, and the cart opens.
    no_popovers = driver.execute_cdp_cmd("Page.addScriptToEvaluateOnNewDocument", {"source": """
        for (const name of ['togglePopover', 'showPopover', 'hidePopover']) delete HTMLElement.prototype[name];
        new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach((n) => n.nodeType === 1 && n.removeAttribute('popover'))))
          .observe(document, {childList: true, subtree: true});"""})
    driver.refresh()
    time.sleep(1)
    fallback = re.search(r"@supports not selector\(:popover-open\) \{(.*?)\n\}\n", (site / "styles.css").read_text(), re.S).group(1)
    js("const s = document.createElement('style'); s.textContent = arguments[0]; document.head.append(s)", fallback)
    shown_now = lambda sel: js(f"return getComputedStyle(document.querySelector('{sel}')).display") != "none"
    assert not any(map(shown_now, ("#menu", "#cart", "#chat"))), "without popovers, the closed menu, cart and chat should stay hidden"
    driver.find_element(By.CSS_SELECTOR, ".menu-toggle").click()
    assert shown_now("#menu"), "without popovers, ☰ should open the menu"
    driver.find_element(By.CSS_SELECTOR, '#menu a[href="#lab"]').click()
    assert not shown_now("#menu"), "without popovers, picking a link should close the menu"
    driver.find_element(By.CSS_SELECTOR, ".cart-toggle").click()
    assert shown_now("#cart"), "without popovers, the cart button should open the cart"
    js("document.querySelector('.chat-toggle').click()")
    assert shown_now("#chat"), "without popovers, the Sensei launcher should open the chat"
    driver.execute_cdp_cmd("Page.removeScriptToEvaluateOnNewDocument", {"identifier": no_popovers["identifier"]})
    driver.set_window_size(1440, 900)

    # ---------- Manga → Clean: the bars sweep up here, and the Clean page lifts them away ----------
    # Every page from here on logs how <html>'s classes change from its very start, before its own scripts run
    driver.execute_cdp_cmd("Page.addScriptToEvaluateOnNewDocument", {"source": """
        window.classLog = [];
        const t0 = performance.now();
        new MutationObserver(() => classLog.push([Math.round(performance.now() - t0), document.documentElement.className]))
          .observe(document, {attributes: true, attributeFilter: ['class'], subtree: true});"""})
    driver.refresh()
    time.sleep(2)
    driver.find_element(By.CSS_SELECTOR, ".logo").click()  # the first click starts the music
    time.sleep(0.8)
    music_at = js("return document.querySelector('.music').currentTime")
    assert music_at > 0, "the music should be playing before the switch"
    driver.find_element(By.CSS_SELECTOR, ".mode-switch").click()
    leaving = js("return document.documentElement.className")
    assert "is-leaving" in leaving and "is-launching" in leaving, f"the switch should sweep the bars up over this page: {leaving}"
    wait_until(lambda: page_is("clean"), "the switch should go on to the Clean page", 4)
    wait_until(lambda: not js("return /is-arriving|is-revealing/.test(document.documentElement.className)"), "the Clean page should lift the bars", 4)
    log = js("return classLog")
    first, lifting = log[0][1], next((c for _, c in log if "is-revealing" in c), "")
    assert "is-arriving" in first and "is-launching" in first, f"the Clean page should open under the same bars: {log}"
    assert lifting and "is-launching" in lifting, f"then lift them away: {log}"
    assert js("return localStorage.getItem('rsw-mode')") == "clean", "Clean should be kept as the mode"
    assert js("return document.querySelector('.hud .cart-count').textContent") == "1", "the cart should carry over to Clean"
    assert not js("return document.querySelector('.mode-dialog').open"), "a switch shouldn't ask for the mode again"
    resumed = js("return document.querySelector('.music').currentTime")
    print(f"note: music {'carried on' if resumed >= music_at else 'waits for a click'} on the Clean page ({music_at:.1f}s -> {resumed:.1f}s)")

    # No script errors anywhere along the way (the browser's own WebGL performance notes aside)
    errors = [e["message"] for e in driver.get_log("browser") if e["level"] == "SEVERE" and "GL Driver Message" not in e["message"]]
    assert not errors, "console errors:\n" + "\n".join(errors)

    # Reduced motion: nothing waits for a scroll animation to become visible, and the switch is instant
    driver.execute_cdp_cmd("Emulation.setEmulatedMedia", {
        "features": [{"name": "prefers-reduced-motion", "value": "reduce"}],
    })
    driver.get(PAGE)
    time.sleep(1)
    hidden = js("return [...document.querySelectorAll('.reveal')].filter(e => getComputedStyle(e).opacity !== '1').length")
    assert hidden == 0, f"{hidden} elements stay hidden with reduced motion"
    assert not js("return document.documentElement.classList.contains('lenis')"), "smooth scrolling despite reduced motion"
    assert js("return getComputedStyle(document.querySelector('.hero-stage')).position") != "sticky", "hero pinned despite reduced motion"
    assert js("return document.querySelector('.hero').style.getPropertyValue('--power')") == "", "hero charged despite reduced motion"
    arc_hidden = js("return [...document.querySelectorAll('.arc-panel')].filter((p) => getComputedStyle(p).opacity !== '1' || getComputedStyle(p, '::before').content !== 'none').length")
    assert arc_hidden == 0, f"{arc_hidden} training-arc panels hidden with reduced motion"
    jump(0)
    wheel()
    time.sleep(0.6)
    assert js("return scrollY") > 0 and power() == 0, "with reduced motion a scroll at the top should simply scroll"
    jump(orbit_top)
    time.sleep(0.5)
    assert not drifts(orbit), "the worlds should hold still with reduced motion"
    covered = js("""return [...document.querySelectorAll('[data-anim]')].filter((el) => el.checkVisibility() && (
        getComputedStyle(el).opacity !== '1'
        || [...el.querySelectorAll('.c')].some((c) => !['none', '0px'].includes(getComputedStyle(c).translate)))).length""")
    assert covered == 0, f"{covered} entrances hide or shift things with reduced motion"
    driver.find_element(By.CSS_SELECTOR, ".mode-switch").click()
    wait_until(lambda: page_is("clean"), "with reduced motion the switch should go straight to Clean", 3)
    assert "is-launching" not in js("return document.documentElement.className"), "with reduced motion nothing should cover the Clean page"

    errors = [e["message"] for e in driver.get_log("browser") if e["level"] == "SEVERE" and "GL Driver Message" not in e["message"]]
    assert not errors, "console errors:\n" + "\n".join(errors)
    print("all checks passed")
finally:
    driver.quit()
