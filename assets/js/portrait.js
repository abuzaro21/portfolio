// Hero portrait (Canvas 2D): the whole subject is drawn as image-derived particles from assets/portrait/particles.json.
//
// Moiré: a regular dot lattice with gaps turns into rings and curves whenever the page is resampled (OS scaling, zoom).
// Every particle therefore sits at a deterministic random offset of ±½ its pitch on each axis around its cell centre.
// Uniform jitter over a full pitch cancels every harmonic of the lattice, so no periodic structure is left to beat.
// Dots are antialiased at quarter-pixel positions (pre-computed sprites), never snapped to a pixel grid.
// Density: eye band at ½ cell pitch, face/hair/neck at 1 cell, suit at 2 cells.
//
// States: assembling (~2.4 s) -> settled (no frames) <-> interacting (only while the pointer moves) -> settled.
//  - Pointer: a smooth local push (no hard edge, no tint ring), full on the suit, 40% on the face, 20% on the eye band.
//    Dots ease to their target in first order (no oscillation); the loop stops when all are within EPS.
//  - Each interactive frame updates only the dots near the pointer (spatial buckets) and redraws only the dirty
//    rectangle around them into the cached frame buffer (putImageData with a dirty rect).
//  - Pointer events without real movement (page scrolled under the cursor) and touch input are ignored.
//  - One scheduler: at most one requestAnimationFrame pending; cancelled when the tab is hidden or the portrait is off screen.
(function () {
  var cv = document.getElementById('portrait');
  if (!cv || !cv.getContext) return;
  var box = cv.parentNode, ctx = cv.getContext('2d');
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var AR = 70, AG = 214, AB = 196;                // accent #46D6C4 (assembly tint only)
  var FACE_X = 510, FACE_Y = 375;                  // between the eyes, in source px below the trimmed top
  var EPS = 0.03, AMP = [1, 0.4, 0.2];             // settle threshold (css px); push strength per level: suit, face, eye band
  var data, W, H, dpr, s, ox, img, buf32, spr, rMax, SIG, A;
  var n, hx, hy, x, y, col, lv, sx, sy, del, dur, endT;
  var BK = 24, bw, bh, bStart, bIdx;               // spatial buckets of home positions (css px)
  var active = [], isActive;
  var state = 'loading', t0 = 0, last = 0, raf = 0, visible = true;
  var ptr = { x: 0, y: 0, on: false };

  // the data ships as base64 JSON, not a .bin: download managers grab a preloaded application/octet-stream .bin as a file
  fetch(cv.getAttribute('data-src')).then(function (r) { if (!r.ok) throw r.status; return r.json(); }).then(function (b64) {
    var str = atob(b64), u8 = new Uint8Array(str.length);
    for (var i = 0; i < str.length; i++) u8[i] = str.charCodeAt(i);
    data = parse(u8.buffer);
    layout();
    box.classList.add('ready');
    if (reduce) { state = 'settled'; renderAll(); return; }
    state = 'assembling'; t0 = performance.now() + 120; schedule();
    box.addEventListener('pointermove', onMove, { passive: true });
    box.addEventListener('pointerleave', release, { passive: true });
    addEventListener('scroll', function () { if (ptr.on) release(); }, { passive: true });
    document.addEventListener('visibilitychange', function () { if (document.hidden) pause(); else resume(); });
    new IntersectionObserver(function (es) { visible = es[0].isIntersecting; if (visible) resume(); else pause(); }).observe(box);
    var rt; addEventListener('resize', function () {
      clearTimeout(rt);
      rt = setTimeout(function () { layout(); if (state === 'assembling') schedule(); else { ptr.on = false; state = 'settled'; renderAll(); } }, 150);
    });
  }).catch(function () { /* no portrait: the headline stands on its own */ });

  // header u16 gw, gh, cell, count, details; then kept-cell mask, fine bits, detail bits, colours (see tools/build-portrait.cjs)
  function parse(ab) {
    var dv = new DataView(ab), u = function (i) { return dv.getUint16(i * 2, true); };
    var gw = u(0), gh = u(1), cell = u(2), count = u(3), o = 12;
    var mask = new Uint8Array(ab, o, Math.ceil(gw * gh / 8)); o += mask.length;
    var fm = new Uint8Array(ab, o, Math.ceil(count / 8)); o += fm.length;
    var dm = new Uint8Array(ab, o, Math.ceil(count / 8)); o += dm.length;
    var rgb = new Uint8Array(ab, o), total = count + u(4) * 3;
    var d = { gw: gw, gh: gh, cell: cell, n: total, x: new Float32Array(total), y: new Float32Array(total), lv: new Uint8Array(total), c: new Uint32Array(total) };
    for (var k = 0, j = 0, p = 0, q = 0; k < gw * gh; k++) {
      if (!(mask[k >> 3] & (1 << (k & 7)))) continue;
      var gx = k % gw, gy = (k / gw) | 0, fine = fm[j >> 3] >> (j & 7) & 1, det = dm[j >> 3] >> (j & 7) & 1; j++;
      if (!det) { put(gx + 0.5, gy + 0.5, fine); continue; }
      put(gx + 0.25, gy + 0.25, 2); put(gx + 0.75, gy + 0.25, 2); put(gx + 0.25, gy + 0.75, 2); put(gx + 0.75, gy + 0.75, 2);
    }
    function put(cx, cy, level) { d.x[p] = cx; d.y[p] = cy; d.lv[p] = level; d.c[p] = (255 << 24 | rgb[q + 2] << 16 | rgb[q + 1] << 8 | rgb[q]) >>> 0; q += 3; p++; }
    return d;
  }

  // deterministic per-particle random in [0,1): the same jitter on every load and every resize
  function hash(i, salt) { var h = Math.imul(i ^ salt, 0x9E3779B1); h ^= h >>> 15; h = Math.imul(h, 0x85EBCA77); h ^= h >>> 13; h = Math.imul(h, 0xC2B2AE3D); h ^= h >>> 16; return (h >>> 0) / 4294967296; }

  // antialiased dot of radius r (device px) at 4×4 sub-pixel phases: offsets from floor(centre) + coverage 0..255
  function sprites(r) {
    var out = [], e = Math.ceil(r + 1);
    for (var qy = 0; qy < 4; qy++) for (var qx = 0; qx < 4; qx++) {
      var cx = (qx + 0.5) / 4, cy = (qy + 0.5) / 4, dx = [], dy = [], c = [];
      for (var py = -e; py <= e; py++) for (var px = -e; px <= e; px++) {
        var v = Math.min(1, r + 0.5 - Math.hypot(px + 0.5 - cx, py + 0.5 - cy));
        if (v > 0.04) { dx.push(px); dy.push(py); c.push(Math.round(v * 255)); }
      }
      out.push({ dx: new Int16Array(dx), dy: new Int16Array(dy), c: new Uint8Array(c), L: c.length });
    }
    return out;
  }

  function layout() {
    var r = box.getBoundingClientRect(), cw = r.width, ch = r.height;
    if (!cw || !ch) return;
    var zoom = parseFloat(getComputedStyle(box).getPropertyValue('--zoom')) || 1;
    dpr = Math.min(devicePixelRatio || 1, Math.sqrt(2.4e6 / (cw * ch)));                 // native sharpness within a ~2.4 MP buffer
    W = cv.width = Math.round(cw * dpr); H = cv.height = Math.round(ch * dpr);
    img = ctx.createImageData(W, H); buf32 = new Uint32Array(img.data.buffer);
    s = Math.max(cw / data.gw, ch / data.gh) * zoom;                                    // css px per cell: cover, anchored top, centred on the face
    ox = cw / 2 - FACE_X / data.cell * s;
    var P = [2 * s, s, s / 2];                                                          // particle pitch per level (css px)
    // suit dots stay open (62% of pitch); face and eye dots ~100% of pitch over the evenly spaced (blue-noise) field
    var RAD = [0.31 * P[0], 0.5 * P[1], 0.52 * P[2]].map(function (v) { return Math.max(0.7, v * dpr); });
    spr = RAD.map(sprites); rMax = Math.max.apply(null, RAD) / dpr + 1;
    SIG = Math.max(16, cw * 0.05); A = Math.min(7, s * 2.6);                           // push width and maximum push (css px)
    var keep = [];
    for (var i = 0; i < data.n; i++) { var px = ox + data.x[i] * s, py = data.y[i] * s; if (px > -4 && px < cw + 4 && py > -4 && py < ch + 4) keep.push(i); }
    n = keep.length;
    hx = new Float32Array(n); hy = new Float32Array(n); x = new Float32Array(n); y = new Float32Array(n); col = new Uint32Array(n); lv = new Uint8Array(n);
    sx = new Float32Array(n); sy = new Float32Array(n); del = new Float32Array(n); dur = new Float32Array(n); isActive = new Uint8Array(n); active = [];
    var cx0 = new Float32Array(n), cy0 = new Float32Array(n);
    var fx = ox + FACE_X / data.cell * s, fy = FACE_Y / data.cell * s, far = Math.hypot(Math.max(fx, cw - fx), Math.max(fy, ch - fy)), diag = Math.hypot(cw, ch);
    endT = 0;
    for (var p = 0; p < n; p++) {
      var c = keep[p], l = data.lv[c];
      lv[p] = l; col[p] = data.c[c];
      cx0[p] = ox + data.x[c] * s; cy0[p] = data.y[c] * s;
      hx[p] = cx0[p] + (hash(c, 0x51) - 0.5) * P[l];                                     // ±½ pitch: no lattice left
      hy[p] = cy0[p] + (hash(c, 0xA7) - 0.5) * P[l];
      var a = Math.random() * 6.2832, d0 = diag * (0.1 + 0.45 * Math.pow(Math.random(), 0.7));
      sx[p] = Math.cos(a) * d0; sy[p] = Math.sin(a) * d0;                                // straight-line start offset
      del[p] = 0.8 * Math.pow(Math.hypot(hx[p] - fx, hy[p] - fy) / far, 1.15) + Math.random() * 0.2;
      dur[p] = 1.1 + Math.random() * 0.4;
      if (del[p] + dur[p] > endT) endT = del[p] + dur[p];
    }
    relax(P, cx0, cy0);
    for (p = 0; p < n; p++) { x[p] = hx[p]; y[p] = hy[p]; }
    // bucket the home positions (counting sort) for local lookups
    bw = Math.ceil(cw / BK) + 2; bh = Math.ceil(ch / BK) + 2;
    var cnt = new Int32Array(bw * bh + 1), bOf = new Int32Array(n);
    for (p = 0; p < n; p++) { bOf[p] = bucket(hx[p], hy[p]); cnt[bOf[p] + 1]++; }
    for (i = 0; i < bw * bh; i++) cnt[i + 1] += cnt[i];
    bStart = cnt.slice(); bIdx = new Uint32Array(n);
    var fill = cnt.slice(0, bw * bh); for (p = 0; p < n; p++) bIdx[fill[bOf[p]]++] = p;
  }
  // blue-noise spacing: a few deterministic neighbour-repulsion passes per level. Pure jitter clumps and leaves worm-like
  // gaps; relaxed points keep an even minimum distance (~0.9 pitch) without returning to a lattice. Each point stays
  // within ±0.6 pitch of its own cell centre, so every colour stays where the photo put it.
  function relax(P, cx0, cy0) {
    for (var l = 0; l < 3; l++) {
      var pitch = P[l], dmin = 0.9 * pitch, d2min = dmin * dmin, lim = 0.6 * pitch, ids = [];
      for (var i = 0; i < n; i++) if (lv[i] === l) ids.push(i);
      for (var pass = 0; pass < 4; pass++) {
        var grid = new Map(), key = function (px, py) { return (Math.floor(px / pitch) + 1024) * 8192 + Math.floor(py / pitch) + 1024; };
        for (var m = 0; m < ids.length; m++) { var id = ids[m], k = key(hx[id], hy[id]), a = grid.get(k); if (a) a.push(id); else grid.set(k, [id]); }
        for (m = 0; m < ids.length; m++) {
          var a0 = ids[m], bx = Math.floor(hx[a0] / pitch) + 1024, by = Math.floor(hy[a0] / pitch) + 1024;
          for (var gx = bx - 1; gx <= bx + 1; gx++) for (var gy = by - 1; gy <= by + 1; gy++) {
            var cell = grid.get(gx * 8192 + gy); if (!cell) continue;
            for (var q = 0; q < cell.length; q++) {
              var b = cell[q]; if (b <= a0) continue;
              var dx = hx[b] - hx[a0], dy = hy[b] - hy[a0], d2 = dx * dx + dy * dy;
              if (d2 < d2min && d2 > 1e-8) { var d = Math.sqrt(d2), f = (dmin - d) / d * 0.25; hx[a0] -= dx * f; hy[a0] -= dy * f; hx[b] += dx * f; hy[b] += dy * f; }
            }
          }
        }
        for (m = 0; m < ids.length; m++) { var j = ids[m]; hx[j] = Math.min(cx0[j] + lim, Math.max(cx0[j] - lim, hx[j])); hy[j] = Math.min(cy0[j] + lim, Math.max(cy0[j] - lim, hy[j])); }
      }
    }
  }
  function bucket(px, py) { var bx = Math.min(bw - 1, Math.max(0, Math.floor(px / BK) + 1)), by = Math.min(bh - 1, Math.max(0, Math.floor(py / BK) + 1)); return by * bw + bx; }
  // call f(i) for every particle whose home lies within the css rect [x0,x1]×[y0,y1]
  function each(x0, y0, x1, y1, f) {
    var bx0 = Math.max(0, Math.floor(x0 / BK) + 1), bx1 = Math.min(bw - 1, Math.floor(x1 / BK) + 1), by0 = Math.max(0, Math.floor(y0 / BK) + 1), by1 = Math.min(bh - 1, Math.floor(y1 / BK) + 1);
    for (var by = by0; by <= by1; by++) for (var bx = bx0; bx <= bx1; bx++) { var b = by * bw + bx; for (var k = bStart[b]; k < bStart[b + 1]; k++) f(bIdx[k]); }
  }

  // ── scheduler: never more than one frame pending, nothing scheduled while settled, hidden or off screen ──
  function schedule() { if (!raf && visible && !document.hidden && (state === 'assembling' || state === 'interacting')) { last = performance.now(); raf = requestAnimationFrame(frame); } }
  function pause() {
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    if (state === 'interacting' || state === 'still') { ptr.on = false; home(); state = 'settled'; renderAll(); }
  }
  function resume() { if (state === 'assembling' && performance.now() - t0 > endT * 1000) { state = 'settled'; home(); renderAll(); } else schedule(); }
  function home() { for (var i = 0; i < n; i++) { x[i] = hx[i]; y[i] = hy[i]; isActive[i] = 0; } active = []; }

  function frame(now) {
    raf = 0;
    if (state === 'assembling') {
      var t = (now - t0) / 1000;
      if (t >= endT) { state = 'settled'; home(); renderAll(); return; }
      drawAssembly(t); raf = requestAnimationFrame(frame); return;
    }
    if (state !== 'interacting') return;
    var k = 1 - Math.pow(0.8, Math.min(50, Math.max(0, now - last)) / 16.667); last = now; // time-based easing; no catch-up loops
    var busy = step(k);
    if (busy) raf = requestAnimationFrame(frame);
    else state = ptr.on ? 'still' : 'settled';                                           // resting pointer: frozen until it moves
  }

  // move the particles near the pointer (and any still returning home); redraw only the dirty rectangle
  function step(k) {
    var R3 = 3.2 * SIG, R32 = R3 * R3, S2 = 2 * SIG * SIG, busy = false, d0x = 1e9, d0y = 1e9, d1x = -1e9, d1y = -1e9;
    if (ptr.on) each(ptr.x - R3, ptr.y - R3, ptr.x + R3, ptr.y + R3, function (i) { if (!isActive[i]) { isActive[i] = 1; active.push(i); } });
    var keep = [];
    for (var m = 0; m < active.length; m++) {
      var i = active[m], tx = hx[i], ty = hy[i];
      if (ptr.on) {
        var dx = hx[i] - ptr.x, dy = hy[i] - ptr.y, d2 = dx * dx + dy * dy;
        if (d2 < R32 && d2 > 1e-4) { var d = Math.sqrt(d2), g = A * AMP[lv[i]] * Math.exp(0.5 - d2 / S2) / SIG; tx += dx * g; ty += dy * g; } // smooth radial push, peak at d = σ
      }
      var ex = tx - x[i], ey = ty - y[i], moved = false, px = x[i], py = y[i];
      if (ex > EPS || ex < -EPS || ey > EPS || ey < -EPS) { x[i] += ex * k; y[i] += ey * k; busy = moved = true; }
      else if (ex || ey) { x[i] = tx; y[i] = ty; moved = true; }
      if (moved) {
        if (px < d0x) d0x = px; if (px > d1x) d1x = px; if (py < d0y) d0y = py; if (py > d1y) d1y = py;
        if (x[i] < d0x) d0x = x[i]; if (x[i] > d1x) d1x = x[i]; if (y[i] < d0y) d0y = y[i]; if (y[i] > d1y) d1y = y[i];
      }
      if (x[i] !== hx[i] || y[i] !== hy[i] || moved) keep.push(i); else isActive[i] = 0;
    }
    active = keep;
    if (d1x >= d0x) renderRect(d0x - rMax, d0y - rMax, d1x + rMax, d1y + rMax);
    return busy;
  }

  // ── drawing into the cached frame buffer ──
  // one antialiased dot; c carries its own alpha; writes are clipped to the device rect [X0,X1)×[Y0,Y1)
  function dot(i, cx, cy, c, X0, Y0, X1, Y1) {
    var P = cx * dpr, Q = cy * dpr, ix = Math.floor(P), iy = Math.floor(Q), sp = spr[lv[i]][(((Q - iy) * 4) | 0) * 4 + (((P - ix) * 4) | 0)];
    var ca = c >>> 24, r0 = c & 255, g0 = c >> 8 & 255, b0 = c >> 16 & 255, rgb = c & 0xFFFFFF, dxs = sp.dx, dys = sp.dy, cov = sp.c;
    for (var m = 0; m < sp.L; m++) {
      var X = ix + dxs[m], Y = iy + dys[m];
      if (X < X0 || X >= X1 || Y < Y0 || Y >= Y1) continue;
      var t = Y * W + X, a = (cov[m] * ca + 127) / 255 | 0, dst = buf32[t], da = dst >>> 24;
      if (a >= 254 || !da) buf32[t] = (rgb | a << 24) >>> 0;
      else { var f = a / 255, g = 1 - f; buf32[t] = ((da > a ? da : a) << 24 | ((dst >> 16 & 255) * g + b0 * f) << 16 | ((dst >> 8 & 255) * g + g0 * f) << 8 | ((dst & 255) * g + r0 * f)) >>> 0; }
    }
  }
  function renderAll() { buf32.fill(0); for (var i = 0; i < n; i++) dot(i, x[i], y[i], col[i], 0, 0, W, H); ctx.putImageData(img, 0, 0); }
  function renderRect(x0, y0, x1, y1) {                                                  // css rect -> clear, redraw the particles that can reach it, upload just that region
    var X0 = Math.max(0, Math.floor(x0 * dpr)), Y0 = Math.max(0, Math.floor(y0 * dpr)), X1 = Math.min(W, Math.ceil(x1 * dpr)), Y1 = Math.min(H, Math.ceil(y1 * dpr));
    if (X1 <= X0 || Y1 <= Y0) return;
    for (var Y = Y0; Y < Y1; Y++) buf32.fill(0, Y * W + X0, Y * W + X1);
    var reach = A + rMax, list = [];
    each(X0 / dpr - reach, Y0 / dpr - reach, X1 / dpr + reach, Y1 / dpr + reach, function (i) { list.push(i); });
    list = Uint32Array.from(list).sort();                                                // same draw order as renderAll: overlaps blend identically, no seams
    for (var m = 0; m < list.length; m++) { var i = list[m]; dot(i, x[i], y[i], col[i], X0, Y0, X1, Y1); }
    ctx.putImageData(img, 0, 0, X0, Y0, X1 - X0, Y1 - Y0);
  }
  function drawAssembly(t) {
    buf32.fill(0);
    for (var i = 0; i < n; i++) {
      var p = (t - del[i]) / dur[i];
      if (p <= 0) continue;
      if (p > 1) p = 1;
      var q = 1 - p, back = q * q * q * q, c = col[i], k = q * q * 0.85, a = p < 0.34 ? (p * 750) | 0 : 255; // ease-out quart, straight path; accent tint while in flight
      if (k > 0) { var r0 = c & 255, g0 = c >> 8 & 255, b0 = c >> 16 & 255; c = ((b0 + (AB - b0) * k) << 16 | (g0 + (AG - g0) * k) << 8 | (r0 + (AR - r0) * k)) >>> 0; }
      dot(i, hx[i] + sx[i] * back, hy[i] + sy[i] * back, (c & 0xFFFFFF | a << 24) >>> 0, 0, 0, W, H);
    }
    ctx.putImageData(img, 0, 0);
  }

  // ── pointer (mouse/pen only) ──
  function onMove(e) {
    if (e.pointerType === 'touch' || !visible || state === 'loading' || state === 'assembling') return;
    if (!e.movementX && !e.movementY) return;                                            // synthetic move: the page scrolled under a parked cursor
    var r = box.getBoundingClientRect(); ptr.x = e.clientX - r.left; ptr.y = e.clientY - r.top; ptr.on = true;
    state = 'interacting'; schedule();
  }
  function release() {
    if (!ptr.on) return;
    ptr.on = false;
    if (state === 'still' || state === 'settled' || state === 'interacting') { state = 'interacting'; schedule(); }
  }
})();
