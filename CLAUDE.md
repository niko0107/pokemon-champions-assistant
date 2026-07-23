# CLAUDE.md

Pokémon Champions 対戦支援 Web サービスのモノレポ。
**作業規約は `AGENTS.md` に従うこと(必読)。** 仕様は `docs/PRODUCT_SPEC.md`、タスクは `docs/IMPLEMENTATION_PLAN.md` が正。

## 構成

- `apps/web` — React + Vite + Tailwind + TanStack Query + Zustand(UI)
- `apps/api` — NestJS + Zod + Prisma(API)
- `packages/shared` — API 共通型 / zod スキーマ / 定数 / 列挙値 / エラー型
- `packages/database` — Prisma スキーマ・クライアント
- `packages/scoring` — 一致度計算エンジン(純粋関数のみ。UI/DB 依存禁止)
- `packages/matchup` — 相性判定エンジン(純粋関数のみ。UI/DB 依存禁止)
- `infrastructure/docker` — ローカル用 PostgreSQL / Redis

## 必須ルール(詳細は AGENTS.md)

- 1回の作業では原則1つのタスクIDだけを実装する。複数機能をまとめて実装しない
- 設計書の仕様を勝手に削除・変更しない。変更が必要なら実装前に理由と変更案を提示する
- UI / API / ドメインロジック / DB アクセスを分離する。scoring・matchup は純粋ロジックに保つ
- `any` を安易に使わない。API 入出力は zod で検証する
- 秘密情報をコードに書かない。外部サイトの本文・画像を転載しない
- 実装後は `pnpm lint && pnpm typecheck && pnpm test && pnpm build` を実行し全成功させる
- テストの無効化・理由なき削除でエラーを回避しない。作業範囲外のコードを変更しない
- `git diff` を確認してから完了報告する

## よく使うコマンド

```bash
pnpm install          # 依存インストール
pnpm infra:up         # PostgreSQL + Redis 起動(要 Docker)
pnpm db:migrate       # Prisma マイグレーション(packages/database/.env が必要)
pnpm db:check         # DB 接続確認
pnpm dev              # web(:5173) + api(:3000) を起動
pnpm check            # lint + typecheck + test + build 一括実行
pnpm test:e2e         # Playwright E2E
```

環境変数のセットアップ: ルート・`apps/api`・`apps/web`・`packages/database` の各 `.env.example` を `.env` にコピーする(README 参照)。
