// Portfolio V3 interactions. Small and dependency-free; every effect has a final state that CSS shows without JS.
(function () {
  var reduce = matchMedia('(prefers-reduced-motion: reduce)');
  var $$ = function (s, r) { return [].slice.call((r || document).querySelectorAll(s)); };

  // ── Nav: frosted once the page moves ──
  var nav = document.getElementById('nav');
  function stick() { nav.classList.toggle('stuck', scrollY > 8); }
  addEventListener('scroll', stick, { passive: true });

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
  var spy = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) mark(map[e.target.id]); }); }, { rootMargin: '-45% 0px -50% 0px' });
  Object.keys(map).forEach(function (id) { var el = document.getElementById(id); if (el) spy.observe(el); });
  addEventListener('resize', function () { mark(current); });

  // ── Mobile sheet: disclosure; Esc closes and returns focus ──
  var btn = document.getElementById('menuBtn'), sheet = document.getElementById('sheet');
  function setOpen(o) { btn.setAttribute('aria-expanded', o); sheet.classList.toggle('open', o); if (o) sheet.querySelector('a').focus(); }
  btn.addEventListener('click', function () { setOpen(btn.getAttribute('aria-expanded') !== 'true'); });
  sheet.addEventListener('click', function (e) { if (e.target.closest('a')) setOpen(false); });
  addEventListener('keydown', function (e) { if (e.key === 'Escape' && btn.getAttribute('aria-expanded') === 'true') { setOpen(false); btn.focus(); } });
  matchMedia('(min-width:1024px)').addEventListener('change', function (m) { if (m.matches) setOpen(false); });

  // ── One-time reveals as content arrives ──
  var revealEls = $$('.reveal, .rise, .shots');
  if (reduce.matches || !('IntersectionObserver' in window)) revealEls.forEach(function (e) { e.classList.add('in'); });
  else {
    var io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }); }, { rootMargin: '0px 0px -12% 0px' });
    revealEls.forEach(function (e) { io.observe(e); });
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
  addEventListener('scroll', onScroll, { passive: true }); addEventListener('resize', onScroll);
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
    var i = tabs.indexOf(document.activeElement), n = tabs.length, k = { ArrowDown: i + 1, ArrowRight: i + 1, ArrowUp: i - 1, ArrowLeft: i - 1, Home: 0, End: n - 1 }[e.key];
    if (k === undefined || i < 0) return;
    e.preventDefault(); select((k + n) % n, true);
  });
  var vertical = matchMedia('(min-width:1024px)');
  function orient() { list.setAttribute('aria-orientation', vertical.matches ? 'vertical' : 'horizontal'); }
  vertical.addEventListener('change', orient); orient();
  select(0, false);

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
})();
