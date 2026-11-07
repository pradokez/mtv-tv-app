import { createEmitter, type PlayerAdapter } from "./player";

export interface LoadCall {
  videoId: string;
  startSec: number;
}

/**
 * Player that plays nothing: records `load` calls and lets the caller decide
 * when the current video ends or fails. Used by tests and by `?player=fake`.
 */
export class FakePlayer implements PlayerAdapter {
  readonly loads: LoadCall[] = [];
  private readonly ended = createEmitter<[videoId: string]>();
  private readonly errored = createEmitter<[videoId: string, code: number]>();
  private readonly loaded = createEmitter<[call: LoadCall]>();

  get current(): LoadCall | undefined {
    return this.loads.at(-1);
  }

  load(videoId: string, startSec: number): void {
    const call = { videoId, startSec };
    this.loads.push(call);
    this.loaded.emit(call);
  }

  onEnded(listener: (videoId: string) => void) {
    return this.ended.on(listener);
  }

  onError(listener: (videoId: string, code: number) => void) {
    return this.errored.on(listener);
  }

  /** Observes `load` calls (used by the dev view to render the current video). */
  onLoad(listener: (call: LoadCall) => void) {
    return this.loaded.on(listener);
  }

  /** Simulates the current video playing to the end. */
  end(): void {
    const current = this.current;
    if (current) this.ended.emit(current.videoId);
  }

  /** Simulates the current video failing with a YouTube error code (default 150: embed blocked). */
  fail(code = 150): void {
    const current = this.current;
    if (current) this.errored.emit(current.videoId, code);
  }
}

/** Renders a debug panel for `?player=fake`: current video plus end/error buttons. */
export function mountFakePlayerView(container: HTMLElement, player: FakePlayer): void {
  const panel = document.createElement("div");
  panel.className = "fake-player";
  const label = document.createElement("p");
  const endButton = button("Terminar", () => player.end());
  const failButton = button("Erro", () => player.fail());
  panel.append(label, endButton, failButton);
  container.append(panel);

  const render = (call?: LoadCall) => {
    label.textContent = call
      ? `Player falso: ${call.videoId} a partir de ${call.startSec}s (${player.loads.length}º load)`
      : "Player falso: nada carregado";
    panel.dataset.videoId = call?.videoId ?? "";
  };
  render(player.current);
  player.onLoad(render);
}

function button(text: string, onClick: () => void): HTMLButtonElement {
  const el = document.createElement("button");
  el.type = "button";
  el.textContent = text;
  el.addEventListener("click", onClick);
  return el;
}
