import { existsSync } from "node:fs";
import { resolve } from "node:path";

export const ROOT = resolve(import.meta.dirname, "..");

// Node 22 reads .env files natively, so no dotenv dependency.
const envFile = resolve(ROOT, ".env");
if (existsSync(envFile)) process.loadEnvFile(envFile);

export const PORT = Number(process.env.PORT ?? 8787);
export const DATA_DIR = resolve(ROOT, "data");

export function requireApiKey(): string {
  const key = process.env.SERPAPI_API_KEY?.trim();
  if (!key) {
    throw new Error("SERPAPI_API_KEY is missing. Copy .env.example to .env and paste your key from serpapi.com/manage-api-key.");
  }
  return key;
}
