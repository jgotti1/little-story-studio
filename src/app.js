"use strict";

// Start the game. Every screen registers itself in its own file; this runs last.
(async () => {
  const { register, route, refreshCount, importLegacy } = window.LSS;

  register("home", { title: "Home" });

  // Carry over characters from the first version before the first screen is shown.
  await importLegacy();
  route();
  refreshCount();
})();
