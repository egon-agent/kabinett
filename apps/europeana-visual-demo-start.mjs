import { spawn } from "node:child_process";

const processes = [
  {
    name: "visual-service",
    command: "node",
    args: [
      "/app/apps/europeana-visual-service/node_modules/tsx/dist/cli.mjs",
      "/app/apps/europeana-visual-service/server.ts",
    ],
    env: {
      PORT: "4318",
      HOST: "0.0.0.0",
      DATABASE_PATH: process.env.DATABASE_PATH || "/app/data/europeana-demo.db",
      KABINETT_CLIP_ALLOW_REMOTE: process.env.KABINETT_CLIP_ALLOW_REMOTE || "1",
      EUROPEANA_VISUAL_ALLOWED_ORIGINS: process.env.EUROPEANA_VISUAL_ALLOWED_ORIGINS || "*",
    },
  },
  {
    name: "reference-ui",
    command: "node",
    args: ["/app/apps/europeana-reference-ui/server.mjs"],
    env: {
      PORT: "4320",
      HOST: "0.0.0.0",
      VISUAL_SERVICE_URL: process.env.VISUAL_SERVICE_URL || "http://127.0.0.1:4318",
    },
  },
];

const children = processes.map((processConfig) => {
  const child = spawn(processConfig.command, processConfig.args, {
    env: {
      ...process.env,
      ...processConfig.env,
    },
    stdio: "inherit",
  });

  child.on("exit", (code, signal) => {
    console.error(`[${processConfig.name}] exited`, { code, signal });
    for (const other of children) {
      if (other.pid !== child.pid) other.kill("SIGTERM");
    }
    process.exit(code ?? 1);
  });

  return child;
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    for (const child of children) child.kill(signal);
  });
}
