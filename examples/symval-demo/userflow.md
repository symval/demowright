# SymVal Demo Userflow Graph

新規ユーザーが `symval.pages.dev` から SymVal を発見 → install → サインアップ → デスクトップ + 管理画面を一通り体験するまでの全ブランチ。各 leaf が demowright で録画する 1 動画に対応。

## Branch tree

```
root: https://symval.pages.dev/  (Coming-soon LP + 招待リクエスト form)
│
├── A. landing  (静的 LP 系)
│   ├── A1  /                       — Coming-soon, brand 露出 + 招待 form
│   ├── A2  /private-lp/            — 招待者向け full LP (pastel arcs, hero, features)
│   ├── A3  /survey/                — AI × 生産性 アンケート (3–5 分)
│   ├── A4  /docs/                  — Docs index (sidebar 付き)
│   ├── A5  /docs/how-to-macos.html — macOS install guide
│   └── A6  /docs/how-to-windows.html — Windows install guide
│
├── B. desktop storybook  (Electron UI の各 view、`lib/desktop` の Storybook)
│   ├── B1  Views/SetupChecklist — Fresh Install   (CA 未、daemon 未、proxy 未)
│   ├── B2  Views/SetupChecklist — In Progress     (CA 済 / proxy 未 / 未サインイン)
│   ├── B3  Views/SetupChecklist — Signed In       (auth 済 / device 紐付け済)
│   ├── B4  Views/StatusHome — Setup Complete      (全部 green、未サインイン)
│   ├── B5  Views/StatusHome — Signed In           (管理者モード)
│   ├── B6  Views/ProxySettingsView — NotConfigured
│   └── B7  Views/ProxySettingsView — AllRunning
│
└── C. admin SPA  (https://symval-admin.pages.dev/、React Router)
    ├── auth path
    │   ├── C1  /signup           — 新規登録
    │   ├── C2  /login            — ログイン
    │   ├── C3  /oauth/consent    — OAuth 同意画面
    │   └── C4  /device           — Device pairing
    └── inside Layout (auth 後)
        ├── C5  /                 — Dashboard (severity, hourly, recent events)
        ├── C6  /devices          — Device list + globe view
        ├── C7  /analyzations     — 解析 tab
        ├── C8  /rules            — Rule 一覧・編集
        ├── C9  /members          — Org members
        └── C10 /settings         — Org / personal settings
```

## Edges (流れ)

ユーザー視点で見た "次に進む" 矢印:

```
root(A1)
  ├─→ A2 (CTA "詳しく見る")
  │     ├─→ A3 (CTA "アンケートに答える")
  │     └─→ A4 (CTA "インストール手順を見る")
  │           ├─→ A5
  │           └─→ A6
  │
  │   ※ install 完了後、Desktop アプリ起動 → B1
  │
  ├─→ B1 (Fresh Install)
  │     └─→ B2 (CA install / daemon 起動 後)
  │           └─→ B3 (Sign in 後)
  │
  ├─→ B6 (ProxySettings 未設定)
  │     └─→ B7 (全 ON)
  │
  ├─→ B4 (StatusHome 完了)
  │     └─→ B5 (Signed In)
  │
  └─→ C2 (admin login、Desktop "sign in" ボタンから web へ遷移)
        ├─→ C1 (新規なら signup へ)
        ├─→ C3 (OAuth consent)
        └─→ C4 (device pairing 成功 後)
              └─→ C5 (Dashboard)
                    ├─→ C6 (Devices)
                    │     └─→ /devices/:id 詳細 (DeviceSidePanel)
                    ├─→ C7 (Analyzations)
                    ├─→ C8 (Rules)
                    ├─→ C9 (Members)
                    └─→ C10 (Settings)
```

## 録画 plan (1 leaf = 1 mp4)

| ID | Source | Spec file | 秒数 | TTS |
|----|--------|-----------|---|---|
| A2 | `symval.pages.dev/private-lp/` (**tracer 第1弾**) | `branch-a-landing.spec.ts` | 25s | gemini |
| A3 | `/survey/` | 〃 | 18s | gemini |
| A4 | `/docs/` | 〃 | 10s | gemini |
| A5 | `/docs/how-to-macos.html` | 〃 | 15s | gemini |
| A6 | `/docs/how-to-windows.html` | 〃 | 15s | gemini |
| B1 | storybook `views-setupchecklist--fresh-install` | `branch-b-desktop-storybook.spec.ts` | 15s | gemini |
| B2 | `views-setupchecklist--in-progress` | 〃 | 15s | gemini |
| B4 | `views-statushome--setup-complete` | 〃 | 12s | gemini |
| B5 | `views-statushome--signed-in` | 〃 | 12s | gemini |
| B6 | `views-proxysettingsview--not-configured` | 〃 | 12s | gemini |
| B7 | `views-proxysettingsview--all-running` | 〃 | 12s | gemini |
| C1 | `symval-admin.pages.dev/signup` | `branch-c-admin.spec.ts` | 20s | gemini |
| C2 | `/login` | 〃 | 15s | gemini |
| C5 | `/` Dashboard (mock data) | 〃 | 25s | gemini |
| C6 | `/devices` (mock data) | 〃 | 20s | gemini |
| C7 | `/analyzations` (mock data) | 〃 | 18s | gemini |
| C8 | `/rules` (mock data) | 〃 | 18s | gemini |
| C9 | `/members` (mock data) | 〃 | 15s | gemini |
| C10 | `/settings` (mock data) | 〃 | 15s | gemini |

合計: **19 leaf clips ≈ 5 分** (advisor 助言で B3 と stateful な C3/C4、内容薄い A1 を除外)。

`tmp/videos/&lt;ID&gt;.mp4` に保存 → `tmp/videos/manifest.json` に `{id, title, srtPath, mp4Path, driveFileId, previewUrl}` を追記。

## Aborted / 後回し

| ID | 内容 | 理由 |
|----|---|---|
| A1 | `symval.pages.dev/` 現状 coming-soon | 内容が薄く 12s narration が冗長。A2 の intro に統合 |
| B3 | `views-setupchecklist--signed-in-first` | 現 storybook-static build に未含。`storybook:build` 再実行で追加可能 |
| C3 | `/oauth/consent` | stateful flow、mock 追加 cost |
| C4 | `/device` pairing | 同上 |

## Notes

- **admin (C5–C10)** は **ローカル mock** で撮る:
  1. `cd lib/admin && VITE_API_BASE_URL=http://localhost:5174 bun run dev`
  2. `examples/symval-demo/admin-mock-server.ts` を `localhost:5174` で立てて API を stub
  3. Playwright は `localhost:5173` を開き、`localStorage.setItem('auth',...)` で login 状態を bypass
- **storybook (B*)** は **既に build 済みの static** を使う (cold start 不要):
  - `bunx serve lib/desktop/storybook-static -p 6006`
  - URL: `localhost:6006/iframe.html?id=<storyId>&viewMode=story`
- **landing (A*)** は本番 URL `https://symval.pages.dev/...` に直接 hit。
- **TTS**: 親 `.env.local` の `GEMINI_API_KEY` を `examples/symval-demo/playwright.config.ts` で読み込む。
- **Drive アップ**: 録画 test 完了後 afterAll hook で `gws drive files create --upload ... && gws drive permissions create` を呼び manifest に `fileId` 追記。preview URL は `https://drive.google.com/file/d/<id>/preview` (iframe 埋め込み可)。
