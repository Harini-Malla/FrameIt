/* ===========================================================
   Polaroid Booth — Phase 1 prototype
   Vanilla HTML/CSS/JS as specified for the initial build.
=========================================================== */

const state = {
  mode: null,            // 'booth' | 'single'
  layout: null,          // e.g. '3x2'
  rows: 1,
  cols: 1,
  timerSeconds: 0,
  totalPoses: 1,
  currentPoseIndex: 0,
  poses: [],              // captured dataURLs, one per pose/row
  stream: null,
  facingMode: 'user',
  filter: 'none',
  caption: '',
  stickers: [],           // {id, emoji, xPct, yPct, z}
  nextStickerId: 1,
  nextZ: 1,
  selectedStickerId: null,
};

let history = [];
let future = [];

/* ---------- navigation ---------- */
function navigate(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('screen--active'));
  document.getElementById('screen-' + id).classList.add('screen--active');
  window.scrollTo(0, 0);
}
document.querySelectorAll('[data-nav]').forEach(btn => {
  btn.addEventListener('click', () => navigate(btn.dataset.nav));
});

/* ---------- home: mode selection ---------- */
document.querySelectorAll('.mode-card').forEach(card => {
  card.addEventListener('click', () => {
    const mode = card.dataset.mode;
    if (mode === 'bestie') { navigate('bestie-soon'); return; }

    state.mode = mode;
    if (mode === 'single') {
      state.rows = 1; state.cols = 1; state.totalPoses = 1;
      navigate('single-size');
    } else {
      navigate('layout');
    }
  });
});

document.querySelectorAll('#screen-single-size .layout-option').forEach(opt => {
  opt.addEventListener('click', () => {
    document.querySelectorAll('#screen-single-size .layout-option').forEach(o => o.classList.remove('is-selected'));
    opt.classList.add('is-selected');
    state.singleStyle = opt.dataset.size; // 'square' | 'full'
    setTimeout(() => navigate('timer'), 150);
  });
});

/* ---------- layout picker ---------- */
document.querySelectorAll('#screen-layout .layout-option').forEach(opt => {
  opt.addEventListener('click', () => {
    document.querySelectorAll('.layout-option').forEach(o => o.classList.remove('is-selected'));
    opt.classList.add('is-selected');
    state.layout = opt.dataset.layout;
    state.rows = parseInt(opt.dataset.rows, 10);
    state.cols = parseInt(opt.dataset.cols, 10);
    state.totalPoses = state.rows;
    setTimeout(() => navigate('timer'), 150);
  });
});

/* ---------- timer picker ---------- */
document.querySelectorAll('.timer-option').forEach(opt => {
  opt.addEventListener('click', () => {
    document.querySelectorAll('.timer-option').forEach(o => o.classList.remove('is-selected'));
    opt.classList.add('is-selected');
    state.timerSeconds = parseInt(opt.dataset.timer, 10);
  });
});
document.querySelector('[data-timer="0"]').classList.add('is-selected'); // default

document.getElementById('btn-start-camera').addEventListener('click', () => {
  state.currentPoseIndex = 0;
  state.poses = [];
  navigate('camera');
  updatePoseUI();
  startCamera();
});

/* ---------- camera ---------- */
const video = document.getElementById('video-preview');
const stage = document.getElementById('camera-stage');
const guide = document.getElementById('capture-guide');
const countdownEl = document.getElementById('countdown-overlay');
const captureBtn = document.getElementById('btn-capture');

function updatePoseUI() {
  const indicator = document.getElementById('pose-indicator');
  const hint = document.getElementById('pose-hint');
  const timerChip = document.getElementById('timer-chip');

  if (state.mode === 'single') {
    indicator.textContent = state.singleStyle === 'full' ? 'single photo · full frame' : 'single photo · square';
  } else {
    indicator.textContent = `pose ${state.currentPoseIndex + 1} of ${state.totalPoses}`;
  }
  hint.textContent = state.currentPoseIndex === 0 ? "get ready ♡" : "new pose! get ready ♡";
  timerChip.textContent = state.timerSeconds === 0 ? 'no timer' : `${state.timerSeconds}s timer`;
}

async function startCamera(facingMode) {
  facingMode = facingMode || state.facingMode;

  // Stop any previous camera stream before starting a new one.
  if (state.stream) {
    state.stream.getTracks().forEach(track => track.stop());
    state.stream = null;
  }

  const hint = document.getElementById('pose-hint');
  const originalHint =
    state.currentPoseIndex === 0 ? 'get ready ♡' : 'new pose! get ready ♡';

  // Always begin with the live video visible and the review hidden.
  reviewOverlay.hidden = true;
  reviewImage.removeAttribute('src');
  video.hidden = false;

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    hint.textContent = 'Camera is not available in this browser/context.';
    captureBtn.disabled = true;
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode },
      audio: false,
    });

    state.stream = stream;
    state.facingMode = facingMode;

    // THIS is the live camera feed. No image is inserted here.
    video.srcObject = stream;
    video.muted = true;
    video.autoplay = true;
    video.playsInline = true;
    video.classList.toggle('mirrored', facingMode === 'user');

    setupGuideForMode();

    captureBtn.disabled = true;
    hint.textContent = 'starting live camera…';

    const playLiveVideo = async () => {
      if (state.stream !== stream) return;

      try {
        await video.play();
      } catch (error) {
        console.warn('Live video play() was blocked; retrying on interaction.', error);
      }

      // Only enable capture after an actual video frame is available.
      if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        setTimeout(() => {
          if (
            state.stream === stream &&
            !video.paused &&
            video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
          ) {
            captureBtn.disabled = false;
            hint.textContent = originalHint;
          }
        }, 300);
      }
    };

    if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
      await playLiveVideo();
    } else {
      video.addEventListener('loadedmetadata', playLiveVideo, { once: true });
    }

    video.addEventListener('canplay', playLiveVideo, { once: true });

    // If the camera track ends, don't leave an old frame pretending to be live.
    stream.getVideoTracks().forEach(track => {
      track.addEventListener('ended', () => {
        if (state.stream === stream) {
          captureBtn.disabled = true;
          hint.textContent = 'Camera disconnected — start the camera again.';
        }
      });
    });

  } catch (err) {
    console.error(err);
    captureBtn.disabled = true;

    if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
      hint.textContent = 'Camera permission was denied. Allow camera access and try again.';
    } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
      hint.textContent = 'No camera was detected on this device.';
    } else if (err.name === 'NotReadableError') {
      hint.textContent = 'The camera is already being used by another app.';
    } else {
      hint.textContent = 'Could not start the camera. Please try again.';
    }
  }
}

/* ---------- auth screen (frontend preview only, no real backend yet) ---------- */
let authMode = 'signin';
function renderAuthMode() {
  const isSignUp = authMode === 'signup';
  document.getElementById('auth-eyebrow').textContent = isSignUp ? 'join us' : 'welcome back';
  document.getElementById('auth-title').textContent = isSignUp ? 'Create your account ♡' : 'Sign in ♡';
  document.getElementById('auth-name-field').hidden = !isSignUp;
  document.getElementById('btn-auth-submit').textContent = isSignUp ? 'Sign up' : 'Sign in';
  document.getElementById('auth-switch-text').textContent = isSignUp ? 'Already have an account?' : 'New here?';
  document.getElementById('btn-auth-switch').textContent = isSignUp ? 'Sign in instead' : 'Create an account';
}
document.getElementById('btn-auth-switch').addEventListener('click', () => {
  authMode = authMode === 'signin' ? 'signup' : 'signin';
  renderAuthMode();
});
document.getElementById('btn-auth-submit').addEventListener('click', () => {
  alert("This is a frontend preview — accounts go live once the backend (Phase 3) is built.");
});
document.querySelector('.auth-btn').addEventListener('click', () => { authMode = 'signin'; renderAuthMode(); });

document.getElementById('btn-flip-camera').addEventListener('click', () => {
  const next = state.facingMode === 'user' ? 'environment' : 'user';
  startCamera(next);
});

/* Timer is now changeable right from the camera screen — no need to
   back out to the timer-picker screen mid-session. */
const TIMER_SEQUENCE = [0, 3, 5, 10];
document.getElementById('timer-chip').addEventListener('click', () => {
  const idx = TIMER_SEQUENCE.indexOf(state.timerSeconds);
  state.timerSeconds = TIMER_SEQUENCE[(idx + 1) % TIMER_SEQUENCE.length];
  updatePoseUI();
});

/* Position the capture guide based on the chosen mode/shape.
   Booth mode always uses the tall rectangular guide. Single photo
   mode uses either a centered square guide or no guide at all
   (full camera frame, uncropped) depending on what was chosen. */
function setupGuideForMode() {
  if (state.mode === 'single' && state.singleStyle === 'full') {
    guide.style.display = 'none';
    hideMasks();
    return;
  }
  guide.style.display = 'block';

  if (state.mode === 'single' && state.singleStyle === 'square') {
    const stageRect = stage.getBoundingClientRect();
    const size = Math.min(stageRect.width, stageRect.height) * 0.72;
    guide.style.top = '50%';
    guide.style.left = '50%';
    guide.style.right = '';
    guide.style.bottom = '';
    guide.style.width = size + 'px';
    guide.style.height = size + 'px';
    guide.style.transform = 'translate(-50%, -50%)';
  } else {
    guide.style.width = '';
    guide.style.height = '';
    guide.style.top = '8%';
    guide.style.left = '10%';
    guide.style.right = '10%';
    guide.style.bottom = '14%';
    guide.style.transform = '';
  }
  // Let the layout settle, then size the four mask rectangles to
  // exactly match the guide's rendered position.
  requestAnimationFrame(updateGuideMasks);
}

function hideMasks() {
  ['mask-top', 'mask-bottom', 'mask-left', 'mask-right'].forEach(id => {
    document.getElementById(id).style.display = 'none';
  });
}

function updateGuideMasks() {
  const stageRect = stage.getBoundingClientRect();
  const guideRect = guide.getBoundingClientRect();
  const top = guideRect.top - stageRect.top;
  const left = guideRect.left - stageRect.left;
  const right = stageRect.right - guideRect.right;
  const bottom = stageRect.bottom - guideRect.bottom;

  const mTop = document.getElementById('mask-top');
  const mBottom = document.getElementById('mask-bottom');
  const mLeft = document.getElementById('mask-left');
  const mRight = document.getElementById('mask-right');
  [mTop, mBottom, mLeft, mRight].forEach(m => m.style.display = 'block');

  mTop.style.cssText += `top:0; left:0; right:0; height:${top}px;`;
  mBottom.style.cssText += `bottom:0; left:0; right:0; height:${bottom}px;`;
  mLeft.style.cssText += `top:${top}px; left:0; width:${left}px; height:${guideRect.height}px;`;
  mRight.style.cssText += `top:${top}px; right:0; width:${right}px; height:${guideRect.height}px;`;
}
window.addEventListener('resize', () => {
  if (document.getElementById('screen-camera').classList.contains('screen--active')) setupGuideForMode();
});

/* Map the on-screen guide (or full stage, for single-photo mode) to
   the underlying video's native pixel coordinates, accounting for
   object-fit: cover scaling — so what the user sees is exactly what
   gets captured. */
function getCropRectInVideoSpace() {
  const stageRect = stage.getBoundingClientRect();
  const useFullFrame = state.mode === 'single' && state.singleStyle === 'full';
  const cropRect = useFullFrame ? stageRect : guide.getBoundingClientRect();

  const vw = video.videoWidth, vh = video.videoHeight;
  const scale = Math.max(stageRect.width / vw, stageRect.height / vh);
  const displayedW = vw * scale, displayedH = vh * scale;
  const offsetX = (displayedW - stageRect.width) / 2;
  const offsetY = (displayedH - stageRect.height) / 2;

  const relX = cropRect.left - stageRect.left;
  const relY = cropRect.top - stageRect.top;

  return {
    sx: (relX + offsetX) / scale,
    sy: (relY + offsetY) / scale,
    sw: cropRect.width / scale,
    sh: cropRect.height / scale,
  };
}

function captureFrame() {
  // Capture ONLY from the currently active live <video> element.
  if (!state.stream || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
    return null;
  }

  const { sx, sy, sw, sh } = getCropRectInVideoSpace();
  const canvas = document.createElement('canvas');
  const outW = 480;
  const outH = Math.round(outW * (sh / sw));
  canvas.width = outW;
  canvas.height = outH;

  const ctx = canvas.getContext('2d');
  if (!video.videoWidth || !video.videoHeight) return null;

  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, outW, outH);
  return canvas.toDataURL('image/jpeg', 0.92);
}
function afterCapture(dataUrl) {
  state.poses.push(dataUrl);
  state.currentPoseIndex++;
  if (state.currentPoseIndex >= state.totalPoses) {
    if (state.stream) state.stream.getTracks().forEach(t => t.stop());
    buildEditor().then(() => navigate('editor'));
  } else {
    updatePoseUI();
  }
}

let captureInProgress = false;

async function runCountdownThenCapture() {
  if (captureInProgress || captureBtn.disabled) return;
  if (!state.stream || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;

  // If the browser paused the preview, resume it before capturing.
  if (video.paused) {
    try {
      await video.play();
    } catch (error) {
      return;
    }
  }

  captureInProgress = true;
  captureBtn.disabled = true;

  if (state.timerSeconds === 0) {
    const shot = captureFrame();
    if (shot) showReview(shot);
    captureInProgress = false;
    captureBtn.disabled = false;
    return;
  }

  let n = state.timerSeconds;
  countdownEl.classList.add('is-active');
  countdownEl.textContent = n;

  const tick = setInterval(() => {
    n--;

    if (n <= 0) {
      clearInterval(tick);
      countdownEl.classList.remove('is-active');

      // This is the exact frame visible in the live video at capture time.
      const shot = captureFrame();
      if (shot) showReview(shot);

      captureInProgress = false;
      captureBtn.disabled = false;
    } else {
      countdownEl.textContent = n;
    }
  }, 1000);
}
/* Review step: the camera keeps running behind this overlay, so
   "Retake" is instant — no need to restart the stream. */
const reviewOverlay = document.getElementById('review-overlay');
const reviewImage = document.getElementById('review-image');
let pendingCapture = null;

function showReview(dataUrl) {
  pendingCapture = dataUrl;
  reviewImage.src = dataUrl;
  reviewOverlay.hidden = false;
}
document.getElementById('btn-review-retake').addEventListener('click', async () => {
  reviewOverlay.hidden = true;
  reviewImage.removeAttribute('src');
  pendingCapture = null;

  // Keep the webcam stream alive and immediately return to the live preview.
  if (state.stream) {
    video.hidden = false;
    if (video.paused) {
      try { await video.play(); } catch (error) {}
    }
    captureBtn.disabled = false;
  }
});
document.getElementById('btn-review-keep').addEventListener('click', () => {
  reviewOverlay.hidden = true;
  const dataUrl = pendingCapture;
  pendingCapture = null;
  afterCapture(dataUrl);
});

captureBtn.addEventListener('click', runCountdownThenCapture);

/* ---------- editor ---------- */
const photosEl = document.getElementById('polaroid-photos');
const captionDisplay = document.getElementById('polaroid-caption-display');
const stickerLayer = document.getElementById('sticker-layer');
const stageEditor = document.getElementById('editor-stage');
const frameEl = document.getElementById('polaroid-frame');

async function buildEditor() {
  state.filter = 'none';
  state.stickers = [];
  state.caption = '';
  document.getElementById('caption-input').value = '';
  document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('filter-chip--active'));
  document.querySelector('[data-filter="none"]').classList.add('filter-chip--active');

  // Size the grid using the actual captured aspect ratio, rather than
  // assuming square cells — this matters once single-photo "full
  // frame" captures can be a different shape than the square guide.
  const firstImg = await loadImage(state.poses[0]);
  const cellAspect = firstImg.naturalWidth / firstImg.naturalHeight;
  photosEl.style.gridTemplateColumns = `repeat(${state.cols}, 1fr)`;
  photosEl.style.gridTemplateRows = `repeat(${state.rows}, 1fr)`;
  photosEl.style.aspectRatio = `${state.cols * cellAspect} / ${state.rows}`;
  photosEl.innerHTML = '';

  const isFilmStrip = state.cols === 1 && state.rows >= 2;
  frameEl.classList.toggle('polaroid-frame--filmstrip', isFilmStrip);

  for (let r = 0; r < state.rows; r++) {
    for (let c = 0; c < state.cols; c++) {
      const img = document.createElement('img');
      img.src = state.poses[r];
      photosEl.appendChild(img);
    }
  }
  renderCaption();
  renderStickers();
  pushHistory();
}

function applyFilterClass() {
  const map = { none: '', vintage: 'pf-vintage', film: 'pf-film', warm: 'pf-warm', cool: 'pf-cool', bw: 'pf-bw', dreamy: 'pf-dreamy' };
  photosEl.querySelectorAll('img').forEach(img => {
    img.className = map[state.filter] || '';
  });
}

function renderCaption() {
  captionDisplay.textContent = state.caption.trim() || 'our little moments ♡';
}

function renderStickers() {
  stickerLayer.innerHTML = '';
  // Array order IS stacking order: first = back, last = front.
  state.stickers.forEach((st, index) => {
    const el = document.createElement('div');
    el.className = 'sticker-item';
    el.textContent = st.emoji;
    el.style.left = st.xPct + '%';
    el.style.top = st.yPct + '%';
    el.style.zIndex = index + 1;
    el.dataset.id = st.id;
    attachStickerDrag(el, st);
    stickerLayer.appendChild(el);
  });
}

/* tabs */
document.querySelectorAll('.editor-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.editor-tab').forEach(t => t.classList.remove('editor-tab--active'));
    document.querySelectorAll('.editor-panel').forEach(p => p.classList.remove('editor-panel--active'));
    tab.classList.add('editor-tab--active');
    document.getElementById('panel-' + tab.dataset.panel).classList.add('editor-panel--active');
  });
});

/* filters */
document.querySelectorAll('.filter-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('filter-chip--active'));
    chip.classList.add('filter-chip--active');
    state.filter = chip.dataset.filter;
    applyFilterClass();
    pushHistory();
  });
});

/* caption */
const captionInput = document.getElementById('caption-input');
let captionDebounce;
captionInput.addEventListener('input', () => {
  state.caption = captionInput.value;
  renderCaption();
  clearTimeout(captionDebounce);
  captionDebounce = setTimeout(pushHistory, 400);
});

/* stickers: add */
document.querySelectorAll('.sticker-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    const st = {
      id: state.nextStickerId++,
      emoji: chip.dataset.sticker,
      xPct: 40 + Math.random() * 10,
      yPct: 40 + Math.random() * 10,
    };
    state.stickers.push(st); // new stickers land on top
    renderStickers();
    pushHistory();
  });
});

/* stickers: drag + reorder + delete */
function attachStickerDrag(el, st) {
  let dragging = false, startX, startY, origX, origY;

  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    dragging = true;
    el.setPointerCapture(e.pointerId);
    startX = e.clientX; startY = e.clientY;
    origX = st.xPct; origY = st.yPct;
    selectSticker(st.id);
  });
  el.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const rect = stageEditor.getBoundingClientRect();
    const dxPct = ((e.clientX - startX) / rect.width) * 100;
    const dyPct = ((e.clientY - startY) / rect.height) * 100;
    st.xPct = Math.max(0, Math.min(90, origX + dxPct));
    st.yPct = Math.max(0, Math.min(90, origY + dyPct));
    el.style.left = st.xPct + '%';
    el.style.top = st.yPct + '%';
  });
  el.addEventListener('pointerup', () => {
    if (dragging) { dragging = false; pushHistory(); }
  });
}

/* Stacking order is simply the array order: index 0 renders at the
   back, the last item renders at the front. Moving forward/backward
   swaps neighbors by exactly one step, which is what "one arrow tap"
   should feel like. */
function bringForward(id) {
  const i = state.stickers.findIndex(s => s.id === id);
  if (i < 0 || i === state.stickers.length - 1) return;
  [state.stickers[i], state.stickers[i + 1]] = [state.stickers[i + 1], state.stickers[i]];
}
function sendBackward(id) {
  const i = state.stickers.findIndex(s => s.id === id);
  if (i <= 0) return;
  [state.stickers[i], state.stickers[i - 1]] = [state.stickers[i - 1], state.stickers[i]];
}

let toolbarEl = null;
function selectSticker(id) {
  state.selectedStickerId = id;
  if (toolbarEl) toolbarEl.remove();
  const st = state.stickers.find(s => s.id === id);
  if (!st) return;

  toolbarEl = document.createElement('div');
  toolbarEl.className = 'sticker-toolbar';
  toolbarEl.style.cssText = `position:absolute; left:${st.xPct}%; top:${Math.max(0, st.yPct - 10)}%; display:flex; gap:4px; pointer-events:all; z-index:9999;`;
  toolbarEl.innerHTML = `
    <button type="button" class="icon-btn" style="width:26px;height:26px;font-size:12px;" title="Bring forward">↑</button>
    <button type="button" class="icon-btn" style="width:26px;height:26px;font-size:12px;" title="Send backward">↓</button>
    <button type="button" class="icon-btn" style="width:26px;height:26px;font-size:12px;" title="Remove">✕</button>
  `;
  const [fwd, back, del] = toolbarEl.querySelectorAll('button');
  // stopPropagation so the stage's own pointerdown (which closes the
  // toolbar on outside clicks) never sees this press and rebuilds
  // the toolbar in place after the reorder, so it stays usable for
  // repeated taps.
  fwd.addEventListener('pointerdown', (e) => e.stopPropagation());
  back.addEventListener('pointerdown', (e) => e.stopPropagation());
  del.addEventListener('pointerdown', (e) => e.stopPropagation());
  fwd.addEventListener('click', () => { bringForward(id); renderStickers(); selectSticker(id); pushHistory(); });
  back.addEventListener('click', () => { sendBackward(id); renderStickers(); selectSticker(id); pushHistory(); });
  del.addEventListener('click', () => {
    state.stickers = state.stickers.filter(s => s.id !== id);
    toolbarEl.remove(); toolbarEl = null;
    renderStickers();
    pushHistory();
  });
  stickerLayer.appendChild(toolbarEl);
}
stageEditor.addEventListener('pointerdown', (e) => {
  if (!e.target.closest('.sticker-item') && !e.target.closest('.sticker-toolbar') && toolbarEl) {
    toolbarEl.remove();
    toolbarEl = null;
  }
});

/* ---------- undo / redo ---------- */
function snapshot() {
  return JSON.stringify({
    filter: state.filter,
    caption: state.caption,
    stickers: state.stickers,
  });
}
function pushHistory() {
  history.push(snapshot());
  future = [];
}
function applySnapshot(s) {
  const data = JSON.parse(s);
  state.filter = data.filter;
  state.caption = data.caption;
  state.stickers = data.stickers;
  captionInput.value = state.caption;
  document.querySelectorAll('.filter-chip').forEach(c => c.classList.toggle('filter-chip--active', c.dataset.filter === state.filter));
  applyFilterClass();
  renderCaption();
  renderStickers();
}
document.getElementById('btn-undo').addEventListener('click', () => {
  if (history.length > 1) {
    future.push(history.pop());
    applySnapshot(history[history.length - 1]);
  }
});
document.getElementById('btn-redo').addEventListener('click', () => {
  if (future.length) {
    const s = future.pop();
    history.push(s);
    applySnapshot(s);
  }
});

/* ---------- final composition ---------- */
document.getElementById('btn-to-final').addEventListener('click', async () => {
  navigate('final');
  const canvas = document.getElementById('final-canvas');
  await renderFinalCanvas(canvas, 1.6);
});

const FILTER_CSS = {
  none: 'none',
  vintage: 'sepia(0.35) saturate(1.2) contrast(0.95)',
  film: 'contrast(1.1) saturate(0.9) brightness(1.02)',
  warm: 'sepia(0.15) saturate(1.3) brightness(1.05)',
  cool: 'hue-rotate(-10deg) saturate(0.9) brightness(1.02)',
  bw: 'grayscale(1) contrast(1.05)',
  dreamy: 'brightness(1.1) saturate(0.85) blur(1px)',
};

function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.src = src;
  });
}

async function renderFinalCanvas(canvas, scale) {
  await document.fonts.load(`16px "Caveat"`);
  const images = await Promise.all(state.poses.map(loadImage));
  const cellAspect = images[0].naturalWidth / images[0].naturalHeight;
  const isFilmStrip = state.cols === 1 && state.rows >= 2;

  const padding = (isFilmStrip ? 22 : 18) * scale;
  const sideMargin = isFilmStrip ? 14 * scale : 0;
  const captionH = 60 * scale;
  const cellGap = (isFilmStrip ? 4 : 5) * scale;
  const photoW = 220 * scale;
  const cellW = (photoW - cellGap * (state.cols - 1)) / state.cols;
  const cellH = cellW / cellAspect;
  const gridH = cellH * state.rows + cellGap * (state.rows - 1);

  canvas.width = photoW + padding * 2 + sideMargin * 2;
  canvas.height = padding + gridH + captionH;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = isFilmStrip ? '#1C1A17' : '#FFFDF8';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (isFilmStrip) {
    // sprocket holes down each edge
    ctx.fillStyle = '#F5EEE4';
    const holeR = 2.6 * scale, holeGap = 20 * scale;
    for (let y = padding * 0.4; y < canvas.height - captionH * 0.6; y += holeGap) {
      ctx.beginPath(); ctx.arc(sideMargin / 2 + 4 * scale, y, holeR, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(canvas.width - sideMargin / 2 - 4 * scale, y, holeR, 0, Math.PI * 2); ctx.fill();
    }
  }

  ctx.save();
  ctx.filter = FILTER_CSS[state.filter] || 'none';
  for (let r = 0; r < state.rows; r++) {
    for (let c = 0; c < state.cols; c++) {
      const img = images[r];
      const x = padding + sideMargin + c * (cellW + cellGap);
      const y = padding + r * (cellH + cellGap);
      // cover-fit draw
      const s = Math.max(cellW / img.width, cellH / img.height);
      const dw = img.width * s, dh = img.height * s;
      const dx = x - (dw - cellW) / 2, dy = y - (dh - cellH) / 2;
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, cellW, cellH);
      ctx.clip();
      ctx.drawImage(img, dx, dy, dw, dh);
      ctx.restore();
    }
  }
  ctx.restore();

  // caption
  ctx.fillStyle = isFilmStrip ? '#C9A990' : '#332B28';
  ctx.font = `${28 * scale}px "Caveat", cursive`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(state.caption.trim() || 'our little moments ♡', canvas.width / 2, padding + gridH + captionH / 2);

  // stickers
  ctx.font = `${26 * scale}px sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  state.stickers.forEach(st => {
    const x = padding + sideMargin + (st.xPct / 100) * photoW;
    const y = padding + (st.yPct / 100) * (gridH + captionH);
    ctx.fillText(st.emoji, x, y);
  });

  return canvas;
}

document.getElementById('btn-download-compressed').addEventListener('click', async () => {
  const c = document.createElement('canvas');
  await renderFinalCanvas(c, 1);
  c.toBlob(blob => downloadBlob(blob, 'polaroid-booth.jpg'), 'image/jpeg', 0.55);
});
document.getElementById('btn-download-full').addEventListener('click', async () => {
  const c = document.createElement('canvas');
  await renderFinalCanvas(c, 3);
  c.toBlob(blob => downloadBlob(blob, 'polaroid-booth-full.png'), 'image/png');
});
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}
