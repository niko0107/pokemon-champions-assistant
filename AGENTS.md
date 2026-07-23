# AGENTS.md — 開発エージェント向け作業規約

このリポジトリで作業するすべての AI エージェント・開発者は本規約に従うこと。
プロダクト仕様は `docs/PRODUCT_SPEC.md`、タスク一覧は `docs/IMPLEMENTATION_PLAN.md` が正。

## タスクの進め方

1. **1回の作業では原則1つのタスクIDだけを実装する**(タスクIDは `docs/IMPLEMENTATION_PLAN.md` 参照)
2. **複数機能をまとめて実装しない**。タスクの「対象外」に列挙された事項に手を出さない
3. **設計書(`docs/PRODUCT_SPEC.md`)の仕様を勝手に削除・変更しない**
4. **仕様変更が必要な場合は、実装前に理由と変更案を提示し**、承認後に `docs/DECISIONS.md` へ記録する
5. 作業開始前にタスクの「前提タスク」が完了しているか確認する

## アーキテクチャ規約

- **UI、API、ドメインロジック、DB アクセスを分離する**
  - UI: `apps/web` / API: `apps/api` / ドメインロジック: `packages/scoring`, `packages/matchup` / DB: `packages/database`
- **一致度計算(scoring)と相性判定(matchup)は UI や DB に依存しない純粋なロジックにする**
  - 副作用(I/O・時刻取得・乱数)禁止。入力はすべて引数、出力は戻り値のみ
  - DB エンティティを直接受け取らず、Snapshot 型に変換して渡す
- 共有する型・スキーマ・定数・列挙値は `packages/shared` に置き、重複定義しない

## コード品質

- **TypeScript の `any` を安易に使用しない**(ESLint で error 設定。やむを得ない場合は理由コメント必須)
- **API の入出力は zod で検証する**(スキーマは `packages/shared` に定義)
- エラーレスポンスは RFC 9457 (Problem Details) 形式(`packages/shared` の `problemDetailsSchema`)

## セキュリティ・法務

- **秘密情報(API キー・パスワード・接続文字列)をコードにハードコードしない**。環境変数(`.env`)を使い、`.env.example` に用途を記載する
- `VITE_` プレフィックスの環境変数はブラウザへ公開される。秘密情報を入れない
- **外部サイト(攻略サイト等)の本文や画像を転載しない**。構造化データ+出典 URL のみ扱う

## 検証・完了条件

- **実装後は必ず以下を実行し、すべて成功させる:**
  ```bash
  pnpm lint && pnpm typecheck && pnpm test && pnpm build
  ```
- **テストを無効化(skip / 削除 / 期待値の改変)してエラーを回避しない**
- **既存テストを理由なく削除しない**。仕様変更に伴う削除は理由を PR / DECISIONS.md に記録する
- **作業範囲外のコードを勝手に変更しない**(フォーマッタの巻き込み変更も避ける)
- **`git diff` / `git status` を確認してから作業完了を報告する**。意図しない変更が含まれていないこと

## コマンド早見表

| 目的 | コマンド |
|---|---|
| 依存インストール | `pnpm install` |
| インフラ起動(PostgreSQL/Redis) | `pnpm infra:up` |
| DB マイグレーション | `pnpm db:migrate` |
| DB 接続確認 | `pnpm db:check` |
| 全アプリ開発起動 | `pnpm dev` |
| lint / typecheck / test / build | `pnpm lint` / `pnpm typecheck` / `pnpm test` / `pnpm build` |
| 一括チェック | `pnpm check` |
| E2E(Playwright) | `pnpm test:e2e` |
