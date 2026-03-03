const params = new URLSearchParams(window.location.search);
const room = (params.get('room') || '').toUpperCase();

const els = {
  roomPill: document.getElementById('roomPill'),
  enableMotionBtn: document.getElementById('enableMotionBtn'),
  testShotBtn: document.getElementById('testShotBtn'),
  statusText: document.getElementById('statusText'),
  ball: document.getElementById('controllerBall'),
  powerMetric: document.getElementById('powerMetric'),
  directionMetric: document.getElementById('directionMetric'),
  arcMetric: document.getElementById('arcMetric')
};

const motionState = {
  enabled: false,
  samples: [],
  lastShotAt: 0,
  swipeStart: null
};

function setStatus(text) {
  els.statusText.innerHTML = text;
}

function setMetrics(shot) {
  els.powerMetric.textContent = Number(shot.power).toFixed(2);
  els.directionMetric.textContent = Number(shot.horizontal).toFixed(2);
  els.arcMetric.textContent = Number(shot.arc).toFixed(2);
}

async function api(action, method = 'POST', body) {
  const url = new URL('/.netlify/functions/game', window.location.origin);
  url.searchParams.set('action', action);
  const res = await fetch(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body || {}),
    cache: 'no-store'
  });
  return res.json();
}

async function heartbeat() {
  if (!room) return;
  const data = await api('heartbeat', 'POST', { room }).catch(() => null);
  if (!data?.ok) {
    setStatus('Stanza non trovata. Torna allo schermo e genera un nuovo QR.');
    return;
  }
  setStatus('Connesso. Muovi il telefono come un tiro oppure fai swipe sulla palla.');
}

async function sendShot(shot) {
  if (!room) return;
  const now = Date.now();
  if (now - motionState.lastShotAt < 1000) return;
  motionState.lastShotAt = now;
  setMetrics(shot);
  setStatus('Tiro inviato. Guarda lo schermo principale.');
  await api('shot', 'POST', { room, shot }).catch(() => null);
  navigator.vibrate?.(35);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

async function enableMotion() {
  try {
    if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
      const permission = await DeviceMotionEvent.requestPermission();
      if (permission !== 'granted') {
        setStatus('Permesso ai sensori negato. Usa lo swipe sulla palla.');
        return;
      }
    }

    window.addEventListener('devicemotion', onMotion, { passive: true });
    motionState.enabled = true;
    setStatus('Sensori attivi. Ora puoi tirare muovendo il telefono.');
    els.enableMotionBtn.textContent = 'Sensori attivi';
    els.enableMotionBtn.disabled = true;
  } catch {
    setStatus('Sensori non disponibili. Usa lo swipe sulla palla.');
  }
}

function onMotion(event) {
  const acc = event.accelerationIncludingGravity || event.acceleration;
  if (!acc) return;
  const ax = Number(acc.x) || 0;
  const ay = Number(acc.y) || 0;
  const az = Number(acc.z) || 0;
  const mag = Math.sqrt(ax * ax + ay * ay + az * az);
  const sample = { ax, ay, az, mag, t: Date.now() };
  motionState.samples.push(sample);
  motionState.samples = motionState.samples.filter((item) => sample.t - item.t < 260);

  if (sample.t - motionState.lastShotAt < 1000) return;
  if (mag < 20) return;

  const avgAx = motionState.samples.reduce((sum, item) => sum + item.ax, 0) / motionState.samples.length;
  const avgAy = motionState.samples.reduce((sum, item) => sum + item.ay, 0) / motionState.samples.length;
  const avgAz = motionState.samples.reduce((sum, item) => sum + item.az, 0) / motionState.samples.length;

  const shot = {
    source: 'motion',
    power: clamp((mag - 12) / 18, 0.25, 1),
    horizontal: clamp(avgAx / 10, -1, 1),
    arc: clamp((Math.abs(avgAy) + Math.abs(avgAz)) / 20, 0.25, 1)
  };

  sendShot(shot);
  motionState.samples = [];
}

function attachSwipeShot() {
  const ball = els.ball;

  function onStart(event) {
    const point = event.touches ? event.touches[0] : event;
    motionState.swipeStart = { x: point.clientX, y: point.clientY, t: Date.now() };
  }

  function onEnd(event) {
    if (!motionState.swipeStart) return;
    const point = event.changedTouches ? event.changedTouches[0] : event;
    const dx = point.clientX - motionState.swipeStart.x;
    const dy = point.clientY - motionState.swipeStart.y;
    const dt = Math.max(1, Date.now() - motionState.swipeStart.t);
    motionState.swipeStart = null;

    if (dy > -35) return;

    const speed = Math.sqrt(dx * dx + dy * dy) / dt;
    const shot = {
      source: 'swipe',
      power: clamp((-dy / 320) + speed * 0.28, 0.25, 1),
      horizontal: clamp(dx / 150, -1, 1),
      arc: clamp((-dy / 420) + 0.45, 0.25, 1)
    };

    sendShot(shot);
  }

  ball.addEventListener('pointerdown', onStart);
  ball.addEventListener('pointerup', onEnd);
  ball.addEventListener('touchstart', onStart, { passive: true });
  ball.addEventListener('touchend', onEnd, { passive: true });
}

if (!room) {
  els.roomPill.textContent = 'ROOM ----';
  setStatus('Link non valido. Apri questa pagina scansionando il QR dallo schermo principale.');
  els.enableMotionBtn.disabled = true;
  els.testShotBtn.disabled = true;
} else {
  els.roomPill.textContent = `ROOM ${room}`;
  heartbeat();
  setInterval(heartbeat, 3000);
}

els.enableMotionBtn.addEventListener('click', enableMotion);
els.testShotBtn.addEventListener('click', () => sendShot({ source: 'swipe', power: 0.72, horizontal: 0, arc: 0.72 }));
attachSwipeShot();
