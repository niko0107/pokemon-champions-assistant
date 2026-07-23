# DATABASE_MIGRATION_POLICY.md — DB マイグレーション運用

対象: `packages/database`(Prisma + PostgreSQL)。スキーマの正は設計書 §6。

## 基本方針

- スキーマ変更はすべて Prisma Migrate のマイグレーションファイル(`packages/database/prisma/migrations/`)で管理し、**Git にコミットする**
- 手動 SQL での本番変更・`prisma db push` の本番使用は禁止(ローカル試行にも原則使わない)
- 1マイグレーション = 1タスクID を原則とし、マイグレーション名にタスク内容を反映する
  - 例: `pnpm db:migrate -- --name master_001_pokemons`
- 設計書 §6 との対応を保つ。設計書にないテーブル/カラムを追加する場合は先に DECISIONS.md へ記録する

## コマンド

| 目的 | コマンド |
|---|---|
| 開発: マイグレーション作成+適用 | `pnpm db:migrate`(= `prisma migrate dev`) |
| 本番/CI: 適用のみ | `pnpm --filter @pokemon-champions/database db:deploy` |
| クライアント再生成 | `pnpm db:generate` |
| 接続確認 | `pnpm db:check` |

## 命名・型の規約

- テーブル名: snake_case 複数形(`@@map`)。カラム名: snake_case(`@map`)。Prisma モデル/フィールドは PascalCase / camelCase
- 主キー: ユーザー生成データは `uuid`、マスタ系は `serial`(設計書 §6 に従う)
- 列挙値は当面 `text` + アプリ層(zod / shared の定数)で検証する。DB enum 化は将来判断(DECISIONS 参照)
- 時刻は `timestamptz`。`created_at` / `updated_at` を持つテーブルは Prisma の `@default(now())` / `@updatedAt` を使用
- JSONB カラム(`abilities`, `tags`, `evs` 等)は shared に対応する zod スキーマを定義して読み書き時に検証する

## 変更フロー

1. 対象タスク(例: MASTER-001)の範囲のモデルだけを `schema.prisma` に追加・変更する
2. `pnpm db:migrate -- --name <task>_<summary>` でマイグレーション生成
3. 生成された SQL を目視レビュー(意図しない DROP がないこと)
4. `pnpm db:check` と関連テストを実行
5. マイグレーションファイルを含めてコミット

## 破壊的変更の扱い

- カラム削除・型変更・NOT NULL 化は「追加 → 移行 → 切替 → 削除」の多段マイグレーションで行う
- 適用済みマイグレーションの書き換え(編集・削除)は禁止。修正は新しいマイグレーションで行う
- データ移行が必要な場合はマイグレーション SQL に含め、冪等性に留意する

## ロールバック

- Prisma Migrate に自動ロールバックはない。失敗時は「打ち消しマイグレーション」を新規作成して前進的に戻す
- 本番適用前に必ずローカル+ステージング相当で `db:deploy` を検証する

## インデックス

設計書 §6.6 のインデックス方針(archetypes / archetype_pokemons / archetype_pokemon_moves / observations)は、対応テーブル導入タスク内で同時に作成する。
