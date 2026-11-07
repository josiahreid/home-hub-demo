import type { NextConfig } from "next";
import { buildInfo } from "./build-info";

// "Today", bin days and synced calendar times are all NZ-local, whatever the host machine's clock says.
// Set before Next starts its workers so they inherit it.
process.env.TZ ||= "Pacific/Auckland";

const nextConfig: NextConfig = {
  // Self-contained server bundle for the Docker image (see Dockerfile / DEPLOY.md)
  output: "standalone",
  // the commit and build time, shown at the bottom of Settings
  env: buildInfo(),
  cacheComponents: true,
  partialPrefetching: true,
  // Section roots open their first sub-tab.
  async redirects() {
    return [
      { source: "/house", destination: "/house/chores", permanent: false },
      { source: "/food", destination: "/food/groceries", permanent: false },
      // Meal prep used to be its own tab
      { source: "/meals", destination: "/food/meal-prep", permanent: false },
      // The Telegram bot moved into the password-protected API tab
      { source: "/settings/api", destination: "/settings/api/akahu", permanent: false },
      { source: "/settings/telegram", destination: "/settings/api/telegram", permanent: false },
    ];
  },
  experimental: {
    // `next upgrade` handles security updates for this app
    agentUpgrade: "security",
    serverActions: {
      // phone photos of receipts and quotes are usually 2–6 MB
      bodySizeLimit: "15mb",
      // Behind Tailscale Serve the page is on https://<name>.<tailnet>.ts.net. Next normally works this out from the
      // forwarded headers; HOME_HUB_ALLOWED_ORIGINS (comma separated) is there in case forms ever get refused.
      allowedOrigins: process.env.HOME_HUB_ALLOWED_ORIGINS?.split(",").map((s) => s.trim()).filter(Boolean),
    },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
