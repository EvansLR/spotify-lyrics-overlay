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
const lineModeToggle = document.querySelector("#lineModeToggle");
const disconnectButton = document.querySelector("#disconnect");
const quitButton = document.querySelector("#quit");

const state = {
  track: null,
  lyrics: null,
  trackStartedAt: 0,
  progressAtStart: 0,
  locked: false,
  lineMode: localStorage.getItem("lyrics_line_mode") || "two",
  renderedCurrent: "",
  renderedNext: "",
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
  const status = await window.overlayApi.authStatus();
  clientIdInput.value = status.clientId || "";
  if (status.connected) showLyrics();
  else showSetup();
}

function showSetup() {
  setup.classList.remove("is-hidden");
  lyricsView.classList.add("is-hidden");
}

function showLyrics() {
  setup.classList.add("is-hidden");
  lyricsView.classList.remove("is-hidden");
  pollPlayer();
  window.setInterval(pollPlayer, 2500);
  window.setInterval(renderSyncedLyrics, 300);
}

async function pollPlayer() {
  try {
    const track = await window.overlayApi.getPlayer();
    if (!track) {
      trackTitle.textContent = "Waiting for Spotify";
      trackArtist.textContent = "Play a song in Spotify.";
      state.renderedCurrent = "";
      state.renderedNext = "";
      renderLines("No active track", "");
      return;
    }

    const changed = state.track?.id !== track.id;
    state.track = track;
    state.trackStartedAt = Date.now();
    state.progressAtStart = track.progressMs;
    trackTitle.textContent = track.name;
    trackArtist.textContent = track.artist;

    if (changed) {
      state.renderedCurrent = "";
      state.renderedNext = "";
      renderLines("Loading lyrics...", "");
      state.lyrics = await window.overlayApi.getLyrics(track);
      renderSyncedLyrics();
    }
  } catch (err) {
    renderLines(err.message, "");
  }
}

function currentProgress() {
  if (!state.track) return 0;
  if (!state.track.isPlaying) return state.track.progressMs;
  return state.progressAtStart + (Date.now() - state.trackStartedAt);
}

function renderSyncedLyrics() {
  if (!state.track || !state.lyrics) return;

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
  renderLines(current || "…", next, currentDuration, nextDuration);
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
