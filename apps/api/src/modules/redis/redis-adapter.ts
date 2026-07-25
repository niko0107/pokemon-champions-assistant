/**
 * Redisのキー不存在とRedis自体の利用不可を区別する共通結果型。
 * 後続機能はstatus=unavailableなら主データストア等へフォールバックする。
 */
export type RedisOperationResult<T> = { status: "ok"; value: T } | { status: "unavailable" };

export interface RedisIncrementResult {
  count: number;
  ttlSeconds: number;
}

export interface RedisAdapter {
  isAvailable(): boolean;
  ping(): Promise<RedisOperationResult<"PONG">>;
  get(key: string): Promise<RedisOperationResult<string | null>>;
  set(key: string, value: string): Promise<RedisOperationResult<void>>;
  setWithTtl(key: string, value: string, ttlSeconds: number): Promise<RedisOperationResult<void>>;
  /**
   * キーを原子的にincrementし、TTLがない場合だけ指定TTLを設定する。
   * countとその時点の残りTTLを同じRedis操作から返す。
   */
  incrementWithTtl(
    key: string,
    ttlSeconds: number,
  ): Promise<RedisOperationResult<RedisIncrementResult>>;
  delete(key: string): Promise<RedisOperationResult<number>>;
}

/** 後続機能が具体的なRedisクライアントへ依存せず注入するためのtoken。 */
export const REDIS_ADAPTER = Symbol("REDIS_ADAPTER");
