import { spawn } from "node:child_process";

function runPnpmScript(script: string, args: string[] = []): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn("pnpm", ["run", script, ...(args.length > 0 ? ["--", ...args] : [])], {
      stdio: "inherit",
      shell: process.platform === "win32",
    });

    child.on("close", (code, signal) => {
      if (signal) {
        resolve(1);
        return;
      }
      resolve(code ?? 1);
    });

    child.on("error", () => {
      resolve(1);
    });
  });
}

async function main() {
  const targetScript = process.argv[2];
  const forwardArgs = process.argv.slice(3);

  if (!targetScript) {
    console.error("Usage: tsx scripts/run-sync-with-stats-refresh.ts <sync-script> [...args]");
    process.exit(1);
  }

  const syncExitCode = await runPnpmScript(targetScript, forwardArgs);
  if (syncExitCode !== 0) {
    process.exit(syncExitCode);
  }

  console.log("\nSync complete. Refreshing materialized site stats…");
  const refreshExitCode = await runPnpmScript("stats:refresh");
  if (refreshExitCode !== 0) {
    console.warn("Warning: stats refresh failed. Sync data was written successfully.");
  }

  console.log("\nRefreshing related artwork materializations…");
  const relatedExitCode = await runPnpmScript("related:refresh", ["--recent=10000"]);
  if (relatedExitCode !== 0) {
    console.warn("Warning: related refresh failed. Sync data was written successfully.");
  }
}

main().catch((error) => {
  console.error("Failed to run sync wrapper:", error);
  process.exit(1);
});
