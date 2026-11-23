(() => {
  function createEditor(video) {
    let clips = [];
    let currentTime = 0;
    let selectedClipId = null;
    let nextId = 1;
    const listeners = new Set();

    function duration() {
      return clips.reduce((total, clip) => total + clip.end - clip.start, 0);
    }

    function clipAt(seconds) {
      let projectStart = 0;
      for (const [index, clip] of clips.entries()) {
        const length = clip.end - clip.start;
        if (seconds < projectStart + length || index === clips.length - 1) {
          return { clip, index, offset: seconds - projectStart };
        }
        projectStart += length;
      }
      return null;
    }

    function snapshot() {
      const position = clipAt(currentTime);
      return {
        clips: clips.map(clip => ({ ...clip })),
        currentTime,
        duration: duration(),
        selectedClipId,
        playing: !video.paused && !video.ended,
        canSplit: Boolean(position && position.clip.id === selectedClipId &&
          position.offset > 0.01 && position.clip.end - position.clip.start - position.offset > 0.01)
      };
    }

    function publish() {
      const state = snapshot();
      for (const listener of listeners) listener(state);
    }

    function subscribe(listener) {
      listeners.add(listener);
      listener(snapshot());
      return () => listeners.delete(listener);
    }

    function seek(seconds) {
      if (!Number.isFinite(seconds) || !clips.length) return;
      currentTime = Math.max(0, Math.min(seconds, duration()));
      const { clip, offset } = clipAt(currentTime);
      selectedClipId = clip.id;
      video.currentTime = clip.start + offset;
      publish();
    }

    function selectClip(clipId) {
      if (!clips.some(clip => clip.id === clipId)) return;
      selectedClipId = clipId;
      publish();
    }

    function splitAtPlayhead() {
      if (!snapshot().canSplit) return false;
      const { clip, index, offset } = clipAt(currentTime);
      const cut = clip.start + offset;
      const right = { id: nextId++, start: cut, end: clip.end };
      clips.splice(index, 1, { ...clip, end: cut }, right);
      selectedClipId = right.id;
      publish();
      return true;
    }

    function loadSample() {
      if (!Number.isFinite(video.duration) || video.duration <= 0) return;
      const sample = { id: nextId++, start: 0, end: video.duration };
      clips = [sample];
      currentTime = video.currentTime;
      selectedClipId = sample.id;
      publish();
    }

    // 第一轮只有同一条素材的连续片段，播放器时间与项目时间一致。
    video.addEventListener('timeupdate', () => {
      if (video.seeking || !clips.length) return;
      currentTime = Math.min(video.currentTime, duration());
      publish();
    });
    video.addEventListener('loadedmetadata', loadSample);
    for (const event of ['play', 'pause', 'ended']) {
      video.addEventListener(event, publish);
    }
    if (video.readyState >= 1) loadSample();

    return { subscribe, seek, selectClip, splitAtPlayhead };
  }

  window.createEditor = createEditor;
})();

