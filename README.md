# Little Story Studio

A private, browser-based story-making game for children ages 6-9. Kids draw a character, bring it to life, dress it up, put it in a story with music and sound effects, watch the story, and save it as a movie inside the game.

Works with touch, stylus, and mouse, especially on an iPad. Everything is saved in the current browser on the current device. There are no accounts, no cloud sync, no sharing, and no downloads.

## Run it

No install or build step. Serve the project folder with any static file server and open the address it prints:

```sh
python3 -m http.server 8000
```

Then open http://localhost:8000.

## How it works

Plain HTML, CSS, and JavaScript with no dependencies. The scripts share one `window.LSS` object and load in the order listed in `index.html`. See `AGENTS.md` for the product goal, build phases, and project conventions.
