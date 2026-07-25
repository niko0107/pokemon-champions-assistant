import { Module } from "@nestjs/common";
import { AdminArchetypesModule } from "./modules/admin-archetypes/admin-archetypes.module";
import { AuthModule } from "./modules/auth/auth.module";
import { HealthModule } from "./modules/health/health.module";
import { MasterModule } from "./modules/master/master.module";
import { PartiesModule } from "./modules/parties/parties.module";
import { PrismaModule } from "./modules/prisma/prisma.module";
import { RedisModule } from "./modules/redis/redis.module";
import { SessionsModule } from "./modules/sessions/sessions.module";

@Module({
  imports: [
    PrismaModule,
    RedisModule,
    HealthModule,
    MasterModule,
    AuthModule,
    AdminArchetypesModule,
    PartiesModule,
    SessionsModule,
  ],
})
export class AppModule {}
