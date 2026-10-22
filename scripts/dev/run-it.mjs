#!/usr/bin/env node
// Cross-platform integration-test runner: sets VAULT_IT=1 and runs vitest.
import { spawn } from "node:child_process";

const child = spawn("npx", ["vitest", "run", ...process.argv.slice(2)], {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: { ...process.env, VAULT_IT: "1" },
});
child.on("exit", (code) => process.exit(code ?? 1));
