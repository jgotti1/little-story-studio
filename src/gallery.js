"use strict";

// "My characters": open, dress, edit, and delete saved characters.
(() => {
  const { $, toast, confirmAsk, makeButton, register, go, db, scene: painter, drawing } = window.LSS;
  const { CANVAS_W, CANVAS_H } = window.LSS;

  const LEGACY_FLAG = "lss-legacy-imported";

  async function refreshCount() {
    try {
      $("#count").textContent = (await db.all("characters")).length;
    } catch (error) {
      console.error("Could not read saved characters", error);
    }
  }

  // Characters saved by the first version of the game were whole pages on a white background.
  // Crop each one down to the drawing, once, and keep it in the new database.
  async function importLegacy() {
    try {
      if (localStorage.getItem(LEGACY_FLAG)) return;
    } catch (error) {
      return;
    }
    try {
      const old = await db.readLegacy();
      const have = new Set((await db.all("characters")).map((character) => character.id));
      for (const record of old) {
        if (have.has(record.id) || !record.image) continue;
        const image = await painter.decode(record.image);
        const page = document.createElement("canvas");
        page.width = CANVAS_W;
        page.height = CANVAS_H;
        page.getContext("2d", { willReadFrequently: true }).drawImage(image, 0, 0, CANVAS_W, CANVAS_H);
        image.close?.();
        painter.whiteToTransparent(page);
        const crop = painter.cropInk(page);
        if (!crop) continue;
        const art = await new Promise((resolve) => crop.toBlob(resolve, "image/png"));
        await db.put("characters", {
          id: record.id,
          name: record.name,
          art,
          motion: record.motion,
          place: record.place,
          stickers: [],
          createdAt: record.createdAt,
          updatedAt: record.updatedAt,
        });
      }
      localStorage.setItem(LEGACY_FLAG, "1");
    } catch (error) {
      console.error("Could not carry over older characters", error);
    }
  }

  async function open(character, destination) {
    if (!(await drawing.confirmLeave())) return;
    try {
      await drawing.load(character);
    } catch (error) {
      console.error("Could not open character", error);
      toast("Hmm, that character wouldn't open.");
      return;
    }
    go(destination);
  }

  async function remove(character) {
    const ok = await confirmAsk({
      emoji: "🥺",
      title: `Say goodbye to ${character.name}?`,
      text: "This character will be gone for good. Stories that use it will lose it too.",
      ok: "Delete",
      cancel: "Keep",
    });
    if (!ok) return;
    try {
      await db.remove("characters", character.id);
      const { draft } = drawing;
      if (draft.characterId === character.id) {
        // Keep whatever is on the page, but it is no longer a saved character.
        draft.characterId = null;
        draft.createdAt = null;
        draft.dirty = draft.hasInk;
      }
      await render();
      toast(`${character.name} was deleted.`);
    } catch (error) {
      console.error("Could not delete character", error);
      toast("Hmm, that didn't delete. Try again.");
    }
  }

  async function render() {
    const list = $("#gallery");
    const empty = $("#gallery-empty");
    list.replaceChildren();

    let characters;
    try {
      characters = await db.all("characters");
    } catch (error) {
      console.error("Could not load gallery", error);
      empty.hidden = false;
      $("h2", empty).textContent = "Can't open your characters";
      $("p", empty).textContent = "This browser wouldn't let the game open its saved drawings.";
      $("button", empty).hidden = true;
      return;
    }

    $("button", empty).hidden = false;
    $("h2", empty).textContent = "No characters yet";
    $("p", empty).textContent = "Your first friend is waiting to be drawn.";
    empty.hidden = characters.length > 0;
    $("#count").textContent = characters.length;

    const arts = await painter.loadArts(characters);
    characters.forEach((character) => {
      const item = document.createElement("li");
      const card = document.createElement("article");
      card.className = "char-card card";

      const art = document.createElement("div");
      art.className = "char-art";
      const picture = document.createElement("canvas");
      picture.width = 400;
      picture.height = 300;
      picture.setAttribute("role", "img");
      picture.setAttribute("aria-label", `Drawing of ${character.name}`);
      if (arts.has(character.id)) painter.portrait(picture.getContext("2d"), 400, 300, arts.get(character.id));
      art.append(picture);

      const name = document.createElement("h2");
      name.className = "char-name";
      name.textContent = character.name;

      const actions = document.createElement("div");
      actions.className = "char-actions";
      actions.append(
        makeButton("▶ Watch it move", "btn primary small play", `Watch ${character.name} move`, () => open(character, "stage")),
        makeButton("👒 Dress up", "btn ghost small", `Dress up ${character.name}`, () => open(character, "dress")),
        makeButton("✏️ Edit", "btn ghost small", `Edit the drawing of ${character.name}`, () => open(character, "draw")),
        makeButton("🗑 Delete", "btn danger small del", `Delete ${character.name}`, () => remove(character)),
      );

      card.append(art, name, actions);
      item.append(card);
      list.append(item);
    });
  }

  register("characters", { title: "My characters", enter: render });

  window.LSS.refreshCount = refreshCount;
  window.LSS.importLegacy = importLegacy;
})();
