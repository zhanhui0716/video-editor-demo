(() => {
  const editor = window.createEditor(document.querySelector('#preview'));
  const position = document.querySelector('#position');
  const time = document.querySelector('#time');
  const clips = document.querySelector('#clips');
  const ruler = document.querySelector('#ruler');
  const split = document.querySelector('#split');
  const play = document.querySelector('#play');
  const remove = document.querySelector('#delete');
  const add = document.querySelector('#add');
  const file = document.querySelector('#file');
  const status = document.querySelector('#status');
  const undo = document.querySelector('#undo');
  const redo = document.querySelector('#redo');
  const mute = document.querySelector('#mute');
  const zoom = document.querySelector('#zoom');
  const timeline = document.querySelector('#timeline-scroll');
  const track = document.querySelector('#track');
  const jump = document.querySelector('#jump');
  const seconds = document.querySelector('#seconds');
  const jumpButton = jump.querySelector('button');
  let rulerDuration = -1;
  let clipButtons = new Map();
  let lastClips = '';
  let selectedClipId = null;
  let drag = null;
  let suppressedClick = null;
  let suppressTimelineClick = false;
  let mediaError = '';
  let importStatus = '';

  function showStatus() {
    status.textContent = importStatus || mediaError;
    status.hidden = !status.textContent;
  }

  function followPlayhead() {
    const duration = Number(position.max);
    timeline.scrollLeft = duration ? track.offsetWidth * position.valueAsNumber / duration : 0;
  }

  function drawRuler(duration) {
    if (duration === rulerDuration) return;
    rulerDuration = duration;
    ruler.replaceChildren();
    if (!duration) return;
    const step = Math.max(1, Math.ceil(duration / 6));
    for (let second = 0; second < duration; second += step) {
      const label = document.createElement('span');
      label.style.left = (second / duration * 100) + '%';
      label.textContent = second + ' 秒';
      ruler.append(label);
    }
  }

  new ResizeObserver(followPlayhead).observe(timeline);

  zoom.addEventListener('click', () => {
    const expanded = track.classList.toggle('zoomed');
    zoom.setAttribute('aria-pressed', String(expanded));
    zoom.textContent = expanded ? '显示全长' : '放大时间轴';
    followPlayhead();
  });
  timeline.addEventListener('click', event => {
    if (suppressTimelineClick || event.target.closest('button')) return;
    const bounds = track.getBoundingClientRect();
    editor.seek((event.clientX - bounds.left) / bounds.width * Number(position.max));
  });
  jump.addEventListener('submit', event => {
    event.preventDefault();
    editor.seek(seconds.valueAsNumber);
  });
  undo.addEventListener('click', () => editor.undo());
  redo.addEventListener('click', () => editor.redo());
  mute.addEventListener('click', () => editor.toggleMute());
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

  timeline.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0 || !Number(position.max)) return;
    const button = event.target.closest('button');
    suppressedClick = null;
    suppressTimelineClick = false;
    const gesture = {
      button, pointerId: event.pointerId, x: event.clientX, y: event.clientY,
      startTime: position.valueAsNumber, target: button, active: false, scrubbing: false
    };
    if (button) {
      gesture.timer = setTimeout(() => {
        gesture.active = true;
        button.classList.add('dragging');
        button.setPointerCapture(gesture.pointerId);
      }, 450);
    }
    drag = gesture;
  });

  timeline.addEventListener('pointermove', event => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    if (!drag.active) {
      const delta = drag.x - event.clientX;
      if (!drag.scrubbing && Math.abs(delta) > 8) {
        clearTimeout(drag.timer);
        drag.scrubbing = true;
        timeline.setPointerCapture(drag.pointerId);
      }
      if (drag.scrubbing) {
        editor.seek(drag.startTime + delta / track.offsetWidth * Number(position.max));
      } else if (Math.abs(event.clientY - drag.y) > 10) {
        clearTimeout(drag.timer);
      }
      return;
    }
    const viewport = timeline.getBoundingClientRect();
    if (event.clientX < viewport.left + 24) timeline.scrollLeft -= 16;
    if (event.clientX > viewport.right - 24) timeline.scrollLeft += 16;
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('button');
    if (!target || target.parentElement !== clips) return;
    drag.target.classList.remove('drop-target');
    drag.target = target;
    target.classList.add('drop-target');
  });

  function finishDrag(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const { button, target, active, timer, scrubbing } = drag;
    drag = null;
    clearTimeout(timer);
    button?.classList.remove('dragging');
    target?.classList.remove('drop-target');
    suppressTimelineClick = scrubbing;
    if (scrubbing) suppressedClick = button;
    if (active && event.type === 'pointerup') {
      suppressedClick = button;
      editor.moveClip(Number(button.dataset.clipId), Array.from(clips.children).indexOf(target));
    }
  }

  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    timeline.addEventListener(event, finishDrag);
  }
  timeline.addEventListener('pointerleave', event => {
    if (drag && !drag.active && !drag.scrubbing) finishDrag(event);
  });
  clips.addEventListener('contextmenu', event => event.preventDefault());

  editor.subscribe(state => {
    selectedClipId = state.selectedClipId;
    position.disabled = state.duration === 0;
    position.max = state.duration;
    position.value = state.currentTime;
    time.value = `${state.currentTime.toFixed(2)} 秒 / ${state.duration.toFixed(2)} 秒`;
    drawRuler(state.duration);
    if (!drag?.active) followPlayhead();
    seconds.disabled = jumpButton.disabled = zoom.disabled = !state.duration;
    seconds.max = state.duration;
    undo.disabled = !state.canUndo;
    redo.disabled = !state.canRedo;
    mute.disabled = !state.duration;
    mute.textContent = state.muted ? '开启原声' : '关闭原声';
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

