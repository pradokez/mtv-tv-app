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
  /** `true` quando a casca libera autoplay com som sem gesto do usuário. */
  readonly autoplayAllowed: boolean;
}

declare global {
  interface Window {
    /** Ponte injetada pela casca Android; ausente no navegador e na Tizen. */
    MtvTv?: { exitApp(): void };
    /** API injetada pelo runtime da Tizen; ausente nas outras plataformas. */
    tizen?: unknown;
  }
}

export function detectPlatform(win: Window = window): Platform {
  if (win.tizen !== undefined) {
    // Saída real na Tizen vem em outra issue; por ora só detecta e liga as teclas.
    return { kind: "tizen", init: () => installTizenKeys(win), exitApp() {}, autoplayAllowed: true };
  }
  const bridge = win.MtvTv;
  if (bridge !== undefined) {
    return { kind: "android", init() {}, exitApp: () => bridge.exitApp(), autoplayAllowed: true };
  }
  return { kind: "browser", init() {}, exitApp() {}, autoplayAllowed: false };
}
