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

## 2026-07-27 候補上位3件表示(WEB-003)

### D-052: Session単位の候補取得・観測成功後の再取得・補助名称の安全な解決

- **判断:** 新規ルートやタブ状態は追加せず、既存の`/battle/:sessionId`で入力より先に現在候補を確認できる縦方向のセクションを追加する。候補は既存`GET /api/v1/sessions/:id/candidates`だけを正とし、TanStack QueryのkeyをSession ID単位で分離する。レスポンスはsharedのstrict `battleCandidatesResponseSchema`に加えて要求Session IDとの一致も検証し、サーバー順を並べ替えず最大3件をそのまま表示する。Web側でスコア・除外・順位を再計算しない
- **判断:** PokemonまたはMove Observationの保存成功後だけ、進行中の同Session候補queryをcancelしてからexact keyをinvalidateする。更新中は直前の候補を維持して状態を明示し、失敗したObservationでは再取得しない。これにより入力前に開始した遅い候補レスポンスが、保存後の新しい結果を上書きすることを防ぐ。ポーリング、WebSocket、候補のsessionStorage保存、Zustandへの複製は行わない
- **判断:** 候補はrank、構築名、サーバー値を表示用に最大1桁へ丸めたmatchRate、人気度の`高 / 中 / 低`、matchedの一致・不一致と加減点、既知のcontradiction/exclusionの安全な日本語、likelyUnseen、threatMoveIdsを表示する。未知コードは値そのものやserver detailを露出せず「未分類の判定情報があります」へフォールバックし、`rawScore / maxScore / excluded / userId`等の非公開値は扱わない
- **判断:** matchedのPokemon/Move名称はSession UUID単位の既存sessionStorage v2に保存されたID一致の概要だけを利用し、item/ability/position/megaを含む将来kindもIDまたは定義済み表示へ安全にフォールバックする。likelyUnseenのPokemon名は既存公開詳細APIをTanStack Queryで重複排除して取得し、候補3件×最大チーム6体の18 IDを上限とする。詳細取得失敗は候補全体を失敗させずPokemon IDを表示する。公開Move詳細ID APIは存在しないため、threatMoveIdsは推測せず「技 ID」として表示する
- **判断:** 順位変動バッジは同じ画面ライフサイクル内の直前レスポンスと`archetypeId`で比較し、NEW / UP / DOWNを補助表示する。これは候補順位の再計算ではなくサーバーrankの変化表示であり、reload後の過去順位は永続化しない。候補0件は原因を推測しない正常な共通空状態、通信・状態・所有権エラーはRFC 9457のcodeだけを安全な日本語へ写像する
- **理由:** 完了済みBATTLE-004/005の候補契約・Redisキャッシュ・scoringを変更せず、対戦入力の保存結果だけに同期した決定的な上位3件表示を、既存の認証refresh・復元方式・公開master APIで構成するため
- **影響:** PRODUCT_SPECが観測追加レスポンスに最新候補を含める記述に対し、現行BATTLE-002はObservation単体レスポンスであるため、WebはD-041の既存判断どおり保存成功後に候補GETを1回行う。技名を警戒技へ表示するには、将来タスクで公開Move詳細契約を仕様化する必要がある

## 2026-07-27 Undo UI(WEB-004)

### D-053: 直近有効観測の論理取消・端末内履歴保持・候補再同期

- **判断:** 新規ルートは追加せず、既存の`/battle/:sessionId`に直近の有効Observation概要と「ひとつ戻す」操作を追加する。Undo対象はSession UUID単位のsessionStorage v2から`isRevoked=false`かつ最大`seq`の1件を配列順に依存せず決定し、そのIDをBATTLE-003の正式な`DELETE /api/v1/sessions/:id/observations/:obsId`へ渡す。bodyやuserId・seqは送らず、sharedのstrict `undoObservationResponseSchema`に加えて要求したSession ID・Observation IDとの一致を検証する
- **判断:** 楽観的更新は行わず、成功レスポンスが対象のseq・kind・payload・createdAtとも一致し`isRevoked=true`である場合だけ、既存イベントを削除せず同じ位置で取消済みへ更新する。sessionStorageのversionはv2のまま維持し、strict検証を取消状態へ拡張する。有効なPokemon IDと同一Pokemon内Move IDだけを重複判定することで、取消済み履歴を残したまま同じPokemon・Moveを新しいseqで再追加できるようにする。seqの詰め直しや再利用は行わない
- **判断:** 有効一覧・技入力対象・重複除外は取消済みを除外する。Pokemon観測を取消しても関連Moveを連鎖更新せず、サーバーが取消した1件だけを変更する。通常の直近限定Undoでは後続の有効Moveが先に対象となるが、別クライアントとの状態差などでPokemonが無効かつMoveが有効な履歴を復元した場合は、そのMoveを削除せず「Pokemon観測が現在無効な有効履歴」としてID・技名・seqを明示し、引き続き直近Undo対象にできる
- **判断:** Undo成功後は進行中の同Session候補queryをcancelしてexact keyをinvalidateし、Web側でスコアを計算しない。`409 OBSERVATION_CONFLICT`ではローカルObservationを変更せず、候補だけを再取得して「観測状態が更新されている可能性」を案内する。それ以外の失敗ではローカル状態と候補queryを変更しない。送信中refとmutation状態でPokemon・Move追加を含む二重送信を防ぐ
- **判断:** 現行`GET /sessions/:id`にはObservation一覧がないため、別タブ・別端末・sessionStorage消去後の完全同期や409後の履歴修復は行わず、推測したObservation IDも生成しない。RFC 9457の`INVALID_SESSION_STATE / NOT_FOUND / OBSERVATION_CONFLICT / UNAUTHORIZED / INTERNAL_ERROR`と通信失敗はcodeまたは通信状態だけから安全な日本語へ変換し、server detailを表示しない
- **理由:** BATTLE-003の直近限定・追記型履歴・競合防止契約を変更せず、対戦中のワンタップ操作でUI、同一タブ内復元、BATTLE-004の候補表示をサーバー成功後だけ整合させるため
- **影響:** sessionStorageに存在しない他クライアント由来ObservationはWebからUndoできず、409時に完全な観測履歴を復元できない。完全同期が必要になった場合は、Observation一覧の読取契約を別タスクで仕様化する必要がある。Redo、任意・複数Undo、他kind入力、候補選択・終了はWEB-004に含めない

## 2026-07-27 タイプ相性表・攻防相性(MATCHUP-002)

### D-054: sharedの18タイプ完全表と複合タイププロフィール

- **判断:** `normal / fire / water / electric / grass / ice / fighting / poison / ground / flying / psychic / bug / rock / ghost / dragon / dark / steel / fairy`の現行18タイプを`POKEMON_TYPES`としてsharedの正規許可値にし、MATCHUP-001の暫定`TypeName=string`をこのliteral unionへ置き換える。既存Pokemon・Move APIの文字列契約やDB制約は今回変更せず、相性エンジンの入力だけを型安全に限定する
- **判断:** 基本相性は攻撃18タイプ×防御18タイプの全324組を`TYPE_EFFECTIVENESS_CHART`へ明示し、未記載を暗黙の1倍として補完しない。基本倍率は`0 / 0.5 / 1 / 2`、複合倍率は積から生じる`0 / 0.25 / 0.5 / 1 / 2 / 4`だけを許可する。表本体と各行はfreezeし、利用側から共有データを変更できないようにする
- **判断:** matchupは単一倍率、`type2=null`を含む複合倍率、防御プロフィール(4倍弱点・弱点・等倍・半減・4分の1・無効)、攻撃プロフィール(抜群・等倍・今ひとつ・無効)を純粋関数として返す。結果は常に`POKEMON_TYPES`順とし、呼び出しごとに新しい配列を返す。DBの`pokemons_distinct_types`制約と揃えて同一type1/type2はRangeErrorで拒否する
- **判断:** PRODUCT_SPEC §9.2は攻撃・防御相性の最終配点を各0〜30とするが、タイプ倍率から点数へ変換する具体的な重みは定義していない。独自配点を追加せず、MATCHUP-002は後続評価の型安全な倍率・分類基盤までとし、技威力・実数値・想定技を含むスコア統合は計画どおりMATCHUP-003〜004で扱う
- **理由:** sharedをタイプ文字列の単一の正とし、表の欠落・可変参照・入力順・浮動小数点誤差による非決定性を防ぎながら、後続ダメージ計算と1対1評価へ副作用のない相性情報を提供するため
- **影響:** 現行18タイプ外の値はmatchupへ渡せない。STAB、テラスタル、特性、持ち物、例外技、天候・フィールドは基本表を上書きせず、明示された後続タスクで別の補正層として扱う必要がある

## 2026-07-27 ダメージ概算・確定数(MATCHUP-003)

### D-055: レベル入力を含む簡易式・乱数なしの範囲契約・確定数境界

- **判断:** PRODUCT_SPEC §9.3の係数`22`はレベル50の`floor(2 × level / 5) + 2`に一致するため、固定レベルが定義されていない現行契約ではレベル1〜100を入力として受け取り、この一般化した係数を使用する。基本ダメージは`floor(floor((level係数 × 威力 × 攻撃能力) / 防御能力) / 50) + 2`、その後にタイプ一致とMATCHUP-002の複合タイプ倍率をまとめて乗算し、最後にfloorする。整数除算と倍率はBigIntと整数比で計算し、浮動小数点誤差や安全整数外の結果を黙って補正しない
- **判断:** `physical`は攻撃対防御、`special`は特攻対特防を使用し、威力は既存Moveマスタ契約と同じ1〜300とする。`status`は`power=null`だけを受理してダメージ0・倒せない結果を返す。固定・割合・HP依存・連続技など、通常威力として扱えない技は今回の入力契約で表現せず、誤って通常式へ流さない
- **判断:** PRODUCT_SPECとIMPLEMENTATION_PLANが乱数を対象外とするため、`calculateDamageRange`の下限・上限は常に同値とし、Math.randomや独自の乱数率を導入しない。確定数は仕様どおり下限ダメージの`ceil(HP / minDamage)`、補助値として上限ダメージによる最短回数も返す。独立した確定数関数は範囲を受け取って確定/可能1発、2発、3発以上、倒せないを分類するが、現行ダメージ関数自身は乱数幅を生成しない
- **判断:** 攻撃側・防御側はPokemon ID、単一/複合タイプ、必要な実数値だけを持つMATCHUP専用Snapshotとし、Partyの`actualStats`等をDBエンティティのまま受け取らない。タイプ、分類、ID、レベル、能力、威力、ダメージ範囲は実行時にもRangeErrorで検証し、同一複合タイプ、NaN、Infinity、小数、安全整数外、0以下の能力を拒否する。割合は防御側HP基準で小数第2位に決定的に丸める
- **判断:** 今回の明示要件で対象外とされた持ち物・特性補正、テラスタル後の併記、急所等は実装しない。`calculateMatchupScore`への−15〜+15統合もMATCHUP-004へ残し、MATCHUP-003は再利用可能なダメージ・確定数プリミティブまでとする
- **理由:** PRODUCT_SPECの簡易式・乱数なし・純粋関数という優先仕様を維持しつつ、保存レベルを持たない現行Party/ArchetypeモデルからAPI層が明示的なSnapshotへ変換でき、後続の相性スコアが境界情報を失わず再利用できるようにするため
- **影響:** 現行結果では`minDamage === maxDamage`のため「possible」分類は直接のダメージ計算からは発生しない。持ち物・特性・テラスタルや特殊な威力仕様を含めるには、補正値と対応技を曖昧なタグだけで推測せず、別タスクで具体的な入力契約と計算順を定義する必要がある

## 2026-07-27 1対1相性スコア統合(MATCHUP-004)

### D-056: 実技のタイプ配点・確定数レース・中心化による決定的な統合

- **判断:** `CombatantSnapshot`へレベルを追加せず、`self / selfLevel / opponent / opponentLevel`を持つMATCHUP-004専用入力で1〜100のレベルを明示する。各方向についてMATCHUP-003の`calculateDamageRange`と`calculateKnockoutCount`を再利用し、status技、威力nullの未対応ダメージ技、相性無効等でダメージ0となる技を候補外にする。最良技・最危険技は確定数昇順、ダメージ降順、タイプ倍率降順、moveId昇順で決定し、入力順や採用率に依存させない
- **判断:** 攻撃相性は選択技の倍率`0 / 0.25 / 0.5 / 1 / 2 / 4`を`0 / 5 / 10 / 15 / 25 / 30`点、防御相性は相手選択技の同倍率を`30 / 25 / 20 / 15 / 5 / 0`点へ写像する。確定数差`incomingTurns - outgoingTurns`は3以上から−3以下までを`+15 / +10 / +5 / 0 / -5 / -10 / -15`点とし、片側だけ倒せる場合は±15、双方倒せない場合は0とする。倒せない状態は公開結果へInfinityを含めずnullで表現する
- **判断:** 最終点は`(offensiveScore - 15) + (defensiveScore - 15) + damageRaceScore`を中心化値とし、`round(centeredScore × 100 / 45)`を−100〜100へclampする。判定は`50以上 / 10〜49 / -9〜9 / -49〜-10 / -50以下`を既存literalの`favorable / slightly_favorable / even / slightly_unfavorable / unfavorable`へ対応させる。根拠は自由文章ではなく、タイプ相性・攻撃不能・確定数レースを表すliteralのreason code配列として返す
- **判断:** 相手の想定技は呼び出し側で既に選択された配列だけを評価し、`calculateMatchupScore`内では観測済み判定や採用率上位4技の抽出を行わない。採用率による技選定は、観測情報を優先して`ArchetypeSnapshot`から`CombatantSnapshot`を組み立てる後続層の責務とする。承認済み範囲に従い、素早さ、先制技、状態異常耐性、積み対応、特性・持ち物補正は今回の統合値へ加えず、MATCHUP-001互換breakdown上は0を返す
- **理由:** PRODUCT_SPEC §9.2だけでは未定義だった倍率ごとの配点・正規化・境界・技選択順を承認済み仕様で確定し、既存のタイプ相性表やダメージ式を重複させず、同一Snapshotから常に同じ構造化結果を得るため
- **影響:** 現在のスコアは渡された通常威力技とタイプ・実数値・レベルだけを評価する。採用率上位技の抽出、素早さ・先制技等の追加軸、持ち物・特性・テラスタルによる補正を導入する場合は、既存の−45〜45中心化レンジと正規化式を暗黙に変更せず、別タスクで配点契約を再定義する必要がある

## 2026-07-27 相性マトリクス・相手別おすすめ(MATCHUP-005)

### D-057: Pokemon ID順の全組み合わせ・既存スコアだけによる相手別上位3体

- **判断:** `CombatantSnapshot`を破壊的に変更せず、各陣営を`combatant + level`のreadonly配列として受け取るMATCHUP-005専用入力を追加する。Party・Archetypeのslotや実数値、相手の想定技は呼び出し側で変換・選択済みとし、本関数内でDB値の補完、採用率による技抽出、仮想技の追加を行わない
- **判断:** 行を自分Pokemon、列を相手Pokemonとし、双方をPokemon ID昇順へ正規化してから全組み合わせへ既存`calculateMatchupScore`を1回ずつ適用する。1〜6体を受理し、空配列、6体超、同一陣営内のPokemon ID重複はRangeErrorで拒否する。最大計算量は36セルであり、キャッシュ、並列処理、Worker、メモ化は追加しない
- **判断:** 相手ごとのおすすめは付録Bの`recommend.display_count=3`をshared定数から再利用し、`totalScore`、`offensiveScore`、`defensiveScore`、`damageRaceScore`の降順、最後に自分Pokemon ID昇順で決定する。全候補が負でも最も高い3体を返し、入力順やJavaScriptのsort安定性へ依存しない。各順位は対応するMATCHUP-004結果とliteralのreason codeをそのまま保持し、警戒技配列はMATCHUP-007まで空とする
- **判断:** 既存`avoidMyPokemonIds`は独自の点数境界を追加せず、MATCHUP-004が既に`unfavorable`と分類したセルだけをPokemon ID昇順で返す。`favorable`等の分類、タイプ相性、ダメージ、確定数、総合点をMATCHUP-005側で再計算・補正しない
- **理由:** PRODUCT_SPEC §9.4の36セル、§10.3の相手別表示、付録Bの上位3体を、MATCHUP-004を唯一のセル計算根拠として決定的・非破壊に提供し、MATCHUP-006の3体選出や役割・補完の加重評価を先取りしないため
- **影響:** `buildMatchupMatrix`はマトリクスと相手別順位までを返し、最終`buildCounterplan`はMATCHUP-006以降も未完成のままとする。相手の採用率上位技選択、選出3体、先発・控え・エース、警戒技、立ち回りは後続層の責務である

## 2026-07-27 選出提案(MATCHUP-006)

### D-058: 既存1対1結果の辞書式比較・coverage境界・priority基準の先発

- **判断:** MATCHUP-005の`MatchupMatrixResult`と1対1結果の比較関数を再利用し、自分側1〜6体から`pickSize`体の全組み合わせをPokemon ID昇順・辞書順で列挙する。各相手の担当は`totalScore / offensiveScore / defensiveScore / damageRaceScore`の降順、最後に自分Pokemon ID昇順で決め、タイプ相性・ダメージ・MATCHUP-004スコアを再計算しない
- **判断:** 各組は`priorityCoveredCount / coveredCount / worstBestScore / bestScoreSum / secondBestScoreSum`の降順、最後に選出Pokemon ID列の辞書順昇順で比較する。重み付き合計は作らず、`totalScore >= -9`を対応可能、`totalScore <= -10`を未対応とする既存MATCHUP-004分類境界をそのまま用いる。全組が不利でも、この順序で最も悪くない1組を返す
- **判断:** `priorityOpponentPokemonIds`はdefault leadや主軸を呼び出し側が選択した相手IDの部分集合として受け取る。指定時だけ、選出内の各Pokemonをpriority対象への最低totalScore、totalScore合計、offensiveScore合計の降順、最後にPokemon ID昇順で比較して`leadPokemonId`を返し、未指定・空配列ではnullとする。MATCHUP-006内でdefault leadや主軸を推測しない
- **判断:** 現行`TeamPlan`の固定`lead / back / ace`構造は任意の`pickSize`を表現できず、積み技・高火力・役割・素早さ等によるace/backの正式判定式もないため変更・流用しない。専用の`SelectionRecommendation`を追加し、選出ID、priority基準の先発、相手別担当、coverage、辞書式比較用metricsだけを構造化して返す。警戒技と最終`CounterplanResult`完成はMATCHUP-007へ残す
- **判断:** マトリクスは自分・相手各1〜6体、ID重複なし、全組のcellが過不足・重複なく存在し、各cellのID・主要スコア・分類・互換alias・内訳がMATCHUP-004契約に適合することを実行時に検証する。不正値を補完せずRangeErrorとし、入力順・cell順を正規化して入力を変更しない
- **理由:** PRODUCT_SPEC §9.4に具体配点がなかった選出評価を、承認済み仕様どおり既存1対1評価の比較だけで構成し、任意pickSize、priority対象への対応、担当の冗長性を決定的に比較するため
- **影響:** 出力は最良の1組だけで、ace/back、役割シナジー、素早さ、先制技、警戒技、立ち回り文章を含まない。呼び出し側は相手のdefault lead・主軸を解決してpriority IDを渡す必要があり、`buildCounterplan`はMATCHUP-007完了まで明示的な未実装エラーを維持する

## 2026-07-27 警戒技・立ち回り構造化(MATCHUP-007)

### D-059: 警戒タグ優先順・非推測note・既存選出を保持する構造化Counterplan

- **判断:** 警戒技は既存`MoveTag`のうち`setup / hazard / screen / priority / status`を1つ以上持つ相手技だけとし、`pivot`単独は対象外とする。primary tagはこの順で決め、全警戒技をprimary tag順、技採用率降順、所有Pokemon使用率降順、相手Pokemon ID昇順、Move ID昇順で並べる。同じMove IDを別Pokemonが持つ場合は重複排除せず、Pokemonとの関連、対象タグ、採用率を保持する
- **判断:** strategy codeは警戒タグだけから`PREVENT_SETUP / LIMIT_HAZARDS / STALL_SCREEN_TURNS / RESPECT_PRIORITY / MANAGE_STATUS`へ1対1で写像し、同じ順序で重複排除する。`threatNotes`と`playstyleNotes`の自由文章は意味解析せず、空白だけを除外またはnull化して原文を保持する。同一noteでもPokemonとの関連が異なる場合は失わない
- **判断:** 相手ごとのおすすめ上位3体はMATCHUP-005の公開比較関数を再利用し、MATCHUP-004の結果・classification・reason codeを変更せず保持する。avoidは`unfavorable`だけをtotalScore昇順、Pokemon ID昇順で返し、`slightly_unfavorable`へ独自境界を広げない
- **判断:** MATCHUP-006の`SelectionRecommendation`は入力整合性を検証してdeep copyしたうえでそのまま返し、選出・担当・coverage・先発を再計算しない。ace/backの正式判定式はないため推測せず、固定3役の既存`TeamPlan`は後方互換のため変更・流用しない
- **判断:** matchupパッケージからscoringやDBへ依存しないため、既存Archetype情報から`pokemonId / usageRate / threatNotes / moveId / adoptionRate / tags / playstyleNotes`だけを射影する最小readonly入力型を定義する。MATCHUP-008の合成層が既存ArchetypeSnapshotと保存済みplaystyleNotesからこの入力を組み立て、不足値を名前や外部知識から推測しない
- **判断:** MATCHUP-007は構造化データ生成だけを担当し、LLMを呼び出さない。後続LLMは確定済みreason code・スコア・playstyle note・strategy codeを短い文章へ変換するだけで、おすすめ、選出、警戒技の追加・変更を行わない
- **理由:** PRODUCT_SPEC §9.5・§10.3・§12の計算と文章化の責務を分離し、MATCHUP-004〜006の決定結果を唯一の根拠として、後続API・Web・LLMが同じ警戒情報を決定的に利用できるようにするため
- **影響:** playstyleNotesは現行scoringのArchetypeSnapshotに含まれないため、MATCHUP-008ではDB/API層が保存値を同じ入力へ明示的に射影する必要がある。自然文生成、観測による技上書き、ace/back推定は後続または別仕様のままとする

## 2026-07-27 戦闘能力値スナップショット基盤(MATCHUP-008A)

### D-060: Rule共通対戦レベルと明示的な確定実数値

- **判断:** 対戦レベルはPokemonごとに重複保存せず、同じ対戦条件を共有するRuleの必須`battleLevel`として1〜100で保持する。既存開発Ruleは新規forward migrationで明示的に50へ更新してからNOT NULLとCHECKを適用し、新規Ruleはadmin入力から必ず明示値を受け取る。実行時コードに「未設定なら50」の暗黙フォールバックは設けない
- **判断:** Partyのダメージ計算入力は既存`PartyPokemon.actualStats`と`Rule.battleLevel`を正とし、PartyPokemonへlevel列を追加しない。PartyとArchetypeで同じ意味を使えるよう、actualStatsは`hp / attack / defense / specialAttack / specialDefense / speed`の正の安全な整数を持つstrict共通shared契約へ統一し、既存Party JSONの略称キーは同migrationで値を変えずに意味名へ変換する
- **判断:** Archetypeのダメージ計算入力は新設する`ArchetypePokemon.actualStats`と`Rule.battleLevel`を正とし、ArchetypePokemonへlevel列を追加しない。種族値のコピー、IV31、EV0、neutral nature、level50などをAPI・migration・実行時に推定しない
- **判断:** 根拠のない既存Archetype能力値を補完しないため、`archetype_pokemons.actual_stats`はJSONB nullableとし、DBはnullまたはobjectだけをCHECKする。一方、adminのPOST・PUT全置換・previewはshared/API契約で6能力すべてを必須にし、詳細な型・範囲・余分なキーはZodで拒否する。admin GETは既存nullデータも不正な補完なしで返せるようnullableレスポンスとする
- **判断:** 公開`GET /api/v1/master/rules`と管理`GET /api/v1/admin/rules`は`id / name / teamSize / pickSize / battleLevel`だけを返し、admin Rule作成もbattleLevelを保存する。D-047の公開4列契約とD-049のUI専用level入力は本判断で置き換え、Party画面は選択RuleのbattleLevelを読取表示して既存純粋関数へ渡す。自由level入力、根拠のない50固定、levelのParty API送信は行わず、Rule未取得時は計算・保存しない
- **理由:** MATCHUP-003〜005のダメージ計算は双方の正確なレベルと確定実数値を要求するが、従来はレベルがWebの一時入力だけでArchetypeには確定実数値がなかったため。共通Rule条件と明示入力を永続化し、MATCHUP-008が推測なしで純粋関数用Snapshotを構築できるようにする
- **影響:** 既存ArchetypeのactualStatsはnullのままであり、後続MATCHUP-008では内部不整合として拒否する必要がある。既存Ruleはmigration時だけ50になるが、以後の作成・読取・計算に暗黙値は存在しない。counterplan API、CombatantSnapshot変換、Observation合成はMATCHUP-008へ残す

## 2026-07-27 counterplan API(MATCHUP-008)

### D-061: 所有Session起点の読み取り専用合成と観測技優先

- **判断:** PRODUCT_SPEC §10.2の正式URLである`GET /api/v1/sessions/:id/counterplan`だけを追加する。`JwtAuthGuard`と`@CurrentUser()`を使い、Sessionを`id + userId`で取得してから同じnested selectでRule・Party・選択Archetype・未取消Move観測を読み込む。counterplan・Session・Observation・selectedArchetypeを保存せず、RedisやBATTLE候補キャッシュも使用しない
- **判断:** `active`と`ended`は取得可能、`archived`は`INVALID_SESSION_STATE`とする。selectedArchetype未設定、選択構築のRule不一致・archivedは`INVALID_ARCHETYPE_SELECTION`、PartyのRule不一致やpickSize超過は`INVALID_PARTY_STATE`とする。他人のSessionと不存在Sessionは同じ404を返す。actualStats・Decimal・JSON・defaultLeads等の不正な永続値や純粋関数の入力不整合は内容を公開しない500へ変換する
- **判断:** PartyとArchetypeのCombatantはD-060どおり、それぞれの`actualStats`と共通Ruleの`battleLevel`から構築する。種族値・EV・IV・性格による再計算やlevelのフォールバックは行わない。テンプレ技は全件のMove ID重複とadoptionRateを検証した後、`adoptionRate DESC → moveId ASC`で最大4件を選ぶ
- **判断:** 現行Observationは同じ行の`pokemonId`と`moveId`によって観測技の使用者を一意に関連付けられるため、未取消のMove観測をcounterplanへ合成する。観測技は`seq`順で先に採用し、同じPokemon内でmoveId重複を除去し、残りをテンプレ順位で補完して最大4技とする。観測技のadoptionRateは実測を表す1とし、テンプレ外でも外部キーで解決されたMoveマスタを使用する。1体へ5種類以上の観測技、または選択構築に存在しないPokemonへ結び付く技観測は、推測や無視をせず`INVALID_SESSION_STATE`とする
- **判断:** `priorityOpponentPokemonIds`は`defaultLeads`の配列順を保ってslotからPokemon IDへ解決し、空・nullは空配列、不明slotや重複IDは内部不整合とする。`Rule.pickSize`をそのまま使用し、API層は`buildMatchupMatrix → buildSelectionRecommendation → buildCounterplan`の順で既存純粋関数を呼ぶ。playstyleNotesは保存値を意味解析せずMATCHUP-007へ渡す
- **判断:** レスポンスはMATCHUP-007の構造化結果へ`sessionId / selectedArchetypeId`を付けたID中心のstrict契約とし、Pokemon名・Move名は既存master APIへ委ねる。MATCHUPのclassification・reason code・strategy code・確定数分類はsharedのliteralを単一の正として両層で再利用し、Prisma Decimal・Date・BigInt・userId・内部timestamps・非有限数を返さない
- **理由:** 正確な保存Snapshotと観測実測を優先しつつ、相性・選出・警戒情報の唯一の計算根拠をMATCHUP-005〜007へ限定し、所有権・決定性・読み取り専用性をAPI境界で保証するため
- **影響:** Web表示・名称解決・自然文生成・キャッシュは後続タスクのままとする。Archetype actualStatsがnullの既存データはcounterplanを生成できず、管理入力で明示値を整備する必要がある

## 2026-07-28 対策タブ(WEB-007)

### D-062: 構造化counterplanの表示責務と既存masterによる名称解決

- **判断:** 候補カードの選択操作は既存`POST /api/v1/sessions/:id/select`を1回呼び、成功後にTanStack Queryで`GET /api/v1/sessions/:id/counterplan`を取得する。対策は既存対戦画面の入力・候補と同じページに積み上げ、3区分のナビゲーションで各sectionへ移動する。保存済み選択を持つ`active`または`ended` Sessionは「対策」から直接取得できる
- **判断:** Webはcounterplanの`selection / perOpponent / cautionMoves / playstyleNotes / strategyCodes / threatNotes`とmatchup内訳を表示用ラベルへ射影するだけとし、スコア、順位、priority、選出、警戒技、strategy codeを再計算・推測しない。D-059どおりace/backの正式判定はないため、`leadPokemonId`だけを先発候補として表示し、残りへ独自の役割を割り当てない
- **判断:** Pokemon IDは既存`GET /api/v1/master/pokemons/:id`、Move IDは関連Pokemonごとの既存`GET /api/v1/master/moves?pokemon_id=`とTanStack Queryの共有cacheを使って日本語名へ結合する。名称取得が失敗または既存技検索の返却上限外ならcounterplan本体を失わずIDへフォールバックし、その旨を明示する。名称専用APIやcounterplanレスポンスへの重複表示データはWEB-007では追加しない
- **判断:** counterplan未取得、取得中、再取得中、RFC 9457エラー、名称の部分取得失敗を別状態として表示する。`INVALID_ARCHETYPE_SELECTION`、`INVALID_SESSION_STATE`、`INVALID_PARTY_STATE`、`NOT_FOUND`、`UNAUTHORIZED`を安全な固定文へ写像し、archivedや未選択を空表示に変換せず、APIのdetail・内部情報は表示しない
- **理由:** MATCHUP-008のstrictなID中心レスポンスを計算根拠の正として保ち、既存の認証・API client・Query管理・master APIを再利用しながら、候補選択からモバイルで読める対策表示までを一連にするため
- **影響:** LLM文の差し替えはWEB-009、構築の全情報と出典はWEB-008へ残る。現行Move master検索は1回最大10件でMove ID単体取得契約がないため、範囲外の技名はID表示となる。完全な名称解決を必須化する場合は、別タスクで公開master契約を定義する必要がある

## 2026-07-28 構築詳細画面(WEB-008)

### D-063: 公開構築詳細の取得境界とSession文脈を保つ画面URL

- **判断:** PRODUCT_SPECに単体詳細の正式URLがないため、認証済み一般ユーザー向けの読み取り専用APIとして`GET /api/v1/archetypes/:id`を1本だけ追加する。`JwtAuthGuard`を適用し、`status = published`だけをnested select 1回で取得する。不存在・archived・DB上に想定外の非公開statusがある場合は同じ`404 NOT_FOUND`とし、status、人気度集計、管理用timestamps、siteRankは返さない
- **判断:** 公開レスポンスは構築・Rule・Season、slot順のPokemonと表示用master情報、持ち物・特性・技、保存済み設定値、defaultLeads、playstyleNotes、出典だけをstrictに返す。技は保存上のslotがないため`adoptionRate DESC → moveId ASC`、出典は保存順の列がないため`title ASC → url ASC`で決定的に並べ、出典URLはhttp/httpsだけを許可する
- **判断:** 詳細画面はSessionを失わず候補一覧へ戻れるよう`/battle/:sessionId/archetypes/:archetypeId`とし、候補カードに既存選択buttonとは独立した`構築詳細を見る`linkを置く。画面はAPIの表示値をそのまま構造化し、候補推定・counterplan計算・不足値の推定を行わない
- **理由:** 候補選択と対策表示を壊さず、管理APIや追加master照会へ依存せずに、公開が確定した構築の根拠と全体像を安全かつ決定的に確認できるようにするため
- **影響:** お気に入り、編集、閲覧数、LLM理由文は追加しない。詳細URLはBattle Session文脈を要求するため、Session外の独立した構築カタログ画面が必要になった場合は別タスクで導線を定義する

## 2026-07-28 LLMアダプター・テンプレ文フォールバック(LLM-001)

### D-064: 確定済みCounterplanだけを文章化する差し替え可能な生成境界

- **判断:** NestJSの実行時DIには`Symbol`の`EXPLANATION_GENERATOR` tokenを使い、Promiseを返す`ExplanationGenerator.generateCounterplanExplanation(CounterplanResult)`契約を定義する。LLM-001ではtokenを`TemplateExplanationGenerator`へ`useExisting`で結び、`ANTHROPIC_API_KEY`の未設定・空・空白に関係なく同じ実装を使用する
- **判断:** 説明出力は`summary / selectionExplanation / perOpponent[{ opponentPokemonId, explanation }] / strategyExplanation`の用途別strict構造とし、既存`GET /api/v1/sessions/:id/counterplan`レスポンスの`explanation`へ追加する。MATCHUP-005〜007完了後に生成器を1回だけ呼び、perOpponent、selection、score、code、警戒情報を上書きしない
- **判断:** テンプレはclassification、全reason code、全strategy codeを網羅する明示的な対応表から短い日本語を生成する。rank 1、選出・先発・担当・coverage、caution move、保存済みthreat/playstyle noteだけを使用し、同じ入力から同じ文章を返す。現行Counterplanには表示名がないためDBやmaster APIを追加参照せず、PokemonとMoveはそれぞれ`ポケモンID n`、`技ID n`と表す
- **判断:** reason codeはMATCHUPが確定した順序を維持して重複だけを除き、strategy codeはsharedの正式順序で重複排除する。未知のclassification・reason code・strategy code、rank 1欠落は補完や黙示的無視をせず内部不整合として検知し、Session API境界で詳細を含まない`500 INTERNAL_ERROR`へ変換する
- **理由:** PRODUCT_SPEC §12の「LLMは判定せず、障害時も対戦支援を止めない」を、外部依存なしの即時テンプレと将来差し替え可能な境界で実現し、計算結果・ユーザー情報・DBへ文章生成責務を混入させないため
- **影響:** sharedのcounterplanレスポンスには必須`explanation`が加わるが、WEB-007は既存構造化フィールドだけを引き続き表示し、説明文の表示はWEB-009まで行わない。Anthropic API・prompt・失敗時のTemplateへの切替実装はLLM-002、Redisキャッシュ・非同期化はLLM-003へ残す

## 2026-07-28 Anthropic API実装(LLM-002)

### D-065: 明示設定時だけ利用するAnthropic生成と全面的なTemplateフォールバック

- **判断:** `ANTHROPIC_API_KEY`と`ANTHROPIC_MODEL`がともに空白でない場合だけAnthropic Providerを有効にする。モデルはコードへ固定せず環境変数で明示し、キー未設定・空・空白、モデル不足、timeout不正ではAnthropic clientを呼ばずTemplateへ切り替える。`ANTHROPIC_TIMEOUT_MS`は未指定時5,000ms、明示値は1〜15,000の正の安全な整数だけを受理し、不正値を黙って補正しない
- **判断:** API専用依存として公式TypeScript SDKのnative Messages APIを使い、non-streaming・toolなし・`temperature=0`・`max_tokens=2048`とする。counterplan APIの待ち時間を限定するため、SDKとリクエスト双方へtimeoutを設定し、SDKの既定リトライは使用せず`maxRetries=0`として1回のAPI試行後にTemplateへ切り替える
- **判断:** ClaudeへはCounterplanResultから明示的に射影した相手別評価、選出、strategy code、caution move、保存済みthreat/playstyle noteだけをJSONで渡す。Session所有者、認証情報、DB内部値、Observation自由入力は渡さず、計算・おすすめ・選出・先発の変更、外部知識や未登録情報の追加をsystem promptで禁止する
- **判断:** 出力はLLM-001の`CounterplanExplanation`と同じ構造を公式SDKのstructured outputへ指定し、受信後もstrict Zodで再検証する。summaryは400文字、selection/perOpponent/strategyは各1,200文字を上限とし、空白、HTML、余分・不足キー、相手IDの重複・不足・未知・順序不一致、異常stop reason、text以外のblock、不正JSONを部分採用しない
- **判断:** timeout、接続、401/403、429、5xx、SDK例外、空content、非text、不正JSON、schema不一致を含むAnthropic側の全失敗はTemplateへフォールバックし、MATCHUP・Session取得の既存エラーは隠さない。Provider名、モデル、fallback有無、失敗理由はAPIレスポンスへ追加しない
- **判断:** ログは生成成功時の処理時間と、フォールバック時の`configuration / timeout / authentication / rate_limit / server / network / invalid_output / unknown`分類だけに限定する。APIキー、モデル、prompt、モデル出力、note全文、user/session識別情報、stack traceは出さない
- **理由:** PRODUCT_SPEC §12の「LLMは文章化だけ」「障害時も主要機能を継続」を維持しながら、外部APIの遅延・不正出力・設定不備を既存counterplanの可用性や構造化計算結果へ波及させないため
- **影響:** Anthropic未設定・障害時のAPIレスポンスはLLM-001と同じTemplate文であり、クライアントはProviderを意識しない。キャッシュ・非同期化はLLM-003、説明文のWeb表示はWEB-009へ残す

## 2026-07-28 LLMキャッシュ・非同期化(LLM-003)

### D-066: BullMQ同一プロセスWorker・24時間キャッシュ・状態取得API

- **判断:** 非同期Queueは公式BullMQをAPIパッケージだけへ追加し、Queue名を`llm-explanations`とする。既存node-redis Adapterはキャッシュ値のget/set/deleteに維持し、BullMQは同じ`REDIS_URL`から専用producer/worker接続を生成する。MVPではAPIプロセス内でWorkerを起動し、NestJS lifecycleでWorker→Queueの順にgraceful shutdownする。Redis未設定・接続失敗・Queue初期化失敗ではAPI起動を止めない
- **判断:** キャッシュキーは`pca:llm-explanation:v1:<sha256>`、failure markerは`pca:llm-explanation-failure:v1:<sha256>`、jobIdは`llm-explanation-<sha256>`とする。SHA-256入力はAnthropicへ射影するCounterplan全構造、model、`CACHE_NAMESPACE_VERSION / PROMPT_VERSION / OUTPUT_SCHEMA_VERSION / GENERATOR_VERSION`をkey順canonical JSONへ変換した値とし、user/session識別情報、APIキー、生prompt、DB内部値を含めない
- **判断:** キャッシュ値は`schemaVersion / generatorVersion / CounterplanExplanation`だけのstrict JSONとし、読込後も文章長・HTML・相手IDを含め再検証する。TTLは未設定時86,400秒、`LLM_EXPLANATION_CACHE_TTL_SECONDS`で60〜604,800秒の正の整数だけを受理し、不正設定では非同期機能全体を無効にしてTemplateを維持する。破損値はmissとしてbest-effort削除し、Redis障害をcounterplan失敗へ変換しない
- **判断:** cache miss時のcounterplan APIはTemplateを即時返し、failure markerがなくQueue利用可能な場合だけ`attempts=1 / removeOnComplete=true / removeOnFail=true`で登録する。WorkerはFallbackではなくAnthropic実装を1回だけ呼び、strict検証とRedis保存が両方成功した場合だけreadyにする。失敗時は詳細を含まない5分TTLのmarkerを保存し、cooldown中は再登録せず、失効後の次回リクエストで再登録可能にする
- **判断:** 生成済み説明は認証・所有権・Session状態を既存counterplanと共有する`GET /api/v1/sessions/:id/counterplan/explanation`で取得する。レスポンスはHTTP 200のstrictな`ready / pending / failed / unavailable` discriminated unionとし、readyだけ説明を返す。cacheKey、model、Provider、失敗理由、Redis情報は公開しない。cache missかつ利用可能なら同APIも重複なしでenqueueするがAnthropicを同期実行しない
- **判断:** ログは`cache_hit / cache_miss / cache_invalid / enqueue_success / enqueue_deduplicated / generation_success / generation_timeout / generation_rate_limit / generation_invalid_output / generation_failed / redis_unavailable / queue_unavailable`だけとし、APIキー、Redis URL/password、prompt、生成文、notes、JWT、user/session識別情報、job payloadを出さない
- **理由:** PRODUCT_SPEC §12.2の「Templateを即時表示し、LLM文を生成でき次第差し替える」を、Redis・Anthropicを単一障害点にせず、同じ構造化入力の重複課金を避ける決定的な非同期境界として実現するため
- **影響:** 既存counterplanの構造化計算・認証・状態規則は変わらず、cache hit時だけ`explanation`がAnthropic文になる。Webでのpollingと説明表示はWEB-009、独立Worker deployment、WebSocket/SSE、手動再生成は対象外のまま

## 2026-07-28 LLM生成文の表示(WEB-009)

### D-067: pending中だけの2秒ポーリングとTemplate表示の維持

- **判断:** 対策タブはcounterplanレスポンスのTemplate説明を即時表示し、生成済み説明APIをTanStack Queryで2秒間隔に取得する。ポーリングは`pending`中だけ継続し、`ready / failed / unavailable`、復旧不能な400/401/404、最大1回の再試行後の通信・サーバーエラー、unmount、Sessionまたはcounterplan更新で停止する
- **判断:** `ready`では説明文だけをAI生成文へ差し替え、構造化counterplanは変更しない。`failed / unavailable`と状態API障害ではTemplate説明を維持し、Provider名、モデル、内部failure reason、Redis・Queue情報を表示しない
- **判断:** summary、選出理由、立ち回り、相手別説明はHTML・Markdownとして解釈せずプレーンテキストで表示する。生成状態と差し替えは`role="status"`と`aria-live="polite"`で通知し、相手別説明は既存counterplanの相手IDと完全に対応する場合だけ採用する
- **理由:** PRODUCT_SPEC §12.2の即時フォールバックと非同期差し替えを、対策情報の可用性・計算結果の不変性・利用者への安全な状態通知を維持して実現するため
- **影響:** API・shared契約・LLM・Redis・BullMQ・MATCHUPは変更せず、Webはready後や終端状態で不要な追加通信を行わない。WebSocket/SSE、手動再生成、Provider表示は対象外のまま

## 2026-07-29 マスタ管理API(MASTER-008)

### D-068: admin master CRUD・PokemonMove全置換・マスタ投入順

- **判断:** PRODUCT_SPECに管理用masterの正式URLがないため、既存admin prefixと公開masterの複数形に揃え、Pokemon / Move / Item / Abilityを`/api/v1/admin/master/{pokemons|moves|items|abilities}`のGET一覧・GET詳細・POST・PUT・DELETEで管理する。全ルートは既存`JwtAuthGuard`と`RolesGuard`のadmin認可を使用し、公開master APIの認証・レスポンスは変更しない
- **判断:** 現行PokemonMoveは`pokemonId / moveId`だけの複合主キーで追加属性を持たないため、Pokemon書き込みへ重複してnested化せず、`GET /api/v1/admin/master/pokemons/:id/moves`と`PUT /api/v1/admin/master/pokemons/:id/moves`へ統一する。PUTは全Move参照と重複を先に検証してから1トランザクションで全置換し、Party / Archetype / Observationで使用中の組み合わせは409として除去しない
- **判断:** Pokemon入力は18タイプ、種族値1〜255、重複しないAbility名、メガ元参照・自己参照・循環を検証する。Pokemon.abilitiesは日本語名JSON配列を正とする既存契約を維持し、Ability日本語名の変更時は参照Pokemonの配列も同じトランザクションで更新する。使用中AbilityのPokemonからの除去とAbility削除、既存FKがRESTRICTするマスタ削除は`409 MASTER_CONFLICT`に統一する
- **判断:** 管理APIは既存列だけをstrict shared契約へ射影し、Moveに現行モデルが持たないpp / target等を追加しない。一覧はPokemonを`dexNo → form → id`、その他を`nameJa → id`、PokemonMoveを`moveId`昇順にして決定的に返す。bulk import、検索・ページネーション、soft/force delete、schema変更は追加しない
- **判断:** 事前監査時の実DBはPokemon 4件、Move 8件、Item 3件、Ability 8件、PokemonMove 10件、Rule 1件、Season 1件、Archetype 0件で、teamSize=6のpublished Archetypeを成立させられない。MASTER-005は投入パイプライン完成をもって完了のまま維持するが、計画上の「20体規模」と実サンプル4件の差はMASTER-009で解消する。実行順は`MASTER-008 → MASTER-009 → ARCHETYPE-004`とする
- **理由:** MASTER-009の本格データとChampions固有補完を、既存FK・JSON参照・公開APIを壊さず管理できる最小の書き込み境界を先に確立し、マスタ不足のまま構築データを推測登録しないため
- **影響:** MASTER-009とARCHETYPE-004は未完了のままで、次タスクはMASTER-009となる。Pokemon / Move削除に伴うPokemonMoveのCASCADEはD-019の既存方針を維持するが、Party / Archetype / ObservationのRESTRICT参照と論理的なPokemonMove・Ability対応は管理Serviceで事前検証する

## 2026-07-29 PokéAPI Champions v1.0公開マスタ投入(MASTER-009A)

### D-069: PR #1532固定スナップショット・ローカルseed・MASTER-009Bへの差分分離

- **判断:** Champions v1.0の習得関係はPokéAPI PR #1532のmerge commit `286d7a071bc50ec4a57e3f3f506a13220ce6f903`を正とし、同PRから生成された`PokeAPI/api-data` commit `155ea230292d72beff9325cca47ea281d511033a`で代表レスポンスを照合する。PR #1532時点で不足していたMega Meowstic♀の種族値・タイプ・特性だけは公式follow-up PR #1584のcommit `2829e8496ca3bb078b0b80ce1a1bdeda0792efa7`を使用する。このfollow-upはChampions習得関係を変更していない
- **判断:** version group `32` (`champions`)かつmove method `12` (`train`)の関係だけを抽出し、Pokemon 281件(186 species、元form行377件、Mega 60件)、参照Move 490件、参照Ability 191件、PokemonMove 17,394件をv1.0スナップショットとする。PRで無効化済みとして除外された261関係は復元せず、全世代learnsetとのunionを作らない
- **判断:** 固定CSVのファイル別SHA-256、取得日、commit、PR、version group、move methodをsource manifestへ保持し、変換済みの分割JSONだけを通常seedの入力にする。通常seedは外部通信せず、対象PokemonのPokemonMoveだけをスナップショットへ全置換し、対象外Pokemonの関係には触れない。Ability・Move・Pokemon・PokemonMoveの順序と参照を検証し、単一transactionでupsertする
- **判断:** 日本語名と英語名はPokéAPIの言語ID `1` / `9`を使用し、機械翻訳しない。Move tagは数値priorityが正の場合の`priority`だけを機械的に付け、それ以外のsetup / hazard / screen / status / pivotやAbility tagは説明文・名称から推測しない。PokeAPIのpowerまたはaccuracyが0の固定値なし表現は、現行DB契約の`null`へ射影する
- **判断:** PokéAPIのBSD-3-Clause copyright notice・条件・免責を`packages/database/THIRD_PARTY_NOTICES.md`へ保持し、PokéAPIや貢献者による推奨・承認を表示しない。Pokémon名称等は権利者の商標であり、本サービスは非公式で、PokéAPI利用だけで元ゲームデータの権利問題が解消されるとは扱わない
- **判断:** Morpeko Hangry Modeの5関係差、Vivillon / Florges / Furfrou / Polteageist / Alcremie / SinistchaのPokéAPI上のform統合、Mega Meowstic男女分離を上流表現のまま保持する。v1.1以降の更新、version group単位で合法範囲を確定できないItem、その他Champions固有要素は推測せずMASTER-009Bへ残す。MASTER-009は009A/009Bに分割し、009B完了まで全体を完了扱いにしない
- **理由:** 公式PokeAPI masterへChampions v1.0 learnsetが追加済みであり、固定commitとレビュー可能なローカル変換データによって、前回監査の習得技不足を推測なしで解消できるため
- **影響:** MASTER-009Aはv1.0基盤だけを完成させ、既存開発Rule / Seasonと3件のItemは変更しない。更新時は固定sourceを新commitへ明示的に更新し、manifest hash・件数・既知例外・3回連続seed・公開APIとParty/Battle統合を再検収する。次タスクはMASTER-009B、ARCHETYPE-004はその後とする

## 2026-07-29 Champions現行版差分・ItemカタログMVP(MASTER-009B)

### D-070: Regulation Set M-B固定差分と出典付きItemカタログ

- **判断:** 現行クライアントをPokémon Champions Ver. 1.1.4、追加マスタ内容をVer. 1.1.0 / Regulation Set M-Bとして扱う。Nintendo公式更新履歴、Pokémon HOME公式Regulation Set M-B・対象Pokemon一覧で版境界を確認し、PokéAPI PR #1559 / #1560 / #1611を含むcommit `227b573712414a86ba299d322fa398fbb2893edc`と、最初の生成済みapi-data commit `bf40800cc9d1ffd04a3fc14347d2ad24d470526b`へ入力を固定する
- **判断:** MASTER-009Aとの差分はPokemon・フォーム38件(通常22 / Mega 16)、Move 6件、PokemonMove 2,416件、削除0件とする。追加フォームが参照するAbilityは上流上29種類だが、既存v1.0の自然キーと照合した未登録差分は9件であり、最終件数をPokemon 319、Move 496、Ability 200、PokemonMove 19,810とする。Eelevate / Fire Maneの上流未収録日本語名だけは公式ポケモンずかんを出典として補完する
- **判断:** Item masterはChampionsで合法な全Itemの完全一覧ではなく、出典付きで確認できたItemのカタログとする。MASTER-009Bでは既存3件を変更せず、PokéAPI全Itemや過去作品から合法性を推測しない。完全な公式一覧が将来公開された場合に版と出典を固定して追加更新し、一般公開サイトでも全Item網羅を表示しない
- **判断:** ARCHETYPE-004では全30構築に出典URLを必須とし、Pokemon・Move・Abilityを既存masterから選ぶ。Itemは出典で明示されたものだけを追加し、持ち物が不明な構築は採用しない。実際に持ち物なしと確認できる場合だけnullを許容し、actualStats、Rule / Season、技、本文・画像を推測・転載しない
- **判断:** 通常seedは固定CSVから生成した差分JSONとv1.0 JSONだけを読み、外部通信しない。Ability・Item・Move・Pokemon・PokemonMoveを単一transactionで自然キーupsertし、319対象Pokemonの習得関係だけを現行スナップショットへ同期する。元データ・ファイルSHA-256・取得日・版・PR・BSD-3-Clause notice・既知制限をmanifestと同梱文書へ保持する
- **判断:** Move tagは構造化された正のpriorityから得られる`priority`だけを付け、setup / hazard / screen / status / pivot、Item / Ability tagを名称や説明文から推測しない。Pyroarの上流form統合、Megaの別Pokemon表現、既存v1.0関係の非破壊を品質検収へ固定する
- **理由:** 公開確認できる現行Pokemon・Move・Ability・Champions Train習得関係は正確に更新できる一方、完全な公式Item合法性集合は公開情報から再現できない。網羅性を虚偽表示せず、出典単位のItem追加へ責務を分けることで、正確性を維持したままARCHETYPE-004へ進むため
- **影響:** MASTER-009A / 009Bの完了でMASTER-009のMVPを完了可能とする。Item全合法集合、構築ごとの持ち物・actualStats、Regulation Set M-Bに対応する正式Rule / Seasonは既知制限としてARCHETYPE-004以降の出典確認へ残す

## 2026-07-29 基本選出の任意化(ARCHETYPE-004A)

### D-071: defaultLeadsは空配列またはRule.pickSize件

- **判断:** `Archetype.defaultLeads`は空配列、または参照Ruleの`pickSize`と同じ件数の重複しない既存slotだけを許可する。空配列は「出典から一意な基本選出を確認できないため未登録」を表し、null、使用率、Pokemonの並び、スコア、playstyleNotesから基本選出を補完しない
- **判断:** sharedはJSON配列のstrictな要素・範囲・重複を検証し、Ruleを取得できるadmin Serviceが空またはpickSize件の件数整合を検証する。POST、PUT、previewは空配列をそのまま保存・返却する。既存Archetypeの値と既存migrationは変更せず、新規migrationで`archetypes_default_leads_array`の許容件数を0〜6件へ広げる
- **判断:** defaultLeadsが空の場合、counterplanは`priorityOpponentPokemonIds=[]`で既存MATCHUP-006を呼び、通常どおり選出を算出する一方、`leadPokemonId=null`を維持して仮の先発を生成しない。候補・公開詳細・counterplanは利用可能で、詳細画面は既存の「基本選出の登録なし」を表示する
- **理由:** Regulation Set M-Bの公開構築では6体・技・能力値等が確認できても一意な基本選出が公開されない例が多く、基本選出を必須にすると推測登録か有効な構築データの除外を招くため
- **影響:** 基本選出位置の一致加点とpriority基準の先発提案は登録済み構築だけで利用する。ARCHETYPE-004の構築登録、基本選出の自動推定、既存migrationの変更は本タスクに含めない

## 2026-07-29 構築の実数値・IV要件の見直し(ARCHETYPE-004B)

### D-072: 実数値状態とタイプ相性限定counterplan

- **判断:** ArchetypePokemonへ能力ごとに未確認を表せる`ivs`と、`exact / derived / partial`の`statDataStatus`を追加する。`exact`は出典で実数値を直接確認済み、`derived`は出典で明示された全6能力のIV・EV・性格とRule.battleLevelから純粋関数で算出してAPIが一致検証済み、`partial`は構築情報を利用できるが実数値未確認を表す
- **判断:** `partial`では`actualStats=null`とし、IV全体または能力ごとのnullを31等へ暗黙補完しない。`derived`は全IV・EV・性格・actualStatsを必須とし、未知の性格や再計算不一致を登録前に拒否する。既存クライアントの実数値付き入力はstatus省略時`exact`、既存DBの実数値付き行は`exact`、null行は新規migrationで`partial`として後方互換を維持する
- **判断:** 候補検索・一致度・重複previewは従来どおりPokemon・技・Item・Ability等の構造情報を正とし、partialを除外しない。counterplanは両者の実数値がある場合だけ`calculationMode=full`で既存計算を行い、どちらかが不足する場合は`calculationMode=type_only`としてタイプ相性だけを評価する。type_onlyではダメージ・確定数をnull、ダメージレース・素早さ内訳を0とし、対応する勝敗reasonCodeや説明文を生成しない
- **判断:** 公開詳細APIはIV・実数値状態をstrictに返し、Webは直接確認値・明示材料からの算出値・未確認を区別する。未確認時はダメージ計算へ使わない旨を表示し、counterplanも「タイプ相性のみ」と未算出項目を明示する。出典URLは既存ArchetypeSource契約を維持し、推定値や出典にない仮定を保存しない
- **理由:** Regulation Set M-Bの再監査38件は実数値または全IVを公開していない一方、30件は6体・技・Item・Ability・性格・EVまで確認可能であり、構築候補として有用な構造情報と厳密なダメージ計算の可否を同一条件にすると、推測か全件除外を招くため
- **影響:** 再監査では30件を`partial`として構造上登録可能、`exact` 0件、`derived` 0件、残る8件は6体ちょうどでないため登録不能と判定した。ARCHETYPE-004はpartial 30件を対象に再開できるが、各出典・Item・Rule/Season・previewを登録時に再確認する。将来、全計算材料が公開された行だけderivedへ更新できる

## 2026-07-31 Champions能力ポイントの正規化(ARCHETYPE-004C)

### D-073: 能力ポイントと従来EVの分離

- **判断:** ArchetypePokemonへnullable JSONBの`statPoints`を追加し、`hp / attack / defense / specialAttack / specialDefense / speed`の6能力を各0〜32・合計66以下でstrictに保存する。合計は66固定にせず、未配分を含む0〜66を許可する
- **判断:** Pokémon Championsの能力ポイントは従来EVの`evs`と別の値であり、相互変換、32から252への比例変換、66から510への比例変換を行わない。能力ポイントしか確認できない公開構築は`statPoints=出典値`、`evs=null`、`actualStats=null`、`statDataStatus=partial`として扱い、未確認IVを補完しない
- **判断:** `statPoints`は現時点の実数値・ダメージ・確定数・素早さ計算に利用しない。partial構築は能力ポイントがあっても`type_only`のままとし、MATCHUP計算式とexact / derivedの既存条件を変更しない
- **判断:** admin POST / PUT / preview / GETと公開詳細は同じshared契約を使用し、Web構築詳細は努力値と別の「能力ポイント」欄へプレーンテキスト表示する。能力ポイントを努力値欄へ代入しない
- **判断:** `role`の既存literal unionは変更せず、ARCHETYPE-004では記事本文等の出典で役割を裏付けられる候補だけを登録する。裏付け不能な候補へroleを自動推測しない
- **理由:** Pokémon Championsの公開構築が示す各最大32・合計66の能力ポイントは、従来シリーズの各最大252・合計510のEVと意味・尺度が異なり、同じ`evs`へ保存するとデータの意味と対戦計算の前提を損なうため
- **影響:** 既存行は`statPoints=null`のまま移行する。ARCHETYPE-004の正式登録は本タスクに含めず、実装検証後に現行PokeSol候補を決定的順序で再監査し、出典から既存roleまで裏付けられる全候補を次タスクへ引き渡す
- **運用結果:** 2026-07-31にPokeSolのRegulation M-B / Season M-4検索結果を記事ID昇順で再監査した。対象48件・HTTP 200は48件・6体構築は38件・Pokemon、Move、Item、Ability、Nature、能力ポイントが揃う構築は37件だった。記事本文から6体すべての既存roleを裏付けられ、Seasonの矛盾がなく、同一6体・主要情報の重複もない最終候補は25件、重複除外は0件だった。30件未満のためARCHETYPE-004の正式登録は再開せず、候補補充または追加の出典根拠が必要
