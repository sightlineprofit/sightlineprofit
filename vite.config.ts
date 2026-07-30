import { defineConfig, loadEnv } from "vite";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { nitro } from "nitro/vite";

const cloudflareWorkersShim = join(
  dirname(fileURLToPath(import.meta.url)),
  "src/lib/cloudflare-workers-shim.ts",
);

export default defineConfig(({ command, mode }) => {
  const loadedEnv = loadEnv(mode, process.cwd(), "VITE_");
  const envDefine: Record<string, string> = {};
  for (const [key, value] of Object.entries(loadedEnv)) {
    envDefine[`import.meta.env.${key}`] = JSON.stringify(value);
  }

  const isDevBuild = command === "build" && mode === "development";

  return {
    define: envDefine,
    ...(isDevBuild
      ? {
          environments: {
            client: { define: { "process.env.NODE_ENV": JSON.stringify("development") } },
          },
          esbuild: { keepNames: true },
        }
      : {}),
    css: { transformer: "lightningcss" },
    resolve: {
      alias: {
        "@": `${process.cwd()}/src`,
        ...(command === "serve" || mode === "development"
          ? { "cloudflare:workers": cloudflareWorkersShim }
          : {}),
      },
      dedupe: [
        "react",
        "react-dom",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
        "@tanstack/react-query",
        "@tanstack/query-core",
      ],
    },
    optimizeDeps: {
      include: [
        "react",
        "react-dom",
        "react-dom/client",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
      ],
      ignoreOutdatedRequests: true,
    },
    server: { host: "::", port: 8080, strictPort: true },
    ssr: {
      external: ["cloudflare:workers"],
    },
    plugins: [
      {
        name: "external-cloudflare-workers",
        enforce: "pre",
        resolveId(id) {
          if (id === "cloudflare:workers") return { id, external: true };
        },
      },
      tailwindcss(),
      tsConfigPaths({ projects: ["./tsconfig.json"] }),
      tanstackStart({
        server: { entry: "server" },
        importProtection: {
          behavior: "error",
          client: {
            files: ["**/server/**"],
            specifiers: ["server-only"],
          },
        },
      }),
      ...(command === "build"
        ? [
            nitro({
              defaultPreset: "cloudflare-module",
              cloudflare: { deployConfig: true, nodeCompat: true },
            }),
          ]
        : []),
      viteReact(),
    ],
  };
});
