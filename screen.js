const els = {
  roomCode: document.getElementById('roomCode'),
  controllerDot: document.getElementById('controllerDot'),
  controllerState: document.getElementById('controllerState'),
  score: document.getElementById('score'),
  attempts: document.getElementById('attempts'),
  made: document.getElementById('made'),
  qrBox: document.getElementById('qrBox'),
  controllerUrl: document.getElementById('controllerUrl'),
  toast: document.getElementById('toast'),
  ball: document.getElementById('ball'),
  ballShadow: document.getElementById('ballShadow'),
  newRoomBtn: document.getElementById('newRoomBtn'),
  resetScoreBtn: document.getElementById('resetScoreBtn')
};

const state = {
  room: null,
  controllerUrl: null,
  score: 0,
  attempts: 0,
  made: 0,
  lastShotId: 0,
  animating: false,
  currentBall: null,
};

function setToast(message, kind = '') {
  els.toast.className = `toast ${kind}`.trim();
  els.toast.innerHTML = message;
}

async function api(action, method = 'GET', body, params = {}) {
  const url = new URL('/.netlify/functions/game', window.location.origin);
  url.searchParams.set('action', action);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) url.searchParams.set(key, value);
  });
  const res = await fetch(url, {
    method,
    headers: method === 'POST' ? { 'content-type': 'application/json' } : undefined,
    body: method === 'POST' ? JSON.stringify(body || {}) : undefined,
    cache: 'no-store'
  });
  return res.json();
}

function renderStats() {
  els.roomCode.textContent = state.room || '----';
  els.score.textContent = String(state.score);
  els.attempts.textContent = String(state.attempts);
  els.made.textContent = String(state.made);
}

function renderControllerLink() {
  els.controllerUrl.href = state.controllerUrl;
  els.controllerUrl.textContent = state.controllerUrl;
  els.qrBox.innerHTML = '';
  if (window.QRCode && state.controllerUrl) {
    QRCode.toCanvas(state.controllerUrl, { width: 200, margin: 1 }, (error, canvas) => {
      if (!error && canvas) {
        els.qrBox.appendChild(canvas);
      } else {
        els.qrBox.innerHTML = '<div style="padding:16px;color:#111;text-align:center">QR non disponibile</div>';
      }
    });
  }
}

function setBallPosition(x, y, scale = 1) {
  els.ball.style.left = `${x}px`;
  els.ball.style.bottom = `${window.innerHeight - y}px`;
  els.ball.style.width = `${76 * scale}px`;
  els.ball.style.height = `${76 * scale}px`;
  els.ball.style.marginLeft = `${-(76 * scale) / 2}px`;
  els.ballShadow.style.left = `${x}px`;
}

function resetBall() {
  const rect = document.querySelector('.screen-shell').getBoundingClientRect();
  setBallPosition(rect.width * 0.5, rect.height * 0.79, 1);
  els.ball.classList.remove('made', 'miss');
}

function getArenaMetrics() {
  const shell = document.querySelector('.screen-shell').getBoundingClientRect();
  return {
    width: shell.width,
    height: shell.height,
    startX: shell.width * 0.5,
    startY: shell.height * 0.79,
    hoopX: shell.width * 0.5,
    hoopY: shell.height * 0.258,
    rimRadius: shell.width * 0.039,
    ballRadius: 38,
    floorY: shell.height * 0.87
  };
}

async function handleScore(made) {
  if (!state.room) return;
  const result = await api('score', 'POST', { room: state.room, made, points: 2 });
  if (result.ok) {
    state.score = result.score;
    state.attempts = result.attempts;
    state.made = result.made;
    renderStats();
  }
}

function animateShot(shot) {
  if (state.animating) return;
  state.animating = true;
  const metrics = getArenaMetrics();

  const ball = {
    x: metrics.startX,
    y: metrics.startY,
    vx: (shot.horizontal * metrics.width * 0.0052),
    vy: -((10 + shot.power * 16 + shot.arc * 7) * (metrics.height / 900)),
    g: 0.34 * (metrics.height / 900),
    made: false,
    scored: false,
    finished: false,
    radius: Math.max(24, metrics.width * 0.03)
  };

  const rimLeft = metrics.hoopX - metrics.rimRadius;
  const rimRight = metrics.hoopX + metrics.rimRadius;
  let lastTs = performance.now();

  function frame(ts) {
    const dt = Math.min(2, (ts - lastTs) / 16.67);
    lastTs = ts;

    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;
    ball.vy += ball.g * dt;

    const scale = Math.max(0.62, Math.min(1, 0.75 + ((metrics.startY - ball.y) / metrics.height) * 0.8));
    setBallPosition(ball.x, ball.y, scale);

    const shadowWidth = Math.max(52, 108 - (metrics.startY - ball.y) * 0.14);
    const shadowOpacity = Math.max(0.08, 0.24 - (metrics.startY - ball.y) / metrics.height * 0.35);
    els.ballShadow.style.width = `${shadowWidth}px`;
    els.ballShadow.style.marginLeft = `${-shadowWidth / 2}px`;
    els.ballShadow.style.opacity = String(shadowOpacity);

    const descending = ball.vy > 0;
    const nearHoopY = Math.abs(ball.y - metrics.hoopY) < metrics.height * 0.035;
    const insideRim = ball.x > rimLeft && ball.x < rimRight;

    if (!ball.scored && descending && nearHoopY && insideRim) {
      ball.scored = true;
      ball.made = true;
      els.ball.classList.add('made');
      setToast('<strong>Canestro!</strong> Bel tiro.', 'good');
      handleScore(true);
    }

    if (!ball.made) {
      const hitLeftRim = Math.hypot(ball.x - rimLeft, ball.y - metrics.hoopY) < ball.radius * 0.62;
      const hitRightRim = Math.hypot(ball.x - rimRight, ball.y - metrics.hoopY) < ball.radius * 0.62;
      if (hitLeftRim || hitRightRim) {
        ball.vx *= -0.72;
        ball.vy *= -0.54;
      }
    }

    if (ball.y > metrics.floorY || ball.x < -80 || ball.x > metrics.width + 80) {
      if (!ball.scored) {
        els.ball.classList.add('miss');
        setToast('<strong>Tiro fuori.</strong> Riprova con più precisione.', 'bad');
        handleScore(false);
      }
      state.animating = false;
      setTimeout(resetBall, 650);
      return;
    }

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

async function createRoom() {
  setToast('<strong>Creo la stanza...</strong>');
  const data = await api('createRoom', 'POST', {});
  if (!data.ok) {
    setToast('<strong>Errore.</strong> Impossibile creare la stanza.', 'bad');
    return;
  }
  state.room = data.room;
  state.controllerUrl = data.controllerUrl;
  state.score = 0;
  state.attempts = 0;
  state.made = 0;
  state.lastShotId = 0;
  renderStats();
  renderControllerLink();
  setToast('<strong>Inquadra il QR</strong> per usare il telefono come controller.');
}

async function pollState() {
  if (!state.room) return;
  const data = await api('state', 'GET', undefined, { room: state.room });
  if (!data.ok) return;
  state.score = data.score;
  state.attempts = data.attempts;
  state.made = data.made;
  renderStats();

  els.controllerDot.classList.toggle('online', data.controllerConnected);
  els.controllerState.textContent = data.controllerConnected ? 'Connesso' : 'Offline';

  if (data.controllerConnected && !state.animating) {
    setToast('<strong>Controller connesso.</strong> Fai il gesto del tiro dal telefono.');
  }

  if (data.lastShot && data.lastShot.id > state.lastShotId && !state.animating) {
    state.lastShotId = data.lastShot.id;
    animateShot(data.lastShot);
  }
}

els.newRoomBtn.addEventListener('click', createRoom);
els.resetScoreBtn.addEventListener('click', async () => {
  if (!state.room) return;
  const data = await api('reset', 'POST', { room: state.room });
  if (data.ok) {
    state.score = data.score;
    state.attempts = data.attempts;
    state.made = data.made;
    state.lastShotId = 0;
    renderStats();
    resetBall();
    setToast('<strong>Punteggio azzerato.</strong>');
  }
});
window.addEventListener('resize', resetBall);

await createRoom();
resetBall();
setInterval(pollState, 550);
pollState();
