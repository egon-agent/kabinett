import sharp from "sharp";
import https from "https";
import http from "http";
import fs from "fs";
import path from "path";

const SCRIPT_DIR = path.dirname(new URL(import.meta.url).pathname);
const OUT_DIR = path.resolve(SCRIPT_DIR, "..", "..", "apps", "web", "public");

const WIDTH = 1200;
const HEIGHT = 630;
const BG_COLOR = "#1a1a1a";
const TEXT_BAR_HEIGHT = 90;
const IMAGE_AREA_HEIGHT = HEIGHT - TEXT_BAR_HEIGHT;
const PANEL_WIDTH = Math.floor(WIDTH / 3);
const GAP = 4; // thin dark gap between panels

const museums = [
  {
    slug: "nm",
    label: "Kabinett × Nationalmuseum",
    subtitle: "74 000 verk — sökbara med egna ord",
    images: [
      "https://nationalmuseumse.iiifhosting.com/iiif/efa2ecd781a47da6ed73e7242ea8d5900a15a307507f8148aa904b799cd87706/full/400,/0/default.jpg", // Badande kullor, Zorn
      "https://nationalmuseumse.iiifhosting.com/iiif/67dbf1115ecb3742b455dd412c14ba39eca65ee0795046827f541ac912a3bf04/full/400,/0/default.jpg", // Midvinterblot, Carl Larsson
      "https://nationalmuseumse.iiifhosting.com/iiif/cfa32ea59d6190c9a33de0b3fc5a9407795d31fd9ad06875bcb234ec6f00b7b1/full/400,/0/default.jpg", // Havsörnar, Liljefors
    ],
  },
  {
    slug: "nordiska",
    label: "Kabinett × Nordiska museet",
    subtitle: "286 000 föremål — sökbara med egna ord",
    images: [
      "https://ems.dimu.org/image/012s8YsxvrTv?dimension=800x800", // Dalahästar
      "https://ems.dimu.org/image/032s8YzTU2V5?dimension=800x800",   // Kvinna i samisk dräkt, handkolorerat
      "https://ems.dimu.org/image/013AkPV4pH9X?dimension=800x800", // Samisk trumma
    ],
  },
  {
    slug: "default",
    label: "Kabinett",
    subtitle: "Utforska Sveriges kulturarv — sökbart med egna ord",
    images: [
      "https://ems.dimu.org/image/032s8YeoNYdm?dimension=800x800", // Samisk brudkrona (Nordiska)
      "https://media.samlingar.shm.se/item/4D3DD953-74AD-4395-BA98-DA543367CDC7/medium",   // Takmålning Perseus/Andromeda, Hallwylska (SHM)
      "https://media.samlingar.shm.se/item/FDFB3195-08A4-4521-81BD-0A79B31BD844/medium",   // Elisabeth av Ryssland till häst, Hallwylska (SHM)
    ],
  },
  {
    slug: "shm",
    label: "Kabinett × Statens historiska museer",
    subtitle: "799 000 objekt — sökbara med egna ord",
    images: [
      "https://media.samlingar.shm.se/item/CBC9E395-786A-4014-B055-2B3D77631403/medium",   // Kronan
      "https://media.samlingar.shm.se/item/3976bdfb-e64f-487e-8b1b-bacd6e314989/medium",   // Hertig Karls dräkt, Dianas fest 1778
      "https://media.samlingar.shm.se/item/508964F2-A58B-4992-B777-13630F93E508/medium",   // Erik XIVs visirhjälm, paradrustning
    ],
  },
];

function fetchImage(url) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith("https") ? https : http;
    proto.get(url, { headers: { "User-Agent": "Kabinett/1.0" } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchImage(res.headers.location).then(resolve, reject);
      }
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks)));
      res.on("error", reject);
    }).on("error", reject);
  });
}

function escapeXml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function createTextBar(label, subtitle) {
  const svg = `
  <svg width="${WIDTH}" height="${TEXT_BAR_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${WIDTH}" height="${TEXT_BAR_HEIGHT}" fill="${BG_COLOR}" />
    <text x="40" y="38" font-family="system-ui, -apple-system, Helvetica, Arial, sans-serif" font-size="30" font-weight="700" fill="white" letter-spacing="0.5">
      ${escapeXml(label)}
    </text>
    <text x="40" y="68" font-family="system-ui, -apple-system, Helvetica, Arial, sans-serif" font-size="18" font-weight="400" fill="rgba(255,255,255,0.7)">
      ${escapeXml(subtitle)}
    </text>
  </svg>`;
  return Buffer.from(svg);
}

async function generate(museum) {
  console.log(`Generating ${museum.slug}...`);

  // Download and resize each panel
  const panelW = PANEL_WIDTH - GAP;
  const panels = [];
  for (const url of museum.images) {
    const buf = await fetchImage(url);
    console.log(`  Downloaded ${(buf.length / 1024).toFixed(0)} KB`);
    // Slight overcrop (10%) to remove any visible frames/borders
    const meta = await sharp(buf).metadata();
    const cropPct = url.includes("dimu.org") ? 0.20 : 0.10;
    const cx = Math.round(meta.width * cropPct / 2);
    const cy = Math.round(meta.height * cropPct / 2);
    const cw = meta.width - cx * 2;
    const ch = meta.height - cy * 2;
    let pos = "attention";
    if (url.includes("CBC9E395")) pos = "centre"; // center crown
    if (url.includes("3AkPV4pH9X")) pos = "top"; // trumma even higher
    const panel = await sharp(buf)
      .extract({ left: cx, top: cy, width: cw, height: ch })
      .resize(panelW, IMAGE_AREA_HEIGHT, { fit: "cover", position: pos })
      .toBuffer();
    panels.push(panel);
  }

  // Create text bar
  const textBarSvg = createTextBar(museum.label, museum.subtitle);
  const textBarPng = await sharp(textBarSvg).png().toBuffer();

  // Compose: dark canvas + 3 panels side by side + text bar
  const final = await sharp({
    create: {
      width: WIDTH,
      height: HEIGHT,
      channels: 3,
      background: BG_COLOR,
    },
  })
    .composite([
      { input: panels[0], top: 0, left: 0 },
      { input: panels[1], top: 0, left: PANEL_WIDTH },
      { input: panels[2], top: 0, left: PANEL_WIDTH * 2 },
      { input: textBarPng, top: IMAGE_AREA_HEIGHT, left: 0 },
    ])
    .jpeg({ quality: 90 })
    .toBuffer();

  const outPath = path.join(OUT_DIR, `og-${museum.slug}.jpg`);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(outPath, final);
  console.log(`  ✓ ${outPath} (${(final.length / 1024).toFixed(0)} KB)`);
}

for (const m of museums) {
  await generate(m);
}
console.log("\nDone!");
