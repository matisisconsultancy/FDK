/* ============================================================
   FDK EmpowerNet · Editorial / dynamic rebuild — interactions
   Dependency-free. Built to feel like a premium agency site:
   preloader, custom cursor, masked text reveals, parallax,
   sticky storytelling, scroll word-highlight, magnetic buttons.
   ============================================================ */
(function () {
  "use strict";

  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = window.matchMedia("(pointer: fine)").matches;
  const lerp = (a, b, n) => a + (b - a) * n;
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

  /* ---- Year ---- */
  const y = $("#year");
  if (y) y.textContent = new Date().getFullYear();

  /* ============================================================
     1 · Split headings into masked words / blocks for reveal
     ============================================================ */
  function splitText(el) {
    const nodes = Array.from(el.childNodes);
    el.textContent = "";
    let i = 0;
    nodes.forEach((node) => {
      if (node.nodeType === 3) {
        const parts = node.textContent.split(/(\s+)/);
        parts.forEach((p) => {
          if (p === "") return;
          if (/^\s+$/.test(p)) { el.appendChild(document.createTextNode(" ")); return; }
          el.appendChild(makeWord(p, i++));
        });
      } else {
        const w = document.createElement("span");
        w.className = "r-word";
        const inner = document.createElement("span");
        inner.className = "r-word__in";
        inner.style.transitionDelay = i * 0.035 + "s";
        inner.appendChild(node);
        w.appendChild(inner);
        el.appendChild(w);
        i++;
      }
    });
  }
  function makeWord(text, i) {
    const w = document.createElement("span");
    w.className = "r-word";
    const inner = document.createElement("span");
    inner.className = "r-word__in";
    inner.style.transitionDelay = i * 0.035 + "s";
    inner.textContent = text;
    w.appendChild(inner);
    return w;
  }
  function splitBlock(el) {
    const inner = document.createElement("span");
    inner.className = "r-block__in";
    while (el.firstChild) inner.appendChild(el.firstChild);
    el.classList.add("r-block");
    el.appendChild(inner);
  }

  if (!reduceMotion) {
    $$("[data-reveal-text]").forEach(splitText);
    $$("[data-reveal-block]").forEach(splitBlock);
  }

  /* ============================================================
     2 · Scroll reveal (IntersectionObserver)
     ============================================================ */
  const revealTargets = $$(
    "[data-reveal-text], [data-reveal-block], .reveal-up, .reveal-img"
  ).filter((el) => !el.closest(".hero")); // hero is revealed by the preloader
  if ("IntersectionObserver" in window && !reduceMotion) {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.18, rootMargin: "0px 0px -8% 0px" }
    );
    revealTargets.forEach((el) => io.observe(el));
  } else {
    revealTargets.forEach((el) => el.classList.add("in"));
  }

  /* ============================================================
     3 · Preloader
     ============================================================ */
  const loader = $("#loader");
  const countEl = $("#loaderCount");
  const barEl = $("#loaderBar");
  if (loader && !reduceMotion) {
    document.body.classList.add("loading");
    let p = 0;
    const tick = () => {
      p += Math.max(1, (100 - p) * 0.06);
      if (p >= 100) p = 100;
      if (countEl) countEl.textContent = Math.round(p);
      if (barEl) barEl.style.width = p + "%";
      if (p < 100) {
        requestAnimationFrame(tick);
      } else {
        setTimeout(() => {
          loader.classList.add("done");
          document.body.classList.remove("loading");
          // trigger hero reveals
          $$(".hero [data-reveal-text], .hero [data-reveal-block], .hero .reveal-up")
            .forEach((el) => el.classList.add("in"));
        }, 350);
      }
    };
    requestAnimationFrame(tick);
  } else if (loader) {
    loader.remove();
  }

  /* ============================================================
     4 · Navbar state + reading progress
     ============================================================ */
  const nav = $("#nav");
  const progress = $("#scrollProgress");
  const onScroll = () => {
    const sy = window.scrollY || document.documentElement.scrollTop;
    if (nav) nav.classList.toggle("scrolled", sy > 40);
    if (progress) {
      const docH = document.documentElement.scrollHeight - window.innerHeight;
      progress.style.width = (docH > 0 ? (sy / docH) * 100 : 0) + "%";
    }
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* ---- Mobile menu ---- */
  const toggle = $("#navToggle");
  const links = $("#navLinks");
  if (toggle && links) {
    const close = () => {
      links.classList.remove("open");
      toggle.classList.remove("open");
      toggle.setAttribute("aria-expanded", "false");
    };
    toggle.addEventListener("click", () => {
      const open = links.classList.toggle("open");
      toggle.classList.toggle("open", open);
      toggle.setAttribute("aria-expanded", String(open));
    });
    $$("a", links).forEach((a) => a.addEventListener("click", close));
  }

  /* ============================================================
     5 · Custom cursor + magnetic + hover-grow
     ============================================================ */
  const cursor = $("#cursor");
  if (cursor && finePointer && !reduceMotion) {
    document.body.classList.add("has-cursor");
    const label = $(".cursor__label", cursor);
    let cx = window.innerWidth / 2, cy = window.innerHeight / 2;
    let tx = cx, ty = cy;
    window.addEventListener("mousemove", (e) => { tx = e.clientX; ty = e.clientY; }, { passive: true });
    const render = () => {
      cx = lerp(cx, tx, 0.2);
      cy = lerp(cy, ty, 0.2);
      cursor.style.transform = `translate(${cx}px, ${cy}px) translate(-50%, -50%)`;
      requestAnimationFrame(render);
    };
    requestAnimationFrame(render);

    $$("[data-cursor]").forEach((el) => {
      el.addEventListener("mouseenter", () => {
        cursor.classList.add("is-active");
        if (label) label.textContent = el.getAttribute("data-cursor") || "";
      });
      el.addEventListener("mouseleave", () => {
        cursor.classList.remove("is-active");
        if (label) label.textContent = "";
      });
    });
  }

  /* ---- Magnetic buttons ---- */
  if (finePointer && !reduceMotion) {
    $$(".magnetic").forEach((el) => {
      const strength = 0.32;
      el.addEventListener("mousemove", (e) => {
        const r = el.getBoundingClientRect();
        const mx = e.clientX - (r.left + r.width / 2);
        const my = e.clientY - (r.top + r.height / 2);
        el.style.transform = `translate(${mx * strength}px, ${my * strength}px)`;
      });
      el.addEventListener("mouseleave", () => { el.style.transform = ""; });
    });
  }

  /* ============================================================
     6 · Parallax (scroll-driven, rAF)
     ============================================================ */
  const parallaxEls = $$("[data-parallax]");
  const parallaxImgs = $$("[data-parallax-img]");
  let ticking = false;
  function parallax() {
    const vh = window.innerHeight;
    parallaxEls.forEach((el) => {
      const speed = parseFloat(el.dataset.parallax) || 0.1;
      const r = el.getBoundingClientRect();
      const offset = (r.top + r.height / 2 - vh / 2) * -speed;
      el.style.transform = `translate3d(0, ${offset.toFixed(1)}px, 0)`;
    });
    parallaxImgs.forEach((img) => {
      const fig = img.parentElement;
      const r = fig.getBoundingClientRect();
      if (r.bottom < 0 || r.top > vh) return;
      const prog = (r.top + r.height / 2 - vh / 2) / vh; // -0.5..0.5
      img.style.transform = `translate3d(0, ${(prog * -8).toFixed(2)}%, 0)`;
    });
    ticking = false;
  }
  if (!reduceMotion && (parallaxEls.length || parallaxImgs.length)) {
    window.addEventListener("scroll", () => {
      if (!ticking) { ticking = true; requestAnimationFrame(parallax); }
    }, { passive: true });
    window.addEventListener("resize", parallax);
    parallax();
  }

  /* ============================================================
     7 · Sticky concepts — active swap
     ============================================================ */
  const conceptItems = $$(".concept");
  const conceptImgs = $$(".cmedia__img");
  const cIndex = $("#cIndex");
  if (conceptItems.length) {
    let active = -1;
    const updateConcepts = () => {
      const mid = window.innerHeight * 0.5;
      let best = 0, bestDist = Infinity;
      conceptItems.forEach((item, i) => {
        const r = item.getBoundingClientRect();
        const dist = Math.abs(r.top + r.height / 2 - mid);
        if (dist < bestDist) { bestDist = dist; best = i; }
      });
      if (best !== active) {
        active = best;
        conceptItems.forEach((it, i) => it.classList.toggle("is-active", i === active));
        conceptImgs.forEach((im, i) => im.classList.toggle("is-active", i === active));
        if (cIndex) cIndex.textContent = String(active + 1).padStart(2, "0");
      }
    };
    window.addEventListener("scroll", updateConcepts, { passive: true });
    window.addEventListener("resize", updateConcepts);
    updateConcepts();
  }

  /* ============================================================
     8 · Statement — word highlight on scroll
     ============================================================ */
  const stmt = $("[data-highlight]");
  if (stmt && !reduceMotion) {
    const words = stmt.textContent.trim().split(/\s+/);
    stmt.textContent = "";
    const spans = words.map((w) => {
      const s = document.createElement("span");
      s.className = "hl";
      s.textContent = w + " ";
      stmt.appendChild(s);
      return s;
    });
    const onStmt = () => {
      const r = stmt.getBoundingClientRect();
      const vh = window.innerHeight;
      // progress: 0 when section enters lower third, 1 when it leaves upper third
      const start = vh * 0.85;
      const end = vh * 0.25;
      const prog = clamp((start - r.top) / (start - end + r.height), 0, 1);
      const lit = Math.round(prog * spans.length);
      spans.forEach((s, i) => s.classList.toggle("on", i < lit));
    };
    window.addEventListener("scroll", onStmt, { passive: true });
    window.addEventListener("resize", onStmt);
    onStmt();
  }

  /* ============================================================
     9 · Contact form (front-end only)
     ============================================================ */
  const form = $("#briefingForm");
  const status = $("#formStatus");
  if (form && status) {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const name = $("#name").value.trim();
      const email = $("#email").value.trim();
      const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
      status.className = "form__status";

      if (!name || !email) {
        status.textContent = "Please enter your name and work email.";
        status.classList.add("err");
        return;
      }
      if (!emailOk) {
        status.textContent = "That email doesn't look valid. Please check it.";
        status.classList.add("err");
        return;
      }
      const btn = $("button[type=submit]", form);
      const original = btn.textContent;
      btn.disabled = true;
      btn.textContent = "Sending...";
      // Simulated submission — replace with a real endpoint when available.
      setTimeout(() => {
        btn.disabled = false;
        btn.textContent = original;
        form.reset();
        status.textContent = `Thank you, ${name}. We've received your request and will be in touch shortly.`;
        status.classList.add("ok");
      }, 900);
    });
  }
})();
