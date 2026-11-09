import "@fontsource/chakra-petch/latin-500.css";
import "@fontsource/chakra-petch/latin-600.css";
import "@fontsource/chakra-petch/latin-700.css";
import "./style.css";
import { parseCatalog, type Catalog } from "./catalog/catalog";
import { PLAY_PAUSE_KEY, type Command, type UiState } from "./input/commands";
import { map } from "./input/input-mapper";
import { systemClock } from "./lib/clock";
import { watchConnectivity } from "./lib/connectivity";
import { mathRandom } from "./lib/random";
import { FakePlayer, mountFakePlayerView } from "./player/fake-player";
import type { PlayerAdapter } from "./player/player";
import { createYouTubePlayer } from "./player/youtube-player";
import { commercialLines, lowerThirdLines } from "./overlays/lower-third";
import { guideRows } from "./overlays/guide";
import { guideOnAir } from "./overlays/on-air";
import { createOverlays } from "./overlays/overlays";
import { mountOverlaysView } from "./overlays/overlays-view";
import { createStatusOverlay } from "./overlays/status-overlay";
import { createPreferences, type PlaybackMode } from "./preferences/preferences";
import { createLiveSchedule } from "./schedule/live-schedule";
import { createTuner, type NowPlaying, type Tuner, type TunerStatus } from "./tuner/tuner";

async function main(): Promise<void> {
  const stage = document.getElementById("stage")!;
  const catalog = await loadCatalog();
  const defaultChannel = catalog.channels()[0];
  if (!defaultChannel) throw new Error("O catálogo não tem nenhum canal com vídeos");

  const player = createPlayer(stage);
  const preferences = createPreferences(window.localStorage);
  const schedule = createLiveSchedule(catalog);
  const tuner = createTuner({
    catalog,
    player,
    schedule,
    clock: systemClock,
    random: mathRandom,
    mode: preferences.mode(),
  });

  const overlays = createOverlays({
    clock: systemClock,
    onExit: () => window.MtvTv?.exitApp(),
    onChange: mountOverlaysView(document.getElementById("overlays")!, {
      clock: systemClock,
      onAir: (channelId, nowMs) => guideOnAir(catalog, schedule, channelId, nowMs),
    }),
  });
  // The lower third would name a clip that is not on screen behind the status message.
  const status = showStatus(stage, tuner, () => overlays.hideInfo());
  const showLowerThird = (nowPlaying: NowPlaying | undefined) => {
    if (status.isShown()) return;
    const channel = nowPlaying && catalog.channel(nowPlaying.channelId);
    if (nowPlaying && channel) {
      const number = catalog.channels().indexOf(channel) + 1;
      overlays.showInfo(
        nowPlaying.kind === "commercial"
          ? commercialLines(catalog.commercial(nowPlaying.videoId), channel.name, number)
          : lowerThirdLines(catalog.video(nowPlaying.videoId), channel.name, number),
      );
    }
  };
  // A break starts without the lower third; the Info button still shows it.
  tuner.onNowPlaying((nowPlaying) => nowPlaying.kind === "clip" && showLowerThird(nowPlaying));
  tuner.onNowPlaying(({ channelId }) => preferences.setLastChannel(channelId));
  const syncZapFilter = () => {
    // Ids of channels that left the catalog must not count, or zapping would find nowhere to go.
    const favorites = new Set(preferences.favorites().filter((id) => catalog.channel(id)));
    tuner.setZapFilter(preferences.favoritesOnly() ? favorites : undefined);
  };
  syncZapFilter();
  const rows = () => guideRows(catalog.channels(), preferences.favorites(), preferences.favoritesOnly(), tuner.mode());
  /** Rebuilds the guide after a favorite or the filter changed, warning when the filter has nothing to restrict to. */
  const favoritesChanged = () => {
    syncZapFilter();
    const next = rows();
    overlays.setGuideRows(next);
    if (next.some((row) => row.kind === "filter" && row.ignored)) overlays.showNotice("Sem favoritos: mostrando todos os canais");
  };
  const toggleMode = (): PlaybackMode => {
    const next = tuner.mode() === "live" ? "queue" : "live";
    preferences.setMode(next);
    tuner.setMode(next);
    return next;
  };
  const last = preferences.lastChannel();
  tuner.tune(last && catalog.channel(last) ? last : defaultChannel.id);

  /** OK in the guide: tunes the focused channel and closes, or changes the focused setting. */
  const selectInGuide = (): void => {
    const row = overlays.guideFocused();
    if (!row) return;
    if (row.kind === "mode") {
      toggleMode();
      overlays.setGuideRows(rows());
      return;
    }
    if (row.kind === "filter") {
      preferences.setFavoritesOnly(!preferences.favoritesOnly());
      favoritesChanged();
      return;
    }
    overlays.back();
    tuner.tune(row.id);
  };

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
      case "openGuide":
        overlays.openGuide(rows(), tuner.current()?.channelId);
        break;
      case "guideUp":
        overlays.guideMove(-1);
        break;
      case "guideDown":
        overlays.guideMove(1);
        break;
      case "guideSelect":
        selectInGuide();
        break;
      case "guideToggle": {
        const row = overlays.guideFocused();
        if (row?.kind !== "channel") break;
        preferences.toggleFavorite(row.id);
        favoritesChanged();
        break;
      }
      case "skipBlocked":
        overlays.showNotice("Ao vivo não se pula");
        break;
      case "toggleMode":
        overlays.showNotice(toggleMode() === "live" ? "Ao vivo" : "Fila");
        break;
      default:
        break;
    }
  };

  window.addEventListener("keydown", (event) => {
    const ui: UiState = { overlay: overlays.state().overlay, mode: tuner.mode() };
    const command = map(event, ui);
    // Play/Pause never reaches the media layer, even where it maps to nothing.
    if (command.type === "none" && event.key !== PLAY_PAUSE_KEY) return;
    event.preventDefault();
    if (command.type === "none") return;
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
    return createYouTubePlayer(stage, { autoplayAllowed: window.MtvTv !== undefined });
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
    if (!online) return { text: "Sem conexão com a internet" };
    if (status === "unavailable") {
      return { text: "Este canal não tem clipes que possam tocar agora.", hint: "Use ▲ ▼ para trocar de canal" };
    }
    return undefined;
  };
  const render = () => {
    const shown = message();
    if (shown === undefined) return overlay.hide();
    overlay.show(shown.text, shown.hint);
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
