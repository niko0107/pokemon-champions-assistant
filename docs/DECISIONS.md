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

## 2026-07-25 人気度を含む並び替え(SCORE-005)

### D-034: 一致度優先・手動tier・決定的な最終キー

- **判断:** 候補はPRODUCT_SPEC §7.3どおり、計算済みの `matchRate DESC → popularityTier(high→mid→low) → encounterCount DESC → updatedAt DESC` で比較する。`rawScore`と`maxScore`は同率時の追加キーにせず、SCORE-002〜004・006の結果を再計算しない。matchRateは既存計算が小数6桁へ安定化しているため、任意のepsilonや同率幅を設けず有限な0〜100の数値をそのまま比較する
- **判断:** MVPの人気度は§8.1の手動 `popularityTier`を正とし、将来用の`popularityScore`はnull・未設定・0を含めて順位へ使用しない。複合人気度を導入するOPS-001までは、pickCount等のSnapshot外の値も補正へ使わない
- **判断:** 4キーが同じ場合は `archetypeId ASC`を最終キーにして入力順やJavaScriptのsort安定性へ依存しない。updatedAtはタイムゾーン付きISO日時をepochへ変換して比較し、同一時刻の異なるoffset表現も同値として扱う
- **判断:** `excluded=true`の候補はソート前に除外し、残った上位limit件へ1始まりのrankを付ける。非除外候補のSnapshot欠落、候補ID重複、不正tier・遭遇数・日時・matchRate、負数または非整数limitは、順位を推測せずRangeErrorとして明示的に拒否する
- **理由:** 人気度が一致度の主順位を逆転させず、現行MVPで実在する情報だけを使って、入力順・実行環境・欠損値に左右されない再現可能な候補順を返すため
- **影響:** BATTLE-002は非除外候補ごとに対応するArchetypeSnapshotを渡す必要がある。OPS-001で複合人気度を有効化する場合は、本比較の2キー目とSnapshot契約を同じタスクで更新する

## 2026-07-25 一致度表示要素の算出(SCORE-007)

### D-035: likelyUnseen / threatMoveIds の算出範囲と決定的な並び順

- **判断:** PRODUCT_SPEC §7.4 の表示要素のうち、`scoreArchetype` がスタブ(空配列)としていた `likelyUnseen` と `threatMoveIds` のみを本タスクで算出する。既存の一致内訳(`matched`)・矛盾/除外(`contradictions`/`exclusionCodes`)・一致率(`matchRate`)は SCORE-002〜006 の算出結果をそのまま用い、計算方法は一切変更しない
- **判断:** `likelyUnseen` は「構築内で `kind=pokemon` の未取消観測に現れないポケモン」を `usageRate` 降順で返す。同値は `pokemonId` 昇順で決定化する。観測0件でも構築内ポケモンは全て未観測として列挙する(§7.4 は観測数の下限を設けていない)
- **判断:** `threatMoveIds` は「未観測ポケモンの技+観測済みポケモンの未観測技」= `(pokemonId, moveId)` が未取消の技観測に現れない構築内の技のうち、タグに `setup`/`hazard`/`screen`/`priority` を含むものの技IDを返す。同一技IDは重複排除する
- **判断:** §7.4 が §9.5 相性エンジンで加える `status` タグは、一致度エンジンの §7.4 には含まれないため対象外とする。`pivot` も §7.4 の警戒タグに含めない
- **判断:** §7.4 は警戒技の並び順を規定しないため、同節の likelyUnseen と同じ「出現しやすさ」の原則で決定化する。保有ポケモンの `usageRate` 降順 → 技の `adoptionRate` 降順 → `moveId` 昇順とし、重複排除時は最も出現しやすい保有元の指標で代表させる
- **判断:** §7.4 の「および threat_notes 記載技」は、`threatNotes` が自由記述テキストで技IDを決定的に抽出できないため本タスクでは算出しない。構造化された技参照が必要になった時点で別タスクとして設計する
- **理由:** §7.4 の定義に忠実に、UI/DB に依存しない純粋関数として決定的な出力を返すため。仕様が並び順を規定しない箇所は同節の既定原則を踏襲し、根拠のない優先度を新設しない
- **影響:** SCORE-007 完了。`threat_notes` からの技抽出は未対応のまま残る。観測0件で全ポケモンが likelyUnseen に載る挙動に合わせ、SCORE-002 の観測0件テストの期待値を更新した(スタブの空配列 → 実値)

## 2026-07-26 重複チェック・プレビュー一致判定(ARCHETYPE-005)

### D-036: プレビューAPIのURL・観測変換・完全重複の正規化・DB非変更保証

- **判断:** PRODUCT_SPEC にプレビュー用URLの明記がないため、既存 admin CRUD 規約に沿って `POST /api/v1/admin/archetypes/preview` を1本だけ追加する。ARCHETYPE-002 の `adminArchetypeWriteSchema` を入力にそのまま再利用し(プレビュー専用エイリアス `adminArchetypePreviewRequestSchema` を定義)、`JwtAuthGuard` / `RolesGuard` / `@Roles("admin")` を継承する。重複候補が見つかること自体は正常な 200 とし 409 にしない
- **判断:** プレビューは読み取り専用とし、create / update / delete / upsert / 書き込みトランザクション・popularity/updatedAt の更新を一切行わない。マスタ参照検証は ARCHETYPE-002 の `validateReferences`(読み取りのみ)を `PrismaService` を渡して再利用し、比較対象は `Archetype.findMany` を1回だけ(nested select・安全上限 `take: 500`)で取得して N+1 を避ける。入力配列・取得 Snapshot は変更しない
- **判断:** 比較対象は入力と同一 `seasonId` + `ruleId` かつ `status="published"` の構築に限定する(§7.1 の現行シーズン・ルール、§13.2 の archived=検索対象外)。season/rule が異なる構築は比較対象外となり、結果として完全重複にもならない
- **判断:** 完全重複は純粋関数で生成する canonical 表現(seasonId, ruleId, pokemonId 昇順のポケモン {pokemonId, isMega, itemId, abilityId, 代替Item集合(昇順), 技moveId集合(昇順)}, 基本選出を slot→pokemonId へ写像した順序付きリスト)の完全一致で判定する。ポケモン・技・代替Item の入力順差は無視し、defaultLeads は順序付き(D-025 の先頭=先発)として扱う。通常形態とメガ形態は Pokemon の `isMega` で区別し、名前や basePokemonId から関係を推測しない。description / source / 日時などのメタデータは判定に含めない。複数一致時は最小 archetypeId を決定的に返す
- **判断:** 完全重複の比較項目に採用率(usageRate / adoptionRate)は含めない。PRODUCT_SPEC が完全重複判定へ列挙するのは構築の同一性を決める要素(ポケモン・技・持ち物・特性・先発・メガ)であり、採用率は同一性ではなく統計値のため
- **判断:** 類似候補は SCORE-001〜007 をそのまま再利用する。保存前構築を観測列へ変換し(kind=pokemon: 全採用ポケモン / move: 全採用技 / item: 確定持ち物のみ / ability: 確定特性 / mega: `Pokemon.isMega=true` / position=lead: 基本先発の先頭1体のみ)、`scoreArchetype` でスコアし `rankCandidates` で §7.3 の並び(一致度→人気度tier→遭遇数→更新日→archetypeId)に整列する。代替持ち物と先頭以外の先発は観測に含めない(`scoreArchetype` が加点しないため max_score を不当に押し上げないようにする)
- **判断:** 仕様にない類似判定閾値(例: 90% / 80%)は追加せず、完全重複か否かと既存の `matchRate` / `rank` / 内訳をそのまま返す。表示件数は §7.3 の LIMIT 3 に準拠する。レスポンスは RankedCandidate から表示項目のみを射影し(`rawScore` / `maxScore` / `excluded` は返さない)、strict スキーマで余分な項目を拒否する。`ContradictionCode` / `ExclusionCode` は packages/scoring と同じ値を shared の `CONTRADICTION_CODES` / `EXCLUSION_CODES` へ定義してレスポンス検証に共有する(scoring 側の型は変更しない)
- **理由:** 既存の CRUD 契約・スコアリングエンジン・認可を再利用し、保存前構築を安全に(DB を変えずに)既存構築と比較できるようにするため。並び順・完全重複判定・観測変換を決定的な純粋関数へ分離し、同じ入力と DB 状態では常に同じ結果を返す
- **影響:** 実際の作成API(ARCHETYPE-002)での重複拒否は本タスクの対象外で未変更のまま。将来 90% 等の類似警告閾値を UI/仕様で確定する場合は、閾値の根拠を PRODUCT_SPEC へ明記してから追加する。apps/api は新たに `@pokemon-champions/scoring` へ依存する

## 2026-07-26 人気度・シーズン管理API(ARCHETYPE-003)

### D-037: 人気度手動更新・シーズン/ルール管理・一括アーカイブのAPI設計

- **判断:** PRODUCT_SPEC §10.2 の A-02/A-03 どおり `PUT /admin/archetypes/:id/popularity`、`GET/POST /admin/seasons`、`GET/POST /admin/rules` を既存 admin-archetypes モジュールへ追加する。全ルートへ `JwtAuthGuard` / `RolesGuard` / `@Roles("admin")` を適用し、認証なし401・userロール403・RFC 9457 を維持する。シーズン・ルールは仕様が GET/POST のみのため PUT/DELETE は追加しない
- **判断:** 完了条件「シーズン切替(一括アーカイブ)」(§13.2)の URL が §10.2 に明記されていないため、season スコープの最小アクションとして `POST /admin/seasons/:id/archive-archetypes` を1本だけ追加する。指定シーズンの `status="published"` 構築のみを `archived` にし、`{ seasonId, archivedCount }` を返す。存在確認と `updateMany` を単一トランザクションに閉じ込め、存在しないシーズンは404で更新しない
- **判断:** 人気度更新は §8.1 MVP の手動運用に合わせ、`popularityTier`(high/mid/low)を必須、`popularityScore`(0〜100, nullable)/`encounterCount`/`pickCount`(0以上・int4上限以内の整数)を任意の部分更新とする。省略項目は変更せず、`popularityScore` は null 明示でクリアできる。NaN/Infinity/負数/小数/int4超過を zod で拒否する。人気度の数値スコア自動計算(OPS-001)・遭遇/選択の自動集計(ENCOUNTER/BATTLE)は先取りせず、ここでは手動値のみ扱う。`pickCount` と `encounterCount` の大小関係は PRODUCT_SPEC に定義がないため制約を追加しない
- **判断:** 単一行更新の人気度APIはトランザクション不要とし、`archetype.update` の Prisma P2025 を既存 `translatePrismaErrors` で404へ変換する。レスポンスは SCORE-005 が参照する `popularityTier`/`encounterCount`/`updatedAt` を含む人気度関連項目のみ(`id`/`popularityScore`/`pickCount` 含む)を strict スキーマで返し、構築本文などの内部情報は返さない。`updatedAt` は Prisma `@updatedAt` が自動更新する
- **判断:** 構築の season/rule 再割り当ては既存 `PUT /admin/archetypes/:id`(全置換)が `adminArchetypeWriteSchema` で seasonId/ruleId を受け取り、`validateReferences` が Rule.teamSize=採用数・Rule.pickSize=defaultLeads 数の整合をトランザクション内で検証済みのため、`/season` 系の重複エンドポイントは追加しない(責務分担)。不整合な season/rule 変更や部分更新防止は既存 CRUD のテストで担保する
- **判断:** シーズン・ルール作成入力は MASTER-004 の `seasonMasterSchema`(期間の前後関係)/`ruleMasterSchema`(pickSize<=teamSize)を再利用する。これらは他用途と共有する非 strict スキーマのため未知キーは黙って除去され、レスポンス側スキーマは strict で検証する。name の一意制約違反(P2002)は `SEASON_CONFLICT` / `RULE_CONFLICT`(shared の APP_ERROR_CODES に追加)へ 409 変換する。draft は現行スキーマ(published/archived のみ)に存在しないため扱わない
- **理由:** 仕様に定義された管理項目だけを最小構成で追加し、人気度の自動計算や重複エンドポイントを先取りせず、既存の認可・エラー設計・スコアリング参照データ形式を壊さないため
- **影響:** 遭遇報告(ENCOUNTER)・候補選択集計(BATTLE)・人気度数値スコア(OPS-001)を実装する際、encounterCount/pickCount/popularityScore の更新責務が自動集計側へ移る可能性がある。シーズン/ルールの編集(PUT)や削除が必要になった場合は仕様追記の上で別タスクとして追加する。apps/api の admin-archetypes モジュールに season/rule 用の controller/service を追加した

## 2026-07-26 対戦セッション作成(BATTLE-001)

### D-038: セッションURL・状態・Party検証・削除方針

- **判断:** PRODUCT_SPEC §10.2 と IMPLEMENTATION_PLAN に明記された `POST /api/v1/sessions` と `GET /api/v1/sessions/:id` を実装する。依頼で代替候補として示された `/api/v1/battles` は、仕様にURLが存在するため採用しない。BATTLE-002以降の観測追加・候補取得・終了用URLは追加しない
- **判断:** 作成入力は strict な `partyId`(UUID)と`ruleId`(正の整数)だけとし、`userId`は受け取らず`@CurrentUser()`の認証ユーザーIDを使う。レスポンスは `id / partyId / ruleId / status / startedAt / endedAt / createdAt / updatedAt`だけとし、userId・認証情報・将来用の選択候補や結果は返さない
- **判断:** `battle_sessions.status`は既存のtext+shared Zod+DB CHECK方針に合わせ、`active / ended / archived`へ限定する。BATTLE-001の作成値は常に`active`で、終了・アーカイブへの遷移はBATTLE-004/BATTLE-007へ残す。仕様に同一ユーザーの進行中セッション数制限がないため、一意制約や`BATTLE_CONFLICT`は追加しない
- **判断:** セッション作成時はPartyを`id + userId`で検索し、他人のPartyと不存在Partyを同じ`404 NOT_FOUND`にする。adminも通常APIでは自分のPartyだけを使える。Partyは「現在使用中」を表す`isActive=true`を開始可能条件とし、入力ruleIdとParty.ruleIdの一致、PartyPokemon数とRule.teamSizeの一致、各ポケモン4技、能力値JSON、習得可能技、所持可能特性を保存前に検証する。不整合は`400 INVALID_PARTY_STATE`にする
- **判断:** 所有権・Party状態の読取とBattleSession作成は単一Prisma transactionで行い、生SQLは使わない。予期しない失敗は秘密情報を含まない`500 INTERNAL_ERROR`へ変換する。作成と取得は`JwtAuthGuard`を明示適用し、セッション取得も`id + userId`で所有権を秘匿する
- **判断:** `battle_sessions`はPRODUCT_SPEC §6.5のuser/party/rule/selected_archetype/result/start/endに、依頼で求められたstatusとcreated_at/updated_atを追加する。90日アーカイブ対象を後続で効率的に選べるよう`(status, started_at)`、所有者状態・各FKにindexを置く。User削除時とParty削除時はセッションをCASCADE削除し、既存Party物理削除APIの意味を維持する。Rule削除はRESTRICT、選択済みArchetypeが物理削除された場合はSET NULLとする
- **判断:** IMPLEMENTATION_PLANのBATTLE-001作業範囲に明記されたため、`observations`もPRODUCT_SPEC §6.5の最小構造だけ追加する。セッション削除時はCASCADE、マスタ削除はRESTRICT、`(session_id, seq)`を一意にし、kind/position/payloadをDB CHECKで制約する。観測の作成・採番・Undo・scoring呼び出しは一切実装せずBATTLE-002以降へ残す
- **判断:** Prisma生成migration適用後にtext許可値のCHECK制約を追加する必要が判明したため、適用済みmigrationを書き換えず、同じBATTLE-001内の前進migrationとして`battle_001_constraints`を追加する。Prismaと`@prisma/client`はlockfileどおり6.19.3を維持する
- **理由:** 正式仕様のURLと既存の認証・所有権・RFC 9457契約を保ち、壊れたPartyや他人のリソースからセッションを開始させず、後続タスクに必要な永続構造だけを安全に準備するため
- **影響:** Partyを非activeのまま選択した場合は開始できないため、WEB-006は開始前に選択Partyをactiveへ切り替える。BATTLE-002は既存Observationモデルへ追記し、BATTLE-004/BATTLE-007は既存statusを遷移させる。同一ユーザーの複数activeセッションは許可されたまま

## 2026-07-26 観測情報追加(BATTLE-002)

### D-039: Observation単体追記API・整合性検証・競合時再試行

- **判断:** PRODUCT_SPEC §10.2に明記された `POST /api/v1/sessions/:id/observations` を1本だけ追加する。既存のsessions APIと同じ `JwtAuthGuard` / `@CurrentUser()`を使い、Sessionは`id + userId`で検索する。他人・adminが所有しないSessionと不存在Sessionは同じ`404 NOT_FOUND`、`ended / archived`は`400 INVALID_SESSION_STATE`にする
- **判断:** 入力は `pokemon / move / item / ability / position / mega` のstrictなdiscriminated unionとし、各マスタIDは正の安全な整数とする。`userId / sessionId / seq / isRevoked / createdAt`は受け取らない。レスポンスは作成したObservationの `id / sessionId / seq / kind / pokemonId / moveId / itemId / abilityId / position / isRevoked / createdAt`だけを返し、DBの仕様名`observedAt`をAPIの作成時刻`createdAt`へ写像する
- **判断:** 全kindでPokemonの存在を確認し、moveはMoveの存在とPokemonMove上の習得関係、itemはItemの存在、abilityはAbilityの存在とsharedで検証した`Pokemon.abilities`への包含、megaは`Pokemon.isMega=true`を保存前に検証する。候補テンプレとの一致可否は検証しない。不正は`400 INVALID_MASTER_REFERENCE`に統一する。positionはsharedの`lead / back`だけを入力スキーマで許可する
- **判断:** Session確認・マスタ検証・`max(seq) + 1`の採番・Observation作成をSerializableな単一Prisma transactionで行う。既存の`(session_id, seq)`一意制約を競合検出に使い、P2034/P2002はtransaction全体を最大3回再試行する。競合が継続した場合だけ`409 OBSERVATION_CONFLICT`を返す。生SQLは使用しない
- **判断:** PRODUCT_SPECは観測追加時に最新候補を返し、IMPLEMENTATION_PLANの従来記述はSnapshot変換とscoring呼び出しまでBATTLE-002に含めていたが、今回の明示要件では候補計算・`scoreArchetype`・`rankCandidates`が対象外である。そのためBATTLE-002はObservation単体レスポンスまでに限定し、候補レスポンスとの差は未実装として残す。重複観測を禁止する仕様はないため、同じ内容も別seqで追記できる
- **判断:** BATTLE-001のObservationモデルはUUID、kind別payload CHECK、`(session_id, seq)`一意制約、Session削除CASCADE、Pokemon/Move/Item/Ability削除RESTRICTをすでに備えるため、schema変更とmigration追加は行わない。Prisma 6.19.3を維持する
- **理由:** 今回指定された観測追記だけを、既存の永続制約・認証契約・マスタデータを再利用して原子的かつ所有者限定で提供し、Undo・候補計算・キャッシュ等を先取りしないため
- **影響:** 候補計算とPRODUCT_SPEC §10.3形式のレスポンスは未実装のため、別タスクとして範囲を確定する必要がある。BATTLE-003は本APIが保存した`isRevoked=false`の観測を対象にUndoを実装できる

## 2026-07-26 観測情報Undo(BATTLE-003)

### D-040: 正式DELETE URL・直近観測限定・条件付き論理更新

- **判断:** PRODUCT_SPEC §10.2とIMPLEMENTATION_PLANに明記された `DELETE /api/v1/sessions/:id/observations/:obsId` を1本だけ追加する。今回の明示要件である「直近の有効な観測だけをUndo」と両立させるため、`obsId`は任意の過去観測を選ぶ指定ではなく、現在の直近有効Observationを確認する競合防止トークンとして扱う。最大seqの未取消Observationと一致しない`obsId`は更新しない
- **判断:** URL paramsはSession UUIDとObservation UUIDだけのstrictなsharedスキーマで検証し、body・userId・seqを受け取らない。既存sessions APIと同じ `JwtAuthGuard` / `@CurrentUser()`を使い、Sessionを`id + userId`で検索する。他人・adminが所有しないSessionと不存在Sessionは同じ`404 NOT_FOUND`、`ended / archived`は`400 INVALID_SESSION_STATE`にする
- **判断:** Session確認、`isRevoked=false`かつ最大seqのObservation取得、`id + sessionId + seq + isRevoked=false`による条件付き`updateMany`をSerializableな単一Prisma transactionで行う。P2034はtransaction全体を最大3回再試行する。再試行後は同じ`obsId`が次の有効観測と一致しないため、同時Undoで別の観測まで連続して取り消さない。更新件数が1でない場合も`409 OBSERVATION_CONFLICT`とする。生SQLは使用しない
- **判断:** 有効Observationが0件、既にUndo済みの`obsId`、直近以外の`obsId`は、SessionやURL形式の不存在ではなく現在状態に対して操作を適用できない競合なので`409 OBSERVATION_CONFLICT`へ統一する。Observationは物理削除せず`isRevoked`だけをfalseからtrueへ変更し、seq・kind・payload・observedAtは維持する。BATTLE-002の採番は取消済みを含む最大seq+1のまま変更せず、seqを再利用しない
- **判断:** 成功レスポンスは取消したObservationの `id / sessionId / seq / kind / pokemonId / moveId / itemId / abilityId / position / isRevoked / createdAt`だけとし、専用strictスキーマで`isRevoked=true`を保証する。userId・認証情報は返さない。PRODUCT_SPECと従来IMPLEMENTATION_PLANはUndo時の候補再計算を記載するが、今回の明示要件では候補計算・`scoreArchetype`・`rankCandidates`が対象外のため、Observation単体レスポンスまでに限定する
- **判断:** SCORE側は既に`isRevoked=true`の観測を計算対象外にしているため変更せず、Undo APIからscoringを呼ばない。既存Observationモデルと制約だけで実現できるため、Prisma schemaとmigrationは変更せず6.19.3を維持する
- **理由:** 正式なREST契約を維持しつつ、誤操作や同時リクエストで複数観測を取り消すことを防ぎ、追記型の観測履歴と所有権秘匿を壊さずにBATTLE-003だけを完結させるため
- **影響:** PRODUCT_SPECに記載されたUndo直後の候補レスポンスは未実装のまま残る。候補計算の責務はBATTLE-004以降で確定する。WEB-004は表示中の直近有効Observation IDを本URLの`obsId`へ渡す必要がある

## 2026-07-26 候補取得・選択・終了(BATTLE-004)

### D-041: 現行シーズン候補・表示候補限定選択・単一選択集計・終了遷移

- **判断:** PRODUCT_SPEC §10.2とIMPLEMENTATION_PLANに明記された `GET /api/v1/sessions/:id/candidates`、`POST /api/v1/sessions/:id/select`、`POST /api/v1/sessions/:id/end` の3本だけを追加する。全ルートへ既存sessions controllerの`JwtAuthGuard`と`@CurrentUser()`を適用し、Sessionを`id + userId`で検索する。他人・adminが所有しないSessionと不存在Sessionは同じ`404 NOT_FOUND`にする
- **判断:** 候補取得・選択・終了は対戦中操作として`status=active`だけを許可し、`ended / archived`は`400 INVALID_SESSION_STATE`とする。PRODUCT_SPECは終了済みSessionの候補再取得を明記せず、対戦履歴はHISTORY-001のため、本タスクでは終了後の読み取り用途を追加しない
- **判断:** 候補対象はSessionの`ruleId`と一致し、現在のUTC日付がSeasonの`startsAt <= currentDate <= endsAt`に含まれ、`status=published`の構築に限定する。SessionにはseasonIdがないため、日付範囲をPRODUCT_SPEC §7.1の「現行シーズン」の判定根拠とする。重複期間のSeasonが存在する場合は条件を満たす全published構築を対象にする
- **判断:** SessionとObservationは所有者条件付きで1回、Archetypeはポケモン・メガ状態・技タグまでnested selectした1回のクエリで取得し、N+1を避ける。Observationは取消済みを含めseq昇順でkind別の必須・禁止payloadを検証して`ObservationInput`へ変換し、`isRevoked=true`の除外は既存`scoreArchetype`に委ねる。ArchetypeのDecimal・JSONB・日時は全件を`ArchetypeSnapshot`へ厳密に変換し、不正な永続状態は黙って候補から落とさず`500 INTERNAL_ERROR`とする
- **判断:** 異常件数による計算量発散を避けるため、published構築の取得上限はARCHETYPE-005と同じ500件、表示件数はPRODUCT_SPEC §7.3・付録Bどおり3件とする。各Snapshotへ既存`scoreArchetype`を実行し、既存`rankCandidates`でexcluded除外と一致度→人気度tier→遭遇数→更新日→archetypeIdの決定的順序を適用する。独自スコア・閾値・補正は追加しない
- **判断:** 候補レスポンスは`sessionId / candidates`とし、候補は`rank / archetypeId / name / matchRate / popularityTier / matched / contradictions / exclusionCodes / likelyUnseen / threatMoveIds`だけを返す。ARCHETYPE-005のstrictな表示候補スキーマを再利用し、`rawScore / maxScore / excluded / userId`等の内部値は返さない。対象構築または非除外候補が0件なら200の空配列とする
- **判断:** 選択できるのは同じ時点の候補計算で返る上位3件だけとし、別Rule・archived・現行Season外・excluded・上位外は`400 INVALID_ARCHETYPE_SELECTION`とする。Sessionの`selectedArchetypeId IS NULL`条件付き更新と対象Archetypeの`pickCount + 1`をSerializable transactionで原子的に実行し、P2034は最大3回再試行する。PRODUCT_SPECに再選択・候補変更時の集計仕様がないため、二重加算を防ぐ目的で一度選択済みのSessionは同一候補・別候補とも`409 BATTLE_CONFLICT`とし、既存pickCountを変更しない
- **判断:** 終了入力はstrictな任意`result`（`win / lose / unknown`）とし、省略時はDBのnullable表現を維持する。`selectedArchetypeId`は仕様・DBともnullableなので未選択でも終了可能とする。所有者込みでactive状態を確認後、`status=ended / endedAt=現在時刻 / 任意result`をSerializable transaction内の条件付きupdateで保存し、selectedArchetypeIdは維持する。既にended/archivedの再終了は400、同時終了の条件付き更新・直列化競合は`409 BATTLE_CONFLICT`とする
- **判断:** 既存BattleSessionモデルに`selectedArchetypeId / result / status / endedAt`、Archetypeに`pickCount`が存在するため、Prisma schemaとmigrationは変更せず6.19.3を維持する。Redis・候補固定保存・counterplan・自動アーカイブ・履歴・WebSocket・UIは追加しない
- **理由:** 現行DBと完了済みscoringを唯一の計算根拠として、候補表示・選択集計・終了を所有者限定かつ決定的・原子的に提供し、後続のキャッシュ・対策・履歴機能を先取りしないため
- **影響:** PRODUCT_SPECにある観測追加・Undoレスポンス内の最新候補は引き続きObservation単体レスポンスのままで、クライアントは本GETを呼んで候補を更新する。再選択や終了済みSessionの候補閲覧が必要になった場合は、pickCountの補正・履歴契約と合わせて別タスクで仕様化する

## 2026-07-26 Redisアダプター基盤(SETUP-010)

### D-042: 公式node-redis・任意接続・フォールバック可能な操作結果

- **判断:** Redis 7向けクライアントは、Redis公式Node.jsクライアントでありNode.js 20以降に対応する`redis` 6.1.0(node-redis)を1つだけ採用する。`ioredis`も自動再接続等を備える一般的な候補だが、現行のNode.js 22 / NestJS 11 / TypeScript構成では公式クライアントで要件を満たせるため併用しない
- **判断:** root `AppModule`がglobalな`RedisModule`を1回importし、利用側には`REDIS_ADAPTER` tokenと`RedisAdapter` interfaceだけを公開する。node-redisのclientと生成providerはモジュール内部へ隠し、後続機能が具体クライアントAPIへ直接依存しないようにする。SETUP-010では新しいHTTP APIやhealthレスポンス項目を追加しない
- **判断:** `REDIS_URL`は任意とし、未設定・空値ならclientを生成せずRedisを無効化する。不正URLは`redis:` / `rediss:` schemeとhostnameを検証して無効化し、URL・passwordを含まない警告だけを記録する。`.env.example`のlocalhost値は開発用の例として維持する
- **判断:** module初期化時に明示的に`connect()`し、接続待ちは上限1.25秒としてAPI起動を阻害しない。接続timeoutは1秒、再接続は250msから指数的に増加させ5秒で上限、command queueは1000件を上限とし、無限高速再試行と無制限なメモリ増加を避ける。`ready / reconnecting / end / error`で利用可否を追跡し、Redis復旧時は同じadapterを再利用可能にする。module終了時はopenなclientを`destroy()`する
- **判断:** adapterは`isAvailable / ping / get / set / setWithTtl / delete`だけを提供する。操作結果は`{ status: "ok", value } | { status: "unavailable" }`とし、`get`成功時の`null`(キー不存在)と接続・command失敗を区別して、後続機能がDBへフォールバックできるようにする。Redis障害をRFC 9457 HTTPエラーへ直接変換せず、同一障害中の警告は抑制して秘密情報を出さない
- **判断:** `setWithTtl`は正の安全な整数秒だけを受け付け、不正値はRedisへ送らず`RangeError`にする。JSON helperは型安全性を保証できず、保存対象ごとのZod schema検証をadapterへ持ち込むと基盤が利用機能へ依存するため追加しない。利用側がserialize / deserializeとZod検証を担当する
- **理由:** Redisを必須DBやAPI起動の単一障害点にせず、接続・ライフサイクル・障害判定だけを一箇所へ閉じ込め、BATTLE-005等が安全にフォールバックできる最小の再利用基盤を用意するため
- **影響:** BATTLE-005は`REDIS_ADAPTER`を注入して候補レスポンス固有のJSON/Zod検証・キー・TTL・invalidationを実装する。キャッシュ、レート制限、Pub/Sub、WebSocket、分散ロックは本タスクでは未実装のまま

## 2026-07-26 Redis候補キャッシュ(BATTLE-005)

### D-043: 最終レスポンスキャッシュ・状態versionキー・30秒TTL

- **判断:** `GET /api/v1/sessions/:id/candidates`のshared Zod検証済み最終レスポンス全体だけをJSONでキャッシュする。読込後も同じ`battleCandidatesResponseSchema`でstrictに検証し、sessionId不一致、不正JSON、schema不一致はキャッシュmissとして破棄する。`rawScore / maxScore / excluded / userId`等の内部情報は保存しない
- **判断:** Redisキーは`battle:candidates:v1:{sessionId}:{SHA-256 version}`とする。version入力にはSessionの`id / ruleId / status / selectedArchetypeId`、seq順に正規化した全Observationのkind別payloadと`isRevoked`、ID順に正規化した現行Season・同一Rule・published Archetypeの全`ArchetypeSnapshot`を含める。Snapshotには候補内容、`updatedAt`、`popularityTier / popularityScore / encounterCount`を含むため、観測追加・Undo・順序変更・候補選択・Session状態変更・構築CRUD・人気度更新・Season archive後は別キーとなる
- **判断:** 所有者を含むSession検索とactive状態検証、候補対象Archetypeの読込・Snapshot検証はRedis参照より前に毎回行う。キャッシュhit時だけ`scoreArchetype / rankCandidates`を含む計算callbackを省略する。候補選択の妥当性確認はSerializable transaction内で最新状態を使う既存の非キャッシュ計算を維持する
- **判断:** TTLは仕様に定義がないため既定30秒とし、`BATTLE_CANDIDATES_CACHE_TTL_SECONDS`で変更可能にする。正の安全な整数だけを採用し、未設定・空値・0以下・小数・非数・安全整数超過はAPI起動を妨げず30秒へフォールバックする。version変更で参照されなくなった旧キーは、prefix走査やRedis固有APIを追加せず短いTTLで自動削除する
- **判断:** SETUP-010のglobal `RedisModule`、`REDIS_ADAPTER` token、`RedisAdapter` interface、`isAvailable / get / setWithTtl / delete`だけを再利用する。Redis未設定・停止・timeout・get/set/delete失敗ではHTTPエラーへ変換せずDB計算結果を返す。破損エントリはbest-effortで削除し、削除失敗も正常レスポンスへ影響させない。stampede対策、分散ロック、Pub/Sub、明示的な全キー走査は追加しない
- **理由:** 候補APIの契約と決定的なscoring結果を変えず、状態変化や管理更新による明示的invalidation漏れを防ぎながら、Redisを単一障害点にせず同一状態の高コスト計算だけを省略するため
- **影響:** キャッシュhitでも所有権確認と2件のDB読取は行われ、改善対象はSnapshot以降のscoring/rankingとレスポンス構築である。旧versionキーは最大TTLまで残るが参照されず、30秒後にRedisが削除する。より長いTTLやDB読取自体の省略が必要になった場合は、管理更新を含む世代管理を別タスクで設計する

## 2026-07-26 観測入力レート制限(BATTLE-006)

### D-044: 観測入力だけを対象にしたRedis fixed window・60req/分・fail-open

- **判断:** PRODUCT_SPEC §14、API_CONVENTIONS、IMPLEMENTATION_PLANの明記を優先し、レート制限対象は`POST /api/v1/sessions/:id/observations`だけとする。Session作成、Undo、候補取得、選択、終了、およびauth / master / party / admin APIへは適用しない。Controllerの既存`JwtAuthGuard`実行後に、観測追加methodへだけ`BattleRateLimitGuard`を適用し、JWT検証済みの`CurrentUser`と同じuserIdを利用する
- **判断:** アルゴリズムは最初の許可リクエストから60秒で失効するfixed window counterとし、既定上限を60件とする。Redisキーは`battle:rate:v1:{userId}:observations`とし、access token、IP、Session ID、route parameter実値を含めない。同一ユーザーはSessionを切り替えても同じ観測入力枠を共有し、別ユーザーと複数APIインスタンスはRedis上で独立・共有可能にする
- **判断:** SETUP-010の`RedisAdapter`へ、カウンタincrementとTTL未設定時のexpireを同一Lua script内で実行し、その時点のcount / 残りTTLを返す汎用`incrementWithTtl`だけを追加する。node-redisとscriptはadapter内へ隠し、Sessions側は`REDIS_ADAPTER` tokenと抽象結果型だけへ依存する。これにより並行リクエストのlost updateと、increment成功・expire失敗による無期限キーを防ぐ
- **判断:** 60件目までは許可し、61件目以降は`429`、`code=RATE_LIMITED`のRFC 9457 Problem Detailsと、残りウィンドウ秒を正の整数にした`Retry-After`を返す。拒否時もcounterはincrementするがTTLは延長しないため、最初のwindow終了時に必ず回復する。残回数等の未定義ヘッダーは追加しない
- **判断:** `BATTLE_RATE_LIMIT` / `BATTLE_RATE_LIMIT_WINDOW_SECONDS`で開発・運用時に変更可能とし、未設定・空値・0以下・小数・非数・安全整数超過は起動失敗にせず仕様既定値60へフォールバックする。Redis未設定、停止、timeout、操作失敗、予期しない応答では429へ変換せずfail-openし、Redis復旧後は同じadapterで制限を再開する。Redis URL、key、userId、tokenをエラー本文へ含めない
- **理由:** 仕様が対象と数値を明確に限定しているため不要な全体制限を避け、MVPで説明・検証しやすいfixed windowを採用しつつ、Redisの原子操作で分散環境の同時実行安全性とTTL保証を満たすため。Redisは補助基盤というSETUP-010の可用性方針も維持する
- **影響:** window境界付近ではfixed window固有のburstが起こり得る。より平滑な制限、authブルートフォース対策、IP制限、プラン別上限が必要になった場合は、対象・数値・アルゴリズムを別タスクで仕様化する

## 2026-07-26 セッション自動アーカイブ(BATTLE-007)

### D-045: 状態別の最終活動時刻・90日閾値・NestJSライフサイクル内scheduler

- **判断:** PRODUCT_SPEC §5と付録Bの`session.archive_days=90`をactive/ended双方の既定保持期間とする。activeは対戦中の最終活動を表す`updatedAt`、endedは終了時点を表す`endedAt`が、それぞれ現在時刻から90日より前（境界ちょうどを除く）なら対象にする。`BATTLE_ACTIVE_ARCHIVE_AFTER_SECONDS` / `BATTLE_ENDED_ARCHIVE_AFTER_SECONDS`で状態別に独立変更でき、正の安全な整数でない値は既定値へフォールバックする。activeをarchiveしても終了操作とは扱わず`endedAt`はnullのままにする
- **判断:** 既存のcron・scheduler基盤がなく、外部cron用HTTP APIやジョブキューも仕様にないため、追加依存なしの`setInterval`をNestJSの`OnApplicationBootstrap / OnModuleDestroy`で管理する。実行間隔は`BATTLE_ARCHIVE_INTERVAL_SECONDS`で変更でき、仕様未定義の既定値は90日の保持期間に対して十分短くDB負荷を抑える1時間とする。起動時はintervalを登録し、初回実行は1 interval後とする。Node.js timer上限を超える値を含む不正値は1時間へフォールバックする
- **判断:** Serviceはactiveの`status + updatedAt`条件とendedの`status + endedAt IS NOT NULL`条件をORにした単一Prisma `updateMany`で、対象を`archived`へ一括更新して処理件数を返す。statusと時刻条件を更新時に再確認するため、複数APIインスタンスが同時実行しても最初の更新後は後続処理の対象外となる。分散ロック・生SQLは追加しない。同一プロセス内ではschedulerの実行中フラグで重複起動をスキップし、例外後も必ずフラグを解除して次回実行可能にする
- **判断:** Observation追加とUndoはactive Sessionの`updatedAt`を既存Serializable transaction内の所有者・status条件付きupdateで先に更新する。これにより、観測処理が成功したSessionを古い活動時刻のままarchiveせず、archiveとの競合では一方が条件不成立または直列化競合になって部分保存しない。候補選択と終了は既存処理がBattleSession自体を更新するため追加変更しない
- **判断:** archive更新は`status`以外を変更せず、`result / selectedArchetypeId / endedAt / Observation / Party / Archetype`を維持する。候補取得・観測追加・Undoは既存のactive状態検証によりarchive後も`400 INVALID_SESSION_STATE`となる。BATTLE-005の候補キーはSession statusをversionへ含み、旧キーは30秒TTLで自然失効するため、Redis削除やRedis依存をarchive処理へ追加しない。Redis停止中もDB処理だけで完了する
- **判断:** 新しい公開HTTP APIとhealth項目は追加しない。schedulerは開始・完了・処理件数だけを集約ログへ記録し、失敗時はSession ID・userId・接続情報・例外内容を含めない固定メッセージを記録して次回実行を継続する。現行BattleSessionモデルだけで完了できるため、Prisma schemaとmigrationは変更せず6.19.3を維持する
- **理由:** 90日の保持仕様を、対戦中の実際の更新と終了時刻に対応させ、HTTPやRedisを新たな障害点にせず、単一・複数プロセスの双方で冪等かつ競合に安全な最小バッチとして実現するため
- **影響:** 現行DBの複合indexは`(status, startedAt)`であり、本タスクが使用する`updatedAt / endedAt`向けindexはDB変更禁止に従い追加していない。データ量増加後に実行計画上の問題が出た場合は、前進migrationを別タスクで検討する

## 2026-07-26 ログイン・登録画面(WEB-005)

### D-046: 認証ルートとブラウザ内トークン保存

- **判断:** 認証画面は `/login` と `/register`、認証後の最小保護画面は `/` とする。未認証の保護ルートは `/login`、認証済みの認証ルートは `/` へ置換遷移し、後続画面でも再利用できるroute guardを用意する
- **判断:** access tokenはZustandのメモリ内だけに保持し、永続ストレージへ保存しない。refresh token、refresh有効期限、公開Userだけをversion付きstrictスキーマで `sessionStorage` へ保存し、ページ再読み込み時はrefresh APIでaccess tokenを再発行する。破損・期限切れ・refresh失敗時は保存情報を破棄する
- **判断:** `localStorage` はブラウザ終了後も秘密情報が残るため使用せず、現行APIにHttpOnly Cookie契約がない範囲でタブ単位の `sessionStorage` に限定する。sessionStorageもXSSからは読み取れるため、画面へ未信頼HTMLを挿入せず、将来Cookie APIを追加する場合はCSRF対策と同じタスクで移行する
- **判断:** 認証APIクライアントはsharedのrequest/response ZodスキーマとRFC 9457スキーマを通し、Bearer付与、期限切れ前refresh、401時のrefresh後1回だけ再試行を担う。同時refreshは単一Promiseへ集約し、失敗時は認証情報を破棄して無限retryしない
- **判断:** AUTH-003にログアウト失効APIがないため、WEB-005のログアウトはクライアント内のメモリとsessionStorageの破棄だけを行う。サーバー側refresh tokenの即時失効はAPI契約追加を伴う後続認証タスクとする
- **理由:** 現行のJSON token APIを変更せずに再読み込み復元、複数リクエストの安全なrefresh、未認証リダイレクトを実現し、長期間残るブラウザ保存とaccess token露出を最小化するため
- **影響:** タブを閉じるとログイン状態は失われる。別タブにはログイン状態を共有しない。後続の保護APIクライアントは同じ認証アダプターを通す

## 2026-07-26 公開Rule一覧API(MASTER-010)

### D-047: 一般ユーザー向けRule一覧の公開範囲と決定順

- **判断:** Party作成に必要なRule参照APIとして、既存masterリソース命名に合わせて`GET /api/v1/master/rules`を1本だけ追加する。Pokemon・Move・Item・Abilityのmaster APIと同様に認証なしで公開し、admin guardは適用しない。既存`GET /api/v1/admin/rules`の認証・認可・作成責務は変更しない
- **判断:** レスポンスは`{ items: [{ id, name, teamSize, pickSize }] }`のみとし、timestampsや管理情報を返さない。管理・公開Ruleが同じ値制約を維持できるよう、保存済みRuleのstrict Zodスキーマを共有する。DB値がID・名前・人数範囲・`pickSize <= teamSize`を満たさない場合は、壊れた値を返さず内部情報を含まない`500 INTERNAL_ERROR`とする
- **判断:** Prismaで4列だけを単一`findMany`し、並び順は既存admin Rule一覧と同じ`name ASC → id ASC`とする。名前一意制約下でもIDを最終キーに含めて決定性を明示し、0件は`200 { items: [] }`とする
- **理由:** 一般ユーザーが管理APIへ依存せず、Party作成前に有効な`ruleId`と`teamSize`を取得できるようにしながら、管理権限と公開情報を最小範囲に保つため
- **影響:** WEB-006はこのAPIからRule選択肢と人数制約を取得できる。Rule作成・更新・削除、Season公開、Pokemon種族値公開はMASTER-010の対象外

## 2026-07-26 公開ポケモン詳細・種族値API(MASTER-011)

### D-048: 選択済みPokemon詳細と検索レスポンスの責務分離

- **判断:** Party入力で選択済みPokemonの種族値を取得するAPIとして、RESTの単体リソース形式に合わせて`GET /api/v1/master/pokemons/:id`を1本だけ追加する。既存master参照APIと同じく認証なしで公開し、admin guardは適用しない
- **判断:** 既存`GET /api/v1/master/pokemons?q=`はオートコンプリート用の軽量契約を維持し、種族値を追加しない。詳細は検索結果と共通の`id / dexNo / nameJa / nameEn / form / type1 / type2 / isMega / basePokemonId`に、PrismaのcamelCase名どおり`baseHp / baseAtk / baseDef / baseSpa / baseSpd / baseSpe`だけを加えたstrictレスポンスとする。abilitiesは既存の特性候補API、習得技は既存の技検索APIが担う
- **判断:** `id`は正数かつPostgreSQL `int4`上限以内で検証し、不正形式は`400 VALIDATION_ERROR`、不存在は`404 NOT_FOUND`とする。Prisma `findUnique`は必要15列だけをselectし、種族値1〜255を含む公開契約に反するDB値やPrismaエラーは内部情報を含まない`500 INTERNAL_ERROR`とする
- **判断:** PRODUCT_SPECに実数値計算レベルの固定値がないため、レベルは詳細レスポンスへ含めない。HP・その他能力・性格補正の計算およびレベルのUI仕様はWEB-006で扱う
- **理由:** 検索候補の転送量と責務を増やさず、選択後だけ計算に必要な正確な種族値を取得できるようにし、abilities・PokemonMove・内部情報の重複公開を避けるため
- **影響:** WEB-006は検索でPokemonを選択した後、この詳細APIから6種族値を取得して実数値計算へ利用できる

## 2026-07-26 ホーム・パーティ登録画面(WEB-006)

### D-049: Party作成ルート・Rule連動フォーム・実数値計算レベル

- **判断:** 認証済みホーム`/`をParty一覧へ置き換え、新規作成はPRODUCT_SPECにURLの明記がないため`/parties/new`の1画面だけを追加する。編集・削除・対戦開始は今回の明示範囲外とし、対戦開始ボタンは後続実装であることが分かる無効状態にする
- **判断:** 一覧と作成mutationはTanStack Queryで管理し、保存成功時にParty一覧queryをinvalidateする。ZustandはWEB-005の認証状態だけに維持し、長いフォームの入力状態は画面ローカルに置く。認証付きParty APIは既存APIクライアントを通し、401時の単一refresh・1回だけの再試行を再利用する
- **判断:** Ruleは公開`GET /api/v1/master/rules`から取得し、選択した`teamSize`と同数のslotを作る。Party一覧レスポンスにはPokemon件数がないため、APIが保存時に常にRule.teamSizeとの一致を保証する現行契約に基づき、一覧の「登録済み数」は対応RuleのteamSizeを表示する。Rule取得失敗時は不確かな件数・名称を推測せずRule IDと確認中表示へフォールバックする
- **判断:** Pokemon・技・持ち物は300ms debounceかつ2文字以上で公開検索し、技は選択中の`pokemon_id`を必ず付ける。特性はPokemon選択後に`pokemon_id`で取得し、Pokemon詳細は選択後だけ取得する。同一Party内のPokemon ID重複と同一Pokemon内の技ID重複は候補から除外し、送信時にもsharedのstrict `partyWriteSchema`で再検証する。通常形態とメガ形態は名称ではなく別Pokemon IDとして扱う
- **判断:** PRODUCT_SPECに計算レベルの固定値がなくParty APIにもlevel保存項目がないため、レベルを1〜100の必須・画面内一時入力として追加し、既定値は置かない。レベル自体は送信せず、MASTER-011の6種族値・IV・EV・性格から仕様どおりのfloor順で算出した`actualStats`だけを保存する。実数値欄はAPI契約どおり正整数で手動上書きを許可し、レベル・性格・EV・IV変更時は上書きを破棄して再計算する
- **判断:** 現行`partyWriteSchema`は各Pokemonの技をちょうど4件要求するため、UIも1〜4件ではなく4件必須として契約へ一致させる。Item・Ability・Tera Typeは現行APIどおり任意、Nature・EV・IV・actualStatsは既存契約どおり送信する。エラーはRFC 9457のcodeだけを安全な日本語へ写像し、サーバーdetailは表示しない
- **理由:** APIやDBを変更せず、MASTER-010/011とPARTY-002の公開契約だけで、Rule人数・習得技・種族値計算を含む実用的なParty登録フローを構成するため
- **影響:** Party編集・削除、複数Party切替、対戦セッション開始は後続タスクのまま。レベルはPartyに永続化されないため、保存後に同じ計算レベルを画面へ復元する機能はない

## 2026-07-26 相手ポケモン入力画面(WEB-001)

### D-050: 対戦開始・入力ルートと成功済み観測のタブ内復元

- **判断:** PRODUCT_SPECにWeb URLの指定がないため、認証済み対戦開始画面を`/battle/new`、対戦入力画面を`/battle/:sessionId`とする。ホームのactive Partyだけに開始リンクを設け、開始画面では`GET /parties`と公開`GET /master/rules`を使ってactive PartyとRuleを再確認し、strictなshared契約どおり`POST /sessions`へ`partyId / ruleId`だけを送る。未認証時は既存route guardで`/login`へ遷移する
- **判断:** Pokemon入力は公開`GET /master/pokemons?q=`を300ms debounceかつ2文字以上で呼び、候補のID・日英名・form・type・isMegaを表示する。候補タップ時は`POST /sessions/:id/observations`へ`{ kind: "pokemon", pokemonId }`だけを送り、成功レスポンスをstrictスキーマで検証できた場合だけ入力順リストへ追加する。通常形態とメガ形態は名称でまとめず別Pokemon IDとして扱い、同じIDは候補から除外する
- **判断:** 入力可能数はSessionのruleIdに対応する公開Ruleの`teamSize`とし、Ruleを取得・特定できない間は推測値で入力を許可しない。送信中refとmutation状態で二重送信を防ぎ、上限到達後は検索・候補選択を無効にする。API入出力、JWT refresh、TanStack Queryのリクエスト取消・古い検索結果分離は既存クライアントとquery keyを再利用し、対戦入力状態は画面固有なのでZustandへ追加しない
- **判断:** 現行`GET /sessions/:id`レスポンスにはObservation一覧がなく、WEB-001ではAPI変更が明示的な対象外であるため、この画面から追加に成功したPokemon概要とObservationレスポンスだけをSession UUID単位のversion付き`sessionStorage`へ保存する。読込時はSession所有権・状態をAPIで確認した後、strict ZodスキーマでsessionId、Pokemon ID、非取消pokemon観測、seq昇順、重複なしを検証し、破損値は破棄する。token・userId・秘密情報は保存せず、`localStorage`やZustandによる永続化は行わない
- **判断:** RFC 9457の`INVALID_PARTY_STATE / INVALID_SESSION_STATE / INVALID_MASTER_REFERENCE / NOT_FOUND / RATE_LIMITED / UNAUTHORIZED / INTERNAL_ERROR`はcodeだけを安全な日本語へ写像し、サーバーのdetailを表示しない。技・Item・Ability・position・mega観測、候補、Undo、選択・終了は後続WEBタスクへ残し、API・DB・shared契約は変更しない
- **理由:** 完了済みBATTLE APIの所有権・原子性・レート制限をそのまま利用し、対戦中の最短操作を保ちながら、API契約を広げずWEB-001のPokemon観測だけを安全に実装するため
- **影響:** 同一タブでこの画面から追加したPokemonはreload後も復元できるが、別端末・別タブ・sessionStorage消去後や他クライアントから追加されたObservationは復元できない。完全なサーバー復元にはObservation一覧を含む読取契約を別タスクで仕様化する必要がある。IMPLEMENTATION_PLANにある対戦画面用Zustandは、今回の画面ローカル状態を不必要にグローバル化しない明示要件を優先して追加していない

## 2026-07-27 技入力画面(WEB-002)

### D-051: Pokemon単位の習得技検索とversion付き観測イベント復元

- **判断:** 新規ルートは追加せず、WEB-001の`/battle/:sessionId`をPokemon選択・技検索・観測済み技表示で拡張する。技入力対象はこの画面で追加成功・復元できたPokemon Observationだけとし、選択中PokemonをID単位で明示する。通常形態とメガ形態は別IDとして扱い、Pokemon切替時は検索語と表示候補を即時破棄する
- **判断:** 技検索は既存公開`GET /api/v1/master/moves?q=&pokemon_id=`を300ms debounceかつ2〜50文字で呼び、TanStack QueryのkeyへPokemon IDと検索語を含める。候補は日英名・type・category・power・accuracy・priorityを表示し、同一Pokemonで観測済みのmoveIdだけを除外する。技観測に仕様上の件数上限がないためUI独自上限は設けず、同じmoveIdを別Pokemonへ追加することは許可する
- **判断:** 選択時は既存`POST /api/v1/sessions/:id/observations`へstrict shared契約どおり`{ kind: "move", pokemonId, moveId }`だけを送り、送信直前にも対象Pokemonの存在と同一Pokemon内の重複を再確認する。共通の送信中refで連打とPokemon/技Observationの同時送信を防ぎ、sharedレスポンス検証後だけUIと保存状態へ追加する。JWT付与・401 refresh・1回だけの再試行はWEB-005のAPIクライアントを変更せず再利用する
- **判断:** WEB-001のPokemon-only `sessionStorage` v1は、Session UUID単位のv2へ安全に移行する。v2はPokemonとmoveを単一のseq順イベント列として保存し、strict Zodでversion、sessionId、Observation ID、seq単調増加、kind別payload、非取消状態、表示用マスタ概要、Pokemon→moveの参照順、同一Pokemon内の技重複を検証する。正常なv1はPokemonイベントへ変換してv2保存後に旧keyを削除し、破損値は破棄する。token・userId・秘密情報は保存せず、localStorageやZustandへ移さない
- **判断:** RFC 9457の`VALIDATION_ERROR / INVALID_SESSION_STATE / INVALID_MASTER_REFERENCE / RATE_LIMITED / NOT_FOUND / UNAUTHORIZED / INTERNAL_ERROR`と通信失敗はcodeまたは通信状態だけから安全な日本語へ変換し、server detailは表示しない。今回の明示範囲に従い、PRODUCT_SPEC B-03および従来のIMPLEMENTATION_PLANが同じ画面群に含める持ち物・特性・先発/控え・メガ入力は実装せず、候補・Undo・終了とともに後続の範囲確定へ残す
- **理由:** 完了済みMASTER-007とBATTLE-002の習得関係・所有権・状態・原子性・レート制限を変更せず、対戦中に対象Pokemonを取り違えない短い技入力と、WEB-001のタブ内復元互換性を両立するため
- **影響:** 同一タブで本画面から成功したPokemon・技観測はreload後も復元できるが、GET SessionにObservation一覧がないため別端末・別タブ・他クライアントからの追加やUndoは完全同期できない。持ち物・特性・position・megaのUIは未実装であり、着手前にタスク範囲またはIDを明確化する必要がある
