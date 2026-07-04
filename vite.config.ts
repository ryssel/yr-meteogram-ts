import { defineConfig, loadEnv } from "vite";

// MET Norway's Locationforecast API requires a descriptive User-Agent header
// identifying your application, and will return 403 without one. Browsers
// won't let client-side JS set a custom User-Agent, so the dev server proxies
// the request and attaches it server-side instead.
//
// The actual value comes from MET_USER_AGENT in a local, git-ignored .env
// file (see .env.example for the format) — this keeps personal contact info
// like your email out of source control and out of the git history.
// Docs: https://api.met.no/doc/TermsOfService

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const userAgent = env.MET_USER_AGENT;

  if (!userAgent) {
    console.warn(
      "\n⚠️  MET_USER_AGENT is not set. Copy .env.example to .env and fill in your own contact info,\n" +
        "   or requests to MET Norway's API will be rejected with 403 Forbidden.\n"
    );
  }

  return {
    server: {
      proxy: {
        "/api/forecast": {
          target: "https://api.met.no",
          changeOrigin: true,
          rewrite: (path) =>
            path.replace(/^\/api\/forecast/, "/weatherapi/locationforecast/2.0/complete"),
          configure: (proxy) => {
            proxy.on("proxyReq", (proxyReq) => {
              proxyReq.setHeader("User-Agent", userAgent ?? "yr-meteogram-ts (missing MET_USER_AGENT)");
            });
          },
        },
      },
    },
  };
});
