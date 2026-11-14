import { describe, expect, it } from "vitest";
import { debugLog, debugRequested, installDebugOverlay } from "./debug-log";

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

  it("com o parâmetro mostra as informações e só as últimas linhas registradas", () => {
    const { win, panel } = fakeWindow("?debug=1");
    expect(installDebugOverlay(win, { plataforma: "tizen" })).toBe(true);
    expect(panel.textContent).toContain("plataforma tizen");
    for (let i = 0; i < 30; i++) debugLog(`linha ${i}`);
    expect(panel.textContent).toContain("linha 29");
    expect(panel.textContent).not.toContain("linha 5\n");
    expect(panel.textContent.split("\n")).toHaveLength(16);
  });
});
