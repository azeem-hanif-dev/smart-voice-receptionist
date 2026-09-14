import { defineConfig } from "vitest/config";
export default defineConfig({
  test: { include: ["test/**/*.test.ts"], environment: "node", fileParallelism: false, testTimeout: 60_000, hookTimeout: 60_000, globalSetup: ["./test/global-setup.ts"] },
});
