import "./style.css";
import { parseCatalog, type Catalog } from "./catalog/catalog";
import type { Command, UiState } from "./input/commands";
import { map } from "./input/input-mapper";
import { systemClock } from "./lib/clock";
import { watchConnectivity } from "./lib/connectivity";
import { mathRandom } from "./lib/random";
import { FakePlayer, mountFakePlayerView } from "./player/fake-player";
import type { PlayerAdapter } from "./player/player";
import { createYouTubePlayer } from "./player/youtube-player";
import { lowerThirdLines } from "./overlays/lower-third";
import { createOverlays } from "./overlays/overlays";
import { mountOverlaysView } from "./overlays/overlays-view";
import { createStatusOverlay } from "./overlays/status-overlay";
import { createPreferences } from "./preferences/preferences";
import { createTuner, type NowPlaying, type Tuner, type TunerStatus } from "./tuner/tuner";

async function main(): Promise<void> {
  const stage = document.getElementById("stage")!;
  const catalog = await loadCatalog();
  const defaultChannel = catalog.channels()[0];
  if (!defaultChannel) throw new Error("O catálogo não tem nenhum canal com vídeos");

  const player = createPlayer(stage);
  const preferences = createPreferences(window.localStorage);
  const tuner = createTuner({
    catalog,
    player,
    clock: systemClock,
    random: mathRandom,
    mode: preferences.mode(),
  });

  const overlays = createOverlays({
    clock: systemClock,
    onExit: () => window.MtvTv?.exitApp(),
    onChange: mountOverlaysView(document.getElementById("overlays")!),
  });
  // The lower third would name a clip that is not on screen behind the status message.
  const status = showStatus(stage, tuner, () => overlays.hideInfo());
  const showLowerThird = (nowPlaying: NowPlaying | undefined) => {
    if (status.isShown()) return;
    const channel = nowPlaying && catalog.channel(nowPlaying.channelId);
    if (nowPlaying && channel) overlays.showInfo(lowerThirdLines(catalog.video(nowPlaying.videoId), channel.name));
  };
  tuner.onNowPlaying(showLowerThird);
  tuner.onNowPlaying(({ channelId }) => preferences.setLastChannel(channelId));
  const last = preferences.lastChannel();
  tuner.tune(last && catalog.channel(last) ? last : defaultChannel.id);

  const dispatch = (command: Command): void => {
    switch (command.type) {
      case "showInfo":
        showLowerThird(tuner.current());
        break;
      case "back":
        overlays.back();
        break;
      case "exitMove":
        overlays.exitMove();
        break;
      case "exitSelect":
        overlays.exitSelect();
        break;
      case "channelUp":
        tuner.channelUp();
        break;
      case "channelDown":
        tuner.channelDown();
        break;
      case "skip":
        tuner.skip();
        break;
      case "skipBlocked":
        overlays.showNotice("Ao vivo: não dá para pular");
        break;
      case "toggleMode": {
        const next = tuner.mode() === "live" ? "queue" : "live";
        preferences.setMode(next);
        tuner.setMode(next);
        overlays.showNotice(next === "live" ? "Ao vivo" : "Fila");
        break;
      }
      // The guide is wired by a later slice (#9).
      default:
        break;
    }
  };

  window.addEventListener("keydown", (event) => {
    const ui: UiState = { overlay: overlays.state().overlay, mode: tuner.mode() };
    const command = map(event, ui);
    if (command.type === "none") return;
    event.preventDefault();
    dispatch(command);
  });

  // Contract with the Android shell: it calls this for every remote key and
  // exits the app on Back unless we answer `true`. Leaving is only possible
  // through the exit confirmation (`MtvTv.exitApp`), so every key is handled.
  window.dispatchTvKey = (type, key, code, keyCode) => {
    document.dispatchEvent(
      new KeyboardEvent(type, { key, code, keyCode, which: keyCode, bubbles: true, cancelable: true }),
    );
    return true;
  };
}

declare global {
  interface Window {
    /** Bridge injected by the Android shell; absent in a regular browser. */
    MtvTv?: { exitApp(): void };
    dispatchTvKey?: (type: string, key: string, code: string, keyCode: number, androidKeyCode?: number) => boolean;
  }
}

async function loadCatalog(): Promise<Catalog> {
  const response = await fetch("./catalog.json");
  if (!response.ok) throw new Error(`Não foi possível carregar o catálogo (HTTP ${response.status})`);
  return parseCatalog(await response.json());
}

/** `?player=fake` swaps YouTube for a debug panel, to develop without network. */
function createPlayer(stage: HTMLElement): PlayerAdapter {
  if (new URLSearchParams(window.location.search).get("player") !== "fake") {
    return createYouTubePlayer(stage);
  }
  const fake = new FakePlayer();
  mountFakePlayerView(stage, fake);
  return fake;
}

/**
 * Keeps the Tuner informed of the connection and covers the player with a
 * message when offline or when every video of the channel failed. Offline
 * wins: the channel may only look unavailable because there is no network.
 */
function showStatus(stage: HTMLElement, tuner: Tuner, onShow: () => void): { isShown(): boolean } {
  const overlay = createStatusOverlay(stage);
  let online = true;
  let status: TunerStatus = "playing";
  const message = () => {
    if (!online) return "Sem conexão com a internet";
    if (status === "unavailable") return "Nenhum clipe disponível neste canal";
    return undefined;
  };
  const render = () => {
    const text = message();
    if (text === undefined) return overlay.hide();
    overlay.show(text);
    onShow();
  };
  tuner.onStatus((next) => {
    status = next;
    render();
  });
  watchConnectivity((next) => {
    online = next;
    tuner.setOnline(next);
    render();
  });
  return { isShown: () => message() !== undefined };
}

function showFatal(error: unknown): void {
  console.error(error);
  const el = document.getElementById("fatal")!;
  el.textContent = error instanceof Error ? error.message : String(error);
  el.hidden = false;
}

main().catch(showFatal);
