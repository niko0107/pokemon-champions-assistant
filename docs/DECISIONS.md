# DECISIONS.md — 技術判断の記録

仕様・実装に関わる判断と、その理由を時系列で記録する。
設計書(PRODUCT_SPEC.md)の変更を伴う場合は、実装前に提案・合意の上で本書に記録する。

---

## 2026-07-24 プロジェクト基盤構築(SETUP-001〜007)

### D-001: zod は v3 系を採用

- **判断:** `zod@^3.24` に統一(shared / api / web)
- **理由:** NestJS 周辺エコシステムとの互換実績を優先。v4 への移行はエコシステムの追従を見て別タスクで判断する
- **影響:** 全パッケージの zod バージョンは揃えること(スキーマ互換性のため)

### D-002: 共有パッケージは tsup で ESM + CJS 双方を出力

- **判断:** packages/{shared,database,scoring,matchup} は tsup で `dist/index.js`(ESM)と `dist/index.cjs`(CJS)を出力
- **理由:** apps/web(Vite=ESM)と apps/api(NestJS=CJS)の双方から同一パッケージを参照するため
- **影響:** パッケージを跨ぐ変更後は `pnpm build`(Turborepo が依存順にビルド)が必要

### D-003: API テストは Vitest + NestJS Testing で実行

- **判断:** 設計方針の「単体テスト: Vitest / API テスト: NestJS Testing」を、`@nestjs/testing` + supertest を **Vitest 上で**動かす構成で実現(Jest は導入しない)
- **理由:** テストランナーを Vitest に一本化し、モノレポ全体の設定・実行を単純化するため。デコレータメタデータは `unplugin-swc` で対応
- **影響:** apps/api の vitest.config.ts に swc プラグイン設定が必要

### D-004: Prisma スキーマは最小モデル(SystemHealthCheck)から開始

- **判断:** 初回マイグレーションは接続確認用の `system_health_checks` テーブルのみ
- **理由:** 依頼要件(DB 接続確認に必要な最低限)。設計書 §6 の全テーブルは MASTER/AUTH/PARTY/ARCHETYPE/BATTLE 系タスクで段階的に追加する
- **影響:** 本テーブルは本格運用後も死活監視の書き込み確認先として残せる

### D-005: DB の列挙値は当面 text + アプリ層検証

- **判断:** `popularity_tier` 等は DB enum にせず text + shared の定数/zod で検証
- **理由:** シーズン運用中の値追加・変更にマイグレーション不要で追従できる柔軟性を優先。設計書 §6 も text 表記
- **影響:** 不正値の防止はアプリ層の責務(ZodValidationPipe 必須)

### D-006: 環境変数は用途別に4ファイルへ分離

- **判断:** ルート(Docker Compose)/ apps/api / apps/web / packages/database の4つの `.env` に分離
- **理由:** 依頼要件「フロントとバックエンドの環境変数を分離」。特に `VITE_` 変数はブラウザへ公開されるため、バックエンド秘密情報との同居を構造的に防ぐ
- **影響:** セットアップ時に4ファイルのコピーが必要(README 記載)

### D-007: 開発時の Web→API 通信は Vite プロキシ経由

- **判断:** `/api/*` を Vite の dev プロキシで :3000 へ転送。`VITE_API_BASE_URL` は本番等で別オリジンにする場合のみ設定
- **理由:** ローカルで CORS 設定に依存せず、本番(同一オリジン配信 or CDN)にも対応できる
- **影響:** API 側の CORS 設定は保険として維持(`CORS_ORIGIN`)

### D-008: API プレフィックスは shared の定数で一元管理

- **判断:** `/api/v1` は `packages/shared` の `API_PREFIX` / `API_BASE_PATH` を全箇所で使用
- **理由:** バージョニング変更時の修正漏れ防止
- **影響:** パスのハードコード禁止(API_CONVENTIONS.md)

### D-009: scoring / matchup は Snapshot 型を受け取る純粋関数

- **判断:** ドメインエンジンは Prisma エンティティを直接受け取らず、`ArchetypeSnapshot` 等の専用型を受け取る。DB→Snapshot 変換は apps/api の責務
- **理由:** 設計書 §2.2(決定的アルゴリズム・再現性)と開発ルール(UI/DB 非依存の純粋ロジック)の実装保証。テストが DB なしで書ける
- **影響:** BATTLE-002 等で変換層の実装が必要

### D-010: ロジック未実装の関数は明示的に throw する雛形とする

- **判断:** `scoreArchetype` 等は `Not implemented` を throw し、テストでもそれを検証。将来仕様は `it.todo` で列挙
- **理由:** 誤って未実装のまま呼び出された場合に静かに誤動作せず即座に失敗させる。todo が実装タスクの受け入れ条件リストを兼ねる
- **影響:** ロジック実装タスクでは throw の除去+ todo の実テスト化をセットで行う

### D-011: CI(SETUP-008)は今回の基盤構築に含めない

- **判断:** GitHub Actions の整備は SETUP-008 として登録のみ
- **理由:** 依頼の初回完了条件に CI は含まれず、リモートリポジトリ未設定のため検証できない
- **影響:** 次タスクの最有力候補(IMPLEMENTATION_PLAN 参照)

### D-012: Git リポジトリを初期化(コミットは未実施)

- **判断:** `git init` を実施し `.gitignore` を整備。初回コミットはユーザー判断に委ねる
- **理由:** 開発ルール「Git 差分を確認してから完了報告」にはリポジトリが必要。コミット・プッシュは指示があるまで行わない方針
- **影響:** 以後のタスクは通常の diff 運用が可能

### D-013: Playwright は chromium のみ・起動確認1件から開始

- **判断:** E2E はデスクトップ Chrome 1プロジェクト、スモークテスト1件(トップ表示+ヘルス疎通)
- **理由:** 依頼要件(最低限の起動確認テストを1件)。モバイルビューポート等は WEB-010 で拡充
- **影響:** 初回実行前に `playwright install chromium` が必要

### D-014: ローカルの Docker ランタイムは colima を使用

- **判断:** この開発機では Docker Desktop ではなく colima + docker CLI + docker-compose(brew)で動作確認した
- **理由:** 既にインストール済みの環境を利用。compose v2 プラグインは `~/.docker/cli-plugins` にシンボリックリンクで導入
- **影響:** 他の開発者は Docker Desktop 等でも問題ない(compose v2 が使えれば良い)

### D-015: 設計書にない補助タスクIDの追加

- **判断:** 設計書・依頼の例示タスクに加え、SETUP-009〜011 / MASTER-003〜009 / SCORE-006〜007 / MATCHUP-002〜008 / WEB-004〜011 / LLM / WS / OPS / ENCOUNTER / HISTORY 系を追加し、SCORE 系は例示の ID(SCORE-002〜005)を維持したまま細分化した
- **理由:** 「1タスク=1セッションで完了できる粒度」の要件を満たすため。依存関係は IMPLEMENTATION_PLAN の前提タスク欄に明記
- **影響:** タスクの追加・変更時は IMPLEMENTATION_PLAN と本書を更新する

## 2026-07-24 ポケモンマスタスキーマ(MASTER-001)

### D-016: ポケモンの形態識別・自己参照・CHECK 制約

- **判断:** ポケモンの形態は `(dex_no, form)` で一意にする。`form` は必須の非空文字列とし、通常形態を含む具体的な表記はデータ投入側で統一する
- **判断:** `base_pokemon_id` は同じ `pokemons` テーブルへの自己参照とし、参照先の削除は `RESTRICT` する。メガ形態は元ポケモン必須、非メガのリージョン・派生形態も必要に応じて元ポケモンを参照できる
- **判断:** 図鑑番号は正数、種族値は 1〜255、必須文字列は非空、複合タイプは同一タイプ不可、自己参照不可を PostgreSQL の CHECK 制約で保証する
- **判断:** `abilities` は特性名の JSON 配列とする。DB は「1件以上の JSON 配列」までを保証し、非空文字列・重複なしは `packages/shared` の zod スキーマで保証する
- **判断:** 日本語名・英語名には通常の B-tree インデックスを作成する。部分一致検索用の `pg_trgm` 等は MASTER-006 でクエリと実行計画を確認して判断する
- **理由:** 設計書 §6.2 の項目を保ちつつ、不正なマスタ行と派生形態の孤児化を DB 層で防ぎ、検索方式が未確定の段階で PostgreSQL 拡張へ依存しないため
- **影響:** データ投入時は全行に `form` と1件以上の特性名が必要。将来の削除処理は派生形態を先に処理する必要がある

## 2026-07-24 技マスタスキーマ(MASTER-002)

### D-017: 技名・数値範囲・タグの制約

- **判断:** 日本語名と英語名はそれぞれ一意とする。両言語の一意制約が作る B-tree インデックスを名前検索の基礎とし、部分一致用インデックスは MASTER-007 で実行計画を確認して判断する
- **判断:** `power` は null または 1〜300、`accuracy` は null または 1〜100、`priority` は -7〜5 とする。変化技・威力不定技の `power`、必中技の `accuracy` を null で表現し、優先度の既定値は0とする
- **判断:** `category` は text のまま `physical` / `special` / `status` に限定する。`type` は text の非空制約のみとし、タイプ許可値の共通定義は MATCHUP-002 と整合させる
- **判断:** `tags` は空配列を許可する JSON 配列とし、DB は JSON 配列であること、shared の zod は `MoveTag` の許可値・文字列型・重複なしを保証する。タグ検索用に GIN インデックスを作成する
- **理由:** 設計書 §6.2 の nullable 表現を維持しつつ、現行ゲームデータとして不自然な数値と分類値を防ぎ、タグ値を一致度・相性ロジックで安全に共有するため
- **影響:** 新しい技分類・タグ・範囲外の値を追加する場合は、shared の定数とDB制約を同じタスクで更新する必要がある

## 2026-07-24 持ち物・特性マスタスキーマ(MASTER-003)

### D-018: 持ち物・特性の名称と効果タグ

- **判断:** Item と Ability の日本語名・英語名は、各テーブル内でそれぞれ一意とする。一意制約が作る B-tree インデックスを名前検索の基礎とし、部分一致用インデックスは MASTER-007 で実行計画を確認して判断する
- **判断:** ItemTag と AbilityTag は用途が異なるため別の許可値として定義する。ItemTag は `choice` / `berry` / `mega_stone` 等の持ち物分類、AbilityTag はタイプ無効・ダメージ補正・天候等の相性判定向け分類を表す
- **判断:** `effect_tags` は空配列を許可する JSON 配列とする。DB は JSON 配列であること、shared の zod はタグの許可値・文字列型・重複なしを保証し、両テーブルに GIN インデックスを作成する
- **判断:** メガストーンと対象ポケモン、特性と所持可能ポケモンの関連は本モデルへ直接持たせず、後続の関連テーブルで扱う
- **理由:** 設計書 §6.2 の共通構造を保ちつつ、用途の異なるタグを型安全に利用し、関連モデルが未確定な段階で特定ポケモンへの依存を持ち込まないため
- **影響:** タグ追加時は該当する shared の許可値と検証テストを同時に更新する必要がある

## 2026-07-25 習得可能技・シーズン・ルールのスキーマ(MASTER-004)

### D-019: 習得可能技の粒度とシーズン・ルール制約

- **判断:** 習得可能技はフォルムごとの `pokemon_id` と `move_id` を複合主キーにした `pokemon_moves` で表現する。習得方法・ゲーム世代等は現行仕様にないため追加せず、必要になった時点で別タスクとして設計する
- **判断:** Pokemon または Move が削除された場合、独立した意味を持たない関連行は CASCADE 削除する。複合主キーをポケモンからの検索に使い、技からの逆引き用に `move_id` のインデックスを追加する
- **判断:** Season 名と Rule 名は各テーブル内で全体一意とする。Season の開始日・終了日は必須の DATE とし、終了日が開始日以降であることを DB と zod の双方で保証する
- **判断:** Rule の `team_size` と `pick_size` は1〜6の整数とし、`pick_size <= team_size` を DB と zod の双方で保証する
- **判断:** DB は外部キー・一意性・期間・人数の永続的な整合性を担い、shared の zod はAPI等へ入る値の形式と同じ業務条件を早期に検証する
- **理由:** 設計書 §6.2 と §11.3 の最小要件を満たし、未確定属性を追加せず、フォルム差・削除時の孤児化・不正な期間や人数をDB層で防ぐため
- **影響:** 習得方法や世代別の差分が必要になった場合は複合主キーを含むデータモデルの再検討が必要になる

## 2026-07-25 ポケモン検索 API(MASTER-006)

### D-020: ポケモン検索の入力条件・一致方式・返却仕様

- **判断:** `q` は必須・trim 後2〜50文字とする。未指定・空・空白のみ・1文字は 400(VALIDATION_ERROR)。全件返却モードは設けない
- **判断:** 検索対象は日本語名・英語名・フォルムの3フィールド。英語名・フォルムは大文字小文字を区別しない(Prisma `mode: "insensitive"`)。日本語名は区別ありのまま(カナ正規化は将来課題)
- **判断:** 前方一致 → 部分一致(前方一致分を除外)の2段クエリで優先度を付け、各段内は `dexNo → isMega(通常形態優先)→ form → id` の決定的ソートとする
- **判断:** 返却は固定上限10件。`limit` パラメータは今回導入しない(必要になった画面タスクで追加判断)
- **判断:** レスポンスはオートコンプリートに必要な `id / dexNo / nameJa / nameEn / form / type1 / type2 / isMega / basePokemonId` のみ。abilities・種族値は返さない。`basePokemonId` は候補のグルーピング(メガ⇔通常)用に含める
- **判断:** pg_trgm は導入を保留。生 SQL も使用しない。数百件規模では Prisma クエリビルダの ILIKE で十分(実測 約2ms)。データ件数増加で実行計画が悪化した時点で別タスクとして判断する
- **理由:** §11.2「2文字入力でオートコンプリート」「p95 200ms 以内」を最小構成で満たし、SQL インジェクション面を作らず、並び順の再現性(§2.2 決定性の方針)を保つため
- **影響:** MASTER-007(技・持ち物・特性検索)は本方式(2段クエリ+決定的ソート+固定上限)を踏襲する。日本語のひらがな/カタカナ正規化が必要になった場合は正規化列の追加を検討する

## 2026-07-25 技・持ち物・特性検索 API(MASTER-007)

### D-021: 検索条件と特性候補の解決方法

- **判断:** 技検索は `q` または `pokemon_id` の少なくとも一方を必須とする。`pokemon_id` のみなら習得可能技を決定的順序で返し、両方なら習得可能技と名称検索をAND条件にする。存在しない `pokemon_id` は候補0件の200とする
- **判断:** 持ち物検索は `q` を必須とする。技・持ち物の名称検索は日本語名・英語名を対象に前方一致→部分一致とし、英語名は大文字小文字を区別しない
- **判断:** 技・持ち物の各一致段階と特性候補は `nameJa → nameEn → id` で決定的に並べ、MASTER-006と同じ固定上限10件、必要列だけのPrisma `select` を使用する。pg_trgmと生SQLは導入しない
- **判断:** 特性候補は関連テーブルを追加せず、既存の `Pokemon.abilities` JSONB（取り得る特性の日本語名リスト）をsharedのZodで検証し、一意な `Ability.nameJa`へ解決する。存在しないポケモンは候補0件の200、不正JSONまたはAbilityマスタへ解決できない名前は不完全な候補を返さず RFC 9457形式の500とする
- **理由:** PRODUCT_SPEC §10.2の絞り込みを現行スキーマの正確な情報だけで実現し、全件返却や推測による候補を避けながら、MASTER-006と同じ検索UX・安全性・決定性を保つため
- **影響:** PokemonとAbilityの正規化された関連テーブルが将来追加された場合、特性検索の参照元を置き換える。データ投入時は `Pokemon.abilities` の全名称に対応するAbilityマスタが必要

## 2026-07-25 ユーザースキーマ(AUTH-001)

### D-022: email正規化、role、認証情報のDB境界

- **判断:** `users.email`には前後空白を除去して小文字化した正規形だけを保存し、通常の一意制約で重複を防ぐ。DBのCHECKでも `email = lower(btrim(email))` を保証し、citext等のPostgreSQL拡張は追加しない
- **判断:** email形式はsharedのZodで検証し、DBは正規形・最大254文字・一意性を保証する。AUTH-002は検索・登録の双方で同じ `userEmailSchema` を通し、正規化後の値だけで照合する
- **判断:** `role`は既存方針どおりtextとし、DB CHECKとsharedの `UserRole` / Zodで `user` / `admin` に限定する。既定値は `user` とし、role単独インデックスは低選択性で現時点の検索要件もないため追加しない
- **判断:** `display_name`はtrim済みの1〜50文字、`password_hash`はnullまたはtrim済みの1〜255文字とする。password_hashへ書き込めるのは後続の認証サービスだけとし、平文ではなくbcryptの生成結果のみを保存する。sharedの公開用UserスキーマにはpasswordHashを含めない
- **判断:** `created_at` / `updated_at`は `timestamptz(3)` とし、初期値を現在時刻にする。`updated_at`の更新はPrisma `@updatedAt`で行い、Prismaを経由しないSQL更新は対象外とする
- **理由:** 大文字小文字・前後空白の差による重複アカウントを拡張なしで防ぎ、DBの永続的な整合性とAUTH-002の入力検証・bcrypt処理の責務を分離するため
- **影響:** AUTH-002は正規化前emailで直接検索してはならず、`userEmailSchema`の出力を登録・ログイン照合に使用する。将来ハッシュ方式や最大長を変更する場合はDB制約と認証処理を同時に更新する

## 2026-07-25 登録・ログイン API(AUTH-002)

### D-023: パスワード、JWT、認証エラーの最小構成

- **判断:** パスワードは12文字以上・UTF-8で72バイト以下とし、英字と数字を各1文字以上必須、制御文字を禁止する。空白を含む入力を別のパスワードへ変えないためtrimは行わない
- **判断:** bcryptのコスト係数は12とし、平文はPrismaへ渡さず、生成したhashだけを `password_hash` へ保存する。OAuth専用ユーザーのnull hashとユーザー不存在ではダミーhashを比較し、外部レスポンスを共通化する
- **判断:** AUTH-002の完了条件に従い、HS256のJWTアクセストークンだけを発行する。payloadは `sub` と `role` に限定し、秘密鍵は32バイト以上の `JWT_ACCESS_SECRET`、有効期限は `JWT_ACCESS_EXPIRES_IN`（未指定時15分）から取得する
- **判断:** レスポンスは `accessToken / tokenType / expiresIn / user` とし、userはsharedの公開スキーマを使用する。passwordとpasswordHashはレスポンス・エラー・ログ・JWT payloadのいずれにも含めない
- **判断:** 重複登録は事前確認に加えPrisma P2002も `409 EMAIL_ALREADY_REGISTERED`へ変換する。ユーザー不存在・OAuth専用ユーザー・パスワード不一致はすべて `401 INVALID_CREDENTIALS` とし、理由を区別しない
- **理由:** PRODUCT_SPEC §10・§14とAUTH-002の完了条件を満たし、bcryptの入力上限、登録競合、ユーザー列挙、秘密情報漏えいを最小構成で防ぐため
- **影響:** AUTH-003は本アクセストークン契約を維持しつつ、別の秘密鍵を使うリフレッシュトークンの保存・ローテーション・失効を追加する。AUTH-004は `sub` と `role` を検証して認証・認可へ使用する

## 2026-07-25 リフレッシュトークン(AUTH-003)

### D-024: opaque tokenのHMAC保存、系列単位ローテーション

- **判断:** リフレッシュトークンはJWTではなく、暗号学的乱数32バイトをbase64url化したopaque tokenとする。既存APIがJSONで認証情報を返す契約を維持し、Cookie方式への変更はWEB-005等で保存方針とCSRF対策を含めて判断する
- **判断:** DBにはトークン本体を保存せず、アクセストークンとは別の32バイト以上の `JWT_REFRESH_SECRET` を鍵にしたHMAC-SHA-256のhex digestだけを保存する。環境変数名は既存設定との互換性のため維持するが、JWT署名ではなくopaque tokenのHMAC鍵として使用する
- **判断:** リフレッシュトークンの有効期限は `JWT_REFRESH_EXPIRES_IN`（未指定時30日）とする。registerとloginのたびに新しいfamily UUIDを作り、1ユーザーの複数端末・複数セッションを許可する
- **判断:** refreshはDBトランザクション内で旧行を `revoked_at IS NULL AND expires_at > now` の条件付き更新により1回だけ消費し、同じfamilyで新しい行を作成する。競合で更新件数が0の場合は再利用として扱い、同じfamilyの有効トークンをすべて失効する
- **判断:** 既に失効した旧トークンの再利用を検出した場合も同じfamilyを全失効する。他端末など別familyは失効させない。期限切れ・失効済み・存在しないトークンはすべて `401 INVALID_REFRESH_TOKEN` とし、内部状態を区別して返さない
- **判断:** `refresh_tokens`はUUID主キー、user UUID外部キー、64文字hashの一意制約、family UUID、有効期限、失効日時、作成日時だけを持つ。User削除時はCASCADEし、family/user+失効状態と有効期限にインデックスを置く
- **判断:** AUTH-003の完了条件に明記されていないため、ログアウト・ユーザー全セッション失効エンドポイントは追加しない。失効・期限切れレコードの定期削除も運用要件と保持期間を決める後続タスクへ残す
- **理由:** DB流出時に利用可能なトークンを残さず、ローテーション競合と盗難済み旧トークンの再利用を安全側で処理しつつ、正常な別端末セッションへの影響を限定するため
- **影響:** AUTH-004はアクセストークンだけを認証ガードで検証する。WEB-005はJSONで受け取るリフレッシュトークンのクライアント保存場所とXSS対策を別途決定する必要がある

## 2026-07-25 テンプレ構築スキーマ(ARCHETYPE-001)

### D-025: 構築の正規化境界・削除方針・JSONB契約

- **判断:** 構築本体・採用ポケモン・採用技・出典はPRODUCT_SPEC §6.4どおり `archetypes` / `archetype_pokemons` / `archetype_pokemon_moves` / `archetype_sources` に正規化する。ポケモンのメガ状態は別カラムへ重複保存せず、フォルム単位のPokemon参照と `Pokemon.isMega` を正とする
- **判断:** 構築内のポケモンは `(archetype_id, slot)` と `(archetype_id, pokemon_id)`、技は `(archetype_pokemon_id, move_id)`、出典は `(archetype_id, url)` で重複を防ぐ。同名・類似構築はARCHETYPE-005で警告する仕様のため、構築名自体はDB一意にしない
- **判断:** 構築削除時は独立した意味を持たない採用ポケモン・技・出典をCASCADE削除する。Pokemon / Move / Item / Ability / Season / Ruleは参照中の削除をRESTRICTし、マスタ参照の孤児化を防ぐ
- **判断:** JSONBは仕様で明示された `default_leads` / `item_alternatives` / `evs` に限定する。`default_leads`は重複しないslotの順序付き配列（先頭が基本先発）、代替持ち物はID配列、努力値は6能力オブジェクトとし、DBはJSON種類、sharedのZodは要素型・重複・範囲・努力値合計を検証する
- **判断:** `popularity_score`は将来用の0〜100、`usage_rate` / `adoption_rate`は0〜1、集計件数は0以上に制約する。PRODUCT_SPECの公開・更新時刻に加え、作成日時の確認要件を満たす `created_at` を持たせる
- **理由:** 一致度計算に必要な関係を外部キーと逆引きインデックスで再現可能にし、仕様上の柔軟なJSONBだけを残しつつ、構築内重複・孤児参照・範囲外データをDBと入力検証の二層で防ぐため
- **影響:** ARCHETYPE-002はJSONB内の代替持ち物IDも含めて全マスタ参照を検証する必要がある。シーズン・ルール・各マスタを削除する場合は参照中の構築を先にアーカイブ・移行または削除する

## 2026-07-25 認可ガード(AUTH-004)

### D-025: 個別適用のJWT認証とrole認可

- **判断:** 現時点では保護対象の本番APIが存在しないため、認証ガードはグローバル適用せず、各後続APIが `JwtAuthGuard` と `RolesGuard` を明示的に適用する。register / login / refresh / health / 公開マスタ検索にはガードを追加せず、公開状態を維持する
- **判断:** アクセストークンは `JWT_ACCESS_SECRET` を使い、署名アルゴリズムをHS256に固定して検証する。payloadの `sub` はUUID、`role` は `user` / `admin`、`iat` / `exp` は整数としてsharedのZodスキーマで検証し、成功後は `{ id, role }` だけをrequestへ設定する
- **判断:** 認証のたびにUserテーブルを参照せず、短命アクセストークンだけで認証・role判定する。ユーザー削除やrole変更は発行済みトークンの有効期限（既定15分）まで反映されない。即時失効が必要になった場合はトークン世代等を別タスクで設計する
- **判断:** `CurrentUser` は検証済みの最小認証情報をControllerへ渡し、`Roles("admin")` と `RolesGuard` でadminルートを表現する。認証情報なし・不正tokenは理由を区別しない `401 UNAUTHORIZED`、認証済みだがrole不足は `403 FORBIDDEN` のRFC 9457形式とする
- **判断:** リソース所有者チェックは対象モデル・取得方式・404へ秘匿する条件が各業務APIに依存し、AUTH-004ではパーティ所有者チェックが対象外のため追加しない。後続APIは本タスクの認証ユーザー型を利用して個別に所有権を検証する
- **理由:** 公開APIの設定漏れによる破壊を避けつつ、保護APIが追加された時点で認証・role認可を明示的かつ再利用可能に適用し、token検証時に秘密情報や失敗理由を露出しないため
- **影響:** 保護対象を追加するモジュールはAuthModuleをimportし、必要なGuardを明示する。role変更の即時反映やリソース所有者共通化が必要になった場合は、要件が確定した業務タスクで再検討する

## 2026-07-25 構築管理CRUD API(ARCHETYPE-002)

### D-026: admin限定CRUD・PUT全置換・DELETEアーカイブ

- **判断:** PRODUCT_SPEC §10.2の管理APIに `GET /admin/archetypes/{id}` をCRUDの単体取得として補い、一覧・単体・作成・更新・削除の全ルートへ `JwtAuthGuard` / `RolesGuard` / `Roles("admin")` を明示適用する。管理用一覧も公開せず、公開構築の詳細APIはWEB-008へ残す
- **判断:** `PUT` はPATCHではなく必須の親項目・採用ポケモン・技・出典を受け取る全置換とする。既存の子を削除して新しい子を作る処理とマスタ参照検証を単一トランザクション内で行い、失敗時は元の構築を維持する。`DELETE` は物理削除せず `status=archived` に更新し、出典や子レコードを保持する
- **判断:** ARCHETYPE-003の責務である人気度更新を先取りしないため、書き込み入力から `popularity_tier` / `popularity_score` / `encounter_count` / `pick_count` を除外する。新規作成はDB既定の`mid`、更新時は既存集計値を維持する
- **判断:** 出典URLは1件以上のhttp(s) URLを必須とする。Ruleの `team_size` と採用ポケモン数、`pick_size` と基本選出数を一致させ、基本選出slot、全マスタID、PokemonMoveの習得関係、Pokemon.abilitiesとAbilityの対応、代替持ち物IDを保存前に検証する。メガ状態はフォルム単位のPokemon参照を正とし重複保存しない
- **判断:** 一覧は `updated_at DESC → name ASC → id ASC`、子ポケモンは `slot ASC → pokemon_id ASC`、技・出典も一意なキーを含む順序で決定的に返す。一覧は親の表示項目だけ、詳細は編集に必要なID・構成値だけをselectし、Prisma内部の子UUIDは返さない
- **判断:** 入力形式・重複は `400 VALIDATION_ERROR`、不正なマスタ参照・整合性違反は `400 INVALID_MASTER_REFERENCE`、競合は `409 ARCHETYPE_CONFLICT`、存在しない構築は `404 NOT_FOUND` とし、すべてRFC 9457形式で返す
- **理由:** 管理者だけが品質ルールを満たす構築を原子的に登録でき、後続の人気度管理・重複警告・公開詳細APIを先取りせず、DB制約競合やマスタ削除競合もHTTP契約へ安全に変換するため
- **影響:** ARCHETYPE-003は専用エンドポイントで人気度とシーズン切替を扱う。ARCHETYPE-005は本CRUDの入力契約を再利用して類似警告を追加し、WEB-008は公開構築専用の取得契約を別途定義する

## 2026-07-25 パーティスキーマ(PARTY-001)

### D-027: パーティの正規化境界・メガ表現・削除方針

- **判断:** パーティ本体・採用ポケモン・採用技を `parties` / `party_pokemons` / `party_pokemon_moves` に正規化する。パーティ名はtrim済み1〜100文字、説明は任意の非空TEXTとし、同一ユーザー内でも名前は一意にしない
- **判断:** PRODUCT_SPEC §6.3の `can_mega` は保存せず、フォルム単位の `pokemon_id` と `Pokemon.form` / `Pokemon.isMega` を正とする。通常形態とメガ形態を別の状態フラグで重複表現しない
- **判断:** EV・IV・実数値は仕様どおりJSONBとし、6能力オブジェクトの形状をsharedのZodで検証する。EVは各0〜252かつ合計510以下、IVは各0〜31、実数値は正の整数とする。IVのnullは全能力31の既定値として扱う
- **判断:** パーティ内の `(party_id, slot)` と `(party_id, pokemon_id)`、採用技の `(party_pokemon_id, move_id)` と `(party_pokemon_id, slot)` を一意にする。slot範囲（パーティ1〜6、技1〜4）をDBとZodで、人数1〜6・技数1〜4および重複をZodで保証する
- **判断:** User削除時はParty以下、Party削除時はPartyPokemon以下、PartyPokemon削除時は技をCASCADE削除する。Rule / Pokemon / Move / Item / Abilityは参照中の削除をRESTRICTする
- **判断:** Rule.teamSizeとの一致、PokemonMove上の習得可否、Pokemon.abilitiesとAbilityの整合性、同時にactiveにできるパーティ数は、認証ユーザーとトランザクションを扱うPARTY-002で検証する。DBではフォルム単位の同一pokemonIdだけを重複禁止とする
- **理由:** 後続の対策計算に必要な構成値を再現可能にし、正規化できる参照をJSONBへ逃がさず、明示された柔軟な能力値だけをJSONBとして扱いながら、孤児参照と構成内重複を永続層で防ぐため
- **影響:** PARTY-002はルール人数、習得可能技、所持可能特性、active切替を保存トランザクション内で検証する。PRODUCT_SPECとの差分は、今回の要件に基づく任意descriptionの追加と `can_mega` の不採用である

## 2026-07-25 パーティCRUD API(PARTY-002)

### D-028: 所有権秘匿・PUT全置換・active排他・物理削除

- **判断:** PRODUCT_SPEC §10.2どおり `GET/POST /parties` と `GET/PUT/DELETE /parties/{id}` だけを追加し、全ルートへ `JwtAuthGuard` を明示適用する。`user_id` は入力として受け取らず `CurrentUser.id` を使用し、一覧・単体・更新・削除の検索条件へ所有者IDを含める。存在しないIDと他人のIDは同じ `404 NOT_FOUND` にする
- **判断:** POST/PUT入力はルールの `team_size` と人数を一致させ、各ポケモンは4技を必須とする。Pokemon / Item / Ability / Moveの存在、PokemonMoveの習得関係、Pokemon.abilitiesとAbility.nameJaの対応、slotがルール人数以下であることを保存と同じトランザクション内で検証する。メガ状態はPokemonのフォルムを正とし追加フラグを受け取らない
- **判断:** `PUT` は親項目とPartyPokemon・PartyPokemonMoveの全置換とする。所有者確認後、既存子要素の削除とnested createを単一トランザクションで行い、失敗時は元のパーティを維持する
- **判断:** active切替専用URLは仕様にないため追加せず、POST/PUTの `isActive: true` を切替操作とする。同一ユーザーの既存active解除と対象保存をSerializableトランザクションで行い、直列化競合は `409 PARTY_CONFLICT` にする。PARTY-001の `(user_id, is_active)` インデックスを利用し、新しいmigrationは追加しない。`isActive: false` やactiveパーティの削除後はactiveなしを許容し、別パーティを暗黙選択しない
- **判断:** `DELETE` は物理削除とし、PARTY-001のCASCADEで採用ポケモンと技を削除する。一覧は `is_active DESC → updated_at DESC → name ASC → id ASC`、子要素はslotとIDで決定的に返し、userId・子UUID・内部マスタ情報は返さない
- **判断:** 入力形式と重複は `400 VALIDATION_ERROR`、不正なマスタ参照とルール不整合は `400 INVALID_MASTER_REFERENCE`、DB・直列化競合は `409 PARTY_CONFLICT` とし、すべてRFC 9457形式とする
- **理由:** 公開されたリソースIDから所有関係を推測させず、複合構成を部分保存せず、既存スキーマと正確なREST契約の範囲で後続の対戦処理が参照できる一意なactiveパーティを安全に管理するため
- **影響:** 複数パーティの切替画面はU-03/WEBの後続範囲に残る。activeを必ず1件存在させる要件やDB単独での部分一意制約が必要になった場合は、別タスクでmigrationを設計する

## 2026-07-25 採用ポケモン一致スコア(SCORE-002)

### D-029: フォルム単位ID照合・重複集約・段階実装時の内訳

- **判断:** ポケモン一致は `pokemonId` の完全一致だけで判定する。SCORE-001のSnapshotには `basePokemonId` がないため、通常形態・別フォルム・メガ形態はマスタIDが異なれば別のポケモンとして扱い、名前や `isMega` による推測・同一視は行わない
- **判断:** 未取消の `kind=pokemon` 観測だけを対象にし、同じpokemonIdの複数観測は最小seqの1件へ集約して二重加点しない。テンプレ側の重複pokemonIdはDB制約に反する不正Snapshotなので、採用率を恣意的に選ばず明示的なRangeErrorとする
- **判断:** 獲得点は観測されたポケモンの `pokemonHit × usageRate`、理論最大点は一意な有効観測1件ごとにusageRateを掛けない `pokemonHit` とする。観測0件またはpokemonHit=0では一致度0%とし、計算結果は小数6桁で丸めて0〜100へclampする
- **判断:** SCORE-001の `matched` 配列には今回評価した一致・不一致の両方をseq順で格納し、不一致は `matched=false / points=0` とする。ポケモン不一致の減点・除外はSCORE-004、技等の加点はSCORE-003/SCORE-006、likelyUnseen・警戒技はSCORE-007の責務なので、今回は先取りしない
- **理由:** 観測が少ない段階で未観測5体を不一致にせず、入力順や重複によらない再現可能なスコアを返しながら、既存型契約と段階的なSCOREタスク境界を維持するため
- **影響:** BATTLE-002のSnapshot変換はフォルム単位のpokemonIdをそのまま渡す。将来通常形態と派生形態を同一視する仕様へ変更する場合は、SCORE-001のSnapshot契約へ明示的なbasePokemonIdを追加してから判定を変更する

## 2026-07-25 技一致スコア(SCORE-003)

### D-030: ポケモンと技の組による照合・採用率加点・重複集約

- **判断:** 技一致は未取消の `kind=move` 観測に正の整数の `pokemonId` と `moveId` の両方を必須とし、テンプレ内の同じpokemonIdに紐付くmoveIdとの完全一致だけで判定する。技名による照合や、別ポケモンが同じ技を持つ場合の横断的な照合は行わない
- **判断:** kind=pokemonの先行観測がなくても、技観測自身のpokemonIdとmoveIdがテンプレに一致すれば評価する。同一 `(pokemonId, moveId)` の複数観測は最小seqの1件へ集約し、同じmoveIdでもpokemonIdが異なれば別の観測として扱う
- **判断:** 獲得点は一致技の `moveHit × adoptionRate`、理論最大点は一意な有効技観測ごとにadoptionRateを掛けない `moveHit` とする。未観測のテンプレ技は分母へ含めず、不一致技は `matched=false / points=0` として内訳へ残すだけで、SCORE-004の矛盾減点を先取りしない
- **判断:** テンプレ内の同一ポケモンにmoveId重複がある場合、またはmoveId・adoptionRateが範囲外の場合は、不正SnapshotとしてRangeErrorを返す。ポケモンと技の内訳は `seq → kind → pokemonId → moveId` の順で決定的に統合し、合算後も小数6桁への丸めと0〜100へのclampを維持する
- **理由:** 観測技の使用者を取り違えず、重複・入力順に依存しない純粋な一致判定をSCORE-002へ合成しながら、PRODUCT_SPECの採用率加点と段階的な減点実装の境界を守るため
- **影響:** BATTLE-002のSnapshot変換はmove観測へpokemonIdとmoveIdを必ず設定する。SCORE-004は今回の不一致技内訳を技矛盾の判定へ再利用できる

## 2026-07-25 持ち物・特性・先発・メガ一致スコア(SCORE-006)

### D-031: 追加観測のID照合・先発順序・メガ形態の判定境界

- **判断:** 持ち物は `(pokemonId, itemId)` の完全一致で判定し、確定 `itemId` は `itemHit`、`itemAlternativeIds` は `itemAlternativeHit` を加点する。現行Snapshotに持ち物の採用率はないため率補正を追加しない。特性も `(pokemonId, abilityId)` と単一の確定 `abilityId` だけを照合し、候補特性や採用率を推測しない
- **判断:** `position=lead` だけを先発一致の評価対象とし、順序付き `defaultLeadSlots` の先頭slotに対応するpokemonIdとの一致へ `leadHit` を加点する。PRODUCT_SPECに控え位置の配点がないため `position=back` はrawScore・maxScore・内訳へ含めない
- **判断:** メガ観測はフォルム単位のpokemonIdがテンプレに存在し、そのSnapshotの `isMega=true` の場合だけ `megaHit` を加点する。通常形態IDからメガ形態を推測せず、SnapshotにないbasePokemonIdや名前照合を追加しない
- **判断:** item / abilityは `(pokemonId, 対象ID)`、lead / megaはpokemonId単位で最小seqの観測へ集約する。理論最大点は各一意な有効観測へ確定枠のhit値を積み、不一致は0点の内訳だけを返してSCORE-004の減点・除外を先取りしない
- **判断:** ポケモンslot、確定・代替持ち物ID、特性ID、isMega、defaultLeadSlotsを計算前に検証し、重複slot、確定と代替の持ち物重複、未知の基本選出slot等は不正SnapshotとしてRangeErrorにする。内訳にはpositionを追加し、既存のseq・kind・各ID順で決定的に統合する
- **理由:** PRODUCT_SPECに存在する情報と配点だけで使用者単位の誤一致を防ぎ、SCORE-002/003の純粋・決定的な合成方式を維持しながら、後続の矛盾判定と表示理由が同じ内訳を再利用できるようにするため
- **影響:** BATTLE-002のSnapshot変換はitem / ability観測へpokemonIdと対象ID、position観測へpokemonIdとposition、mega観測へメガ形態自身のpokemonIdを設定する。持ち物・特性の採用率や控え位置の加点を将来導入する場合はSnapshot契約と配点仕様を先に更新する

## 2026-07-25 矛盾・除外判定(SCORE-004)

### D-032: 矛盾の判定境界・診断内訳・付録Aの数値不整合

- **判断:** PRODUCT_SPEC §7.2の減点を、ポケモン不一致−20、技矛盾−12、持ち物矛盾−12、特性矛盾−8、メガ矛盾−25として既存加点へ合成する。先発不一致には減点行がないため0点の一致内訳だけを返し、矛盾へ含めない
- **判断:** 技・持ち物・特性の矛盾は、対象pokemonIdが構築に存在し、そのポケモンについてSnapshotに比較可能な情報がある場合だけ判定する。対象ポケモン自体が構築にない場合は従属情報を重ねて減点せず、kind=pokemonの明示観測だけをポケモン不一致として数える。abilityId未設定も候補特性を推測せず判定不能とする
- **判断:** メガ観測はフォルム単位pokemonIdが構築に存在し `isMega=true` の場合だけ整合し、それ以外はメガ矛盾とする。通常形態、別フォルム、basePokemonIdを推測して補完しない
- **判断:** 同一内容の観測はSCORE-002/003/006の最小seq集約を再利用して一度だけ減点し、異なる矛盾は累積する。減点後のrawScoreは既存契約どおり0〜maxScoreへclampし、maxScoreは有効観測がすべて完全一致した理論最大点のまま変更しない
- **判断:** 既存の一致/不一致`matched`内訳を破壊せず、減点は符号付き`penaltyPoints`とリテラルunionの`contradictionCode`を持つ`contradictions`へ分離する。除外理由も`pokemon_miss_threshold` / `mega_conflict`の`exclusionCodes`として保持し、ポケモン不一致3体以上またはメガ矛盾で`excluded=true`とする
- **判断:** PRODUCT_SPEC付録Aの表に記載された加点は `10+6+15+10+15=56`で、§7.2の「観測列がすべて完全一致した理論最大点」を適用したmaxScoreも56となるため、同じ付録の`max=63 / 89%`とは両立しない。根拠のない7点を分母へ加えず、現行式では56/56=100%となることを回帰テストで明示する。仕様の数値が訂正されるまでIMPLEMENTATION_PLANのSCORE-004は完了扱いにしない
- **理由:** 観測対象を取り違えた二重減点や、Snapshotにない候補情報の推測を避けながら、PRODUCT_SPECで明示された減点・除外だけを決定的かつ後続SCORE-007で説明可能な形で適用するため
- **影響:** SCORE-005は`excluded`を候補一覧から除外でき、SCORE-007は`contradictions`と`exclusionCodes`を表示理由へ変換できる。付録Aの完了条件を満たすには、maxScore=63の根拠となる観測または配点をPRODUCT_SPECへ明記する必要がある

### D-033: 付録Aの一致度を89%から100%へ訂正

- **判断:** PRODUCT_SPEC付録Aの`raw=56 / max=63 → 89%`を、§7.2の正規化定義と表中の配点に一致する`raw=56 / max=56 → 100%`へ訂正する。同じ具体例を参照するAPIレスポンス例・画面モック・テスト方針・SCORE-004完了条件も100%へ統一する
- **理由:** 5件の観測がすべて完全一致しており、理論最大点は `10+6+15+10+15=56`である。63点満点の根拠となる観測や配点が仕様に存在しないため、根拠のない7点を追加するより、§7.2の定義と実装済みの決定的な計算結果を正とする
- **影響:** SCORE-004の付録A完了条件が実装・回帰テストと一致したため、タスクを完了へ更新する。配点ロジックとテストコードは変更せず、次のタスクをSCORE-005とする

## 2026-07-25 一致度表示要素の算出(SCORE-007)

### D-034: likelyUnseen / threatMoveIds の算出範囲と決定的な並び順

- **判断:** PRODUCT_SPEC §7.4 の表示要素のうち、`scoreArchetype` がスタブ(空配列)としていた `likelyUnseen` と `threatMoveIds` のみを本タスクで算出する。既存の一致内訳(`matched`)・矛盾/除外(`contradictions`/`exclusionCodes`)・一致率(`matchRate`)は SCORE-002〜006 の算出結果をそのまま用い、計算方法は一切変更しない
- **判断:** `likelyUnseen` は「構築内で `kind=pokemon` の未取消観測に現れないポケモン」を `usageRate` 降順で返す。同値は `pokemonId` 昇順で決定化する。観測0件でも構築内ポケモンは全て未観測として列挙する(§7.4 は観測数の下限を設けていない)
- **判断:** `threatMoveIds` は「未観測ポケモンの技+観測済みポケモンの未観測技」= `(pokemonId, moveId)` が未取消の技観測に現れない構築内の技のうち、タグに `setup`/`hazard`/`screen`/`priority` を含むものの技IDを返す。同一技IDは重複排除する
- **判断:** §7.4 が §9.5 相性エンジンで加える `status` タグは、一致度エンジンの §7.4 には含まれないため対象外とする。`pivot` も §7.4 の警戒タグに含めない
- **判断:** §7.4 は警戒技の並び順を規定しないため、同節の likelyUnseen と同じ「出現しやすさ」の原則で決定化する。保有ポケモンの `usageRate` 降順 → 技の `adoptionRate` 降順 → `moveId` 昇順とし、重複排除時は最も出現しやすい保有元の指標で代表させる
- **判断:** §7.4 の「および threat_notes 記載技」は、`threatNotes` が自由記述テキストで技IDを決定的に抽出できないため本タスクでは算出しない。構造化された技参照が必要になった時点で別タスクとして設計する
- **理由:** §7.4 の定義に忠実に、UI/DB に依存しない純粋関数として決定的な出力を返すため。仕様が並び順を規定しない箇所は同節の既定原則を踏襲し、根拠のない優先度を新設しない
- **影響:** SCORE-007 完了。`threat_notes` からの技抽出は未対応のまま残る。観測0件で全ポケモンが likelyUnseen に載る挙動に合わせ、SCORE-002 の観測0件テストの期待値を更新した(スタブの空配列 → 実値)
