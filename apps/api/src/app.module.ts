import { Module } from "@nestjs/common";
import { AdminArchetypesModule } from "./modules/admin-archetypes/admin-archetypes.module";
import { AuthModule } from "./modules/auth/auth.module";
import { HealthModule } from "./modules/health/health.module";
import { MasterModule } from "./modules/master/master.module";
import { PrismaModule } from "./modules/prisma/prisma.module";

@Module({
  imports: [PrismaModule, HealthModule, MasterModule, AuthModule, AdminArchetypesModule],
})
export class AppModule {}
