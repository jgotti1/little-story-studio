"use strict";

// The drawing screen. It also owns `draft`: the character being made, shared with the
// stage/dress screen (dress.js) and the gallery (gallery.js).
(() => {
  const { $, $$, COLORS, SIZES, CANVAS_W, CANVAS_H, DEFAULT_MOTION, DEFAULT_PLACE } = window.LSS;
  const { toast, nudge, setPressed, confirmAsk, register, go, scene: painter } = window.LSS;

  const MAX_HISTORY = 30;

  const canvas = $("#canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;

  const hint = $("#canvas-hint");
  const undoButton = $("#undo");
  const redoButton = $("#redo");

  // The character in progress. The drawing itself lives on the canvas; stickers are kept
  // apart from it so an outfit can always be changed without touching the drawing.
  const draft = {
    characterId: null,
    createdAt: null,
    name: "",
    motion: DEFAULT_MOTION,
    place: DEFAULT_PLACE,
    stickers: [],
    hasInk: false,
    dirty: false, // changed since it was last saved or opened
  };

  const brush = { tool: "draw", color: COLORS[7], size: SIZES[1] };

  let snapshots = [];
  let historyIndex = -1;
  let restoreToken = 0;
  let stroke = null;
  let penSeen = false;

  // ---------- Ink and history ----------

  function refreshInk() {
    draft.hasInk = painter.measureInk(canvas) !== null;
    hint.classList.toggle("is-gone", draft.hasInk);
  }

  function updateHistoryButtons() {
    undoButton.disabled = historyIndex <= 0;
    redoButton.disabled = historyIndex >= snapshots.length - 1;
  }

  const snapshot = () => canvas.toDataURL("image/png");

  // Remember the canvas as it is right now (called after every finished stroke).
  function commitHistory() {
    snapshots = snapshots.slice(0, historyIndex + 1);
    snapshots.push(snapshot());
    if (snapshots.length > MAX_HISTORY + 1) snapshots.shift();
    historyIndex = snapshots.length - 1;
    updateHistoryButtons();
  }

  function resetHistory() {
    snapshots = [snapshot()];
    historyIndex = 0;
    updateHistoryButtons();
  }

  function paintFromSource(source) {
    const token = ++restoreToken;
    return new Promise((resolve) => {
      const image = new Image();
      image.onload = () => {
        if (token === restoreToken) {
          ctx.globalCompositeOperation = "source-over";
          ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
          ctx.drawImage(image, 0, 0, CANVAS_W, CANVAS_H);
        }
        resolve(token === restoreToken);
      };
      image.onerror = () => resolve(false);
      image.src = source;
    });
  }

  async function stepHistory(direction) {
    const next = historyIndex + direction;
    if (next < 0 || next >= snapshots.length) return;
    historyIndex = next;
    updateHistoryButtons();
    if (await paintFromSource(snapshots[historyIndex])) {
      refreshInk();
      draft.dirty = true;
    }
  }

  function clearCanvas() {
    restoreToken += 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
  }

  function reset() {
    clearCanvas();
    Object.assign(draft, {
      characterId: null,
      createdAt: null,
      name: "",
      motion: DEFAULT_MOTION,
      place: DEFAULT_PLACE,
      stickers: [],
      dirty: false,
    });
    resetHistory();
    refreshInk();
  }

  // ---------- Pointer drawing ----------

  function pointFor(event) {
    const bounds = canvas.getBoundingClientRect();
    const scale = CANVAS_W / bounds.width;
    return { x: (event.clientX - bounds.left) * scale, y: (event.clientY - bounds.top) * scale, scale };
  }

  // Brush sizes are chosen in on-screen pixels so a stroke looks the same on any screen.
  // Stylus pressure makes the line a little thinner or thicker.
  function widthFor(event, scale) {
    let width = brush.size.px * scale;
    if (event.pointerType === "pen" && event.pressure > 0) width *= 0.5 + event.pressure;
    return width;
  }

  function applyBrush(width) {
    ctx.globalCompositeOperation = brush.tool === "erase" ? "destination-out" : "source-over";
    ctx.strokeStyle = brush.color.value;
    ctx.fillStyle = brush.color.value;
    ctx.lineWidth = width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }

  function onPointerDown(event) {
    if (event.pointerType === "pen") penSeen = true;
    // Once a stylus has been used, a resting palm should not draw.
    if (event.pointerType === "touch" && penSeen) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (stroke) return;

    event.preventDefault();
    canvas.setPointerCapture(event.pointerId);
    const point = pointFor(event);
    const width = widthFor(event, point.scale);
    applyBrush(width);
    ctx.beginPath();
    ctx.arc(point.x, point.y, width / 2, 0, Math.PI * 2);
    ctx.fill();
    stroke = { id: event.pointerId, last: point, mid: point };
    hint.classList.add("is-gone");
  }

  function onPointerMove(event) {
    if (!stroke || event.pointerId !== stroke.id) return;
    event.preventDefault();
    const events = event.getCoalescedEvents ? event.getCoalescedEvents() : [event];
    for (const item of events.length ? events : [event]) {
      const point = pointFor(item);
      const mid = { x: (stroke.last.x + point.x) / 2, y: (stroke.last.y + point.y) / 2 };
      applyBrush(widthFor(item, point.scale));
      ctx.beginPath();
      ctx.moveTo(stroke.mid.x, stroke.mid.y);
      ctx.quadraticCurveTo(stroke.last.x, stroke.last.y, mid.x, mid.y);
      ctx.stroke();
      stroke.mid = mid;
      stroke.last = point;
    }
  }

  function onPointerEnd(event) {
    if (!stroke || event.pointerId !== stroke.id) return;
    applyBrush(ctx.lineWidth);
    ctx.beginPath();
    ctx.moveTo(stroke.mid.x, stroke.mid.y);
    ctx.lineTo(stroke.last.x, stroke.last.y);
    ctx.stroke();
    ctx.globalCompositeOperation = "source-over";
    stroke = null;
    draft.dirty = true;
    commitHistory();
    refreshInk();
  }

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerEnd);
  canvas.addEventListener("pointercancel", onPointerEnd);
  canvas.addEventListener("contextmenu", (event) => event.preventDefault());

  // ---------- Tool tray ----------

  function setTool(tool) {
    brush.tool = tool;
    setPressed($$(".tool"), (item) => item.dataset.tool === tool);
    canvas.classList.toggle("is-erasing", tool === "erase");
  }

  function buildTray() {
    const swatches = $("#swatches");
    COLORS.forEach((color) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "swatch";
      button.style.setProperty("--c", color.value);
      button.setAttribute("aria-label", color.name);
      button.dataset.color = color.name;
      button.addEventListener("click", () => {
        brush.color = color;
        $("#color-name").textContent = color.name;
        setPressed($$(".swatch"), (item) => item.dataset.color === color.name);
        setTool("draw");
      });
      swatches.append(button);
    });

    const sizes = $("#sizes");
    SIZES.forEach((size) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "size-btn";
      button.dataset.size = size.name;
      button.setAttribute("aria-label", `${size.name} brush`);
      button.innerHTML = `<i style="--d:${size.dot}px"></i><span>${size.name}</span>`;
      button.addEventListener("click", () => {
        brush.size = size;
        setPressed($$(".size-btn"), (item) => item.dataset.size === size.name);
      });
      sizes.append(button);
    });

    setPressed($$(".swatch"), (item) => item.dataset.color === brush.color.name);
    setPressed($$(".size-btn"), (item) => item.dataset.size === brush.size.name);
    $("#color-name").textContent = brush.color.name;
    $$(".tool").forEach((button) => button.addEventListener("click", () => setTool(button.dataset.tool)));
  }

  undoButton.addEventListener("click", () => stepHistory(-1));
  redoButton.addEventListener("click", () => stepHistory(1));

  $("#clear").addEventListener("click", async () => {
    if (!draft.hasInk) return;
    const ok = await confirmAsk({
      emoji: "🗑",
      title: "Clear the page?",
      text: "This wipes your whole drawing. You can press Undo to get it back.",
      ok: "Clear it",
      cancel: "Keep it",
    });
    if (!ok) return;
    clearCanvas();
    draft.dirty = true;
    commitHistory();
    refreshInk();
  });

  // ---------- Starting, opening, leaving ----------

  // Ask before throwing away a drawing that has not been saved.
  async function confirmLeave() {
    if (!draft.hasInk || !draft.dirty) return true;
    return confirmAsk({
      emoji: "🎨",
      title: "Your drawing isn't saved",
      text: "If you start something new, this drawing will disappear.",
      ok: "Start new",
      cancel: "Keep drawing",
    });
  }

  async function startNew() {
    if (!(await confirmLeave())) return;
    reset();
    go("draw");
  }

  // Put a saved character on the page so it can be edited, moved, or dressed.
  async function load(character) {
    const image = await painter.decode(character.art);
    clearCanvas();
    const scale = Math.min(1, CANVAS_W / image.width, CANVAS_H / image.height);
    const w = image.width * scale;
    const h = image.height * scale;
    ctx.drawImage(image, (CANVAS_W - w) / 2, (CANVAS_H - h) / 2, w, h);
    image.close?.();
    Object.assign(draft, {
      characterId: character.id,
      createdAt: character.createdAt,
      name: character.name,
      motion: character.motion || DEFAULT_MOTION,
      place: character.place || DEFAULT_PLACE,
      stickers: (character.stickers || []).map((sticker) => ({ ...sticker })),
      dirty: false,
    });
    resetHistory();
    refreshInk();
  }

  // The drawing cropped to just the ink (a canvas), or null when the page is blank.
  const art = () => painter.cropInk(canvas);

  $("#new-drawing").addEventListener("click", startNew);
  $("#gallery-new").addEventListener("click", startNew);
  $("#empty-new").addEventListener("click", startNew);

  $("#to-stage").addEventListener("click", () => {
    if (!draft.hasInk) {
      toast("Draw something first!");
      nudge($(".canvas-card"));
      return;
    }
    go("stage");
  });

  window.addEventListener("beforeunload", (event) => {
    if (draft.hasInk && draft.dirty) event.preventDefault();
  });

  register("draw", { title: "Draw" });

  buildTray();
  resetHistory();
  refreshInk();

  window.LSS.drawing = { draft, art, reset, load, confirmLeave, startNew };
})();
