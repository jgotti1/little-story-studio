"use strict";

// "Bring it to life" and "Dress it up" are two modes of the same stage: pick a move and a
// place, then add stickers. Stickers are saved as data next to the drawing, never painted
// into it, so an outfit can be changed later.
(() => {
  const { $, $$, THEMES, MOTIONS, STICKER_GROUPS, STICKER_MIN, STICKER_MAX, MAX_STICKERS, DEFAULT_MOTION, DEFAULT_PLACE } = window.LSS;
  const { toast, setPressed, newId, register, go, db, scene: painter, drawing } = window.LSS;
  const { draft } = drawing;

  const stage = $("#stage");
  const rig = $("#rig");
  const actor = $("#actor");
  const layer = $("#stickers");
  const nameInput = $("#name");
  const playToggle = $("#play-toggle");

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  const state = {
    mode: "stage",
    playing: !reducedMotion.matches, // stage mode: is the move playing
    preview: false, // dress mode: trying the move instead of dressing
    selectedId: null,
    group: STICKER_GROUPS[0].id,
  };
  let artCanvas = null;
  let drag = null;

  const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

  // ---------- Stage ----------

  function syncStage() {
    const dressing = state.mode === "dress";
    stage.dataset.mode = state.mode;
    stage.dataset.motion = dressing && !state.preview ? "still" : draft.motion;
    stage.classList.toggle("is-paused", !dressing && !state.playing);
    stage.classList.toggle("is-previewing", dressing && state.preview);
    playToggle.hidden = false;
    playToggle.setAttribute("aria-pressed", String(dressing ? state.preview : state.playing));
    if (dressing) {
      playToggle.firstElementChild.textContent = state.preview ? "✋" : "▶";
      $("#play-label").textContent = state.preview ? "Back to dressing" : "Try the move";
    } else {
      playToggle.firstElementChild.textContent = state.playing ? "⏸" : "▶";
      $("#play-label").textContent = state.playing ? "Pause" : "Play";
    }
    $("#sticker-bar").hidden = !dressing;
  }

  function setMotion(id) {
    draft.motion = MOTIONS.some((motion) => motion.id === id) ? id : DEFAULT_MOTION;
    setPressed($$("#motions .option"), (item) => item.dataset.motion === draft.motion);
    syncStage();
  }

  function setPlace(id) {
    draft.place = THEMES[id] ? id : DEFAULT_PLACE;
    painter.applyTheme(stage, draft.place);
    setPressed($$("#places .option"), (item) => item.dataset.place === draft.place);
  }

  function buildControls() {
    const motions = $("#motions");
    MOTIONS.forEach((motion) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "option";
      button.dataset.motion = motion.id;
      button.innerHTML = `<span class="o-icon" aria-hidden="true">${motion.icon}</span><span>${motion.label}</span>`;
      button.addEventListener("click", () => {
        setMotion(motion.id);
        draft.dirty = true;
        state.playing = true;
        syncStage();
      });
      motions.append(button);
    });

    const places = $("#places");
    Object.entries(THEMES).forEach(([id, theme]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "option";
      button.dataset.place = id;
      button.innerHTML = `<span class="o-icon" style="--a:${theme.skyTop};--b:${theme.hillF}" aria-hidden="true"></span><span>${theme.label}</span>`;
      button.addEventListener("click", () => {
        setPlace(id);
        draft.dirty = true;
      });
      places.append(button);
    });

    const groups = $("#sticker-groups");
    STICKER_GROUPS.forEach((group) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "chip";
      button.dataset.group = group.id;
      button.textContent = group.label;
      button.addEventListener("click", () => showGroup(group.id));
      groups.append(button);
    });
    showGroup(state.group);
  }

  function showGroup(id) {
    state.group = id;
    const group = STICKER_GROUPS.find((item) => item.id === id);
    setPressed($$("#sticker-groups .chip"), (item) => item.dataset.group === id);
    const items = $("#sticker-items");
    items.replaceChildren();
    group.items.forEach(([glyph, name]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "sticker-pick";
      button.textContent = glyph;
      button.setAttribute("aria-label", `Add ${name}`);
      button.addEventListener("click", () => addSticker(group, glyph, name));
      items.append(button);
    });
  }

  // ---------- Stickers ----------

  const rigBox = () => rig.getBoundingClientRect();
  const findSticker = (id) => draft.stickers.find((sticker) => sticker.id === id);

  function placeStickerEl(el, sticker) {
    el.style.left = `${sticker.x * 100}%`;
    el.style.top = `${sticker.y * 100}%`;
    el.style.fontSize = `calc(var(--rig) * ${sticker.size})`;
    el.style.transform = `translate(-50%, -50%) rotate(${sticker.rot}deg)`;
  }

  function renderStickers() {
    layer.replaceChildren();
    draft.stickers.forEach((sticker) => {
      const el = document.createElement("div");
      el.className = "sticker";
      el.dataset.id = sticker.id;
      el.tabIndex = state.mode === "dress" ? 0 : -1;
      el.setAttribute("role", "button");
      el.setAttribute("aria-label", `${sticker.name} sticker`);
      el.textContent = sticker.glyph;
      placeStickerEl(el, sticker);
      layer.append(el);
    });
    markSelected();
  }

  const stickerEl = (id) => layer.querySelector(`[data-id="${id}"]`);

  // Highlight the selected sticker and give it a handle for resizing and turning.
  function markSelected() {
    $$(".sticker-handle", layer).forEach((handle) => handle.remove());
    $$(".sticker", layer).forEach((el) => {
      const on = el.dataset.id === state.selectedId;
      el.classList.toggle("is-selected", on);
      if (on) {
        const handle = document.createElement("span");
        handle.className = "sticker-handle";
        handle.setAttribute("aria-hidden", "true");
        el.append(handle);
      }
    });
    const sticker = findSticker(state.selectedId);
    ["#st-smaller", "#st-bigger", "#st-turn", "#st-remove"].forEach((selector) => { $(selector).disabled = !sticker; });
    $("#sticker-hint").textContent = sticker
      ? `${sticker.name} is picked. Drag it to move. Drag the dot to make it bigger or turn it.`
      : `Tap a sticker to pick it. You can wear up to ${MAX_STICKERS}.`;
  }

  function select(id) {
    if (state.selectedId === id) return;
    state.selectedId = id;
    markSelected();
  }

  function addSticker(group, glyph, name) {
    if (draft.stickers.length >= MAX_STICKERS) {
      toast(`That's plenty of stickers! ${MAX_STICKERS} is the most.`);
      return;
    }
    const near = draft.stickers.filter((item) => Math.abs(item.x - group.x) < 0.1 && Math.abs(item.y - group.y) < 0.1).length;
    const sticker = {
      id: newId(),
      glyph,
      name,
      x: clamp(group.x + (near % 3 - 1) * 0.08 * (near ? 1 : 0), 0, 1),
      y: clamp(group.y + near * 0.04, 0, 1),
      size: group.size,
      rot: 0,
    };
    draft.stickers.push(sticker);
    draft.dirty = true;
    state.selectedId = sticker.id;
    renderStickers();
  }

  function changeSelected(change) {
    const sticker = findSticker(state.selectedId);
    if (!sticker) return;
    change(sticker);
    sticker.size = clamp(sticker.size, STICKER_MIN, STICKER_MAX);
    draft.dirty = true;
    placeStickerEl(stickerEl(sticker.id), sticker);
  }

  function removeSelected() {
    const sticker = findSticker(state.selectedId);
    if (!sticker) return;
    draft.stickers = draft.stickers.filter((item) => item !== sticker);
    draft.dirty = true;
    state.selectedId = null;
    renderStickers();
  }

  $("#st-smaller").addEventListener("click", () => changeSelected((sticker) => { sticker.size *= 0.85; }));
  $("#st-bigger").addEventListener("click", () => changeSelected((sticker) => { sticker.size *= 1.18; }));
  $("#st-turn").addEventListener("click", () => changeSelected((sticker) => { sticker.rot = (sticker.rot + 20) % 360; }));
  $("#st-remove").addEventListener("click", removeSelected);

  // Drag a sticker to move it. Drag its dot to resize and turn it in one motion.
  layer.addEventListener("pointerdown", (event) => {
    if (state.mode !== "dress" || state.preview || (event.pointerType === "mouse" && event.button !== 0)) return;
    const el = event.target.closest(".sticker");
    const sticker = el && findSticker(el.dataset.id);
    if (!sticker) return;
    event.preventDefault();

    const handle = event.target.closest(".sticker-handle");
    select(sticker.id);
    // Bring it to the front so a sticker hiding under another can be grabbed.
    if (draft.stickers[draft.stickers.length - 1] !== sticker) {
      draft.stickers = [...draft.stickers.filter((item) => item !== sticker), sticker];
      layer.append(el);
    }
    el.setPointerCapture(event.pointerId);
    drag = { id: event.pointerId, sticker, el, resize: Boolean(handle), startX: event.clientX, startY: event.clientY, x: sticker.x, y: sticker.y, moved: false };
  });

  layer.addEventListener("pointermove", (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    const box = rigBox();
    const { sticker, el } = drag;
    if (drag.resize) {
      const bounds = el.getBoundingClientRect();
      const dx = event.clientX - (bounds.left + bounds.width / 2);
      const dy = event.clientY - (bounds.top + bounds.height / 2);
      // The handle sits at the sticker's bottom-right corner: 45 degrees, and 0.71 of its size away.
      sticker.size = clamp(Math.hypot(dx, dy) / (Math.SQRT1_2 * Math.max(box.width, box.height)), STICKER_MIN, STICKER_MAX);
      let rot = (Math.atan2(dy, dx) * 180) / Math.PI - 45;
      rot = ((rot % 360) + 360) % 360;
      sticker.rot = rot < 6 || rot > 354 ? 0 : Math.round(rot);
    } else {
      sticker.x = clamp(drag.x + (event.clientX - drag.startX) / box.width, -0.3, 1.3);
      sticker.y = clamp(drag.y + (event.clientY - drag.startY) / box.height, -0.3, 1.3);
    }
    drag.moved = true;
    draft.dirty = true;
    placeStickerEl(el, sticker);
  });

  const endDrag = (event) => {
    if (drag && event.pointerId === drag.id) drag = null;
  };
  layer.addEventListener("pointerup", endDrag);
  layer.addEventListener("pointercancel", endDrag);

  // The same things without a pointer: arrow keys move, plus and minus resize, Delete removes.
  layer.addEventListener("keydown", (event) => {
    const el = event.target.closest(".sticker");
    if (!el || state.mode !== "dress") return;
    const step = 0.02;
    const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    select(el.dataset.id);
    if (moves[event.key]) {
      event.preventDefault();
      changeSelected((sticker) => {
        sticker.x = clamp(sticker.x + moves[event.key][0], -0.3, 1.3);
        sticker.y = clamp(sticker.y + moves[event.key][1], -0.3, 1.3);
      });
    } else if (event.key === "+" || event.key === "=") {
      changeSelected((sticker) => { sticker.size *= 1.1; });
    } else if (event.key === "-") {
      changeSelected((sticker) => { sticker.size *= 0.9; });
    } else if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      removeSelected();
      $("#sticker-items button")?.focus();
    }
  });

  // Tapping anywhere else on the stage puts the sticker down.
  stage.addEventListener("pointerdown", (event) => {
    if (state.mode === "dress" && !event.target.closest(".sticker")) select(null);
  });

  // ---------- Screen ----------

  function enter(mode) {
    state.mode = mode;
    state.preview = false;
    state.selectedId = null;
    drag = null;

    artCanvas = drawing.art();
    actor.src = artCanvas.toDataURL("image/png");
    const shown = painter.fitPercent(artCanvas.width / artCanvas.height);
    rig.style.width = `${shown.w}%`;
    rig.style.height = `${shown.h}%`;
    // Stickers are sized against the character's longer side, in stage-width units.
    rig.style.setProperty("--rig", `${Math.max(0.56 * shown.w, 0.68 * shown.h * 0.75)}cqw`);
    actor.alt = draft.name ? `${draft.name}, your character` : "Your drawing";

    nameInput.value = draft.name;
    nameInput.removeAttribute("aria-invalid");
    $("#save-label").textContent = draft.characterId ? "Save changes" : "Save my character";

    const dressing = mode === "dress";
    $("#stage-step").textContent = dressing ? "Step 3 of 3" : "Step 2 of 3";
    $("#stage-title").textContent = dressing ? "Dress it up" : "Bring it to life";
    $("#stage-back-label").textContent = dressing ? "Back to moves" : "Back to drawing";
    $("#stage-next").hidden = dressing;
    $("#panel-motion").hidden = dressing;
    $("#panel-dress").hidden = !dressing;
    document.title = `${dressing ? "Dress it up" : "Bring it to life"} · Little Story Studio`;

    setPlace(draft.place);
    setMotion(draft.motion);
    renderStickers();
  }

  const screen = { section: "stage", tab: "draw", guard: () => (draft.hasInk ? null : "draw") };
  register("stage", { ...screen, title: "Bring it to life", enter: () => enter("stage") });
  register("dress", { ...screen, title: "Dress it up", enter: () => enter("dress") });

  $("#stage-back").addEventListener("click", () => go(state.mode === "dress" ? "stage" : "draw"));
  $("#stage-next").addEventListener("click", () => go("dress"));
  playToggle.addEventListener("click", () => {
    if (state.mode === "dress") {
      state.preview = !state.preview;
      select(null);
    } else {
      state.playing = !state.playing;
    }
    syncStage();
  });

  // ---------- Saving ----------

  nameInput.addEventListener("input", () => {
    nameInput.removeAttribute("aria-invalid");
    draft.name = nameInput.value.slice(0, 24);
    draft.dirty = true;
  });

  const canvasBlob = (canvas) => new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("The drawing could not be saved."))), "image/png");
  });

  $("#save-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = nameInput.value.trim().slice(0, 24);
    if (!name) {
      nameInput.setAttribute("aria-invalid", "true");
      nameInput.focus();
      toast("Give your character a name first!");
      return;
    }
    if (!draft.hasInk) {
      go("draw");
      return;
    }

    const button = $("#save-button");
    button.disabled = true;
    try {
      const now = Date.now();
      const character = {
        id: draft.characterId || newId(),
        name,
        art: await canvasBlob(artCanvas),
        motion: draft.motion,
        place: draft.place,
        stickers: draft.stickers.map(({ id, glyph, name: label, x, y, size, rot }) => ({ id, glyph, name: label, x, y, size, rot })),
        createdAt: draft.createdAt || now,
        updatedAt: now,
      };
      await db.put("characters", character);
      Object.assign(draft, { characterId: character.id, createdAt: character.createdAt, name, dirty: false });
      if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
      await window.LSS.refreshCount();
      go("characters");
      toast(`${name} is saved! 🎉`);
    } catch (error) {
      console.error("Could not save character", error);
      toast("Hmm, that didn't save. This browser's storage might be full.");
    } finally {
      button.disabled = false;
    }
  });

  buildControls();
})();
