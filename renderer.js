const setup = document.querySelector("#setup");
const lyricsView = document.querySelector("#lyricsView");
const clientIdInput = document.querySelector("#clientId");
const connectButton = document.querySelector("#connect");
const quitSetupButton = document.querySelector("#quitSetup");
const setupStatus = document.querySelector("#setupStatus");
const trackTitle = document.querySelector("#trackTitle");
const trackArtist = document.querySelector("#trackArtist");
const lyrics = document.querySelector("#lyrics");
const lockToggle = document.querySelector("#lockToggle");
const unlockButton = document.querySelector("#unlockButton");
const styleToggle = document.querySelector("#styleToggle");
const stylePanel = document.querySelector("#stylePanel");
const fontSizeInput = document.querySelector("#fontSizeInput");
const textColorInput = document.querySelector("#textColorInput");
const resetStyleButton = document.querySelector("#resetStyle");
const lineModeToggle = document.querySelector("#lineModeToggle");
const disconnectButton = document.querySelector("#disconnect");
const quitButton = document.querySelector("#quit");

const state = {
  track: null,
  lyrics: null,
  trackStartedAt: 0,
  progressAtStart: 0,
  lastProgressMs: 0,
  locked: false,
  lineMode: localStorage.getItem("lyrics_line_mode") || "two",
  renderedCurrent: "",
  renderedNext: "",
  lyricsTrackId: null,
  pollTimer: null,
  renderTimer: null,
  pollInFlight: false,
  requestSeq: 0,
  style: loadStyleSettings(),
};

init();

connectButton.addEventListener("click", async () => {
  setupStatus.textContent = "Opening Spotify authorization...";
  try {
    await window.overlayApi.startAuth(clientIdInput.value.trim());
  } catch (err) {
    setupStatus.textContent = err.message;
  }
});

quitSetupButton.addEventListener("click", () => window.overlayApi.quit());
quitButton.addEventListener("click", () => window.overlayApi.quit());

disconnectButton.addEventListener("click", async () => {
  await window.overlayApi.disconnect();
  showSetup();
});

lockToggle.addEventListener("click", async () => {
  await setLocked(!state.locked);
});

unlockButton.addEventListener("click", async () => {
  await setLocked(false);
});

lineModeToggle.addEventListener("click", () => {
  state.lineMode = state.lineMode === "two" ? "one" : "two";
  localStorage.setItem("lyrics_line_mode", state.lineMode);
  applyLineMode();
  renderSyncedLyrics();
});

styleToggle.addEventListener("click", () => {
  stylePanel.classList.toggle("is-hidden");
});

fontSizeInput.addEventListener("input", () => {
  state.style.fontSize = clampNumber(Number(fontSizeInput.value), 20, 56);
  saveStyleSettings();
  applyStyleSettings();
});

textColorInput.addEventListener("input", () => {
  state.style.color = normalizeColor(textColorInput.value, "#f6fff8");
  saveStyleSettings();
  applyStyleSettings();
});

resetStyleButton.addEventListener("click", () => {
  state.style = defaultStyleSettings();
  saveStyleSettings();
  applyStyleSettings();
});

window.addEventListener("resize", () => {
  window.requestAnimationFrame(applyMarqueeIfNeeded);
});

window.overlayApi.onAuthSuccess(() => {
  setupStatus.textContent = "";
  showLyrics();
});

window.overlayApi.onAuthError((message) => {
  setupStatus.textContent = message;
});

window.overlayApi.onToggleLock(() => {
  setLocked(!state.locked);
});

window.overlayApi.onSetLock((locked) => {
  setLocked(Boolean(locked));
});

async function init() {
  applyLineMode();
  applyStyleSettings();
  const status = await window.overlayApi.authStatus();
  clientIdInput.value = status.clientId || "";
  if (status.connected) showLyrics();
  else showSetup();
}

function showSetup() {
  stopPolling();
  resetPlaybackState();
  setup.classList.remove("is-hidden");
  lyricsView.classList.add("is-hidden");
}

function showLyrics() {
  setup.classList.add("is-hidden");
  lyricsView.classList.remove("is-hidden");
  startPolling();
}

function startPolling() {
  if (state.pollTimer || state.renderTimer) return;
  pollPlayer();
  state.pollTimer = window.setInterval(pollPlayer, 2500);
  state.renderTimer = window.setInterval(renderSyncedLyrics, 300);
}

function stopPolling() {
  if (state.pollTimer) window.clearInterval(state.pollTimer);
  if (state.renderTimer) window.clearInterval(state.renderTimer);
  state.pollTimer = null;
  state.renderTimer = null;
  state.pollInFlight = false;
  state.requestSeq += 1;
}

function resetPlaybackState() {
  state.track = null;
  state.lyrics = null;
  state.lyricsTrackId = null;
  state.trackStartedAt = 0;
  state.progressAtStart = 0;
  state.lastProgressMs = 0;
  state.renderedCurrent = "";
  state.renderedNext = "";
}

async function pollPlayer() {
  if (state.pollInFlight) return;
  state.pollInFlight = true;
  const seq = (state.requestSeq += 1);

  try {
    const track = await window.overlayApi.getPlayer();
    if (seq !== state.requestSeq) return;

    if (!track) {
      resetPlaybackState();
      trackTitle.textContent = "Waiting for Spotify";
      trackArtist.textContent = "Play a song in Spotify.";
      renderLines("No active track", "");
      return;
    }

    const changed = state.track?.id !== track.id;
    const previousProgress = currentProgress();
    state.track = track;
    syncProgress(track, changed, previousProgress);
    trackTitle.textContent = track.name;
    trackArtist.textContent = track.artist;

    const needsLyrics = changed || !state.lyrics || state.lyricsTrackId !== track.id;
    if (needsLyrics) {
      state.lyrics = null;
      state.lyricsTrackId = null;
      state.renderedCurrent = "";
      state.renderedNext = "";
      renderLines("Loading lyrics...", "");
      const lyricsResult = await window.overlayApi.getLyrics(track);
      if (seq !== state.requestSeq || state.track?.id !== track.id) return;
      state.lyrics = lyricsResult;
      state.lyricsTrackId = track.id;
      renderSyncedLyrics();
    }
  } catch (err) {
    if (state.track) {
      trackArtist.textContent = "Spotify unavailable; retrying...";
    } else {
      renderLines(err.message || "Spotify unavailable; retrying...", "");
    }
  } finally {
    if (seq === state.requestSeq) state.pollInFlight = false;
  }
}

function currentProgress() {
  if (!state.track) return 0;
  if (!state.track.isPlaying) return state.track.progressMs;
  return state.progressAtStart + (Date.now() - state.trackStartedAt);
}

function syncProgress(track, changed, previousProgress) {
  const now = Date.now();
  if (changed) {
    state.trackStartedAt = now;
    state.progressAtStart = track.progressMs;
    state.lastProgressMs = track.progressMs;
    return;
  }

  if (!track.isPlaying) {
    state.trackStartedAt = now;
    state.progressAtStart = track.progressMs;
    state.lastProgressMs = track.progressMs;
    return;
  }

  const spotifyProgress = track.progressMs || 0;
  const localProgress = Math.max(previousProgress || 0, state.lastProgressMs || 0);
  const backwardsJump = localProgress - spotifyProgress;
  const forwardsJump = spotifyProgress - localProgress;

  if (backwardsJump > 3000 || forwardsJump > 3000) {
    state.trackStartedAt = now;
    state.progressAtStart = spotifyProgress;
    state.lastProgressMs = spotifyProgress;
    return;
  }

  const stableProgress = Math.max(localProgress, spotifyProgress);
  state.trackStartedAt = now;
  state.progressAtStart = stableProgress;
  state.lastProgressMs = stableProgress;
}

function renderSyncedLyrics() {
  if (!state.track || !state.lyrics) return;
  if (state.lyricsTrackId && state.lyricsTrackId !== state.track.id) return;

  if (state.lyrics.source === "plain") {
    renderLines(state.lyrics.plain[0] || "No synced lyrics", state.lyrics.plain[1] || "");
    return;
  }

  if (state.lyrics.source !== "synced" || !state.lyrics.lines.length) {
    renderLines("No synced lyrics", "");
    return;
  }

  const progress = currentProgress() + 250;
  let activeIndex = -1;
  for (let i = 0; i < state.lyrics.lines.length; i += 1) {
    if (state.lyrics.lines[i].time <= progress) activeIndex = i;
    else break;
  }

  const current = state.lyrics.lines[activeIndex]?.text || "";
  const next = state.lyrics.lines[activeIndex + 1]?.text || "";
  const currentDuration = getLyricLineDuration(activeIndex);
  const nextDuration = getLyricLineDuration(activeIndex + 1);
  renderLines(current || "...", next, currentDuration, nextDuration);
}

function renderLines(current, next, currentDuration = 0, nextDuration = 0) {
  const nextText = state.lineMode === "two" ? next : "";
  if (state.renderedCurrent === current && state.renderedNext === nextText) return;
  state.renderedCurrent = current;
  state.renderedNext = nextText;

  lyrics.innerHTML = "";
  lyrics.append(createLyricLine("line current scroll-line", current, currentDuration));

  if (state.lineMode === "two") {
    lyrics.append(createLyricLine("line next scroll-line", next, nextDuration));
  }
  window.requestAnimationFrame(applyMarqueeIfNeeded);
}

function createLyricLine(className, text, duration = 0) {
  const line = document.createElement("div");
  line.className = className;
  line.dataset.duration = String(duration || 0);
  const span = document.createElement("span");
  span.className = "line-text";
  span.textContent = text;
  line.append(span);
  return line;
}

async function setLocked(locked) {
  state.locked = locked;
  document.body.classList.toggle("is-locked", state.locked);
  unlockButton.classList.add("is-hidden");
  lockToggle.textContent = state.locked ? "Unlock" : "Lock";
  await window.overlayApi.setClickThrough(state.locked);
}

function applyLineMode() {
  document.body.classList.toggle("one-line-mode", state.lineMode === "one");
  lineModeToggle.textContent = state.lineMode === "two" ? "2 lines" : "1 line";
  state.renderedCurrent = "";
  state.renderedNext = "";
}

function defaultStyleSettings() {
  return {
    fontSize: 38,
    color: "#f6fff8",
  };
}

function loadStyleSettings() {
  const defaults = defaultStyleSettings();
  try {
    const saved = JSON.parse(localStorage.getItem("lyrics_style") || "{}");
    return {
      fontSize: clampNumber(Number(saved.fontSize || defaults.fontSize), 20, 56),
      color: normalizeColor(saved.color, defaults.color),
    };
  } catch {
    return defaults;
  }
}

function saveStyleSettings() {
  localStorage.setItem("lyrics_style", JSON.stringify(state.style));
}

function applyStyleSettings() {
  const fontSize = clampNumber(Number(state.style.fontSize), 20, 56);
  const nextSize = Math.max(14, Math.round(fontSize * 0.62));
  document.documentElement.style.setProperty("--lyrics-size", `${fontSize}px`);
  document.documentElement.style.setProperty("--lyrics-next-size", `${nextSize}px`);
  document.documentElement.style.setProperty("--text", state.style.color);
  document.documentElement.style.setProperty("--muted", hexToRgba(state.style.color, 0.58));
  fontSizeInput.value = String(fontSize);
  textColorInput.value = state.style.color;
  window.requestAnimationFrame(applyMarqueeIfNeeded);
}

function clampNumber(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function normalizeColor(value, fallback) {
  return /^#[0-9a-f]{6}$/i.test(value || "") ? value.toLowerCase() : fallback;
}

function hexToRgba(hex, alpha) {
  const normalized = normalizeColor(hex, "#f6fff8");
  const red = parseInt(normalized.slice(1, 3), 16);
  const green = parseInt(normalized.slice(3, 5), 16);
  const blue = parseInt(normalized.slice(5, 7), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function applyMarqueeIfNeeded() {
  document.querySelectorAll(".scroll-line").forEach((line) => {
    line.classList.remove("is-marquee");
    line.style.removeProperty("--scroll-distance");
    line.style.removeProperty("--scroll-duration");

    const text = line.querySelector(".line-text");
    if (!text) return;
    const overflow = text.scrollWidth - line.clientWidth;
    if (overflow <= 8) return;

    const distance = overflow + 28;
    const available = Number(line.dataset.duration || 0);
    const byDistance = distance / 36;
    const byLyricTime = available > 0 ? Math.max(1.8, available / 1000 - 0.35) : byDistance;
    const duration = Math.max(1.8, Math.min(byDistance, byLyricTime, 16));
    const delay = available > 0 ? Math.max(0.25, Math.min(0.9, available / 1000 * 0.16)) : 0.75;
    line.style.setProperty("--scroll-distance", `${distance}px`);
    line.style.setProperty("--scroll-duration", `${duration}s`);
    line.style.setProperty("--scroll-delay", `${delay}s`);
    text.style.setProperty("--scroll-distance", `${distance}px`);
    text.style.setProperty("--scroll-duration", `${duration}s`);
    text.style.setProperty("--scroll-delay", `${delay}s`);
    line.classList.add("is-marquee");
  });
}

function getLyricLineDuration(index) {
  if (!state.lyrics?.lines?.length || index < 0) return 0;
  const current = state.lyrics.lines[index];
  const next = state.lyrics.lines[index + 1];
  if (!current || !next) return 4500;
  return Math.max(1200, next.time - current.time);
}
