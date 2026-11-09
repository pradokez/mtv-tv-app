import { installTizenKeys } from "./tizen-keys";

/**
 * Camada de plataforma: o único lugar que conhece a casca em que o app roda.
 * Telas, player e input consomem só esta interface, sem tocar em `window.MtvTv`
 * nem em `tizen`.
 */

export type PlatformKind = "tizen" | "android" | "browser";

export interface Platform {
  readonly kind: PlatformKind;
  /** Fecha o app. No navegador não há o que fechar, então não faz nada. */
  exitApp(): void;
  /** Prepara a casca na inicialização (ex.: registrar teclas na Tizen). Chamar uma vez. */
  init(): void;
  /**
   * Pede à casca que mantenha a tela acesa enquanto o app toca. Devolve a função
   * que libera o pedido. Só a Tizen age; nas demais é um no-op.
   */
  keepScreenOn(): () => void;
  /** `true` quando a casca libera autoplay com som sem gesto do usuário. */
  readonly autoplayAllowed: boolean;
}

declare global {
  interface Window {
    /** Ponte injetada pela casca Android; ausente no navegador e na Tizen. */
    MtvTv?: { exitApp(): void };
    /** API injetada pelo runtime da Tizen; ausente nas outras plataformas. */
    tizen?: TizenApi;
  }
}

/** Recorte da API `tizen` que o app usa. */
interface TizenApi {
  application?: { getCurrentApplication(): { exit(): void } };
  power?: {
    request(resource: "SCREEN", state: "SCREEN_NORMAL"): void;
    release(resource: "SCREEN"): void;
  };
}

const noop = (): void => {};

/** A API da Tizen lança sem o privilégio ou fora da TV; o app não deve cair por isso. */
function safely(fn: () => void): void {
  try {
    fn();
  } catch {
    // Sem o que fazer: o app segue tocando.
  }
}

function tizenPlatform(tizen: TizenApi, win: Window): Platform {
  let held = false;
  const release = (): void => {
    if (!held) return;
    held = false;
    safely(() => tizen.power?.release("SCREEN"));
  };
  return {
    kind: "tizen",
    init: () => installTizenKeys(win),
    exitApp() {
      release();
      safely(() => tizen.application?.getCurrentApplication().exit());
    },
    keepScreenOn() {
      if (!held) {
        held = true;
        safely(() => tizen.power?.request("SCREEN", "SCREEN_NORMAL"));
      }
      return release;
    },
    autoplayAllowed: true,
  };
}

export function detectPlatform(win: Window = window): Platform {
  if (win.tizen !== undefined) {
    return tizenPlatform(win.tizen, win);
  }
  const bridge = win.MtvTv;
  if (bridge !== undefined) {
    return { kind: "android", init: noop, exitApp: () => bridge.exitApp(), keepScreenOn: () => noop, autoplayAllowed: true };
  }
  return { kind: "browser", init: noop, exitApp: noop, keepScreenOn: () => noop, autoplayAllowed: false };
}
