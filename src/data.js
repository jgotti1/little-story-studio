"use strict";

// Shared constants. Everything hangs off one global so the plain <script> files can share it.
window.LSS = {
  CANVAS_W: 1200,
  CANVAS_H: 900,

  COLORS: [
    { name: "Cherry", value: "#e6343f" },
    { name: "Tangerine", value: "#ff8a1f" },
    { name: "Sunshine", value: "#ffd028" },
    { name: "Lime", value: "#7ac943" },
    { name: "Forest", value: "#1f9d55" },
    { name: "Aqua", value: "#14c3b1" },
    { name: "Sky", value: "#3aa0ff" },
    { name: "Grape", value: "#7c5cff" },
    { name: "Bubblegum", value: "#ff6fb5" },
    { name: "Cocoa", value: "#8a5a3c" },
    { name: "Stone", value: "#9aa0b5" },
    { name: "Ink", value: "#2a2250" },
  ],

  SIZES: [
    { name: "Tiny", px: 4, dot: 6 },
    { name: "Small", px: 9, dot: 12 },
    { name: "Big", px: 17, dot: 20 },
    { name: "Huge", px: 30, dot: 30 },
  ],

  MOTIONS: [
    { id: "wiggle", label: "Wiggle", icon: "🎵" },
    { id: "bounce", label: "Bounce", icon: "🏀" },
    { id: "twirl", label: "Twirl", icon: "🌪️" },
    { id: "glide", label: "Glide", icon: "🛼" },
    { id: "float", label: "Float", icon: "🎈" },
  ],
  // Story scenes can also let a character just stand there.
  STILL: { id: "still", label: "Stand still", icon: "🧍" },
  DEFAULT_MOTION: "wiggle",
  DEFAULT_PLACE: "meadow",

  // Every place is a set of colors. The DOM stage reads them as CSS variables and
  // the canvas renderer (used for stories and videos) reads them directly.
  THEMES: {
    meadow: { label: "Meadow", skyTop: "#7fcdff", skyBot: "#e4f6ff", orb: "#ffd028", glow: "rgba(255,208,40,0.35)", ox: 620, oy: 130, os: 1, hillB: "#8fe29a", hillF: "#4fc873", stars: 0, clouds: 1, cloud: "#ffffff", sea: 0, back: 1 },
    sunset: { label: "Sunset", skyTop: "#6b4de6", skyBot: "#ffb36b", orb: "#fff2a8", glow: "rgba(255,240,168,0.35)", ox: 400, oy: 400, os: 1.5, hillB: "#a24bb3", hillF: "#6b2f96", stars: 0, clouds: 0.9, cloud: "#ffc4dd", sea: 0, back: 1 },
    night: { label: "Night", skyTop: "#14123a", skyBot: "#40329a", orb: "#fff6c9", glow: "rgba(255,246,201,0.22)", ox: 610, oy: 120, os: 0.8, hillB: "#2f3f9a", hillF: "#1f2a6b", stars: 1, clouds: 0.18, cloud: "#8f86ff", sea: 0, back: 1 },
    beach: { label: "Beach", skyTop: "#55cfff", skyBot: "#d8f5ff", orb: "#ffd028", glow: "rgba(255,208,40,0.35)", ox: 620, oy: 130, os: 1, hillB: "#8fe29a", hillF: "#ffdf9e", stars: 0, clouds: 1, cloud: "#ffffff", sea: 1, back: 0 },
    snow: { label: "Snow", skyTop: "#9fd8ff", skyBot: "#f4fbff", orb: "#ffffff", glow: "rgba(255,255,255,0.5)", ox: 600, oy: 120, os: 0.9, hillB: "#dcecff", hillF: "#ffffff", stars: 0, clouds: 0.95, cloud: "#ffffff", sea: 0, back: 1 },
    forest: { label: "Forest", skyTop: "#9fe0a0", skyBot: "#eaffd8", orb: "#fff6a8", glow: "rgba(255,246,168,0.4)", ox: 560, oy: 120, os: 0.9, hillB: "#2f9a5a", hillF: "#1f6b3d", stars: 0, clouds: 0.6, cloud: "#ffffff", sea: 0, back: 1 },
    desert: { label: "Desert", skyTop: "#ffc86b", skyBot: "#fff1c9", orb: "#ff9a3c", glow: "rgba(255,154,60,0.35)", ox: 600, oy: 150, os: 1.2, hillB: "#f0b86a", hillF: "#e39a4a", stars: 0, clouds: 0.5, cloud: "#fff7e0", sea: 0, back: 1 },
    underwater: { label: "Ocean", skyTop: "#1b8fd6", skyBot: "#a6ecff", orb: "#d8f8ff", glow: "rgba(216,248,255,0.4)", ox: 400, oy: 80, os: 1.1, hillB: "#5fc9b5", hillF: "#f2d58c", stars: 0, clouds: 0.25, cloud: "#7fd6ff", sea: 1, back: 1 },
    space: { label: "Space", skyTop: "#0b0a2a", skyBot: "#2b1a5c", orb: "#dfe6ff", glow: "rgba(223,230,255,0.25)", ox: 180, oy: 140, os: 1.3, hillB: "#5a5a8f", hillF: "#3a3a70", stars: 1, clouds: 0, cloud: "#8f86ff", sea: 0, back: 1 },
    candy: { label: "Candy", skyTop: "#ff9fd6", skyBot: "#fff0a8", orb: "#fff6c9", glow: "rgba(255,255,255,0.4)", ox: 200, oy: 130, os: 1, hillB: "#9af0d0", hillF: "#5fd6b3", stars: 0, clouds: 1, cloud: "#ffe3f3", sea: 0, back: 1 },
  },

  // Shapes of the scenery, in an 800 x 600 picture. The HTML stage draws them as SVG.
  SCENERY: {
    hillBack: "M0 400C120 320 260 330 380 390s240 60 420-30v240H0Z",
    hillFront: "M0 470c160-50 300-40 430 0s260 30 370-20v150H0Z",
    sea: "M0 360h800v240H0Z",
    foam: "M0 372c40-10 80 10 120 0s80-10 120 0 80 10 120 0 80-10 120 0 80 10 120 0 80-10 120 0",
    seaColor: "#29a9e0",
    stars: [[90, 70, 3], [210, 140, 2.5], [330, 60, 3], [440, 130, 2], [530, 50, 2.5], [700, 180, 3], [740, 70, 2], [160, 250, 2], [60, 180, 2]],
  },

  // Costumes and props. Each group says where a new sticker first lands on the character.
  // x and y are fractions of the drawing (0,0 is its top-left corner) and size is a fraction
  // of the drawing's longer side, so a hat stays the same size on the character in any scene.
  STICKER_GROUPS: [
    { id: "hats", label: "Hats", x: 0.5, y: 0.02, size: 0.3, items: [["👑", "Crown"], ["🎩", "Top hat"], ["🧢", "Cap"], ["👒", "Sun hat"], ["🎓", "Graduation cap"], ["🎀", "Bow"]] },
    { id: "face", label: "Face", x: 0.5, y: 0.3, size: 0.24, items: [["🕶️", "Sunglasses"], ["👓", "Glasses"], ["🥽", "Goggles"], ["🎧", "Headphones"], ["👀", "Googly eyes"], ["🧣", "Scarf"]] },
    { id: "clothes", label: "Clothes", x: 0.5, y: 0.66, size: 0.32, items: [["👕", "T-shirt"], ["👗", "Dress"], ["🧥", "Coat"], ["🎽", "Sports shirt"], ["👟", "Sneakers"], ["🥾", "Boots"]] },
    { id: "props", label: "Props", x: 0.88, y: 0.6, size: 0.28, items: [["🪄", "Magic wand"], ["🎈", "Balloon"], ["🛡️", "Shield"], ["⚽", "Ball"], ["🎸", "Guitar"], ["🎒", "Backpack"], ["🍦", "Ice cream"], ["🌸", "Flower"]] },
    { id: "fun", label: "Fun", x: 0.2, y: 0.25, size: 0.22, items: [["⭐", "Star"], ["🌈", "Rainbow"], ["❤️", "Heart"], ["✨", "Sparkles"], ["🦋", "Butterfly"], ["☁️", "Cloud"], ["🔥", "Fire"], ["⚡", "Lightning"]] },
  ],
  // Pets and things that can join a scene. Each item is [glyph, name, animation, { y, size }?].
  // x and y are fractions of the scene, size is a fraction of its width.
  EXTRA_GROUPS: [
    { id: "pets", label: "Pets", y: 0.8, size: 0.15, items: [
      ["🐶", "Puppy", "hop"], ["🐱", "Kitten", "wiggle"], ["🐰", "Bunny", "hop"], ["🐹", "Hamster", "wiggle"],
      ["🐥", "Chick", "hop"], ["🐢", "Turtle", "slide"], ["🐸", "Frog", "hop"], ["🦄", "Unicorn", "sway"],
      ["🐉", "Dragon", "float", { y: 0.4, size: 0.2 }], ["🦜", "Parrot", "sway"], ["🐠", "Fish", "slide", { y: 0.55 }], ["🦋", "Butterfly", "float", { y: 0.35, size: 0.1 }],
    ] },
    { id: "things", label: "Things", y: 0.8, size: 0.14, items: [
      ["⚽", "Ball", "hop"], ["🎈", "Balloon", "float", { y: 0.35 }], ["🚗", "Car", "slide"], ["🚀", "Rocket", "float", { y: 0.35, size: 0.18 }],
      ["⛵", "Sailboat", "slide", { y: 0.62 }], ["🎂", "Cake", "pulse"], ["🎁", "Present", "wiggle"], ["🪁", "Kite", "sway", { y: 0.3 }],
      ["🛹", "Skateboard", "slide"], ["🚲", "Bike", "slide"], ["🎸", "Guitar", "sway"], ["🤖", "Robot", "wiggle"],
    ] },
    { id: "outside", label: "Outside", y: 0.7, size: 0.24, items: [
      ["🌳", "Tree", "sway"], ["🌲", "Pine tree", "sway"], ["🌷", "Flower", "sway", { size: 0.12, y: 0.82 }], ["🌵", "Cactus", "pulse"],
      ["🍄", "Mushroom", "pulse", { size: 0.14, y: 0.82 }], ["🏠", "House", "still"], ["🏰", "Castle", "still", { size: 0.3 }], ["🌈", "Rainbow", "pulse", { y: 0.35, size: 0.34 }],
      ["☀️", "Sun", "spin", { y: 0.2, size: 0.14 }], ["☁️", "Cloud", "slide", { y: 0.22, size: 0.18 }], ["🌙", "Moon", "float", { y: 0.2, size: 0.14 }], ["⭐", "Star", "spin", { y: 0.25, size: 0.1 }],
    ] },
  ],
  EXTRA_ANIMS: [
    { id: "hop", label: "Hop", icon: "🐇" },
    { id: "wiggle", label: "Wiggle", icon: "🎵" },
    { id: "spin", label: "Spin", icon: "🌀" },
    { id: "float", label: "Float", icon: "🎈" },
    { id: "sway", label: "Sway", icon: "🌿" },
    { id: "pulse", label: "Pulse", icon: "💓" },
    { id: "slide", label: "Slide", icon: "↔️" },
    { id: "still", label: "Still", icon: "🧍" },
  ],
  MAX_EXTRAS: 6,
  EXTRA_MIN: 0.06,
  EXTRA_MAX: 0.6,

  STICKER_MIN: 0.08,
  STICKER_MAX: 0.9,
  MAX_STICKERS: 12,

  // Story limits and timing (seconds)
  MAX_SCENES: 20,
  MAX_CAPTION: 100,
  MAX_NARRATION: 20,
  CARD_SECONDS: 2.2,

  // Stories play (and get recorded) on a canvas this size, the same 4:3 shape as the stage.
  PLAY_W: 960,
  PLAY_H: 720,
};
