# SymVal Demo Userflow Graph

新規(しんき)ユーザーが `symval.pages.dev` から SymVal を発見(はっけん) → install → サインアップ → デスクトップ + 管理(かんり)画面(がめん)を一通(ひととお)り体験(たいけん)するまでの全(ぜん)ブランチ。各(かく) leaf が demowright で録画(ろくが)する 1 動画(どうが)に対応(たいおう)。

## Branch tree

```
root: https://symval.pages.dev/  (Coming-soon LP + 招待リクエスト form)
│
├── A. landing  (静的(せいてき) LP 系(けい))
│   ├── A1  /                       — Coming-soon, brand 露出(ろしゅつ) + 招待(しょうたい) form
│   ├── A2  /private-lp/            — 招待者(しょうたいしゃ)向(む)け full LP (pastel arcs, hero, features)
│   ├── A3  /survey/                — AI × 生産性(せいさんせい) アンケート (3–5 分)
│   ├── A4  /docs/                  — Docs index (sidebar 付(つ)き)
│   ├── A5  /docs/how-to-macos.html — macOS install guide
│   └── A6  /docs/how-to-windows.html — Windows install guide
│
├── B. desktop storybook  (Electron UI の各(かく) view、`lib/desktop` の Storybook)
│   ├── B1  Views/SetupChecklist — Fresh Install   (CA 未(み)、daemon 未(み)、proxy 未(み))
│   ├── B2  Views/SetupChecklist — In Progress     (CA 済(ず) / proxy 未(み) / 未(み)サインイン)
│   ├── B3  Views/SetupChecklist — Signed In       (auth 済(ず) / device 紐付(ひもづ)け済(ず))
│   ├── B4  Views/StatusHome — Setup Complete      (全部(ぜんぶ) green、未(み)サインイン)
│   ├── B5  Views/StatusHome — Signed In           (管理者(かんりしゃ)モード)
│   ├── B6  Views/ProxySettingsView — NotConfigured
│   └── B7  Views/ProxySettingsView — AllRunning
│
└── C. admin SPA  (https://symval-admin.pages.dev/、React Router)
    ├── auth path
    │   ├── C1  /signup           — 新規(しんき)登録(とうろく)
    │   ├── C2  /login            — ログイン
    │   ├── C3  /oauth/consent    — OAuth 同意(どうい)画面(がめん)
    │   └── C4  /device           — Device pairing
    └── inside Layout (auth 後(ご))
        ├── C5  /                 — Dashboard (severity, hourly, recent events)
        ├── C6  /devices          — Device list + globe view
        ├── C7  /analyzations     — 解析(かいせき) tab
        ├── C8  /rules            — Rule 一覧(いちらん)・編集(へんしゅう)
        ├── C9  /members          — Org members
        └── C10 /settings         — Org / personal settings
```

## Edges (流(なが)れ)

ユーザー視点(してん)で見(み)た "次(つぎ)に進(すす)む" 矢印(やじるし):

```
root(A1)
  ├─→ A2 (CTA "詳しく見る")
  │     ├─→ A3 (CTA "アンケートに答える")
  │     └─→ A4 (CTA "インストール手順を見る")
  │           ├─→ A5
  │           └─→ A6
  │
  │   ※ install 完了(かんりょう)後(ご)、Desktop アプリ起動(きどう) → B1
  │
  ├─→ B1 (Fresh Install)
  │     └─→ B2 (CA install / daemon 起動(きどう) 後(ご))
  │           └─→ B3 (Sign in 後(ご))
  │
  ├─→ B6 (ProxySettings 未(み)設定(せってい))
  │     └─→ B7 (全(ぜん) ON)
  │
  ├─→ B4 (StatusHome 完了(かんりょう))
  │     └─→ B5 (Signed In)
  │
  └─→ C2 (admin login、Desktop "sign in" ボタンから web へ遷移(せんい))
        ├─→ C1 (新規(しんき)なら signup へ)
        ├─→ C3 (OAuth consent)
        └─→ C4 (device pairing 成功(せいこう) 後(ご))
              └─→ C5 (Dashboard)
                    ├─→ C6 (Devices)
                    │     └─→ /devices/:id 詳細(しょうさい) (DeviceSidePanel)
                    ├─→ C7 (Analyzations)
                    ├─→ C8 (Rules)
                    ├─→ C9 (Members)
                    └─→ C10 (Settings)
```

## 録画(ろくが) plan (1 leaf = 1 mp4)

| ID | Source | Spec file | 秒数(びょうすう) | TTS |
|----|--------|-----------|---|---|
| A2 | `symval.pages.dev/private-lp/` (**tracer 第1弾(だんいち)**) | `branch-a-landing.spec.ts` | 25s | gemini |
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

合計(ごうけい): **19 leaf clips ≈ 5 分(ふん)** (advisor 助言(じょげん)で B3 と stateful な C3/C4、内容(ないよう)薄(うす)い A1 を除外(じょがい))。

`tmp/videos/&lt;ID&gt;.mp4` に保存(ほぞん) → `tmp/videos/manifest.json` に `{id, title, srtPath, mp4Path, driveFileId, previewUrl}` を追記(ついき)。

## Aborted / 後回(あとまわ)し

| ID | 内容(ないよう) | 理由(りゆう) |
|----|---|---|
| A1 | `symval.pages.dev/` 現状(げんじょう) coming-soon | 内容(ないよう)が薄(うす)く 12s narration が冗長(じょうちょう)。A2 の intro に統合(とうごう) |
| B3 | `views-setupchecklist--signed-in-first` | 現(げん) storybook-static build に未(み)含(ふく)。`storybook:build` 再(さい)実行(じっこう)で追加(ついか)可能(かのう) |
| C3 | `/oauth/consent` | stateful flow、mock 追加(ついか) cost |
| C4 | `/device` pairing | 同上(どうじょう) |

## Notes

- **admin (C5–C10)** は **ローカル mock** で撮(と)る:
  1. `cd lib/admin && VITE_API_BASE_URL=http://localhost:5174 bun run dev`
  2. `examples/symval-demo/admin-mock-server.ts` を `localhost:5174` で立(た)てて API を stub
  3. Playwright は `localhost:5173` を開(あ)き、`localStorage.setItem('auth',...)` で login 状態(じょうたい)を bypass
- **storybook (B*)** は **既(すで)に build 済(ず)みの static** を使(つか)う (cold start 不要(ふよう)):
  - `bunx serve lib/desktop/storybook-static -p 6006`
  - URL: `localhost:6006/iframe.html?id=<storyId>&viewMode=story`
- **landing (A*)** は本番(ほんばん) URL `https://symval.pages.dev/...` に直接(ちょくせつ) hit。
- **TTS**: 親(おや) `.env.local` の `GEMINI_API_KEY` を `examples/symval-demo/playwright.config.ts` で読(よ)み込(こ)む。
- **Drive アップ**: 録画(ろくが) test 完了(かんりょう)後(ご) afterAll hook で `gws drive files create --upload ... && gws drive permissions create` を呼(よ)び manifest に `fileId` 追記(ついき)。preview URL は `https://drive.google.com/file/d/<id>/preview` (iframe 埋(う)め込(こ)み可(か))。
