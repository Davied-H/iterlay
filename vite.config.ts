import { randomBytes } from "node:crypto";
import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { bundleBudgetViolation, measureStaticEntry } from "./scripts/bundle-budget";
import { devBrowserBridge } from "./scripts/dev-browser-vite";

const MAX_JAVASCRIPT_CHUNK_BYTES = 700_000;
// The assistant and canvas interaction refinements in v0.1.55 add a small,
// intentional amount of static UI code to this entry.
const MAX_CANVAS_ENTRY_GZIP_BYTES = 547_000;

function javascriptChunkBudget(): Plugin {
  return {
    name: "iterlay-javascript-chunk-budget",
    generateBundle(_options, bundle) {
      for (const output of Object.values(bundle)) {
        if (output.type !== "chunk" || output.code.length <= MAX_JAVASCRIPT_CHUNK_BYTES) continue;
        this.error(
          `${output.fileName} is ${(output.code.length / 1_000).toFixed(1)} kB; ` +
          `the JavaScript chunk budget is ${MAX_JAVASCRIPT_CHUNK_BYTES / 1_000} kB.`
        );
      }
    }
  };
}

function canvasEntryBudget(): Plugin {
  return {
    name: "iterlay-canvas-entry-budget",
    generateBundle(_options, bundle) {
      const measurement = measureStaticEntry(
        bundle,
        (chunk) => chunk.name === "CanvasBoard" || chunk.facadeModuleId?.endsWith("/CanvasBoard.tsx") === true
      );
      if (!measurement) {
        this.error("CanvasBoard entry was not found; the canvas aggregate resource budget could not be checked.");
      }
      const gzipKilobytes = measurement.gzipBytes / 1_000;
      const violation = bundleBudgetViolation("CanvasBoard", measurement, MAX_CANVAS_ENTRY_GZIP_BYTES);
      if (violation) this.error(violation);
      this.info(
        `CanvasBoard static entry: ${gzipKilobytes.toFixed(1)} kB gzip across ${measurement.files.length} files.`
      );
    }
  };
}

const developmentNonce = randomBytes(18).toString("base64");
const developmentCsp: Plugin = {
  name: "iterlay-development-csp",
  apply: "serve",
  transformIndexHtml: {
    order: "pre",
    handler: (html) => html.replace("script-src 'self' 'wasm-unsafe-eval'", `script-src 'self' 'wasm-unsafe-eval' 'nonce-${developmentNonce}'`)
  }
};

export default defineConfig(({ command }) => ({
  // Electron 生产环境通过 file:// 加载 dist/index.html,必须用相对路径,
  // 否则 /assets/* 会解析到文件系统根目录导致白屏。
  base: "./",
  html: command === "serve" ? { cspNonce: developmentNonce } : undefined,
  plugins: [developmentCsp, devBrowserBridge(), react(), javascriptChunkBudget(), canvasEntryBudget()],
  server: {
    watch: { ignored: ["**/dist-electron/**", "**/release/**", "**/output/**", "**/tmp/**"] },
    fs: {
      // Development credentials/workspaces must never be served as source files.
      deny: [".env", ".env.*", "*.{crt,pem}", "**/.git/**", "**/tmp/**",
        ...(process.env.ITERLAY_BROWSER_DEV_USER_DATA
          ? [`${path.resolve(process.env.ITERLAY_BROWSER_DEV_USER_DATA).replaceAll("\\", "/")}/**`]
          : [])]
    }
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@shared": path.resolve(__dirname, "./shared")
    }
  },
  build: {
    outDir: "dist",
    chunkSizeWarningLimit: MAX_JAVASCRIPT_CHUNK_BYTES / 1_000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("/node_modules/react/") || id.includes("/node_modules/react-dom/")) {
            return "react-vendor";
          }
          if (id.includes("/node_modules/@xyflow/react/")) return "canvas-vendor";
          if (id.includes("/node_modules/framer-motion/")) return "motion-vendor";
          if (id.includes("/node_modules/gsap/") || id.includes("/node_modules/@gsap/react/")) {
            return "gsap-vendor";
          }
          if (id.includes("/node_modules/remotion/") || id.includes("/node_modules/@remotion/player/")) {
            return "remotion-vendor";
          }
          if (id.includes("/node_modules/sonner/")) return "toast-vendor";
        }
      }
    }
  }
}));
