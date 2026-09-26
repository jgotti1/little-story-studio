"use strict";

// "My stories" and the story builder. A story is an ordered list of scenes; each scene has a
// place, one or two characters (who can walk in from where they stood in the last scene),
// pets and things, a move, a caption, and a sound effect. The story has one tune of music.
// Stories save themselves as they are edited.
(() => {
  const { $, $$, THEMES, MOTIONS, STILL, DEFAULT_MOTION, DEFAULT_PLACE, MAX_SCENES, MAX_CAPTION } = window.LSS;
  const { EXTRA_GROUPS, EXTRA_ANIMS, MAX_EXTRAS, EXTRA_MIN, EXTRA_MAX } = window.LSS;
  const { toast, setPressed, confirmAsk, makeButton, newId, register, go, db, scene: painter, sound } = window.LSS;

  const PREVIEW_W = 640;
  const PREVIEW_H = 480;
  const STORY_MOTIONS = [...MOTIONS, STILL];
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  const canvas = $("#story-canvas");
  const ctx = canvas.getContext("2d");
  const nameInput = $("#story-name");
  const captionInput = $("#caption");

  const state = {
    story: null,
    index: 0,
    characters: [],
    arts: new Map(),
    extraId: null, // the picked pet or thing in the current scene
    extraGroup: EXTRA_GROUPS[0].id,
  };
  let loopId = 0;
  let loopStart = 0;
  let saveTimer = 0;
  let stripTimer = 0;
  let enterToken = 0;

  const currentScene = () => state.story.scenes[state.index];
  const storyTitle = (story) => story.name || "My story";

  // A new scene carries on from the one before it: same place, pets and things, and characters,
  // but a single character stands on the other side, so they walk across when it starts.
  function blankScene(from) {
    return {
      id: newId(),
      place: from?.place || DEFAULT_PLACE,
      motion: from?.motion || DEFAULT_MOTION,
      cast: from ? from.cast.map((entry) => ({ id: entry.id, x: from.cast.length === 1 ? (entry.x < 0.5 ? 0.75 : 0.25) : entry.x })) : [],
      walk: Boolean(from),
      extras: from ? from.extras.map((extra) => ({ ...extra, id: newId() })) : [],
      caption: "",
      sound: "none",
    };
  }

  function newStory() {
    const now = Date.now();
    return { id: newId(), name: "", music: "none", scenes: [blankScene()], createdAt: now, updatedAt: now };
  }

  // Stories saved by earlier versions are brought up to date when they are loaded.
  function normalize(story) {
    story.music = story.music || "none";
    story.scenes.forEach((scene) => {
      scene.extras = scene.extras || [];
      scene.cast = scene.cast.map((entry, index, list) => (typeof entry === "string" ? { id: entry, x: list.length > 1 ? (index ? 0.7 : 0.3) : 0.5 } : entry));
      scene.walk = Boolean(scene.walk);
      scene.sound = scene.sound || "none";
      delete scene.narration;
      delete scene.narrationDur;
    });
    return story;
  }

  const composeAt = (story, index) => painter.compose(story.scenes[index], state.arts, story.scenes[index - 1]);

  // ---------- Saving ----------

  function setStatus(text) {
    $("#story-status").textContent = text;
  }

  const hasContent = (story) => story.scenes.some((scene) => scene.cast.length || scene.extras.length);

  async function persist() {
    clearTimeout(saveTimer);
    const story = state.story;
    if (!story) return;
    if (!hasContent(story)) {
      setStatus("Pick a character to begin");
      return;
    }
    story.name = nameInput.value.trim().slice(0, 30);
    story.updatedAt = Date.now();
    try {
      await db.put("stories", story);
      setStatus("Saved ✓");
      if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
    } catch (error) {
      console.error("Could not save story", error);
      setStatus("Not saved");
      toast("Hmm, that didn't save. This browser's storage might be full.");
    }
  }

  // Called after every edit.
  function changed() {
    setStatus("Saving…");
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persist, 600);
    clearTimeout(stripTimer);
    stripTimer = setTimeout(renderStrip, 120);
  }

  // ---------- Preview ----------

  function startPreview() {
    cancelAnimationFrame(loopId);
    loopStart = performance.now();
    const frame = (now) => {
      loopId = requestAnimationFrame(frame);
      const scene = currentScene();
      painter.draw(ctx, PREVIEW_W, PREVIEW_H, composeAt(state.story, state.index), reducedMotion.matches ? 3 : (now - loopStart) / 1000);
      const picked = scene.extras.find((extra) => extra.id === state.extraId);
      if (picked) {
        ctx.save();
        ctx.strokeStyle = "#5b3fe0";
        ctx.lineWidth = 4;
        ctx.setLineDash([10, 8]);
        ctx.strokeRect(picked.x * PREVIEW_W - picked.size * PREVIEW_W * 0.6, picked.y * PREVIEW_H - picked.size * PREVIEW_W * 0.6, picked.size * PREVIEW_W * 1.2, picked.size * PREVIEW_W * 1.2);
        ctx.restore();
      }
    };
    loopId = requestAnimationFrame(frame);
  }

  function stopPreview() {
    cancelAnimationFrame(loopId);
  }

  // Start the scene over, so a change (like where someone stands) can be watched from the beginning.
  const replay = () => { loopStart = performance.now(); };

  // ---------- Scene strip ----------

  function renderStrip() {
    const strip = $("#scene-strip");
    const scrolled = strip.scrollLeft;
    strip.replaceChildren();
    state.story.scenes.forEach((scene, index) => {
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "scene-chip";
      button.setAttribute("aria-pressed", String(index === state.index));
      button.setAttribute("aria-label", `Scene ${index + 1} of ${state.story.scenes.length}${scene.caption ? `: ${scene.caption}` : ""}`);

      const thumb = document.createElement("canvas");
      thumb.width = 200;
      thumb.height = 150;
      painter.draw(thumb.getContext("2d"), 200, 150, composeAt(state.story, index), 2.6);

      const number = document.createElement("span");
      number.className = "scene-num";
      number.textContent = index + 1;
      button.append(thumb, number);
      button.addEventListener("click", () => selectScene(index));
      item.append(button);
      strip.append(item);
    });
    // Keep the picked scene in view by scrolling the strip sideways only. Scrolling the whole
    // page here would jerk the screen away from whatever the child is typing or dragging.
    strip.scrollLeft = scrolled;
    const chip = $(".scene-chip[aria-pressed='true']", strip);
    if (chip) {
      const chipBox = chip.getBoundingClientRect();
      const stripBox = strip.getBoundingClientRect();
      if (chipBox.left < stripBox.left) strip.scrollLeft -= stripBox.left - chipBox.left + 8;
      else if (chipBox.right > stripBox.right) strip.scrollLeft += chipBox.right - stripBox.right + 8;
    }

    const last = state.story.scenes.length - 1;
    $("#scene-earlier").disabled = state.index === 0;
    $("#scene-later").disabled = state.index === last;
    $("#scene-remove").disabled = last === 0;
    $("#scene-add").disabled = last + 1 >= MAX_SCENES;
    $("#scene-copy").disabled = last + 1 >= MAX_SCENES;
    $("#scene-count").textContent = `${state.story.scenes.length} of ${MAX_SCENES} scenes`;
  }

  function selectScene(index) {
    if (index === state.index) return;
    state.index = index;
    state.extraId = null;
    renderStrip();
    renderPanels();
  }

  function addScene() {
    const scenes = state.story.scenes;
    if (scenes.length >= MAX_SCENES) return;
    scenes.splice(state.index + 1, 0, blankScene(currentScene()));
    state.index += 1;
    changed();
    renderStrip();
    renderPanels();
    captionInput.focus();
  }

  function copyScene() {
    const scenes = state.story.scenes;
    if (scenes.length >= MAX_SCENES) return;
    const scene = currentScene();
    scenes.splice(state.index + 1, 0, { ...scene, id: newId(), cast: scene.cast.map((entry) => ({ ...entry })), extras: scene.extras.map((extra) => ({ ...extra, id: newId() })) });
    state.index += 1;
    changed();
    renderStrip();
    renderPanels();
  }

  function moveScene(step) {
    const scenes = state.story.scenes;
    const target = state.index + step;
    if (target < 0 || target >= scenes.length) return;
    [scenes[state.index], scenes[target]] = [scenes[target], scenes[state.index]];
    state.index = target;
    changed();
    renderStrip();
    renderPanels();
    toast(`Scene moved to spot ${target + 1}.`);
  }

  async function removeScene() {
    const scene = currentScene();
    if (state.story.scenes.length < 2) return;
    if (scene.cast.length || scene.extras.length || scene.caption) {
      const ok = await confirmAsk({
        emoji: "🗑",
        title: `Remove scene ${state.index + 1}?`,
        text: "This scene will be gone from your story.",
        ok: "Remove it",
        cancel: "Keep it",
      });
      if (!ok) return;
    }
    state.story.scenes.splice(state.index, 1);
    state.index = Math.min(state.index, state.story.scenes.length - 1);
    changed();
    renderStrip();
    renderPanels();
  }

  $("#scene-earlier").addEventListener("click", () => moveScene(-1));
  $("#scene-later").addEventListener("click", () => moveScene(1));
  $("#scene-add").addEventListener("click", addScene);
  $("#scene-copy").addEventListener("click", copyScene);
  $("#scene-remove").addEventListener("click", removeScene);

  // ---------- Scene controls ----------

  function buildPickers() {
    const places = $("#story-places");
    Object.entries(THEMES).forEach(([id, theme]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "option";
      button.dataset.place = id;
      button.innerHTML = `<span class="o-icon" style="--a:${theme.skyTop};--b:${theme.hillF}" aria-hidden="true"></span><span>${theme.label}</span>`;
      button.addEventListener("click", () => {
        currentScene().place = id;
        changed();
        renderPanels();
      });
      places.append(button);
    });

    const motions = $("#story-motions");
    STORY_MOTIONS.forEach((motion) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "option";
      button.dataset.motion = motion.id;
      button.innerHTML = `<span class="o-icon" aria-hidden="true">${motion.icon}</span><span>${motion.label}</span>`;
      button.addEventListener("click", () => {
        currentScene().motion = motion.id;
        changed();
        renderPanels();
      });
      motions.append(button);
    });
  }

  function buildCharacterPicker() {
    const box = $("#pick-chars");
    box.replaceChildren();
    $("#pick-empty").hidden = state.characters.length > 0;
    state.characters.forEach((character) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "pick";
      button.dataset.id = character.id;

      const picture = document.createElement("canvas");
      picture.width = 160;
      picture.height = 120;
      picture.setAttribute("aria-hidden", "true");
      if (state.arts.has(character.id)) painter.portrait(picture.getContext("2d"), 160, 120, state.arts.get(character.id));

      const name = document.createElement("span");
      name.className = "pick-name";
      name.textContent = character.name;
      button.append(picture, name);
      button.addEventListener("click", () => toggleCharacter(character));
      box.append(button);
    });
  }

  function toggleCharacter(character) {
    const scene = currentScene();
    const at = scene.cast.findIndex((entry) => entry.id === character.id);
    if (at >= 0) {
      scene.cast.splice(at, 1);
    } else if (scene.cast.length >= 2) {
      toast("A scene can have 2 characters. Tap one to take it out first.");
      return;
    } else {
      // The first character in a scene brings their favorite move along.
      if (!scene.cast.length) scene.motion = character.motion || scene.motion;
      scene.cast.push({ id: character.id, x: 0.5 });
      if (scene.cast.length === 2) {
        scene.cast[0].x = 0.3;
        scene.cast[1].x = 0.7;
      }
    }
    changed();
    renderPanels();
  }

  function renderPanels() {
    const scene = currentScene();
    $("#scene-label").textContent = `Scene ${state.index + 1}`;
    if (document.activeElement !== captionInput) captionInput.value = scene.caption;
    $("#caption-count").textContent = `${scene.caption.length}/${MAX_CAPTION}`;
    setPressed($$("#story-places .option"), (item) => item.dataset.place === scene.place);
    setPressed($$("#story-motions .option"), (item) => item.dataset.motion === scene.motion);
    $$("#pick-chars .pick").forEach((button) => {
      const at = scene.cast.findIndex((entry) => entry.id === button.dataset.id);
      button.setAttribute("aria-pressed", String(at >= 0));
      button.classList.toggle("is-on", at >= 0);
      if (at >= 0) button.dataset.order = at + 1;
      else delete button.dataset.order;
    });
    $("#story-canvas-hint").hidden = scene.cast.length > 0 || scene.extras.length > 0;
    renderCast();
    renderExtras();
    renderMusic();
    renderSound();
    replay();
  }

  captionInput.addEventListener("input", () => {
    currentScene().caption = captionInput.value.slice(0, MAX_CAPTION);
    $("#caption-count").textContent = `${currentScene().caption.length}/${MAX_CAPTION}`;
    changed();
  });
  nameInput.addEventListener("input", changed);

  // ---------- Pets and things ----------

  const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
  const pickedExtra = () => currentScene().extras.find((extra) => extra.id === state.extraId);

  function buildExtraPalette() {
    const groups = $("#extra-groups");
    EXTRA_GROUPS.forEach((group) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "chip";
      button.dataset.group = group.id;
      button.textContent = group.label;
      button.addEventListener("click", () => showExtraGroup(group.id));
      groups.append(button);
    });

    const anims = $("#extra-anims");
    EXTRA_ANIMS.forEach((anim) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "option";
      button.dataset.anim = anim.id;
      button.innerHTML = `<span class="o-icon" aria-hidden="true">${anim.icon}</span><span>${anim.label}</span>`;
      button.addEventListener("click", () => changeExtra((extra) => { extra.anim = anim.id; }));
      anims.append(button);
    });
    showExtraGroup(state.extraGroup);
  }

  function showExtraGroup(id) {
    state.extraGroup = id;
    const group = EXTRA_GROUPS.find((item) => item.id === id);
    setPressed($$("#extra-groups .chip"), (item) => item.dataset.group === id);
    const items = $("#extra-items");
    items.replaceChildren();
    group.items.forEach(([glyph, name, anim, options]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "sticker-pick";
      button.textContent = glyph;
      button.setAttribute("aria-label", `Add ${name}`);
      button.addEventListener("click", () => addExtra({ glyph, name, anim, y: group.y, size: group.size, ...options }));
      items.append(button);
    });
  }

  const START_SPOTS = [0.2, 0.8, 0.35, 0.65, 0.5, 0.1];

  function addExtra(item) {
    const scene = currentScene();
    if (scene.extras.length >= MAX_EXTRAS) {
      toast(`That's a busy scene! ${MAX_EXTRAS} pets and things is the most.`);
      return;
    }
    const extra = { id: newId(), glyph: item.glyph, name: item.name, anim: item.anim, x: START_SPOTS[scene.extras.length % START_SPOTS.length], y: item.y, size: item.size };
    scene.extras.push(extra);
    state.extraId = extra.id;
    changed();
    renderPanels();
  }

  function changeExtra(change) {
    const extra = pickedExtra();
    if (!extra) return;
    change(extra);
    extra.size = clamp(extra.size, EXTRA_MIN, EXTRA_MAX);
    extra.x = clamp(extra.x, 0.03, 0.97);
    extra.y = clamp(extra.y, 0.05, 0.97);
    changed();
    renderExtras();
  }

  function renderExtras() {
    const scene = currentScene();
    if (!pickedExtra()) state.extraId = null;
    canvas.classList.toggle("has-extras", scene.extras.length > 0);

    const list = $("#extras-list");
    list.replaceChildren();
    scene.extras.forEach((extra) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "chip extra-chip";
      button.textContent = extra.glyph;
      button.setAttribute("aria-label", `${extra.name}${extra.id === state.extraId ? ", picked" : ""}`);
      button.setAttribute("aria-pressed", String(extra.id === state.extraId));
      button.classList.toggle("is-on", extra.id === state.extraId);
      button.addEventListener("click", () => {
        state.extraId = state.extraId === extra.id ? null : extra.id;
        renderExtras();
      });
      list.append(button);
    });
    $("#extras-none").hidden = scene.extras.length > 0;

    const picked = pickedExtra();
    $("#extra-tools").hidden = !picked;
    if (picked) {
      $("#extra-picked").textContent = `${picked.name} is picked. Drag it in the picture to move it.`;
      setPressed($$("#extra-anims .option"), (item) => item.dataset.anim === picked.anim);
    }
  }

  $("#extra-smaller").addEventListener("click", () => changeExtra((extra) => { extra.size *= 0.85; }));
  $("#extra-bigger").addEventListener("click", () => changeExtra((extra) => { extra.size *= 1.18; }));
  $("#extra-remove").addEventListener("click", () => {
    const scene = currentScene();
    scene.extras = scene.extras.filter((extra) => extra.id !== state.extraId);
    state.extraId = null;
    changed();
    renderPanels();
    $("#extra-items button")?.focus();
  });

  // Drag a pet or thing in the picture. The one drawn last is on top, so it is grabbed first.
  let extraDrag = null;
  const spot = (event) => {
    const bounds = canvas.getBoundingClientRect();
    return { x: ((event.clientX - bounds.left) / bounds.width) * PREVIEW_W, y: ((event.clientY - bounds.top) / bounds.height) * PREVIEW_H };
  };

  canvas.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const scene = currentScene();
    const at = spot(event);
    const hit = [...scene.extras].reverse().find((extra) => Math.hypot(at.x - extra.x * PREVIEW_W, at.y - extra.y * PREVIEW_H) < extra.size * PREVIEW_W * 0.7);
    if (!hit) {
      if (state.extraId) { state.extraId = null; renderExtras(); }
      return;
    }
    event.preventDefault();
    state.extraId = hit.id;
    scene.extras = [...scene.extras.filter((extra) => extra !== hit), hit];
    canvas.setPointerCapture(event.pointerId);
    extraDrag = { id: event.pointerId, extra: hit, dx: at.x - hit.x * PREVIEW_W, dy: at.y - hit.y * PREVIEW_H };
    renderExtras();
  });

  canvas.addEventListener("pointermove", (event) => {
    if (!extraDrag || event.pointerId !== extraDrag.id) return;
    const at = spot(event);
    extraDrag.extra.x = clamp((at.x - extraDrag.dx) / PREVIEW_W, 0.03, 0.97);
    extraDrag.extra.y = clamp((at.y - extraDrag.dy) / PREVIEW_H, 0.05, 0.97);
  });

  const endExtraDrag = (event) => {
    if (!extraDrag || event.pointerId !== extraDrag.id) return;
    extraDrag = null;
    changed();
  };
  canvas.addEventListener("pointerup", endExtraDrag);
  canvas.addEventListener("pointercancel", endExtraDrag);

  // The same without a pointer: arrow keys move the picked one, plus and minus resize it.
  canvas.addEventListener("keydown", (event) => {
    if (!pickedExtra()) return;
    const step = 0.02;
    const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (moves[event.key]) {
      event.preventDefault();
      changeExtra((extra) => { extra.x += moves[event.key][0]; extra.y += moves[event.key][1]; });
    } else if (event.key === "+" || event.key === "=") {
      changeExtra((extra) => { extra.size *= 1.1; });
    } else if (event.key === "-") {
      changeExtra((extra) => { extra.size *= 0.9; });
    } else if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      $("#extra-remove").click();
    }
  });

  // ---------- Where characters stand, and walking ----------

  function renderCast() {
    const scene = currentScene();
    const box = $("#cast-spots");
    box.replaceChildren();
    scene.cast.forEach((entry) => {
      const name = state.characters.find((character) => character.id === entry.id)?.name || "Your character";
      const row = document.createElement("label");
      row.className = "spot-row";
      const label = document.createElement("span");
      label.textContent = `${name} stands`;
      const slider = document.createElement("input");
      slider.type = "range";
      slider.min = "15";
      slider.max = "85";
      slider.value = Math.round(entry.x * 100);
      slider.setAttribute("aria-label", `Where ${name} stands, from the left side to the right side`);
      slider.addEventListener("input", () => { entry.x = clamp(slider.value / 100, 0.15, 0.85); changed(); });
      slider.addEventListener("change", replay);
      row.append(label, slider);
      box.append(row);
    });
    $("#spots").hidden = scene.cast.length === 0;

    $("#walk-toggle").setAttribute("aria-pressed", String(scene.walk));
    $("#walk-toggle").classList.toggle("is-on", scene.walk);
    $("#walk-note").textContent = !scene.walk
      ? "Characters are just standing there when the scene starts."
      : state.index === 0
        ? "Characters walk in from the side when the scene starts."
        : "Characters walk here from where they stood in the last scene.";
  }

  $("#walk-toggle").addEventListener("click", () => {
    const scene = currentScene();
    scene.walk = !scene.walk;
    changed();
    renderCast();
    replay();
  });

  // ---------- Music and sound ----------

  function buildSoundPickers() {
    const music = $("#music-options");
    [{ id: "none", label: "No music", icon: "🔇" }, ...sound.TRACKS].forEach((track) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "chip";
      button.dataset.music = track.id;
      button.textContent = `${track.icon} ${track.label}`;
      button.addEventListener("click", () => {
        state.story.music = track.id;
        changed();
        renderMusic();
        if (track.id === "none") sound.preview.stop();
        else sound.preview.music(track.id);
      });
      music.append(button);
    });

    const effects = $("#sound-options");
    [{ id: "none", label: "No sound", icon: "🔇" }, ...sound.EFFECTS].forEach((effect) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "option";
      button.dataset.sound = effect.id;
      button.innerHTML = `<span class="o-icon" aria-hidden="true">${effect.icon}</span><span>${effect.label}</span>`;
      button.addEventListener("click", () => {
        currentScene().sound = effect.id;
        changed();
        renderSound();
        if (effect.id !== "none") sound.preview.effect(effect.id);
      });
      effects.append(button);
    });
  }

  function renderMusic() {
    setPressed($$("#music-options .chip"), (item) => item.dataset.music === state.story.music);
  }

  function renderSound() {
    setPressed($$("#sound-options .option"), (item) => item.dataset.sound === currentScene().sound);
  }

  // ---------- Screens ----------

  function openStory(story) {
    state.story = normalize(story);
    state.index = 0;
    go("story");
  }

  async function enterEditor() {
    const token = ++enterToken;
    nameInput.value = state.story.name;
    setStatus(hasContent(state.story) ? "Saved ✓" : "Pick a character to begin");

    try {
      state.characters = (await db.all("characters")).reverse();
      state.arts = await painter.loadArts(state.characters);
    } catch (error) {
      console.error("Could not load characters", error);
      state.characters = [];
      state.arts = new Map();
    }
    if (token !== enterToken) return;

    // Characters deleted since this story was made just leave their scenes.
    state.story.scenes.forEach((scene) => {
      scene.cast = scene.cast.filter((entry) => state.arts.has(entry.id));
    });
    state.extraId = null;
    buildCharacterPicker();
    renderStrip();
    renderPanels();
    startPreview();
  }

  function leaveEditor() {
    enterToken += 1;
    stopPreview();
    sound.preview.stop();
    clearTimeout(stripTimer);
    persist();
  }

  register("story", {
    title: "Build a story",
    tab: "story",
    guard: () => (state.story ? null : "stories"),
    enter: enterEditor,
    leave: leaveEditor,
  });

  $("#story-back").addEventListener("click", () => go("stories"));
  $("#story-watch").addEventListener("click", async () => {
    if (!hasContent(state.story)) {
      toast("Pick a character for a scene first!");
      return;
    }
    await persist();
    window.LSS.play.open(state.story, "story");
  });

  // ---------- Story list ----------

  async function renderStories() {
    const list = $("#story-list");
    const empty = $("#stories-empty");
    list.replaceChildren();

    let stories;
    let arts;
    try {
      const characters = await db.all("characters");
      stories = await db.all("stories");
      arts = await painter.loadArts(characters);
    } catch (error) {
      console.error("Could not load stories", error);
      empty.hidden = false;
      return;
    }
    empty.hidden = stories.length > 0;

    stories.forEach((story) => {
      normalize(story);
      const item = document.createElement("li");
      const card = document.createElement("article");
      card.className = "char-card card";

      const art = document.createElement("div");
      art.className = "char-art is-scene";
      const thumb = document.createElement("canvas");
      thumb.width = 400;
      thumb.height = 300;
      thumb.setAttribute("role", "img");
      thumb.setAttribute("aria-label", `First scene of ${storyTitle(story)}`);
      const firstAt = Math.max(0, story.scenes.findIndex((scene) => scene.cast.some((entry) => arts.has(entry.id))));
      painter.draw(thumb.getContext("2d"), 400, 300, painter.compose(story.scenes[firstAt], arts, story.scenes[firstAt - 1]), 2.6);
      art.append(thumb);

      const name = document.createElement("h2");
      name.className = "char-name";
      name.textContent = storyTitle(story);
      const meta = document.createElement("p");
      meta.className = "char-meta";
      meta.textContent = `${story.scenes.length} ${story.scenes.length === 1 ? "scene" : "scenes"}`;

      const actions = document.createElement("div");
      actions.className = "char-actions";
      actions.append(
        makeButton("▶ Watch it", "btn primary small play", `Watch ${storyTitle(story)}`, () => window.LSS.play.open(story, "stories")),
        makeButton("✏️ Edit", "btn ghost small", `Edit ${storyTitle(story)}`, () => openStory(story)),
        makeButton("🗑 Delete", "btn danger small", `Delete ${storyTitle(story)}`, () => removeStory(story)),
      );
      card.append(art, name, meta, actions);
      item.append(card);
      list.append(item);
    });
  }

  async function removeStory(story) {
    const ok = await confirmAsk({
      emoji: "🥺",
      title: `Delete “${storyTitle(story)}”?`,
      text: "This story will be gone for good. Movies you saved from it stay in My videos.",
      ok: "Delete",
      cancel: "Keep",
    });
    if (!ok) return;
    try {
      await db.remove("stories", story.id);
      await renderStories();
      toast("Story deleted.");
    } catch (error) {
      console.error("Could not delete story", error);
      toast("Hmm, that didn't delete. Try again.");
    }
  }

  function startNewStory() {
    openStory(newStory());
  }

  register("stories", { title: "My stories", tab: "story", enter: renderStories });
  $("#story-new").addEventListener("click", startNewStory);
  $("#stories-empty-new").addEventListener("click", startNewStory);

  buildPickers();
  buildExtraPalette();
  buildSoundPickers();
  window.LSS.story = { open: openStory, current: () => state.story, normalize };
})();
