"use strict";

// "My videos": movies saved from stories, kept in this browser. They can be watched and
// deleted here and nowhere else; there is no download or share.
(() => {
  const { $, toast, confirmAsk, makeButton, formatTime, register, db } = window.LSS;

  const dialog = $("#video-dialog");
  const video = $("#video-el");
  let urls = [];
  let playingUrl = null;

  const megabytes = (bytes) => (bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : `${Math.max(1, Math.round(bytes / 1e6))} MB`);

  async function showStorage(videos) {
    const line = $("#video-storage");
    const used = videos.reduce((sum, item) => sum + (item.size || 0), 0);
    let text = videos.length ? `Your movies use about ${megabytes(used)} on this device.` : "";
    try {
      const { quota, usage } = await navigator.storage.estimate();
      if (quota) text = `${text ? `${text} ` : ""}This browser has room for about ${megabytes(Math.max(0, quota - usage))} more.`;
    } catch (error) {
      // Not every browser can say how much room is left.
    }
    line.textContent = text;
    line.hidden = !text;
  }

  async function render() {
    const list = $("#video-list");
    const empty = $("#videos-empty");
    urls.forEach((url) => URL.revokeObjectURL(url));
    urls = [];
    list.replaceChildren();

    let videos;
    try {
      videos = await db.all("videos");
    } catch (error) {
      console.error("Could not load videos", error);
      empty.hidden = false;
      return;
    }
    empty.hidden = videos.length > 0;
    showStorage(videos);

    videos.forEach((item) => {
      const li = document.createElement("li");
      const card = document.createElement("article");
      card.className = "char-card card";

      const art = document.createElement("button");
      art.type = "button";
      art.className = "char-art video-thumb";
      art.setAttribute("aria-label", `Watch ${item.name}`);
      if (item.thumb) {
        const url = URL.createObjectURL(item.thumb);
        urls.push(url);
        const image = document.createElement("img");
        image.src = url;
        image.alt = "";
        art.append(image);
      }
      const play = document.createElement("span");
      play.className = "video-play";
      play.setAttribute("aria-hidden", "true");
      play.textContent = "▶";
      art.append(play);
      art.addEventListener("click", () => watch(item));

      const name = document.createElement("h2");
      name.className = "char-name";
      name.textContent = item.name;
      const meta = document.createElement("p");
      meta.className = "char-meta";
      meta.textContent = `${formatTime(item.duration)} · ${new Date(item.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;

      const actions = document.createElement("div");
      actions.className = "char-actions";
      actions.append(
        makeButton("▶ Watch", "btn primary small", `Watch ${item.name}`, () => watch(item)),
        makeButton("🗑 Delete", "btn danger small", `Delete ${item.name}`, () => remove(item)),
      );
      card.append(art, name, meta, actions);
      li.append(card);
      list.append(li);
    });
  }

  function watch(item) {
    if (video.canPlayType(item.type.split(";")[0]) === "") {
      toast("This browser can't play that movie.");
      return;
    }
    playingUrl = URL.createObjectURL(item.blob);
    video.src = playingUrl;
    $("#video-title").textContent = item.name;
    dialog.showModal();
    video.play().catch(() => {});
  }

  // Movies recorded in the browser often don't say how long they are. Ask the player to find
  // the end once, so the seek bar works.
  video.addEventListener("loadedmetadata", () => {
    if (video.duration !== Infinity) return;
    video.currentTime = 1e101;
    video.addEventListener("timeupdate", () => { video.currentTime = 0; }, { once: true });
  });

  dialog.addEventListener("close", () => {
    video.pause();
    video.removeAttribute("src");
    video.load();
    if (playingUrl) URL.revokeObjectURL(playingUrl);
    playingUrl = null;
  });
  $("#video-close").addEventListener("click", () => dialog.close());
  // A tap on the dark area around the player closes it.
  dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); });

  async function remove(item) {
    const ok = await confirmAsk({
      emoji: "🥺",
      title: `Delete “${item.name}”?`,
      text: "This movie will be gone for good. The story it came from is still in My stories.",
      ok: "Delete",
      cancel: "Keep",
    });
    if (!ok) return;
    try {
      await db.remove("videos", item.id);
      await render();
      toast("Movie deleted.");
    } catch (error) {
      console.error("Could not delete video", error);
      toast("Hmm, that didn't delete. Try again.");
    }
  }

  register("videos", { title: "My videos", enter: render, leave: () => { if (dialog.open) dialog.close(); } });
})();
