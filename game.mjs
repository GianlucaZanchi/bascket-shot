import { getStore } from "@netlify/blobs";
import { randomBytes } from "node:crypto";

const store = getStore({ name: "basket-rooms", consistency: "strong" });
const headers = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store"
};

const ROOM_TTL_MS = 1000 * 60 * 60 * 12;
const CONTROLLER_ONLINE_MS = 1000 * 10;

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers });

const bad = (message, status = 400) => json({ ok: false, error: message }, status);

function makeRoomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  const bytes = randomBytes(4);
  for (let i = 0; i < 4; i += 1) code += alphabet[bytes[i] % alphabet.length];
  return code;
}

async function loadRoom(room) {
  const raw = await store.get(room, { consistency: "strong" });
  if (!raw) return null;
  return JSON.parse(raw);
}

async function saveRoom(room, data) {
  await store.setJSON(room, data);
}

function publicRoom(room) {
  const now = Date.now();
  return {
    ok: true,
    room: room.room,
    createdAt: room.createdAt,
    updatedAt: room.updatedAt,
    score: room.score,
    attempts: room.attempts,
    made: room.made,
    controllerConnected: now - room.controllerLastSeen < CONTROLLER_ONLINE_MS,
    controllerLastSeen: room.controllerLastSeen,
    lastShot: room.lastShot,
  };
}

async function createRoom(origin) {
  for (let i = 0; i < 8; i += 1) {
    const room = makeRoomCode();
    const existing = await loadRoom(room);
    if (existing) continue;
    const state = {
      room,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      controllerLastSeen: 0,
      score: 0,
      attempts: 0,
      made: 0,
      shotSeq: 0,
      lastShot: null
    };
    await saveRoom(room, state);
    return {
      ok: true,
      room,
      controllerUrl: `${origin}/controller.html?room=${room}`
    };
  }
  throw new Error("Unable to generate room");
}

async function touchController(roomCode) {
  const room = await loadRoom(roomCode);
  if (!room) return null;
  room.controllerLastSeen = Date.now();
  room.updatedAt = Date.now();
  await saveRoom(roomCode, room);
  return room;
}

async function submitShot(roomCode, shot) {
  const room = await loadRoom(roomCode);
  if (!room) return null;
  room.shotSeq += 1;
  room.attempts += 1;
  room.controllerLastSeen = Date.now();
  room.updatedAt = Date.now();
  room.lastShot = {
    id: room.shotSeq,
    createdAt: Date.now(),
    power: Math.max(0.2, Math.min(1, Number(shot.power) || 0.55)),
    horizontal: Math.max(-1, Math.min(1, Number(shot.horizontal) || 0)),
    arc: Math.max(0.2, Math.min(1, Number(shot.arc) || 0.6)),
    source: shot.source === "motion" ? "motion" : "swipe"
  };
  await saveRoom(roomCode, room);
  return room;
}

async function applyScore(roomCode, made, points) {
  const room = await loadRoom(roomCode);
  if (!room) return null;
  const cleanPoints = Math.max(0, Math.min(3, Number(points) || 0));
  if (made) {
    room.score += cleanPoints || 2;
    room.made += 1;
  }
  room.updatedAt = Date.now();
  await saveRoom(roomCode, room);
  return room;
}

async function resetRoom(roomCode) {
  const room = await loadRoom(roomCode);
  if (!room) return null;
  room.score = 0;
  room.attempts = 0;
  room.made = 0;
  room.updatedAt = Date.now();
  room.lastShot = null;
  room.shotSeq = 0;
  await saveRoom(roomCode, room);
  return room;
}

async function cleanupOldRooms() {
  const { blobs } = await store.list();
  const now = Date.now();
  await Promise.all(
    blobs.map(async ({ key }) => {
      const room = await loadRoom(key);
      if (!room) return;
      if (now - room.updatedAt > ROOM_TTL_MS) {
        await store.delete(key);
      }
    })
  );
}

export default async (req) => {
  const url = new URL(req.url);
  const action = url.searchParams.get("action");
  const origin = url.origin;

  try {
    if (Math.random() < 0.05) {
      cleanupOldRooms().catch(() => {});
    }

    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));

      if (action === "createRoom") {
        return json(await createRoom(origin));
      }

      if (action === "heartbeat") {
        if (!body.room) return bad("Missing room");
        const room = await touchController(String(body.room).toUpperCase());
        if (!room) return bad("Room not found", 404);
        return json(publicRoom(room));
      }

      if (action === "shot") {
        if (!body.room) return bad("Missing room");
        const room = await submitShot(String(body.room).toUpperCase(), body.shot || {});
        if (!room) return bad("Room not found", 404);
        return json(publicRoom(room));
      }

      if (action === "score") {
        if (!body.room) return bad("Missing room");
        const room = await applyScore(String(body.room).toUpperCase(), Boolean(body.made), body.points);
        if (!room) return bad("Room not found", 404);
        return json(publicRoom(room));
      }

      if (action === "reset") {
        if (!body.room) return bad("Missing room");
        const room = await resetRoom(String(body.room).toUpperCase());
        if (!room) return bad("Room not found", 404);
        return json(publicRoom(room));
      }

      return bad("Unknown action", 404);
    }

    if (req.method === "GET") {
      if (action === "state") {
        const roomCode = url.searchParams.get("room");
        if (!roomCode) return bad("Missing room");
        const room = await loadRoom(roomCode.toUpperCase());
        if (!room) return bad("Room not found", 404);
        return json(publicRoom(room));
      }

      return bad("Unknown action", 404);
    }

    return bad("Method not allowed", 405);
  } catch (error) {
    return json({ ok: false, error: error.message || "Unexpected error" }, 500);
  }
};
