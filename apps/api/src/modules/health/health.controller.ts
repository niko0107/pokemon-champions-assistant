import { Controller, Get } from "@nestjs/common";
import { healthResponseSchema, type HealthResponse } from "@pokemon-champions/shared";

@Controller("health")
export class HealthController {
  @Get()
  getHealth(): HealthResponse {
    // API 入出力は zod で検証する(開発ルール)。出力側も共有スキーマを通す。
    return healthResponseSchema.parse({ status: "ok" });
  }
}
