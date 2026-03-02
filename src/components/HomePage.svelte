<div id="page-home" class="page active">
  <div id="stage">
    <video id="player" playsinline webkit-playsinline preload="auto" crossorigin="anonymous"></video>
    <img id="img-player" alt="" />
  </div>
  <div id="stage-ghost" aria-hidden="true"></div>

  <div id="bottom-gradient"></div>

  <div id="progress-bar"><div id="progress-fill"></div></div>

  <div id="actions">
    <button class="act-btn" id="btn-like" aria-label="点赞">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
      </svg>
      <span>喜欢</span>
    </button>
    <button class="act-btn" id="btn-mute" aria-label="静音">
      <svg id="ico-unmuted" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
        <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
        <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
      </svg>
      <svg id="ico-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="display:none">
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
        <line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>
      </svg>
      <span id="mute-label">声音</span>
    </button>
    <button class="act-btn" id="btn-download" aria-label="下载">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 3v12"/>
        <polyline points="7 11 12 16 17 11"/>
        <rect x="4" y="18" width="16" height="3" rx="1.5"/>
      </svg>
      <span>下载</span>
    </button>
  </div>

  <div id="kb-hint">
    <span class="kbd">&uarr;</span><span class="kbd">&darr;</span> 切换 &nbsp;
    <span class="kbd">L</span> 喜欢 &nbsp;
    <span class="kbd">M</span> 静音 &nbsp;
    <span class="kbd">D</span> 下载 &nbsp;
    <span class="kbd">Space</span> 暂停
  </div>

  <div id="mute-toast">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
    </svg>
    <span id="mute-toast-text">已开启声音</span>
  </div>

  <div id="pause-toast">
    <svg id="ico-pause" viewBox="0 0 24 24" fill="white" stroke="none">
      <rect x="6" y="4" width="4" height="16" rx="1"/>
      <rect x="14" y="4" width="4" height="16" rx="1"/>
    </svg>
    <svg id="ico-play" viewBox="0 0 24 24" fill="white" stroke="none" style="display:none">
      <path d="M8.6 6.5c0-1.22 1.34-1.98 2.39-1.37l8.73 5.05c1.04.6 1.04 2.11 0 2.71l-8.73 5.05c-1.05.61-2.39-.15-2.39-1.37V6.5z"/>
    </svg>
  </div>

  <div id="download-toast">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 3v12"/>
      <polyline points="7 11 12 16 17 11"/>
      <rect x="4" y="18" width="16" height="3" rx="1.5"/>
    </svg>
    <span id="download-toast-text">开始下载…</span>
  </div>

  <div id="transition"></div>

  <div id="error-toast">加载失败，正在重试...</div>
</div>
