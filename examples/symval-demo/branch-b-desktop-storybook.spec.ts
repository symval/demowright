/**
 * Branch B — Desktop Electron UI states served via lib/desktop Storybook static build.
 *
 * Each leaf opens a Storybook iframe URL with a specific story id and narrates
 * what state the user is seeing. No interaction — these are state portraits.
 *
 * Prerequisite: storybook-static is served at http://localhost:6006
 * (handled by playwright.config.ts webServer entry).
 */
import { test } from "@playwright/test";
import { createVideoScript } from "../../src/video-script.js";
import { resolve } from "node:path";
import { appendLeafToManifest, detachSrtForViewer } from "./scripts/manifest.js";

const TMP_DIR = resolve(import.meta.dirname, "../../tmp/videos");
const SB = "http://localhost:6006";

function storyUrl(id: string) {
  return `${SB}/iframe.html?id=${id}&viewMode=story`;
}

test.describe("Branch B — desktop storybook", () => {
  test("B1 — SetupChecklist Fresh Install", async ({ page }) => {
    const script = createVideoScript()
      .title("Fresh Install — はじめての起動", { durationMs: 1500 })
      .segment(
        "SymVal デスクトップを起動した直後の画面です。CA 証明書もプロキシ常駐プロセスもまだ動いていません。チェックリストに沿って初期セットアップを進めていきます。",
      )
      .outro({ durationMs: 1000 });

    await page.goto(storyUrl("views-setupchecklist--fresh-install"));
    const result = await script.render(page, { outputDir: TMP_DIR, baseName: "B1-setup-fresh" });
    appendLeafToManifest({
      id: "B1",
      title: "SetupChecklist — Fresh",
      branch: "B",
      url: storyUrl("views-setupchecklist--fresh-install"),
      mp4Path: result.mp4Path ?? `${TMP_DIR}/B1-setup-fresh.mp4`,
      srtPath: detachSrtForViewer(result.srtPath),
      totalMs: result.totalMs,
    });
  });

  test("B2 — SetupChecklist In Progress", async ({ page }) => {
    const script = createVideoScript()
      .title("セットアップ進行中", { durationMs: 1300 })
      .segment(
        "CA 証明書の信頼設定が完了し、プロキシの常駐も走り始めた段階です。あとはサインインを残すのみで、左カラムのチェックが順次グリーンに変わっていきます。",
      )
      .outro({ durationMs: 1000 });

    await page.goto(storyUrl("views-setupchecklist--in-progress"));
    const result = await script.render(page, { outputDir: TMP_DIR, baseName: "B2-setup-partial" });
    appendLeafToManifest({
      id: "B2",
      title: "SetupChecklist — Partial",
      branch: "B",
      url: storyUrl("views-setupchecklist--in-progress"),
      mp4Path: result.mp4Path ?? `${TMP_DIR}/B2-setup-partial.mp4`,
      srtPath: detachSrtForViewer(result.srtPath),
      totalMs: result.totalMs,
    });
  });

  test("B4 — StatusHome Setup Complete", async ({ page }) => {
    const script = createVideoScript()
      .title("Status Home — 全機能稼働", { durationMs: 1400 })
      .segment(
        "セットアップ完了後のホーム画面です。CA、proxy daemon、システムプロキシ設定が全部グリーンで、SymVal がローカルで AI 通信を解析できる状態になっています。",
      )
      .outro({ durationMs: 1000 });

    await page.goto(storyUrl("views-statushome--setup-complete"));
    const result = await script.render(page, { outputDir: TMP_DIR, baseName: "B4-statushome-complete" });
    appendLeafToManifest({
      id: "B4",
      title: "StatusHome — Complete",
      branch: "B",
      url: storyUrl("views-statushome--setup-complete"),
      mp4Path: result.mp4Path ?? `${TMP_DIR}/B4-statushome-complete.mp4`,
      srtPath: detachSrtForViewer(result.srtPath),
      totalMs: result.totalMs,
    });
  });

  test("B5 — StatusHome Signed In", async ({ page }) => {
    const script = createVideoScript()
      .title("Status Home — サインイン済み", { durationMs: 1400 })
      .segment(
        "管理者アカウントでサインイン済みの状態です。組織と紐付いたデバイスとして稼働し、解析結果が admin の Dashboard に同期されていきます。",
      )
      .outro({ durationMs: 1000 });

    await page.goto(storyUrl("views-statushome--signed-in"));
    const result = await script.render(page, { outputDir: TMP_DIR, baseName: "B5-statushome-signed" });
    appendLeafToManifest({
      id: "B5",
      title: "StatusHome — Signed In",
      branch: "B",
      url: storyUrl("views-statushome--signed-in"),
      mp4Path: result.mp4Path ?? `${TMP_DIR}/B5-statushome-signed.mp4`,
      srtPath: detachSrtForViewer(result.srtPath),
      totalMs: result.totalMs,
    });
  });

  test("B6 — ProxySettings Not Configured", async ({ page }) => {
    const script = createVideoScript()
      .title("Proxy 設定 — 未設定", { durationMs: 1300 })
      .segment(
        "Proxy 設定タブの初期状態です。システムプロキシも CA 信頼もまだ適用されていません。各項目のスイッチをオンにすると順番に有効化されていきます。",
      )
      .outro({ durationMs: 1000 });

    await page.goto(storyUrl("views-proxysettingsview--not-configured"));
    const result = await script.render(page, { outputDir: TMP_DIR, baseName: "B6-proxy-off" });
    appendLeafToManifest({
      id: "B6",
      title: "ProxySettings — Off",
      branch: "B",
      url: storyUrl("views-proxysettingsview--not-configured"),
      mp4Path: result.mp4Path ?? `${TMP_DIR}/B6-proxy-off.mp4`,
      srtPath: detachSrtForViewer(result.srtPath),
      totalMs: result.totalMs,
    });
  });

  test("B7 — ProxySettings All Running", async ({ page }) => {
    const script = createVideoScript()
      .title("Proxy 設定 — 全 ON", { durationMs: 1300 })
      .segment(
        "Proxy 設定がすべて有効化された状態です。daemon 起動、システムプロキシ適用、CA 信頼すべて完了し、通信解析がリアルタイムに走っています。",
      )
      .outro({ durationMs: 1000 });

    await page.goto(storyUrl("views-proxysettingsview--all-running"));
    const result = await script.render(page, { outputDir: TMP_DIR, baseName: "B7-proxy-on" });
    appendLeafToManifest({
      id: "B7",
      title: "ProxySettings — On",
      branch: "B",
      url: storyUrl("views-proxysettingsview--all-running"),
      mp4Path: result.mp4Path ?? `${TMP_DIR}/B7-proxy-on.mp4`,
      srtPath: detachSrtForViewer(result.srtPath),
      totalMs: result.totalMs,
    });
  });
});
