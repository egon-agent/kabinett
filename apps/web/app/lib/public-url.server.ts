function firstHeaderValue(value: string | null): string | null {
  if (!value) return null;
  const first = value.split(",")[0]?.trim();
  return first || null;
}

function parseForwardedHeader(value: string | null): { proto: string | null; host: string | null } {
  if (!value) {
    return { proto: null, host: null };
  }

  const firstPart = value.split(",")[0] || "";
  let proto: string | null = null;
  let host: string | null = null;

  for (const segment of firstPart.split(";")) {
    const [rawKey, rawVal] = segment.split("=", 2);
    const key = rawKey?.trim().toLowerCase();
    const cleanedValue = rawVal?.trim().replace(/^"|"$/g, "") || "";
    if (!key || !cleanedValue) continue;
    if (key === "proto") proto = cleanedValue;
    if (key === "host") host = cleanedValue;
  }

  return { proto, host };
}

export function getPublicOrigin(request: Request): string {
  const url = new URL(request.url);
  const forwarded = parseForwardedHeader(request.headers.get("forwarded"));
  const protocol = firstHeaderValue(request.headers.get("x-forwarded-proto"))
    || forwarded.proto
    || url.protocol.replace(/:$/, "");
  const host = firstHeaderValue(request.headers.get("x-forwarded-host"))
    || forwarded.host
    || request.headers.get("host")
    || url.host;

  return `${protocol}://${host}`;
}

export function getCanonicalUrl(request: Request): string {
  const url = new URL(request.url);
  return `${getPublicOrigin(request)}${url.pathname}`;
}

