(() => {
  const editor = window.createEditor(document.querySelector('#preview'));
  const position = document.querySelector('#position');
  const time = document.querySelector('#time');
  const clips = document.querySelector('#clips');
  const playhead = document.querySelector('#playhead');
  const split = document.querySelector('#split');
  let clipButtons = new Map();
  let lastClips = '';

  position.addEventListener('input', () => editor.seek(position.valueAsNumber));
  split.addEventListener('click', () => editor.splitAtPlayhead());

  editor.subscribe(state => {
    position.disabled = state.duration === 0;
    position.max = state.duration;
    position.value = state.currentTime;
    time.value = `${state.currentTime.toFixed(2)} 秒 / ${state.duration.toFixed(2)} 秒`;
    playhead.style.left = `${state.duration ? 100 * state.currentTime / state.duration : 0}%`;
    split.disabled = !state.canSplit;

    const clipList = JSON.stringify(state.clips);
    if (clipList !== lastClips) {
      lastClips = clipList;
      clipButtons = new Map();
      const buttons = state.clips.map((clip, index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = `片段 ${index + 1}`;
        button.style.flex = `0 0 ${100 * (clip.end - clip.start) / state.duration}%`;
        button.addEventListener('click', () => editor.selectClip(clip.id));
        clipButtons.set(clip.id, button);
        return button;
      });
      clips.replaceChildren(...buttons);
    }

    for (const [id, button] of clipButtons) {
      button.setAttribute('aria-pressed', String(id === state.selectedClipId));
    }
  });
})();

