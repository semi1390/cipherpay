import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The @iexec-nox/handle beta ESM package bundles under Vite with no special
// config: it pulls in no Node built-ins and uses Web Crypto (crypto.subtle),
// which is available in the browser on a secure context (localhost / https).
// A real `vite build` was verified to transform it cleanly — so no polyfills,
// no `define`, and no optimizeDeps hacks are required here.
//
// If `npm run dev` ever throws a dep-optimization error on the beta package,
// the one-line fallback is to add:
//   optimizeDeps: { include: ["@iexec-nox/handle"] }
export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
});
