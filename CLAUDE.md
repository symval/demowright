# demowright — Project Guide

Playwright video production plugin that overlays a visible cursor, keystroke badges, click ripples, auto-slowdown, TTS narration, and subtitles into test video recordings.

## Architecture

```
src/
├── setup.ts          # Core: applyHud(), patchPageDelay(), wrapNavigation()
├── hud-overlay.ts    # Browser-side: listener script (addInitScript) + DOM injector
├── hud-registry.ts   # WeakMap tracking HUD-active pages + TTS config
├── helpers.ts        # Recording helpers: clickEl, typeKeys, narrate, subtitle, etc.
├── video-script.ts   # Video production: createVideoScript(), title/segment/transition/outro
├── fixture.ts        # Playwright fixture (import replacement approach)
├── config.ts         # withDemowright() config helper
├── audio-capture.ts  # Browser-side Web Audio tap (monkey-patches AudioContext)
├── audio-writer.ts   # Node-side WAV file writer
├── index.ts          # Main entry point — re-exports everything
register.cjs          # CJS preload for NODE_OPTIONS approach
```

## Key Concepts

- **Listener script** runs via `addInitScript()` — captures mouse/keyboard events, stores state on `window.__qaHud`. No DOM mutations, survives navigations.
- **DOM injector** runs via `page.evaluate()` after each navigation — creates the overlay, wires it to listener state.
- **Helpers** detect HUD activation via `isHudActive(page)` which checks a Node-side WeakMap first, then falls back to `window.__qaHud` in the browser (needed for config/register approach where module instances differ).
- **Video script** (`createVideoScript()`) provides narration-driven video production: title cards, narrated segments with `pace()`, transitions, auto-generated SRT subtitles, and chapter markers.
- **TTS provider** is stored per-page in the registry. `narrate()` checks for a provider (URL template or function), fetches audio Node-side, base64-encodes, plays in browser via AudioContext.

## Four Integration Methods

1. **Config helper**: `withDemowright(defineConfig({...}))` — zero test changes
2. **CLI**: `NODE_OPTIONS="--require demowright/register" npx playwright test`
3. **Import replacement**: `import { test } from "demowright"`
4. **Programmatic**: `await applyHud(context, options)`

## Build & Test

```bash
bun run build          # tsdown → dist/
bun run typecheck      # tsgo --noEmit
bun run lint           # oxlint src
bun test               # runs tests/ with main playwright.config.ts
bunx playwright test --config examples/playwright.config.ts  # run all examples
```

## Docker (audio + system-UI capture)

Some examples need Docker because Playwright's built-in video recorder has two
fundamental limitations:

1. **No page audio** — pages that play sound (example 07) need Docker's PulseAudio
   sink to route Firefox audio into a captureable file.
2. **No system UI** — system dialogs like the GTK file picker (example 08) are
   rendered by the OS, not by the page DOM, so Playwright video can't see them.
   Docker provides Xvfb + fluxbox + xdotool + ffmpeg x11grab to capture the
   entire screen including any native dialogs.

```bash
./docker-run.sh                                    # all examples
./docker-run.sh examples/07-video-player.spec.ts   # audio capture (PulseAudio)
./docker-run.sh examples/08-file-upload-download.spec.ts  # screen capture (x11grab)
```

`docker-run.sh` automatically wraps example 08 with `docker-record-screen.sh`
which starts ffmpeg x11grab before the test and muxes demowright's TTS WAV
into the final MP4.

Without Docker, demowright still captures Web Audio API output (oscillators,
media elements) via its browser-side `audio-capture.ts` intercept, and example
08 falls back to Playwright's `setInputFiles()` which bypasses the system picker.

## Package Manager

Use `bun` — never `npm`. Install deps with `bun i`, run scripts with `bun run`.

## Documentation

| File | Content |
|------|---------|
| [docs/getting-started.md](docs/getting-started.md) | Installation, integration methods, configuration |
| [docs/helpers.md](docs/helpers.md) | `clickEl`, `typeKeys`, `moveTo`, `hudWait` API reference |
| [docs/narration.md](docs/narration.md) | `narrate()`, `subtitle()`, `annotate()` |
| [docs/tts.md](docs/tts.md) | TTS provider setup (URL, function, espeak, OpenAI) |
| [docs/cursor-keyboard.md](docs/cursor-keyboard.md) | Cursor styles, key badges, click ripples, auto-slowdown |
| [docs/audio.md](docs/audio.md) | Browser audio capture approaches |
| [docs/examples.md](docs/examples.md) | 6 runnable demo scenarios |
| [docs/wrapper.md](docs/wrapper.md) | Strategies for native Playwright call interception |

## Gotchas (Playwright spec authoring)

- **`page.route()` runs in reverse registration order.** The last-registered
  matching handler wins. If you use a catch-all like `**/api/**` for unknown
  endpoints, register it FIRST so the specific routes registered after it
  take precedence. Reversing this silently breaks every specific mock.
- **`bun --cwd <path>` is silently ignored** — bun's flag parser only
  honors `--cwd=<path>` with `=`. The space-separated form treats `<path>`
  as a script name in the *current* directory's package.json and ends up
  printing the help banner. In Playwright configs, prefer
  `webServer.cwd: resolve(__dirname, "../some/path")` instead.
- **Playwright wipes `outputDir` between runs.** If you write your final
  mp4s into the same dir Playwright uses for test artifacts, they get
  deleted on the next run. Point `outputDir` at a scratch dir and pass a
  separate dir to `script.render({ outputDir: ... })`.

## Examples

| # | File | What it demonstrates |
|---|------|---------------------|
| 01 | `examples/01-cursor-demo.spec.ts` | Dashboard — cursor, clicks, Ctrl+K, modal forms |
| 02 | `examples/02-keyboard-demo.spec.ts` | Monaco Editor — real typing, Ctrl+S/Z/A, tab switching |
| 03 | `examples/03-form-interaction.spec.ts` | E-commerce checkout with narrated segments |
| 04 | `examples/04-narrated-tour.spec.ts` | SaaS landing page tour — heavy `.segment()` usage |
| 05 | `examples/05-kanban-board.spec.ts` | Kanban board — drag-and-drop cards between columns |
| 06 | `examples/06-native-api.spec.ts` | Native Playwright API — zero helpers, auto-delay only |
| 07 | `examples/07-video-player.spec.ts` | Video player — play, pause, seek, media keys, audio |
| 08 | `examples/08-file-upload-download.spec.ts` | File manager — real GTK file picker via xdotool + screen capture |
