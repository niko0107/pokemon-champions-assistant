# TESTING.md — テスト方針

## テストの層

| 層 | ツール | 場所 | 対象 |
|---|---|---|---|
| 単体テスト | Vitest | 各パッケージ `src/**/*.test.ts` | 純粋ロジック(scoring / matchup)、共有スキーマ、ストア等 |
| API テスト | Vitest + NestJS Testing (+supertest) | `apps/api/test/**/*.e2e-spec.ts` | エンドポイントの入出力契約 |
| E2E | Playwright | `apps/web/e2e/**/*.spec.ts` | ブラウザからの主要フロー |

実行コマンド:

```bash
pnpm test        # 単体 + API テスト(Turborepo 経由で全パッケージ)
pnpm test:e2e    # Playwright
```

## 方針

### 単体テスト(最重要: scoring / matchup)

- 一致度計算・相性判定は**純粋関数**なので、DB・モックなしでテストできる状態を維持する
- 設計書の数値仕様(§7.2 配点表、付録A の 89% 例、§9.2 配点)をそのままテストケース化する
- 雛形として `it.todo` を配置済み。**ロジック実装タスクで todo を実テストに置き換える**
- 境界値(raw_score が負 / max_score=0 / 除外条件ちょうど)を必ずカバーする

### API テスト

- NestJS の `Test.createTestingModule` でアプリを組み立て、supertest で HTTP レベルの契約を検証する
- レスポンスは `packages/shared` の zod スキーマで検証し、フロントとの契約が崩れていないことを保証する
- DB が必要なテストは、当面は Prisma をモック(またはテスト用 Service 差し替え)。
  実 DB 結合テストの導入は SETUP-011(テストDB整備)で扱う

### E2E テスト

- 対戦中の 90 秒 UX に関わる主要フロー(入力 → 候補 → 対策)を最優先で自動化する(該当機能の実装タスクに含める)
- 現段階は起動確認スモーク(トップ表示+ヘルスチェック疎通)のみ
- セレクタは `data-testid` / ロールを使い、CSS クラスに依存しない

## 禁止事項(AGENTS.md より再掲)

- テストを無効化(skip・削除・期待値改変)してエラーを回避しない
- 既存テストを理由なく削除しない(仕様変更に伴う場合は理由を記録)
- テスト内で実時刻・乱数に依存しない(必要なら引数注入)

## 新規タスクでのテスト要件

各タスクの「必要なテスト」(docs/IMPLEMENTATION_PLAN.md)を満たすこと。
目安: ドメインロジックは網羅的な単体テスト、API はハッピーパス+検証エラー、UI は重要フローの E2E。
