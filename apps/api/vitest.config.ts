import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.spec.ts", "test/**/*.e2e-spec.ts"],
  },
  plugins: [
    // NestJS のデコレータメタデータ(emitDecoratorMetadata)を有効化するため
    // vitest 既定の esbuild ではなく swc でトランスパイルする
    swc.vite({
      module: { type: "es6" },
    }),
  ],
});
