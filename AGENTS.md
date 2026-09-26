# Little Story Studio

## Product Goal

Build a private, browser-based story-making game for children ages 6-9. It should work with touch, stylus, and mouse, especially on an iPad. Children make a character, bring it to life, dress it, build a story scene by scene, and watch their finished story inside the game.

Saved characters and finished videos belong to the current browser on the current device. Do not add accounts, cloud sync, public sharing, downloads, or video export unless requested. Firebase is not part of the initial design.

## Build Phases

### Phase 1: Make a Character

- [x] Add a welcoming game home with a new-game action and a My Videos entry point.
- [x] Show an honest empty state for the video shelf until story/video creation is built.
- [x] Create a touch-friendly drawing workspace.
- [x] Draw and erase with adjustable brush size and color.
- [x] Undo, redo, and clear the canvas.
- [x] Name, save, reopen, and delete characters in a device-local gallery.
- [x] Persist character images with IndexedDB.
- [x] Check home, drawing, and gallery flows at tablet and phone sizes (320px, 390px, 768px, and 1024px browser widths).

### Phase 2: Bring It to Life

- Add a character preview stage and a small set of playful motion presets.
- Keep animation simple and usable without requiring kids to rig body parts.
- Save the selected motion with the character/story data.

### Phase 3: Dress the Character

- Add draggable costume and prop stickers.
- Let kids remove, move, and resize stickers with touch.
- Preserve the original drawing so outfits can be changed.

### Phase 4: Build a Story

- Create a short, ordered sequence of scenes with backgrounds, characters, and simple actions.
- Support captions and optional narration.
- Make the scene sequence easy to rearrange and preview.

### Phase 5: My Videos

- Play a finished story and save it to an in-game video collection.
- Replay and delete saved videos only inside the game.
- Do not provide video export or sharing.
- Check browser recording support and local storage limits; keep story playback available if recording is unsupported.

## Project Conventions

- Keep the first version dependency-free: static HTML, CSS, and JavaScript.
- Put app code under `src/`; keep `index.html` at the project root.
- Use browser-native APIs and pointer events for mouse, stylus, and touch input.
- Store larger local assets in IndexedDB, not `localStorage`.
- Keep controls readable, large, and direct for early readers; use words as well as icons.
- Build only the current phase. Avoid adding cloud services, accounts, analytics, or export paths without an explicit request.

## Run Locally

Serve the project root with any static file server, then open its local URL in a browser. No package installation or build step is required.