# ARCHITECTURE.md — システム構成

設計の正は [PRODUCT_SPEC.md](./PRODUCT_SPEC.md)(§2 システム全体構成)。本書はコードベースの実装構成を説明する。

## モノレポ構成と依存方向

```
                 ┌─────────────┐
                 │  apps/web   │  React SPA (UI層)
                 └──────┬──────┘
                        │ HTTP (REST /api/v1, 将来 WebSocket)
                 ┌──────▼──────┐
                 │  apps/api   │  NestJS (API層)
                 └─┬────┬────┬─┘
        ┌──────────┘    │    └───────────┐
┌───────▼────────┐ ┌────▼─────────┐ ┌────▼────────────┐
│ packages/      │ │ packages/    │ │ packages/       │
│ scoring        │ │ matchup      │ │ database        │
│ (一致度計算)    │ │ (相性判定)    │ │ (Prisma)        │
└───────┬────────┘ └────┬─────────┘ └────┬────────────┘
        │               │                │
        └───────┬───────┘                │
        ┌───────▼────────┐               │
        │ packages/shared │◄─────────────┘
        │ (型/zod/定数)   │◄── apps/web からも参照
        └────────────────┘
```

依存ルール:

- `shared` は何にも依存しない(zod のみ)
- `scoring` / `matchup` は `shared` のみに依存する。**UI・API・DB・I/O に依存しない純粋関数のみ**(設計書 §2.2「判定ロジックはルールベース」の実装原則)
- `database` は Prisma のみ。ドメインロジックを持たない
- `apps/api` が各パッケージを組み立てる(DB エンティティ → Snapshot 型への変換は api 層の責務)
- `apps/web` は `shared` のみ参照(API 契約の型・スキーマ共有)

## レイヤー分離

| レイヤー | 場所 | 責務 |
|---|---|---|
| UI | `apps/web/src` | 画面・入力・表示。サーバー状態は TanStack Query、クライアント状態は Zustand |
| API | `apps/api/src/modules/*` | ルーティング・認証認可・zod検証・ユースケース組み立て |
| ドメイン | `packages/scoring`, `packages/matchup` | 一致度計算・相性判定(決定的・純粋) |
| データ | `packages/database` | Prisma スキーマ・クライアント |
| 契約 | `packages/shared` | API 型・zod スキーマ・定数・列挙値・エラー型 |

## apps/api の内部構成

```
src/
  main.ts                 # bootstrap(グローバルプレフィックス /api/v1, CORS)
  app.module.ts
  modules/<feature>/      # 機能単位のモジュール(controller / service / module)
  common/
    pipes/                # ZodValidationPipe など横断部品
```

- コントローラは薄く保ち、入出力の zod 検証と HTTP 変換のみを行う
- ドメイン計算は必ず `scoring` / `matchup` を呼ぶ。API 層に計算式を書かない
- Redis / LLM は将来アダプター(インターフェース+実装)として `apps/api` 側に追加する
  - LLM は設計書 §12 の通り「説明文生成のみ」。フォールバック(テンプレ文)を必ず持つ

## apps/web の内部構成

```
src/
  main.tsx                # QueryClientProvider 等のプロバイダ構成
  App.tsx
  lib/                    # api-client(zod検証付き fetch)・query-client
  stores/                 # Zustand ストア(UIローカル状態)
  features/<feature>/     # 機能単位(hooks + components)
```

- API レスポンスは必ず `shared` の zod スキーマで検証してから使う
- サーバー状態(API 由来)を Zustand に複製しない

## ローカルインフラ

`infrastructure/docker/docker-compose.yml` で PostgreSQL 16 / Redis 7 を起動(healthcheck 付き)。
接続情報は各 `.env` で管理(README 参照)。

## ビルドパイプライン

- Turborepo がタスクグラフを管理。`build` は `^build`(依存パッケージのビルド)後に実行
- packages は tsup で ESM + CJS の双方を `dist/` に出力(web=ESM, api=CJS の双方から参照可能)
- `packages/database` の build は `prisma generate` を含む
