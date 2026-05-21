/**
 * Branch C — Admin SPA (lib/admin) served by `bun --cwd lib/admin run dev`.
 *
 * The admin uses Better Auth cookie sessions and a cross-origin API at
 * https://symval-api.pages.dev. Instead of standing up a real API + real
 * cookie flow, we intercept every /api/** call with page.route() and return
 * the minimum shape each page consumes.
 *
 * Prerequisite: admin dev server at http://localhost:5173
 * (handled by playwright.config.ts webServer entry).
 */
import { test, type Page } from "@playwright/test";
import { createVideoScript } from "../../src/video-script.js";
import { resolve } from "node:path";
import { appendLeafToManifest, detachSrtForViewer } from "./scripts/manifest.js";

const TMP_DIR = resolve(import.meta.dirname, "../../tmp/videos");
const ADMIN = "http://localhost:5173";

const MOCK_USER = {
  id: "demo-user-1",
  email: "demo@symphoneed.co.jp",
  name: "Demo Admin",
  emailVerified: true,
  createdAt: new Date("2026-04-01T00:00:00Z").toISOString(),
  updatedAt: new Date("2026-05-01T00:00:00Z").toISOString(),
  image: null,
};

const MOCK_SESSION = {
  id: "demo-session-1",
  userId: MOCK_USER.id,
  expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  token: "demo-token",
};

function mockApi(payload: Record<string, unknown>) {
  return {
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(payload),
  };
}

/**
 * Install mocks for the admin's API surface. Order matters: more-specific
 * routes must register before the catch-all.
 */
async function installAdminMocks(page: Page) {
  // Better Auth session check — admin Layout gates on this.
  await page.route("**/api/auth/get-session", (route) =>
    route.fulfill(mockApi({ user: MOCK_USER, session: MOCK_SESSION })),
  );

  // Dashboard
  await page.route("**/api/v1/dashboard/summary", (route) =>
    route.fulfill(
      mockApi({
        windowSinceMs: Date.now() - 24 * 60 * 60 * 1000,
        windowUntilMs: Date.now(),
        eventCount: 1287,
        uniqueRiskCodes: 18,
        lastEventAt: Date.now() - 3 * 60 * 1000,
        severityCounts: { critical: 12, high: 87, medium: 416, low: 772 },
        hourlyBuckets: [
          18, 24, 31, 47, 62, 88, 102, 137, 168, 142, 121, 95, 84, 72, 58, 49, 41, 35, 28, 22, 17, 12, 9, 6,
        ],
        topRiskCodes: [
          { code: "R01.pii.email", count: 312 },
          { code: "R02.secrets.api-key", count: 184 },
          { code: "R03.code.proprietary", count: 142 },
          { code: "R04.health.phi", count: 88 },
          { code: "R05.finance.account", count: 64 },
        ],
      }),
    ),
  );
  await page.route("**/api/v1/analyzations?limit=5", (route) =>
    route.fulfill(
      mockApi({
        items: [
          {
            id: "ev_001",
            riskCode: "R01.pii.email",
            riskCategory: "PII",
            occurredAt: Date.now() - 3 * 60 * 1000,
            ownerEmail: "alice@symphoneed.co.jp",
          },
          {
            id: "ev_002",
            riskCode: "R02.secrets.api-key",
            riskCategory: "Secrets",
            occurredAt: Date.now() - 12 * 60 * 1000,
            ownerEmail: "bob@symphoneed.co.jp",
          },
          {
            id: "ev_003",
            riskCode: "R03.code.proprietary",
            riskCategory: "Code",
            occurredAt: Date.now() - 27 * 60 * 1000,
            ownerEmail: "carol@symphoneed.co.jp",
          },
          {
            id: "ev_004",
            riskCode: "R01.pii.email",
            riskCategory: "PII",
            occurredAt: Date.now() - 48 * 60 * 1000,
            ownerEmail: null,
          },
          {
            id: "ev_005",
            riskCode: "R04.health.phi",
            riskCategory: "Health",
            occurredAt: Date.now() - 73 * 60 * 1000,
            ownerEmail: "dan@symphoneed.co.jp",
          },
        ],
      }),
    ),
  );

  // Devices
  await page.route("**/api/v1/devices", (route) =>
    route.fulfill(
      mockApi({
        items: [
          {
            id: "dev_mac_01",
            label: "alice's MacBook Pro",
            platform: "darwin",
            ownerEmail: "alice@symphoneed.co.jp",
            lastSeenAt: Date.now() - 4 * 60 * 1000,
            country: "JP",
            city: "Tokyo",
            lat: 35.68,
            lng: 139.76,
          },
          {
            id: "dev_win_02",
            label: "bob's ThinkPad",
            platform: "windows",
            ownerEmail: "bob@symphoneed.co.jp",
            lastSeenAt: Date.now() - 22 * 60 * 1000,
            country: "JP",
            city: "Osaka",
            lat: 34.69,
            lng: 135.5,
          },
          {
            id: "dev_mac_03",
            label: "carol's Mac mini",
            platform: "darwin",
            ownerEmail: "carol@symphoneed.co.jp",
            lastSeenAt: Date.now() - 5 * 60 * 60 * 1000,
            country: "JP",
            city: "Nakano",
            lat: 35.71,
            lng: 139.66,
          },
        ],
      }),
    ),
  );

  // Analyzations (full list)
  await page.route("**/api/v1/analyzations**", (route) =>
    route.fulfill(
      mockApi({
        items: Array.from({ length: 12 }).map((_, i) => ({
          id: `ev_${String(100 + i)}`,
          riskCode: ["R01.pii.email", "R02.secrets.api-key", "R03.code.proprietary", "R04.health.phi"][i % 4],
          riskCategory: ["PII", "Secrets", "Code", "Health"][i % 4],
          occurredAt: Date.now() - (i + 1) * 7 * 60 * 1000,
          ownerEmail: i % 3 === 0 ? null : `user${i}@symphoneed.co.jp`,
          summary: `イベント ${i + 1} のサマリ`,
          severity: ["critical", "high", "medium", "low"][i % 4],
        })),
        nextCursor: null,
      }),
    ),
  );

  // Patterns / Rules
  await page.route("**/api/v1/patterns/groups", (route) =>
    route.fulfill(
      mockApi({
        groups: [
          {
            id: "g_pii",
            name: "PII (個人情報)",
            description: "メール・電話・住所などの個人識別情報",
            severity: "high",
            enabled: true,
            patternCount: 7,
            updatedAt: Date.now() - 24 * 60 * 60 * 1000,
          },
          {
            id: "g_secrets",
            name: "Secrets / 認証情報",
            description: "API key、トークン、パスワード等の秘匿情報",
            severity: "critical",
            enabled: true,
            patternCount: 12,
            updatedAt: Date.now() - 3 * 24 * 60 * 60 * 1000,
          },
          {
            id: "g_code",
            name: "ソースコード流出",
            description: "社内コードと推測されるパターン",
            severity: "medium",
            enabled: true,
            patternCount: 4,
            updatedAt: Date.now() - 7 * 24 * 60 * 60 * 1000,
          },
          {
            id: "g_finance",
            name: "Finance",
            description: "口座番号・カード番号",
            severity: "high",
            enabled: false,
            patternCount: 5,
            updatedAt: Date.now() - 14 * 24 * 60 * 60 * 1000,
          },
        ],
      }),
    ),
  );

  // Members
  await page.route("**/api/v1/members", (route) =>
    route.fulfill(
      mockApi({
        items: [
          { id: "m_1", email: "taku@symphoneed.co.jp", role: "owner", name: "Taku", createdAt: Date.now() - 90 * 24 * 60 * 60 * 1000 },
          { id: "m_2", email: "alice@symphoneed.co.jp", role: "admin", name: "Alice", createdAt: Date.now() - 60 * 24 * 60 * 60 * 1000 },
          { id: "m_3", email: "bob@symphoneed.co.jp", role: "member", name: "Bob", createdAt: Date.now() - 30 * 24 * 60 * 60 * 1000 },
          { id: "m_4", email: "carol@symphoneed.co.jp", role: "member", name: "Carol", createdAt: Date.now() - 14 * 24 * 60 * 60 * 1000 },
        ],
      }),
    ),
  );

  // Settings — health + sessions
  await page.route("**/api/v1/health", (route) =>
    route.fulfill(mockApi({ status: "ok" })),
  );
  await page.route("**/api/v1/sessions", (route) =>
    route.fulfill(
      mockApi({
        items: [
          {
            id: "s_1",
            userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X)",
            ip: "203.0.113.10",
            createdAt: Date.now() - 2 * 60 * 60 * 1000,
            current: true,
          },
          {
            id: "s_2",
            userAgent: "Mozilla/5.0 (Windows NT 10.0)",
            ip: "203.0.113.42",
            createdAt: Date.now() - 3 * 24 * 60 * 60 * 1000,
            current: false,
          },
        ],
      }),
    ),
  );

  // Catch-all for /api/** that we didn't enumerate — return 200 with sensible empty payload.
  await page.route("**/api/**", (route) =>
    route.fulfill(mockApi({ items: [], ok: true })),
  );
}

test.describe("Branch C — admin SPA", () => {
  test("C1 — signup", async ({ page }) => {
    await installAdminMocks(page);
    const script = createVideoScript()
      .title("Admin — 新規登録", { durationMs: 1400 })
      .segment(
        "SymVal の管理画面、サインアップ画面です。会社のメールアドレスを入力すると、マジックリンクが届いてアカウントが作成されます。",
      )
      .outro({ durationMs: 1000 });

    await page.goto(`${ADMIN}/signup`);
    const result = await script.render(page, { outputDir: TMP_DIR, baseName: "C1-signup" });
    appendLeafToManifest({
      id: "C1",
      title: "Signup",
      branch: "C",
      url: `${ADMIN}/signup`,
      mp4Path: result.mp4Path ?? `${TMP_DIR}/C1-signup.mp4`,
      srtPath: detachSrtForViewer(result.srtPath),
      totalMs: result.totalMs,
    });
  });

  test("C2 — login", async ({ page }) => {
    await installAdminMocks(page);
    const script = createVideoScript()
      .title("Admin — ログイン", { durationMs: 1400 })
      .segment(
        "ログイン画面です。マジックリンクまたは OAuth プロバイダ経由でサインインできます。デスクトップアプリの「sign in」ボタンからもここに遷移します。",
      )
      .outro({ durationMs: 1000 });

    await page.goto(`${ADMIN}/login`);
    const result = await script.render(page, { outputDir: TMP_DIR, baseName: "C2-login" });
    appendLeafToManifest({
      id: "C2",
      title: "Login",
      branch: "C",
      url: `${ADMIN}/login`,
      mp4Path: result.mp4Path ?? `${TMP_DIR}/C2-login.mp4`,
      srtPath: detachSrtForViewer(result.srtPath),
      totalMs: result.totalMs,
    });
  });

  test("C5 — dashboard", async ({ page }) => {
    await installAdminMocks(page);
    const script = createVideoScript()
      .title("Dashboard — リスク全景", { durationMs: 1600 })
      .segment(
        "ダッシュボードでは、組織全体の検知イベント数、重大度別の内訳、時間帯ごとの推移、上位のリスクコードが一目で確認できます。",
        async (pace) => {
          await pace();
          await page.evaluate(() => window.scrollTo({ top: 320, behavior: "smooth" }));
          await pace();
        },
      )
      .segment(
        "下にスクロールすると、最近検知されたイベントの一覧が表示されます。ここからクリックすると詳細の解析画面に遷移します。",
        async (pace) => {
          await page.evaluate(() => window.scrollTo({ top: 720, behavior: "smooth" }));
          await pace();
        },
      )
      .outro({ durationMs: 1200 });

    await page.goto(`${ADMIN}/`);
    const result = await script.render(page, { outputDir: TMP_DIR, baseName: "C5-dashboard" });
    appendLeafToManifest({
      id: "C5",
      title: "Dashboard",
      branch: "C",
      url: `${ADMIN}/`,
      mp4Path: result.mp4Path ?? `${TMP_DIR}/C5-dashboard.mp4`,
      srtPath: detachSrtForViewer(result.srtPath),
      totalMs: result.totalMs,
    });
  });

  test("C6 — devices", async ({ page }) => {
    await installAdminMocks(page);
    const script = createVideoScript()
      .title("Devices — 端末一覧", { durationMs: 1500 })
      .segment(
        "組織に紐付いた端末の一覧画面です。プラットフォーム、所有者、最終接続時刻が並び、地図ビューで分布も確認できます。",
        async (pace) => {
          await pace();
          await page.evaluate(() => window.scrollTo({ top: 360, behavior: "smooth" }));
          await pace();
        },
      )
      .outro({ durationMs: 1100 });

    await page.goto(`${ADMIN}/devices`);
    const result = await script.render(page, { outputDir: TMP_DIR, baseName: "C6-devices" });
    appendLeafToManifest({
      id: "C6",
      title: "Devices",
      branch: "C",
      url: `${ADMIN}/devices`,
      mp4Path: result.mp4Path ?? `${TMP_DIR}/C6-devices.mp4`,
      srtPath: detachSrtForViewer(result.srtPath),
      totalMs: result.totalMs,
    });
  });

  test("C7 — analyzations", async ({ page }) => {
    await installAdminMocks(page);
    const script = createVideoScript()
      .title("Analyzations — 解析結果", { durationMs: 1400 })
      .segment(
        "解析タブでは、検知されたイベントを時系列で確認できます。各行から元のプロンプトやレスポンスのコンテキストを参照できます。",
        async (pace) => {
          await pace();
          await page.evaluate(() => window.scrollTo({ top: 320, behavior: "smooth" }));
          await pace();
        },
      )
      .outro({ durationMs: 1100 });

    await page.goto(`${ADMIN}/analyzations`);
    const result = await script.render(page, { outputDir: TMP_DIR, baseName: "C7-analyzations" });
    appendLeafToManifest({
      id: "C7",
      title: "Analyzations",
      branch: "C",
      url: `${ADMIN}/analyzations`,
      mp4Path: result.mp4Path ?? `${TMP_DIR}/C7-analyzations.mp4`,
      srtPath: detachSrtForViewer(result.srtPath),
      totalMs: result.totalMs,
    });
  });

  test("C8 — rules", async ({ page }) => {
    await installAdminMocks(page);
    const script = createVideoScript()
      .title("Rules — ルール管理", { durationMs: 1400 })
      .segment(
        "リスクパターングループの管理画面です。PII、Secrets、ソースコード流出など、組織のポリシーに合わせて検知ルールを編集できます。",
        async (pace) => {
          await pace();
          await page.evaluate(() => window.scrollTo({ top: 280, behavior: "smooth" }));
          await pace();
        },
      )
      .outro({ durationMs: 1100 });

    await page.goto(`${ADMIN}/rules`);
    const result = await script.render(page, { outputDir: TMP_DIR, baseName: "C8-rules" });
    appendLeafToManifest({
      id: "C8",
      title: "Rules",
      branch: "C",
      url: `${ADMIN}/rules`,
      mp4Path: result.mp4Path ?? `${TMP_DIR}/C8-rules.mp4`,
      srtPath: detachSrtForViewer(result.srtPath),
      totalMs: result.totalMs,
    });
  });

  test("C9 — members", async ({ page }) => {
    await installAdminMocks(page);
    const script = createVideoScript()
      .title("Members — 組織メンバー", { durationMs: 1300 })
      .segment(
        "メンバー管理画面です。所有者、管理者、一般メンバーの権限を編集したり、新規メンバーを招待できます。",
      )
      .outro({ durationMs: 1000 });

    await page.goto(`${ADMIN}/members`);
    const result = await script.render(page, { outputDir: TMP_DIR, baseName: "C9-members" });
    appendLeafToManifest({
      id: "C9",
      title: "Members",
      branch: "C",
      url: `${ADMIN}/members`,
      mp4Path: result.mp4Path ?? `${TMP_DIR}/C9-members.mp4`,
      srtPath: detachSrtForViewer(result.srtPath),
      totalMs: result.totalMs,
    });
  });

  test("C10 — settings", async ({ page }) => {
    await installAdminMocks(page);
    const script = createVideoScript()
      .title("Settings — 組織と個人設定", { durationMs: 1400 })
      .segment(
        "設定画面では、組織情報、個人プロフィール、API ヘルスチェック、アクティブセッションなどをまとめて管理できます。",
        async (pace) => {
          await pace();
          await page.evaluate(() => window.scrollTo({ top: 480, behavior: "smooth" }));
          await pace();
        },
      )
      .outro({ durationMs: 1100 });

    await page.goto(`${ADMIN}/settings`);
    const result = await script.render(page, { outputDir: TMP_DIR, baseName: "C10-settings" });
    appendLeafToManifest({
      id: "C10",
      title: "Settings",
      branch: "C",
      url: `${ADMIN}/settings`,
      mp4Path: result.mp4Path ?? `${TMP_DIR}/C10-settings.mp4`,
      srtPath: detachSrtForViewer(result.srtPath),
      totalMs: result.totalMs,
    });
  });
});
