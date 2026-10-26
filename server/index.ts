import { serve } from "@hono/node-server";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { PORT, ROOT } from "./env";
import { app, serveDashboard } from "./app";

// npm start passes --dashboard after building the web app; npm run dev leaves
// the dashboard to Vite on port 5173.
const dist = resolve(ROOT, "dist");
const withDashboard = process.argv.includes("--dashboard");
if (withDashboard) {
  if (!existsSync(resolve(dist, "index.html"))) throw new Error("No built dashboard in dist/. Run npm run build first.");
  serveDashboard(dist);
}

// Localhost only: every request this server makes spends your SerpApi searches.
serve({ fetch: app.fetch, port: PORT, hostname: "127.0.0.1" }, ({ port }) => {
  console.log(withDashboard ? `Dashboard on http://localhost:${port}` : `API on http://localhost:${port}`);
  if (!process.env.SERPAPI_API_KEY?.trim()) {
    console.log("SERPAPI_API_KEY isn't set: saved audits open, but new ones can't run. Add it to .env and restart.");
  }
});
