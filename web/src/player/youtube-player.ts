import { systemClock, type Clock, type TimerId } from "../lib/clock";
import { createEmitter, type PlayerAdapter } from "./player";

const IFRAME_API_URL = "https://www.youtube.com/iframe_api";
/** Time to wait for playback before assuming the browser blocked autoplay with sound. */
const AUTOPLAY_CHECK_MS = 1500;

// Subset of the YouTube IFrame API used here.
// https://developers.google.com/youtube/iframe_api_reference
const State = { UNSTARTED: -1, ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 } as const;

interface YTPlayer {
  loadVideoById(options: { videoId: string; startSeconds: number }): void;
  playVideo(): void;
  mute(): void;
  unMute(): void;
  getPlayerState(): number;
  setPlaybackQuality?(quality: string): void;
  destroy(): void;
}

interface YTNamespace {
  Player: new (
    element: HTMLElement,
    options: {
      width: string;
      height: string;
      playerVars: Record<string, string | number>;
      events: {
        onReady(): void;
        onStateChange(event: { data: number }): void;
        onError(event: { data: number }): void;
      };
    },
  ) => YTPlayer;
}

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

export interface YouTubePlayerOptions {
  clock?: Clock;
  /** The host guarantees autoplay with sound (Android shell), so the fallback to muted never applies. */
  autoplayAllowed?: boolean;
}

/**
 * Player Adapter backed by the YouTube IFrame API: no visible controls,
 * autoplay, 720p preferred. If the browser blocks autoplay with sound (desktop
 * browsers without a prior user gesture), playback falls back to muted and a
 * hint asks for any key or click to turn the sound on. A browser that played
 * with sound once will not block it again, and a clip that is merely slow to
 * load looks just like a blocked one, so the check only runs until then.
 */
export function createYouTubePlayer(
  container: HTMLElement,
  { clock = systemClock, autoplayAllowed = false }: YouTubePlayerOptions = {},
): PlayerAdapter {
  const ended = createEmitter<[videoId: string]>();
  const errored = createEmitter<[videoId: string, code: number]>();
  const hint = createSoundHint(container);

  /** Set once the player is ready to take commands. */
  let player: YTPlayer | undefined;
  /**
   * After an error the embedded player keeps its controls overlay on screen
   * (seen on the Android TV WebView), even for the next videos. The next load
   * then goes to a fresh player instead.
   */
  let failed = false;
  let currentVideoId: string | undefined;
  let pending: { videoId: string; startSec: number } | undefined;
  let autoplayCheck: TimerId | undefined;
  let muted = false;
  let autoplayKnownOk = autoplayAllowed;

  const start = (videoId: string, startSec: number) => {
    if (!player) return;
    player.loadVideoById({ videoId, startSeconds: startSec });
    player.setPlaybackQuality?.("hd720");
    if (autoplayCheck !== undefined) clock.clearTimeout(autoplayCheck);
    if (!muted && !autoplayKnownOk) autoplayCheck = clock.setTimeout(checkAutoplay, AUTOPLAY_CHECK_MS);
  };

  // Still unstarted/cued after the wait means the browser refused to start it.
  // Buffering counts as started: a slow network must not trigger the fallback.
  const checkAutoplay = () => {
    autoplayCheck = undefined;
    if (!player) return;
    const state = player.getPlayerState();
    if (state !== State.UNSTARTED && state !== State.CUED) return;
    muted = true;
    player.mute();
    player.playVideo();
    hint.show();
    const unmute = () => {
      muted = false;
      autoplayKnownOk = true;
      player?.unMute();
      hint.hide();
    };
    window.addEventListener("keydown", unmute, { once: true, capture: true });
    window.addEventListener("pointerdown", unmute, { once: true, capture: true });
  };

  // Opening the app offline makes the script fail: try again once the
  // connection is back, and play whatever was loaded meanwhile.
  const retryWhenOnline = (error: unknown) => {
    console.error(error);
    window.addEventListener("online", mountPlayer, { once: true });
  };

  const mountPlayer = () => void loadIframeApi().then((YT) => {
    const mount = document.createElement("div");
    container.prepend(mount);
    const instance = new YT.Player(mount, {
      width: "100%",
      height: "100%",
      playerVars: {
        autoplay: 1,
        controls: 0,
        disablekb: 1,
        fs: 0,
        rel: 0,
        iv_load_policy: 3,
        playsinline: 1,
        origin: window.location.origin,
      },
      events: {
        onReady: () => {
          player = instance;
          // A replacement player must stay muted until the user unmutes.
          if (muted) instance.mute();
          if (pending) start(pending.videoId, pending.startSec);
          pending = undefined;
        },
        onStateChange: ({ data }) => {
          if (data === State.PLAYING && !muted) autoplayKnownOk = true;
          if (data === State.ENDED && currentVideoId) ended.emit(currentVideoId);
        },
        onError: ({ data }) => {
          failed = true;
          if (currentVideoId) errored.emit(currentVideoId, data);
        },
      },
    });
  }, retryWhenOnline);
  mountPlayer();

  const replacePlayer = () => {
    failed = false;
    if (autoplayCheck !== undefined) clock.clearTimeout(autoplayCheck);
    autoplayCheck = undefined;
    player?.destroy();
    player = undefined;
    mountPlayer();
  };

  return {
    load(videoId, startSec) {
      currentVideoId = videoId;
      if (failed && player) replacePlayer();
      if (player) start(videoId, startSec);
      else pending = { videoId, startSec };
    },
    onEnded: ended.on,
    onError: errored.on,
  };
}

let apiPromise: Promise<YTNamespace> | undefined;

function loadIframeApi(): Promise<YTNamespace> {
  apiPromise ??= new Promise((resolve, reject) => {
    if (window.YT?.Player) return resolve(window.YT);
    window.onYouTubeIframeAPIReady = () => resolve(window.YT!);
    const script = document.createElement("script");
    script.src = IFRAME_API_URL;
    script.onerror = () => {
      // Forget the failure so the next call can try again.
      apiPromise = undefined;
      script.remove();
      reject(new Error("Falha ao carregar o player do YouTube"));
    };
    document.head.append(script);
  });
  return apiPromise;
}

function createSoundHint(container: HTMLElement) {
  const el = document.createElement("p");
  el.className = "sound-hint";
  el.textContent = "Aperte qualquer tecla para ligar o som";
  el.hidden = true;
  container.append(el);
  return {
    show: () => (el.hidden = false),
    hide: () => (el.hidden = true),
  };
}
