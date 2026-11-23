(() => {
  const editor = window.createEditor(document.querySelector('#preview'));
  const position = document.querySelector('#position');
  const time = document.querySelector('#time');
  const clips = document.querySelector('#clips');
  const playhead = document.querySelector('#playhead');
  const split = document.querySelector('#split');
  const play = document.querySelector('#play');
  const remove = document.querySelector('#delete');
  const add = document.querySelector('#add');
  const file = document.querySelector('#file');
  const status = document.querySelector('#status');
  let clipButtons = new Map();
  let lastClips = '';
  let selectedClipId = null;
  let drag = null;
  let suppressedClick = null;
  let mediaError = '';
  let importStatus = '';

  function showStatus() {
    status.textContent = importStatus || mediaError;
    status.hidden = !status.textContent;
  }

  position.addEventListener('input', () => editor.seek(position.valueAsNumber));
  split.addEventListener('click', () => editor.splitAtPlayhead());
  play.addEventListener('click', () => editor.togglePlayback());
  remove.addEventListener('click', () => editor.deleteClip(selectedClipId));
  add.addEventListener('click', () => file.click());
  file.addEventListener('change', async () => {
    const video = file.files[0];
    file.value = '';
    if (!video) return;
    add.disabled = true;
    importStatus = '正在读取视频…';
    showStatus();
    try {
      await editor.insertVideo(video);
      importStatus = '';
    } catch (reason) {
      importStatus = reason.message;
    } finally {
      add.disabled = false;
      showStatus();
    }
  });

  clips.addEventListener('pointerdown', event => {
    const button = event.target.closest('button');
    if (!button || !event.isPrimary || event.button !== 0) return;
    suppressedClick = null;
    const gesture = {
      button, pointerId: event.pointerId, x: event.clientX, y: event.clientY,
      target: button, active: false
    };
    gesture.timer = setTimeout(() => {
      gesture.active = true;
      button.classList.add('dragging');
      button.setPointerCapture(gesture.pointerId);
    }, 450);
    drag = gesture;
  });

  clips.addEventListener('pointermove', event => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    if (!drag.active) {
      if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 10) {
        clearTimeout(drag.timer);
        drag = null;
      }
      return;
    }
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('button');
    if (!target || target.parentElement !== clips) return;
    drag.target.classList.remove('drop-target');
    drag.target = target;
    target.classList.add('drop-target');
  });

  function finishDrag(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const { button, target, active, timer } = drag;
    drag = null;
    clearTimeout(timer);
    button.classList.remove('dragging');
    target.classList.remove('drop-target');
    if (active && event.type === 'pointerup') {
      suppressedClick = button;
      editor.moveClip(Number(button.dataset.clipId), Array.from(clips.children).indexOf(target));
    }
  }

  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    clips.addEventListener(event, finishDrag);
  }
  clips.addEventListener('pointerleave', event => {
    if (drag && !drag.active) finishDrag(event);
  });
  clips.addEventListener('contextmenu', event => event.preventDefault());

  editor.subscribe(state => {
    selectedClipId = state.selectedClipId;
    position.disabled = state.duration === 0;
    position.max = state.duration;
    position.value = state.currentTime;
    time.value = `${state.currentTime.toFixed(2)} 秒 / ${state.duration.toFixed(2)} 秒`;
    playhead.style.left = `${state.duration ? 100 * state.currentTime / state.duration : 0}%`;
    split.disabled = !state.canSplit;
    play.disabled = !state.duration;
    play.textContent = state.playing ? '暂停' : '播放';
    remove.disabled = selectedClipId === null;
    mediaError = state.error;
    showStatus();

    const clipList = JSON.stringify(state.clips);
    if (clipList !== lastClips) {
      lastClips = clipList;
      clipButtons = new Map();
      const buttons = state.clips.map((clip, index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.clipId = clip.id;
        button.textContent = `片段 ${index + 1}`;
        button.title = clip.name;
        button.style.flex = `0 0 ${100 * (clip.end - clip.start) / state.duration}%`;
        button.addEventListener('click', () => {
          if (button !== suppressedClick) editor.selectClip(clip.id);
          suppressedClick = null;
        });
        clipButtons.set(clip.id, button);
        return button;
      });
      clips.replaceChildren(...buttons);
    }

    for (const [id, button] of clipButtons) {
      button.setAttribute('aria-pressed', String(id === selectedClipId));
    }
  });
})();

