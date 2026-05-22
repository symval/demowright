# demowright

Playwright HUD plugin — renders a visible **mouse cursor**, **keystroke display**, **auto-slowdown**, **TTS narration**, and **subtitles** into test video recordings, making them readable by humans and AI (e.g. Gemini video analysis).

## Demos

> 6 runnable examples in `examples/` — see [Examples guide](./docs/examples.md)

| # | Demo | What it shows |
|---|------|---------------|
| 01 | [Dashboard](examples/01-cursor-demo.spec.ts) | Cursor, clicks, Ctrl+K search, modal form typing |
| 02 | [Monaco Editor](examples/02-keyboard-demo.spec.ts) | Real VS Code editor — typing, Ctrl+S/Z/A, tab switching |
| 03 | [E-commerce Checkout](examples/03-form-interaction.spec.ts) | Browse, add to cart, fill payment form with `annotate()` |
| 04 | [Narrated Tour](examples/04-narrated-tour.spec.ts) | SaaS landing page tour — heavy TTS + subtitles |
| 05 | [Kanban Board](examples/05-kanban-board.spec.ts) | Move cards between columns, add tasks |
| 06 | [Native API](examples/06-native-api.spec.ts) | **Zero helpers** — `page.click()`, `page.fill()` only |

```bash
npx playwright test --config examples/playwright.config.ts  # run all 6
```

### Real-world deployment

**[symval-tour.pages.dev](https://symval-tour.pages.dev)** — 19 narrated demo videos
(landing → desktop storybook → admin SPA) wired into a d3 sitemap graph. Built
end-to-end with this plugin; source under
[`examples/symval-demo/`](examples/symval-demo/).

## Problem

Playwright's video recording doesn't capture the browser cursor or keyboard input. Tests run too fast for meaningful video review.

## Solution

`demowright` injects a lightweight overlay into every page during test execution:

- 🖱️ **Visible cursor** — SVG pointer follows mouse with click ripple effects
- ⌨️ **Keystroke display** — keys shown as HUD badges; modifier keys (Shift/Ctrl/Alt) as persistent blue badges
- 🐢 **Auto-slowdown** — configurable delays after actions for human-readable recordings
- 🗣️ **TTS narration** — spoken annotations via pluggable providers (OpenAI, ElevenLabs, espeak, URL template)
- 💬 **Subtitles** — visual text overlays that fade in/out during recordings
- 🎵 **Audio capture** — record browser audio to WAV via Web Audio API tap
- 🔌 **Non-invasive** — 4 integration methods, from zero-change config to full programmatic control

## Quick Start

```bash
npm install demowright
```

### Zero-change setup (recommended) ⭐

Add one line to your `playwright.config.ts` — no test files need to change:

```ts
// playwright.config.ts
import { defineConfig } from "@playwright/test";
import { withDemowright } from "demowright/config";

export default withDemowright(
  defineConfig({
    use: { video: "on" },
  }),
);
```

Your existing tests keep using `import { test } from '@playwright/test'` — the HUD is injected automatically.

### Alternative: CLI flag (zero code changes at all)

```bash
NODE_OPTIONS="--require demowright/register" npx playwright test
```

### Alternative: Import replacement

```ts
// Change this:
import { test, expect } from "@playwright/test";
// To this:
import { test, expect } from "demowright";
```

### Alternative: Programmatic (full control)

```ts
import { test as base } from "@playwright/test";
import { applyHud } from "demowright";

const test = base.extend({
  context: async ({ context }, use) => {
    await applyHud(context, { cursor: true, keyboard: true, actionDelay: 150 });
    await use(context);
  },
});
```

## Configuration

```ts
// Via withDemowright (recommended)
export default withDemowright(defineConfig({ ... }), {
  actionDelay: 200,
  cursorStyle: 'dot',
});

// Via test.use (import replacement approach)
test.use({
  qaHud: {
    cursor: true,            // show cursor overlay (default: true)
    keyboard: true,          // show keystroke display (default: true)
    cursorStyle: 'default',  // 'default' | 'dot' | 'crosshair'
    keyFadeMs: 1500,         // key label fade time in ms
    actionDelay: 120,        // delay after each action for readability (ms)
    audio: false,            // path to save WAV, or false to disable
    tts: false,              // TTS provider: URL template, function, or false
  },
});

// Via env vars (CLI approach)
QA_HUD_CURSOR=0 QA_HUD_DELAY=200 NODE_OPTIONS="--require demowright/register" npx playwright test
```

| Env Var                   | Description               | Default   |
| ------------------------- | ------------------------- | --------- |
| `QA_HUD=0`                | Disable HUD entirely      | enabled   |
| `QA_HUD_CURSOR=0`         | Disable cursor overlay    | enabled   |
| `QA_HUD_KEYBOARD=0`       | Disable keyboard display  | enabled   |
| `QA_HUD_DELAY=200`        | Action delay in ms        | `120`     |
| `QA_HUD_CURSOR_STYLE=dot` | Cursor style              | `default` |
| `QA_HUD_KEY_FADE=2000`    | Key label fade time in ms | `1500`    |
| `QA_HUD_TTS=url`          | TTS URL template (`%s`)   | disabled  |

## Helpers — Recording-Only Convenience Functions

```ts
import { clickEl, typeKeys, narrate, annotate, hudWait } from "demowright/helpers";

await annotate(page, "Welcome to the product tour"); // subtitle + TTS
await clickEl(page, "#get-started");                  // animated cursor + ripple + click
await typeKeys(page, "hello@example.com", 60, "#email"); // char-by-char with key badges
await hudWait(page, 500);                              // waits only during recording
await narrate(page, "Now let's submit the form");      // TTS narration
```

All helpers are **no-ops when HUD is inactive** — safe to leave in production tests.

## TTS Narration

Configure a TTS provider for spoken narration in recordings:

```ts
export default withDemowright(defineConfig({ ... }), {
  tts: "http://localhost:5000/tts?text=%s", // URL template
  audio: "test-audio.wav",                   // capture audio to WAV
});
```

Or use a function for APIs requiring auth (OpenAI, ElevenLabs, etc.):

```ts
await applyHud(context, {
  tts: async (text) => {
    const res = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "tts-1", voice: "alloy", input: text }),
    });
    return Buffer.from(await res.arrayBuffer());
  },
});
```

## How It Works

1. **Event listeners** are injected via `context.addInitScript()` — captures mouse/keyboard events before DOM exists, survives navigations
2. **DOM overlay** is injected via `page.evaluate()` after each navigation (`goto`, `reload`, `setContent`, etc.)
3. The overlay uses `pointer-events: none` and max z-index — never interferes with test interactions
4. Page actions (`click`, `fill`, `type`, etc.) are wrapped with configurable delays for video readability

## Documentation

| Guide | Description |
|-------|-------------|
| [Getting Started](./docs/getting-started.md) | Installation, 4 integration methods, configuration |
| [Helpers API](./docs/helpers.md) | `clickEl`, `typeKeys`, `moveTo`, `hudWait` reference |
| [Narration & Subtitles](./docs/narration.md) | `narrate()`, `subtitle()`, `annotate()` |
| [TTS Setup](./docs/tts.md) | Configuring text-to-speech providers |
| [Cursor & Keyboard](./docs/cursor-keyboard.md) | Cursor styles, key badges, click ripples, auto-slowdown |
| [Audio Capture](./docs/audio.md) | Recording browser audio to WAV |
| [Examples](./docs/examples.md) | 6 runnable demo scenarios |
| [Wrapper Strategies](./docs/wrapper.md) | Making native Playwright calls show the HUD |

## License

MIT
