// Portfolio V3 interactions. Small and dependency-free; every effect has a final state that CSS shows without JS.
// EN and AR are two static pages with the same structure and ids. The language switch swaps the other page's content
// into this document (no reload, the portrait canvas is kept); init() binds the content, teardown() unbinds it.
(function () {
  var reduce = matchMedia('(prefers-reduced-motion: reduce)');
  var $$ = function (s, r) { return [].slice.call((r || document).querySelectorAll(s)); };
  var off = [], here = null;
  // window/document/media-query listeners and observers registered here are removed by teardown(); listeners on
  // elements inside the content go away with the content itself
  function on(t, type, fn, o) { t.addEventListener(type, fn, o); off.push(function () { t.removeEventListener(type, fn, o); }); }
  function teardown() { off.splice(0).forEach(function (f) { f(); }); }

  function init(tab) {
    // ── Nav: frosted once the page moves ──
    var nav = document.getElementById('nav');
    function stick() { nav.classList.toggle('stuck', scrollY > 8); }
    on(window, 'scroll', stick, { passive: true });

    // ── Current-section ink bar ──
    var links = $$('#links a'), bar = document.getElementById('inkbar');
    var map = { top: null, work: '#work', wink: '#work', 'total-print': '#work', lab: '#work', engineering: '#engineering', services: '#services', process: '#process', contact: '#contact' };
    var current = null;
    function mark(href) {
      current = href;
      var cur = null;
      links.forEach(function (a) { var on = a.getAttribute('href') === href; if (on) { a.setAttribute('aria-current', 'true'); cur = a; } else a.removeAttribute('aria-current'); });
      if (!cur || !cur.offsetWidth) { bar.style.setProperty('--o', 0); return; }
      bar.style.setProperty('--x', cur.offsetLeft + 14 + 'px'); bar.style.setProperty('--w', cur.offsetWidth - 28 + 'px'); bar.style.setProperty('--o', 1);
    }
    var spy = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { here = e.target.id; mark(map[here]); } }); }, { rootMargin: '-45% 0px -50% 0px' });
    Object.keys(map).forEach(function (id) { var el = document.getElementById(id); if (el) spy.observe(el); });
    off.push(function () { spy.disconnect(); });
    on(window, 'resize', function () { mark(current); });

    // ── Language switch: the other page opens in place at the same section; intent (hover, focus, touch) prefetches it ──
    $$('.lang a:not([aria-current])').forEach(function (a) {
      var base = a.href;
      function warm() { prepare(base).catch(function () {}); }
      a.addEventListener('pointerenter', warm); a.addEventListener('focus', warm); a.addEventListener('touchstart', warm, { passive: true });
      a.addEventListener('click', function (e) {
        a.href = base + (here && here !== 'top' ? '#' + here : '');                    // also what a new tab opens
        if (e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault(); go(a.href, true);
      });
    });

    // ── Email: copy the address (only where the Clipboard API exists; the address itself stays selectable text) ──
    if (navigator.clipboard) $$('.copy-email').forEach(function (b) {
      var label = b.innerHTML, status = b.nextElementSibling, t;
      b.hidden = false;
      b.addEventListener('click', function () {
        navigator.clipboard.writeText(b.getAttribute('data-copy')).then(function () {
          b.textContent = status.textContent = b.getAttribute('data-done');
          clearTimeout(t); t = setTimeout(function () { b.innerHTML = label; status.textContent = ''; }, 2000);
        });
      });
    });

    // ── Mobile sheet: disclosure; Esc closes and returns focus ──
    var btn = document.getElementById('menuBtn'), sheet = document.getElementById('sheet');
    function setOpen(o) { btn.setAttribute('aria-expanded', o); sheet.classList.toggle('open', o); if (o) sheet.querySelector('a').focus(); }
    btn.addEventListener('click', function () { setOpen(btn.getAttribute('aria-expanded') !== 'true'); });
    sheet.addEventListener('click', function (e) { if (e.target.closest('a')) setOpen(false); });
    on(window, 'keydown', function (e) { if (e.key === 'Escape' && btn.getAttribute('aria-expanded') === 'true') { setOpen(false); btn.focus(); } });
    on(matchMedia('(min-width:1024px)'), 'change', function (m) { if (m.matches) setOpen(false); });

    // ── One-time reveals as content arrives (content swapped in by the language switch keeps what was revealed) ──
    var revealEls = $$('.reveal, .rise, .shots').filter(function (e) { return !e.classList.contains('in'); });
    if (reduce.matches || !('IntersectionObserver' in window)) revealEls.forEach(function (e) { e.classList.add('in'); });
    else {
      var io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }); }, { rootMargin: '0px 0px -12% 0px' });
      revealEls.forEach(function (e) { io.observe(e); });
      off.push(function () { io.disconnect(); });
    }

    // ── Films: poster + one play button; nothing downloads until play; native controls take over ──
    var videos = $$('.film video');
    $$('.film').forEach(function (fig) {
      var v = fig.querySelector('video'), pb = fig.querySelector('.play');
      v.controls = false; pb.hidden = false;
      function start() { pb.hidden = true; v.controls = true; fig.classList.add('playing'); }
      pb.addEventListener('click', function () { start(); v.play(); v.focus(); });
      v.addEventListener('play', function () { start(); videos.forEach(function (o) { if (o !== v) o.pause(); }); });
    });

    // ── Projects: palette sheet-feeds in (hysteresis, no flicker); film frame opens with its own scroll position ──
    var projects = $$('.project'), ticking = false;
    function progress() {
      ticking = false;
      var vh = innerHeight, light = false;
      projects.forEach(function (sec) {
        var r = sec.getBoundingClientRect();
        if (r.bottom < -vh || r.top > vh * 2) return;
        if (reduce.matches || r.top < vh * 0.65) sec.classList.add('in'); else if (r.top > vh * 0.85) sec.classList.remove('in');
        var film = sec.querySelector('.film');
        if (film && !reduce.matches) film.style.setProperty('--p', Math.min(1, Math.max(0, (vh - film.getBoundingClientRect().top) / (vh * 0.75))).toFixed(3));
        if (sec.getAttribute('data-nav') === 'light' && sec.classList.contains('in') && r.top < 68 && r.bottom > 68) light = true;
      });
      nav.classList.toggle('light', light);
    }
    function onScroll() { if (!ticking) { ticking = true; requestAnimationFrame(progress); } }
    if (reduce.matches) projects.forEach(function (sec) { sec.classList.add('in'); });   // final palettes everywhere at once
    else $$('.project .film').forEach(function (f) { f.style.setProperty('--p', 0); });
    on(window, 'scroll', onScroll, { passive: true }); on(window, 'resize', onScroll);
    // first geometry reads wait for the first frame, so script never forces the page's initial layout synchronously
    requestAnimationFrame(function () { stick(); progress(); });

    // ── Inside the engineering: articles become an accessible tab set (arrow keys, Home/End) ──
    var eng = document.getElementById('eng'), list = eng.querySelector('[role="tablist"]'), panels = $$('.eng-panel', eng);
    var tabs = panels.map(function (p, i) {
      var t = document.createElement('button');
      t.type = 'button'; t.className = 'eng-tab'; t.id = 'tab-' + p.id; t.setAttribute('role', 'tab'); t.setAttribute('aria-controls', p.id);
      t.innerHTML = '<span class="n">0' + (i + 1) + '</span><b></b><small></small>';
      t.querySelector('b').textContent = p.getAttribute('data-tab'); t.querySelector('small').textContent = p.getAttribute('data-tag');
      p.setAttribute('role', 'tabpanel'); p.setAttribute('aria-labelledby', t.id); p.tabIndex = 0;
      t.addEventListener('click', function () { select(i, false); });
      list.appendChild(t); return t;
    });
    function select(i, focus) {
      tabs.forEach(function (t, k) { var on = k === i; t.setAttribute('aria-selected', on); t.tabIndex = on ? 0 : -1; panels[k].hidden = !on; panels[k].classList.toggle('show', on); });
      if (focus) tabs[i].focus();
    }
    list.addEventListener('keydown', function (e) {
      var i = tabs.indexOf(document.activeElement), n = tabs.length, f = document.dir === 'rtl' ? -1 : 1;   // right-to-left: ArrowLeft moves forward
      var k = { ArrowDown: i + 1, ArrowRight: i + f, ArrowUp: i - 1, ArrowLeft: i - f, Home: 0, End: n - 1 }[e.key];
      if (k === undefined || i < 0) return;
      e.preventDefault(); select((k + n) % n, true);
    });
    var vertical = matchMedia('(min-width:1024px)');
    function orient() { list.setAttribute('aria-orientation', vertical.matches ? 'vertical' : 'horizontal'); }
    on(vertical, 'change', orient); orient();
    select(tab > 0 && tab < tabs.length ? tab : 0, false);

    // ── Services: one open at a time, with a smooth height change (native <details> without JS) ──
    var svcs = $$('.svc');
    svcs.forEach(function (d) { d.removeAttribute('name'); }); // exclusivity handled here, so closing can animate
    function animate(d, open) {
      var b = d.querySelector('.svc-body');
      if (reduce.matches || !b.animate) { d.open = open; return; }
      if (open) d.open = true;
      var h = b.scrollHeight;
      var a = b.animate([{ height: (open ? 0 : h) + 'px' }, { height: (open ? h : 0) + 'px' }], { duration: 480, easing: 'cubic-bezier(.2,.75,.1,1)' });
      a.onfinish = function () { if (!open) d.open = false; };
    }
    svcs.forEach(function (d) {
      d.querySelector('summary').addEventListener('click', function (e) {
        e.preventDefault();
        var opening = !d.open;
        svcs.forEach(function (o) { if (o !== d && o.open) animate(o, false); });
        animate(d, opening);
      });
    });
  }

  // ── In-place language switch ──
  // prepare(url): fetch the other page once, load its extra stylesheets (inert: media="not all") and warm its preloaded
  // fonts, so the swap never waits on the network. go(url): swap, inside a view transition where the browser has one.
  // Without fetch/DOMParser support or on any failure, the link is followed as an ordinary page load.
  // a link's .href re-resolves against the URL after pushState, so each stylesheet keeps the absolute URL it was loaded from
  var pages = {}, busy = false, shown = location.pathname;
  $$('link[rel="stylesheet"]').forEach(function (l) { l.abs = l.href; });
  function parse(html) { return new DOMParser().parseFromString(html, 'text/html'); }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function sheetsOf(doc, url) { return $$('link[rel="stylesheet"]', doc.head).map(function (l) { return new URL(l.getAttribute('href'), url).href; }); }
  function sheet(href) {
    if ($$('link[rel="stylesheet"]', document.head).some(function (l) { return l.abs === href; })) return Promise.resolve();
    return new Promise(function (ok, fail) {
      var l = document.createElement('link'); l.rel = 'stylesheet'; l.media = 'not all'; l.abs = href; l.onload = ok; l.onerror = fail; l.href = href;
      document.head.appendChild(l);
    });
  }
  function prepare(url) {
    var k = url.split('#')[0];
    return pages[k] || (pages[k] = fetch(k).then(function (r) { if (!r.ok) throw r.status; return r.text(); }).then(function (html) {
      var doc = parse(html), fonts = $$('link[rel="preload"][as="font"]', doc.head).map(function (l) { return new URL(l.getAttribute('href'), k).href; })
        .filter(function (u) { return !performance.getEntriesByName(u).length; })   // already loaded by this document
        .map(function (u) { return fetch(u, { mode: 'cors' }).then(function (r) { return r.blob(); }); });
      return Promise.all(sheetsOf(doc, k).map(sheet).concat(Promise.race([Promise.all(fonts), wait(1500)]).catch(function () {}))).then(function () { return html; });
    }).catch(function (e) { delete pages[k]; throw e; }));
  }

  function go(url, push) {
    if (busy) return;
    busy = true;
    prepare(url).then(function (html) {
      var doc = parse(html), el = document.activeElement, focus = el && el.closest && el.closest('.lang');
      function swap() {
        var at = spot();
        apply(doc, url, push);
        // the new language's fonts settle before the page is shown (a view transition keeps the old frame meanwhile)
        return Promise.race([document.fonts.ready, wait(800)]).then(function () {
          land(at);
          if (focus) { var vis = $$('.lang a').filter(function (x) { return x.offsetWidth; }), a = vis.filter(function (x) { return x.hasAttribute('aria-current'); })[0] || vis[0]; if (a) a.focus({ preventScroll: true }); }   // the current language where shown (hidden on phones)
        });
      }
      if (!document.startViewTransition || reduce.matches || document.hidden) return swap();
      var t = document.startViewTransition(swap);
      t.ready.catch(function () {});                                                   // skipped animation (e.g. viewport resized): the swap still happened
      return t.updateCallbackDone;                                                      // unlocked once swapped; a new switch may cut the glide short
    }).then(done, function () { location.href = url; });
  }
  function done() { busy = false; if (location.pathname !== shown) go(location.href, false); }   // Back/Forward pressed mid-switch
  // where the reader is: the current section, and how far through it the top of the viewport sits
  function spot() { var el = here && document.getElementById(here); if (!el) return null; var r = el.getBoundingClientRect(); return { id: here, f: -r.top / r.height }; }
  function land(at) { var el = at && document.getElementById(at.id); if (!el) return; var r = el.getBoundingClientRect(); scrollTo({ top: scrollY + r.top + at.f * r.height, behavior: 'instant' }); }

  function apply(doc, url, push) {
    var html = document.documentElement, src = doc.documentElement, head = document.head;
    var tab = $$('.eng-tab').map(function (t) { return t.getAttribute('aria-selected'); }).indexOf('true');
    teardown();
    if (push) history.pushState(null, '', url);                                          // first, so relative URLs in the new content resolve
    shown = location.pathname;
    html.lang = src.lang; if (src.dir) html.dir = src.dir; else html.removeAttribute('dir');
    html.classList.add('swapped');
    document.title = doc.title;
    ['meta[name="description"]', 'link[rel="canonical"]', 'link[rel="alternate"]', 'script[type="application/ld+json"]'].forEach(function (s) {
      var a = $$(s, head), b = $$(s, doc.head);
      a.forEach(function (el, i) { if (b[i]) el.replaceWith(b[i]); });
    });
    var want = sheetsOf(doc, url);
    $$('link[rel="stylesheet"]', head).forEach(function (l) { if (want.indexOf(l.abs) < 0) l.media = 'not all'; else l.removeAttribute('media'); });
    // content: the same blocks in both pages; the reader's state carries across (revealed blocks, palettes, open service)
    var SEL = 'body > .skip, #nav, #sheet, #main, body > footer', olds = $$(SEL), wrap = document.createElement('div');
    $$(SEL, doc).forEach(function (n) { wrap.appendChild(document.adoptNode(n)); });
    var news = [].slice.call(wrap.children);
    ['.reveal', '.rise', '.shots', '.project'].forEach(function (s) { var a = $$(s); $$(s, wrap).forEach(function (el, i) { if (a[i] && a[i].classList.contains('in')) el.classList.add('in'); }); });
    var svcA = $$('.svc'); $$('.svc', wrap).forEach(function (d, i) { d.open = !!(svcA[i] && svcA[i].open); });
    wrap.querySelector('#nav').className = document.getElementById('nav').className;    // stuck / light
    var keep = document.querySelector('.portrait'), fresh = wrap.querySelector('.portrait');
    keep.setAttribute('aria-label', fresh.getAttribute('aria-label'));
    fresh.replaceWith(keep);                                                             // the live canvas: no reload, no second assembly
    olds.forEach(function (o, i) { o.replaceWith(news[i]); });
    init(tab);
  }

  addEventListener('popstate', function () { if (location.pathname !== shown) go(location.href, false); });
  init(0);
  // arriving at #section (e.g. a shared link): land again once web fonts have settled the page height
  if (location.hash) document.fonts.ready.then(function () { var t = document.getElementById(location.hash.slice(1)); if (t) t.scrollIntoView({ behavior: 'instant' }); });
})();
