/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Node global available while Vite evaluates this config file (@types/node is not installed).
declare const process: { env: Record<string, string | undefined> };

export default defineConfig({
  // GitHub Pages project page: https://dwainyu.github.io/tft-log/
  // EdgeOne serves the site from the domain root, so build with EDGEONE=1 -> base "/".
  // Bilibili Toy serves the bundle from a dynamic nested path inside a sandboxed
  // iframe, so build with TOY=1 -> base "./" (relative to index.html).
  base:
    process.env.TOY === "1"
      ? "./"
      : process.env.EDGEONE === "1"
        ? "/"
        : "/tft-log/",
  plugins: [react(), tailwindcss()],
  server: { port: 5183, host: true },
  preview: { port: 5184, host: true },
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
