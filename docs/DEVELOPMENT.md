# DEVELOPMENT.md — 開発手順

## 前提ツール

| ツール | バージョン | 備考 |
|---|---|---|
| Node.js | 22 以上 | |
| pnpm | 9 系 | `packageManager` フィールドで固定(corepack 可) |
| Docker + Compose v2 | 任意 | macOS は Docker Desktop / colima 等 |

## 初回セットアップ

README の「セットアップ」を参照。要約:

```bash
pnpm install
cp .env.example .env
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
cp packages/database/.env.example packages/database/.env
pnpm infra:up
pnpm db:migrate
pnpm db:check
pnpm dev
```

## 日常の開発フロー

1. `docs/IMPLEMENTATION_PLAN.md` から着手するタスクIDを1つ選ぶ(前提タスクの完了を確認)
2. ブランチを切る(例: `feat/SCORE-002-pokemon-hit`)
3. 実装+テストを書く(タスクの「必要なテスト」を満たす)
4. 検証: `pnpm check`(= lint + typecheck + test + build)
5. `git diff` を確認し、作業範囲外の変更が混ざっていないことを確認
6. コミットメッセージにタスクIDを含める(例: `SCORE-002: ポケモン一致スコアを実装`)

## よく使うコマンド

| コマンド | 内容 |
|---|---|
| `pnpm dev` | 全アプリ起動(web :5173 / api :3000) |
| `pnpm --filter @pokemon-champions/api dev` | API のみ起動 |
| `pnpm --filter @pokemon-champions/web dev` | Web のみ起動 |
| `pnpm lint` / `pnpm typecheck` / `pnpm test` / `pnpm build` | 各検証(Turborepo 経由) |
| `pnpm check` | 上記4つを一括実行 |
| `pnpm test:e2e` | Playwright E2E(API/Web を自動起動) |
| `pnpm --filter <pkg> test -- --watch` | 特定パッケージの watch テスト |
| `pnpm infra:up` / `pnpm infra:down` | PostgreSQL / Redis 起動・停止 |
| `pnpm db:migrate` | マイグレーション作成+適用(開発用) |
| `pnpm db:generate` | Prisma クライアント再生成 |
| `pnpm db:check` | DB 接続確認スクリプト |
| `pnpm --filter @pokemon-champions/database db:seed` | 開発用サンプルマスタを検証・冪等投入 |
| `pnpm --filter @pokemon-champions/database db:studio` | Prisma Studio |
| `pnpm format` | Prettier 一括整形 |

## 開発用サンプルマスタの投入

PostgreSQLを起動し、MASTER-001〜004のmigrationを適用した状態で実行する。

```bash
pnpm db:generate
pnpm --filter @pokemon-champions/database db:seed
```

ポケモン、技、持ち物、特性、習得可能技、シーズン、ルールの全入力をZodで検証してから、
単一トランザクションで投入する。不正な入力や参照不整合がある場合はDBを変更しない。
同じコマンドは再実行可能で、実行後に種類別・合計の追加、更新、変更なし件数を表示する。

## E2E(Playwright)の初回準備

```bash
pnpm --filter @pokemon-champions/web exec playwright install chromium
pnpm test:e2e
```

`playwright.config.ts` の `webServer` が API と Web を自動起動する(起動済みならそれを再利用)。

## トラブルシューティング

| 症状 | 対処 |
|---|---|
| `pnpm db:migrate` が接続エラー | `pnpm infra:up` 済みか、`packages/database/.env` の `DATABASE_URL` がルート `.env` の POSTGRES_* と一致しているか確認 |
| Web で「API 接続エラー」 | API(:3000)が起動しているか。`curl localhost:3000/api/v1/health` で確認 |
| `@prisma/client` の型が見つからない | `pnpm db:generate` を実行 |
| workspace パッケージの型が古い | `pnpm build`(または対象パッケージの `build`)で dist を更新 |
| ポート衝突 | ルート/`apps/api` の `.env` でポートを変更 |

## 守るべき規約

作業規約(タスク分割・仕様変更手順・品質基準)は [AGENTS.md](../AGENTS.md) を必読。
テスト方針は [TESTING.md](./TESTING.md)、API 規約は [API_CONVENTIONS.md](./API_CONVENTIONS.md)、
DB 変更手順は [DATABASE_MIGRATION_POLICY.md](./DATABASE_MIGRATION_POLICY.md) を参照。
