export async function fetchVideoUrl({ endpoint, maxRetry, retries = 0 }) {
  if (retries >= maxRetry) throw new Error("Max retries");

  try {
    const resp = await fetch(endpoint, { redirect: "follow" });
    const url = resp.url;
    const ct = resp.headers.get("content-type") || "";

    resp.body?.cancel().catch(() => {});

    if (!url || url === endpoint) return fetchVideoUrl({ endpoint, maxRetry, retries: retries + 1 });
    if (ct.includes("xml") || ct.includes("html")) {
      return fetchVideoUrl({ endpoint, maxRetry, retries: retries + 1 });
    }
    if (!new URL(url).pathname.endsWith(".mp4")) {
      return fetchVideoUrl({ endpoint, maxRetry, retries: retries + 1 });
    }

    return url;
  } catch {
    await new Promise((r) => setTimeout(r, 300 + retries * 200));
    return fetchVideoUrl({ endpoint, maxRetry, retries: retries + 1 });
  }
}

export async function fetchImageUrl({ endpoint, maxRetry, retries = 0 }) {
  if (retries >= maxRetry) throw new Error("Max retries");

  try {
    const resp = await fetch(endpoint);
    const json = await resp.json();
    if (json.code !== 1 || !json.text) {
      return fetchImageUrl({ endpoint, maxRetry, retries: retries + 1 });
    }
    return json.text;
  } catch {
    await new Promise((r) => setTimeout(r, 300 + retries * 200));
    return fetchImageUrl({ endpoint, maxRetry, retries: retries + 1 });
  }
}
