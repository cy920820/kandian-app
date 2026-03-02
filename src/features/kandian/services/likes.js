export function createLikesService(storageKey) {
  function getLikes() {
    try {
      const raw = JSON.parse(localStorage.getItem(storageKey) || "[]");
      if (raw.length > 0 && typeof raw[0] === "string") {
        const migrated = raw.map((url) => ({ url, thumb: null }));
        localStorage.setItem(storageKey, JSON.stringify(migrated));
        return migrated;
      }
      return raw;
    } catch {
      return [];
    }
  }

  function saveLikes(arr) {
    localStorage.setItem(storageKey, JSON.stringify(arr));
  }

  function isLiked(url) {
    return getLikes().some((item) => item.url === url);
  }

  function toggleLike({ url, mode, captureThumb }) {
    const likes = getLikes();
    const idx = likes.findIndex((item) => item.url === url);
    if (idx > -1) {
      likes.splice(idx, 1);
      saveLikes(likes);
      return false;
    }

    const thumb = mode === "image" ? url : captureThumb();
    likes.unshift({ url, thumb, type: mode });
    saveLikes(likes);
    return true;
  }

  return {
    getLikes,
    saveLikes,
    isLiked,
    toggleLike
  };
}
