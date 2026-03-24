import { useEffect, useMemo, useRef, useState } from "react";
import type { Route } from "./+types/color-match";
import { buildImageUrl } from "../lib/images";
import { parseArtist } from "../lib/parsing";
import GridCard from "../components/GridCard";
import { getCampaignConfig } from "../lib/campaign.server";
import { uiText, useUiLocale, resolveUiLocale } from "../lib/ui-language";

export function loader() {
  const campaign = getCampaignConfig();
  return { uiLocale: resolveUiLocale(campaign.id) };
}

export function meta({ data }: { data?: { uiLocale?: "sv" | "en" } }) {
  const isEnglish = data?.uiLocale === "en";
  return [
    { title: isEnglish ? "Color Match — Kabinett" : "Färg-match — Kabinett" },
    { name: "description", content: isEnglish ? "Match a camera color with artworks." : "Matcha en färg i kameran med konstverk." },
  ];
}

type MatchItem = {
  id: number;
  title_sv: string | null;
  title_en?: string | null;
  iiif_url: string;
  dominant_color: string | null;
  artists: string | null;
};

function hexToRgb(hex: string) {
  const cleaned = hex.replace("#", "");
  const bigint = parseInt(cleaned, 16);
  return {
    r: (bigint >> 16) & 255,
    g: (bigint >> 8) & 255,
    b: bigint & 255,
  };
}

function rgbToHex(r: number, g: number, b: number) {
  return (
    "#" +
    [r, g, b]
      .map((value) => value.toString(16).padStart(2, "0"))
      .join("")
  );
}

export default function ColorMatch() {
  const uiLocale = useUiLocale();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState("");
  const [matches, setMatches] = useState<MatchItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [color, setColor] = useState<{ r: number; g: number; b: number; hex: string } | null>(null);

  useEffect(() => {
    let active = true;
    async function initCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });
        if (!active) return;
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setStatus("");
      } catch {
        setStatus(uiText(uiLocale, "Kameran kunde inte starta. Välj en färg nedan.", "The camera could not start. Choose a color below."));
      }
    }
    initCamera();
    return () => {
      active = false;
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const palette = useMemo(
    () => ["#C4553A", "#D4CDC3", "#1A2A3A", "#3A1A1A", "#2D3A2D", "#E8987F"],
    []
  );

  async function fetchMatches(r: number, g: number, b: number) {
    setLoading(true);
    try {
      const res = await fetch(`/api/color-search?r=${r}&g=${g}&b=${b}&limit=20`);
      const data = await res.json();
      setMatches(data || []);
    } catch {
      setMatches([]);
    } finally {
      setLoading(false);
    }
  }

  function captureColor() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const width = video.videoWidth;
    const height = video.videoHeight;
    if (!width || !height) return;

    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, width, height);

    const size = 50;
    const sx = Math.max(0, Math.floor(width / 2 - size / 2));
    const sy = Math.max(0, Math.floor(height / 2 - size / 2));
    const imageData = ctx.getImageData(sx, sy, size, size).data;

    let r = 0;
    let g = 0;
    let b = 0;
    const count = imageData.length / 4;
    for (let i = 0; i < imageData.length; i += 4) {
      r += imageData[i] || 0;
      g += imageData[i + 1] || 0;
      b += imageData[i + 2] || 0;
    }
    r = Math.round(r / count);
    g = Math.round(g / count);
    b = Math.round(b / count);

    const hex = rgbToHex(r, g, b);
    setColor({ r, g, b, hex });
    void fetchMatches(r, g, b);
  }

  return (
    <div className="min-h-screen pt-16 bg-white">
      <div className="max-w-[60rem] mx-auto px-4 md:px-6 lg:px-10 pt-8 pb-6">
        <h1 className="text-[32px] text-primary leading-[1.3]">
          {uiText(uiLocale, "Färg-match", "Color match")}
        </h1>
        <p className="mt-1 text-[15px] text-secondary">
          {uiText(uiLocale, "Rikta kameran mot en nyans och hitta konst som matchar.", "Point the camera at a color and find matching art.")}
        </p>

        <div className="mt-6 relative rounded-[1.25rem] overflow-hidden bg-black">
          <video ref={videoRef} playsInline muted className="w-full h-auto block" />
          <div
            className="absolute top-1/2 left-1/2 w-28 h-28 -translate-x-1/2 -translate-y-1/2 border-2 border-[rgba(245,240,232,0.8)] shadow-[0_0_0_999px_rgba(0,0,0,0.2)] pointer-events-none"
          />
          {status && (
            <div
              className="absolute inset-0 flex items-center justify-center text-dark-primary p-8 text-center bg-[rgba(26,24,21,0.75)]"
            >
              {status}
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-3 mt-4 items-center">
          <button
            type="button"
            onClick={captureColor}
            className="py-3 px-6 border-0 bg-primary text-white font-semibold cursor-pointer focus-ring"
          >
            {uiText(uiLocale, "Matcha färg", "Match color")}
          </button>
          {color && (
            <div className="flex items-center gap-2">
              <div
                className="w-6 h-6 border border-rule"
                style={{ background: color.hex }}
              />
              <span className="text-[0.8rem] text-secondary font-mono">{color.hex}</span>
            </div>
          )}
        </div>

        <div className="mt-6">
          <p className="text-[0.85rem] text-secondary">{uiText(uiLocale, "Eller välj en palett:", "Or choose a palette:")}</p>
          <div className="flex gap-[0.6rem] flex-wrap mt-[0.6rem]">
            {palette.map((hex) => (
              <button
                key={hex}
                type="button"
                onClick={() => {
                  const rgb = hexToRgb(hex);
                  setColor({ ...rgb, hex });
                  void fetchMatches(rgb.r, rgb.g, rgb.b);
                }}
                aria-label={uiText(uiLocale, `Välj ${hex}`, `Choose ${hex}`)}
                className="w-11 h-11 border border-[rgba(26,24,21,0.2)] cursor-pointer focus-ring"
                style={{ background: hex }}
              />
            ))}
            <input
              type="color"
              aria-label={uiText(uiLocale, "Välj egen färg", "Choose custom color")}
              onChange={(event) => {
                const hex = event.target.value;
                const rgb = hexToRgb(hex);
                setColor({ ...rgb, hex });
                void fetchMatches(rgb.r, rgb.g, rgb.b);
              }}
              className="w-11 h-11 border-0 bg-transparent p-0 focus-ring"
            />
          </div>
        </div>

        <div className="mt-8">
          <h2 className="text-[1.2rem] font-semibold text-primary">{uiText(uiLocale, "Matchar", "Matches")}</h2>
          {loading && <p className="text-secondary">{uiText(uiLocale, "Letar efter nyanser…", "Searching for matching shades…")}</p>}
          <div className="columns-2 gap-3 md:columns-3 lg:columns-4">
            {matches.map((item) => (
              <GridCard
                key={item.id}
                item={{
                  id: item.id,
                  title: item.title_sv || item.title_en || uiText(uiLocale, "Utan titel", "Untitled"),
                  artist: parseArtist(item.artists),
                  imageUrl: buildImageUrl(item.iiif_url, 400),
                  color: item.dominant_color || "#D4CDC3",
                }}
              />
            ))}
          </div>
        </div>
      </div>
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
