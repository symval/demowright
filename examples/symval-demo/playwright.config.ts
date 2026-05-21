import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "@playwright/test";
import { withDemowright } from "../../src/config.js";

// Load parent symval repo's .env.local for GEMINI_API_KEY etc.
const candidates = [
  resolve(import.meta.dirname, "../../.env.local"),
  resolve(import.meta.dirname, "../../../../.env.local"),
];
for (const path of candidates) {
  try {
    const envFile = readFileSync(path, "utf-8");
    for (const line of envFile.split("\n")) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
      }
    }
  } catch {
    // file not found — try next
  }
}

const TMP_DIR = resolve(import.meta.dirname, "../../tmp/videos");
// Playwright wipes `outputDir` between runs — point it at a separate scratch
// dir so the curated mp4s in TMP_DIR survive across the 3 branch spec runs.
const PW_OUTPUT = resolve(import.meta.dirname, "../../tmp/pw-output");

export default withDemowright(
  defineConfig({
    testDir: ".",
    outputDir: PW_OUTPUT,
    timeout: 360_000,
    fullyParallel: false,
    workers: 1,
    use: {
      video: { mode: "on", size: { width: 1280, height: 720 } },
      viewport: { width: 1280, height: 720 },
      ignoreHTTPSErrors: true,
      launchOptions: {
        args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
      },
    },
    projects: [
      {
        name: "chromium",
        use: { browserName: "chromium" },
      },
    ],
    webServer: [
      {
        // Storybook-static for branch B. Build is checked into lib/desktop.
        command: "bunx serve ../../../desktop/storybook-static -p 6006 -L",
        url: "http://localhost:6006/iframe.html?id=views-setupchecklist--fresh-install&viewMode=story",
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
        cwd: import.meta.dirname,
      },
      {
        // Admin SPA dev server for branch C. API calls are mocked via page.route().
        command: "bun --cwd ../../../admin run dev -- --port 5173",
        url: "http://localhost:5173/login",
        reuseExistingServer: !process.env.CI,
        timeout: 90_000,
        cwd: import.meta.dirname,
      },
    ],
  }),
  {
    actionDelay: 300,
    audio: true,
    outputDir: TMP_DIR,
  },
);
