"use strict";

// Music and sound effects for stories. Everything is made with the browser's own synthesizer
// (Web Audio), so there are no sound files. A movie recording picks up the same sound
// through a MediaStream destination.
(() => {
  const TAU = Math.PI * 2;
  const midi = (n) => 440 * 2 ** ((n - 69) / 12);

  // ---------- Music ----------

  // Each tune is 8 bars that loop. `prog` is the chord for each 2 bars (semitones above the key note),
  // `scale` the notes the melody may use (all of them sound good together).
  const MAJOR = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21];
  const MINOR = [0, 3, 5, 7, 10, 12, 15, 17, 19, 22];
  const SPOOKY = [0, 3, 5, 6, 7, 10, 12, 15, 17, 18];
  const chords = { maj: [0, 4, 7], min: [0, 3, 7] };

  const TRACKS = [
    { id: "happy", label: "Happy", icon: "😀", bpm: 120, key: 60, scale: MAJOR, seed: 7,
      prog: [["maj", 0], ["maj", 7], ["min", 9], ["maj", 5]],
      lead: { wave: "triangle", gain: 0.2, length: 0.9, chance: 0.8 }, arp: { wave: "sine", gain: 0.08 }, bass: { wave: "triangle", gain: 0.22, every: 2 }, drums: true },
    { id: "calm", label: "Calm", icon: "😌", bpm: 72, key: 60, scale: MAJOR, seed: 21,
      prog: [["maj", 0], ["maj", 5], ["min", 9], ["maj", 7]],
      lead: { wave: "sine", gain: 0.16, length: 1.7, chance: 0.5 }, arp: { wave: "sine", gain: 0.07 }, bass: { wave: "sine", gain: 0.2, every: 4 }, drums: false },
    { id: "adventure", label: "Adventure", icon: "🗺️", bpm: 138, key: 57, scale: MINOR, seed: 3,
      prog: [["min", 0], ["maj", 8], ["maj", 3], ["maj", 10]],
      lead: { wave: "square", gain: 0.07, length: 0.8, chance: 0.85 }, arp: { wave: "sawtooth", gain: 0.03 }, bass: { wave: "triangle", gain: 0.25, every: 1 }, drums: true },
    { id: "silly", label: "Silly", icon: "🤪", bpm: 150, key: 62, scale: MAJOR, seed: 11,
      prog: [["maj", 0], ["maj", 5], ["maj", 7], ["maj", 0]],
      lead: { wave: "square", gain: 0.06, length: 0.35, chance: 0.9 }, arp: null, bass: { wave: "triangle", gain: 0.25, every: 1 }, drums: true },
    { id: "spooky", label: "Spooky", icon: "👻", bpm: 84, key: 55, scale: SPOOKY, seed: 5,
      prog: [["min", 0], ["min", 8], ["min", 5], ["min", 7]],
      lead: { wave: "sine", gain: 0.16, length: 1.5, chance: 0.5 }, arp: { wave: "triangle", gain: 0.05 }, bass: { wave: "sine", gain: 0.24, every: 4 }, drums: false },
  ];

  function seeded(seed) {
    let state = seed;
    return () => {
      state = (state + 0x6d2b79f5) | 0;
      let value = Math.imul(state ^ (state >>> 15), 1 | state);
      value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
  }

  function tone(ctx, out, { at, length, freq, wave, gain, attack = 0.01, release = 0.06 }) {
    const osc = ctx.createOscillator();
    const level = ctx.createGain();
    osc.type = wave;
    osc.frequency.value = freq;
    level.gain.setValueAtTime(0, at);
    level.gain.linearRampToValueAtTime(gain, at + attack);
    level.gain.setValueAtTime(gain, at + Math.max(attack, length - release));
    level.gain.linearRampToValueAtTime(0, at + length);
    osc.connect(level).connect(out);
    osc.start(at);
    osc.stop(at + length + 0.02);
  }

  function noise(ctx, seconds) {
    const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * seconds), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < data.length; index += 1) data[index] = Math.random() * 2 - 1;
    return buffer;
  }

  function kick(ctx, out, at) {
    const osc = ctx.createOscillator();
    const level = ctx.createGain();
    osc.frequency.setValueAtTime(130, at);
    osc.frequency.exponentialRampToValueAtTime(45, at + 0.12);
    level.gain.setValueAtTime(0.4, at);
    level.gain.exponentialRampToValueAtTime(0.001, at + 0.16);
    osc.connect(level).connect(out);
    osc.start(at);
    osc.stop(at + 0.2);
  }

  function hat(ctx, out, at, hush) {
    const source = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const level = ctx.createGain();
    source.buffer = hat.buffer || (hat.buffer = noise(ctx, 0.06));
    filter.type = "highpass";
    filter.frequency.value = 7000;
    level.gain.setValueAtTime(0.05 * hush, at);
    level.gain.exponentialRampToValueAtTime(0.001, at + 0.05);
    source.connect(filter).connect(level).connect(out);
    source.start(at);
  }

  // One loop of a tune, drawn into an audio buffer ahead of time.
  async function renderTrack(track) {
    const beat = 60 / track.bpm;
    const seconds = 8 * 4 * beat;
    const Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const ctx = new Offline(1, Math.ceil(44100 * seconds), 44100);
    const out = ctx.createGain();
    out.connect(ctx.destination);
    const random = seeded(track.seed);
    hat.buffer = null;
    let step = 4;

    for (let bar = 0; bar < 8; bar += 1) {
      const [quality, root] = track.prog[Math.floor(bar / 2)];
      const start = bar * 4 * beat;
      const tones = chords[quality];

      // Bass
      for (let count = 0; count < 4; count += track.bass.every) {
        tone(ctx, out, { at: start + count * beat, length: beat * track.bass.every * 0.9, freq: midi(track.key - 12 + root), wave: track.bass.wave, gain: track.bass.gain });
      }
      // Arpeggio up the chord, eighth notes
      if (track.arp) {
        for (let eighth = 0; eighth < 8; eighth += 1) {
          const note = tones[[0, 1, 2, 1][eighth % 4]] + 12;
          tone(ctx, out, { at: start + eighth * beat * 0.5, length: beat * 0.45, freq: midi(track.key + root + note), wave: track.arp.wave, gain: track.arp.gain });
        }
      }
      // Melody: wanders up and down the scale
      for (let count = 0; count < 4; count += 1) {
        step = Math.max(0, Math.min(track.scale.length - 1, step + Math.floor(random() * 5) - 2));
        if (random() < track.lead.chance) {
          tone(ctx, out, { at: start + count * beat, length: beat * track.lead.length, freq: midi(track.key + 12 + track.scale[step]), wave: track.lead.wave, gain: track.lead.gain });
        }
      }
      // Drums
      if (track.drums) {
        kick(ctx, out, start);
        kick(ctx, out, start + 2 * beat);
        for (let eighth = 0; eighth < 8; eighth += 1) hat(ctx, out, start + eighth * beat * 0.5, eighth % 2 ? 1 : 0.5);
      }
    }
    return ctx.startRendering();
  }

  const trackBuffers = new Map();
  async function musicBuffer(id) {
    const track = TRACKS.find((item) => item.id === id);
    if (!track) return null;
    if (!trackBuffers.has(id)) trackBuffers.set(id, renderTrack(track));
    return trackBuffers.get(id);
  }

  // ---------- Sound effects ----------

  const EFFECTS = [
    { id: "pop", label: "Pop", icon: "🫧" },
    { id: "boing", label: "Boing", icon: "🪀" },
    { id: "whoosh", label: "Whoosh", icon: "💨" },
    { id: "ding", label: "Ding dong", icon: "🔔" },
    { id: "tada", label: "Ta-da!", icon: "🎉" },
    { id: "splash", label: "Splash", icon: "💦" },
    { id: "zap", label: "Zap", icon: "⚡" },
    { id: "sparkle", label: "Sparkle", icon: "✨" },
  ];

  function sweep(ctx, out, { at, from, to, length, wave = "sine", gain = 0.4 }) {
    const osc = ctx.createOscillator();
    const level = ctx.createGain();
    osc.type = wave;
    osc.frequency.setValueAtTime(from, at);
    osc.frequency.exponentialRampToValueAtTime(to, at + length);
    level.gain.setValueAtTime(gain, at);
    level.gain.exponentialRampToValueAtTime(0.001, at + length);
    osc.connect(level).connect(out);
    osc.start(at);
    osc.stop(at + length + 0.02);
  }

  function whooshOf(ctx, out, at, length, low, high, gain) {
    const source = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const level = ctx.createGain();
    source.buffer = noise(ctx, length);
    filter.type = "bandpass";
    filter.Q.value = 1.2;
    filter.frequency.setValueAtTime(low, at);
    filter.frequency.exponentialRampToValueAtTime(high, at + length / 2);
    filter.frequency.exponentialRampToValueAtTime(low, at + length);
    level.gain.setValueAtTime(0.001, at);
    level.gain.linearRampToValueAtTime(gain, at + length * 0.4);
    level.gain.linearRampToValueAtTime(0, at + length);
    source.connect(filter).connect(level).connect(out);
    source.start(at);
  }

  const EFFECT_PLAYERS = {
    pop: (ctx, out, at) => sweep(ctx, out, { at, from: 650, to: 140, length: 0.14, gain: 0.55 }),
    boing: (ctx, out, at) => {
      const osc = ctx.createOscillator();
      const level = ctx.createGain();
      osc.frequency.setValueAtTime(170, at);
      osc.frequency.exponentialRampToValueAtTime(520, at + 0.09);
      osc.frequency.exponentialRampToValueAtTime(190, at + 0.35);
      osc.frequency.exponentialRampToValueAtTime(330, at + 0.45);
      osc.frequency.exponentialRampToValueAtTime(220, at + 0.65);
      level.gain.setValueAtTime(0.45, at);
      level.gain.exponentialRampToValueAtTime(0.001, at + 0.7);
      osc.connect(level).connect(out);
      osc.start(at);
      osc.stop(at + 0.72);
    },
    whoosh: (ctx, out, at) => whooshOf(ctx, out, at, 0.9, 300, 3200, 0.5),
    ding: (ctx, out, at) => {
      [[0, 880], [0.4, 660]].forEach(([delay, freq]) => {
        tone(ctx, out, { at: at + delay, length: 1.1, freq, wave: "sine", gain: 0.3, attack: 0.005, release: 1 });
        tone(ctx, out, { at: at + delay, length: 0.7, freq: freq * 2.76, wave: "sine", gain: 0.08, attack: 0.005, release: 0.6 });
      });
    },
    tada: (ctx, out, at) => {
      [[0, 523], [0.11, 659], [0.22, 784]].forEach(([delay, freq]) => tone(ctx, out, { at: at + delay, length: 0.16, freq, wave: "square", gain: 0.11 }));
      [523, 659, 784, 1047].forEach((freq) => tone(ctx, out, { at: at + 0.36, length: 0.9, freq, wave: "triangle", gain: 0.16, release: 0.7 }));
    },
    splash: (ctx, out, at) => {
      whooshOf(ctx, out, at, 0.6, 500, 2200, 0.55);
      for (let drop = 0; drop < 5; drop += 1) sweep(ctx, out, { at: at + 0.1 + drop * 0.09, from: 500 + Math.random() * 500, to: 1400 + Math.random() * 600, length: 0.08, gain: 0.15 });
    },
    zap: (ctx, out, at) => sweep(ctx, out, { at, from: 1900, to: 90, length: 0.32, wave: "sawtooth", gain: 0.22 }),
    sparkle: (ctx, out, at) => {
      for (let blip = 0; blip < 9; blip += 1) {
        tone(ctx, out, { at: at + blip * 0.07, length: 0.16, freq: 1800 + ((blip * 5) % 7) * 330, wave: "sine", gain: 0.14, attack: 0.004 });
      }
    },
  };

  // ---------- Engine ----------

  // One sound engine plays (and, through `dest`, records) the sound for a run of a story.
  // It has to be made inside a tap, or Safari keeps it muted.
  function createEngine() {
    const Engine = window.AudioContext || window.webkitAudioContext;
    if (!Engine) return null;
    const ctx = new Engine();
    const master = ctx.createGain();
    const dest = ctx.createMediaStreamDestination();
    const musicLevel = ctx.createGain();
    master.gain.value = 0.9;
    musicLevel.connect(master);
    master.connect(ctx.destination);
    master.connect(dest);
    let source = null;

    const stopMusic = () => {
      try { source?.stop(); } catch (error) { /* already stopped */ }
      source = null;
    };

    return {
      dest,
      ready: () => ctx.resume(),
      suspend: () => ctx.suspend(),
      resume: () => ctx.resume(),
      loadMusic: (id) => musicBuffer(id),
      // Start a tune now; it loops, and fades out over the last second of `length` seconds.
      async startMusic(id, length) {
        stopMusic();
        const buffer = await musicBuffer(id);
        if (!buffer) return;
        source = ctx.createBufferSource();
        source.buffer = buffer;
        source.loop = true;
        source.connect(musicLevel);
        const now = ctx.currentTime;
        musicLevel.gain.cancelScheduledValues(now);
        musicLevel.gain.setValueAtTime(0.5, now);
        if (length) {
          musicLevel.gain.setValueAtTime(0.5, now + Math.max(0, length - 1.2));
          musicLevel.gain.linearRampToValueAtTime(0, now + length);
        }
        source.start(now);
      },
      stopMusic,
      effect(id) {
        EFFECT_PLAYERS[id]?.(ctx, master, ctx.currentTime + 0.02);
      },
      close() {
        stopMusic();
        ctx.close().catch(() => {});
      },
    };
  }

  // A short listen for the story builder, so a child can hear a choice before making it.
  let previewEngine = null;
  let previewTimer = 0;
  const preview = {
    async music(id) {
      preview.stop();
      previewEngine = createEngine();
      if (!previewEngine) return;
      previewEngine.ready();
      await previewEngine.startMusic(id, 10);
      previewTimer = setTimeout(preview.stop, 10000);
    },
    effect(id) {
      previewEngine ||= createEngine();
      previewEngine?.ready();
      previewEngine?.effect(id);
    },
    stop() {
      clearTimeout(previewTimer);
      previewEngine?.close();
      previewEngine = null;
    },
  };

  window.LSS.sound = { TRACKS, EFFECTS, createEngine, preview };
})();
