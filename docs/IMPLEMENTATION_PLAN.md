# IMPLEMENTATION_PLAN.md — 実装タスク一覧

設計書 [PRODUCT_SPEC.md](./PRODUCT_SPEC.md) の機能を、1回のコーディングセッションで完了できる粒度に分割したもの。

運用ルール:

- **1回の作業では原則1つのタスクIDだけを実装する**(AGENTS.md 参照)
- 着手前に「前提タスク」の完了を確認する
- タスク完了時は本ファイルのステータスを更新する(`未着手` → `完了`)
- タスクの分割・追加・変更は本ファイルを更新し、理由を DECISIONS.md に記録する

ステータス凡例: ✅ 完了 / ⬜ 未着手

---

## フェーズ0: プロジェクト基盤(SETUP)

### ✅ SETUP-001 モノレポ初期化

- **目的:** pnpm workspace + Turborepo で全パッケージを一元管理する
- **作業範囲:** ルート package.json / pnpm-workspace.yaml / turbo.json / ESLint / Prettier / tsconfig.base / .gitignore
- **変更予定パッケージ:** ルート
- **完了条件:** `pnpm install` と `pnpm check` が成功する
- **必要なテスト:** なし(設定のみ)
- **前提タスク:** なし
- **対象外:** CI、各アプリの実装

### ✅ SETUP-002 フロントエンド初期化

- **目的:** React + Vite + Tailwind + TanStack Query + Zustand の動作する土台を作る
- **作業範囲:** apps/web の scaffold、トップ画面、ヘルスチェック表示、Vite プロキシ
- **変更予定パッケージ:** apps/web
- **完了条件:** `pnpm dev` でトップ画面が表示され、API 疎通状態が表示される
- **必要なテスト:** Zustand ストアの単体テスト
- **前提タスク:** SETUP-001, SETUP-006
- **対象外:** 対戦画面・認証 UI・ルーティング

### ✅ SETUP-003 NestJS API 初期化

- **目的:** NestJS + zod の API 土台と `GET /api/v1/health` を作る
- **作業範囲:** apps/api の scaffold、health モジュール、ZodValidationPipe、CORS、グローバルプレフィックス
- **変更予定パッケージ:** apps/api
- **完了条件:** `GET /api/v1/health` が `{"status":"ok"}` を返す
- **必要なテスト:** health の API テスト(NestJS Testing + supertest)
- **前提タスク:** SETUP-001, SETUP-006
- **対象外:** 認証・DB アクセス・業務エンドポイント

### ✅ SETUP-004 PostgreSQL と Redis の Docker 環境

- **目的:** ローカル開発用インフラをコマンド1つで起動できるようにする
- **作業範囲:** infrastructure/docker/docker-compose.yml(healthcheck 付き)、ルート .env.example
- **変更予定パッケージ:** infrastructure
- **完了条件:** `pnpm infra:up` で両コンテナが healthy になる
- **必要なテスト:** なし(healthcheck が実質の検証)
- **前提タスク:** SETUP-001
- **対象外:** 本番インフラ、Redis を使う実装

### ✅ SETUP-005 Prisma 接続

- **目的:** Prisma から PostgreSQL へ接続できる最低限の状態を作る
- **作業範囲:** packages/database(schema.prisma 最小モデル、初回マイグレーション、接続確認スクリプト)
- **変更予定パッケージ:** packages/database
- **完了条件:** `pnpm db:migrate` と `pnpm db:check` が成功する
- **必要なテスト:** クライアント生成の単体テスト(DB 接続なし)
- **前提タスク:** SETUP-001, SETUP-004
- **対象外:** 設計書 §6 の業務テーブル(MASTER 系以降で実装)

### ✅ SETUP-006 共通型パッケージ

- **目的:** API 契約(型・zod・定数・列挙値・エラー型)をフロント/バックで共有する
- **作業範囲:** packages/shared(health スキーマ、列挙値、ProblemDetails、API 定数)
- **変更予定パッケージ:** packages/shared
- **完了条件:** web / api の両方から import してビルドが通る
- **必要なテスト:** スキーマの単体テスト
- **前提タスク:** SETUP-001
- **対象外:** 業務 API のスキーマ(各機能タスクで追加)

### ✅ SETUP-007 テスト環境

- **目的:** Vitest(単体)/ NestJS Testing(API)/ Playwright(E2E)を整備する
- **作業範囲:** 各パッケージの vitest 設定、apps/api の swc 設定、apps/web の Playwright + スモークテスト、scoring/matchup のテスト雛形
- **変更予定パッケージ:** 全パッケージ
- **完了条件:** `pnpm test` と `pnpm test:e2e` が成功する
- **必要なテスト:** スモーク E2E 1件(トップ表示+ヘルスチェック疎通)
- **前提タスク:** SETUP-002, SETUP-003
- **対象外:** 実 DB を使う結合テスト(SETUP-011)

### ✅ SETUP-008 CI 設定

- **目的:** push / PR ごとに品質チェックを自動実行する
- **作業範囲:** GitHub Actions(pnpm キャッシュ、lint / typecheck / test / build、Playwright E2E)
- **変更予定パッケージ:** .github/workflows
- **完了条件:** CI がグリーンになる。E2E の失敗時にトレースがアーティファクト保存される
- **必要なテスト:** CI 上で既存テスト一式が実行されること
- **前提タスク:** SETUP-007
- **対象外:** デプロイパイプライン

### ✅ SETUP-009 API の Prisma モジュール

- **目的:** NestJS から DB アクセスする共通基盤(PrismaService)を作る
- **作業範囲:** apps/api に PrismaModule / PrismaService(ライフサイクル管理、graceful shutdown)
- **変更予定パッケージ:** apps/api
- **完了条件:** Service 経由で `SELECT 1` 相当が実行できる
- **必要なテスト:** PrismaService の単体テスト(モック)
- **前提タスク:** SETUP-005
- **対象外:** 業務クエリ、health への DB 状態追加

### ✅ SETUP-010 Redis アダプター基盤

- **目的:** Redis 接続の共通基盤(アダプター)を作る(キャッシュ処理本体は対象外)
- **作業範囲:** apps/api に RedisModule(接続・切断・ping)、設定は REDIS_URL
- **変更予定パッケージ:** apps/api
- **完了条件:** 起動時に Redis へ接続でき、未接続でもアプリが落ちない
- **必要なテスト:** アダプターの単体テスト(モック)
- **前提タスク:** SETUP-004
- **対象外:** 候補キャッシュ・LLM キャッシュの実装(BATTLE-005 / LLM-003)

### ⬜ SETUP-011 テスト用 DB 整備

- **目的:** 実 PostgreSQL を使う結合テストを安全に実行できるようにする
- **作業範囲:** テスト用 DB のセットアップ/リセット手順、テストヘルパー、CI への組み込み
- **変更予定パッケージ:** packages/database, apps/api, .github/workflows
- **完了条件:** 結合テストがローカルと CI で再現可能に実行できる
- **必要なテスト:** サンプル結合テスト1件
- **前提タスク:** SETUP-008, SETUP-009
- **対象外:** 全 API の結合テスト化

---

## フェーズ1: マスタデータ(MASTER)

### ✅ MASTER-001 ポケモンマスタのスキーマ

- **目的:** pokemons テーブル(設計書 §6.2)を実装する
- **作業範囲:** Prisma モデル(図鑑番号・フォルム・タイプ・種族値・特性 jsonb・メガ情報)+マイグレーション+インデックス
- **変更予定パッケージ:** packages/database, packages/shared(jsonb の zod スキーマ)
- **完了条件:** マイグレーション適用成功。名前検索を想定したインデックスがある
- **必要なテスト:** jsonb スキーマの単体テスト
- **前提タスク:** SETUP-005
- **対象外:** データ投入、検索 API

### ✅ MASTER-002 技マスタのスキーマ

- **目的:** moves テーブル(タイプ・分類・威力・命中・優先度・tags)を実装する
- **作業範囲:** Prisma モデル+マイグレーション。tags は shared の MoveTag と対応
- **変更予定パッケージ:** packages/database, packages/shared
- **完了条件:** マイグレーション適用成功
- **必要なテスト:** tags スキーマの単体テスト
- **前提タスク:** SETUP-005
- **対象外:** ポケモン×習得技の関連(MASTER-004)

### ✅ MASTER-003 持ち物・特性マスタのスキーマ

- **目的:** items / abilities テーブル(effect_tags 付き)を実装する
- **作業範囲:** Prisma モデル+マイグレーション
- **変更予定パッケージ:** packages/database, packages/shared
- **完了条件:** マイグレーション適用成功
- **必要なテスト:** effect_tags スキーマの単体テスト
- **前提タスク:** SETUP-005
- **対象外:** データ投入

### ✅ MASTER-004 習得可能技・シーズン・ルールのスキーマ

- **目的:** ポケモン×習得可能技の関連、seasons / rules テーブルを実装する
- **作業範囲:** Prisma モデル+マイグレーション(§11.3「習得可能技のみを技候補に表示」の基盤)
- **変更予定パッケージ:** packages/database
- **完了条件:** マイグレーション適用成功
- **必要なテスト:** なし(スキーマのみ)
- **前提タスク:** MASTER-001, MASTER-002
- **対象外:** シーズン管理 API(ARCHETYPE-004)

### ✅ MASTER-005 マスタ投入パイプライン(サンプル)

- **目的:** PokéAPI 等からマスタデータを整形投入する仕組みを作り、開発用サンプル(20体規模)を投入する
- **作業範囲:** packages/database に seed スクリプト(冪等)。Champions 固有要素は手動補完できる形式にする
- **変更予定パッケージ:** packages/database
- **完了条件:** `pnpm --filter @pokemon-champions/database db:seed` で再実行可能に投入できる
- **必要なテスト:** 整形ロジックの単体テスト
- **前提タスク:** MASTER-001〜004
- **対象外:** 全ポケモンの本格投入(MASTER-009)
- **現行データ:** 冪等投入パイプラインは完成済みだが、開発サンプルはPokemon 4件であり、目的欄の「20体規模」には未到達。本格件数はMASTER-009で投入する

### ✅ MASTER-006 ポケモン検索 API

- **目的:** `GET /master/pokemons?q=`(オートコンプリート用)を実装する
- **作業範囲:** shared スキーマ、apps/api の master モジュール、日本語/英語の前方一致+部分一致
- **変更予定パッケージ:** packages/shared, apps/api
- **完了条件:** 2文字入力で候補が返る。p95 100ms 以内(ローカル)
- **必要なテスト:** API テスト(ヒット・0件・検証エラー)
- **前提タスク:** SETUP-009, MASTER-005
- **対象外:** 技・持ち物検索(MASTER-007)

### ✅ MASTER-007 技・持ち物・特性検索 API

- **目的:** `GET /master/moves?q=&pokemon_id=` / `/master/items?q=` / `/master/abilities?pokemon_id=` を実装する
- **作業範囲:** shared スキーマ、apps/api。pokemon_id 指定時は習得可能技/所持可能特性で絞り込み
- **変更予定パッケージ:** packages/shared, apps/api
- **完了条件:** 各エンドポイントが仕様通り絞り込んで返す
- **必要なテスト:** API テスト(絞り込み・0件)
- **前提タスク:** MASTER-006
- **対象外:** 管理用マスタ CRUD

### ✅ MASTER-008 マスタ管理 API(admin)

- **目的:** ゲームマスタデータの管理機能(A-06)を実装する
- **作業範囲:** `/admin/master`配下のPokemon / Move / Item / Ability CRUDと、Pokemon単位の習得可能Move一覧・PUT全置換
- **変更予定パッケージ:** packages/shared, apps/api
- **完了条件:** admin のみがマスタを追加・修正できる
- **必要なテスト:** API テスト(認可含む)
- **前提タスク:** AUTH-004, MASTER-005
- **対象外:** 管理画面 UI(WEB-011)

### ✅ MASTER-009 マスタデータ本格投入(全体)

- **目的:** MASTER-009A / 009Bを完了し、Champions現行版で公開確認できるPokemon・Move・Ability・PokemonMoveと、出典付きItemカタログを揃える
- **完了条件:** MASTER-009A / 009Bがともに完了し、Itemの全合法集合を推測せず既知制限として明示している

### ✅ MASTER-009A PokéAPI Champions v1.0公開マスタ投入

- **目的:** PokéAPI PR #1532のChampions v1.0公開データを固定スナップショットとして投入する
- **作業範囲:** 対象Pokemon・フォーム、参照Move・Ability、Champions v1.0のTrain習得関係、既存Item、出典・検収データ
- **変更予定パッケージ:** packages/database、docs
- **完了条件:** Pokemon 281件、Move 490件、Ability 191件、PokemonMove 17,394件を冪等投入でき、公開検索・Party作成・Battle入力で利用できる
- **必要なテスト:** 固定出典・件数・フォーム例外・参照整合性・3回連続seed・公開API・Party/Battle統合
- **前提タスク:** MASTER-005, MASTER-008
- **対象外:** Champions v1.1以降、Item合法範囲の本格投入、DB/API/Web変更

### ✅ MASTER-009B Champions現行版差分・Item・固有要素補完

- **目的:** v1.0スナップショットへPokémon Champions Ver. 1.1.4時点(Regulation Set M-B)の公開確認可能な差分を反映する
- **作業範囲:** Pokemon・フォーム38件、Move 6件、Abilityの自然キー差分、Champions Train習得関係2,416件の固定スナップショットと、ItemカタログMVP方針・既知制限の記録
- **変更予定パッケージ:** packages/database(データ中心)、docs
- **完了条件:** Pokemon 319件、Move 496件、Ability 200件、PokemonMove 19,810件、Item 3件を冪等投入でき、全合法Item集合を保証しないことと未確認項目が明示されている
- **必要なテスト:** 固定commit・差分件数・日本語名・Mega元・既存v1.0スナップショット非破壊・Item不変・3回連続seed・公開API・Party/Battle統合
- **前提タスク:** MASTER-009A
- **対象外:** ARCHETYPE-004、API/Web/DBスキーマ変更

### ✅ MASTER-010 公開Rule一覧API

- **目的:** 一般ユーザーがParty作成に利用できるRule一覧を取得できるようにする
- **作業範囲:** `GET /master/rules`、sharedのstrictレスポンススキーマ、必要4項目だけの決定的な一覧取得
- **変更予定パッケージ:** packages/shared, apps/api
- **完了条件:** 認証なしでRuleの`id`・`name`・`teamSize`・`pickSize`を取得でき、0件・不正DB値を安全に扱える
- **必要なテスト:** sharedスキーマ、Service、APIテスト（正常・0件・公開範囲・並び順・不正DB値）
- **前提タスク:** MASTER-004, SETUP-009
- **対象外:** Rule変更、admin API変更、Season公開、WEB-006、DB変更

### ✅ MASTER-011 公開ポケモン詳細・種族値API

- **目的:** 一般ユーザーがParty入力の実数値計算に必要な選択済みPokemonの種族値を取得できるようにする
- **作業範囲:** `GET /master/pokemons/:id`、sharedのstrict params・詳細スキーマ、必要表示項目と6種族値だけの単体取得
- **変更予定パッケージ:** packages/shared, apps/api
- **完了条件:** 認証なしで通常・メガ形態の詳細と6種族値を取得でき、不正ID・不存在・不正DB値をRFC 9457形式で安全に扱える
- **必要なテスト:** sharedスキーマ、Service、APIテスト（通常・メガ・種族値・strict・400・404・500・検索API非破壊）
- **前提タスク:** MASTER-001, MASTER-006, SETUP-009
- **対象外:** Pokemon検索レスポンス変更、実数値計算、WEB-006、DB・admin・Rule変更

---

## フェーズ1: 認証(AUTH)

### ✅ AUTH-001 users スキーマ

- **目的:** users テーブル(§6.3)を実装する
- **作業範囲:** Prisma モデル+マイグレーション(email unique, role)
- **変更予定パッケージ:** packages/database, packages/shared(UserRole は定義済み)
- **完了条件:** マイグレーション適用成功
- **必要なテスト:** なし(スキーマのみ)
- **前提タスク:** SETUP-005
- **対象外:** 認証ロジック

### ✅ AUTH-002 登録・ログイン API

- **目的:** POST /auth/register, /auth/login(メール+パスワード、bcrypt、JWT アクセストークン)を実装する
- **作業範囲:** shared スキーマ、auth モジュール、パスワードポリシー、JWT 発行
- **変更予定パッケージ:** packages/shared, apps/api
- **完了条件:** 登録→ログイン→トークン取得が通る。パスワードは bcrypt でハッシュ化される
- **必要なテスト:** API テスト(成功・重複メール・誤パスワード・検証エラー)
- **前提タスク:** AUTH-001, SETUP-009
- **対象外:** リフレッシュトークン(AUTH-003)、OAuth(AUTH-005)

### ✅ AUTH-003 リフレッシュトークン

- **目的:** POST /auth/refresh(短命アクセス+リフレッシュ、§14)を実装する
- **作業範囲:** リフレッシュトークンの保存・失効・ローテーション
- **変更予定パッケージ:** packages/shared, apps/api, packages/database
- **完了条件:** 期限切れアクセストークンをリフレッシュで更新できる
- **必要なテスト:** API テスト(更新・失効済み・不正トークン)
- **前提タスク:** AUTH-002
- **対象外:** OAuth

### ✅ AUTH-004 認可ガード

- **目的:** JWT 認証ガード、role=admin チェック、リソース所有者チェックの共通部品を作る
- **作業範囲:** apps/api の Guard / デコレータ、未認証 401・権限なし 403/404 の統一
- **変更予定パッケージ:** apps/api, packages/shared(エラーコード)
- **完了条件:** 保護エンドポイントに認可が適用できる
- **必要なテスト:** Guard の単体テスト+ API テスト
- **前提タスク:** AUTH-002
- **対象外:** 各業務 API への適用(各タスクで実施)

### ⬜ AUTH-005 Google OAuth

- **目的:** OAuth (Google) ログイン(§3)を実装する
- **作業範囲:** OAuth フロー、password_hash null ユーザーの扱い
- **変更予定パッケージ:** packages/shared, apps/api, apps/web
- **完了条件:** Google アカウントで登録・ログインできる
- **必要なテスト:** API テスト(モック IdP)
- **前提タスク:** AUTH-003, WEB-004
- **対象外:** 他の IdP

---

## フェーズ1: パーティ(PARTY)

### ✅ PARTY-001 パーティのスキーマ

- **目的:** parties / party_pokemons / party_pokemon_moves(§6.3)を実装する
- **作業範囲:** Prisma モデル+マイグレーション(evs/ivs/actual_stats は jsonb)、shared に evs 等の zod スキーマ
- **変更予定パッケージ:** packages/database, packages/shared
- **完了条件:** マイグレーション適用成功
- **必要なテスト:** evs スキーマ(合計上限バリデーション)の単体テスト
- **前提タスク:** MASTER-001〜004, AUTH-001
- **対象外:** API・画面

### ✅ PARTY-002 パーティ CRUD API

- **目的:** GET/POST /parties, GET/PUT/DELETE /parties/{id}(U-02, U-04)を実装する
- **作業範囲:** shared スキーマ(6体・技4・努力値上限等の検証)、parties モジュール、所有者チェック
- **変更予定パッケージ:** packages/shared, apps/api
- **完了条件:** 自分のパーティのみ CRUD できる。マスタ ID の存在チェックが効く
- **必要なテスト:** API テスト(CRUD・他人のパーティ 404・検証エラー)
- **前提タスク:** PARTY-001, AUTH-004
- **対象外:** 複数パーティ切替 UI(U-03 は将来)、画面(WEB-006)

### ✅ PARTY-003 Champions能力ポイント対応

- **目的:** 自分Partyの育成値をPokémon Championsの能力ポイントとして、従来EV・IVと混同せず直接入力・保存できるようにする
- **作業範囲:** PartyPokemonのnullable `statPoints`、既存EV互換列のnullable化、shared / Party CRUD / Session契約、Party画面の能力ポイント・実数値直接入力、docs
- **変更予定パッケージ:** packages/database, packages/shared, apps/api, apps/web, docs
- **完了条件:** 能力ポイントを各0〜32・合計66以下で保存・再取得でき、新規UIはEV・IVを入力せず、実数値を直接保存し、counterplanが保存済みactualStatsを利用する
- **必要なテスト:** migration、shared境界、Party POST/PUT/GET、Session/counterplan回帰、375px/1440px E2E、実DB
- **前提タスク:** PARTY-001, PARTY-002, ARCHETYPE-004C, WEB-006, MATCHUP-008
- **対象外:** Archetype/Master変更、MATCHUP計算式、能力ポイントからの実数値算出、EV/IV変換、LLM

---

## フェーズ1: テンプレ構築(ARCHETYPE)

### ✅ ARCHETYPE-001 テンプレ構築のスキーマ

- **目的:** archetypes / archetype_pokemons / archetype_pokemon_moves / archetype_sources(§6.4)を実装する
- **作業範囲:** Prisma モデル+マイグレーション+ §6.6 のインデックス(逆引き用)
- **変更予定パッケージ:** packages/database, packages/shared(default_leads 等の zod)
- **完了条件:** マイグレーション適用成功。逆引きインデックスがある
- **必要なテスト:** jsonb スキーマの単体テスト
- **前提タスク:** MASTER-001〜004
- **対象外:** encounter_reports(ENCOUNTER-001)

### ✅ ARCHETYPE-002 構築管理 CRUD API

- **目的:** GET/POST /admin/archetypes, PUT/DELETE /admin/archetypes/{id}(A-01)を実装する
- **作業範囲:** shared スキーマ(出典 URL 必須等の品質ルール §13.2)、admin モジュール、admin 認可
- **変更予定パッケージ:** packages/shared, apps/api
- **完了条件:** admin が構築を登録・更新・アーカイブできる。出典 URL 必須が検証される
- **必要なテスト:** API テスト(CRUD・認可・検証エラー)
- **前提タスク:** ARCHETYPE-001, AUTH-004
- **対象外:** 管理画面 UI、重複チェック(ARCHETYPE-005)

### ✅ ARCHETYPE-003 人気度・シーズン管理 API

- **目的:** PUT /admin/archetypes/{id}/popularity(A-02)、/admin/seasons, /admin/rules(A-03)を実装する
- **作業範囲:** 人気度 Tier(high/mid/low)更新、シーズン・ルール CRUD、シーズン終了時の一括 archived
- **変更予定パッケージ:** packages/shared, apps/api
- **完了条件:** Tier 変更とシーズン切替(一括アーカイブ)ができる
- **必要なテスト:** API テスト
- **前提タスク:** ARCHETYPE-002
- **対象外:** 人気度の数値スコア化(OPS-001)

### ✅ ARCHETYPE-004 構築データ初期登録(30件)

- **目的:** MVP 用のテンプレ構築データを登録する(運用タスク、§15 フェーズ1)
- **作業範囲:** 攻略サイト調査→構造化データ登録(本文・画像は転載しない。出典 URL のみ)。Pokemon・Move・Abilityは既存masterから選び、Itemは出典で明示されたものだけを追加する
- **変更予定パッケージ:** なし(データのみ)
- **完了条件:** published 30件、全件に出典URLがあり、持ち物・IV・actualStats・対象Rule/Seasonを推測していない。実数値未確認はpartialとして明示し、持ち物不明の構築は採用せず、持ち物なしが確認できる場合だけnullとする
- **必要なテスト:** データ品質チェック(§13.2)
- **前提タスク:** ARCHETYPE-002, ARCHETYPE-004A, ARCHETYPE-004B, ARCHETYPE-004C, ARCHETYPE-004D, MASTER-009A, MASTER-009B(または WEB-011 の管理画面)
- **対象外:** コード変更
- **運用結果:** 2026-07-31にRegulation Set M-B / Season M-4のPokeSol構築36件を記事ID昇順でpublished登録。全件partial、出典URL・6体・技・Item・Ability・Nature・statPointsを確認し、actualStats / evsはnull、未確認IVはnullのまま保存した

### ✅ ARCHETYPE-004A 基本選出の任意化

- **目的:** 出典から一意な基本選出を確認できない構築も、基本選出を推測せず登録・利用可能にする
- **作業範囲:** defaultLeadsを空配列またはRule.pickSize件に制限し、admin CRUD/preview、counterplan、公開詳細の既存経路へ反映する
- **変更予定パッケージ:** packages/database, packages/shared, apps/api, apps/web, docs
- **完了条件:** 空配列が保存・返却され、候補・詳細・counterplanが成功し、leadPokemonIdを推測しない
- **必要なテスト:** shared、admin Service/API、counterplan、Web回帰テスト
- **前提タスク:** ARCHETYPE-002, ARCHETYPE-005, MATCHUP-006〜008, WEB-008
- **対象外:** 構築データ登録、既存migrationの変更、基本選出の自動推定

### ✅ ARCHETYPE-004B 構築の実数値・IV要件の見直し

- **目的:** 公開構築の確認済み情報を保存しつつ、実数値が未確認の構築と厳密な対戦計算を分離する
- **作業範囲:** IVと実数値状態(exact / derived / partial)の保存・strict API契約、明示された全計算材料の検証、実数値不足時のタイプ相性限定counterplan、公開詳細の状態表示
- **変更予定パッケージ:** packages/database, packages/shared, packages/matchup, apps/api, apps/web, docs
- **完了条件:** partial構築を登録・候補・詳細・counterplanで利用でき、未確認IVを補完せず、ダメージ・確定数・素早さを誤って確定表示しない
- **必要なテスト:** migration、shared、admin CRUD/preview、公開詳細、matchup/counterplan、Web、実DB・Playwright
- **前提タスク:** ARCHETYPE-004A, MATCHUP-005〜008, WEB-008〜009
- **対象外:** 構築データ登録、IV推定、既存migrationの変更、MATCHUP計算式の変更

### ✅ ARCHETYPE-004C Champions能力ポイントの正規化

- **目的:** Pokémon Championsの能力ポイントを従来EVと混同せず、公開構築の確認値として保存・表示できるようにする
- **作業範囲:** nullableな`statPoints`のDB・strict shared/API契約、admin CRUD/preview・公開詳細への反映、能力ポイントの独立表示、partial/type_only回帰
- **変更予定パッケージ:** packages/database, packages/shared, apps/api, apps/web, docs
- **完了条件:** 各0〜32・合計66以下の能力ポイントをEV・実数値へ変換せず保存でき、partial構築が候補・詳細・type_only counterplanで利用できる
- **必要なテスト:** migration、shared境界、admin POST/PUT/preview/GET、公開詳細、counterplan回帰、375px/1440px E2E、実DB
- **前提タスク:** ARCHETYPE-004A, ARCHETYPE-004B
- **対象外:** ARCHETYPE-004の構築データ登録、role契約変更、MATCHUP計算式変更

### ✅ ARCHETYPE-004D 役割未分類の構築対応

- **目的:** 記事から具体的な役割を裏付けられない構築も、roleを推測せず中立値として登録・利用可能にする
- **作業範囲:** 必須roleへ`unclassified`を追加するDB・strict shared/API契約、candidate・preview・counterplanの中立性回帰、公開詳細の「役割未分類」表示
- **変更予定パッケージ:** packages/database, packages/shared, packages/scoring, packages/matchup, apps/api, apps/web, docs
- **完了条件:** `unclassified`を変換せず保存・返却でき、scoringで加点・減点せず、partial構築がcandidate・preview・type_only counterplan・公開詳細で利用できる
- **必要なテスト:** migration、shared、admin POST/PUT/preview/GET、公開GET、scoring、matchup/counterplan、375px/1440px E2E、実DB
- **前提タスク:** ARCHETYPE-004A, ARCHETYPE-004B, ARCHETYPE-004C
- **対象外:** ARCHETYPE-004の構築データ登録、role自動推測、既存具体roleの変更、MATCHUP計算式変更

### ✅ ARCHETYPE-005 重複チェック・プレビュー一致判定

- **目的:** 同名・類似構築の警告(§13.2)と、登録時のプレビュー一致判定テスト(§13.1)を実装する
- **作業範囲:** ポケモン6体一致度90%以上の警告、観測シミュレート入力での候補確認 API
- **変更予定パッケージ:** apps/api, packages/shared
- **完了条件:** 類似構築登録時に警告が返る。プレビューで候補順位を確認できる
- **必要なテスト:** API テスト+判定の単体テスト
- **前提タスク:** ARCHETYPE-002, SCORE-005
- **対象外:** 管理画面 UI

---

## フェーズ2: 一致度計算エンジン(SCORE)

> `packages/scoring` は純粋関数のみ。UI・API・DB に依存しないこと(AGENTS.md)。

### ✅ SCORE-001 一致度計算の型定義

- **目的:** §7 の入出力型(ObservationInput / ArchetypeSnapshot / ScoredCandidate 等)と配点設定を定義する
- **作業範囲:** packages/scoring の types.ts / config.ts / 関数シグネチャ / テスト雛形
- **変更予定パッケージ:** packages/scoring
- **完了条件:** 型が設計書 §7.2・付録B と対応し、ビルドが通る
- **必要なテスト:** 配点初期値のテスト+ it.todo の雛形
- **前提タスク:** SETUP-006
- **対象外:** 計算ロジック本体

### ✅ SCORE-002 ポケモン一致スコア

- **目的:** ポケモン観測の一致判定(+pokemonHit × usage_rate)と max_score 積算を実装する
- **作業範囲:** scoreArchetype のポケモン観測処理、is_revoked 除外、MatchDetail 生成
- **変更予定パッケージ:** packages/scoring
- **完了条件:** ポケモンのみの観測列で正しい raw/max/matchRate を返す
- **必要なテスト:** 単体テスト(一致・usage_rate 反映・revoked 除外・正規化)
- **前提タスク:** SCORE-001
- **対象外:** 技・持ち物等の観測、減点、除外判定

### ✅ SCORE-003 技一致スコア

- **目的:** 技観測の一致判定(+moveHit × adoption_rate)を実装する
- **作業範囲:** 観測技と対象ポケモンの技リスト照合、adoption_rate 反映
- **変更予定パッケージ:** packages/scoring
- **完了条件:** ポケモン+技の観測列で正しいスコアを返す
- **必要なテスト:** 単体テスト(確定枠 1.0 / 選択枠 0.5・未観測ポケモンの技)
- **前提タスク:** SCORE-002
- **対象外:** 技矛盾の減点(SCORE-004)

### ✅ SCORE-004 矛盾・除外判定

- **目的:** 不一致・矛盾の減点(§7.2 減点行)と除外条件(不一致3体以上 / メガ矛盾)を実装する
- **作業範囲:** ポケモン不一致・技矛盾・持ち物矛盾・特性矛盾・メガ矛盾、raw<0 → 0%、excluded フラグ
- **変更予定パッケージ:** packages/scoring
- **完了条件:** 付録A の具体例で一致度 100% を再現する
- **必要なテスト:** 単体テスト(各減点・除外境界値・付録A 再現)
- **前提タスク:** SCORE-003, SCORE-006
- **対象外:** ソート(SCORE-005)

### ✅ SCORE-005 人気度を含む並び替え

- **目的:** rankCandidates(§7.3: 一致度→人気度→遭遇数→更新日、上位N件)を実装する
- **作業範囲:** ソート・excluded 除外・rank 付与・limit
- **変更予定パッケージ:** packages/scoring
- **完了条件:** 4キーの優先順位どおりにソートされる
- **必要なテスト:** 単体テスト(各キーの逆転ケース・同点・excluded)
- **前提タスク:** SCORE-004
- **対象外:** 人気度の数値スコア(将来 popularity_score 対応は OPS-001)

### ✅ SCORE-006 持ち物・特性・先発・メガ一致スコア

- **目的:** 残りの観測種別の加点(持ち物 +15/代替 +8、特性 +8、先発 +6、メガ +12)を実装する
- **作業範囲:** item / ability / position / mega 観測の一致判定
- **変更予定パッケージ:** packages/scoring
- **完了条件:** 全観測種別で加点が設計書どおり計算される
- **必要なテスト:** 単体テスト(種別ごと・代替持ち物)
- **前提タスク:** SCORE-003
- **対象外:** 減点(SCORE-004 側で統合)

### ✅ SCORE-007 表示要素の算出

- **目的:** §7.4 の「残りの可能性が高いポケモン」「警戒すべき技」を算出する
- **作業範囲:** likelyUnseen(未観測を usage_rate 降順)、threatMoveIds(setup/hazard/screen/priority タグ+threat_notes)
- **変更予定パッケージ:** packages/scoring
- **完了条件:** ScoredCandidate に両要素が正しく含まれる
- **必要なテスト:** 単体テスト(順序・タグ判定)
- **前提タスク:** SCORE-004
- **対象外:** UI 表示

---

## フェーズ2: 対戦セッション(BATTLE)

### ✅ BATTLE-001 対戦セッション作成

- **目的:** battle_sessions / observations スキーマ(§6.5)と POST /sessions, GET /sessions/{id} を実装する
- **作業範囲:** Prisma モデル+マイグレーション+ §6.6 インデックス、shared スキーマ、sessions モジュール、所有者チェック
- **変更予定パッケージ:** packages/database, packages/shared, apps/api
- **完了条件:** party_id, rule_id を指定してセッションを開始・取得できる
- **必要なテスト:** API テスト(作成・取得・他人 404・検証エラー)
- **前提タスク:** PARTY-002, AUTH-004
- **対象外:** 観測追加(BATTLE-002)

### ✅ BATTLE-002 観測情報追加

- **目的:** POST /sessions/{id}/observations で観測を1件ずつ追記する(B-02〜B-03)
- **作業範囲:** kind別の厳密な入力検証、マスタ参照検証、追記保存(seq 採番)、作成したObservationのレスポンス
- **変更予定パッケージ:** packages/shared, apps/api
- **完了条件:** 自分のactiveなSessionへ6種の観測を同時追加でも重複しないseqで追記できる
- **必要なテスト:** sharedスキーマ、Service/APIテスト(6種・所有権・状態・マスタ参照・同時採番)
- **前提タスク:** BATTLE-001, SCORE-005, SCORE-007, ARCHETYPE-001
- **対象外:** 候補計算・Snapshot変換・scoring呼び出し、Undo(BATTLE-003)、Redis キャッシュ(BATTLE-005)、レート制限(BATTLE-006)

### ✅ BATTLE-003 Undo

- **目的:** DELETE /sessions/{id}/observations/{obsId}(B-11)で直近の有効な観測を論理Undoする
- **作業範囲:** strictなURL params検証、直近有効Observationの確認、is_revokedの条件付き更新、取消済みObservationレスポンス
- **変更予定パッケージ:** packages/shared, apps/api
- **完了条件:** 自分のactiveなSessionで最大seqの未取消Observationだけを物理削除・seq再利用なしでUndoでき、同時Undoが二重成功しない
- **必要なテスト:** sharedスキーマ、Service/APIテスト(直近Undo・取消済み除外・二重/同時Undo・所有権・状態)
- **前提タスク:** BATTLE-002
- **対象外:** 候補再計算・Snapshot変換・scoring呼び出し、Redo、任意の過去Observation指定、Redis、UI

### ✅ BATTLE-004 候補取得・選択・終了

- **目的:** GET /sessions/{id}/candidates, POST /sessions/{id}/select, POST /sessions/{id}/end(B-06)を実装する
- **作業範囲:** 現行Season・同一Ruleのpublished構築を既存scoringで上位3件へ算出、表示候補のselected_archetype_id保存+pick_count加算、active Sessionの終了(結果は任意入力)
- **変更予定パッケージ:** packages/shared, apps/api
- **完了条件:** 自分のactive Sessionで決定的な候補を取得でき、表示候補の選択でpick_countが1回だけ増え、status=ended・ended_at設定で終了できる
- **必要なテスト:** sharedスキーマ、変換・Service/APIテスト(候補順・除外・所有権・選択集計・同時選択/終了・既存API回帰)
- **前提タスク:** BATTLE-002
- **対象外:** counterplan(MATCHUP-008)、Redis(BATTLE-005)、レート制限(BATTLE-006)、自動アーカイブ(BATTLE-007)、履歴・WebSocket・UI

### ✅ BATTLE-005 Redis 候補キャッシュ

- **目的:** セッション状態・候補計算結果を Redis にキャッシュし、p95 200ms 以内(§5)を満たす
- **作業範囲:** キャッシュキー設計、観測追加時の無効化、Redis 障害時は DB 直読みにフォールバック
- **変更予定パッケージ:** apps/api
- **完了条件:** キャッシュヒット時のレイテンシ改善が計測できる。Redis 停止でも機能する
- **必要なテスト:** 単体テスト(無効化・フォールバック)
- **前提タスク:** SETUP-010, BATTLE-002
- **対象外:** LLM キャッシュ(LLM-003)

### ✅ BATTLE-006 レート制限

- **目的:** 観測入力 API に 60req/分/ユーザーの制限(§14)をかける
- **作業範囲:** Redis ベースのレートリミッタ、429 + Problem Details 応答
- **変更予定パッケージ:** apps/api, packages/shared
- **完了条件:** 制限超過で 429 が返り、時間経過で回復する
- **必要なテスト:** 単体テスト(境界値)+ API テスト
- **前提タスク:** SETUP-010, BATTLE-002
- **対象外:** 他エンドポイントの制限

### ✅ BATTLE-007 セッション自動アーカイブ

- **目的:** 対戦セッションを90日で自動アーカイブする(§5)
- **作業範囲:** アーカイブバッチ(cron)、archive_days 設定値化
- **変更予定パッケージ:** apps/api, packages/database
- **完了条件:** 90日超のセッションが対象外になる
- **必要なテスト:** 単体テスト(境界日付)
- **前提タスク:** BATTLE-001
- **対象外:** 対戦履歴画面(将来 U-05)

---

## フェーズ2: 対戦画面 UI(WEB)

### ✅ WEB-001 相手ポケモン入力画面

- **目的:** S-04 入力タブ: オートコンプリート(2文字で候補表示)によるポケモン入力(B-02)を実装する
- **作業範囲:** 対戦画面の骨組み(タブ構成、Zustand)、検索バー、観測 API 呼び出し、入力済みリスト
- **変更予定パッケージ:** apps/web
- **完了条件:** 検索→候補タップの2タップで観測が登録される
- **必要なテスト:** コンポーネント/フックの単体テスト+ E2E(入力フロー)
- **前提タスク:** MASTER-006, BATTLE-002
- **対象外:** 技入力(WEB-002)、候補表示(WEB-003)

### ✅ WEB-002 技入力画面

- **目的:** 入力済みポケモンへの技の追加入力(B-03の技部分)を実装する
- **作業範囲:** ポケモン配下の入力 UI、習得可能技での絞り込み
- **変更パッケージ:** apps/web
- **完了条件:** 技を追加すると対象Pokemonと紐づく観測 API に反映される
- **必要なテスト:** 単体テスト+ E2E(技追加)
- **前提タスク:** WEB-001, MASTER-007
- **対象外:** 持ち物・特性・先発/控え・メガ入力、Undo UI(WEB-004)

### ✅ WEB-003 候補上位3件表示

- **目的:** 候補タブ: 一致度付き上位3件のリアルタイム表示(B-04, B-05)と順位変動バッジを実装する
- **作業範囲:** 候補カード(一致度・一致情報・残りポケモン・警戒技)、入力ごとの自動更新、順位変動通知
- **変更予定パッケージ:** apps/web
- **完了条件:** 観測入力のたびに候補が更新され、上位3件が表示される
- **必要なテスト:** 単体テスト+ E2E(入力→候補更新)
- **前提タスク:** WEB-001
- **対象外:** 候補選択→対策(WEB-007)

### ✅ WEB-004 Undo UI

- **目的:** 誤入力のワンタップ取り消し(B-11)を実装する
- **作業範囲:** 入力済みリストの × ボタン → Undo API → 候補更新
- **変更予定パッケージ:** apps/web
- **完了条件:** ワンタップで観測が取り消され候補が戻る
- **必要なテスト:** E2E(入力→Undo→候補復元)
- **前提タスク:** WEB-003, BATTLE-003
- **対象外:** Redo

### ✅ WEB-005 ログイン・登録画面

- **目的:** S-01 を実装する
- **作業範囲:** 登録/ログインフォーム、トークン管理(TanStack Query + 保存方針)、未認証リダイレクト
- **変更予定パッケージ:** apps/web
- **完了条件:** 登録→ログイン→保護画面遷移が通る
- **必要なテスト:** 単体テスト+ E2E(ログインフロー)
- **前提タスク:** AUTH-002
- **対象外:** OAuth ボタン(AUTH-005)

### ✅ WEB-006 ホーム・パーティ登録画面

- **目的:** S-02(対戦開始+パーティ選択)と S-03(6体入力フォーム)を実装する
- **作業範囲:** パーティ CRUD 画面(努力値スライダー・合計上限・実数値自動計算・習得技絞り込み)、ホーム画面
- **変更予定パッケージ:** apps/web
- **完了条件:** パーティを登録し、ホームから対戦セッションを開始できる
- **必要なテスト:** 実数値計算の単体テスト+ E2E(パーティ登録→対戦開始)
- **前提タスク:** WEB-005, PARTY-002, BATTLE-001
- **対象外:** 複数パーティ切替(U-03)

### ✅ WEB-007 対策タブ

- **目的:** S-04 対策タブ: おすすめ選出・相手別おすすめ・警戒ポイント表示(B-06〜B-09)を実装する
- **作業範囲:** 候補選択→対策 API 呼び出し→選出カード・警戒表示。LLM 文は後から差し替わる表示枠のみ
- **変更予定パッケージ:** apps/web
- **完了条件:** 候補選択から対策表示まで一連で動作する
- **必要なテスト:** 単体テスト+ E2E(候補選択→対策表示)
- **前提タスク:** WEB-003, MATCHUP-008
- **対象外:** LLM 文表示(WEB-009)

### ✅ WEB-008 構築詳細画面

- **目的:** S-05: テンプレ構築の全情報+出典リンク表示(B-06, B-10)を実装する
- **作業範囲:** 構築詳細ページ(6体・技・持ち物・基本選出・playstyle_notes・出典 URL)
- **変更予定パッケージ:** apps/web, packages/shared, apps/api(公開用詳細 API)
- **完了条件:** 候補から詳細に遷移し出典リンクが開ける
- **必要なテスト:** API テスト+ E2E
- **前提タスク:** WEB-003, ARCHETYPE-001
- **対象外:** お気に入り(U-06)

### ✅ WEB-009 LLM 理由文表示

- **目的:** 対策タブでテンプレ文を即時表示し、LLM 文が生成でき次第差し替える(§12.2 非同期)
- **作業範囲:** ポーリング(または WS-001 後にプッシュ)での差し替え表示
- **変更予定パッケージ:** apps/web
- **完了条件:** LLM 失敗時もテンプレ文が表示され続ける
- **必要なテスト:** 単体テスト(フォールバック表示)+ E2E
- **前提タスク:** WEB-007, LLM-002
- **対象外:** LLM 本体(LLM 系)

### ⬜ WEB-010 PWA・スマホ最適化

- **目的:** スマホファースト(§2.2)・ダークモード(§11.2)・90秒 UX の磨き込みを行う
- **作業範囲:** PWA マニフェスト、片手操作の検証、ライト/ダーク切替
- **変更予定パッケージ:** apps/web
- **完了条件:** iOS Safari / Android Chrome で入力→候補→対策が90秒以内に一巡できる
- **必要なテスト:** E2E(モバイルビューポート)
- **前提タスク:** WEB-007
- **対象外:** オフライン対応(スコープ外)

### ⬜ WEB-011 管理画面

- **目的:** S-07: テンプレ構築 CRUD・人気度調整・シーズン管理・プレビュー一致判定の UI(A-01〜A-06)を実装する
- **作業範囲:** admin ルート(role ガード)、構築入力フォーム、プレビュー
- **変更予定パッケージ:** apps/web
- **完了条件:** 管理者が §13.1 の登録フローを画面上で完結できる
- **必要なテスト:** E2E(構築登録→プレビュー→公開)
- **前提タスク:** ARCHETYPE-002, ARCHETYPE-005, WEB-005
- **対象外:** 構築テキストのパース補助(将来)

---

## フェーズ2: 相性判定エンジン(MATCHUP)

> `packages/matchup` は純粋関数のみ。UI・API・DB に依存しないこと。

### ✅ MATCHUP-001 相性判定の型定義

- **目的:** §9 の入出力型(CombatantSnapshot / MatchupScore / CounterplanResult 等)を定義する
- **作業範囲:** packages/matchup の types.ts / 関数シグネチャ / テスト雛形
- **変更予定パッケージ:** packages/matchup
- **完了条件:** 型が §9.1〜9.5 と対応し、ビルドが通る
- **必要なテスト:** it.todo の雛形
- **前提タスク:** SETUP-006
- **対象外:** 判定ロジック本体

### ✅ MATCHUP-002 タイプ相性表・攻防相性

- **目的:** タイプ相性データと攻撃相性(0〜30)/防御相性(0〜30)の評価を実装する
- **作業範囲:** タイプ相性表(shared へ定数化)、弱点/半減/無効判定(特性込みは基本のみ)
- **変更予定パッケージ:** packages/matchup, packages/shared
- **完了条件:** 代表的なタイプ組み合わせで §9.2 の配点レンジ内の値を返す
- **必要なテスト:** 単体テスト(相性表・複合タイプ・無効)
- **前提タスク:** MATCHUP-001
- **対象外:** ダメージ計算(MATCHUP-003)

### ✅ MATCHUP-003 ダメージ概算・確定数

- **目的:** §9.3 の簡易ダメージ計算と確定数比較(−15〜+15)を実装する
- **作業範囲:** damage 式、タイプ一致 1.5、持ち物/特性補正(主要なもの)、テラス後併記
- **変更予定パッケージ:** packages/matchup
- **完了条件:** 手計算のダメージ例と一致する
- **必要なテスト:** 単体テスト(計算例・確定数境界)
- **前提タスク:** MATCHUP-002
- **対象外:** 乱数・急所(仕様どおり対象外)

### ✅ MATCHUP-004 1対1相性スコア統合

- **目的:** calculateMatchupScore: 実技の攻撃相性・防御相性・確定数レースを統合して−100〜+100に正規化する
- **作業範囲:** 承認済みタイプ配点、最良/最危険技選択、確定数差、verdict判定、構造化reason code
- **変更予定パッケージ:** packages/matchup
- **完了条件:** 攻撃/防御各0〜30点と確定数差−15〜+15点が決定的に統合され、verdictが承認済み境界どおり判定される
- **必要なテスト:** 単体テスト(全倍率配点・技選択・確定数差・正規化・verdict境界・不正入力)
- **前提タスク:** MATCHUP-003
- **対象外:** 6×6 マトリクス(MATCHUP-005)

### ✅ MATCHUP-005 相性マトリクス・相手別おすすめ

- **目的:** 自6×相手6のマトリクスと相手別おすすめ順位(B-07)を実装する
- **作業範囲:** buildCounterplan の前半(matrix, perOpponent, avoid)
- **変更予定パッケージ:** packages/matchup
- **完了条件:** 36セルが計算され、相手ごとに上位3体+理由コードが出る
- **必要なテスト:** 単体テスト(マトリクス・順位)
- **前提タスク:** MATCHUP-004
- **対象外:** 選出提案(MATCHUP-006)

### ✅ MATCHUP-006 選出提案

- **目的:** §9.4 のおすすめ選出を、任意のRule.pickSizeに対して決定的に算出する
- **作業範囲:** 全組み合わせ列挙、MATCHUP-004セルの辞書式比較、priority相手へのcoverage、呼び出し側指定priorityに基づく先発
- **変更予定パッケージ:** packages/matchup
- **完了条件:** 重み付き合計や再計算を追加せず、承認済み比較順で最良の1組・相手別担当・coverage・先発が返る
- **必要なテスト:** 単体テスト(組み合わせ、比較全段階、coverage境界、先発、不正マトリクス、決定性・非破壊性)
- **前提タスク:** MATCHUP-005
- **対象外:** 警戒技(MATCHUP-007)

### ✅ MATCHUP-007 警戒技・立ち回り構造化

- **目的:** §9.5 の警戒技列挙と立ち回り方針の構造化データ生成を実装する
- **作業範囲:** タグ(setup/hazard/screen/priority/status)と採用率による警戒技列挙、threat_notes、strategyCodes、相手別上位3体・avoid、MATCHUP-006選出結果の統合
- **変更予定パッケージ:** packages/matchup
- **完了条件:** MATCHUP-004〜006を再計算せず、後続API・Web・LLMが利用できる構造化CounterplanResultが決定的に返る
- **必要なテスト:** 単体テスト(警戒技、note、strategyCodes、相手別表示、選出統合、不正入力、決定性・非破壊性)
- **前提タスク:** MATCHUP-006
- **対象外:** 自然文の立ち回り生成(LLM タスク)

### ✅ MATCHUP-008A 戦闘能力値スナップショット基盤

- **目的:** MATCHUP-008でParty・Archetype双方の正確なダメージ計算入力を構築できるよう、Ruleの対戦レベルとArchetypeの確定実数値を永続化する
- **作業範囲:** Rule.battleLevel、ArchetypePokemon.actualStats、共通shared契約、admin/public Rule API、admin Archetype CRUD・preview、Party作成画面のRuleレベル連動、新規forward migration
- **変更予定パッケージ:** packages/database, packages/shared, apps/api, apps/web, docs
- **完了条件:** 既存RuleをbattleLevel=50へ移行し、新規Rule・Archetype入力とParty画面が明示値だけを保存・利用し、DB/API/Webを含む全検証が成功する
- **必要なテスト:** shared境界・DB制約/migration・Rule/Archetype API・Party実数値再計算・375px/1440px E2E
- **前提タスク:** MATCHUP-007, PARTY-002, ARCHETYPE-002, MASTER-010, MASTER-011, WEB-006
- **対象外:** MATCHUP-008 counterplan API、Snapshot変換、能力値の自動推定、Pokemon単位level列

### ✅ MATCHUP-008 counterplan API

- **目的:** GET /sessions/{id}/counterplan(§10.3)を実装する
- **作業範囲:** 観測実測+テンプレ補完のスナップショット合成、matchup 呼び出し、§10.3 形式レスポンス
- **変更予定パッケージ:** apps/api, packages/shared
- **完了条件:** 候補選択済みセッションで対策が返る
- **必要なテスト:** API テスト+スナップショット合成の単体テスト
- **前提タスク:** MATCHUP-007, BATTLE-004, PARTY-002
- **対象外:** LLM 文(LLM 系)、UI(WEB-007)

---

## フェーズ2: LLM 連携(LLM)

### ✅ LLM-001 LLM アダプター+テンプレ文フォールバック

- **目的:** LLM を差し替え可能なアダプター構成にし、LLM なしで成立するテンプレ文生成を実装する(§12.2)
- **作業範囲:** `ExplanationGenerator` インターフェース、ルールベースのテンプレ文実装、DI 構成
- **変更予定パッケージ:** apps/api
- **完了条件:** ANTHROPIC_API_KEY 未設定でも理由文(テンプレ文)が返る
- **必要なテスト:** 単体テスト(テンプレ文生成)
- **前提タスク:** MATCHUP-008
- **対象外:** Anthropic API 呼び出し(LLM-002)

### ✅ LLM-002 Anthropic API 実装

- **目的:** 相性スコア内訳の構造化 JSON から理由文・方針文を生成する(§12.1〜12.2)
- **作業範囲:** Anthropic アダプター実装、プロンプト(計算結果にない情報の追加禁止)、失敗時フォールバック、ユーザー自由入力を含めない(§14)
- **変更予定パッケージ:** apps/api
- **完了条件:** 生成成功時は LLM 文、失敗時はテンプレ文が返る
- **必要なテスト:** 単体テスト(モック API・フォールバック)
- **前提タスク:** LLM-001
- **対象外:** キャッシュ(LLM-003)

### ✅ LLM-003 LLM キャッシュ・非同期化

- **目的:** (自ポケモン, 相手, スコア内訳ハッシュ)キーの Redis キャッシュと非同期生成を実装する(§12.2)
- **作業範囲:** キャッシュキー設計、非同期ジョブ、生成済み文の取得 API
- **変更予定パッケージ:** apps/api
- **完了条件:** 同一マッチアップの再生成が発生しない。対策表示は LLM を待たない
- **必要なテスト:** 単体テスト(キャッシュヒット・キー衝突なし)
- **前提タスク:** LLM-002, SETUP-010
- **対象外:** UI 差し替え(WEB-009)

---

## フェーズ2〜3: リアルタイム・運用・将来機能

### ⬜ WS-001 WebSocket 基盤

- **目的:** §2.1 の WebSocket 経路(候補更新・LLM 文のプッシュ)を実装する
- **作業範囲:** NestJS Gateway、認証、セッション購読、フロントの購読フック
- **変更予定パッケージ:** apps/api, apps/web, packages/shared
- **完了条件:** 観測追加が別タブへリアルタイム反映される
- **必要なテスト:** Gateway の単体テスト+ E2E
- **前提タスク:** BATTLE-002, AUTH-004
- **対象外:** WebSocket なしでも動く既存フローの削除(REST は維持)

### ⬜ OPS-001 人気度スコア日次バッチ

- **目的:** §8.2 の複合スコア(w1〜w6+鮮度係数)と日次集計を実装する
- **作業範囲:** 重み設定テーブル、集計バッチ、popularity_score 反映、シーズン切替時の初期化
- **変更予定パッケージ:** apps/api, packages/database, packages/scoring(ソートの score 対応)
- **完了条件:** バッチ実行で popularity_score が更新され、ソートに反映される
- **必要なテスト:** 集計ロジックの単体テスト
- **前提タスク:** ARCHETYPE-003, BATTLE-004
- **対象外:** 閲覧数・お気に入り数の収集(該当機能実装後)

### ⬜ ENCOUNTER-001 遭遇報告

- **目的:** encounter_reports(§6.4)と報告 API・encounter_count 集計を実装する(フェーズ2)
- **作業範囲:** スキーマ+報告 API + 集計
- **変更予定パッケージ:** packages/database, packages/shared, apps/api
- **完了条件:** 報告で encounter_count が増え、ソート3キー目に反映される
- **必要なテスト:** API テスト
- **前提タスク:** BATTLE-004
- **対象外:** レート帯別集計(フェーズ3)

### ⬜ HISTORY-001 対戦記録の保存・閲覧

- **目的:** U-05 / S-06(対戦履歴)を実装する(フェーズ2)
- **作業範囲:** result 記録、履歴一覧・詳細画面
- **変更予定パッケージ:** apps/api, apps/web, packages/shared
- **完了条件:** 終了済みセッションを一覧・閲覧できる
- **必要なテスト:** API テスト+ E2E
- **前提タスク:** BATTLE-007, WEB-007
- **対象外:** 勝率統計(フェーズ3)

---

## 推奨実装順(MVP クリティカルパス)

```
SETUP-008 → SETUP-009 → MASTER-001〜005 → AUTH-001〜004
  → ARCHETYPE-001〜002 → PARTY-001〜002
  → SCORE-002 → SCORE-003 → SCORE-006 → SCORE-004 → SCORE-005 → SCORE-007
  → BATTLE-001〜004 → MASTER-006〜007 → WEB-005 → MASTER-010 → MASTER-011 → WEB-006 → WEB-001〜004
  → MATCHUP-002〜007 → MATCHUP-008A → MATCHUP-008 → WEB-007〜008 → LLM-001〜003 → WEB-009
  → MASTER-008 → MASTER-009A → MASTER-009B → ARCHETYPE-004A → ARCHETYPE-004B → ARCHETYPE-004C → ARCHETYPE-004D
  → ARCHETYPE-004(データ30件) → BATTLE-005〜007 → PARTY-003 → WEB-010〜011
```

次に着手すべきタスク: **WEB-010 PWA・スマホ最適化**。
