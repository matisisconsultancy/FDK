/* ============================================================
   RAICHEM · BRAND BOOK — Interazioni
   ============================================================ */
(function () {
  'use strict';

  /* ---------- Reading progress bar ---------- */
  var progress = document.getElementById('readProgress');
  function updateProgress() {
    var h = document.documentElement;
    var scrolled = h.scrollTop;
    var max = h.scrollHeight - h.clientHeight;
    progress.style.width = (max > 0 ? (scrolled / max) * 100 : 0) + '%';
  }
  window.addEventListener('scroll', updateProgress, { passive: true });
  updateProgress();

  /* ---------- Mobile nav toggle ---------- */
  var navToggle = document.getElementById('navToggle');
  var sidenav = document.getElementById('sidenav');
  navToggle.addEventListener('click', function () {
    sidenav.classList.toggle('open');
    navToggle.classList.toggle('open');
  });
  // close on link click (mobile)
  sidenav.querySelectorAll('a').forEach(function (a) {
    a.addEventListener('click', function () {
      if (window.innerWidth <= 920) {
        sidenav.classList.remove('open');
        navToggle.classList.remove('open');
      }
    });
  });

  /* ---------- Scroll-spy ---------- */
  var navLinks = Array.prototype.slice.call(
    sidenav.querySelectorAll('.sidenav-list a')
  );
  var sections = navLinks
    .map(function (a) {
      return document.querySelector(a.getAttribute('href'));
    })
    .filter(Boolean);

  var spy = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          var id = entry.target.id;
          navLinks.forEach(function (a) {
            a.classList.toggle(
              'active',
              a.getAttribute('href') === '#' + id
            );
          });
        }
      });
    },
    { rootMargin: '-45% 0px -50% 0px', threshold: 0 }
  );
  sections.forEach(function (s) { spy.observe(s); });

  /* ---------- Reveal on scroll ---------- */
  var revealTargets = document.querySelectorAll(
    '.chapter .wrap > *, .band .wrap > *, .index-card, .trio-card, .value,' +
    '.pillar, .voice-card, .claim, .swatch, .type-card, .gs, .channel,' +
    '.mockup, .gov, .level, .flow-step, .example, .check-group'
  );
  revealTargets.forEach(function (el) { el.classList.add('reveal'); });

  var revealObs = new IntersectionObserver(
    function (entries, obs) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('in');
          obs.unobserve(entry.target);
        }
      });
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.05 }
  );
  revealTargets.forEach(function (el) { revealObs.observe(el); });

  /* ---------- Copy color to clipboard ---------- */
  var toast = document.getElementById('toast');
  var toastTimer;
  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toast.classList.remove('show');
    }, 1600);
  }
  function legacyCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(ta);
  }
  function copyText(text) {
    // Prefer the async Clipboard API (https), fall back to execCommand
    // for file:// or non-secure contexts so copy never fails silently.
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).catch(function () {
        legacyCopy(text);
      });
    } else {
      legacyCopy(text);
    }
  }
  document.querySelectorAll('.swatch').forEach(function (sw) {
    sw.addEventListener('click', function () {
      var hex = sw.getAttribute('data-hex');
      copyText(hex);
      showToast(hex + ' copiato');
    });
  });

  /* ---------- Checklist with persistence ---------- */
  var STORAGE_KEY = 'raichem-checklist-v1';
  var checks = Array.prototype.slice.call(
    document.querySelectorAll('.checklist input[type="checkbox"]')
  );
  var countEl = document.getElementById('checkCount');
  var ring = document.querySelector('.progress-ring');
  var resetBtn = document.getElementById('resetCheck');

  function loadState() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      var saved = JSON.parse(raw);
      checks.forEach(function (c, i) { c.checked = !!saved[i]; });
    } catch (e) {}
  }
  function saveState() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(checks.map(function (c) { return c.checked ? 1 : 0; }))
      );
    } catch (e) {}
  }
  function render() {
    var done = checks.filter(function (c) { return c.checked; }).length;
    var total = checks.length;
    if (countEl) countEl.textContent = done;
    if (ring) {
      var deg = total ? (done / total) * 360 : 0;
      ring.style.background =
        'conic-gradient(var(--red) ' + deg + 'deg, var(--gray-light) ' + deg + 'deg)';
    }
  }
  checks.forEach(function (c) {
    c.addEventListener('change', function () {
      saveState();
      render();
    });
  });
  if (resetBtn) {
    resetBtn.addEventListener('click', function () {
      checks.forEach(function (c) { c.checked = false; });
      saveState();
      render();
      showToast('Checklist azzerata');
    });
  }
  loadState();
  render();
})();
