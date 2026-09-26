"use strict";

// Plays a story on a canvas, and can record that playback as a movie for My videos.
// Recording uses the browser's own MediaRecorder; if the browser can't record, the story
// still plays. Nothing leaves the device.
(() => {
  const { $, PLAY_W: W, PLAY_H: H, CARD_SECONDS } = window.LSS;
  const { toast, newId, register, go, db, scene: painter, sound } = window.LSS;

  const canvas = $("#player-canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");

  const canRecordMovie = Boolean(window.MediaRecorder && canvas.captureStream);
  const MOVIE_TYPES = [
    "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
    "video/mp4",
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];
  // A generous guess at how many bytes one second of movie takes, to check for room first.
  const BYTES_PER_SECOND = 450000;
  const FADE_SECONDS = 0.4;

  let story = null;
  let arts = new Map();
  let segments = [];
  let total = 0;
  let t = 0;
  let mode = "loading"; // loading | ready | playing | paused | ended | recording | saving
  let engine = null; // the sound engine: music, effects, and what gets recorded
  let recording = null; // { recorder, chunks, stream, type }
  let audioSeg = -1;
  let rafId = 0;
  let lastNow = 0;
  let token = 0;
  let savedThisRun = false;

  const storyTitle = () => story.name || "My story";

  // ---------- Timeline ----------

  function buildSegments() {
    const list = [{ type: "title", dur: CARD_SECONDS }];
    let before = null; // the scene shown just ahead, so characters can walk on from where it left them
    story.scenes.forEach((scene) => {
      const shown = scene.cast.some((entry) => arts.has(entry.id)) || scene.extras.length || scene.caption;
      if (!shown) return;
      list.push({ type: "scene", scene, composed: painter.compose(scene, arts, before), dur: painter.sceneSeconds(scene) });
      before = scene;
    });
    list.push({ type: "end", dur: CARD_SECONDS });

    let start = 0;
    list.forEach((segment, index) => {
      segment.start = start;
      segment.index = index;
      start += segment.dur;
    });
    segments = list;
    total = start;
  }

  const segmentAt = (time) => {
    for (let index = segments.length - 1; index >= 0; index -= 1) {
      if (time >= segments[index].start) return segments[index];
    }
    return segments[0];
  };

  // ---------- Painting ----------

  function paint() {
    const segment = segmentAt(t);
    const local = t - segment.start;
    if (segment.type === "scene") {
      painter.draw(ctx, W, H, segment.composed, local);
      const fade = 1 - local / FADE_SECONDS;
      if (fade > 0) {
        ctx.fillStyle = `rgba(255, 245, 225, ${fade})`;
        ctx.fillRect(0, 0, W, H);
      }
    } else if (segment.type === "title") {
      painter.drawCard(ctx, W, H, storyTitle(), "A Little Story Studio movie", local);
    } else {
      painter.drawCard(ctx, W, H, "The End", storyTitle(), local);
    }
    $("#progress-fill").style.width = `${Math.min(100, (t / total) * 100)}%`;
  }

  function frame(now) {
    rafId = requestAnimationFrame(frame);
    // A long gap (the tab was hidden) must not skip ahead through the story.
    const dt = Math.min(0.1, (now - lastNow) / 1000);
    lastNow = now;

    if (mode === "playing" || mode === "recording") {
      t += dt;
      if (t >= total) {
        t = total - 0.001;
        paint();
        finish();
        return;
      }
      const segment = segmentAt(t);
      if (segment.index !== audioSeg) {
        audioSeg = segment.index;
        if (segment.type === "scene" && segment.scene.sound !== "none") engine?.effect(segment.scene.sound);
      }
    }
    paint();
  }

  // ---------- Sound ----------

  // Called at the very start of a tap on Play or Save: Safari only lets sound start from inside a tap.
  async function prepareAudio() {
    const wanted = story.music !== "none" || story.scenes.some((scene) => scene.sound !== "none");
    if (!wanted) return;
    engine ||= sound.createEngine();
    if (!engine) return;
    engine.ready();
    if (story.music !== "none") await engine.loadMusic(story.music);
  }

  function startMusic() {
    if (engine && story.music !== "none") engine.startMusic(story.music, total);
  }

  function closeAudio() {
    engine?.close();
    engine = null;
  }

  // ---------- Modes and buttons ----------

  function setMode(next) {
    mode = next;
    const toggle = $("#pp-toggle");
    const labels = {
      loading: "Getting ready…",
      ready: "▶ Play",
      playing: "⏸ Pause",
      paused: "▶ Keep going",
      ended: "↺ Watch again",
      recording: "✖ Stop saving",
      saving: "Saving…",
    };
    toggle.textContent = labels[next];
    toggle.disabled = next === "loading" || next === "saving";

    const busy = next === "recording" || next === "saving" || next === "loading";
    $("#pp-restart").hidden = !(next === "playing" || next === "paused");
    const save = $("#pp-save");
    save.hidden = !canRecordMovie;
    save.disabled = busy;
    save.textContent = next === "recording" || next === "saving" ? "🔴 Saving your movie…" : "🎥 Save to My videos";

    const overlay = $("#player-overlay");
    overlay.hidden = !(next === "ready" || next === "paused" || next === "ended");
    overlay.textContent = next === "ended" ? "↺ Watch again" : next === "paused" ? "▶ Keep going" : "▶ Play";

    $("#player-badge").hidden = next !== "recording";
    $("#pp-note").textContent = next === "recording"
      ? "Keep this screen open until your movie is saved."
      : canRecordMovie
        ? "Saved movies live in My videos, only on this device."
        : "This browser can't save movies, but your story plays here any time.";
    if (next !== "ended" && next !== "recording") $("#pp-videos").hidden = true;
  }

  // ---------- Controls ----------

  async function begin(record) {
    if (mode === "loading" || mode === "saving") return;
    const mine = token;
    setMode("loading");
    await prepareAudio();
    if (mine !== token) return;

    engine?.stopMusic();
    buildSegments();
    t = 0;
    audioSeg = -1;
    savedThisRun = false;
    if (record && !(await startRecorder())) {
      t = 0;
      setMode("ready");
      return;
    }
    if (mine !== token) return;
    startMusic();
    setMode(record ? "recording" : "playing");
  }

  function toggle() {
    if (mode === "ready" || mode === "ended") begin(false);
    else if (mode === "playing") pause();
    else if (mode === "paused") resume();
    else if (mode === "recording") cancelRecording("Stopped. Your movie was not saved.");
  }

  function pause() {
    engine?.suspend();
    setMode("paused");
  }

  function resume() {
    engine?.resume();
    setMode("playing");
  }

  function restart() {
    engine?.resume();
    t = 0;
    audioSeg = -1;
    startMusic();
    setMode("playing");
  }

  function finish() {
    engine?.stopMusic();
    if (mode === "recording") finishRecording();
    else setMode("ended");
  }

  // ---------- Recording ----------

  async function startRecorder() {
    try {
      const { quota, usage } = await navigator.storage.estimate();
      if (quota && quota - usage < total * BYTES_PER_SECOND) {
        toast("There isn't enough room on this device for a new movie. Delete a video in My videos first.");
        return false;
      }
    } catch (error) {
      // Not every browser can say how much room is left. Try anyway.
    }

    try {
      const stream = canvas.captureStream(30);
      engine?.dest.stream.getAudioTracks().forEach((track) => stream.addTrack(track));
      const type = MediaRecorder.isTypeSupported ? MOVIE_TYPES.find((item) => MediaRecorder.isTypeSupported(item)) : undefined;
      const recorder = new MediaRecorder(stream, { ...(type ? { mimeType: type } : {}), videoBitsPerSecond: 2500000 });
      const chunks = [];
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      recorder.start(500);
      recording = { recorder, chunks, stream, type: recorder.mimeType || type || "video/webm" };
      return true;
    } catch (error) {
      console.error("Could not start recording", error);
      toast("This browser couldn't start saving a movie. You can still watch your story here.");
      return false;
    }
  }

  function cancelRecording(message) {
    if (!recording) return;
    const current = recording;
    recording = null;
    current.recorder.ondataavailable = null;
    if (current.recorder.state !== "inactive") current.recorder.stop();
    current.stream.getTracks().forEach((track) => track.stop());
    engine?.stopMusic();
    if (message) toast(message);
    t = 0;
    audioSeg = -1;
    setMode("ready");
  }

  function thumbnail() {
    const small = document.createElement("canvas");
    small.width = 400;
    small.height = 300;
    const first = segments.find((segment) => segment.type === "scene") || segments[0];
    if (first.type === "scene") painter.draw(small.getContext("2d"), 400, 300, first.composed, 0.5);
    else painter.drawCard(small.getContext("2d"), 400, 300, storyTitle(), "", 0);
    return new Promise((resolve) => small.toBlob(resolve, "image/jpeg", 0.8));
  }

  async function finishRecording() {
    const current = recording;
    recording = null;
    setMode("saving");
    const blob = await new Promise((resolve) => {
      current.recorder.onstop = () => resolve(new Blob(current.chunks, { type: current.type }));
      current.recorder.stop();
    });
    current.stream.getTracks().forEach((track) => track.stop());

    try {
      if (!blob.size) throw new Error("The recording came out empty.");
      const now = Date.now();
      await db.put("videos", {
        id: newId(),
        name: storyTitle(),
        storyId: story.id,
        blob,
        type: current.type,
        duration: total,
        size: blob.size,
        thumb: await thumbnail(),
        createdAt: now,
        updatedAt: now,
      });
      savedThisRun = true;
      if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
      toast("Your movie is saved! 🎬");
      $("#pp-videos").hidden = false;
    } catch (error) {
      console.error("Could not save movie", error);
      toast(error.name === "QuotaExceededError"
        ? "There isn't enough room to keep this movie. Delete a video in My videos and try again."
        : "Hmm, the movie didn't save. You can still watch your story here.");
    }
    setMode("ended");
    if (savedThisRun) $("#pp-videos").hidden = false;
  }

  // ---------- Screen ----------

  async function enter() {
    const mine = ++token;
    savedThisRun = false;
    t = 0;
    audioSeg = -1;
    engine = null;
    arts = new Map();
    $("#watch-title").textContent = storyTitle();
    $("#watch-back-label").textContent = api.from === "story" ? "Back to editing" : "My stories";
    setMode("loading");
    ctx.clearRect(0, 0, W, H);

    try {
      const wanted = new Set(story.scenes.flatMap((scene) => scene.cast.map((entry) => entry.id)));
      arts = await painter.loadArts((await db.all("characters")).filter((character) => wanted.has(character.id)));
    } catch (error) {
      console.error("Could not load characters", error);
    }
    if (mine !== token) return;

    buildSegments();
    if (segments.length < 3) {
      toast("This story has no scenes to show yet.");
      go(api.from === "story" ? "story" : "stories");
      return;
    }
    setMode("ready");
    lastNow = performance.now();
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(frame);
  }

  function leave() {
    token += 1;
    cancelAnimationFrame(rafId);
    if (recording) cancelRecording();
    closeAudio();
  }

  // Stop instead of skipping ahead when the screen is left; a movie being saved cannot go on
  // without being watched.
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden || !story) return;
    if (mode === "playing") pause();
    else if (mode === "recording") cancelRecording("Saving stopped because you left the screen. Try again and keep it open.");
  });

  $("#pp-toggle").addEventListener("click", toggle);
  $("#player-overlay").addEventListener("click", () => {
    if (mode === "paused") resume();
    else if (mode === "ready" || mode === "ended") begin(false);
  });
  $("#pp-restart").addEventListener("click", restart);
  $("#pp-save").addEventListener("click", () => begin(true));
  $("#pp-videos").addEventListener("click", () => go("videos"));
  $("#watch-back").addEventListener("click", () => go(api.from === "story" ? "story" : "stories"));

  register("watch", {
    title: "Watch your story",
    tab: "story",
    guard: () => (story ? null : "stories"),
    enter,
    leave,
  });

  const api = {
    from: "stories",
    open(nextStory, from) {
      story = nextStory;
      api.from = from;
      go("watch");
    },
  };
  window.LSS.play = api;
})();
