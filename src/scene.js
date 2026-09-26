"use strict";

// The scene painter. Stories play (and get recorded) on a <canvas>, so this file draws a
// whole scene (sky, hills, characters with their stickers, caption) for any moment in time.
// The stage on the "Bring it to life" screen is HTML/CSS and reads the same THEMES.
(() => {
  const { THEMES, SCENERY } = window.LSS;
  const TAU = Math.PI * 2;

  // The character sits in a box on the stage: 56% wide and 68% tall, on a 4:3 stage.
  const STAGE_BOX_AR = (0.56 * 4) / (0.68 * 3);

  const paths = {};
  const path = (key, data) => (paths[key] ||= new Path2D(data));

  const ease = (x) => 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, x)));

  // ---------- Motions ----------
  // Where a character is at time t: x/y as a fraction of its own width/height, rotation in
  // radians, squash/stretch, and how big its shadow is. These mirror the CSS animations.
  const REST = { x: 0, y: 0, rot: 0, sx: 1, sy: 1, shadow: 1 };
  const deg = (value) => (value * Math.PI) / 180;

  const MOTION_AT = {
    still: () => REST,
    wiggle: (t) => ({ ...REST, rot: deg(-7) * Math.cos((TAU * t) / 0.9) }),
    bounce: (t) => {
      const p = (t % 0.8) / 0.8;
      const lift = p < 0.45 ? Math.sin((p / 0.45) * (Math.PI / 2)) : p < 0.55 ? 1 : Math.cos(((p - 0.55) / 0.45) * (Math.PI / 2));
      return { ...REST, y: -0.16 * lift, sx: 1.06 - 0.1 * lift, sy: 0.92 + 0.13 * lift, shadow: 1 - 0.4 * lift };
    },
    twirl: (t) => {
      const p = (t % 2.4) / 2.4;
      if (p >= 0.35) return REST;
      const e = ease(p / 0.35);
      return { ...REST, y: -0.08 * Math.sin(Math.PI * e), sx: Math.cos(TAU * e) };
    },
    glide: (t) => {
      const cycle = (t / 3.6) % 2;
      const u = ease(cycle < 1 ? cycle : 2 - cycle);
      return { ...REST, x: -0.38 + 0.76 * u, y: -0.03 * Math.sin(Math.PI * u), rot: deg(-3 + 5 * Math.sin(Math.PI * u)) };
    },
    float: (t) => {
      const wave = 0.5 - 0.5 * Math.cos((TAU * t) / 3);
      return { ...REST, y: -0.02 - 0.12 * wave, rot: deg(-2) * Math.cos((TAU * t) / 3), shadow: 1 - 0.3 * wave };
    },
  };
  const motionAt = (id, t) => (MOTION_AT[id] || MOTION_AT.still)(t);

  // Walking rocks side to side with a little hop on each step. `amount` fades it out on arrival.
  const walkAt = (t, amount) => ({
    ...REST,
    y: -0.035 * Math.abs(Math.sin(TAU * t * 1.6)) * amount,
    rot: deg(5) * Math.sin(TAU * t * 1.6) * amount,
  });

  // How long a walk from one spot to another takes (positions are fractions of the scene's width).
  const walkSeconds = (from, to) => Math.min(2.4, 0.7 + Math.abs(to - from) * 2.2);

  // ---------- Pets and things ----------
  // Where a pet or object is at time t: x and y as a fraction of its size, rotation in radians,
  // and how much it squashes. "Sway" and "hop" pivot from the ground, the rest from the middle.
  const EXTRA_REST = { x: 0, y: 0, rot: 0, sx: 1, sy: 1 };
  const EXTRA_ANIM = {
    still: () => EXTRA_REST,
    hop: (t) => {
      const lift = Math.abs(Math.sin(Math.PI * ((t % 1.1) / 1.1)));
      return { ...EXTRA_REST, y: -0.55 * lift, sx: 1.08 - 0.1 * lift, sy: 0.92 + 0.12 * lift };
    },
    wiggle: (t) => ({ ...EXTRA_REST, rot: deg(11) * Math.sin((TAU * t) / 0.8) }),
    spin: (t) => ({ ...EXTRA_REST, rot: (TAU * t) / 4 }),
    float: (t) => ({ ...EXTRA_REST, y: -0.18 * (0.5 - 0.5 * Math.cos((TAU * t) / 3)), rot: deg(4) * Math.sin((TAU * t) / 3) }),
    sway: (t) => ({ ...EXTRA_REST, rot: deg(9) * Math.sin((TAU * t) / 2.4) }),
    pulse: (t) => ({ ...EXTRA_REST, sx: 1 + 0.1 * Math.sin((TAU * t) / 1.2), sy: 1 + 0.1 * Math.sin((TAU * t) / 1.2) }),
    slide: (t) => {
      const cycle = (t / 4) % 2;
      return { ...EXTRA_REST, x: -1.3 + 2.6 * ease(cycle < 1 ? cycle : 2 - cycle) };
    },
  };
  const PIVOT_AT_BASE = new Set(["sway", "hop"]);

  function drawExtras(ctx, W, H, extras, t) {
    ctx.fillStyle = "#000"; // emoji take their opacity from the fill
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    extras.forEach((extra) => {
      const px = extra.size * W;
      const move = (EXTRA_ANIM[extra.anim] || EXTRA_ANIM.still)(t);
      const base = PIVOT_AT_BASE.has(extra.anim) ? px * 0.45 : 0;
      ctx.save();
      ctx.translate(extra.x * W + move.x * px, extra.y * H + move.y * px);
      ctx.translate(0, base);
      ctx.rotate(move.rot);
      ctx.scale(move.sx, move.sy);
      ctx.translate(0, -base);
      ctx.font = `${px}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
      ctx.fillText(extra.glyph, 0, 0);
      ctx.restore();
    });
  }

  // ---------- Fitting images into the character box ----------

  function fit(aspect, boxW, boxH) {
    return aspect >= boxW / boxH ? { w: boxW, h: boxW / aspect } : { w: boxH * aspect, h: boxH };
  }

  // The same fit, as percentages of the stage's character box (for the HTML stage).
  function fitPercent(aspect) {
    return aspect >= STAGE_BOX_AR
      ? { w: 100, h: (STAGE_BOX_AR / aspect) * 100 }
      : { w: (aspect / STAGE_BOX_AR) * 100, h: 100 };
  }

  function applyTheme(element, id) {
    const theme = THEMES[id] || THEMES.meadow;
    const set = (name, value) => element.style.setProperty(name, value);
    set("--sky-top", theme.skyTop);
    set("--sky-bot", theme.skyBot);
    set("--orb", theme.orb);
    set("--orb-glow", theme.glow);
    set("--ox", `${theme.ox}px`);
    set("--oy", `${theme.oy}px`);
    set("--os", theme.os);
    set("--hill-b", theme.hillB);
    set("--hill-f", theme.hillF);
    set("--stars", theme.stars);
    set("--clouds", theme.clouds);
    set("--cloud", theme.cloud);
    set("--sea", theme.sea);
    set("--back", theme.back);
  }

  // ---------- Painting ----------

  function drawCloud(ctx, x, y, scale) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.beginPath();
    [[0, 0, 26], [34, -14, 34], [72, 0, 26]].forEach(([cx, cy, r]) => {
      ctx.moveTo(cx + r, cy);
      ctx.arc(cx, cy, r, 0, TAU);
    });
    ctx.rect(-26, 0, 124, 26);
    ctx.fill();
    ctx.restore();
  }

  function drawBackground(ctx, W, H, theme, t) {
    const k = W / 800;
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, theme.skyTop);
    sky.addColorStop(1, theme.skyBot);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    if (theme.stars) {
      ctx.fillStyle = "#fff";
      SCENERY.stars.forEach(([x, y, r], index) => {
        ctx.globalAlpha = theme.stars * (0.25 + 0.75 * (0.5 + 0.5 * Math.sin(t * 2.6 + index * 1.7)));
        ctx.beginPath();
        ctx.arc(x * k, y * k, r * k, 0, TAU);
        ctx.fill();
      });
      ctx.globalAlpha = 1;
    }

    ctx.save();
    ctx.translate(theme.ox * k, theme.oy * k);
    ctx.scale(theme.os * k, theme.os * k);
    ctx.fillStyle = theme.glow;
    ctx.beginPath();
    ctx.arc(0, 0, 92, 0, TAU);
    ctx.fill();
    ctx.fillStyle = theme.orb;
    ctx.beginPath();
    ctx.arc(0, 0, 58, 0, TAU);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = theme.clouds;
    ctx.fillStyle = theme.cloud;
    const drift = (period) => 0.5 - 0.5 * Math.cos((TAU * t) / (period * 2));
    drawCloud(ctx, (90 + 200 * drift(26)) * k, 110 * k, k);
    drawCloud(ctx, (430 + 300 * drift(32)) * k, 70 * k, k * 0.8);
    ctx.restore();

    ctx.save();
    ctx.scale(k, k);
    if (theme.sea) {
      ctx.fillStyle = SCENERY.seaColor;
      ctx.fill(path("sea", SCENERY.sea));
      ctx.save();
      ctx.globalAlpha = 0.8;
      ctx.translate(-40 * (0.5 - 0.5 * Math.cos((TAU * t) / 3)), 0);
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 5;
      ctx.lineCap = "round";
      ctx.stroke(path("foam", SCENERY.foam));
      ctx.restore();
    }
    if (theme.back) {
      ctx.fillStyle = theme.hillB;
      ctx.fill(path("hillBack", SCENERY.hillBack));
    }
    ctx.fillStyle = theme.hillF;
    ctx.fill(path("hillFront", SCENERY.hillFront));
    ctx.restore();
  }

  // Stickers are placed on the drawing (fractions of its width and height) and sized against
  // its longer side. The origin is the bottom-center of the drawing.
  function drawStickers(ctx, stickers, w, h) {
    ctx.fillStyle = "#000"; // emoji take their opacity from the fill, and the shadow just before was see-through
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    (stickers || []).forEach((sticker) => {
      ctx.save();
      ctx.translate(-w / 2 + sticker.x * w, -h + sticker.y * h);
      ctx.rotate(deg(sticker.rot || 0));
      ctx.font = `${sticker.size * Math.max(w, h)}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
      ctx.fillText(sticker.glyph, 0, 0);
      ctx.restore();
    });
  }

  // One character (or two, side by side) standing on the ground, doing their move.
  // `top` is where the caption ends (0 for none). Characters shrink to stay clear of it, with
  // room left over for a hat and for the move (a bounce lifts them a good way up).
  function drawCast(ctx, W, H, cast, motion, t, top) {
    const slots = cast.length > 1
      ? [{ cx: 0.3, boxW: 0.4, boxH: 0.62 }, { cx: 0.7, boxW: 0.4, boxH: 0.62 }]
      : [{ cx: 0.5, boxW: 0.56, boxH: 0.68 }];
    const baseY = H * 0.89;

    cast.slice(0, 2).forEach((member, index) => {
      if (!member) return;
      const slot = slots[index];
      const boxW = slot.boxW * W;
      const spot = member.x ?? slot.cx;
      const room = top ? Math.min(slot.boxH * H, (baseY - top - 0.03 * H) / 1.25) : slot.boxH * H;
      const { w, h } = fit(member.ar, boxW, room);
      let move = motionAt(motion, t + index * 0.35);
      let standAt = spot;
      // Walk in from where this character stood in the last scene (or from the edge of the picture).
      if (member.fromX != null && Math.abs(spot - member.fromX) > 0.02) {
        const seconds = walkSeconds(member.fromX, spot);
        if (t < seconds) {
          standAt = member.fromX + (spot - member.fromX) * ease(t / seconds);
          move = walkAt(t, Math.min(1, (seconds - t) / 0.25));
        }
      }
      const cx = standAt * W + move.x * w;

      ctx.fillStyle = "rgba(42, 34, 80, 0.28)";
      ctx.beginPath();
      ctx.ellipse(cx, baseY, boxW * 0.29 * move.shadow, H * 0.03 * move.shadow, 0, 0, TAU);
      ctx.fill();

      ctx.save();
      ctx.translate(cx, baseY + move.y * h);
      ctx.rotate(move.rot);
      ctx.scale(move.sx, move.sy);
      ctx.drawImage(member.img, -w / 2, -h, w, h);
      drawStickers(ctx, member.stickers, w, h);
      ctx.restore();
    });
  }

  function wrapLines(ctx, text, maxWidth) {
    const lines = [];
    let line = "";
    text.split(/\s+/).filter(Boolean).forEach((word) => {
      const trial = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(trial).width > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = trial;
      }
    });
    if (line) lines.push(line);
    return lines;
  }

  // Work out the caption's box. Null when there are no words.
  function captionLayout(ctx, W, H, text) {
    if (!text) return null;
    const size = Math.round(W * 0.042);
    ctx.font = `800 ${size}px ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", system-ui, sans-serif`;
    const lines = wrapLines(ctx, text, W * 0.8);
    const lineHeight = size * 1.3;
    const boxW = Math.min(W * 0.92, Math.max(...lines.map((line) => ctx.measureText(line).width)) + size * 1.6);
    const boxH = lines.length * lineHeight + size * 0.9;
    return { size, lines, lineHeight, boxW, boxH, x: (W - boxW) / 2, y: H * 0.04 };
  }

  function drawCaption(ctx, W, layout) {
    if (!layout) return;
    const { size, lines, lineHeight, boxW, boxH, x, y } = layout;
    ctx.save();
    ctx.font = `800 ${size}px ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#2a2250";
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(x, y + 5, boxW, boxH, size * 0.6) : ctx.rect(x, y + 5, boxW, boxH);
    ctx.fill();
    ctx.fillStyle = "#fffdf8";
    ctx.strokeStyle = "#2a2250";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(x, y, boxW, boxH, size * 0.6) : ctx.rect(x, y, boxW, boxH);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#2a2250";
    lines.forEach((line, index) => ctx.fillText(line, W / 2, y + size * 0.45 + lineHeight * (index + 0.5)));
    ctx.restore();
  }

  // A character on its own (no scenery), for the gallery and the story picker.
  function portrait(ctx, W, H, member) {
    ctx.clearRect(0, 0, W, H);
    const { w, h } = fit(member.ar, W * 0.84, H * 0.84);
    ctx.save();
    ctx.translate(W / 2, H * 0.92);
    ctx.drawImage(member.img, -w / 2, -h, w, h);
    drawStickers(ctx, member.stickers, w, h);
    ctx.restore();
  }

  // The title card at the start of a movie and "The End" at the finish.
  function drawCard(ctx, W, H, title, subtitle, t) {
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, "#e6deff");
    sky.addColorStop(1, "#fff5e1");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#2a2250";
    const family = 'ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", system-ui, sans-serif';
    const size = Math.round(W * 0.085);
    ctx.font = `900 ${size}px ${family}`;
    const lines = wrapLines(ctx, title, W * 0.8).slice(0, 3);
    lines.forEach((line, index) => ctx.fillText(line, W / 2, H * 0.44 + (index - (lines.length - 1) / 2) * size * 1.15));
    if (subtitle) {
      ctx.font = `800 ${Math.round(W * 0.038)}px ${family}`;
      ctx.fillStyle = "#5d5688";
      ctx.fillText(subtitle, W / 2, H * 0.44 + (lines.length / 2 + 0.6) * size * 1.15);
    }
    ctx.font = `${Math.round(W * 0.09)}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
    [[0.14, 0.2, 0], [0.86, 0.22, 1.3], [0.16, 0.8, 2.1], [0.84, 0.78, 0.6]].forEach(([x, y, phase]) => {
      ctx.save();
      ctx.translate(W * x, H * y);
      ctx.rotate(0.25 * Math.sin(t * 2.2 + phase));
      ctx.scale(1 + 0.12 * Math.sin(t * 3 + phase), 1 + 0.12 * Math.sin(t * 3 + phase));
      ctx.fillText("⭐", 0, 0);
      ctx.restore();
    });
  }

  // Pets and things placed higher than this stand behind the characters; lower ones in front.
  const BEHIND_BELOW = 0.72;

  // scene = { place, motion, cast: [{ img, ar, stickers }], extras: [{ glyph, x, y, size, anim }], caption }
  function draw(ctx, W, H, scene, t) {
    ctx.clearRect(0, 0, W, H);
    drawBackground(ctx, W, H, THEMES[scene.place] || THEMES.meadow, t);
    const caption = captionLayout(ctx, W, H, scene.caption);
    const extras = scene.extras || [];
    drawExtras(ctx, W, H, extras.filter((extra) => extra.y < BEHIND_BELOW), t);
    drawCast(ctx, W, H, scene.cast || [], scene.motion, t, caption ? caption.y + caption.boxH + 5 : 0);
    drawExtras(ctx, W, H, extras.filter((extra) => extra.y >= BEHIND_BELOW), t);
    drawCaption(ctx, W, caption);
  }

  // ---------- Drawings -> character art ----------

  // Where the ink is on a canvas, or null when it is blank.
  function measureInk(canvas) {
    const { width, height } = canvas;
    const { data } = canvas.getContext("2d").getImageData(0, 0, width, height);
    let x0 = width;
    let y0 = height;
    let x1 = -1;
    let y1 = -1;
    for (let y = 0; y < height; y += 1) {
      const row = y * width * 4;
      for (let x = 0; x < width; x += 1) {
        if (data[row + x * 4 + 3] > 8) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          y1 = y;
        }
      }
    }
    return x1 < 0 ? null : { x0, y0, x1, y1 };
  }

  // The drawing cropped to just the ink, so a character fills its spot on stage.
  function cropInk(canvas) {
    const bounds = measureInk(canvas);
    if (!bounds) return null;
    const pad = 16;
    const x = Math.max(0, bounds.x0 - pad);
    const y = Math.max(0, bounds.y0 - pad);
    const width = Math.min(canvas.width, bounds.x1 + pad) - x;
    const height = Math.min(canvas.height, bounds.y1 + pad) - y;
    const crop = document.createElement("canvas");
    crop.width = width;
    crop.height = height;
    crop.getContext("2d").drawImage(canvas, x, y, width, height, 0, 0, width, height);
    return crop;
  }

  async function decode(blob) {
    if (window.createImageBitmap) return createImageBitmap(blob);
    const url = URL.createObjectURL(blob);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      return image;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  // A saved character record -> something the painter can draw.
  async function loadArt(character) {
    const img = await decode(character.art);
    return { img, ar: img.width / img.height, stickers: character.stickers || [], name: character.name };
  }

  // Older saves were drawn on a solid white page. Make that white see-through.
  function whiteToTransparent(canvas) {
    const context = canvas.getContext("2d");
    const first = context.getImageData(0, 0, 1, 1).data;
    if (first[3] !== 255 || first[0] < 250 || first[1] < 250 || first[2] < 250) return;
    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    const { data } = image;
    for (let index = 0; index < data.length; index += 4) {
      if (data[index] > 245 && data[index + 1] > 245 && data[index + 2] > 245) data[index + 3] = 0;
    }
    context.putImageData(image, 0, 0);
  }

  // Character records -> Map of id -> art the painter can draw. Characters that fail to decode are left out.
  async function loadArts(characters) {
    const arts = new Map();
    await Promise.all(characters.map(async (character) => {
      try {
        arts.set(character.id, await loadArt(character));
      } catch (error) {
        console.error("Could not open the art for", character.name, error);
      }
    }));
    return arts;
  }

  // A story scene (whose characters are { id, x }) -> a scene the painter can draw. `before` is
  // the scene just ahead of it, so characters can walk in from where they stood.
  function compose(sceneData, arts, before) {
    const cast = [];
    sceneData.cast.forEach((entry) => {
      const art = arts.get(entry.id);
      if (!art) return;
      const member = { ...art, x: entry.x };
      if (sceneData.walk) {
        const stood = before?.cast.find((other) => other.id === entry.id);
        member.fromX = stood ? stood.x : entry.x < 0.5 ? -0.25 : 1.25;
      }
      cast.push(member);
    });
    return { place: sceneData.place, motion: sceneData.motion, caption: sceneData.caption, extras: sceneData.extras || [], cast };
  }

  // How long a scene stays on screen: long enough to read the caption and see any walking.
  function sceneSeconds(sceneData) {
    return Math.min(12, Math.max(4, 2 + (sceneData.caption || "").length * 0.07));
  }

  window.LSS.scene = {
    draw, drawCard, portrait, motionAt, fitPercent, applyTheme, measureInk, cropInk, whiteToTransparent,
    loadArt, loadArts, decode, compose, sceneSeconds,
  };
})();
