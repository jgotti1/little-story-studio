"use strict";

// Small helpers shared by every screen: element lookup, toast, confirm dialog, and the router.
(() => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  const toastEl = $("#toast");
  const confirmDialog = $("#confirm");
  let toastTimer;

  function toast(message) {
    clearTimeout(toastTimer);
    toastEl.textContent = message;
    toastEl.classList.add("is-visible");
    toastTimer = setTimeout(() => toastEl.classList.remove("is-visible"), 2800);
  }

  function nudge(element) {
    element.classList.remove("is-nudged");
    void element.offsetWidth;
    element.classList.add("is-nudged");
  }

  function setPressed(buttons, isOn) {
    buttons.forEach((button) => {
      const on = isOn(button);
      button.setAttribute("aria-pressed", String(on));
      button.classList.toggle("is-on", on);
    });
  }

  function confirmAsk({ emoji, title, text, ok, cancel }) {
    $("#confirm-emoji").textContent = emoji;
    $("#confirm-title").textContent = title;
    $("#confirm-text").textContent = text;
    $("#confirm-ok").textContent = ok;
    $("#confirm-cancel").textContent = cancel;
    return new Promise((resolve) => {
      confirmDialog.addEventListener("close", () => resolve(confirmDialog.returnValue === "ok"), { once: true });
      confirmDialog.returnValue = "cancel";
      confirmDialog.showModal();
    });
  }

  function makeButton(label, className, ariaLabel, onClick) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.textContent = label;
    if (ariaLabel) button.setAttribute("aria-label", ariaLabel);
    button.addEventListener("click", onClick);
    return button;
  }

  function newId() {
    return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function formatTime(seconds) {
    const whole = Math.max(0, Math.round(seconds));
    return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
  }

  // ---------- Router (hash based, so the browser Back button works) ----------

  // Each screen registers { section, title, enter(), leave(), guard() }.
  // "dress" and "stage" share one section, so a screen can name a different section to show.
  const screens = {};
  let current = null;
  let firstRoute = true;

  function register(name, screen) {
    screens[name] = { section: name, title: name, ...screen };
  }

  function go(name) {
    if (location.hash === `#${name}`) route();
    else location.hash = name;
  }

  function route() {
    let name = location.hash.slice(1);
    if (!screens[name]) name = "home";
    const redirect = screens[name].guard?.();
    if (redirect) {
      window.history.replaceState(null, "", `#${redirect}`);
      name = redirect;
    }

    if (current && screens[current].leave) screens[current].leave(name);
    current = name;
    const screen = screens[name];

    $$("main > .view").forEach((view) => { view.hidden = view.id !== `view-${screen.section}`; });
    const tab = screen.tab || name;
    $$(".tab").forEach((item) => {
      if (item.dataset.tab === tab) item.setAttribute("aria-current", "page");
      else item.removeAttribute("aria-current");
    });

    const section = $(`#view-${screen.section}`);
    document.title = `${screen.title} · Little Story Studio`;
    screen.enter?.();

    window.scrollTo(0, 0);
    if (!firstRoute) $("h1", section)?.focus({ preventScroll: true });
    firstRoute = false;
  }

  window.addEventListener("hashchange", route);

  Object.assign(window.LSS, { $, $$, toast, nudge, setPressed, confirmAsk, makeButton, newId, formatTime, register, go, route });
})();
