# Pokémon Champions 対戦支援サービス

対戦中に見えた断片情報(ポケモン・技など)から相手のテンプレ構築を予測し、
自分のパーティに基づく対策(おすすめ選出・警戒技)を提示する Web サービス。

- 仕様: [docs/PRODUCT_SPEC.md](docs/PRODUCT_SPEC.md)
- タスク一覧: [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md)
- 開発手順の詳細: [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)
- 作業規約: [AGENTS.md](AGENTS.md)

> 本サービスは任天堂・株式会社ポケモンとは関係のない非公式ツールです。

## 技術スタック

pnpm workspace + Turborepo / React + Vite + Tailwind CSS + TanStack Query + Zustand /
NestJS + Zod + Prisma / PostgreSQL + Redis / Vitest + Playwright / Docker Compose

## リポジトリ構成

```
apps/web            # フロントエンド (React SPA)
apps/api            # バックエンド (NestJS, /api/v1)
packages/shared     # 共通型・zodスキーマ・定数・列挙値・エラー型
packages/database   # Prisma スキーマ・クライアント
packages/scoring    # 一致度計算エンジン(純粋ロジック)
packages/matchup    # 相性判定エンジン(純粋ロジック)
infrastructure/     # Docker Compose (PostgreSQL / Redis)
docs/               # 設計書・開発ドキュメント
```

## セットアップ

前提: Node.js 22+ / pnpm 9+ / Docker(Compose v2)

```bash
# 1. 依存インストール
pnpm install

# 2. 環境変数ファイルを作成(下表参照。ローカル開発は例の値のままで動作する)
cp .env.example .env
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
cp packages/database/.env.example packages/database/.env

# 3. PostgreSQL + Redis 起動(healthcheck 通過まで待機)
pnpm infra:up

# 4. マイグレーション適用 + 接続確認
pnpm db:migrate
pnpm db:check

# 5. 開発サーバー起動(web: http://localhost:5173 / api: http://localhost:3000)
pnpm dev
```

動作確認: <http://localhost:5173> を開き「API 接続 OK」と表示されること。
または `curl http://localhost:3000/api/v1/health` → `{"status":"ok"}`。

## 環境変数

秘密情報は各 `.env`(Git 管理外)にのみ書く。`.env.example` は値のプレースホルダのみ。
フロントエンド(`VITE_` プレフィックス)とバックエンドの変数はファイルごと分離している。

### ルート `.env` — Docker Compose 用

| 変数 | 用途 | 既定値 |
|---|---|---|
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | PostgreSQL コンテナの初期化 | pokemon / pokemon_local_dev / pokemon_champions |
| `POSTGRES_PORT` | ホスト側公開ポート | 5432 |
| `REDIS_PORT` | ホスト側公開ポート | 6379 |

### `apps/api/.env` — バックエンド

| 変数 | 用途 |
|---|---|
| `PORT` | API サーバーのポート(既定 3000) |
| `CORS_ORIGIN` | CORS 許可オリジン(カンマ区切り) |
| `DATABASE_URL` | PostgreSQL 接続文字列(Prisma が使用) |
| `REDIS_URL` | Redis 接続文字列(SETUP-010 以降で使用) |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | JWT 署名鍵(AUTH 系タスクで使用。必ず生成し直すこと) |
| `JWT_ACCESS_EXPIRES_IN` / `JWT_REFRESH_EXPIRES_IN` | トークン有効期限 |
| `ANTHROPIC_API_KEY` | LLM 理由文生成(LLM 系タスクで使用。未設定でも動作すること) |

### `apps/web/.env` — フロントエンド

| 変数 | 用途 |
|---|---|
| `VITE_API_BASE_URL` | API のベース URL。未設定なら同一オリジン(開発時は Vite プロキシが `/api` を :3000 へ転送)。**`VITE_` 変数はブラウザに公開されるため秘密情報禁止** |

### `packages/database/.env` — Prisma CLI

| 変数 | 用途 |
|---|---|
| `DATABASE_URL` | `prisma migrate` / `prisma studio` / `pnpm db:check` が使用 |

## 主なコマンド

| コマンド | 内容 |
|---|---|
| `pnpm dev` | 全アプリを開発モードで起動 |
| `pnpm check` | lint + typecheck + test + build を一括実行 |
| `pnpm test:e2e` | Playwright E2E(初回は `pnpm --filter @pokemon-champions/web exec playwright install chromium`) |
| `pnpm infra:up` / `pnpm infra:down` | PostgreSQL / Redis の起動・停止 |
| `pnpm db:generate` / `pnpm db:migrate` / `pnpm db:check` | Prisma クライアント生成 / マイグレーション / 接続確認 |
