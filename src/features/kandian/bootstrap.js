import { APP_CONFIG, API_ENDPOINTS } from "./constants.js";
import { fetchVideoUrl, fetchImageUrl } from "./services/api.js";
import { createLikesService } from "./services/likes.js";

export function initKandianApp() {

  /* ── DOM refs ── */
  const $loader    = document.getElementById('loader');
  const $stage     = document.getElementById('stage');
  const $stageGhost= document.getElementById('stage-ghost');
  const $player    = document.getElementById('player');
  const $progress  = document.getElementById('progress-fill');
  const $btnLike   = document.getElementById('btn-like');
  const $btnMute   = document.getElementById('btn-mute');
  const $btnDownload = document.getElementById('btn-download');
  const $icoMuted  = document.getElementById('ico-muted');
  const $icoUnmuted= document.getElementById('ico-unmuted');
  const $muteLabel = document.getElementById('mute-label');
  const $muteToast = document.getElementById('mute-toast');
  const $muteToastT= document.getElementById('mute-toast-text');
  const $downloadToast = document.getElementById('download-toast');
  const $downloadToastT = document.getElementById('download-toast-text');
  const $trans     = document.getElementById('transition');
  const $errToast  = document.getElementById('error-toast');
  const $pauseToast= document.getElementById('pause-toast');
  const $icoPause  = document.getElementById('ico-pause');
  const $icoPlay   = document.getElementById('ico-play');
  const $favOverlay= document.getElementById('fav-overlay');
  const $favPanel  = document.getElementById('fav-panel');
  const $favList   = document.getElementById('fav-list');
  const $favCount  = document.getElementById('fav-count');
  const $favClose  = document.getElementById('fav-close');
  const $navHome   = document.getElementById('nav-home');
  const $navFav    = document.getElementById('nav-fav');
  const $navImg    = document.getElementById('nav-img');
  const $imgPlayer = document.getElementById('img-player');
  const $progressBar = document.getElementById('progress-bar');

  const _thumbCanvas = document.createElement('canvas');
  _thumbCanvas.width = APP_CONFIG.thumbWidth;
  _thumbCanvas.height = APP_CONFIG.thumbHeight;
  const _thumbCtx = _thumbCanvas.getContext('2d');
  const _ghostCanvas = document.createElement('canvas');
  const _ghostCtx = _ghostCanvas.getContext('2d');
  const canHover = window.matchMedia('(hover:hover) and (pointer:fine)').matches;
  const likesService = createLikesService(APP_CONFIG.storageKey);

  /* ── State ── */
  let history = [];
  let currentIdx = -1;
  let preloaded = [];
  const preloadedSet = new Set();
  const pendingPreloadSet = new Set();
  const warmVideoPool = new Map();
  let videoPreloadWorkers = 0;
  // 约定：Web 默认静音；App 端默认有声
  let isMuted = !(typeof window !== 'undefined' && !!window.__TAURI_INTERNALS__?.invoke);
  let isLoading = false;
  let isSwiping = false;
  let touchAxis = null;
  let touchStartX = 0;
  let touchStartY = 0;
  let touchMoveX = 0;
  let touchMoveY = 0;
  let lastTouchMoveY = 0;
  let lastTouchMoveTime = 0;
  let hasTouchDragged = false;
  let tapSuppressUntil = 0;
  let swipeAnimating = false;
  let isDownloading = false;
  let lastTouchNav = 0;
  let muteToastTimer = null;
  let downloadToastTimer = null;
  let errToastTimer = null;
  let mode = 'video';
  let imgHistory = [];
  let imgCurrentIdx = -1;
  let imgPreloaded = [];
  let preloadTicker = null;
  const videoBufferingReasons = new Set();
  let bufferingShowTimer = null;

  /* ── Likes Storage ── */
  const getLikes = likesService.getLikes;
  const saveLikes = likesService.saveLikes;
  const isLiked = likesService.isLiked;

  function captureThumb() {
    try {
      if (!$player.videoWidth) return null;
      _thumbCtx.drawImage($player, 0, 0, APP_CONFIG.thumbWidth, APP_CONFIG.thumbHeight);
      return _thumbCanvas.toDataURL('image/jpeg', APP_CONFIG.thumbQuality);
    } catch { return null; }
  }

  function toggleLike(url) {
    return likesService.toggleLike({ url, mode, captureThumb });
  }

  function requestVideoUrl() {
    return fetchVideoUrl({
      endpoint: API_ENDPOINTS.video,
      maxRetry: APP_CONFIG.maxRetry
    });
  }

  function requestImageUrl() {
    return fetchImageUrl({
      endpoint: API_ENDPOINTS.image,
      maxRetry: APP_CONFIG.maxRetry
    });
  }

  /* ── Preloader ── */
  function releaseWarmVideo(url) {
    const entry = warmVideoPool.get(url);
    if (!entry) return;
    clearTimeout(entry.timer);
    entry.el.src = '';
    entry.el.load();
    warmVideoPool.delete(url);
  }

  function preloadVideo(url) {
    releaseWarmVideo(url);
    const v = document.createElement('video');
    v.preload = 'auto'; v.muted = true; v.crossOrigin = 'anonymous';
    v.src = url; v.load();
    const timer = setTimeout(() => releaseWarmVideo(url), APP_CONFIG.preloadKeepAliveMs);
    warmVideoPool.set(url, { el: v, timer });
    while (warmVideoPool.size > APP_CONFIG.videoPreloadCount + 2) {
      const oldest = warmVideoPool.keys().next().value;
      if (!oldest || oldest === url) break;
      releaseWarmVideo(oldest);
    }
  }

  function dequeuePreloadedVideo() {
    const nextUrl = preloaded.shift();
    if (!nextUrl) return null;
    preloadedSet.delete(nextUrl);
    pendingPreloadSet.delete(nextUrl);
    return nextUrl;
  }

  function consumePreloadedVideo(url) {
    if (!url) return;
    const i = preloaded.indexOf(url);
    if (i > -1) preloaded.splice(i, 1);
    preloadedSet.delete(url);
    pendingPreloadSet.delete(url);
  }

  function consumePreloadedImage(url) {
    if (!url) return;
    const i = imgPreloaded.indexOf(url);
    if (i > -1) imgPreloaded.splice(i, 1);
  }

  async function fillVideoPreloadSlot() {
    const recentUrls = history.slice(-8);
    for (let i = 0; i < APP_CONFIG.preloadFetchAttempts; i++) {
      const url = await requestVideoUrl();
      if (!url) continue;
      if (preloadedSet.has(url) || pendingPreloadSet.has(url) || recentUrls.includes(url)) continue;
      pendingPreloadSet.add(url);
      preloaded.push(url);
      preloadedSet.add(url);
      preloadVideo(url);
      pendingPreloadSet.delete(url);
      return true;
    }
    return false;
  }

  function ensurePreloaded() {
    const target = APP_CONFIG.videoPreloadCount;
    while (
      preloaded.length + videoPreloadWorkers < target &&
      videoPreloadWorkers < APP_CONFIG.preloadParallel
    ) {
      videoPreloadWorkers++;
      fillVideoPreloadSlot()
        .catch(() => false)
        .finally(() => {
          videoPreloadWorkers--;
          if (preloaded.length < target) {
            setTimeout(() => ensurePreloaded(), APP_CONFIG.preloadRecheckMs);
          }
        });
    }
  }

  async function ensureImgPreloaded() {
    while (imgPreloaded.length < APP_CONFIG.imagePreloadCount) {
      try {
        const url = await requestImageUrl();
        if (!imgPreloaded.includes(url) && !imgHistory.slice(-5).includes(url)) {
          imgPreloaded.push(url);
          const img = new Image(); img.src = url;
        }
      } catch { break; }
    }
  }

  function normalizeTransitionOptions(options) {
    if (typeof options === 'boolean') return { skipTransition: options };
    return options || {};
  }

  function setStagePose({ x = 0, y = 0, scale = 1, opacity = 1, progress = 0, transition = '' } = {}) {
    if (transition) $stage.style.transition = transition;
    else $stage.style.removeProperty('transition');
    $stage.style.setProperty('--stage-dx', `${x}px`);
    $stage.style.setProperty('--stage-dy', `${y}px`);
    $stage.style.setProperty('--stage-scale', scale.toFixed(4));
    $stage.style.setProperty('--stage-opacity', opacity.toFixed(4));
    $stage.style.setProperty('--swipe-progress', String(Math.max(0, Math.min(1, progress))));
  }

  function resetStagePose() {
    $stage.classList.remove('is-dragging');
    setStagePose({ x: 0, y: 0, scale: 1, opacity: 1, progress: 0, transition: '' });
  }

  function setBufferingState(buffering) {
    if (!$progressBar) return;
    clearTimeout(bufferingShowTimer);
    if (buffering) {
      bufferingShowTimer = setTimeout(() => {
        $progressBar.classList.add('buffering');
      }, 120);
      return;
    }
    $progressBar.classList.remove('buffering');
  }

  function syncVideoBuffering() {
    setBufferingState(mode === 'video' && videoBufferingReasons.size > 0);
  }

  function setVideoBuffering(reason, buffering) {
    if (!reason) return;
    if (buffering) videoBufferingReasons.add(reason);
    else videoBufferingReasons.delete(reason);
    syncVideoBuffering();
  }

  function setGhostPose({ y = 0, opacity = 1, transition = '' } = {}) {
    if (!$stageGhost) return;
    if (transition) $stageGhost.style.transition = transition;
    else $stageGhost.style.removeProperty('transition');
    $stageGhost.style.setProperty('--ghost-dy', `${y}px`);
    $stageGhost.style.setProperty('--ghost-opacity', opacity.toFixed(4));
  }

  function captureVideoGhostFrame() {
    try {
      if (!$player.videoWidth || !$player.videoHeight || $player.readyState < 2) return null;
      const maxW = 960;
      const w = Math.min(maxW, $player.videoWidth);
      const h = Math.max(1, Math.round((w * $player.videoHeight) / $player.videoWidth));
      _ghostCanvas.width = w;
      _ghostCanvas.height = h;
      _ghostCtx.clearRect(0, 0, w, h);
      _ghostCtx.drawImage($player, 0, 0, w, h);
      return _ghostCanvas.toDataURL('image/jpeg', 0.86);
    } catch {
      return null;
    }
  }

  function showStageGhost() {
    if (!$stageGhost) return false;
    let source = null;
    let contain = false;
    if (mode === 'video') source = captureVideoGhostFrame();
    if (!source && $imgPlayer?.src) {
      source = $imgPlayer.currentSrc || $imgPlayer.src;
      contain = true;
    }
    if (!source) return false;
    $stageGhost.classList.toggle('contain', contain);
    $stageGhost.style.backgroundImage = `url("${String(source).replace(/"/g, '%22')}")`;
    $stageGhost.classList.add('active');
    setGhostPose({ y: 0, opacity: 1, transition: 'none' });
    return true;
  }

  function hideStageGhost() {
    if (!$stageGhost) return;
    $stageGhost.classList.remove('active', 'contain');
    $stageGhost.style.removeProperty('background-image');
    $stageGhost.style.removeProperty('transition');
    $stageGhost.style.setProperty('--ghost-dy', '0px');
    $stageGhost.style.setProperty('--ghost-opacity', '1');
  }

  function canNavigateDirection(direction) {
    if (mode === 'image') {
      if (direction === 'prev') return imgCurrentIdx > 0;
      return true;
    }
    if (direction === 'prev') return currentIdx > 0;
    return true;
  }

  function dampDistance(raw, limit) {
    const abs = Math.abs(raw);
    const clamped = Math.min(abs, limit);
    const beyond = Math.max(0, abs - limit);
    const eased = clamped * 0.82 + beyond * 0.12;
    return Math.sign(raw) * eased;
  }

  /* ── Play URL ── */
  async function playUrl(url, options) {
    const { skipTransition = false, transitionStyle = 'fade', showLoader = false } = normalizeTransitionOptions(options);
    if (isLoading) return;
    isLoading = true;
    if (showLoader) setVideoBuffering('switch', true);
    showPauseToast(false);
    if (!skipTransition) { $trans.classList.add('active'); await sleep(150); }
    return new Promise((resolve) => {
      if (transitionStyle === 'fade') $player.classList.add('fade-out');
      // 用 loadeddata 替代 canplay：有首帧即可展示，不必等大量缓冲
      const onReady = () => {
        $player.removeEventListener('loadeddata', onReady);
        $player.removeEventListener('error', onError);
        if (transitionStyle === 'fade') $player.classList.remove('fade-out');
        $player.muted = isMuted;
        $player.play().catch(() => {});
        $loader.classList.add('hidden');
        setVideoBuffering('switch', false);
        $trans.classList.remove('active');
        updateLikeBtn();
        isLoading = false;
        resolve(true);
      };
      const onError = async () => {
        $player.removeEventListener('loadeddata', onReady);
        $player.removeEventListener('error', onError);
        showErrorToast();
        setVideoBuffering('switch', false);
        isLoading = false;
        await goNext();
        resolve(false);
      };
      $player.addEventListener('loadeddata', onReady, { once: true });
      $player.addEventListener('error', onError, { once: true });
      $player.src = url; $player.load();
    });
  }

  /* ── Show Image ── */
  async function showImage(url, options) {
    const { skipTransition = false, transitionStyle = 'fade' } = normalizeTransitionOptions(options);
    if (isLoading) return;
    isLoading = true;
    if (!skipTransition) { $trans.classList.add('active'); await sleep(150); }
    return new Promise((resolve) => {
      if (transitionStyle === 'fade') $imgPlayer.classList.add('fade-out');
      const onLoad = () => {
        $imgPlayer.removeEventListener('load', onLoad);
        $imgPlayer.removeEventListener('error', onError);
        if (transitionStyle === 'fade') $imgPlayer.classList.remove('fade-out');
        $loader.classList.add('hidden');
        $trans.classList.remove('active');
        updateLikeBtn();
        isLoading = false;
        resolve(true);
      };
      const onError = async () => {
        $imgPlayer.removeEventListener('load', onLoad);
        $imgPlayer.removeEventListener('error', onError);
        showErrorToast();
        isLoading = false;
        await goNextImage();
        resolve(false);
      };
      $imgPlayer.addEventListener('load', onLoad, { once: true });
      $imgPlayer.addEventListener('error', onError, { once: true });
      $imgPlayer.src = url;
    });
  }

  /* ── Navigation ── */
  async function goNext(options) {
    if (isLoading) return false;
    if (currentIdx < history.length - 1) {
      currentIdx++;
      return await playUrl(history[currentIdx], options);
    }
    let url;
    if (preloaded.length > 0) { url = dequeuePreloadedVideo(); }
    else { try { url = await requestVideoUrl(); } catch { showErrorToast(); return false; } }
    history.push(url);
    currentIdx = history.length - 1;
    const played = await playUrl(url, options);
    if (played) releaseWarmVideo(url);
    ensurePreloaded();
    return played;
  }

  async function goPrev(options) {
    if (isLoading || currentIdx <= 0) return false;
    currentIdx--;
    return await playUrl(history[currentIdx], options);
  }

  /* ── Image Navigation ── */
  function getCurrentUrl() {
    return mode === 'image' ? imgHistory[imgCurrentIdx] : history[currentIdx];
  }

  async function goNextImage(options) {
    if (isLoading) return false;
    if (imgCurrentIdx < imgHistory.length - 1) {
      imgCurrentIdx++;
      return await showImage(imgHistory[imgCurrentIdx], options);
    }
    let url;
    if (imgPreloaded.length > 0) { url = imgPreloaded.shift(); }
    else { try { url = await requestImageUrl(); } catch { showErrorToast(); return false; } }
    imgHistory.push(url);
    imgCurrentIdx = imgHistory.length - 1;
    const shown = await showImage(url, options);
    ensureImgPreloaded();
    return shown;
  }

  async function goPrevImage(options) {
    if (isLoading || imgCurrentIdx <= 0) return false;
    imgCurrentIdx--;
    return await showImage(imgHistory[imgCurrentIdx], options);
  }

  async function resolveDirectionalTarget(direction) {
    if (mode === 'image') {
      if (direction === 'prev') {
        if (imgCurrentIdx <= 0) return null;
        return {
          mode: 'image',
          direction,
          source: 'history',
          url: imgHistory[imgCurrentIdx - 1],
          idx: imgCurrentIdx - 1
        };
      }
      if (imgCurrentIdx < imgHistory.length - 1) {
        return {
          mode: 'image',
          direction,
          source: 'history',
          url: imgHistory[imgCurrentIdx + 1],
          idx: imgCurrentIdx + 1
        };
      }
      if (imgPreloaded.length > 0) {
        return {
          mode: 'image',
          direction,
          source: 'preloaded',
          url: imgPreloaded[0]
        };
      }
      return {
        mode: 'image',
        direction,
        source: 'fresh',
        url: null
      };
    }

    if (direction === 'prev') {
      if (currentIdx <= 0) return null;
      return {
        mode: 'video',
        direction,
        source: 'history',
        url: history[currentIdx - 1],
        idx: currentIdx - 1
      };
    }
    if (currentIdx < history.length - 1) {
      return {
        mode: 'video',
        direction,
        source: 'history',
        url: history[currentIdx + 1],
        idx: currentIdx + 1
      };
    }
    if (preloaded.length > 0) {
      return {
        mode: 'video',
        direction,
        source: 'preloaded',
        url: preloaded[0]
      };
    }
    return {
      mode: 'video',
      direction,
      source: 'fresh',
      url: null
    };
  }

  async function applyDirectionalTarget(target, options) {
    if (!target) return false;
    if (!target.url) {
      try {
        target.url = target.mode === 'image' ? await requestImageUrl() : await requestVideoUrl();
      } catch {
        showErrorToast();
        return false;
      }
    }
    if (target.mode === 'image') {
      if (target.source === 'history') {
        imgCurrentIdx = target.idx;
      } else {
        if (target.source === 'preloaded') consumePreloadedImage(target.url);
        imgHistory.push(target.url);
        imgCurrentIdx = imgHistory.length - 1;
      }
      const shown = await showImage(target.url, options);
      if (shown && target.source !== 'history') ensureImgPreloaded();
      return shown;
    }

    if (target.source === 'history') {
      currentIdx = target.idx;
    } else {
      if (target.source === 'preloaded') consumePreloadedVideo(target.url);
      history.push(target.url);
      currentIdx = history.length - 1;
    }
    const played = await playUrl(target.url, options);
    if (played && target.source !== 'history') {
      releaseWarmVideo(target.url);
      ensurePreloaded();
    }
    return played;
  }

  async function animateDirectionalNav(direction) {
    if (swipeAnimating || isLoading) return false;
    if (!canNavigateDirection(direction)) return false;
    swipeAnimating = true;
    let target = null;
    let applyPromise = null;
    const directionSign = direction === 'next' ? -1 : 1;
    const pageOffset = Math.round(window.innerHeight + 24);
    const exitOffset = pageOffset * directionSign;
    const enterOffset = -exitOffset;
    try {
      try {
        target = await resolveDirectionalTarget(direction);
      } catch {
        showErrorToast();
        return false;
      }
      if (!target) return false;

      const hasGhost = showStageGhost();
      $stage.classList.remove('is-dragging');
      setStagePose({
        y: enterOffset,
        scale: 1,
        opacity: 1,
        progress: 1,
        transition: 'none'
      });
      const likelySlow = target.source !== 'history';
      applyPromise = applyDirectionalTarget(target, {
        skipTransition: true,
        transitionStyle: 'swipe',
        showLoader: target.mode === 'video' && likelySlow
      });
      requestAnimationFrame(() => {
        if (hasGhost) {
          setGhostPose({
            y: exitOffset,
            opacity: 1,
            transition: `transform ${APP_CONFIG.swipeSettleDuration}ms cubic-bezier(.22,.61,.36,1), opacity ${APP_CONFIG.swipeSettleDuration}ms linear`
          });
        }
        setStagePose({
          y: 0,
          scale: 1,
          opacity: 1,
          progress: 0,
          transition: `transform ${APP_CONFIG.swipeEnterDuration}ms cubic-bezier(.22,.61,.36,1), opacity ${Math.max(140, APP_CONFIG.swipeEnterDuration - 40)}ms linear`
        });
      });
      await sleep(Math.max(APP_CONFIG.swipeSettleDuration, APP_CONFIG.swipeEnterDuration));
      if (hasGhost) hideStageGhost();

      const ok = await applyPromise;
      if (!ok) {
        resetStagePose();
        return false;
      }
      resetStagePose();
      return true;
    } finally {
      hideStageGhost();
      swipeAnimating = false;
    }
  }

  function switchMode(newMode) {
    if (mode === newMode) return;
    const prevMode = mode;
    resetStagePose();
    mode = newMode;
    if (newMode !== 'video') videoBufferingReasons.clear();
    syncVideoBuffering();
    if (newMode === 'video') {
      $player.style.display = '';
      $imgPlayer.classList.remove('active');
      $imgPlayer.classList.remove('fade-out');
      $btnMute.style.display = '';
      $progressBar.style.display = '';
      if (history[currentIdx] && prevMode !== 'image') $player.play().catch(() => {});
      if (prevMode === 'image') showPauseToast(true);
      else showPauseToast($player.paused && !$player.ended);
    } else {
      $player.pause();
      $player.style.display = 'none';
      $imgPlayer.classList.add('active');
      $btnMute.style.display = 'none';
      $progressBar.style.display = 'none';
      // 图片模式不显示播放提示，回到视频模式再提示
      showPauseToast(false);
      if (imgHistory.length === 0) {
        // 首次进入图片模式先保持透明，避免未加载图片时出现瞬时白边/占位闪烁
        $imgPlayer.classList.add('fade-out');
        loadFirstImage();
      } else {
        $imgPlayer.classList.remove('fade-out');
      }
    }
    updateLikeBtn();
  }

  async function loadFirstImage() {
    try {
      const url = await requestImageUrl();
      imgHistory.push(url);
      imgCurrentIdx = 0;
      await showImage(url, true);
      ensureImgPreloaded();
    } catch {
      showErrorToast();
      isLoading = false;
    }
  }

  /* ── Like Button ── */
  function updateLikeBtn() {
    const url = getCurrentUrl();
    if (!url) return;
    if (isLiked(url)) {
      $btnLike.classList.add('liked');
      $btnLike.querySelector('svg').setAttribute('fill', 'var(--accent)');
    } else {
      $btnLike.classList.remove('liked');
      $btnLike.querySelector('svg').setAttribute('fill', 'none');
    }
  }

  function doLike() {
    const url = getCurrentUrl();
    if (!url) return;
    const liked = toggleLike(url);
    updateLikeBtn();
    if (liked) spawnParticles($btnLike);
    if (navigator.vibrate) navigator.vibrate(10);
  }

  function getCurrentMediaType() {
    return mode === 'image' ? 'image' : 'video';
  }

  function setDownloadPending(pending) {
    isDownloading = pending;
    if (!$btnDownload) return;
    $btnDownload.disabled = pending;
    $btnDownload.setAttribute('aria-busy', pending ? 'true' : 'false');
  }

  function isTauriRuntime() {
    return typeof window !== 'undefined' && !!window.__TAURI_INTERNALS__?.invoke;
  }

  function isMobileRuntime() {
    return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
  }

  function inferExt(url, mediaType, contentType) {
    const raw = String(url || '').split('#')[0].split('?')[0];
    const last = raw.split('/').pop() || '';
    const dot = last.lastIndexOf('.');
    if (dot > -1 && dot < last.length - 1) {
      const ext = last.slice(dot + 1).toLowerCase();
      if (/^[a-z0-9]{2,6}$/.test(ext)) return ext;
    }
    const ct = String(contentType || '').toLowerCase();
    if (ct.includes('webm')) return 'webm';
    if (ct.includes('quicktime')) return 'mov';
    if (ct.includes('png')) return 'png';
    if (ct.includes('jpeg') || ct.includes('jpg')) return 'jpg';
    if (ct.includes('gif')) return 'gif';
    if (ct.includes('heic')) return 'heic';
    if (ct.includes('avif')) return 'avif';
    if (ct.includes('mp4')) return 'mp4';
    return mediaType === 'image' ? 'jpg' : 'mp4';
  }

  function makeMediaFileName(mediaType, ext) {
    const stamp = new Date()
      .toISOString()
      .replaceAll('-', '')
      .replaceAll(':', '')
      .replaceAll('T', '')
      .replaceAll('Z', '')
      .replaceAll('.', '')
      .slice(0, 14);
    return `kandian-${mediaType}-${stamp}.${ext}`;
  }

  function triggerBrowserDownload(blob, mediaType, sourceUrl, contentType) {
    const ext = inferExt(sourceUrl, mediaType, contentType);
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = makeMediaFileName(mediaType, ext);
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 8000);
  }

  async function saveToAlbumViaShare(blob, url, mediaType, contentType) {
    const ext = inferExt(url, mediaType, contentType || blob.type);
    const name = makeMediaFileName(mediaType, ext);
    const file = new File([blob], name, { type: blob.type || (mediaType === 'image' ? 'image/jpeg' : 'video/mp4') });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({
        files: [file],
        title: mediaType === 'image' ? '保存图片' : '保存视频',
        text: mediaType === 'image' ? '请选择“存储图像”' : '请选择“存储视频”'
      });
      return true;
    }
    return false;
  }

  async function downloadToDesktopDownloads(blob, url, mediaType, contentType) {
    const invoke = window.__TAURI_INTERNALS__?.invoke;
    if (!invoke) throw new Error('tauri invoke unavailable');
    const ext = inferExt(url, mediaType, contentType || blob.type);
    const buffer = await blob.arrayBuffer();
    const bytes = Array.from(new Uint8Array(buffer));
    return await invoke('save_media_to_downloads', { bytes, media_type: mediaType, ext });
  }

  function hideDownloadToast() {
    if (!$downloadToast) return;
    clearTimeout(downloadToastTimer);
    $downloadToast.classList.remove('show');
  }

  function showDownloadToast(text, options = {}) {
    if (!$downloadToast || !$downloadToastT) return;
    const { sticky = false, duration = 1800 } = options;
    clearTimeout(downloadToastTimer);
    $downloadToastT.textContent = text;
    $downloadToast.classList.add('show');
    if (!sticky) {
      downloadToastTimer = setTimeout(() => $downloadToast.classList.remove('show'), duration);
    }
  }

  function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0B';
    const units = ['B', 'KB', 'MB', 'GB'];
    let n = bytes;
    let idx = 0;
    while (n >= 1024 && idx < units.length - 1) {
      n /= 1024;
      idx++;
    }
    const fixed = idx === 0 ? 0 : 1;
    return `${n.toFixed(fixed)}${units[idx]}`;
  }

  async function fetchMediaWithProgress(url, mediaType, onProgress) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
    const contentType = res.headers.get('content-type') || (mediaType === 'image' ? 'image/jpeg' : 'video/mp4');
    const total = Number.parseInt(res.headers.get('content-length') || '0', 10);

    if (!res.body) {
      const blob = await res.blob();
      onProgress?.({ ratio: 1, loaded: blob.size, total: blob.size });
      return { blob, contentType };
    }

    const reader = res.body.getReader();
    const chunks = [];
    let loaded = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      chunks.push(value);
      loaded += value.byteLength;
      const ratio = total > 0 ? Math.min(loaded / total, 1) : null;
      onProgress?.({ ratio, loaded, total });
    }
    const blob = new Blob(chunks, { type: contentType });
    onProgress?.({ ratio: 1, loaded: blob.size, total: total > 0 ? total : blob.size });
    return { blob, contentType };
  }

  async function fetchMediaWithRetry(url, mediaType) {
    let lastErr = null;
    for (let attempt = 0; attempt <= APP_CONFIG.downloadMaxRetry; attempt++) {
      try {
        return await fetchMediaWithProgress(url, mediaType, ({ ratio, loaded, total }) => {
          if (ratio === null) {
            showDownloadToast(`下载中 ${formatBytes(loaded)}...`, { sticky: true });
            return;
          }
          const pct = Math.round(ratio * 100);
          if (Number.isFinite(total) && total > 0) {
            showDownloadToast(`下载中 ${pct}% (${formatBytes(loaded)}/${formatBytes(total)})`, { sticky: true });
          } else {
            showDownloadToast(`下载中 ${pct}%`, { sticky: true });
          }
        });
      } catch (err) {
        lastErr = err;
        if (attempt >= APP_CONFIG.downloadMaxRetry) break;
        const next = attempt + 1;
        showDownloadToast(`下载失败，正在重试 (${next}/${APP_CONFIG.downloadMaxRetry})...`, { sticky: true });
        await sleep(APP_CONFIG.downloadRetryDelay * next);
      }
    }
    throw lastErr || new Error('download failed');
  }

  async function doDownload() {
    if (isDownloading) return;
    const url = getCurrentUrl();
    if (!url) return;
    const mediaType = getCurrentMediaType();
    setDownloadPending(true);
    showDownloadToast('准备下载...', { sticky: true });
    try {
      const { blob, contentType } = await fetchMediaWithRetry(url, mediaType);
      if (isMobileRuntime()) {
        const shared = await saveToAlbumViaShare(blob, url, mediaType, contentType).catch(() => false);
        if (shared) {
          showDownloadToast(mediaType === 'image' ? '已唤起保存图片' : '已唤起保存视频', { duration: 2200 });
          return;
        }
      }
      if (isTauriRuntime() && !isMobileRuntime()) {
        const savedPath = await downloadToDesktopDownloads(blob, url, mediaType, contentType);
        showDownloadToast(`已保存到 Downloads: ${String(savedPath).split('/').pop()}`, { duration: 2600 });
        return;
      }
      triggerBrowserDownload(blob, mediaType, url, contentType);
      showDownloadToast('已开始下载', { duration: 2200 });
    } catch {
      showDownloadToast('下载失败，请重试', { duration: 2600 });
    } finally {
      setDownloadPending(false);
    }
  }

  /* ── Tap Handling ── */
  let lastTapTime = 0;
  let singleTapTimer = null;
  let pauseToastTimer = null;

  function handleTap(e) {
    const now = Date.now();
    if (now < tapSuppressUntil) return;
    if (now - lastTapTime < 300) {
      clearTimeout(singleTapTimer);
      lastTapTime = 0;
      const url = getCurrentUrl();
      if (url && !isLiked(url)) { toggleLike(url); updateLikeBtn(); }
      spawnDoubleTapHeart(
        e.clientX || e.touches?.[0]?.clientX || window.innerWidth / 2,
        e.clientY || e.touches?.[0]?.clientY || window.innerHeight / 2
      );
      spawnParticles($btnLike);
      if (navigator.vibrate) navigator.vibrate([10, 30, 10]);
      return;
    }
    lastTapTime = now;
    singleTapTimer = setTimeout(() => { if (mode === 'video') togglePause(); }, 300);
  }

  function togglePause() {
    if ($player.paused) {
      $player.play().catch(() => {});
      showPauseToast(false);
    } else {
      $player.pause();
      showPauseToast(true);
    }
  }

  function showPauseToast(paused) {
    clearTimeout(pauseToastTimer);
    // 业务约定：暂停态统一显示“播放”图标，避免误以为卡顿
    $icoPause.style.display = 'none';
    $icoPlay.style.display = paused ? 'block' : 'none';
    if (paused) {
      $pauseToast.classList.remove('show');
      $pauseToast.classList.add('pinned');
      return;
    }
    $pauseToast.classList.remove('pinned');
    $pauseToast.classList.remove('show');
  }

  function spawnDoubleTapHeart(x, y) {
    const el = document.createElement('div');
    el.className = 'dbl-heart';
    el.style.left = (x - 40) + 'px';
    el.style.top = (y - 40) + 'px';
    const randomRotate = (Math.random() - 0.5) * 40;
    el.style.setProperty('--rotate', randomRotate + 'deg');
    el.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 950);
  }

  function spawnParticles(anchor) {
    const rect = anchor.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const colors = ['#ff0055','#ff3377','#ff6699','#00f0ff','#ffffff','#ff99bb','#ff1a66','#66f5ff'];
    for (let i = 0; i < 12; i++) {
      const p = document.createElement('div');
      p.className = 'particle';
      const angle = (Math.PI * 2 * i) / 12 + (Math.random() - 0.5) * 0.6;
      const dist = 30 + Math.random() * 55;
      p.style.left = cx + 'px'; p.style.top = cy + 'px';
      p.style.setProperty('--dx', Math.cos(angle) * dist + 'px');
      p.style.setProperty('--dy', Math.sin(angle) * dist + 'px');
      p.style.background = colors[i % colors.length];
      const size = (3 + Math.random() * 5);
      p.style.width = size + 'px';
      p.style.height = size + 'px';
      p.style.boxShadow = '0 0 ' + (size + 2) + 'px ' + colors[i % colors.length];
      document.body.appendChild(p);
      setTimeout(() => p.remove(), 850);
    }
  }

  /* ── Mute ── */
  function toggleMute() {
    isMuted = !isMuted;
    $player.muted = isMuted;
    $icoMuted.style.display = isMuted ? '' : 'none';
    $icoUnmuted.style.display = isMuted ? 'none' : '';
    showMuteToast(isMuted ? '已静音' : '已开启声音');
  }

  function showMuteToast(text) {
    clearTimeout(muteToastTimer);
    $muteToastT.textContent = text;
    $muteToast.classList.add('show');
    muteToastTimer = setTimeout(() => $muteToast.classList.remove('show'), 1200);
  }

  function showErrorToast() {
    clearTimeout(errToastTimer);
    $errToast.classList.add('show');
    errToastTimer = setTimeout(() => $errToast.classList.remove('show'), 2500);
  }

  /* ── Favorites Panel ── */
  function openFav() {
    renderFavList();
    $favOverlay.classList.add('open');
    $favPanel.classList.add('open');
  }
  function closeFav() {
    $favOverlay.classList.remove('open');
    $favPanel.classList.remove('open');
    [$navHome, $navImg, $navFav].forEach(n => n.classList.remove('active'));
    (mode === 'image' ? $navImg : $navHome).classList.add('active');
  }

  const PLAY_ICON_SVG = '<svg viewBox="0 0 24 24" fill="white" stroke="none"><polygon points="5 3 19 12 5 21 5 3"/></svg>';
  const DEL_ICON_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
  const HEART_OUTLINE_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>';
  const FILM_ICON_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/></svg>';

  function escAttr(s) { return s.replace(/&/g,'&amp;').replace(/"/g,'&quot;'); }
  function renderFavList() {
    const likes = getLikes();
    $favCount.textContent = likes.length;
    if (likes.length === 0) {
      $favList.innerHTML = '<div id="fav-empty">' + HEART_OUTLINE_SVG +
        '<p>还没有收藏<br>双击或点击爱心来收藏</p></div>';
      return;
    }
    $favList.innerHTML = likes.map((item, i) => {
      const thumbHtml = item.thumb
        ? '<img class="fav-thumb" src="' + escAttr(item.thumb) + '" alt="" loading="lazy">'
        : '<div class="fav-placeholder">' + FILM_ICON_SVG + '</div>';
      return '<div class="fav-item" data-i="' + i + '">' +
        thumbHtml +
        '<div class="fav-play">' + PLAY_ICON_SVG + '</div>' +
        '<button class="fav-del" data-i="' + i + '" aria-label="删除">' + DEL_ICON_SVG + '</button>' +
        '</div>';
    }).join('');

    $favList.querySelectorAll('.fav-item').forEach(el => {
      const i = parseInt(el.dataset.i);
      const item = likes[i];
      if (!item) return;
      el.addEventListener('click', (e) => {
        if (e.target.closest('.fav-del')) return;
        closeFav();
        const itemType = item.type || 'video';
        if (itemType === 'image') {
          switchMode('image');
          setNavActive($navImg);
          imgHistory.push(item.url);
          imgCurrentIdx = imgHistory.length - 1;
          showImage(item.url);
        } else {
          switchMode('video');
          setNavActive($navHome);
          history.push(item.url);
          currentIdx = history.length - 1;
          playUrl(item.url);
        }
      });
      if (canHover && (item.type || 'video') === 'video') {
        let previewVid = null;
        el.addEventListener('mouseenter', () => {
          if (!previewVid) {
            previewVid = document.createElement('video');
            previewVid.className = 'fav-preview';
            previewVid.src = item.url;
            previewVid.muted = true; previewVid.loop = true;
            previewVid.playsInline = true; previewVid.crossOrigin = 'anonymous';
            previewVid.preload = 'auto';
            el.insertBefore(previewVid, el.querySelector('.fav-play'));
          }
          previewVid.play().catch(() => {});
        });
        el.addEventListener('mouseleave', () => {
          if (previewVid) { previewVid.pause(); previewVid.currentTime = 0; }
        });
      }
    });

    $favList.querySelectorAll('.fav-del').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const likes = getLikes();
        likes.splice(parseInt(btn.dataset.i), 1);
        saveLikes(likes);
        renderFavList();
        updateLikeBtn();
      });
    });
  }

  /* ── Progress Bar ── */
  function updateProgress() {
    if ($player.duration && isFinite($player.duration)) {
      $progress.style.width = ($player.currentTime / $player.duration * 100) + '%';
    }
    requestAnimationFrame(updateProgress);
  }

  /* ── Swipe / Scroll ── */
  function settleStageBack() {
    $stage.classList.remove('is-dragging');
    setStagePose({
      x: 0,
      y: 0,
      scale: 1,
      opacity: 1,
      progress: 0,
      transition: 'transform 230ms cubic-bezier(.2,.82,.2,1), opacity 180ms ease-out'
    });
    setTimeout(() => resetStagePose(), 240);
  }

  function onTouchStart(e) {
    if ($favPanel.classList.contains('open') || swipeAnimating || !e.touches[0]) return;
    const touch = e.touches[0];
    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
    touchMoveX = touch.clientX;
    touchMoveY = touch.clientY;
    const now = Date.now();
    lastTouchMoveY = touch.clientY;
    lastTouchMoveTime = now;
    touchAxis = null;
    hasTouchDragged = false;
    isSwiping = true;
  }

  function onTouchMove(e) {
    if (!isSwiping || swipeAnimating || !e.touches[0]) return;
    const touch = e.touches[0];
    touchMoveX = touch.clientX;
    touchMoveY = touch.clientY;
    const dx = touchMoveX - touchStartX;
    const dy = touchMoveY - touchStartY;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    if (!touchAxis) {
      if (Math.max(absDx, absDy) < 8) return;
      touchAxis = absDy >= absDx ? 'y' : 'x';
    }
    hasTouchDragged = hasTouchDragged || Math.max(absDx, absDy) > 10;
    $stage.classList.add('is-dragging');

    if (touchAxis === 'y') {
      e.preventDefault();
      const direction = dy < 0 ? 'next' : 'prev';
      const canNavigate = canNavigateDirection(direction);
      const limit = window.innerHeight * (canNavigate ? 0.95 : 0.25);
      const offsetY = dampDistance(dy, limit) * (canNavigate ? 1 : 0.58);
      const progress = Math.min(1, Math.abs(dy) / (window.innerHeight * 0.72));
      setStagePose({
        y: offsetY,
        scale: 1,
        opacity: 1,
        progress: progress * (canNavigate ? 1 : 0.55),
        transition: 'none'
      });
      lastTouchMoveY = touch.clientY;
      lastTouchMoveTime = Date.now();
      return;
    }

    const canSwitch = (dx < 0 && mode === 'video') || (dx > 0 && mode === 'image');
    const offsetX = dampDistance(dx, window.innerWidth * (canSwitch ? 0.33 : 0.2)) * (canSwitch ? 1 : 0.6);
    const progress = Math.min(1, absDx / (window.innerWidth * 0.35));
    setStagePose({
      x: offsetX,
      scale: 1 - progress * 0.025,
      opacity: 1 - progress * (canSwitch ? 0.12 : 0.06),
      progress: progress * (canSwitch ? 0.85 : 0.35),
      transition: 'none'
    });
  }

  function onTouchEnd(e) {
    if (!isSwiping) return;
    isSwiping = false;
    const changed = e.changedTouches?.[0];
    if (changed) {
      touchMoveX = changed.clientX;
      touchMoveY = changed.clientY;
    }
    const dx = touchMoveX - touchStartX;
    const dy = touchMoveY - touchStartY;
    const absDx = Math.abs(dx);
    const now = Date.now();
    const canTriggerNav = now - lastTouchNav >= APP_CONFIG.touchNavCooldown;
    if (hasTouchDragged) tapSuppressUntil = now + 260;

    if (touchAxis === 'x') {
      const canSwitch = (dx < 0 && mode === 'video') || (dx > 0 && mode === 'image');
      if (canTriggerNav && absDx > APP_CONFIG.swipeThreshold && canSwitch) {
        lastTouchNav = now;
        dismissHint();
        if (dx < 0) { switchMode('image'); setNavActive($navImg); }
        else { switchMode('video'); setNavActive($navHome); }
      }
      settleStageBack();
      return;
    }

    if (touchAxis === 'y') {
      const threshold = window.innerHeight * APP_CONFIG.swipeCommitRatio;
      const dt = Math.max(1, now - lastTouchMoveTime);
      const velocityY = (touchMoveY - lastTouchMoveY) / dt;
      const shouldNext = dy < -threshold || velocityY < -APP_CONFIG.swipeVelocityThreshold;
      const shouldPrev = dy > threshold || velocityY > APP_CONFIG.swipeVelocityThreshold;
      const direction = shouldNext ? 'next' : (shouldPrev ? 'prev' : null);
      if (canTriggerNav && direction && canNavigateDirection(direction)) {
        lastTouchNav = now;
        dismissHint();
        animateDirectionalNav(direction);
        return;
      }
    }

    settleStageBack();
  }

  let wheelAccum = 0, wheelIdleTimer = null, wheelLocked = false;

  function onWheel(e) {
    if ($favPanel.classList.contains('open') || swipeAnimating) return;
    e.preventDefault();
    if (wheelLocked) return;
    wheelAccum += e.deltaY;
    clearTimeout(wheelIdleTimer);
    wheelIdleTimer = setTimeout(() => {
      if (wheelLocked) { wheelAccum = 0; return; }
      if (Math.abs(wheelAccum) > 30) {
        wheelLocked = true;
        dismissHint();
        const direction = wheelAccum > 0 ? 'next' : 'prev';
        if (canNavigateDirection(direction)) animateDirectionalNav(direction);
        setTimeout(() => { wheelLocked = false; }, APP_CONFIG.wheelCooldown);
      }
      wheelAccum = 0;
    }, APP_CONFIG.wheelIdle);
  }

  function onKeyDown(e) {
    if ($favPanel.classList.contains('open')) {
      if (e.key === 'Escape') closeFav();
      return;
    }
    switch (e.key) {
      case 'ArrowDown': case 'ArrowRight':
        e.preventDefault();
        dismissHint();
        animateDirectionalNav('next');
        break;
      case 'ArrowUp': case 'ArrowLeft':
        e.preventDefault();
        dismissHint();
        animateDirectionalNav('prev');
        break;
      case 'l': case 'L': doLike(); break;
      case 'm': case 'M': if (mode === 'video') toggleMute(); break;
      case 'd': case 'D': doDownload(); break;
      case ' ':
        e.preventDefault(); if (mode === 'video') togglePause(); break;
    }
  }

  function dismissHint() {
  }

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  /* ── PWA Registration ── */
  if ('serviceWorker' in navigator) {
    const isLocalDevHost = location.hostname === '127.0.0.1' || location.hostname === 'localhost';
    if (isLocalDevHost) {
      navigator.serviceWorker.getRegistrations().then(regs => regs.forEach(reg => reg.unregister()));
    } else {
      navigator.serviceWorker.register('/sw-pwa.js').catch(() => {});
    }
  }

  function setNavActive(el) {
    [$navHome, $navImg, $navFav].forEach(n => n.classList.remove('active'));
    el.classList.add('active');
  }

  /* ── Top Nav ── */
  $navHome.addEventListener('click', () => {
    setNavActive($navHome);
    switchMode('video');
    closeFav();
  });
  $navImg.addEventListener('click', () => {
    setNavActive($navImg);
    switchMode('image');
    closeFav();
  });
  $navFav.addEventListener('click', () => {
    setNavActive($navFav);
    openFav();
  });

  /* ── Init ── */
  async function init() {
    $btnLike.addEventListener('click', doLike);
    $btnMute.addEventListener('click', toggleMute);
    if ($btnDownload) $btnDownload.addEventListener('click', doDownload);
    $favClose.addEventListener('click', closeFav);
    $favOverlay.addEventListener('click', closeFav);

    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('touchend', onTouchEnd, { passive: true });
    $player.addEventListener('click', (e) => { handleTap(e); });
    $imgPlayer.addEventListener('click', (e) => { handleTap(e); });
    document.addEventListener('wheel', onWheel, { passive: false });
    document.addEventListener('keydown', onKeyDown);
    $player.addEventListener('ended', () => {
      showPauseToast(false);
      animateDirectionalNav('next').then((ok) => {
        if (!ok) goNext();
      });
    });
    $player.addEventListener('pause', () => {
      if (mode !== 'video' || isLoading || $player.ended) return;
      showPauseToast(true);
    });
    $player.addEventListener('play', () => showPauseToast(false));
    $player.addEventListener('loadstart', () => setVideoBuffering('loadstart', true));
    $player.addEventListener('waiting', () => setVideoBuffering('waiting', true));
    $player.addEventListener('stalled', () => setVideoBuffering('stalled', true));
    $player.addEventListener('seeking', () => setVideoBuffering('seeking', true));
    $player.addEventListener('canplay', () => {
      setVideoBuffering('loadstart', false);
      setVideoBuffering('waiting', false);
      setVideoBuffering('stalled', false);
    });
    $player.addEventListener('playing', () => {
      setVideoBuffering('loadstart', false);
      setVideoBuffering('waiting', false);
      setVideoBuffering('stalled', false);
      setVideoBuffering('seeking', false);
      setVideoBuffering('switch', false);
    });
    $player.addEventListener('seeked', () => setVideoBuffering('seeking', false));
    $player.addEventListener('error', () => {
      setVideoBuffering('loadstart', false);
      setVideoBuffering('waiting', false);
      setVideoBuffering('stalled', false);
      setVideoBuffering('seeking', false);
      setVideoBuffering('switch', false);
    });

    requestAnimationFrame(updateProgress);

    $player.muted = isMuted;
    $icoMuted.style.display = isMuted ? '' : 'none';
    $icoUnmuted.style.display = isMuted ? 'none' : '';

    getLikes();

    try {
      const url = await requestVideoUrl();
      history.push(url);
      currentIdx = 0;
      // 第一个视频加载与后续预加载并行启动
      await Promise.all([
        playUrl(url, true),
        ensurePreloaded()
      ]);
      clearInterval(preloadTicker);
      preloadTicker = setInterval(() => {
        if (mode === 'video' && !isLoading && !swipeAnimating) ensurePreloaded();
      }, 1200);
    } catch {
      showErrorToast();
      isLoading = false;
    }
  }

  init();
}
