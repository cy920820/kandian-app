export const API_ENDPOINTS = {
  video: "https://api.lolimi.cn/API/xjj/xjj",
  image: "https://api.lolimi.cn/API/meizi/api"
};

export const APP_CONFIG = {
  storageKey: "xjj_likes",
  thumbWidth: 135,
  thumbHeight: 240,
  thumbQuality: 0.55,
  maxRetry: 5,
  videoPreloadCount: 5,
  imagePreloadCount: 2,
  preloadParallel: 3,
  preloadKeepAliveMs: 25000,
  preloadFetchAttempts: 18,
  preloadRecheckMs: 420,
  swipeThreshold: 42,
  swipeCommitRatio: 0.18,
  swipeVelocityThreshold: 0.5,
  swipeSettleDuration: 220,
  swipeEnterDuration: 260,
  touchNavCooldown: 280,
  downloadMaxRetry: 2,
  downloadRetryDelay: 700,
  wheelIdle: 90,
  wheelCooldown: 420
};
