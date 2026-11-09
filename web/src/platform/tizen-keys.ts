import { PLAY_PAUSE_KEY } from "../input/commands";

/**
 * Teclas do controle da Tizen que o app usa, pelo código nativo (`keyCode`):
 * convertidas para a tecla lógica (`KeyboardEvent.key`) que o Input Mapper
 * já entende, para que o mapper não conheça a plataforma.
 */
const NATIVE_TO_LOGICAL: Readonly<Record<number, string>> = {
  10009: "GoBack", // Voltar
  427: "ChannelUp", // CH+
  428: "ChannelDown", // CH-
  10252: PLAY_PAUSE_KEY, // Play/Pause
};

/** Nomes que `tizen.tvinputdevice.registerKey` aceita; a Tizen não os entrega por padrão. */
const KEYS_TO_REGISTER = ["ChannelUp", "ChannelDown", "MediaPlayPause"] as const;

interface TizenTvInputDevice {
  registerKey(name: string): void;
}

interface TizenApi {
  tvinputdevice?: TizenTvInputDevice;
}

/**
 * Registra as teclas que a Tizen não entrega por padrão e passa a converter os
 * códigos nativos em teclas lógicas. O evento nativo é engolido (inclusive o
 * default do Play/Pause, que pausaria o vídeo) e reemitido já com a tecla lógica.
 */
export function installTizenKeys(win: Window): void {
  const tvinputdevice = (win.tizen as TizenApi | undefined)?.tvinputdevice;
  for (const name of KEYS_TO_REGISTER) {
    try {
      tvinputdevice?.registerKey(name);
    } catch {
      // Tecla ausente neste modelo: as demais continuam funcionando.
    }
  }

  const convert = (event: KeyboardEvent): void => {
    const logical = NATIVE_TO_LOGICAL[event.keyCode];
    // Já lógico (inclusive o evento que reemitimos): deixa seguir.
    if (logical === undefined || event.key === logical) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    win.dispatchEvent(
      new KeyboardEvent(event.type, {
        key: logical,
        code: event.code,
        keyCode: event.keyCode,
        which: event.keyCode,
        repeat: event.repeat,
        bubbles: true,
        cancelable: true,
      }),
    );
  };

  win.addEventListener("keydown", convert, { capture: true });
  win.addEventListener("keyup", convert, { capture: true });
}
