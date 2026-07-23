# API_CONVENTIONS.md — API 実装規約

設計の正は [PRODUCT_SPEC.md](./PRODUCT_SPEC.md) §10。本書は実装上の取り決め。

## 基本

- REST / JSON。パスは `/api/v1/...`(`shared` の `API_PREFIX` を使用。ハードコードしない)
- 認証: Bearer トークン(JWT)。AUTH 系タスクで導入
- リソース名は複数形スネークなし(`/sessions`, `/parties`, `/master/pokemons`)
- JSON のプロパティは camelCase(DB は snake_case、Prisma の `@map` で変換)

## 入出力検証(必須)

- リクエストボディ/クエリは `packages/shared` の zod スキーマで検証する
  - NestJS では `ZodValidationPipe`(`apps/api/src/common/pipes`)を使用
- レスポンスも共有スキーマを通す(契約の単一ソース化)
- スキーマは `packages/shared/src/api/<feature>.ts` に置き、フロントは同じスキーマでレスポンスを検証する

## エラーレスポンス

RFC 9457 (Problem Details) 形式(`shared` の `problemDetailsSchema`):

```json
{
  "type": "about:blank",
  "title": "Validation Failed",
  "status": 400,
  "code": "VALIDATION_ERROR",
  "errors": [{ "path": "pokemonId", "message": "Required" }]
}
```

- `code` は `shared` の `APP_ERROR_CODES` から選ぶ(必要になったら追加)
- スタックトレース・内部情報をレスポンスに含めない

## エンドポイント追加の手順

1. `packages/shared/src/api/` にリクエスト/レスポンスの zod スキーマと型を定義
2. `apps/api/src/modules/<feature>/` に module / controller / service を作成
3. controller は薄く: 検証 → service 呼び出し → レスポンス
4. ドメイン計算は `scoring` / `matchup` を呼ぶ(API 層に計算式を書かない)
5. `apps/api/test/` に API テストを追加(ハッピーパス+検証エラー)

## 認可(AUTH 系タスク以降)

- 管理 API(`/admin/...`)は `role=admin` チェック
- パーティ・セッションは所有者チェック(他ユーザーのリソースは 404 を返す)

## レート制限(設計書 §14)

- 観測入力 API: 60req/分/ユーザー(BATTLE 系タスクで導入)

## 互換性

- 破壊的変更(フィールド削除・型変更)は `/api/v2` を検討。v1 内では後方互換を保つ
- フィールド追加は互換扱い。ただし shared スキーマ・ドキュメントを同時に更新する
