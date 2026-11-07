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
import { createTuner, type NowPlaying, type Tuner, type TunerStatus } from "./tuner/tuner";

async function main(): Promise<void> {
  const stage = document.getElementById("stage")!;
  const catalog = await loadCatalog();
  const firstChannel = catalog.channels()[0];
  if (!firstChannel) throw new Error("O catálogo não tem nenhum canal com vídeos");

  const player = createPlayer(stage);
  const tuner = createTuner({ catalog, player, clock: systemClock, random: mathRandom });
  showStatus(stage, tuner);

  const overlays = createOverlays({
    clock: systemClock,
    onExit: () => window.MtvTv?.exitApp(),
    onChange: mountOverlaysView(document.getElementById("overlays")!),
  });
  const showLowerThird = (nowPlaying: NowPlaying | undefined) => {
    const channel = nowPlaying && catalog.channel(nowPlaying.channelId);
    if (nowPlaying && channel) overlays.showInfo(lowerThirdLines(catalog.video(nowPlaying.videoId), channel.name));
  };
  tuner.onNowPlaying(showLowerThird);
  tuner.tune(firstChannel.id);

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
      // Zapping, guide and skip are wired by later slices (#5, #9).
      default:
        break;
    }
  };

  window.addEventListener("keydown", (event) => {
    const ui: UiState = { overlay: overlays.state().overlay, mode: "queue" };
    dispatch(map(event, ui));
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
function showStatus(stage: HTMLElement, tuner: Tuner): void {
  const overlay = createStatusOverlay(stage);
  let online = true;
  let status: TunerStatus = "playing";
  const render = () => {
    if (!online) overlay.show("Sem conexão com a internet");
    else if (status === "unavailable") overlay.show("Nenhum clipe disponível neste canal");
    else overlay.hide();
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
}

function showFatal(error: unknown): void {
  console.error(error);
  const el = document.getElementById("fatal")!;
  el.textContent = error instanceof Error ? error.message : String(error);
  el.hidden = false;
}

main().catch(showFatal);
