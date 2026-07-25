import { Global, Module } from "@nestjs/common";
import { REDIS_ADAPTER } from "./redis-adapter";
import { REDIS_CLIENT, createRedisClientFromUrl } from "./redis-client.provider";
import { RedisService } from "./redis.service";

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: () => createRedisClientFromUrl(process.env.REDIS_URL),
    },
    RedisService,
    {
      provide: REDIS_ADAPTER,
      useExisting: RedisService,
    },
  ],
  exports: [REDIS_ADAPTER],
})
export class RedisModule {}
