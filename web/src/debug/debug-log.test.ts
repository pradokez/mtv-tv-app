import { describe, expect, it } from "vitest";
import type { Clock } from "../lib/clock";
import { debugLog, debugRequested, installDebugOverlay, watchPlayerForDebug } from "./debug-log";

function fakeWindow(search: string) {
  const panel = { className: "", textContent: "" };
  const win = {
    location: { search, origin: "https://exemplo.test" },
    navigator: { userAgent: "UA" },
    addEventListener: () => {},
    setTimeout: () => 0,
    document: {
      referrer: "",
      body: { append: () => {} },
      createElement: () => panel,
      addEventListener: () => {},
    },
  };
  return { win: win as unknown as Window, panel };
}

function manualClock() {
  const timers = new Map<number, () => void>();
  let nextId = 0;
  const clock = {
    now: () => 0,
    setTimeout: (cb: () => void) => {
      timers.set(++nextId, cb);
      return nextId as unknown as ReturnType<typeof setTimeout>;
    },
    clearTimeout: (id: unknown) => void timers.delete(id as number),
  } as Clock;
  const fireAll = () => [...timers].forEach(([id, cb]) => (timers.delete(id), cb()));
  return { clock, timers, fireAll };
}

const probe = { getPlayerState: () => 1, getCurrentTime: () => 12.34, getDuration: () => 60 };
const container = { querySelector: () => null };

describe("debug overlay", () => {
  it("só liga com ?debug=1", () => {
    expect(debugRequested("")).toBe(false);
    expect(debugRequested("?debug=0")).toBe(false);
    expect(debugRequested("?debug=1")).toBe(true);
  });

  it("sem o parâmetro não liga e debugLog não faz nada", () => {
    const { win, panel } = fakeWindow("");
    expect(installDebugOverlay(win, {})).toBe(false);
    debugLog("x");
    expect(panel.textContent).toBe("");
  });

  it("sem o overlay o acompanhamento do player não agenda nada", () => {
    const { clock, timers } = manualClock();
    watchPlayerForDebug(probe, container, clock)();
    expect(timers.size).toBe(0);
  });

  it("com o parâmetro mostra as informações e só as últimas linhas registradas", () => {
    const { win, panel } = fakeWindow("?debug=1");
    expect(installDebugOverlay(win, { plataforma: "tizen" })).toBe(true);
    expect(panel.textContent).toContain("plataforma tizen");
    for (let i = 0; i < 30; i++) debugLog(`linha ${i}`);
    expect(panel.textContent).toContain("linha 29");
    expect(panel.textContent).not.toContain("linha 5\n");
    expect(panel.textContent.split("\n")).toHaveLength(22);
  });

  it("junta mensagens iguais em sequência numa linha com contador", () => {
    const { win, panel } = fakeWindow("?debug=1");
    installDebugOverlay(win, {});
    for (let i = 0; i < 3; i++) debugLog("repetida");
    expect(panel.textContent.match(/repetida/g)).toHaveLength(1);
    expect(panel.textContent).toContain("repetida (x3)");
  });

  it("acompanha o player a cada tick e para quando mandam parar", () => {
    const { win, panel } = fakeWindow("?debug=1");
    installDebugOverlay(win, {});
    const { clock, timers, fireAll } = manualClock();
    const stop = watchPlayerForDebug(probe, container, clock);
    expect(panel.textContent).toContain("estado 1 t=12.3");
    fireAll();
    expect(panel.textContent).toContain("iframe ausente");
    expect(timers.size).toBe(1); // o próximo tick
    stop();
    expect(timers.size).toBe(0);
  });
});
