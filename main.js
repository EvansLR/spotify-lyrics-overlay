const { app, BrowserWindow, ipcMain, shell, globalShortcut, screen, Tray, Menu, nativeImage } = require("electron");
const http = require("node:http");
const path = require("node:path");
const fs = require("node:fs/promises");
const crypto = require("node:crypto");

const SPOTIFY_AUTH_URL = "https://accounts.spotify.com/authorize";
const SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token";
const SPOTIFY_API = "https://api.spotify.com/v1";
const REDIRECT_URI = "http://127.0.0.1:8766/callback";
const SCOPES = ["user-read-currently-playing", "user-read-playback-state"];
const REQUEST_TIMEOUT_MS = 10000;
const LYRICS_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const LYRICS_NONE_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_LYRICS_CACHE_ENTRIES = 500;

let mainWindow;
let unlockWindow;
let tray;
let authServer;
let pkceVerifier = "";
let unlockPollTimer;
let isQuitting = false;

function appFile(...segments) {
  return path.join(__dirname, ...segments);
}

function userFile(name) {
  return path.join(app.getPath("userData"), name);
}

function sendToMainWindow(channel, ...args) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send(channel, ...args);
}

async function fetchWithTimeout(url, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err.name === "AbortError") throw new Error("Network request timed out.");
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

async function readResponseJson(response) {
  return response.json().catch(() => null);
}

async function readJson(name, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(userFile(name), "utf8"));
  } catch {
    return fallback;
  }
}

async function writeJson(name, data) {
  await fs.mkdir(app.getPath("userData"), { recursive: true });
  await fs.writeFile(userFile(name), JSON.stringify(data, null, 2), "utf8");
}

async function removeFile(name) {
  try {
    await fs.unlink(userFile(name));
  } catch {
    // Already gone.
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 220,
    minWidth: 420,
    minHeight: 150,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    resizable: true,
    icon: appFile("assets", "icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.setAlwaysOnTop(true, "screen-saver");
  mainWindow.loadFile("index.html");
  mainWindow.on("close", (event) => {
    if (isQuitting) return;
    event.preventDefault();
    mainWindow.hide();
  });
  mainWindow.on("closed", () => {
    stopUnlockHover();
    mainWindow = null;
  });
  createUnlockWindow();
}

function createTray() {
  if (tray) return;
  tray = new Tray(createTrayIcon());
  tray.setToolTip("Spotify Lyrics Overlay");
  tray.setContextMenu(createTrayMenu());
  tray.on("click", toggleMainWindow);
}

function createTrayIcon() {
  return nativeImage.createFromPath(appFile("assets", "icon.png")).resize({ width: 16, height: 16 });
}

function createTrayMenu() {
  return Menu.buildFromTemplate([
    { label: "Show / Hide", click: toggleMainWindow },
    { type: "separator" },
    { label: "Quit", click: quitApp },
  ]);
}

function toggleMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isVisible()) {
    mainWindow.hide();
    return;
  }
  mainWindow.show();
  mainWindow.focus();
  mainWindow.setAlwaysOnTop(true, "screen-saver");
}

function createUnlockWindow() {
  unlockWindow = new BrowserWindow({
    width: 46,
    height: 46,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    show: false,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, "unlock-preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  unlockWindow.setAlwaysOnTop(true, "screen-saver");
  unlockWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`
    <!doctype html>
    <html>
      <head>
        <style>
          html, body {
            width: 100%;
            height: 100%;
            margin: 0;
            background: transparent;
            overflow: hidden;
            font-family: system-ui, sans-serif;
          }
          button {
            position: relative;
            width: 38px;
            height: 38px;
            margin: 4px;
            border: 1px solid rgba(255,255,255,.18);
            border-radius: 8px;
            background: rgba(5,8,6,.42);
            backdrop-filter: blur(12px);
            cursor: pointer;
          }
          button::before {
            content: "";
            position: absolute;
            left: 50%;
            top: 19px;
            width: 14px;
            height: 11px;
            border: 2px solid rgba(246,255,248,.78);
            border-radius: 3px;
            transform: translateX(-50%);
          }
          button::after {
            content: "";
            position: absolute;
            left: 50%;
            top: 8px;
            width: 13px;
            height: 13px;
            border: 2px solid rgba(246,255,248,.78);
            border-bottom: 0;
            border-radius: 10px 10px 0 0;
            transform: translateX(-50%);
          }
          button:hover {
            background: rgba(30,215,96,.25);
          }
        </style>
      </head>
      <body>
        <button title="Unlock"></button>
        <script>
          document.querySelector("button").addEventListener("click", () => window.unlockApi.unlock());
        </script>
      </body>
    </html>
  `)}`);
  unlockWindow.on("closed", () => {
    unlockWindow = null;
  });
}

function registerShortcuts() {
  globalShortcut.register("Control+Alt+L", () => {
    sendToMainWindow("lock:toggle");
  });
}

function randomString(length) {
  return crypto.randomBytes(length).toString("base64url").slice(0, length);
}

function sha256Base64Url(value) {
  return crypto.createHash("sha256").update(value).digest("base64url");
}

async function startAuth(clientId) {
  if (!clientId) throw new Error("Client ID is required.");
  await writeJson("config.json", { clientId });

  pkceVerifier = randomString(96);
  const codeChallenge = sha256Base64Url(pkceVerifier);

  await stopAuthServer();
  authServer = http.createServer(async (req, res) => {
    const url = new URL(req.url, REDIRECT_URI);
    if (url.pathname !== "/callback") {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    const code = url.searchParams.get("code");
    const error = url.searchParams.get("error");
    if (error || !code) {
      res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(error || "Missing code");
      sendToMainWindow("auth:error", error || "Missing authorization code");
      return;
    }

    try {
      await exchangeCode(clientId, code);
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end("<h1>Spotify connected</h1><p>You can close this tab.</p>");
      sendToMainWindow("auth:success");
    } catch (err) {
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(err.message);
      sendToMainWindow("auth:error", err.message);
    } finally {
      await stopAuthServer();
    }
  });

  await new Promise((resolve, reject) => {
    authServer.once("error", reject);
    authServer.listen(8766, "127.0.0.1", resolve);
  });

  const authUrl = new URL(SPOTIFY_AUTH_URL);
  authUrl.search = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    scope: SCOPES.join(" "),
    redirect_uri: REDIRECT_URI,
    code_challenge_method: "S256",
    code_challenge: codeChallenge,
  }).toString();

  await shell.openExternal(authUrl.toString());
}

async function stopAuthServer() {
  if (!authServer) return;
  const server = authServer;
  authServer = null;
  await new Promise((resolve) => server.close(resolve));
}

async function exchangeCode(clientId, code) {
  const response = await fetchWithTimeout(SPOTIFY_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI,
      client_id: clientId,
      code_verifier: pkceVerifier,
    }),
  });

  const data = await readResponseJson(response);
  if (!response.ok) throw new Error(data?.error_description || data?.error || "Token exchange failed.");
  if (!data?.access_token) throw new Error("Spotify did not return an access token.");
  await storeToken(data);
}

async function storeToken(data) {
  const current = await readJson("token.json", {});
  await writeJson("token.json", {
    access_token: data.access_token,
    refresh_token: data.refresh_token || current.refresh_token,
    expires_at: Date.now() + Number(data.expires_in || 3600) * 1000,
  });
}

async function getConfig() {
  return readJson("config.json", {});
}

async function getToken() {
  const token = await readJson("token.json", null);
  if (!token) return null;
  if (Date.now() < token.expires_at - 60000) return token;

  const { clientId } = await getConfig();
  if (!clientId || !token.refresh_token) return null;

  const response = await fetchWithTimeout(SPOTIFY_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: token.refresh_token,
      client_id: clientId,
    }),
  });

  const data = await readResponseJson(response);
  if (!response.ok) {
    if (response.status === 400 || response.status === 401 || data?.error === "invalid_grant") {
      await removeFile("token.json");
    }
    throw new Error(data?.error_description || data?.error || "Could not refresh Spotify token.");
  }

  if (!data?.access_token) throw new Error("Spotify did not return an access token.");
  await storeToken(data);
  return readJson("token.json", null);
}

async function spotifyGet(pathname) {
  const token = await getToken();
  if (!token) return null;

  const response = await fetchWithTimeout(`${SPOTIFY_API}${pathname}`, {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });

  if (response.status === 204 || response.status === 404) return null;
  if (response.status === 401) await removeFile("token.json");
  if (!response.ok) {
    const data = await readResponseJson(response);
    throw new Error(data?.error?.message || "Spotify request failed.");
  }
  return readResponseJson(response);
}

function normalizeTrack(player) {
  const item = player?.item;
  if (!item || item.type !== "track") return null;
  return {
    id: item.id,
    name: item.name,
    artist: item.artists?.map((artist) => artist.name).join(", ") || "",
    firstArtist: item.artists?.[0]?.name || "",
    album: item.album?.name || "",
    durationMs: item.duration_ms || 0,
    progressMs: player.progress_ms || 0,
    isPlaying: Boolean(player.is_playing),
  };
}

async function getPlayer() {
  const player = await spotifyGet("/me/player");
  return normalizeTrack(player);
}

async function getLyrics(track) {
  if (!track?.id) return { lines: [], plain: [], source: "none" };

  const cache = await readJson("lyrics-cache.json", {});
  const cached = getCachedLyrics(cache, track.id);
  if (cached) return cached;

  const params = new URLSearchParams({
    track_name: track.name,
    artist_name: track.firstArtist || track.artist,
  });
  if (track.album) params.set("album_name", track.album);
  if (track.durationMs) params.set("duration", String(Math.round(track.durationMs / 1000)));

  const response = await fetchWithTimeout(`https://lrclib.net/api/get?${params.toString()}`, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    const result = { lines: [], plain: [], source: "none" };
    if (response.status === 404) await setCachedLyrics(cache, track.id, result, LYRICS_NONE_TTL_MS);
    return result;
  }

  const data = await readResponseJson(response);
  if (!isLikelyLyricMatch(track, data)) {
    const result = { lines: [], plain: [], source: "none" };
    await setCachedLyrics(cache, track.id, result, LYRICS_NONE_TTL_MS);
    return result;
  }

  const result = data.syncedLyrics
    ? { lines: parseLrc(data.syncedLyrics), plain: [], source: "synced" }
    : { lines: [], plain: (data.plainLyrics || "").split(/\r?\n/).filter(Boolean), source: data.plainLyrics ? "plain" : "none" };

  await setCachedLyrics(cache, track.id, result, result.source === "none" ? LYRICS_NONE_TTL_MS : LYRICS_CACHE_TTL_MS);
  return result;
}

function getCachedLyrics(cache, trackId) {
  const entry = cache[trackId];
  if (!entry) return null;

  if (entry.result) {
    const maxAge = Number(entry.ttlMs || 0) || (entry.result.source === "none" ? LYRICS_NONE_TTL_MS : LYRICS_CACHE_TTL_MS);
    if (Date.now() - Number(entry.savedAt || 0) < maxAge) return entry.result;
    delete cache[trackId];
    return null;
  }

  delete cache[trackId];
  return null;
}

async function setCachedLyrics(cache, trackId, result, ttlMs) {
  cache[trackId] = { savedAt: Date.now(), ttlMs, result };
  const entries = Object.entries(cache);
  if (entries.length > MAX_LYRICS_CACHE_ENTRIES) {
    entries
      .sort(([, a], [, b]) => Number(a?.savedAt || 0) - Number(b?.savedAt || 0))
      .slice(0, entries.length - MAX_LYRICS_CACHE_ENTRIES)
      .forEach(([key]) => delete cache[key]);
  }
  await writeJson("lyrics-cache.json", cache);
}

function isLikelyLyricMatch(track, data) {
  if (!data) return false;
  const returnedDuration = Number(data.duration || 0);
  if (returnedDuration && track.durationMs) {
    const expectedDuration = track.durationMs / 1000;
    if (Math.abs(returnedDuration - expectedDuration) > 5) return false;
  }
  return true;
}

function parseLrc(text) {
  const lines = [];
  for (const raw of text.split(/\r?\n/)) {
    const matches = Array.from(raw.matchAll(/\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]/g));
    if (!matches.length) continue;
    const lyric = raw.replace(/\[[^\]]+\]/g, "").trim();
    for (const match of matches) {
      const minutes = Number(match[1]);
      const seconds = Number(match[2]);
      const fraction = Number((match[3] || "0").padEnd(3, "0"));
      lines.push({ time: minutes * 60000 + seconds * 1000 + fraction, text: lyric });
    }
  }
  return lines.sort((a, b) => a.time - b.time);
}

ipcMain.handle("auth:start", (_event, clientId) => startAuth(clientId));
ipcMain.handle("auth:disconnect", async () => {
  await removeFile("token.json");
  return true;
});
ipcMain.handle("auth:status", async () => {
  const config = await getConfig();
  const token = await readJson("token.json", null);
  return { connected: Boolean(token), clientId: config.clientId || "" };
});
ipcMain.handle("spotify:player", getPlayer);
ipcMain.handle("lyrics:get", (_event, track) => getLyrics(track));
ipcMain.handle("window:set-click-through", (_event, enabled) => {
  setMainClickThrough(Boolean(enabled));
});
ipcMain.handle("window:quit", quitApp);
ipcMain.handle("lock-button:unlock", () => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.setIgnoreMouseEvents(false);
  stopUnlockHover();
  if (unlockWindow && !unlockWindow.isDestroyed()) unlockWindow.hide();
  sendToMainWindow("lock:set", false);
});

function setMainClickThrough(enabled) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.setIgnoreMouseEvents(enabled, { forward: true });
  if (enabled) startUnlockHover();
  else {
    stopUnlockHover();
    if (unlockWindow && !unlockWindow.isDestroyed()) unlockWindow.hide();
  }
}

function startUnlockHover() {
  stopUnlockHover();
  unlockPollTimer = setInterval(() => {
    if (!mainWindow || !unlockWindow || mainWindow.isDestroyed() || unlockWindow.isDestroyed()) {
      stopUnlockHover();
      return;
    }
    const point = screen.getCursorScreenPoint();
    const bounds = mainWindow.getBounds();
    const inside =
      point.x >= bounds.x &&
      point.x <= bounds.x + bounds.width &&
      point.y >= bounds.y &&
      point.y <= bounds.y + bounds.height;

    if (inside) {
      if (unlockWindow.isDestroyed()) return;
      unlockWindow.setBounds({
        x: bounds.x + bounds.width - 58,
        y: bounds.y + 12,
        width: 46,
        height: 46,
      });
      if (!unlockWindow.isVisible()) unlockWindow.showInactive();
    } else if (!unlockWindow.isDestroyed() && unlockWindow.isVisible()) {
      unlockWindow.hide();
    }
  }, 120);
}

function stopUnlockHover() {
  if (!unlockPollTimer) return;
  clearInterval(unlockPollTimer);
  unlockPollTimer = null;
}

app.whenReady().then(() => {
  createWindow();
  createTray();
  registerShortcuts();
});

app.on("will-quit", () => {
  isQuitting = true;
  stopUnlockHover();
  globalShortcut.unregisterAll();
});

function quitApp() {
  isQuitting = true;
  app.quit();
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
