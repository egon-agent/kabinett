const DEFAULT_SERVICE_URL = "/api";
const DEFAULT_LIMIT = 8;

const state = {
  serviceUrl: DEFAULT_SERVICE_URL,
  activeFlow: "search",
  search: {
    items: [],
    nextCursor: null,
    loading: false,
    lastQuery: "",
  },
  similar: {
    items: [],
    seedRecord: null,
    seedOptions: [],
    nextCursor: null,
    loading: false,
    seedsLoading: false,
    lastRecordId: "",
  },
  color: {
    items: [],
    nextCursor: null,
    loading: false,
    lastHex: "",
  },
};

const cardTemplate = document.querySelector("#result-card-template");

function normalizeServiceUrl(value) {
  return value.trim().replace(/\/+$/, "") || DEFAULT_SERVICE_URL;
}

function getServiceUrl() {
  return normalizeServiceUrl(state.serviceUrl);
}

function setActiveFlow(flow) {
  state.activeFlow = flow;

  document.querySelectorAll("[data-flow-tab]").forEach((button) => {
    const isActive = button.dataset.flowTab === flow;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-selected", String(isActive));
  });

  document.querySelectorAll("[data-flow]").forEach((panel) => {
    panel.classList.toggle("is-active", panel.dataset.flow === flow);
  });

  if (flow === "similar" && state.similar.seedOptions.length === 0) {
    void loadSimilarSeeds();
  }
}

async function requestJson(path, options = {}) {
  const response = await fetch(`${getServiceUrl()}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.message || payload.error || `Request failed with ${response.status}`);
  }

  return payload;
}

async function hydrateItems(items) {
  if (!items.length) return [];

  const hydration = await requestJson("/v1/demo/hydrate", {
    method: "POST",
    body: JSON.stringify({
      recordIds: items.map((item) => item.recordId),
      limit: Math.min(items.length, 24),
    }),
  });

  const records = new Map((hydration.items || []).map((item) => [item.recordId, item]));
  return items.map((item) => ({
    recordId: item.recordId,
    score: item.score,
    ...(records.get(item.recordId) || {
      title: "Untitled",
      provider: null,
      description: null,
      rights: null,
      thumbnailUrl: null,
      europeanaUrl: `https://www.europeana.eu/en/item${item.recordId}`,
      year: null,
      type: null,
    }),
  }));
}

function setStatus(flow, message, isError = false) {
  const statusNode = document.querySelector(`[data-role="${flow}-status"]`);
  if (!statusNode) return;
  statusNode.textContent = message;
  statusNode.style.color = isError ? "#8B2E2F" : "";
}

function setMoreButton(flow, visible) {
  const button = document.querySelector(`[data-role="${flow}-more"]`);
  if (!button) return;
  button.classList.toggle("hidden", !visible);
  button.disabled = false;
}

function renderResults(flow) {
  const container = document.querySelector(`[data-role="${flow}-results"]`);
  if (!container) return;
  container.replaceChildren();

  for (const item of state[flow].items) {
    const fragment = cardTemplate.content.cloneNode(true);
    const link = fragment.querySelector(".result-link");
    const media = fragment.querySelector(".result-media");
    const provider = fragment.querySelector(".result-provider");
    const score = fragment.querySelector(".result-score");
    const title = fragment.querySelector(".result-title");
    const year = fragment.querySelector(".result-year");
    const description = fragment.querySelector(".result-description");
    const rights = fragment.querySelector(".result-rights");
    const record = fragment.querySelector(".result-record");

    link.href = item.europeanaUrl;

    if (item.thumbnailUrl) {
      const image = document.createElement("img");
      image.src = item.thumbnailUrl;
      image.alt = "";
      image.loading = "lazy";
      media.append(image);
    } else {
      const placeholder = document.createElement("div");
      placeholder.className = "result-media-placeholder";
      placeholder.textContent = "No preview";
      media.append(placeholder);
    }

    provider.textContent = item.provider || "Europeana";
    score.textContent = `${Math.round((item.score || 0) * 100)}% match`;
    title.textContent = item.title || "Untitled";
    year.textContent = item.year || item.type || "";
    description.textContent = item.description || "No short description available through the Europeana Search API.";
    rights.textContent = item.rights || "No rights statement";
    record.textContent = item.recordId;

    container.append(fragment);
  }
}

function renderSimilarSeed(record) {
  const container = document.querySelector('[data-role="similar-seed"]');
  if (!container) return;
  container.replaceChildren();
  container.classList.toggle("hidden", !record);
  if (!record) return;

  const label = document.createElement("p");
  label.className = "seed-label";
  label.textContent = "Reference item used for similar works";

  const link = document.createElement("a");
  link.className = "seed-card";
  link.href = record.europeanaUrl;
  link.target = "_blank";
  link.rel = "noreferrer noopener";

  const media = document.createElement("div");
  media.className = "seed-media";
  if (record.thumbnailUrl) {
    const image = document.createElement("img");
    image.src = record.thumbnailUrl;
    image.alt = "";
    image.loading = "lazy";
    media.append(image);
  } else {
    const placeholder = document.createElement("div");
    placeholder.className = "result-media-placeholder";
    placeholder.textContent = "No preview";
    media.append(placeholder);
  }

  const body = document.createElement("div");
  body.className = "seed-body";

  const title = document.createElement("strong");
  title.textContent = record.title || "Untitled";

  const provider = document.createElement("span");
  provider.textContent = record.provider || "Europeana";

  const recordId = document.createElement("code");
  recordId.textContent = record.recordId;

  body.append(title, provider, recordId);
  link.append(media, body);
  container.append(label, link);
}

function renderSimilarSeedOptions() {
  const container = document.querySelector('[data-role="similar-seeds"]');
  if (!container) return;
  container.replaceChildren();

  if (state.similar.seedOptions.length === 0) {
    const empty = document.createElement("p");
    empty.className = "seed-empty";
    empty.textContent = "No reference images loaded yet.";
    container.append(empty);
    return;
  }

  for (const record of state.similar.seedOptions) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "seed-option";
    button.dataset.recordId = record.recordId;
    button.setAttribute("aria-pressed", String(record.recordId === state.similar.lastRecordId));

    const media = document.createElement("span");
    media.className = "seed-option-media";
    if (record.thumbnailUrl) {
      const image = document.createElement("img");
      image.src = record.thumbnailUrl;
      image.alt = "";
      image.loading = "lazy";
      media.append(image);
    } else {
      media.textContent = "No preview";
    }

    const body = document.createElement("span");
    body.className = "seed-option-body";

    const title = document.createElement("strong");
    title.textContent = record.title || "Untitled";

    const provider = document.createElement("span");
    provider.textContent = record.provider || "Europeana";

    body.append(title, provider);
    button.append(media, body);
    container.append(button);
  }
}

async function loadSimilarSeeds() {
  if (state.similar.seedsLoading) return;

  state.similar.seedsLoading = true;
  setStatus("similar", "Loading reference images…");

  try {
    const payload = await requestJson("/v1/demo/seeds?limit=6");
    state.similar.seedOptions = payload.items || [];
    renderSimilarSeedOptions();
    setStatus("similar", "");
  } catch (error) {
    setStatus("similar", error instanceof Error ? error.message : "Could not load reference images.", true);
  } finally {
    state.similar.seedsLoading = false;
  }
}

function mergeResults(flow, items, reset) {
  if (reset) {
    state[flow].items = items;
    return;
  }

  const seen = new Set(state[flow].items.map((item) => item.recordId));
  for (const item of items) {
    if (seen.has(item.recordId)) continue;
    seen.add(item.recordId);
    state[flow].items.push(item);
  }
}

async function runFlow(flow, task, reset) {
  if (state[flow].loading) return;

  state[flow].loading = true;
  setMoreButton(flow, false);
  setStatus(flow, "Loading…");

  try {
    const payload = await task();
    const hydrated = await hydrateItems(payload.items || []);
    mergeResults(flow, hydrated, reset);
    state[flow].nextCursor = payload.nextCursor || null;
    renderResults(flow);

    if (state[flow].items.length === 0) {
      setStatus(flow, "No results right now.");
    } else {
      const suffix = flow === "color"
        ? " Ranked by local dominant-colour distance."
        : "";
      setStatus(flow, `${state[flow].items.length} results loaded.${suffix}`);
    }
    setMoreButton(flow, Boolean(state[flow].nextCursor));
  } catch (error) {
    setStatus(flow, error instanceof Error ? error.message : "Something went wrong.", true);
  } finally {
    state[flow].loading = false;
  }
}

async function runSearch(reset = true) {
  const queryInput = document.querySelector("#search-query");
  const query = queryInput.value.trim();
  if (!query) {
    setStatus("search", "Enter a visual query first.", true);
    return;
  }

  if (reset) {
    state.search.items = [];
    state.search.nextCursor = null;
  }

  state.search.lastQuery = query;
  await runFlow("search", () => requestJson("/v1/visual/search", {
    method: "POST",
    body: JSON.stringify({
      query,
      limit: DEFAULT_LIMIT,
      cursor: reset ? null : state.search.nextCursor,
    }),
  }), reset);
}

async function runSimilar(reset = true, recordIdOverride = null) {
  const recordId = (recordIdOverride ?? state.similar.lastRecordId ?? "").trim();
  if (!recordId) {
    setStatus("similar", "Pick a reference image first.", true);
    return;
  }

  if (reset) {
    state.similar.items = [];
    state.similar.seedRecord = null;
    state.similar.nextCursor = null;
    renderSimilarSeed(null);
  }

  state.similar.lastRecordId = recordId;
  if (reset) {
    setStatus("similar", "Loading reference item…");
    try {
      const seedRecords = await hydrateItems([{ recordId, score: 1 }]);
      state.similar.seedRecord = seedRecords[0] || {
        recordId,
        score: 1,
        title: "Selected Europeana record",
        provider: "Europeana",
        thumbnailUrl: null,
        europeanaUrl: `https://www.europeana.eu/en/item${recordId}`,
      };
    } catch {
      state.similar.seedRecord = {
        recordId,
        score: 1,
        title: "Selected Europeana record",
        provider: "Europeana",
        thumbnailUrl: null,
        europeanaUrl: `https://www.europeana.eu/en/item${recordId}`,
      };
    }
    renderSimilarSeed(state.similar.seedRecord);
    renderSimilarSeedOptions();
  }

  const path = `/v1/visual/similar/${encodeURIComponent(recordId)}?limit=${DEFAULT_LIMIT}${reset || !state.similar.nextCursor ? "" : `&cursor=${encodeURIComponent(state.similar.nextCursor)}`}`;
  await runFlow("similar", () => requestJson(path), reset);
}

async function runColor(reset = true) {
  const colorInput = document.querySelector("#color-hex");
  const hex = colorInput.value.trim();
  if (!hex) {
    setStatus("color", "Enter a hex colour first.", true);
    return;
  }

  if (reset) {
    state.color.items = [];
    state.color.nextCursor = null;
  }

  state.color.lastHex = hex;
  const path = `/v1/visual/color?hex=${encodeURIComponent(hex)}&limit=${DEFAULT_LIMIT}${reset || !state.color.nextCursor ? "" : `&cursor=${encodeURIComponent(state.color.nextCursor)}`}`;
  await runFlow("color", () => requestJson(path), reset);
}

document.querySelector('[data-role="search-form"]').addEventListener("submit", (event) => {
  event.preventDefault();
  void runSearch(true);
});

document.querySelector('[data-role="color-form"]').addEventListener("submit", (event) => {
  event.preventDefault();
  void runColor(true);
});

document.querySelector('[data-role="search-more"]').addEventListener("click", () => {
  void runSearch(false);
});

document.querySelector('[data-role="similar-more"]').addEventListener("click", () => {
  void runSimilar(false);
});

document.querySelector('[data-role="color-more"]').addEventListener("click", () => {
  void runColor(false);
});

document.querySelector('[data-role="search-chips"]').addEventListener("click", (event) => {
  const target = event.target.closest("[data-value]");
  if (!target) return;
  document.querySelector("#search-query").value = target.dataset.value || "";
  void runSearch(true);
});

document.querySelector('[data-role="color-chips"]').addEventListener("click", (event) => {
  const target = event.target.closest("[data-value]");
  if (!target) return;
  document.querySelector("#color-hex").value = target.dataset.value || "";
  void runColor(true);
});

const colorPicker = document.querySelector("#color-picker");
const colorHexInput = document.querySelector("#color-hex");

if (colorPicker && colorHexInput) {
  colorPicker.addEventListener("input", () => {
    colorHexInput.value = colorPicker.value.toUpperCase();
  });

  colorPicker.addEventListener("change", () => {
    colorHexInput.value = colorPicker.value.toUpperCase();
    void runColor(true);
  });

  colorHexInput.addEventListener("input", () => {
    const value = colorHexInput.value.trim();
    if (/^#[0-9a-fA-F]{6}$/.test(value)) {
      colorPicker.value = value.toLowerCase();
    }
  });
}

document.querySelector('[data-role="similar-random"]').addEventListener("click", () => {
  void loadSimilarSeeds();
});

document.querySelector('[data-role="similar-seeds"]').addEventListener("click", (event) => {
  const target = event.target.closest("[data-record-id]");
  if (!target) return;
  void runSimilar(true, target.dataset.recordId || "");
});

document.querySelectorAll("[data-flow-tab]").forEach((button) => {
  button.addEventListener("click", () => {
    setActiveFlow(button.dataset.flowTab || "search");
  });
});

setStatus("search", "");
setStatus("similar", "");
setStatus("color", "");
setActiveFlow("search");
