import "reflect-metadata";
import "dotenv/config";
import { NestFactory } from "@nestjs/core";
import { API_PREFIX } from "@pokemon-champions/shared";
import { AppModule } from "./app.module";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix(API_PREFIX);

  // ローカル開発では Vite の dev サーバーからのアクセスを許可する
  app.enableCors({
    origin: process.env.CORS_ORIGIN?.split(",") ?? ["http://localhost:5173"],
  });

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  console.log(`API server listening on http://localhost:${port}/${API_PREFIX}`);
}

void bootstrap();
