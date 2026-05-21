/**
 * Branch A — symval.pages.dev static landing surface.
 *
 * Tracer-bullet entry: A2 (/private-lp/) is recorded first to validate the
 * full pipeline (record → mp4 → Drive upload → manifest). Once green, the
 * remaining A3–A6 leaves are appended.
 */
import { test } from "@playwright/test";
import { moveToEl } from "../../src/helpers.js";
import { createVideoScript } from "../../src/video-script.js";
import { resolve } from "node:path";
import { appendLeafToManifest, detachSrtForViewer } from "./scripts/manifest.js";

const TMP_DIR = resolve(import.meta.dirname, "../../tmp/videos");
const ORIGIN = "https://symval.pages.dev";

test.describe("Branch A — landing", () => {
  test("A2 — private LP hero & features", async ({ page }) => {
    const script = createVideoScript()
      .title("SymVal — AI ガバナンス & セキュリティ", { durationMs: 1800 })
      .segment(
        "SymVal は企業内 AI ガバナンスとセキュリティを統合した基盤です。ローカル MITM プロキシで通信を解析し、26 種類のリスクパターンを検出します。",
        async (pace) => {
          await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
          await pace();
          await page.evaluate(() => window.scrollTo({ top: 480, behavior: "smooth" }));
          await pace();
        },
      )
      .segment(
        "スクロールすると、製品の主要機能が並びます。ローカル解析、匿名化ログ、組織横断のガバナンスポリシー、そしてデスクトップから管理画面までを一気通貫で扱えます。",
        async (pace) => {
          await page.evaluate(() => window.scrollTo({ top: 980, behavior: "smooth" }));
          await pace();
          await page.evaluate(() => window.scrollTo({ top: 1480, behavior: "smooth" }));
          await pace();
        },
      )
      .outro({ text: "SymVal — 詳しくはお問い合わせください", durationMs: 1500 });

    await page.goto(`${ORIGIN}/private-lp/`);
    const result = await script.render(page, { outputDir: TMP_DIR, baseName: "A2-private-lp" });

    appendLeafToManifest({
      id: "A2",
      title: "Private LP",
      branch: "A",
      url: `${ORIGIN}/private-lp/`,
      mp4Path: result.mp4Path ?? `${TMP_DIR}/A2-private-lp.mp4`,
      srtPath: detachSrtForViewer(result.srtPath),
      totalMs: result.totalMs,
    });
  });

  test("A3 — survey form", async ({ page }) => {
    const script = createVideoScript()
      .title("AI × 生産性アンケート", { durationMs: 1500 })
      .segment(
        "招待ユーザー向けの短いアンケートです。AI の業務利用状況と生産性への影響を 3 分ほどで回答できます。",
        async (pace) => {
          await pace();
          await page.evaluate(() => window.scrollTo({ top: 400, behavior: "smooth" }));
          await pace();
        },
      )
      .outro({ text: "回答ありがとうございました", durationMs: 1200 });

    await page.goto(`${ORIGIN}/survey/`);
    const result = await script.render(page, { outputDir: TMP_DIR, baseName: "A3-survey" });
    appendLeafToManifest({
      id: "A3",
      title: "Survey",
      branch: "A",
      url: `${ORIGIN}/survey/`,
      mp4Path: result.mp4Path ?? `${TMP_DIR}/A3-survey.mp4`,
      srtPath: detachSrtForViewer(result.srtPath),
      totalMs: result.totalMs,
    });
  });

  test("A4 — docs index", async ({ page }) => {
    const script = createVideoScript()
      .title("Docs", { durationMs: 1200 })
      .segment(
        "サイドバー付きのドキュメントです。インストール手順や運用ガイドが整理されています。",
        async (pace) => {
          await pace();
        },
      )
      .outro({ durationMs: 1000 });

    await page.goto(`${ORIGIN}/docs/`);
    const result = await script.render(page, { outputDir: TMP_DIR, baseName: "A4-docs" });
    appendLeafToManifest({
      id: "A4",
      title: "Docs index",
      branch: "A",
      url: `${ORIGIN}/docs/`,
      mp4Path: result.mp4Path ?? `${TMP_DIR}/A4-docs.mp4`,
      srtPath: detachSrtForViewer(result.srtPath),
      totalMs: result.totalMs,
    });
  });

  test("A5 — how-to macOS", async ({ page }) => {
    const script = createVideoScript()
      .title("macOS インストール手順", { durationMs: 1400 })
      .segment(
        "macOS 用のインストール手順です。ターミナルから install スクリプトを実行し、CA 証明書の信頼まで案内します。",
        async (pace) => {
          await pace();
          await page.evaluate(() => window.scrollTo({ top: 500, behavior: "smooth" }));
          await pace();
        },
      )
      .outro({ durationMs: 1000 });

    await page.goto(`${ORIGIN}/docs/how-to-macos.html`);
    const result = await script.render(page, { outputDir: TMP_DIR, baseName: "A5-macos" });
    appendLeafToManifest({
      id: "A5",
      title: "How-to macOS",
      branch: "A",
      url: `${ORIGIN}/docs/how-to-macos.html`,
      mp4Path: result.mp4Path ?? `${TMP_DIR}/A5-macos.mp4`,
      srtPath: detachSrtForViewer(result.srtPath),
      totalMs: result.totalMs,
    });
  });

  test("A6 — how-to Windows", async ({ page }) => {
    const script = createVideoScript()
      .title("Windows インストール手順", { durationMs: 1400 })
      .segment(
        "Windows 用のインストール手順です。PowerShell から install スクリプトを起動し、システムプロキシ設定までフォローします。",
        async (pace) => {
          await pace();
          await page.evaluate(() => window.scrollTo({ top: 500, behavior: "smooth" }));
          await pace();
        },
      )
      .outro({ durationMs: 1000 });

    await page.goto(`${ORIGIN}/docs/how-to-windows.html`);
    const result = await script.render(page, { outputDir: TMP_DIR, baseName: "A6-windows" });
    appendLeafToManifest({
      id: "A6",
      title: "How-to Windows",
      branch: "A",
      url: `${ORIGIN}/docs/how-to-windows.html`,
      mp4Path: result.mp4Path ?? `${TMP_DIR}/A6-windows.mp4`,
      srtPath: detachSrtForViewer(result.srtPath),
      totalMs: result.totalMs,
    });
  });
});

// Keep moveToEl import live for typed access from future expansion.
void moveToEl;
