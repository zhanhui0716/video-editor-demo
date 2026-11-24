(() => {
  'use strict';

  const editorLib = window.createEditor;
  if (typeof editorLib !== 'function') {
    console.error('editor.js 未加载，无法启动编辑器');
    return;
  }

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const make = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const pad2 = value => String(value).padStart(2, '0');
  const fmtTime = seconds => {
    const total = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
    return `${pad2(Math.floor(total / 60))}:${pad2(total % 60)}`;
  };

  const el = {
    app: $('#app'),
    stage: $('#stage'),
    frame: $('#frame'),
    preview: $('#preview'),
    close: $('#btn-close'),
    quality: $('#btn-quality'),
    qualityLabel: $('#quality-label'),
    qualityMenu: $('#quality-menu'),
    exportBtn: $('#btn-export'),
    play: $('#btn-play'),
    playIcon: $('#play-icon use'),
    split: $('#btn-split'),
    undo: $('#btn-undo'),
    redo: $('#btn-redo'),
    fullscreen: $('#btn-fullscreen'),
    fullscreenIcon: $('#fullscreen-icon use'),
    timeCurrent: $('#time-current'),
    timeTotal: $('#time-total'),
    timeline: $('#timeline'),
    timelineContent: $('#timeline-content'),
    ruler: $('#ruler'),
    clips: $('#clips'),
    cover: $('#cover'),
    coverCanvas: $('#cover-canvas'),
    mute: $('#btn-mute'),
    muteIcon: $('#mute-icon use'),
    muteLabel: $('#mute-label'),
    audioRow: $('#audio-row'),
    audioClip: $('#audio-clip'),
    audioClipName: $('#audio-clip-name'),
    audioAdd: $('#btn-add-audio'),
    addMedia: $('#btn-add-media'),
    textStack: $('#text-stack'),
    stickerLayer: $('#sticker-layer'),
    pipSlot: $('#pip-slot'),
    stageMessage: $('#stage-message'),
    stageLoader: $('#stage-loader'),
    previewExit: $('#btn-preview-exit'),
    toolbar: $('#toolbar'),
    sheetRoot: $('#sheet-root'),
    sheet: $('#sheet'),
    sheetTitle: $('#sheet-title'),
    sheetBody: $('#sheet-body'),
    sheetDone: $('#sheet-done'),
    sheetScrim: $('.sheet-scrim'),
    modalRoot: $('#modal-root'),
    modalCard: $('#modal-card'),
    modalScrim: $('.modal-scrim'),
    closedScreen: $('#closed-screen'),
    reenter: $('#btn-reenter'),
    toast: $('#toast'),
    statusTime: $('#status-time'),
    fileVideo: $('#file-video'),
    fileAudio: $('#file-audio'),
    filePip: $('#file-pip'),
  };

  const editor = editorLib(el.preview);

  const state = {
    data: null,
    pps: 58.5,
    playheadX: 218,
    clipSignature: '',
    layoutDirty: true,
    bootAt: performance.now(),
    videoReady: el.preview.readyState >= 1,
    quality: '1080p',
    muted: false,
    coverTime: null,
    coverSrc: null,
    coverKey: '',
    audio: null,
    lastAudioSync: 0,
    pip: null,
    texts: [],
    stickers: [],
    effect: 'original',
    sheet: null,
    modalBusy: false,
    exportTimer: null,
    toastTimer: null,
    importing: false,
    stickerHintShown: false,
    pan: null,
    clockTimer: null,
    resizeTimer: null,
    wheelAt: 0,
  };

  const TILE_WIDTH = 60;
  const RES_LABEL = {
    '480P': '480p',
    '720P': '720p',
    '1080P': '1080p',
    '2K': '2K',
    '4K': '4K',
  };
  const RES_BITRATE = { '480p': 1.2, '720p': 2.2, '1080p': 3.6, '2K': 7, '4K': 15 };
  const STICKERS = ['😀', '😎', '🔥', '✨', '💯', '🎉', '❤️', '👍', '🌟', '🎬'];
  const STICKER_SPOTS = [
    [16, 16], [62, 20], [18, 58], [64, 58],
    [40, 38], [10, 36], [70, 74], [44, 12],
  ];
  const EFFECTS = [
    {
      id: 'original',
      name: '原片',
      filter: '',
      swatch: 'linear-gradient(135deg, #6e8fa6, #d8b98e 52%, #3e4d5a)',
    },
    {
      id: 'bw',
      name: '黑白',
      filter: 'grayscale(1) contrast(1.06)',
      swatch: 'linear-gradient(135deg, #6f6f6f, #dedede 52%, #3f3f3f)',
    },
    {
      id: 'warm',
      name: '暖阳',
      filter: 'sepia(.32) saturate(1.22) brightness(1.04)',
      swatch: 'linear-gradient(135deg, #b9752f, #ffd9a0 52%, #7a4318)',
    },
    {
      id: 'cool',
      name: '冷调',
      filter: 'hue-rotate(-12deg) saturate(1.12) brightness(.98)',
      swatch: 'linear-gradient(135deg, #2f5f8a, #9fd0ea 52%, #1d3550)',
    },
    {
      id: 'film',
      name: '复古',
      filter: 'sepia(.5) contrast(1.08) saturate(.85)',
      swatch: 'linear-gradient(135deg, #6f5a3c, #d9c19a 52%, #4a3826)',
    },
  ];

  /* ------------------------------------------------------------------ */
  /* 基础排版                                                           */
  /* ------------------------------------------------------------------ */

  function measure() {
    const width = el.timeline.clientWidth;
    if (!width) return;
    state.playheadX = width / 2;
    state.pps = Math.max(30, width * 0.1342);
  }

  function clockLabel() {
    const now = new Date();
    return `${now.getHours()}:${pad2(now.getMinutes())}`;
  }

  function estimateSize(seconds) {
    const rate = RES_BITRATE[state.quality] || 3.6;
    return Math.max(1, Math.round((seconds * rate) / 1));
  }

  function startOfClip(index) {
    if (!state.data) return 0;
    let total = 0;
    for (let i = 0; i < index && i < state.data.clips.length; i++) {
      total += state.data.clips[i].end - state.data.clips[i].start;
    }
    return total;
  }

  function locate(seconds) {
    const clips = state.data ? state.data.clips : [];
    let start = 0;
    for (let i = 0; i < clips.length; i++) {
      const clip = clips[i];
      const length = clip.end - clip.start;
      if (seconds < start + length || i === clips.length - 1) {
        return {
          clip,
          index: i,
          offset: clamp(seconds - start, 0, length),
        };
      }
      start += length;
    }
    return null;
  }

  function clipListSignature(clips) {
    return clips
      .map(clip => `${clip.id}:${clip.src}:${clip.start.toFixed(3)}:${clip.end.toFixed(3)}`)
      .join('|');
  }

  /* ------------------------------------------------------------------ */
  /* 抽帧：用隐藏 video + canvas，不上传、不读像素，可直接双击打开       */
  /* ------------------------------------------------------------------ */

  function drawCover(source, ctx, width, height) {
    const sourceWidth = source.videoWidth || source.width || 0;
    const sourceHeight = source.videoHeight || source.height || 0;
    if (!sourceWidth || !sourceHeight) return false;
    const scale = Math.max(width / sourceWidth, height / sourceHeight);
    const drawWidth = sourceWidth * scale;
    const drawHeight = sourceHeight * scale;
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(
      source,
      (width - drawWidth) / 2,
      (height - drawHeight) / 2,
      drawWidth,
      drawHeight
    );
    return true;
  }

  class FrameExtractor {
    constructor(src) {
      this.video = document.createElement('video');
      this.video.muted = true;
      this.video.playsInline = true;
      this.video.preload = 'auto';
      this.video.setAttribute('playsinline', '');
      this.video.setAttribute('aria-hidden', 'true');
      this.video.style.cssText =
        'position:fixed;left:-24px;bottom:0;width:1px;height:1px;opacity:.01;pointer-events:none;z-index:-1;';
      this.video.src = src;
      document.body.appendChild(this.video);
      this.ready = new Promise(resolve => {
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          resolve();
        };
        if (this.video.readyState >= 1) finish();
        else {
          this.video.addEventListener('loadedmetadata', finish, { once: true });
          this.video.addEventListener('error', finish, { once: true });
          setTimeout(finish, 8000);
        }
      });
      this.chain = Promise.resolve();
    }

    request(canvas, sourceTime) {
      const width = canvas.width;
      const height = canvas.height;
      this.chain = this.chain
        .then(async () => {
          await this.ready;
          const video = this.video;
          if (!video.videoWidth) return;
          const duration = Number.isFinite(video.duration) ? video.duration : sourceTime + 1;
          const target = clamp(sourceTime, 0, Math.max(0, duration - 0.05));
          if (Math.abs(video.currentTime - target) > 0.01) {
            await new Promise(resolve => {
              let settled = false;
              const finish = () => {
                if (settled) return;
                settled = true;
                video.removeEventListener('seeked', finish);
                video.removeEventListener('error', finish);
                clearTimeout(timer);
                resolve();
              };
              const timer = setTimeout(finish, 3000);
              video.addEventListener('seeked', finish);
              video.addEventListener('error', finish);
              try {
                video.currentTime = target;
              } catch {
                finish();
              }
            });
          }
          if (!video.videoWidth) return;
          drawCover(video, canvas.getContext('2d'), width, height);
        })
        .catch(() => {});
      return this.chain;
    }
  }

  const extractors = new Map();
  function extractorFor(src) {
    if (!src) return null;
    let extractor = extractors.get(src);
    if (!extractor) {
      extractor = new FrameExtractor(src);
      extractors.set(src, extractor);
    }
    return extractor;
  }

  // 抽帧缓存：同一时间点只 seek 一次，重建片段时直接复用，避免缩略图空白
  const frameCache = new Map();
  const framePending = new Map();
  const FRAME_CACHE_LIMIT = 96;
  const FRAME_WIDTH = 240;
  const FRAME_HEIGHT = 135;

  function frameKey(src, time) {
    return `${src}|${Math.round(time * 4) / 4}`;
  }

  function blitFrame(source, canvas) {
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    drawCover(source, ctx, canvas.width, canvas.height);
  }

  function requestFrame(src, time, canvas) {
    if (!src || !canvas) return;
    const key = frameKey(src, time);
    const cached = frameCache.get(key);
    if (cached) {
      frameCache.delete(key);
      frameCache.set(key, cached);
      blitFrame(cached, canvas);
      return;
    }
    let pending = framePending.get(key);
    if (!pending) {
      const frame = document.createElement('canvas');
      frame.width = FRAME_WIDTH;
      frame.height = FRAME_HEIGHT;
      const extractor = extractorFor(src);
      pending = (extractor ? extractor.request(frame, time) : Promise.resolve()).then(() => {
        frameCache.set(key, frame);
        if (frameCache.size > FRAME_CACHE_LIMIT) {
          const oldest = frameCache.keys().next().value;
          frameCache.delete(oldest);
        }
      });
      framePending.set(key, pending);
    }
    pending.then(() => {
      const frame = frameCache.get(key);
      if (frame) {
        blitFrame(frame, canvas);
      } else if (canvas.isConnected) {
        requestFrame(src, time, canvas);
      }
    });
  }

  function drawCurrentFrame(canvas) {
    if (el.preview.readyState >= 2) {
      drawCover(el.preview, canvas.getContext('2d'), canvas.width, canvas.height);
      return;
    }
    const data = state.data;
    if (!data || !data.clips.length) return;
    const loc = locate(data.currentTime);
    if (!loc) return;
    const extractor = extractorFor(loc.clip.src);
    if (extractor) extractor.request(canvas, loc.clip.start + loc.offset);
  }

  /* ------------------------------------------------------------------ */
  /* 渲染                                                               */
  /* ------------------------------------------------------------------ */

  function onState(next) {
    const previous = state.data;
    state.data = next;
    const signature = clipListSignature(next.clips);
    const needsClips = signature !== state.clipSignature || state.layoutDirty;
    if (needsClips) {
      state.clipSignature = signature;
      state.layoutDirty = false;
      rebuildRuler(next);
      rebuildClips(next);
    }
    renderTime(next);
    renderTransport(next);
    renderTimeline(next);
    renderAudio(next);
    renderCover(next, needsClips);
    renderEmptyState(next);
    renderMute();
    syncBackgroundMedia(next, previous);
  }

  function renderTime(next) {
    el.timeCurrent.textContent = fmtTime(next.currentTime);
    el.timeTotal.textContent = fmtTime(next.duration);
  }

  function renderTransport(next) {
    el.playIcon.setAttribute('href', next.playing ? '#i-pause' : '#i-play');
    el.play.setAttribute('aria-label', next.playing ? '暂停' : '播放');
    el.split.setAttribute('aria-disabled', String(!next.canSplit));
    el.undo.classList.toggle('is-off', !next.canUndo);
    el.redo.classList.toggle('is-off', !next.canRedo);
    el.undo.setAttribute('aria-disabled', String(!next.canUndo));
    el.redo.setAttribute('aria-disabled', String(!next.canRedo));
  }

  function renderTimeline(next) {
    const x = state.playheadX - next.currentTime * state.pps;
    el.timelineContent.style.transform = `translate3d(${x}px, 0, 0)`;
  }

  function rebuildRuler(next) {
    el.ruler.replaceChildren();
    if (!(next.duration > 0)) return;
    const duration = next.duration;
    const step = duration > 180 ? 30 : duration > 90 ? 10 : duration > 40 ? 5 : 2;
    const fragment = document.createDocumentFragment();
    for (let second = 0; second <= duration + 1e-6; second += 1) {
      const x = second * state.pps;
      if (Math.round(second) % step === 0) {
        const label = make('span', 'tick-label', fmtTime(second));
        label.style.left = `${x}px`;
        fragment.appendChild(label);
      } else {
        const dot = make('span', 'tick-dot');
        dot.style.left = `${x}px`;
        fragment.appendChild(dot);
      }
    }
    el.ruler.appendChild(fragment);
  }

  function rebuildClips(next) {
    const hadFocus = document.activeElement && document.activeElement.classList.contains('clip');
    el.clips.replaceChildren();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    for (const clip of next.clips) {
      const width = (clip.end - clip.start) * state.pps;
      if (!(width > 0.4)) continue;
      const node = make('button', 'clip');
      node.type = 'button';
      node.dataset.clipId = String(clip.id);
      node.style.width = `${width}px`;
      node.setAttribute('aria-label', `片段 ${next.clips.indexOf(clip) + 1}`);
      node.title = clip.name ? `${clip.name}` : `片段 ${next.clips.indexOf(clip) + 1}`;
      const count = clamp(Math.ceil(width / TILE_WIDTH), 1, 80);
      const tileWidth = width / count;
      for (let i = 0; i < count; i++) {
        const canvas = make('canvas', 'thumb');
        const scale = Math.min(dpr, 260 / Math.max(tileWidth, 1));
        canvas.width = Math.max(2, Math.round(tileWidth * scale));
        canvas.height = Math.max(2, Math.round(60 * scale));
        canvas.style.width = `${tileWidth}px`;
        const time = clip.start + ((i + 0.5) * tileWidth) / state.pps;
        requestFrame(clip.src, Math.min(time, clip.end - 0.001), canvas);
        node.appendChild(canvas);
      }
      el.clips.appendChild(node);
    }
    if (hadFocus) {
      const selected = el.clips.querySelector(`[data-clip-id="${next.selectedClipId}"]`);
      if (selected) selected.focus({ preventScroll: true });
    }
  }

  function renderCover(next, rebuild) {
    if (!next.clips.length) {
      state.coverTime = null;
      state.coverSrc = null;
      state.coverKey = '';
      el.cover.classList.add('is-empty');
      return;
    }
    el.cover.classList.remove('is-empty');
    if (state.coverTime === null) {
      const first = next.clips[0];
      state.coverTime = first.start;
      state.coverSrc = first.src;
    }
    if (!state.coverSrc) state.coverSrc = next.clips[0].src;
    const key = `${state.coverSrc}|${state.coverTime.toFixed(2)}`;
    if (rebuild || state.coverKey !== key) {
      state.coverKey = key;
      requestFrame(state.coverSrc, state.coverTime, el.coverCanvas);
    }
  }

  function renderAudio(next) {
    if (!next.clips.length) {
      el.audioRow.hidden = true;
      el.audioClip.hidden = true;
      el.mute.hidden = true;
      el.cover.hidden = true;
      return;
    }
    el.mute.hidden = false;
    el.cover.hidden = false;
    const projectStartX = state.playheadX - next.currentTime * state.pps;
    const left = Math.max(0, projectStartX);
    const width = Math.max(0, el.timeline.clientWidth - left);
    el.audioRow.hidden = false;
    el.audioRow.style.left = `${left}px`;
    el.audioRow.style.width = `${width}px`;
    if (state.audio) {
      el.audioClip.hidden = false;
      const audioWidth = Math.max(52, (state.audio.duration || 0) * state.pps);
      el.audioClip.style.left = `${projectStartX}px`;
      el.audioClip.style.width = `${audioWidth}px`;
    } else {
      el.audioClip.hidden = true;
    }
  }

  function renderMute() {
    const muted = state.data ? state.data.muted : state.muted;
    el.mute.classList.toggle('is-muted', muted);
    el.mute.setAttribute('aria-pressed', String(muted));
    el.mute.setAttribute('aria-label', muted ? '开启原声' : '关闭原声');
    el.muteLabel.textContent = muted ? '开启原声' : '关闭原声';
    el.muteIcon.setAttribute('href', muted ? '#i-mute' : '#i-volume');
  }

  function renderEmptyState(next) {
    const hasClips = Boolean(next && next.clips.length);
    const hasError = Boolean(next && next.error);
    if (hasError) {
      el.stageMessage.hidden = false;
      el.stageMessage.textContent = next.error;
      el.stageLoader.hidden = true;
      return;
    }
    if (hasClips) {
      el.stageMessage.hidden = true;
      el.stageLoader.hidden = true;
      return;
    }
    const waited = performance.now() - state.bootAt > 350;
    el.stageLoader.hidden = state.videoReady || !waited;
    el.stageMessage.hidden = !state.videoReady;
    el.stageMessage.textContent = '还没有视频片段\n点击右下角的 + 添加视频';
    el.stageMessage.style.whiteSpace = 'pre-line';
  }

  /* ------------------------------------------------------------------ */
  /* 预览、音频、画中画同步                                             */
  /* ------------------------------------------------------------------ */

  function syncBackgroundMedia(next, previous) {
    syncAudio(next);
    if (!state.pip) return;
    const pip = state.pip.el;
    if (next.playing) {
      if (pip.paused) pip.play().catch(() => {});
    } else if (!pip.paused) {
      pip.pause();
    }
    if (!next.playing && next.currentTime !== (previous && previous.currentTime)) {
      const target = Number.isFinite(pip.duration) && pip.duration > 0
        ? next.currentTime % pip.duration
        : 0;
      if (Math.abs(pip.currentTime - target) > 0.35) pip.currentTime = target;
    }
  }

  function syncAudio(next) {
    if (!state.audio) return;
    const audio = state.audio.el;
    if (audio.readyState < 1) return;
    const duration = Number.isFinite(audio.duration) ? audio.duration : Infinity;
    const target = clamp(next.currentTime, 0, duration);
    if (next.playing) {
      if (audio.paused) audio.play().catch(() => {});
      const now = performance.now();
      if (now - state.lastAudioSync > 500) {
        state.lastAudioSync = now;
        if (Math.abs(audio.currentTime - target) > 0.45) audio.currentTime = target;
      }
    } else {
      if (!audio.paused) audio.pause();
      if (Math.abs(audio.currentTime - target) > 0.12) audio.currentTime = target;
    }
  }

  /* ------------------------------------------------------------------ */
  /* 交互：播放 / 分割 / 撤销 / 静音 / 全屏                             */
  /* ------------------------------------------------------------------ */

  function toast(message, duration = 1900) {
    el.toast.textContent = message;
    if (!el.sheetRoot.hidden) {
      const appTop = el.app.getBoundingClientRect().top;
      const sheetTop = el.sheet.getBoundingClientRect().top;
      el.toast.style.bottom = `${Math.max(96, el.app.clientHeight - (sheetTop - appTop) + 18)}px`;
    } else {
      el.toast.style.bottom = '';
    }
    el.toast.classList.add('show');
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => el.toast.classList.remove('show'), duration);
  }

  function togglePlayback() {
    const data = state.data;
    if (!data || !data.clips.length) {
      toast('先添加一段视频');
      return;
    }
    editor.togglePlayback();
  }

  function doSplit() {
    const data = state.data;
    if (!data || !data.clips.length) {
      toast('还没有可分割的片段');
      return;
    }
    if (!data.canSplit) {
      toast('把白色播放头移到片段中间再分割');
      return;
    }
    if (editor.splitAtPlayhead()) {
      toast('已在播放头处分割');
      refreshSheet();
    }
  }

  function doDelete() {
    const data = state.data;
    if (!data || !data.clips.length) {
      toast('还没有视频片段');
      return;
    }
    if (data.selectedClipId === null) {
      toast('请先把播放头移到要删除的片段上');
      return;
    }
    editor.deleteClip(data.selectedClipId);
    toast('已删除当前片段');
    refreshSheet();
  }

  function doDuplicate() {
    const data = state.data;
    if (!data || !data.clips.length) {
      toast('还没有视频片段');
      return;
    }
    if (data.selectedClipId === null) {
      toast('请先把播放头移到要复制的片段上');
      return;
    }
    if (editor.duplicateClip(data.selectedClipId)) toast('已复制当前片段');
    refreshSheet();
  }

  function doUndo() {
    if (!state.data || !state.data.canUndo) {
      toast('没有可撤销的操作');
      return;
    }
    if (editor.undo()) {
      toast('已撤销');
      refreshSheet();
    }
  }

  function doRedo() {
    if (!state.data || !state.data.canRedo) {
      toast('没有可重做的操作');
      return;
    }
    if (editor.redo()) {
      toast('已重做');
      refreshSheet();
    }
  }

  function toggleMute() {
    editor.toggleMute();
    toast(state.data && state.data.muted ? '已关闭原声' : '已开启原声');
  }

  function inPreviewMode() {
    return el.app.classList.contains('preview-mode');
  }

  async function enterPreviewMode() {
    el.app.classList.add('preview-mode');
    el.previewExit.hidden = false;
    if (state.sheet) closeSheet();
    if (!el.modalRoot.hidden) closeModal();
    try {
      if (el.app.requestFullscreen && !document.fullscreenElement) {
        await el.app.requestFullscreen({ navigationUI: 'hide' });
      }
    } catch {
      /* 浏览器不允许全屏时，使用页面内的预览模式 */
    }
    updateFullscreenIcon();
  }

  async function exitPreviewMode() {
    el.app.classList.remove('preview-mode');
    el.previewExit.hidden = true;
    if (document.fullscreenElement) {
      try {
        await document.exitFullscreen();
      } catch {
        /* ignore */
      }
    }
    updateFullscreenIcon();
  }

  function toggleFullscreen() {
    if (inPreviewMode()) exitPreviewMode();
    else enterPreviewMode();
  }

  function updateFullscreenIcon() {
    const active = Boolean(document.fullscreenElement) || inPreviewMode();
    el.fullscreenIcon.setAttribute('href', active ? '#i-collapse' : '#i-expand');
    el.fullscreen.setAttribute('aria-label', active ? '退出全屏' : '全屏预览');
  }

  /* ------------------------------------------------------------------ */
  /* 顶部：清晰度 / 导出 / 关闭                                         */
  /* ------------------------------------------------------------------ */

  function closeQualityMenu() {
    el.qualityMenu.hidden = true;
    el.quality.setAttribute('aria-expanded', 'false');
  }

  function toggleQualityMenu() {
    const willOpen = el.qualityMenu.hidden;
    el.qualityMenu.hidden = !willOpen;
    el.quality.setAttribute('aria-expanded', String(willOpen));
  }

  function setQuality(value) {
    const label = RES_LABEL[value] || '1080p';
    state.quality = label;
    el.qualityLabel.textContent = label;
    $$('#quality-menu button').forEach(button => {
      button.setAttribute('aria-checked', String(button.dataset.quality === value));
    });
    closeQualityMenu();
  }

  function openExitModal() {
    el.modalCard.innerHTML = `
      <h2>退出剪辑？</h2>
      <p class="modal-sub">当前项目不会被保存，已添加的片段、音频、文字都会丢失。</p>
      <div class="modal-actions">
        <button class="btn ghost" type="button" data-act="cancel">继续编辑</button>
        <button class="btn primary" type="button" data-act="exit">退出</button>
      </div>`;
    el.modalCard.querySelector('[data-act="cancel"]').addEventListener('click', closeModal);
    el.modalCard.querySelector('[data-act="exit"]').addEventListener('click', () => {
      closeModal();
      closeSheet();
      if (state.data && state.data.playing) editor.togglePlayback();
      el.closedScreen.hidden = false;
      if (state.audio) state.audio.el.pause();
      if (state.pip) state.pip.el.pause();
    });
    showModal();
  }

  function openCoverModal() {
    el.modalCard.innerHTML = `
      <h2>设置封面</h2>
      <p class="modal-sub">使用白色播放头所在的画面作为项目封面。</p>
      <div class="modal-preview"></div>
      <div class="modal-actions">
        <button class="btn ghost" type="button" data-act="cancel">取消</button>
        <button class="btn primary" type="button" data-act="set">设为封面</button>
      </div>`;
    const holder = el.modalCard.querySelector('.modal-preview');
    const canvas = make('canvas');
    canvas.width = 480;
    canvas.height = 270;
    holder.appendChild(canvas);
    if (state.data && state.data.clips.length) drawCurrentFrame(canvas);
    el.modalCard.querySelector('[data-act="cancel"]').addEventListener('click', closeModal);
    el.modalCard.querySelector('[data-act="set"]').addEventListener('click', () => {
      const data = state.data;
      if (!data || !data.clips.length) {
        toast('还没有可设置封面的画面');
        return;
      }
      const loc = locate(data.currentTime);
      if (!loc) return;
      state.coverTime = loc.clip.start + loc.offset;
      state.coverSrc = loc.clip.src;
      state.coverKey = '';
      renderCover(data, true);
      closeModal();
      toast('封面已更新');
    });
    showModal();
  }

  function showExportSuccess() {
    el.modalCard.replaceChildren();
    const wrap = make('div', 'export-success');
    wrap.innerHTML = `
      <div class="success-mark">
        <svg class="icon icon-24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.8 12.6l4.6 4.6L19.4 6.8"/></svg>
      </div>
      <strong>导出成功</strong>
      <span>已保存到相册 · 演示模式</span>`;
    const actions = make('div', 'modal-actions');
    const done = make('button', 'btn primary', '完成');
    done.type = 'button';
    done.addEventListener('click', closeModal);
    actions.appendChild(done);
    el.modalCard.append(wrap, actions);
    toast('导出完成（演示）', 2400);
  }

  function openExportModal() {
    const data = state.data;
    const duration = data ? data.duration : 0;
    if (!data || !data.clips.length) {
      toast('还没有可以导出的内容');
      return;
    }
    el.modalCard.innerHTML = `
      <h2>导出视频</h2>
      <p class="modal-sub">演示模式下不会生成真实文件，进度条仅用于展示界面。</p>
      <div class="export-row">
        <div class="export-thumb"></div>
        <div>
          <div class="export-title">视频剪辑</div>
          <div class="export-meta">时长 ${fmtTime(duration)} · ${state.quality} · 30fps<br>MP4 · 预计 ${estimateSize(duration)} MB</div>
        </div>
      </div>
      <div class="export-progress" hidden>
        <div class="progress"><i></i></div>
        <div class="progress-label"><span>正在导出…</span><span class="pct">0%</span></div>
      </div>
      <div class="modal-actions">
        <button class="btn ghost" type="button" data-act="cancel">取消</button>
        <button class="btn primary" type="button" data-act="start">开始导出</button>
      </div>`;

    const thumb = el.modalCard.querySelector('.export-thumb');
    const canvas = make('canvas');
    canvas.width = 196;
    canvas.height = 110;
    thumb.appendChild(canvas);
    drawCurrentFrame(canvas);

    el.modalCard.querySelector('[data-act="cancel"]').addEventListener('click', closeModal);
    el.modalCard.querySelector('[data-act="start"]').addEventListener('click', () => {
      const progress = el.modalCard.querySelector('.export-progress');
      const actions = el.modalCard.querySelector('.modal-actions');
      const bar = el.modalCard.querySelector('.progress i');
      const pct = el.modalCard.querySelector('.pct');
      const status = el.modalCard.querySelector('.progress-label span');
      progress.hidden = false;
      actions.hidden = true;
      state.modalBusy = true;
      let value = 0;
      state.exportTimer = setInterval(() => {
        value = Math.min(100, value + 2 + Math.random() * 7);
        bar.style.width = `${value}%`;
        pct.textContent = `${Math.round(value)}%`;
        if (value >= 100) {
          clearInterval(state.exportTimer);
          state.exportTimer = null;
          status.textContent = '处理完成';
          setTimeout(() => {
            if (state.modalBusy) {
              state.modalBusy = false;
              showExportSuccess();
            }
          }, 320);
        }
      }, 90);
    });
    showModal();
  }

  function showModal() {
    el.modalRoot.hidden = false;
  }

  function closeModal() {
    state.modalBusy = false;
    if (state.exportTimer) {
      clearInterval(state.exportTimer);
      state.exportTimer = null;
    }
    el.modalRoot.hidden = true;
    el.modalCard.replaceChildren();
  }

  /* ------------------------------------------------------------------ */
  /* 底部工具面板                                                       */
  /* ------------------------------------------------------------------ */

  function optionButton({ label, icon, emoji, onClick, className = '' }) {
    const button = make('button', `option ${className}`.trim());
    button.type = 'button';
    if (icon) {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'icon');
      const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
      use.setAttribute('href', `#${icon}`);
      svg.appendChild(use);
      button.appendChild(svg);
    } else if (emoji) {
      button.appendChild(make('span', 'emoji', emoji));
    }
    button.appendChild(make('span', 'option-label', label));
    button.addEventListener('click', onClick);
    return button;
  }

  function optionGrid(items, extraClass = '') {
    const grid = make('div', `option-grid ${extraClass}`.trim());
    grid.append(...items);
    return grid;
  }

  function miniRow({ icon, name, sub }) {
    const row = make('div', 'mini-row');
    const iconBox = make('div', 'mini-icon');
    iconBox.innerHTML = `<svg class="icon icon-20"><use href="#${icon}"></use></svg>`;
    const main = make('div', 'mini-main');
    main.append(make('div', 'mini-name', name), make('div', 'mini-sub', sub));
    row.append(iconBox, main);
    return row;
  }

  function note(text) {
    return make('p', 'sheet-note', text);
  }

  function buildEditSheet() {
    const data = state.data;
    const selectedIndex = data && data.selectedClipId !== null
      ? data.clips.findIndex(clip => clip.id === data.selectedClipId)
      : -1;
    const grid = optionGrid([
      optionButton({ label: '分割', icon: 'i-split', onClick: doSplit }),
      optionButton({ label: '删除', icon: 'i-trash', onClick: doDelete }),
      optionButton({ label: '复制', icon: 'i-copy', onClick: doDuplicate }),
      optionButton({ label: '撤销', icon: 'i-undo', onClick: doUndo }),
      optionButton({ label: '重做', icon: 'i-redo', onClick: doRedo }),
    ], 'cols-5');
    let info = '当前没有选中的片段，请把播放头移到片段上。';
    if (selectedIndex >= 0) {
      const clip = data.clips[selectedIndex];
      info = `当前片段：片段 ${selectedIndex + 1} · ${fmtTime(startOfClip(selectedIndex))} - ${fmtTime(startOfClip(selectedIndex) + (clip.end - clip.start))}`;
    }
    return [grid, note(`${info} 分割以白色播放头为准。`)];
  }

  function buildAudioSheet() {
    const nodes = [];
    if (state.audio) {
      nodes.push(miniRow({
        icon: 'i-music',
        name: state.audio.name,
        sub: '已添加到时间轴，会跟随播放头播放',
      }));
      nodes.push(optionGrid([
        optionButton({ label: '更换音频', icon: 'i-music', onClick: () => el.fileAudio.click() }),
        optionButton({ label: '移除音频', icon: 'i-trash', onClick: removeAudioFromUI }),
      ], 'cols-2'));
    } else {
      nodes.push(optionGrid([
        optionButton({ label: '本地音频', icon: 'i-music', onClick: () => el.fileAudio.click() }),
        optionButton({ label: '提取音频', icon: 'i-audio-file', onClick: () => toast('已提取原视频声音（演示）') }),
        optionButton({ label: '录音', icon: 'i-mic', onClick: () => toast('录音功能未接入（演示）') }),
      ], 'cols-3'));
      nodes.push(note('从本地选择一段音频，添加后与视频一起播放。'));
    }
    return nodes;
  }

  function buildTextSheet() {
    const form = make('div', 'text-form');
    const input = make('input', 'text-input');
    input.type = 'text';
    input.placeholder = '输入文字，例如：新的一天';
    input.maxLength = 30;
    input.setAttribute('aria-label', '输入文字');
    const add = make('button', 'btn primary', '添加');
    add.type = 'button';
    const styles = make('div', 'text-styles');
    styles.setAttribute('role', 'group');
    styles.setAttribute('aria-label', '文字样式');
    let textStyle = 'plain';
    for (const [value, label] of [['plain', '白色'], ['outline', '描边'], ['highlight', '黄色']]) {
      const button = make('button', 'chip', label);
      button.type = 'button';
      button.setAttribute('aria-pressed', String(textStyle === value));
      button.addEventListener('click', () => {
        textStyle = value;
        for (const choice of styles.children) choice.setAttribute('aria-pressed', String(choice === button));
      });
      styles.appendChild(button);
    }
    const submit = () => {
      const text = input.value.trim();
      if (!text) {
        toast('请输入文字');
        input.focus();
        return;
      }
      addTextOverlay(text, textStyle);
      input.value = '';
      toast('文字已添加到画面');
    };
    add.addEventListener('click', submit);
    input.addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        event.preventDefault();
        submit();
      }
    });
    form.append(input, add);

    const presets = make('div', 'text-presets');
    for (const preset of ['新的一天', '记录生活', '周末愉快', '2026', '获奖时刻']) {
      const chip = make('button', 'chip', preset);
      chip.type = 'button';
      chip.addEventListener('click', () => {
        input.value = preset;
        input.focus();
      });
      presets.appendChild(chip);
    }

    const nodes = [form, styles, presets];
    if (state.texts.length) {
      nodes.push(note(`画面中已有 ${state.texts.length} 段文字，点击文字右上角的 × 可以删除。`));
    } else {
      nodes.push(note('添加后可在预览画面中拖动文字。'));
    }
    return nodes;
  }

  function buildStickerSheet() {
    const grid = make('div', 'sticker-grid');
    for (const emoji of STICKERS) {
      const button = make('button', 'sticker-option', emoji);
      button.type = 'button';
      button.setAttribute('aria-label', `添加贴纸 ${emoji}`);
      button.addEventListener('click', () => {
        addSticker(emoji);
        if (!state.stickerHintShown) {
          state.stickerHintShown = true;
          toast('点击画面上的贴纸可以移除');
        }
      });
      grid.appendChild(button);
    }
    return [grid, note('贴纸会添加在画面中，点击贴纸即可移除。')];
  }

  function buildPipSheet() {
    const nodes = [];
    if (state.pip) {
      nodes.push(miniRow({
        icon: 'i-pip',
        name: '画中画 1',
        sub: '跟随主视频播放，可随时移除',
      }));
      nodes.push(optionGrid([
        optionButton({ label: '更换画面', icon: 'i-image', onClick: () => el.filePip.click() }),
        optionButton({ label: '移除画中画', icon: 'i-trash', onClick: removePipFromUI }),
      ], 'cols-2'));
    } else {
      nodes.push(optionGrid([
        optionButton({ label: '选择视频', icon: 'i-image', onClick: () => el.filePip.click() }),
      ], 'cols-1'));
      nodes.push(note('选择一段视频作为画中画，会叠加在画面右下角并跟随播放。'));
    }
    return nodes;
  }

  function buildEffectSheet() {
    const grid = make('div', 'effect-grid');
    for (const effect of EFFECTS) {
      const button = make('button', `effect-option${state.effect === effect.id ? ' is-active' : ''}`);
      button.type = 'button';
      button.dataset.effect = effect.id;
      const swatch = make('span', 'effect-swatch');
      const canvas = make('canvas');
      canvas.width = 180;
      canvas.height = 112;
      canvas.style.cssText = 'width:100%;height:100%;display:block';
      if (el.preview.readyState >= 2) {
        drawCover(el.preview, canvas.getContext('2d'), canvas.width, canvas.height);
      } else {
        swatch.style.background = effect.swatch;
      }
      canvas.style.filter = effect.filter;
      swatch.appendChild(canvas);
      button.append(swatch, make('span', 'effect-name', effect.name));
      button.addEventListener('click', () => {
        applyEffect(effect.id);
        $$('.effect-option', grid).forEach(node => {
          node.classList.toggle('is-active', node.dataset.effect === effect.id);
        });
        toast(`已应用特效：${effect.name}`);
      });
      grid.appendChild(button);
    }
    return [grid, note('特效只应用在预览画面上，不会修改原始素材。')];
  }

  function buildMaterialSheet() {
    const grid = optionGrid([
      optionButton({ label: '本地视频', icon: 'i-plus', onClick: () => el.fileVideo.click() }),
      optionButton({ label: '添加文本', icon: 'i-text', onClick: () => openSheet('text') }),
      optionButton({ label: '添加贴纸', icon: 'i-sticker', onClick: () => openSheet('sticker') }),
      optionButton({ label: '添加音频', icon: 'i-music', onClick: () => openSheet('audio') }),
    ]);
    return [grid, note('添加的视频会插入到当前片段之后，可继续分割和编辑。')];
  }

  const SHEETS = {
    edit: { title: '剪辑', build: buildEditSheet },
    audio: { title: '音频', build: buildAudioSheet },
    text: { title: '文本', build: buildTextSheet },
    sticker: { title: '贴纸', build: buildStickerSheet },
    pip: { title: '画中画', build: buildPipSheet },
    effect: { title: '特效', build: buildEffectSheet },
    material: { title: '素材', build: buildMaterialSheet },
  };

  function updateActiveTool() {
    $$('.tool').forEach(button => {
      button.classList.toggle('is-active', button.dataset.tool === state.sheet);
    });
  }

  function openSheet(tool) {
    const definition = SHEETS[tool];
    if (!definition) return;
    const wasOpen = !el.sheetRoot.hidden && state.sheet !== null;
    state.sheet = tool;
    el.sheetTitle.textContent = definition.title;
    el.sheetBody.replaceChildren(...definition.build());
    el.sheetBody.scrollTop = 0;
    updateActiveTool();
    closeQualityMenu();
    el.toast.classList.remove('show');
    if (wasOpen) return;
    el.sheetRoot.hidden = false;
    el.sheetRoot.getBoundingClientRect();
    requestAnimationFrame(() => el.sheetRoot.classList.add('open'));
    if (state.data && state.data.playing) editor.togglePlayback();
  }

  function refreshSheet() {
    if (!state.sheet || el.sheetRoot.hidden) return;
    const definition = SHEETS[state.sheet];
    if (!definition) return;
    el.sheetBody.replaceChildren(...definition.build());
  }

  function closeSheet() {
    if (el.sheetRoot.hidden) return;
    el.sheetRoot.classList.remove('open');
    el.toast.style.bottom = '';
    state.sheet = null;
    updateActiveTool();
    setTimeout(() => {
      if (!state.sheet) el.sheetRoot.hidden = true;
    }, 300);
  }

  /* ------------------------------------------------------------------ */
  /* 文字 / 贴纸 / 特效 / 画中画 / 音频                                 */
  /* ------------------------------------------------------------------ */

  function enableOverlayDrag(node, layer) {
    let drag = null;
    let moved = false;
    node.addEventListener('pointerdown', event => {
      if (!event.isPrimary || event.button !== 0 || event.target.closest('.ov-remove')) return;
      moved = false;
      drag = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        left: parseFloat(node.style.left),
        top: parseFloat(node.style.top)
      };
      node.setPointerCapture(event.pointerId);
    });
    node.addEventListener('pointermove', event => {
      if (!drag || drag.id !== event.pointerId) return;
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      if (!moved && Math.hypot(dx, dy) < 5) return;
      moved = true;
      const { width, height } = layer.getBoundingClientRect();
      const clamp = (value, inset) => Math.max(inset, Math.min(100 - inset, value));
      const xInset = Math.min(50, node.offsetWidth / width * 50);
      const yInset = Math.min(50, node.offsetHeight / height * 50);
      node.style.left = clamp(drag.left + dx / width * 100, xInset) + '%';
      node.style.top = clamp(drag.top + dy / height * 100, yInset) + '%';
    });
    node.addEventListener('lostpointercapture', () => { drag = null; });
    node.addEventListener('click', event => {
      if (!moved || !event.detail) return;
      moved = false;
      event.stopImmediatePropagation();
    }, true);
  }

  function addTextOverlay(text, textStyle) {
    const node = make('div', 'text-overlay');
    node.dataset.textStyle = textStyle;
    node.style.left = '50%';
    node.style.top = Math.min(82, 48 + state.texts.length * 9) + '%';
    enableOverlayDrag(node, el.textStack);
    node.appendChild(document.createTextNode(text));
    const remove = make('button', 'ov-remove', '×');
    remove.type = 'button';
    remove.setAttribute('aria-label', '删除这段文字');
    remove.addEventListener('click', event => {
      event.stopPropagation();
      node.remove();
      state.texts = state.texts.filter(item => item.node !== node);
      toast('已删除文字');
      updateTextSheetNote();
    });
    node.appendChild(remove);
    el.textStack.appendChild(node);
    state.texts.push({ node, text });
    updateTextSheetNote();
  }

  function updateTextSheetNote() {
    if (state.sheet !== 'text') return;
    const noteEl = el.sheetBody.querySelector('.sheet-note');
    if (!noteEl) return;
    noteEl.textContent = state.texts.length
      ? `画面中已有 ${state.texts.length} 段文字，点击文字右上角的 × 可以删除。`
      : '添加后可在预览画面中拖动文字。';
  }

  function addSticker(emoji) {
    const node = make('button', 'sticker', emoji);
    node.type = 'button';
    node.title = '点击移除贴纸';
    const spot = STICKER_SPOTS[state.stickers.length % STICKER_SPOTS.length];
    node.style.left = `${spot[0]}%`;
    node.style.top = `${spot[1]}%`;
    node.addEventListener('click', event => {
      event.stopPropagation();
      node.remove();
      state.stickers = state.stickers.filter(item => item.node !== node);
      toast('已移除贴纸');
    });
    enableOverlayDrag(node, el.stickerLayer);
    el.stickerLayer.appendChild(node);
    state.stickers.push({ node, emoji });
  }

  function applyEffect(id) {
    const effect = EFFECTS.find(item => item.id === id) || EFFECTS[0];
    state.effect = effect.id;
    el.preview.style.filter = effect.filter;
  }

  function addPip(file) {
    removePip(false);
    const url = URL.createObjectURL(file);
    const wrap = make('div', 'pip-wrap');
    const video = make('video');
    video.src = url;
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.setAttribute('playsinline', '');
    wrap.appendChild(video);
    const remove = make('button', 'pip-remove', '×');
    remove.type = 'button';
    remove.setAttribute('aria-label', '移除画中画');
    remove.addEventListener('click', event => {
      event.stopPropagation();
      removePip();
    });
    wrap.appendChild(remove);
    el.pipSlot.appendChild(wrap);
    state.pip = { wrap, el: video, url };
    const alignPip = () => {
      if (!state.pip || state.pip.el !== video || !state.data) return;
      const duration = video.duration;
      if (Number.isFinite(duration) && duration > 0) {
        video.currentTime = state.data.currentTime % duration;
      }
      if (state.data.playing) video.play().catch(() => {});
    };
    if (video.readyState >= 1) alignPip();
    else video.addEventListener('loadedmetadata', alignPip, { once: true });
    toast('已添加画中画');
    refreshSheet();
  }

  function removePip(showToast = true) {
    if (!state.pip) return;
    state.pip.el.pause();
    state.pip.wrap.remove();
    URL.revokeObjectURL(state.pip.url);
    state.pip = null;
    if (showToast) toast('已移除画中画');
    refreshSheet();
  }

  function removePipFromUI() {
    removePip();
  }

  function addAudio(file) {
    removeAudio(false);
    const url = URL.createObjectURL(file);
    const audio = new Audio(url);
    audio.preload = 'auto';
    audio.volume = 0.9;
    state.audio = { name: file.name, url, el: audio, duration: 0 };
    audio.addEventListener('loadedmetadata', () => {
      if (!state.audio) return;
      state.audio.duration = Number.isFinite(audio.duration) ? audio.duration : 0;
      if (state.data) renderAudio(state.data);
    });
    el.audioClipName.textContent = file.name;
    toast(`已添加音频「${file.name}」`, 2400);
    if (state.data) renderAudio(state.data);
    refreshSheet();
  }

  function removeAudio(showToast = true) {
    if (!state.audio) return;
    state.audio.el.pause();
    URL.revokeObjectURL(state.audio.url);
    state.audio = null;
    if (state.data) renderAudio(state.data);
    if (showToast) toast('已移除音频');
  }

  function removeAudioFromUI() {
    removeAudio();
    refreshSheet();
  }

  /* ------------------------------------------------------------------ */
  /* 导入视频                                                           */
  /* ------------------------------------------------------------------ */

  async function importVideo(file) {
    if (!file) return;
    if (state.importing) {
      toast('正在读取上一个视频，请稍候');
      return;
    }
    state.importing = true;
    toast('正在读取视频…', 5000);
    try {
      await editor.insertVideo(file);
      toast(`已添加片段「${file.name}」`, 2400);
      refreshSheet();
    } catch (error) {
      toast(error && error.message ? error.message : '无法读取这个视频');
    } finally {
      state.importing = false;
    }
  }

  /* ------------------------------------------------------------------ */
  /* 时间轴手势                                                         */
  /* ------------------------------------------------------------------ */

  function timeAtScreenX(clientX) {
    if (!state.data) return 0;
    return clamp(
      state.data.currentTime + (clientX - state.playheadX) / state.pps,
      0,
      state.data.duration
    );
  }

  function beginPan(event) {
    if (!state.data) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const interactive = event.target.closest('button:not(.clip)');
    if (interactive) return;
    state.pan = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startTime: state.data.currentTime,
      moved: false,
      clip: event.target.closest('.clip'),
      lastSeek: 0,
    };
    el.timeline.classList.add('is-panning');
    try {
      el.timeline.setPointerCapture(event.pointerId);
    } catch {
      /* 某些浏览器不支持对 div 捕获，忽略即可 */
    }
    if (state.data.playing) editor.togglePlayback();
    event.preventDefault();
  }

  function movePan(event) {
    const pan = state.pan;
    if (!pan || event.pointerId !== pan.pointerId) return;
    const delta = event.clientX - pan.startX;
    if (!pan.moved && Math.abs(delta) > 3) pan.moved = true;
    if (!pan.moved) return;
    const now = performance.now();
    if (now - pan.lastSeek < 30) return;
    pan.lastSeek = now;
    editor.seek(clamp(pan.startTime - delta / state.pps, 0, state.data.duration));
    event.preventDefault();
  }

  function endPan(event) {
    const pan = state.pan;
    if (!pan || event.pointerId !== pan.pointerId) return;
    state.pan = null;
    el.timeline.classList.remove('is-panning');
    if (!state.data) return;
    if (event.type === 'pointercancel') return;
    if (!pan.moved) {
      if (pan.clip && pan.clip.dataset.clipId) {
        editor.selectClip(Number(pan.clip.dataset.clipId));
      } else {
        editor.seek(timeAtScreenX(event.clientX));
      }
      return;
    }
    const delta = event.clientX - pan.startX;
    editor.seek(clamp(pan.startTime - delta / state.pps, 0, state.data.duration));
  }

  function onWheel(event) {
    if (!state.data) return;
    const amount = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    if (!amount) return;
    event.preventDefault();
    const now = performance.now();
    if (now - state.wheelAt < 40) return;
    state.wheelAt = now;
    editor.seek(clamp(state.data.currentTime + amount / state.pps, 0, state.data.duration));
  }

  /* ------------------------------------------------------------------ */
  /* 启动                                                               */
  /* ------------------------------------------------------------------ */

  function bindEvents() {
    el.play.addEventListener('click', togglePlayback);
    el.split.addEventListener('click', doSplit);
    el.undo.addEventListener('click', doUndo);
    el.redo.addEventListener('click', doRedo);
    el.fullscreen.addEventListener('click', toggleFullscreen);
    el.previewExit.addEventListener('click', event => {
      event.stopPropagation();
      exitPreviewMode();
    });
    el.mute.addEventListener('click', toggleMute);
    el.close.addEventListener('click', openExitModal);
    el.exportBtn.addEventListener('click', openExportModal);
    el.quality.addEventListener('click', event => {
      event.stopPropagation();
      toggleQualityMenu();
    });
    el.qualityMenu.addEventListener('click', event => {
      const button = event.target.closest('button[data-quality]');
      if (!button) return;
      setQuality(button.dataset.quality);
    });
    document.addEventListener('click', event => {
      if (!el.qualityMenu.hidden && !event.target.closest('#quality-menu, #btn-quality')) {
        closeQualityMenu();
      }
    });

    el.addMedia.addEventListener('click', () => el.fileVideo.click());
    el.audioAdd.addEventListener('click', () => openSheet('audio'));
    el.audioClip.addEventListener('click', () => openSheet('audio'));
    el.cover.addEventListener('click', openCoverModal);
    el.toolbar.addEventListener('click', event => {
      const button = event.target.closest('.tool');
      if (button) openSheet(button.dataset.tool);
    });
    el.sheetDone.addEventListener('click', closeSheet);
    el.sheetScrim.addEventListener('click', closeSheet);
    el.modalScrim.addEventListener('click', () => {
      if (!state.modalBusy) closeModal();
    });
    el.reenter.addEventListener('click', () => window.location.reload());

    el.frame.addEventListener('click', event => {
      if (event.target.closest('.text-overlay, .sticker, .pip-wrap, .ov-remove, .pip-remove')) return;
      togglePlayback();
    });

    el.timeline.addEventListener('pointerdown', beginPan);
    el.timeline.addEventListener('pointermove', movePan);
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      el.timeline.addEventListener(type, endPan);
    }
    el.timeline.addEventListener('wheel', onWheel, { passive: false });
    el.timeline.addEventListener('contextmenu', event => event.preventDefault());

    el.fileVideo.addEventListener('change', () => {
      const file = el.fileVideo.files && el.fileVideo.files[0];
      el.fileVideo.value = '';
      importVideo(file);
    });
    el.fileAudio.addEventListener('change', () => {
      const file = el.fileAudio.files && el.fileAudio.files[0];
      el.fileAudio.value = '';
      if (file) addAudio(file);
    });
    el.filePip.addEventListener('change', () => {
      const file = el.filePip.files && el.filePip.files[0];
      el.filePip.value = '';
      if (file) addPip(file);
    });

    document.addEventListener('fullscreenchange', () => {
      if (!document.fullscreenElement && inPreviewMode()) {
        el.app.classList.remove('preview-mode');
        el.previewExit.hidden = true;
      }
      updateFullscreenIcon();
    });
    document.addEventListener('keydown', event => {
      const typing = /^(INPUT|TEXTAREA)$/.test(document.activeElement && document.activeElement.tagName);
      if (event.key === 'Escape') {
        if (!el.modalRoot.hidden) closeModal();
        else if (!el.qualityMenu.hidden) closeQualityMenu();
        else if (!el.sheetRoot.hidden) closeSheet();
        else if (inPreviewMode()) exitPreviewMode();
        return;
      }
      if (typing) return;
      if (event.code === 'Space') {
        event.preventDefault();
        togglePlayback();
      } else if (event.key === 'ArrowLeft' && state.data) {
        editor.seek(clamp(state.data.currentTime - 1, 0, state.data.duration));
      } else if (event.key === 'ArrowRight' && state.data) {
        editor.seek(clamp(state.data.currentTime + 1, 0, state.data.duration));
      } else if (event.key.toLowerCase() === 's') {
        doSplit();
      } else if (event.key.toLowerCase() === 'm') {
        toggleMute();
      } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) doRedo();
        else doUndo();
      }
    });

    window.addEventListener('resize', () => {
      clearTimeout(state.resizeTimer);
      state.resizeTimer = setTimeout(() => {
        measure();
        state.layoutDirty = true;
        if (state.data) onState(state.data);
        renderAudio(state.data || { clips: [], currentTime: 0 });
        renderEmptyState(state.data);
      }, 120);
    });

    el.preview.addEventListener('loadedmetadata', () => {
      state.videoReady = true;
      renderEmptyState(state.data);
      renderCover(state.data || { clips: [] }, true);
      renderAudio(state.data || { clips: [], currentTime: 0 });
    });
    el.preview.addEventListener('loadeddata', () => {
      state.videoReady = true;
      renderEmptyState(state.data);
    });
  }

  function boot() {
    measure();
    state.bootAt = performance.now();
    el.statusTime.textContent = clockLabel();
    state.clockTimer = setInterval(() => {
      el.statusTime.textContent = clockLabel();
    }, 20000);
    bindEvents();
    updateFullscreenIcon();
    editor.subscribe(onState);
    renderEmptyState(state.data);
    // 首屏抽帧可能稍慢，之后再补一次封面
    setTimeout(() => {
      if (state.data && state.data.clips.length) renderCover(state.data, true);
    }, 700);
  }

  boot();

  // 方便调试与自动化检查
  window.__demo = {
    editor,
    getState: () => state.data,
    getPps: () => state.pps,
    getAudio: () => state.audio && {
      name: state.audio.name,
      paused: state.audio.el.paused,
      time: state.audio.el.currentTime,
      duration: state.audio.duration,
    },
    getTexts: () => state.texts.map(item => item.text),
    getEffect: () => state.effect,
  };
})();
