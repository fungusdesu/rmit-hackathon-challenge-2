// Runs the app as though TideCloak protects it, with a local simulated realm (see docs/TIDECLOAK_PLAN.md).
// Usage: npm run dev:sim [-- --port 3000]   Cross-platform; values already in the environment win.
import { spawn } from "node:child_process";

const port = process.argv.includes("--port") ? process.argv[process.argv.indexOf("--port") + 1] : "3000";
const defaults = {
  AUTH_MODE: "tidecloak-sim",
  NEXT_PUBLIC_AUTH_MODE: "tidecloak-sim",
  ALLOW_INSECURE_DEV_AUTH: "true",
  APP_ORIGIN: `http://localhost:${port}`,
  DATABASE_URL: "postgresql://businessvault:businessvault@localhost:5432/businessvault",
  S3_ENDPOINT: "http://localhost:9000",
  S3_PUBLIC_ENDPOINT: "http://localhost:9000",
  S3_BUCKET: "businessvault",
  S3_ACCESS_KEY_ID: "businessvault",
  S3_SECRET_ACCESS_KEY: "businessvault-secret",
  S3_REGION: "us-east-1",
};
// The mode switch must win over .env.local (which may hold live Tide settings).
const forced = ["AUTH_MODE", "NEXT_PUBLIC_AUTH_MODE", "ALLOW_INSECURE_DEV_AUTH"];
const env = { ...process.env };
for (const [key, value] of Object.entries(defaults)) if (forced.includes(key) || !env[key]) env[key] = value;

console.log(`Simulated TideCloak: http://localhost:${port}/auth/login`);
const child = spawn("npx", ["next", "dev", "--port", port], { env, stdio: "inherit", shell: process.platform === "win32" });
child.on("exit", code => process.exit(code ?? 0));
