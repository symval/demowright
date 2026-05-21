/**
 * Branch C — Admin SPA (lib/admin) served by `bun --cwd lib/admin run dev`.
 *
 * The admin uses Better Auth cookie sessions and a cross-origin API at
 * https://symval-api.pages.dev. Instead of standing up a real API + real
 * cookie flow, we intercept every /api/** call with page.route() and return
 * the minimum shape each page consumes.
 *
 * IMPORTANT — route registration order:
 *   Playwright tries routes in REVERSE registration order so the last-
 *   registered match wins. The catch-all (**\/api/**) is therefore
 *   registered FIRST here so the specific routes registered after it
 *   take priority. Reversing this order silently breaks every page.
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
const TENANT_ID = "symphoneed";

const MOCK_USER = {
  id: "demo-user-1",
  email: "demo@symphoneed.co.jp",
  name: "Demo Admin",
  role: "admin" as const,
  tenantId: TENANT_ID,
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

function mockApi(payload: unknown) {
  return {
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(payload),
  };
}

/**
 * Install mocks for the admin's API surface.
 * Order matters: catch-all is registered FIRST so the specific routes after
 * it win (Playwright tries last-registered first).
 */
async function installAdminMocks(page: Page) {
  // (1) Catch-all FIRST — anything we don't enumerate gets a benign empty
  // payload. Registered first so it has the lowest priority.
  await page.route("**/api/**", (route) =>
    route.fulfill(mockApi({ items: [], ok: true })),
  );

  // (2) Better Auth session — admin Layout gates on this.
  await page.route("**/api/auth/get-session", (route) =>
    route.fulfill(mockApi({ user: MOCK_USER, session: MOCK_SESSION })),
  );

  // (3) Dashboard summary
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

  // (4) Analyzations — list endpoint with optional limit/cursor query.
  // Shape: `{ items: Row[], cursor: string | null }` — Row needs tenantId,
  // deviceId, anonymizedPayload, llmScore, llmLabel as well.
  const riskCodes = [
    { code: "R01.pii.email", category: "PII" },
    { code: "R02.secrets.api-key", category: "Secrets" },
    { code: "R03.code.proprietary", category: "Code" },
    { code: "R04.health.phi", category: "Health" },
  ];
  const owners = [
    "alice@symphoneed.co.jp",
    "bob@symphoneed.co.jp",
    "carol@symphoneed.co.jp",
    "dan@symphoneed.co.jp",
  ];
  function buildAnalyzations(n: number) {
    return Array.from({ length: n }).map((_, i) => {
      const r = riskCodes[i % riskCodes.length];
      return {
        id: `ev_${String(100 + i).padStart(4, "0")}`,
        tenantId: TENANT_ID,
        deviceId: `dev_${(i % 3) + 1}`,
        riskCode: r.code,
        riskCategory: r.category,
        occurredAt: Date.now() - (i + 1) * 7 * 60 * 1000,
        anonymizedPayload: JSON.stringify({
          host_prefix: ["chat.openai", "claude.ai", "gemini.google"][i % 3],
          direction: "outbound",
          first_party: i % 4 === 0,
          ai_service: true,
        }),
        llmScore: 0.6 + ((i * 13) % 35) / 100,
        llmLabel: ["likely", "possible", "confirmed"][i % 3],
        ownerEmail: i % 5 === 0 ? null : owners[i % owners.length],
      };
    });
  }
  await page.route("**/api/v1/analyzations**", (route) => {
    const url = new URL(route.request().url());
    const limit = Number(url.searchParams.get("limit") ?? 50);
    route.fulfill(
      mockApi({
        items: buildAnalyzations(Math.min(limit, 24)),
        cursor: null,
      }),
    );
  });

  // (5) Devices — shape is SidePanelDevice + tenantId.
  // The page uses these fields explicitly: id, city, country, platform,
  // userEmail, userName, registeredAt, riskScore, appVersion, osVersion,
  // eventCount24h, lastEventAt, tenantId.
  await page.route("**/api/v1/devices", (route) =>
    route.fulfill(
      mockApi({
        items: [
          {
            id: "dev_mac_01",
            tenantId: TENANT_ID,
            platform: "darwin",
            city: "Tokyo",
            country: "JP",
            userEmail: "alice@symphoneed.co.jp",
            userName: "Alice",
            registeredAt: Date.now() - 30 * 24 * 60 * 60 * 1000,
            riskScore: 4,
            appVersion: "1.4.2",
            osVersion: "14.5",
            eventCount24h: 312,
            lastEventAt: Date.now() - 4 * 60 * 1000,
          },
          {
            id: "dev_win_02",
            tenantId: TENANT_ID,
            platform: "win32",
            city: "Osaka",
            country: "JP",
            userEmail: "bob@symphoneed.co.jp",
            userName: "Bob",
            registeredAt: Date.now() - 14 * 24 * 60 * 60 * 1000,
            riskScore: 2,
            appVersion: "1.4.2",
            osVersion: "Windows 11 23H2",
            eventCount24h: 87,
            lastEventAt: Date.now() - 22 * 60 * 1000,
          },
          {
            id: "dev_mac_03",
            tenantId: TENANT_ID,
            platform: "darwin",
            city: "Nakano",
            country: "JP",
            userEmail: "carol@symphoneed.co.jp",
            userName: "Carol",
            registeredAt: Date.now() - 7 * 24 * 60 * 60 * 1000,
            riskScore: 1,
            appVersion: "1.4.1",
            osVersion: "14.4",
            eventCount24h: 41,
            lastEventAt: Date.now() - 5 * 60 * 60 * 1000,
          },
        ],
      }),
    ),
  );

  // (6) Patterns / Rules — Group shape requires patterns[], version,
  // redact, updatedBy, compileStatus, compileError. Missing any of these
  // crashes the render because the page maps over patterns and reads the
  // compile fields directly.
  await page.route("**/api/v1/patterns/groups", (route) =>
    route.fulfill(
      mockApi({
        groups: [
          {
            id: "g_pii",
            name: "PII (個人情報)",
            description: "メール・電話・住所などの個人識別情報",
            severity: "high",
            redact: true,
            enabled: true,
            patterns: [
              "\\b[\\w._%+-]+@[\\w.-]+\\.[A-Za-z]{2,}\\b",
              "\\b0\\d{1,4}-\\d{1,4}-\\d{4}\\b",
              "\\b\\d{3}-\\d{4}\\b",
              "(?i)passport[\\s:]+[A-Z0-9]{7,9}",
              "(?i)my[-_ ]?number[\\s:]+\\d{12}",
              "\\b[\\d]{16}\\b",
              "(?i)driver[-_ ]?license",
            ],
            version: 4,
            updatedAt: Date.now() - 24 * 60 * 60 * 1000,
            updatedBy: "taku@symphoneed.co.jp",
            compileStatus: "ok",
            compileError: null,
          },
          {
            id: "g_secrets",
            name: "Secrets / 認証情報",
            description: "API key、トークン、パスワード等の秘匿情報",
            severity: "critical",
            redact: true,
            enabled: true,
            patterns: [
              "sk-[A-Za-z0-9]{32,}",
              "AKIA[0-9A-Z]{16}",
              "ghp_[A-Za-z0-9]{36}",
              "AIza[0-9A-Za-z_-]{35}",
              "xoxb-\\d+-\\d+-[A-Za-z0-9]+",
              "(?i)bearer\\s+[A-Za-z0-9._~+/-]+=*",
              "-----BEGIN (?:RSA |EC )?PRIVATE KEY-----",
            ],
            version: 7,
            updatedAt: Date.now() - 3 * 24 * 60 * 60 * 1000,
            updatedBy: "alice@symphoneed.co.jp",
            compileStatus: "ok",
            compileError: null,
          },
          {
            id: "g_code",
            name: "ソースコード流出",
            description: "社内コードと推測されるパターン",
            severity: "medium",
            redact: false,
            enabled: true,
            patterns: [
              "(?m)^import\\s+\\{[^}]+\\}\\s+from\\s+['\"]@symval/",
              "(?m)^package\\s+co\\.symphoneed\\.",
              "(?i)proprietary",
            ],
            version: 2,
            updatedAt: Date.now() - 7 * 24 * 60 * 60 * 1000,
            updatedBy: "bob@symphoneed.co.jp",
            compileStatus: "ok",
            compileError: null,
          },
          {
            id: "g_finance",
            name: "Finance",
            description: "口座番号・カード番号",
            severity: "high",
            redact: true,
            enabled: false,
            patterns: ["\\b\\d{4}-\\d{4}-\\d{4}-\\d{4}\\b", "\\b\\d{7,8}\\b"],
            version: 1,
            updatedAt: Date.now() - 14 * 24 * 60 * 60 * 1000,
            updatedBy: null,
            compileStatus: "ok",
            compileError: null,
          },
        ],
      }),
    ),
  );

  // (7) Members — role enum is admin | manager | member (NOT owner).
  await page.route("**/api/v1/members", (route) =>
    route.fulfill(
      mockApi({
        items: [
          {
            id: "m_1",
            tenantId: TENANT_ID,
            email: "taku@symphoneed.co.jp",
            role: "admin",
            createdAt: Date.now() - 90 * 24 * 60 * 60 * 1000,
          },
          {
            id: "m_2",
            tenantId: TENANT_ID,
            email: "alice@symphoneed.co.jp",
            role: "admin",
            createdAt: Date.now() - 60 * 24 * 60 * 60 * 1000,
          },
          {
            id: "m_3",
            tenantId: TENANT_ID,
            email: "bob@symphoneed.co.jp",
            role: "manager",
            createdAt: Date.now() - 30 * 24 * 60 * 60 * 1000,
          },
          {
            id: "m_4",
            tenantId: TENANT_ID,
            email: "carol@symphoneed.co.jp",
            role: "member",
            createdAt: Date.now() - 14 * 24 * 60 * 60 * 1000,
          },
          {
            id: "m_5",
            tenantId: TENANT_ID,
            email: "dan@symphoneed.co.jp",
            role: "member",
            createdAt: Date.now() - 7 * 24 * 60 * 60 * 1000,
          },
        ],
      }),
    ),
  );

  // (8) Settings — health + sessions
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
        "メンバー管理画面です。管理者、マネージャー、一般メンバーの権限を編集したり、新規メンバーを招待できます。",
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
