/* Portfolio — site script (home page, résumé/CV pages and 404). No dependencies. */
(() => {
  "use strict";
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const root = document.documentElement;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const storage = (key, value) => {
    try {
      if (value === undefined) return localStorage.getItem(key);
      if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value);
    } catch (error) { return undefined; }
    return value;
  };

  /* ---------- Light / dark theme ---------- */
  // The page follows the device setting until the visitor picks a theme with the button.
  const systemDark = window.matchMedia("(prefers-color-scheme: dark)");
  const theme = () => root.dataset.theme || (systemDark.matches ? "dark" : "light");
  const labelThemeButtons = () => $$("[data-theme-toggle]").forEach((button) => {
    button.setAttribute("aria-label", `Switch to ${theme() === "dark" ? "light" : "dark"} mode`);
    button.title = button.getAttribute("aria-label");
  });
  $$("[data-theme-toggle]").forEach((button) => button.addEventListener("click", () => {
    root.dataset.theme = theme() === "dark" ? "light" : "dark";
    storage("theme", root.dataset.theme);
    labelThemeButtons();
  }));
  systemDark.addEventListener?.("change", labelThemeButtons);
  labelThemeButtons();

  /* ---------- Header: background once scrolled, phone menu ---------- */
  const header = $("[data-header]");
  const onScroll = () => header?.classList.toggle("is-scrolled", window.scrollY > 8);
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  const menuButton = $("[data-menu-toggle]");
  const setMenu = (open) => {
    document.body.classList.toggle("menu-open", open);
    menuButton?.setAttribute("aria-expanded", String(open));
    menuButton?.setAttribute("aria-label", open ? "Close menu" : "Open menu");
  };
  menuButton?.addEventListener("click", () => setMenu(!document.body.classList.contains("menu-open")));
  $("[data-menu]")?.addEventListener("click", (event) => { if (event.target.closest("a")) setMenu(false); });
  document.addEventListener("keydown", (event) => { if (event.key === "Escape" && document.body.classList.contains("menu-open")) { setMenu(false); menuButton?.focus(); } });
  window.matchMedia("(min-width: 961px)").addEventListener?.("change", (event) => { if (event.matches) setMenu(false); });

  // Highlight the menu link of the section being read.
  const navLinks = $$('.site-nav a[href^="#"]');
  if (navLinks.length && "IntersectionObserver" in window) {
    const byId = new Map(navLinks.map((link) => [link.getAttribute("href").slice(1), link]));
    const spy = new IntersectionObserver((entries) => entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      navLinks.forEach((link) => link.classList.remove("is-active"));
      byId.get(entry.target.id)?.classList.add("is-active");
    }), { rootMargin: "-45% 0px -50% 0px" });
    byId.forEach((_, id) => { const section = document.getElementById(id); if (section) spy.observe(section); });
  }

  /* ---------- Hero: rotating roles ---------- */
  const roles = $("[data-roles]");
  const roleList = (roles?.dataset.roles || "").split("|").filter(Boolean);
  if (roles && roleList.length > 1 && !reduceMotion) {
    let index = 0;
    setInterval(() => {
      roles.classList.add("is-swapping");
      setTimeout(() => {
        index = (index + 1) % roleList.length;
        roles.textContent = roleList[index];
        roles.classList.remove("is-swapping");
      }, 250);
    }, 2800);
  }

  /* ---------- Reveal on scroll ---------- */
  const revealed = $$(".reveal");
  if ("IntersectionObserver" in window && !reduceMotion) {
    const reveal = new IntersectionObserver((entries) => entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const element = entry.target;
      setTimeout(() => element.classList.add("is-visible"), Number(element.dataset.delay || 0));
      reveal.unobserve(element);
    }), { rootMargin: "0px 0px -6% 0px", threshold: 0.06 });
    revealed.forEach((element) => reveal.observe(element));
  } else {
    revealed.forEach((element) => element.classList.add("is-visible"));
  }

  /* ---------- Project filters ---------- */
  const filterButtons = $$("[data-filter]");
  const projectCards = $$("[data-projects] [data-project]");
  filterButtons.forEach((button) => button.addEventListener("click", () => {
    const key = button.dataset.filter;
    filterButtons.forEach((other) => {
      other.classList.toggle("is-active", other === button);
      other.setAttribute("aria-pressed", String(other === button));
    });
    let shown = 0;
    projectCards.forEach((card) => {
      const match = key === "all" || card.dataset.categories.split(" ").includes(key);
      card.hidden = !match;
      if (match) shown++;
    });
    const empty = $("[data-projects-empty]");
    if (empty) empty.hidden = shown > 0;
  }));

  /* ---------- Résumé / CV: print ---------- */
  $$("[data-print]").forEach((button) => button.addEventListener("click", () => window.print()));

  /* ---------- Visit statistics (anonymous, no cookies) ---------- */
  // Sent to the portfolio admin when its address is set (Admin → Analytics → Connect the website):
  // page views, time on page, scroll depth and key actions (résumé downloads, messages, email and
  // social clicks, project interest). Nothing personal is sent. Open any page with ?analytics=off
  // to stop counting your own visits in this browser (?analytics=on to undo).
  const track = (() => {
    const meta = document.querySelector('meta[name="portfolio-analytics"]');
    const endpoint = (meta?.content || "").replace(/\/+$/, "");
    const setting = new URLSearchParams(location.search).get("analytics");
    if (setting === "off") storage("pf-analytics-off", "1");
    if (setting === "on") storage("pf-analytics-off", null);
    // Not when printing the PDFs (opened from disk), when switched off, or in automated browsers.
    if (!endpoint || location.protocol === "file:" || storage("pf-analytics-off") === "1" || navigator.webdriver) return () => {};

    const newId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    const send = (data) => {
      const body = JSON.stringify(data);
      try { if (navigator.sendBeacon && navigator.sendBeacon(`${endpoint}/e`, new Blob([body], { type: "text/plain" }))) return; } catch (error) { /* use fetch */ }
      fetch(`${endpoint}/e`, { method: "POST", body, keepalive: true, credentials: "omit", headers: { "Content-Type": "text/plain" } }).catch(() => {});
    };

    // A visit ends after 30 minutes without activity.
    let visit = null;
    try { visit = JSON.parse(storage("pf-visit") || "null"); } catch (error) { visit = null; }
    const firstPage = !visit || !visit.id || Date.now() - visit.last > 30 * 60 * 1000;
    if (firstPage) visit = { id: newId(), last: Date.now() };
    const keepVisit = () => { visit.last = Date.now(); storage("pf-visit", JSON.stringify(visit)); };
    keepVisit();
    const seenBefore = storage("pf-seen");
    storage("pf-seen", "1");

    // The page's route ("/resume/") comes from the page itself, so it reports correctly from any
    // host, including a sub-folder (sent as the base).
    const route = meta?.dataset.path || "";
    const here = location.pathname.replace(/\/index\.html$/, "/").replace(/([^/])$/, "$1/");
    const base = route && here.endsWith(route) ? here.slice(0, here.length - route.length) : "";
    const view = newId();
    const query = new URLSearchParams(location.search);
    send({
      t: "v", id: view, s: visit.id, en: firstPage ? 1 : 0,
      n: seenBefore === "1" ? 0 : seenBefore === null ? 1 : -1,
      p: route || location.pathname, b: base, ti: document.title, r: document.referrer,
      u: { source: query.get("utm_source") || "", medium: query.get("utm_medium") || "", campaign: query.get("utm_campaign") || "" },
      w: window.screen?.width || 0, tc: navigator.maxTouchPoints > 0 ? 1 : 0, l: navigator.language || "",
      z: (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch (error) { return ""; } })(),
      nf: document.getElementById("page-404") ? 1 : 0
    });

    // Time actually spent looking at the page, and how far down it was read.
    let visibleSince = document.visibilityState === "visible" ? Date.now() : 0;
    let visibleMs = 0;
    let deepest = 0;
    let lastSent = "";
    const seconds = () => Math.round((visibleMs + (visibleSince ? Date.now() - visibleSince : 0)) / 1000);
    const measureScroll = () => {
      const room = document.documentElement.scrollHeight - window.innerHeight;
      deepest = Math.max(deepest, room > 0 ? Math.min(100, Math.round((window.scrollY / room) * 100)) : 100);
    };
    window.addEventListener("scroll", measureScroll, { passive: true });
    measureScroll();
    const report = () => {
      const state = `${seconds()}:${deepest}`;
      if (state === lastSent) return;
      lastSent = state;
      send({ t: "p", id: view, d: seconds(), sc: deepest });
      keepVisit();
    };
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") {
        if (visibleSince) visibleMs += Date.now() - visibleSince;
        visibleSince = 0;
        report();
      } else visibleSince = Date.now();
    });
    window.addEventListener("pagehide", report);
    const heartbeat = setInterval(() => {
      if (document.visibilityState === "visible") report();
      if (seconds() > 1800) clearInterval(heartbeat);
    }, 45000);

    const action = (name, label = "", target = "") => send({ t: "e", id: view, n: name, l: String(label).trim().slice(0, 120), x: String(target).slice(0, 200) });
    const label = (element) => (element.getAttribute("aria-label") || element.textContent || "").replace(/\s+/g, " ").trim();

    document.addEventListener("click", (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;
      const download = target.closest("[data-download]");
      if (download) return action("download", download.dataset.download);
      const link = target.closest("a[href]");
      if (!link) {
        const filter = target.closest("[data-filter]");
        if (filter) action("project_filter", filter.textContent);
        return;
      }
      if (link.dataset.social) return action("social", link.dataset.social);
      const project = link.closest("[data-project]");
      if (project) return action("project_click", project.dataset.project, link.href);
      let url;
      try { url = new URL(link.href, location.href); } catch (error) { return; }
      if (/(^|\.)wa\.me$|whatsapp\.com$/.test(url.hostname)) action("whatsapp", label(link));
      else if (url.protocol === "tel:") action("call", label(link));
      else if (url.protocol === "mailto:") action("email", label(link));
      else if (/^https?:$/.test(url.protocol) && url.origin !== location.origin) action("outbound", url.hostname.replace(/^www\./, ""), url.href);
      else if (url.hash === "#contact") action("contact_click", label(link));
    }, true);

    // Project cards and page sections count as "seen" after a second at least half in view.
    if ("IntersectionObserver" in window) {
      const timers = new Map();
      const watcher = new IntersectionObserver((entries) => entries.forEach((entry) => {
        const element = entry.target;
        const inView = entry.intersectionRatio >= 0.5 || entry.intersectionRect.height >= window.innerHeight * 0.5;
        clearTimeout(timers.get(element));
        if (!inView) return;
        timers.set(element, setTimeout(() => {
          watcher.unobserve(element);
          if (element.dataset.project) action("project_view", element.dataset.project);
          else action("section_view", element.dataset.section);
        }, 1000));
      }), { threshold: [0, 0.25, 0.5, 0.75, 1] });
      $$("[data-project], [data-section]").forEach((element) => watcher.observe(element));
    }
    return action;
  })();

  /* ---------- Contact form ---------- */
  // With data-endpoint set (a Formspree URL, from Site settings) the form posts there; otherwise it
  // opens the visitor's email app with the message pre-filled and addressed to data-mailto.
  const form = $("[data-contact-form]");
  const formStatus = $("[data-form-status]");
  const setStatus = (message, state) => {
    if (!formStatus) return;
    formStatus.textContent = message;
    formStatus.classList.toggle("is-error", state === "error");
    formStatus.classList.toggle("is-success", state === "success");
  };
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    form.classList.add("was-validated");
    if (!form.checkValidity()) {
      setStatus("Please add your name, a valid email address and a message.", "error");
      form.querySelector(":invalid")?.focus();
      return;
    }
    const data = new FormData(form);
    if (data.get("_gotcha")) return;
    const endpoint = (form.dataset.endpoint || "").trim();
    const mailto = (form.dataset.mailto || "").trim();
    const reason = data.get("reason") || "Message";

    if (endpoint) {
      const button = form.querySelector("[type=submit]");
      button.disabled = true;
      setStatus("Sending…");
      try {
        const response = await fetch(endpoint, { method: "POST", body: data, headers: { Accept: "application/json" } });
        if (!response.ok) throw new Error(String(response.status));
        track("enquiry", reason);
        form.reset();
        form.classList.remove("was-validated");
        setStatus("Thanks — your message is on its way. I’ll get back to you soon.", "success");
      } catch (error) {
        setStatus(`Something went wrong. Please try again${mailto ? ` or email ${mailto}` : ""}.`, "error");
      } finally {
        button.disabled = false;
      }
      return;
    }
    if (!mailto) {
      setStatus("Messages can’t be sent from here yet — please use one of the links on this page.", "error");
      return;
    }
    track("enquiry", reason);
    const subject = `${reason} — ${data.get("name")}`;
    const body = `${data.get("message")}\n\n${data.get("name")}\n${data.get("email")}`;
    window.location.href = `mailto:${mailto}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    setStatus("Your email app should open with your message ready to send.", "success");
  });
})();
