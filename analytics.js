/* ============================================================
   FDK EmpowerNet · conversion events for GA4 (CRM action A02)
   Loaded on every page by i18n-boot.js, after gtag.js.
   GA4 enhanced measurement already records page views, scrolls,
   outbound clicks and file downloads; this adds the events that
   tell us whether the funnel converts:

     cta_click      a call to action (briefing, book, library…)
     buy_click      a store link on a book page (Amazon, Apple…)
     sample_open    the sample reader on a book page
     contact_click  mailto: links
     social_click   LinkedIn and other social profiles
     generate_lead  an Executive Briefing request was sent
     sign_up        an email joined a list (newsletter, book sample)

   Forms report success through window.fdkTrack(name, params), so
   generate_lead / sign_up only fire when the backend accepted it.
   Without gtag on the page every call is a silent no-op.
   ============================================================ */
(function () {
  "use strict";
  if (window.fdkTrack) return;

  var base = function () {
    return { page_slug: window.FDK_PAGE || "home", site_lang: window.FDK_LANG || "en" };
  };

  window.fdkTrack = function (name, params) {
    if (typeof window.gtag !== "function") return;
    var p = base();
    for (var k in params || {}) if (params[k] !== undefined && params[k] !== "") p[k] = params[k];
    try { window.gtag("event", name, p); } catch (e) {}
  };

  var text = function (el) {
    return String((el && (el.getAttribute("aria-label") || el.textContent)) || "")
      .replace(/\s+/g, " ").trim().slice(0, 80);
  };
  var bookTitle = function () {
    var b = document.querySelector("[data-title]");
    if (b) return b.getAttribute("data-title");
    var h = document.querySelector("h1");
    return h ? text(h) : "";
  };
  /* Which CTA family a link belongs to, from its target. */
  var ctaKind = function (a) {
    var href = a.getAttribute("href") || "";
    if (/#contact|brief/i.test(href) || /btn--brief|nav__cta/.test(a.className)) return "briefing";
    if (/the-european-pivot|the-rise-of-velocity|the-age-of-intelligent-motion|book/i.test(href)) return "book";
    if (/intelligence-library|velocityedge|library/i.test(href)) return "library";
    if (/thesis/i.test(href)) return "thesis";
    return "other";
  };

  document.addEventListener("click", function (e) {
    var t = e.target;
    if (!t || !t.closest) return;

    var store = t.closest(".buystore");
    if (store) {
      var name = store.querySelector(".buystore__name");
      window.fdkTrack("buy_click", { book: bookTitle(), store: text(name || store), link_url: store.href });
      return;
    }

    var sample = t.closest("#downloadSample, #downloadSample2");
    if (sample) {
      window.fdkTrack("sample_open", { book: sample.getAttribute("data-title") || bookTitle() });
      return;
    }

    var a = t.closest("a[href]");
    if (!a) return;
    var href = a.getAttribute("href") || "";

    if (/^mailto:/i.test(href)) {
      window.fdkTrack("contact_click", { method: "email" });
      return;
    }
    if (/linkedin\.com|x\.com|twitter\.com|youtube\.com/i.test(href)) {
      window.fdkTrack("social_click", { network: (href.match(/(linkedin|x|twitter|youtube)\.com/i) || [])[1], link_url: href });
      return;
    }
    if (a.matches(".btn, .nav__cta, .library__cta, .reader__buy, [data-cta]")) {
      window.fdkTrack("cta_click", {
        cta: a.getAttribute("data-cta") || ctaKind(a),
        cta_text: text(a),
        link_url: a.href,
      });
    }
  }, true);
})();
