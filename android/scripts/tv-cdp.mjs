#!/usr/bin/env node
// Cliente CDP mínimo para validar o app na TV (build debug): lê o estado da página e do player do YouTube,
// manda teclas pela casca e tira capturas. Usado na validação final (#13); ver docs/validacao-final/.
//
// Uso:  ADB=<caminho do adb> node scripts/tv-cdp.mjs <serial> state
//       ... key DPAD_UP DPAD_UP        (keycodes do Android, passam pela casca)
//       ... shot saida.png
//       ... eval '<expressão JS na página>'
//
// Também funciona como biblioteca: `import { connectTv } from "./tv-cdp.mjs"`.
//
// `shiftClock(ms)` recarrega a página somando `ms` ao Date.now() do app, nunca ao do iframe do YouTube.
// A alteração fica só em memória e vale até a conexão fechar e o app reiniciar.
import { execFileSync } from "node:child_process";

const ADB = process.env.ADB ?? "adb";
const PKG = "app.mtvtv";
const PORT = 9333;

export function adb(serial, ...args) {
  return execFileSync(ADB, ["-s", serial, ...args], { encoding: "utf8", maxBuffer: 1 << 26 }).trim();
}

/** Expressão que resume o que a tela mostra, para asserções. */
const STATE_EXPR = `(() => {
  const text = (s) => { const e = document.querySelector(s); return e && !e.hidden ? e.textContent : null; };
  const guide = document.querySelector("nav.guide");
  const open = guide && !guide.hidden;
  const rows = open ? [...guide.querySelectorAll(".guide-row")] : [];
  const name = (r) => r && r.querySelector(".guide-name")?.textContent;
  const exit = document.querySelector(".exit-confirm");
  const lt = document.querySelector(".lower-third");
  const status = document.querySelector(".status-overlay");
  return {
    lowerThird: lt && !lt.hidden ? [...lt.children].map((p) => p.textContent) : null,
    notice: text(".notice"),
    exit: exit && !exit.hidden ? exit.querySelector(".exit-option.selected")?.textContent : null,
    guide: open ? {
      rows: rows.length,
      focused: name(guide.querySelector(".guide-row.focused")),
      focusedNow: guide.querySelector(".guide-row.focused .guide-now")?.textContent,
      tuned: name(guide.querySelector(".guide-row.tuned")),
      settings: [...guide.querySelectorAll(".guide-setting")].map((r) => r.textContent),
      first: rows.slice(2, 8).map((r) => name(r) + (r.querySelector(".guide-star:not(.off)") ? " *" : "")),
    } : null,
    status: status && !status.hidden ? status.textContent : null,
    fatal: text("#fatal"),
    soundHint: text(".sound-hint"),
    iframes: document.querySelectorAll("iframe").length,
    lastChannel: localStorage.getItem("mtv-tv.lastChannel"),
    mode: localStorage.getItem("mtv-tv.mode"),
    favorites: localStorage.getItem("mtv-tv.favorites"),
    favoritesOnly: localStorage.getItem("mtv-tv.favoritesOnly"),
  };
})()`;

/** No contexto do iframe: o que o player do YouTube está tocando de fato. */
const PLAYER_EXPR = `(() => {
  const v = document.querySelector("video");
  const p = document.getElementById("movie_player");
  const d = p?.getVideoData?.();
  const err = document.querySelector(".ytp-error");
  return {
    videoId: d?.video_id, title: d?.title, author: d?.author,
    state: p?.getPlayerState?.(), quality: p?.getPlaybackQuality?.(),
    videos: document.querySelectorAll("video").length,
    t: v ? +v.currentTime.toFixed(1) : null, paused: v?.paused, muted: v?.muted,
    w: v?.videoWidth, h: v?.videoHeight,
    error: err && err.offsetParent !== null ? err.textContent.trim().slice(0, 120) : null,
  };
})()`;

export async function connectTv(serial) {
  const pid = adb(serial, "shell", "pidof", PKG).split(/\s+/)[0];
  if (!pid) throw new Error("O app não está rodando na TV");
  execFileSync(ADB, ["-s", serial, "forward", `tcp:${PORT}`, `localabstract:webview_devtools_remote_${pid}`]);
  const targets = await (await fetch(`http://localhost:${PORT}/json`)).json();
  const page = targets.find((t) => t.type === "page" && t.url.includes("appassets"));
  if (!page) throw new Error(`Página do app não encontrada: ${targets.map((t) => t.url).join(", ")}`);

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let nextId = 1;
  const waiting = new Map();
  const contexts = new Map();
  ws.onmessage = ({ data }) => {
    const msg = JSON.parse(data);
    if (msg.id) {
      const pending = waiting.get(msg.id);
      waiting.delete(msg.id);
      if (msg.error) pending.reject(new Error(msg.error.message));
      else pending.resolve(msg.result);
      return;
    }
    if (msg.method === "Runtime.executionContextCreated") contexts.set(msg.params.context.id, msg.params.context);
    if (msg.method === "Runtime.executionContextDestroyed") contexts.delete(msg.params.executionContextId);
    if (msg.method === "Runtime.executionContextsCleared") contexts.clear();
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = nextId++;
    waiting.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
  const evalIn = async (expression, contextId) => {
    const { result, exceptionDetails } = await send("Runtime.evaluate", {
      expression, contextId, returnByValue: true, awaitPromise: true,
    });
    if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
    return result.value;
  };
  const evalInPlayer = (expression) => {
    const frame = [...contexts.values()].filter((c) => c.origin.includes("youtube")).at(-1);
    return frame ? evalIn(expression, frame.id).catch(() => null) : Promise.resolve(null);
  };
  await send("Runtime.enable");
  await send("Page.enable");

  const tv = {
    send,
    eval: (expression) => evalIn(expression),
    state: () => evalIn(STATE_EXPR),
    /** O que o player do YouTube toca; `null` se ainda não há iframe. */
    player: () => evalInPlayer(PLAYER_EXPR),
    evalInPlayer: (expression) => evalInPlayer(expression),
    /** Teclas do Android: passam pela casca, como as do controle. */
    key: (...keys) => adb(serial, "shell", "input", "keyevent", ...keys.map((k) => `KEYCODE_${k}`)),
    /** `adb exec-out screencap` volta lixo nessa TV: grava no aparelho e baixa. O screencap às vezes falha: tenta de novo. */
    shot: (out) => {
      const file = "/sdcard/tv-cdp.png";
      for (let attempt = 1; ; attempt++) {
        try {
          adb(serial, "shell", "screencap", "-p", file);
          break;
        } catch (error) {
          if (attempt === 5) throw error;
        }
      }
      adb(serial, "pull", file, out);
      adb(serial, "shell", "rm", file);
    },
    /** Recarrega a página com o relógio do app deslocado, só em memória. */
    shiftClock: async (ms) => {
      const source = `if (location.hostname === "appassets.androidplatform.net") {
        const realNow = Date.now.bind(Date);
        Date.now = () => realNow() + ${ms};
      }`;
      await send("Page.addScriptToEvaluateOnNewDocument", { source });
      await send("Page.reload");
    },
    close: () => ws.close(),
  };
  return tv;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [serial, command, ...rest] = process.argv.slice(2);
  const tv = await connectTv(serial);
  const print = (value) => console.log(JSON.stringify(value, null, 1));
  if (command === "state") print({ ...(await tv.state()), player: await tv.player() });
  else if (command === "key") tv.key(...rest);
  else if (command === "shot") tv.shot(rest[0]);
  else if (command === "eval") print(await tv.eval(rest[0]));
  else console.error(`Comando desconhecido: ${command}`);
  tv.close();
}
