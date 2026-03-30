import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const MODEL_ID = process.env.KABINETT_CLIP_MODEL_ID || "Xenova/clip-vit-base-patch32";
const REVISION = process.env.KABINETT_CLIP_MODEL_REVISION || "main";
const OUTPUT_DIR = process.env.KABINETT_CLIP_MODEL_OUTPUT_DIR || "models";
const DRY_RUN = process.argv.includes("--dry-run");

const REQUIRED_FILES = [
  "config.json",
  "tokenizer.json",
  "tokenizer_config.json",
  "onnx/text_model.onnx",
];

const OPTIONAL_FILES = [
  "special_tokens_map.json",
];

function buildUrl(file) {
  return `https://huggingface.co/${MODEL_ID}/resolve/${REVISION}/${file}`;
}

function buildDestination(file) {
  return join(OUTPUT_DIR, MODEL_ID, file);
}

async function downloadFile(file, required) {
  const url = buildUrl(file);
  const destination = buildDestination(file);

  if (DRY_RUN) {
    console.log(`[clip-model] dry-run ${url} -> ${destination}`);
    return;
  }

  const response = await fetch(url);
  if (!response.ok) {
    if (!required && response.status === 404) {
      console.log(`[clip-model] skip optional ${file} (${response.status})`);
      return;
    }
    throw new Error(`Could not download ${file}: ${response.status} ${response.statusText}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, buffer);
  console.log(`[clip-model] saved ${file}`);
}

async function main() {
  for (const file of REQUIRED_FILES) {
    await downloadFile(file, true);
  }

  for (const file of OPTIONAL_FILES) {
    await downloadFile(file, false);
  }
}

main().catch((error) => {
  console.error("[clip-model] prefetch failed:", error);
  process.exitCode = 1;
});
