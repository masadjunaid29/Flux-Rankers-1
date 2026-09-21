/* =========================================================
   FLUX RANKERS – Dark "Orbit" theme scripts  (performance build)
   Same features as before. Changes are all under the hood:
   - one requestAnimationFrame pipeline for scroll + pointer work
   - layout reads are cached / batched (no layout thrashing)
   - particle canvas is adaptive (fewer particles / 30fps on phones,
     and it lowers its own quality if the device struggles)
   - animations in off-screen sections are paused
   ========================================================= */
(() => {
  'use strict';

  const $  = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));
  const root = document.documentElement;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer  = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const lite   = !finePointer || innerWidth < 760;            // phones / tablets: lighter effects
  const clamp  = (n, a, b) => Math.min(Math.max(n, a), b);
  const smooth = reduceMotion ? 'auto' : 'smooth';
  const hasIO  = 'IntersectionObserver' in window;
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

  /* ---------- toast + footer year ---------- */
  const toast = $('#toast');
  let toastTimer;
  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 3800);
  }
  const yearEl = $('#year'); if (yearEl) yearEl.textContent = new Date().getFullYear();

  /* ---------- optional UI sounds (off by default) ---------- */
  let audioCtx = null, soundOn = false, lastBlip = 0;
  function blip(freq = 560, dur = 0.07, vol = 0.04) {
    if (!soundOn || !audioCtx) return;
    const t = audioCtx.currentTime, o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(freq, t); o.frequency.exponentialRampToValueAtTime(freq * 1.5, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(audioCtx.destination); o.start(t); o.stop(t + dur);
  }
  const soundBtn = $('#soundBtn');
  soundBtn.addEventListener('click', () => {
    soundOn = !soundOn;
    soundBtn.setAttribute('aria-pressed', String(soundOn));
    if (soundOn) {
      try { audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { soundOn = false; }
      blip(520, .09); setTimeout(() => blip(780, .12), 90);
      showToast('Interface sounds on');
    } else showToast('Interface sounds off');
  });
  document.addEventListener('mouseover', e => {
    if (!soundOn || !finePointer) return;
    const t = e.target.closest('.btn, .nav a, .service-card, .step, .circle-btn, .faq-q');
    if (!t || t.contains(e.relatedTarget)) return;
    const now = performance.now(); if (now - lastBlip < 90) return; lastBlip = now;
    blip(420 + Math.random() * 160, .05, .025);
  });
  document.addEventListener('click', e => { if (soundOn && e.target.closest('.btn, button, .circle-btn')) blip(700, .09, .05); });

  /* ---------- announcement, mobile menu, dropdown ---------- */
  $('#announceClose').addEventListener('click', () => { $('#announce').classList.add('hide'); calcScroll(); });
  const nav = $('#primaryNav'), navToggle = $('#navToggle');
  function setNav(open) {
    nav.classList.toggle('open', open);
    navToggle.setAttribute('aria-expanded', String(open));
    navToggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    navToggle.querySelector('use').setAttribute('href', open ? '#i-close' : '#i-menu');
  }
  navToggle.addEventListener('click', () => setNav(!nav.classList.contains('open')));
  $$('a', nav).forEach(a => a.addEventListener('click', () => setNav(false)));
  const hasSub = $('.has-sub'), subToggle = $('.sub-toggle', hasSub);
  const setSub = o => { hasSub.classList.toggle('open', o); subToggle.setAttribute('aria-expanded', String(o)); };
  subToggle.addEventListener('click', e => { e.stopPropagation(); setSub(!hasSub.classList.contains('open')); });
  document.addEventListener('click', e => { if (!hasSub.contains(e.target)) setSub(false); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { setSub(false); setNav(false); } });

  /* =========================================================
     SCROLL PIPELINE  (one rAF per frame, reads first, writes after)
     ========================================================= */
  const header = $('#siteHeader'), progress = $('#progress'), toTop = $('#toTop');
  toTop.addEventListener('click', () => scrollTo({ top: 0, behavior: smooth }));
  let maxScroll = 0, stuck = false, topShown = false, lastRatio = -1;
  function calcScroll() { maxScroll = Math.max(root.scrollHeight - innerHeight, 0); }
  addEventListener('load', calcScroll);
  addEventListener('resize', calcScroll);
  if ('ResizeObserver' in window) new ResizeObserver(calcScroll).observe(document.body);
  calcScroll();

  const pending = new Set();                 // reveal targets that have not appeared yet
  let sweepPassed = () => {};
  const scrollTexts = [], parallax = [];
  let scheduled = false, lastSweep = 0;

  function scrollFrame() {
    scheduled = false;
    const y = scrollY, vh = innerHeight;

    // ---- reads ----
    const ptx = scrollTexts.map(st => st.el.getBoundingClientRect());
    const wide = innerWidth >= 900;
    const prx = wide ? parallax.map(p => p.host.getBoundingClientRect()) : null;

    // ---- writes ----
    const ratio = maxScroll > 0 ? clamp(y / maxScroll, 0, 1) : 0;
    if (Math.abs(ratio - lastRatio) > 0.0005) { progress.style.transform = 'scaleX(' + ratio.toFixed(4) + ')'; lastRatio = ratio; }
    const s = y > 10;   if (s !== stuck)    { stuck = s;    header.classList.toggle('is-stuck', s); }
    const t = y > 700;  if (t !== topShown) { topShown = t; toTop.classList.toggle('show', t); }

    scrollTexts.forEach((st, i) => {
      const r = ptx[i], start = vh * .9, end = vh * .5;
      const prog = clamp((start - r.top) / (start - end + r.height), 0, 1);
      const n = Math.round(prog * st.words.length);
      if (n === st.lit) return;
      if (n > st.lit) for (let k = Math.max(st.lit, 0); k < n; k++) st.words[k].classList.add('on');
      else for (let k = n; k < st.lit; k++) st.words[k].classList.remove('on');
      st.lit = n;
    });

    if (prx) parallax.forEach((p, i) => {
      const r = prx[i];
      if (r.bottom < -200 || r.top > vh + 200) return;
      p.el.style.translate = '0 ' + ((r.top + r.height / 2 - vh / 2) * p.speed).toFixed(1) + 'px';
    });
    else parallax.forEach(p => { if (p.el.style.translate) p.el.style.translate = ''; });

    const now = performance.now();
    if (pending.size && now - lastSweep > 180) { lastSweep = now; sweepPassed(); }
  }
  function onScrollFx() { if (!scheduled) { scheduled = true; requestAnimationFrame(scrollFrame); } }
  addEventListener('scroll', onScrollFx, { passive: true });
  addEventListener('resize', onScrollFx);

  /* ---------- pause animations in sections that are off-screen ---------- */
  if (hasIO) {
    const io = new IntersectionObserver(es => es.forEach(e => e.target.classList.toggle('is-off', !e.isIntersecting)), { rootMargin: '150px 0px' });
    $$('main > section, footer').forEach(el => io.observe(el));
    if (!lite) {                                          // shimmering gradient headings only animate while visible
      const hio = new IntersectionObserver(es => es.forEach(e => e.target.classList.toggle('live', e.isIntersecting)), { threshold: .1 });
      $$('h2').forEach(el => hio.observe(el));
    }
  }

  /* ---------- scroll spy ---------- */
  const spyLinks = $$('.nav > ul > li > a[href^="#"]');
  const spyMap = new Map();
  spyLinks.forEach(a => { const t = $(a.getAttribute('href')); if (t) spyMap.set(t, a); });
  if (hasIO) {
    const spy = new IntersectionObserver(entries => entries.forEach(en => {
      if (!en.isIntersecting) return;
      spyLinks.forEach(l => l.classList.remove('is-active'));
      const l = spyMap.get(en.target); if (l) l.classList.add('is-active');
    }), { rootMargin: '-45% 0px -50% 0px' });
    spyMap.forEach((_, s) => spy.observe(s));
  }

  /* ---------- typing placeholder in the hero domain box ---------- */
  const heroInput = $('#heroSite');
  if (heroInput && !reduceMotion) {
    const phrases = ['brand.com', 'yourstore.co', 'localbusiness.net', 'startup.io'];
    const prefix = 'Enter your website domain (e.g. ';
    let pi = 0, ci = 0, del = false, heroVisible = true;
    if (hasIO) new IntersectionObserver(es => heroVisible = es[0].isIntersecting).observe($('.hero'));
    (function tick() {
      if (heroVisible && !document.hidden && document.activeElement !== heroInput && !heroInput.value) {
        const word = phrases[pi];
        ci += del ? -1 : 1;
        heroInput.placeholder = prefix + word.slice(0, ci) + (ci === word.length || ci === 0 ? '' : '|') + ')';
        if (!del && ci === word.length) { del = true; return setTimeout(tick, 1400); }
        if (del && ci === 0) { del = false; pi = (pi + 1) % phrases.length; }
      }
      setTimeout(tick, del ? 60 : 110);
    })();
  }

  /* ---------- count-up numbers ---------- */
  const counters = $$('[data-count]');
  const fmt = (el, v) => { el.textContent = v.toFixed(Number(el.dataset.decimals || 0)) + (el.dataset.suffix || ''); };
  if (!reduceMotion) counters.forEach(c => fmt(c, 0));
  function runCounter(el) {
    const target = Number(el.dataset.count);
    if (reduceMotion) return fmt(el, target);
    const t0 = performance.now(), dur = 1700;
    (function step(now) {
      const t = Math.min((now - t0) / dur, 1);
      fmt(el, target * (1 - Math.pow(1 - t, 3)));
      if (t < 1) requestAnimationFrame(step);
    })(t0);
  }
  function startCounters() {
    if (!hasIO) return counters.forEach(c => fmt(c, Number(c.dataset.count)));
    const io = new IntersectionObserver((es, o) => es.forEach(en => { if (en.isIntersecting) { runCounter(en.target); o.unobserve(en.target); } }), { threshold: .6 });
    counters.forEach(c => io.observe(c));
  }

  /* ---------- carousels (+ autoplay and dots) ---------- */
  $$('[data-carousel]').forEach(car => {
    const track = $('.track', car), prev = $('.prev', car), next = $('.next', car), dotsBox = $('.carousel-dots', car);
    let stepPx = 0, dots = [];
    const measure = () => {
      const gap = parseFloat(getComputedStyle(track).columnGap) || 24;
      stepPx = track.children[0].getBoundingClientRect().width + gap;
    };
    const buildDots = () => {
      if (!dotsBox) return;
      const per = Math.max(1, Math.round(track.clientWidth / stepPx));
      const n = Math.max(1, track.children.length - per + 1);
      if (dots.length === n) return;
      dotsBox.innerHTML = '<i></i>'.repeat(n); dots = $$('i', dotsBox);
    };
    let activeIdx = -1, atStart = null, atEnd = null;
    const update = () => {
      const sl = track.scrollLeft;
      const s = sl <= 4, e = sl >= track.scrollWidth - track.clientWidth - 4;
      if (s !== atStart) { atStart = s; prev.disabled = s; }
      if (e !== atEnd)   { atEnd = e;   next.disabled = e; }
      const idx = Math.round(sl / stepPx);
      if (idx !== activeIdx) { activeIdx = idx; dots.forEach((d, i) => d.classList.toggle('on', i === idx)); }
    };
    const relayout = () => { measure(); buildDots(); activeIdx = -1; update(); };
    prev.addEventListener('click', () => track.scrollBy({ left: -stepPx, behavior: smooth }));
    next.addEventListener('click', () => track.scrollBy({ left: stepPx, behavior: smooth }));
    track.addEventListener('scroll', update, { passive: true });
    addEventListener('resize', relayout);
    track.addEventListener('keydown', e => {
      if (e.key === 'ArrowRight') { e.preventDefault(); next.click(); }
      if (e.key === 'ArrowLeft')  { e.preventDefault(); prev.click(); }
    });
    relayout();

    const delay = Number(car.dataset.autoplay || 0);
    if (delay && !reduceMotion && hasIO) {
      let hover = false, visible = false;
      car.addEventListener('pointerenter', () => hover = true);
      car.addEventListener('pointerleave', () => hover = false);
      car.addEventListener('focusin', () => hover = true);
      car.addEventListener('focusout', () => hover = false);
      new IntersectionObserver(es => visible = es[0].isIntersecting, { threshold: .4 }).observe(car);
      setInterval(() => {
        if (hover || !visible || document.hidden) return;
        if (track.scrollLeft >= track.scrollWidth - track.clientWidth - 4) track.scrollTo({ left: 0, behavior: smooth });
        else next.click();
      }, delay);
    }
  });

  /* ---------- FAQ accordion ---------- */
  $$('.faq-q').forEach(btn => btn.addEventListener('click', () => {
    const open = btn.getAttribute('aria-expanded') === 'true';
    $$('.faq-q').forEach(b => {
      b.setAttribute('aria-expanded', 'false');
      document.getElementById(b.getAttribute('aria-controls')).classList.remove('open');
    });
    if (!open) {
      btn.setAttribute('aria-expanded', 'true');
      document.getElementById(btn.getAttribute('aria-controls')).classList.add('open');
    }
  }));
  const firstQ = $('.faq-q'); if (firstQ) firstQ.click();

  /* ---------- chat widget ---------- */
  const chat = $('#chat'), chatOpen = $('#chatOpen');
  function setChat(o) {
    chat.classList.toggle('open', o);
    chatOpen.setAttribute('aria-expanded', String(o));
    chatOpen.style.display = o ? 'none' : '';
    if (o) $('#chatClose').focus(); else chatOpen.focus({ preventScroll: true });
  }
  chatOpen.addEventListener('click', () => setChat(true));
  $('#chatClose').addEventListener('click', () => setChat(false));
  $$('.chat-body a').forEach(a => a.addEventListener('click', () => setChat(false)));

  /* ---------- proposal forms ---------- */
  function handleProposal(form) {
    form.addEventListener('submit', e => {
      e.preventDefault();
      const input = $('input', form);
      if (!input.value.trim()) { input.focus(); showToast('Please enter your website domain first.'); return; }
      showToast('Scanning ' + input.value.trim() + ' … tell us a little more and we will send your report.');
      input.value = '';
      $('#contact').scrollIntoView({ behavior: smooth });
    });
  }
  handleProposal($('#proposalForm'));
  $$('[data-proposal]').forEach(handleProposal);

  /* ---------- contact form (demo: nothing is sent) ---------- */
  const form = $('#contactForm'), status = $('#formStatus'), submitBtn = $('#submitBtn');
  form.addEventListener('submit', e => {
    e.preventDefault();
    status.classList.remove('show');
    if (!form.checkValidity()) { form.reportValidity(); return; }
    /* ---- GO LIVE: send the data to your backend / form service here ----
       e.g. fetch('https://your-endpoint', { method: 'POST', body: new FormData(form) })   */
    submitBtn.classList.add('loading'); submitBtn.disabled = true;
    setTimeout(() => {
      submitBtn.classList.remove('loading'); submitBtn.disabled = false;
      form.reset(); status.classList.add('show');
      status.scrollIntoView({ block: 'nearest', behavior: smooth });
    }, reduceMotion ? 0 : 1100);
  });

  /* =========================================================
     AMBIENT EFFECTS
     ========================================================= */
  const mouse = { x: -9999, y: -9999 };

  /* ---------- interactive particle network (adaptive) ---------- */
  let particlesOn = false;
  function startParticles() {
    const c = $('#bgCanvas');
    if (!c || reduceMotion || particlesOn) return;
    particlesOn = true;
    const ctx = c.getContext('2d');
    const dpr = lite ? 1 : Math.min(devicePixelRatio || 1, 1.5);
    const interval = lite ? 1000 / 30 : 1000 / 60;
    let w = 0, h = 0, pts = [], link = lite ? 110 : 135, mouseR = 175, last = 0, slow = 0;
    const buckets = [[], [], []];
    const alphas = [.10, .20, .32];

    function build() {
      w = innerWidth; h = innerHeight;
      c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = clamp(Math.round(w * h / (lite ? 26000 : 20000)), lite ? 16 : 26, lite ? 32 : 64);
      pts = Array.from({ length: n }, () => ({
        x: Math.random() * w, y: Math.random() * h,
        vx: (Math.random() - .5) * .35, vy: (Math.random() - .5) * .35,
        r: Math.random() * 1.6 + .7, c: Math.random() < .35 ? '34,211,238' : '167,139,250'
      }));
    }
    build();
    let lastW = innerWidth, lastH = innerHeight, rt;
    addEventListener('resize', () => {              // ignore the mobile URL-bar resize (height-only changes)
      clearTimeout(rt);
      rt = setTimeout(() => {
        if (innerWidth !== lastW || Math.abs(innerHeight - lastH) > 160) { lastW = innerWidth; lastH = innerHeight; build(); }
      }, 200);
    });

    function frame(t) {
      requestAnimationFrame(frame);
      if (document.hidden) return;
      const dt = t - last;
      if (dt < interval - 2) return;
      last = t;

      // adaptive quality: if frames keep taking too long, thin the network out
      if (dt > interval * 1.9) { if (++slow > 30 && pts.length > 12) { pts.length = Math.round(pts.length * .75); link *= .9; slow = 0; } }
      else if (slow > 0) slow--;

      ctx.clearRect(0, 0, w, h);
      buckets[0].length = buckets[1].length = buckets[2].length = 0;
      const L2 = link * link, M2 = mouseR * mouseR, mx = mouse.x, my = mouse.y, useMouse = !lite && mx > -999;
      const md = [];
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        p.x += p.vx; p.y += p.vy;
        if (p.x < -10) p.x = w + 10; else if (p.x > w + 10) p.x = -10;
        if (p.y < -10) p.y = h + 10; else if (p.y > h + 10) p.y = -10;
        if (useMouse) {
          const dx = p.x - mx, dy = p.y - my, d2 = dx * dx + dy * dy;
          if (d2 < M2) { const d = Math.sqrt(d2) || 1; p.x += dx / d * .5; p.y += dy / d * .5; md.push(p, d); }
        }
        for (let j = i + 1; j < pts.length; j++) {
          const q = pts[j], ex = p.x - q.x, ey = p.y - q.y, e2 = ex * ex + ey * ey;
          if (e2 < L2) buckets[Math.min(2, ((1 - e2 / L2) * 3.2) | 0)].push(p.x, p.y, q.x, q.y);
        }
      }
      // links: one path per alpha bucket instead of one per line
      ctx.lineWidth = 1;
      for (let b = 0; b < 3; b++) {
        const seg = buckets[b]; if (!seg.length) continue;
        ctx.strokeStyle = 'rgba(139,92,246,' + alphas[b] + ')';
        ctx.beginPath();
        for (let k = 0; k < seg.length; k += 4) { ctx.moveTo(seg[k], seg[k + 1]); ctx.lineTo(seg[k + 2], seg[k + 3]); }
        ctx.stroke();
      }
      // dots (grouped by colour)
      ctx.fillStyle = 'rgba(167,139,250,.75)'; ctx.beginPath();
      for (const p of pts) if (p.c[0] === '1') { ctx.moveTo(p.x + p.r, p.y); ctx.arc(p.x, p.y, p.r, 0, 6.283); }
      ctx.fill();
      ctx.fillStyle = 'rgba(34,211,238,.75)'; ctx.beginPath();
      for (const p of pts) if (p.c[0] === '3') { ctx.moveTo(p.x + p.r, p.y); ctx.arc(p.x, p.y, p.r, 0, 6.283); }
      ctx.fill();
      // links from the cursor
      if (md.length) {
        ctx.beginPath(); ctx.strokeStyle = 'rgba(34,211,238,.35)';
        for (let k = 0; k < md.length; k += 2) { ctx.moveTo(md[k].x, md[k].y); ctx.lineTo(mx, my); }
        ctx.stroke();
      }
    }
    requestAnimationFrame(frame);
  }

  /* ---------- soft glow that follows the cursor (only runs while it is moving) ---------- */
  const glowEl = $('#cursorGlow');
  const useGlow = !!glowEl && finePointer && !reduceMotion;
  let gx = 0, gy = 0, gtx = 0, gty = 0, glowRun = false, glowOn = false;
  function glowLoop() {
    gx += (gtx - gx) * .14; gy += (gty - gy) * .14;
    glowEl.style.transform = 'translate3d(' + gx.toFixed(1) + 'px,' + gy.toFixed(1) + 'px,0)';
    if (Math.abs(gtx - gx) > .4 || Math.abs(gty - gy) > .4) requestAnimationFrame(glowLoop); else glowRun = false;
  }

  /* ---------- pointer pipeline: spotlight + tilt + glow + particle mouse ---------- */
  const tiltTargets = [['.dash', 7, 0], ['.service-card', 5, 10], ['.review', 4, 8], ['.post', 4, 8], ['.mv', 3, 6], ['.step', 4, 10]];
  if (finePointer && !reduceMotion) tiltTargets.forEach(([sel, max, lift]) => $$(sel).forEach(el => { el.dataset.tilt = max + ',' + lift; }));
  let pe = null, pTick = false, activeTilt = null;
  function resetTilt(el) { el.style.transition = ''; el.style.transform = ''; }
  function pointerFrame() {
    pTick = false; if (!pe) return;
    const e = pe, t = e.target;
    if (useGlow) {
      gtx = e.clientX; gty = e.clientY;
      if (!glowOn) { glowOn = true; gx = gtx; gy = gty; glowEl.classList.add('on'); }
      if (!glowRun) { glowRun = true; requestAnimationFrame(glowLoop); }
    }
    if (!t.closest) return;
    const spot = t.closest('.spot');
    if (spot) {
      const r = spot.getBoundingClientRect();
      spot.style.setProperty('--mx', (e.clientX - r.left).toFixed(0) + 'px');
      spot.style.setProperty('--my', (e.clientY - r.top).toFixed(0) + 'px');
    }
    if (finePointer && !reduceMotion) {
      const el = t.closest('[data-tilt]');
      if (el !== activeTilt) {
        if (activeTilt) resetTilt(activeTilt);
        activeTilt = el;
        if (el) el.style.transition = 'transform .12s ease-out, box-shadow .4s, border-color .3s';
      }
      if (el) {
        const [max, lift] = el.dataset.tilt.split(',').map(Number);
        const r = el.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - .5, py = (e.clientY - r.top) / r.height - .5;
        el.style.transform = 'perspective(900px) rotateX(' + (-py * max * 2).toFixed(2) + 'deg) rotateY(' + (px * max * 2).toFixed(2) + 'deg) translateY(-' + lift + 'px)';
      }
    }
  }
  addEventListener('pointermove', e => {
    mouse.x = e.clientX; mouse.y = e.clientY; pe = e;
    if (!pTick) { pTick = true; requestAnimationFrame(pointerFrame); }
  }, { passive: true });
  root.addEventListener('mouseleave', () => {
    mouse.x = mouse.y = -9999; pe = null;
    if (activeTilt) { resetTilt(activeTilt); activeTilt = null; }
    if (glowEl) { glowOn = false; glowEl.classList.remove('on'); }
  });

  /* ---------- magnetic buttons ---------- */
  if (finePointer && !reduceMotion) {
    $$('[data-magnetic]').forEach(el => {
      let busy = false, ev = null;
      el.addEventListener('pointermove', e => {
        ev = e;
        if (busy) return; busy = true;
        requestAnimationFrame(() => {
          busy = false;
          const r = el.getBoundingClientRect();
          el.style.translate = ((ev.clientX - r.left - r.width / 2) * .22).toFixed(1) + 'px ' + ((ev.clientY - r.top - r.height / 2) * .35).toFixed(1) + 'px';
        });
      });
      el.addEventListener('pointerleave', () => { el.style.translate = ''; });
    });
  }

  /* =========================================================
     SCROLL EFFECTS
     ========================================================= */

  /* ---------- headings: words slide up from a mask ---------- */
  const splitSel = ['.section-head h2', '.about-copy h2', '.why-copy h2', '.faq-copy h2', '.contact-copy h2', '.process-top h2', '.cta-band h2'];
  function splitWords(el) {
    el.setAttribute('aria-label', el.textContent.replace(/\s+/g, ' ').trim());
    let i = 0;
    (function walk(node, cls) {
      Array.from(node.childNodes).forEach(ch => {
        if (ch.nodeType === 3) {
          const frag = document.createDocumentFragment();
          ch.textContent.split(/(\s+)/).forEach(part => {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(' ')); return; }
            const outer = document.createElement('span'); outer.className = 'hw'; outer.setAttribute('aria-hidden', 'true');
            const inner = document.createElement('span'); inner.textContent = part; inner.style.setProperty('--wi', i++);
            if (cls) inner.className = cls;
            outer.appendChild(inner); frag.appendChild(outer);
          });
          node.replaceChild(frag, ch);
        } else if (ch.nodeType === 1) {
          const g = ch.classList.contains('grad-text');
          if (g) ch.classList.remove('grad-text');
          walk(ch, g ? 'grad-text' : cls);
        }
      });
    })(el, '');
  }
  if (!reduceMotion) splitSel.forEach(s => $$(s).forEach(splitWords));

  /* ---------- paragraphs: words light up while you scroll (desktop only) ---------- */
  if (!reduceMotion && !lite && innerWidth >= 980) {
    $$('.about-copy > p, .why-copy > p, .faq-copy > p').forEach(p => {
      p.innerHTML = p.textContent.trim().split(/\s+/).map(w => '<span class="w">' + w + '</span>').join(' ');
      p.classList.add('scroll-text');
      scrollTexts.push({ el: p, words: $$('.w', p), lit: 0 });
    });
  }

  /* ---------- parallax on floating shapes (desktop only) ---------- */
  if (!reduceMotion && !lite) {
    [['.chip-top', -.10], ['.chip-bottom', .10], ['.arch-a', -.05], ['.arch-b', .07], ['.faq-aside', -.04]]
      .forEach(([sel, speed]) => { const el = $(sel); if (el) parallax.push({ el, host: el.parentElement, speed }); });
  }

  /* ---------- reveal on scroll ---------- */
  // [selector, animation, stagger ms for siblings entering together]
  const revealGroups = [
    ['.hero-copy > :not(h1)', 'up', 110],
    ['.hero-visual', 'zoom', 0],
    ['.results-inner', 'up', 0],
    ['.platforms-inner > div:first-child', 'up', 0],
    ['.wordmarks span', 'up', 90],
    ['.section-head .tag', 'up', 0],
    ['.section-head > p', 'up', 0],
    ['.process-top .tag', 'up', 0],
    ['.process-top #proposal', 'up', 0],
    ['.arch-a', 'left', 0],
    ['.arch-b', 'right', 0],
    ['.about-copy > :not(h2)', 'up', 90],
    ['.step', 'up', 120],
    ['.why-copy > :not(h2)', 'up', 110],
    ['.mv', 'right', 150],
    ['.post', 'up', 130],
    ['.faq-copy > :not(.faq-list):not(h2)', 'up', 90],
    ['.faq-item', 'up', 80],
    ['.faq-aside', 'zoom', 0],
    ['.cta-band > :not(h2)', 'up', 110],
    ['.contact-copy > :not(h2)', 'up', 70],
    ['.form-card', 'right', 0],
    ['.info-card', 'left', 100],
    ['.map-box', 'zoom', 0],
    ['.footer-grid > *', 'up', 110]
  ];
  const revealEls = [];
  if (!reduceMotion && hasIO) {
    revealGroups.forEach(([sel, type, stepMs]) => $$(sel).forEach(el => { el.dataset.reveal = type; el.dataset.step = stepMs; revealEls.push(el); }));
    splitSel.forEach(s => $$(s).forEach(el => { el.dataset.reveal = 'split'; revealEls.push(el); }));
  }
  const tracks = $$('.track');
  if (!reduceMotion && hasIO) tracks.forEach(t => Array.from(t.children).forEach(c => { c.dataset.reveal = 'up'; }));

  function startReveal() {
    if (!hasIO) return;
    const inviewEls = $$('[data-inview]');
    if (reduceMotion) { inviewEls.forEach(e => e.classList.add('inview')); return; }
    const ivIO = new IntersectionObserver((es, o) => es.forEach(en => {
      if (en.isIntersecting) { en.target.classList.add('inview'); o.unobserve(en.target); }
    }), { threshold: .3 });
    inviewEls.forEach(el => ivIO.observe(el));

    const instant = el => {          // element was scrolled past too fast: show it without animating
      pending.delete(el);
      if (el.dataset.reveal === 'split') { el.classList.add('split-in'); return; }
      el.removeAttribute('data-reveal'); el.removeAttribute('data-step'); el.classList.remove('in'); el.style.removeProperty('--d');
    };
    sweepPassed = () => {
      const list = []; pending.forEach(el => list.push(el));
      const rects = list.map(el => el.getBoundingClientRect());          // batch the reads
      list.forEach((el, i) => { if (rects[i].bottom < 0 && rects[i].height > 0) instant(el); });
      inviewEls.forEach(el => { if (!el.classList.contains('inview') && el.getBoundingClientRect().bottom < 0) el.classList.add('inview'); });
    };
    const finish = (el, d) => {
      pending.delete(el);
      el.style.setProperty('--d', d + 'ms');
      requestAnimationFrame(() => el.classList.add('in'));
      setTimeout(() => { el.removeAttribute('data-reveal'); el.removeAttribute('data-step'); el.classList.remove('in'); el.style.removeProperty('--d'); }, d + 1200);
    };
    const io = new IntersectionObserver(entries => {
      const vis = entries.filter(e => e.isIntersecting).sort((a, b) =>
        (a.boundingClientRect.top - b.boundingClientRect.top) || (a.boundingClientRect.left - b.boundingClientRect.left));
      let i = 0;
      vis.forEach(en => {
        const el = en.target; io.unobserve(el);
        if (el.dataset.reveal === 'split') { pending.delete(el); el.classList.add('split-in'); return; }
        finish(el, Math.min(i++ * Number(el.dataset.step || 0), 600));
      });
    }, { threshold: .12, rootMargin: '0px 0px -4% 0px' });
    revealEls.forEach(el => { pending.add(el); io.observe(el); });

    // carousels: reveal every card together so nothing stays hidden behind the arrows
    const tio = new IntersectionObserver(es => es.filter(e => e.isIntersecting).forEach(en => {
      tio.unobserve(en.target);
      Array.from(en.target.children).forEach((card, i) => finish(card, Math.min(i * 120, 600)));
    }), { threshold: .2 });
    tracks.forEach(t => Array.from(t.children).forEach(c => pending.add(c)));
    tracks.forEach(t => tio.observe(t));
  }

  /* =========================================================
     SPLASH SCREEN
     ========================================================= */
  const splash = $('#splash');
  let started = false;
  function startPage() {
    if (started) return; started = true;
    root.classList.add('ready');                       // hero headline, meter bar etc. start animating
    requestAnimationFrame(() => {                      // spread start-up work over a few frames
      startCounters();
      requestAnimationFrame(() => { startReveal(); onScrollFx(); });
    });
  }
  function finishSplash() {
    if (!splash || splash.classList.contains('leave')) return;
    splash.classList.add('leave');
    setTimeout(startPage, 450);
    setTimeout(startParticles, 700);                   // particles start after the splash has slid away
    setTimeout(() => { splash.remove(); document.body.classList.remove('splash-on'); calcScroll(); }, 1150);
  }
  if (splash && !reduceMotion) {
    document.body.classList.add('splash-on');
    scrollTo(0, 0);
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const loaded = new Promise(r => document.readyState === 'complete' ? r() : addEventListener('load', r, { once: true }));
    Promise.race([Promise.all([wait(3000), loaded]), wait(6000)]).then(finishSplash);
    splash.addEventListener('click', finishSplash);
  } else {
    if (splash) splash.remove();
    startPage();
    startParticles();
  }
})();
