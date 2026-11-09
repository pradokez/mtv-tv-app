import { describe, expect, it, vi } from "vitest";
import { detectPlatform } from "./platform";

const win = (props: object) => props as Window;

describe("detectPlatform", () => {
  it("detecta o navegador quando não há ponte nem API da casca", () => {
    const platform = detectPlatform(win({}));
    expect(platform.kind).toBe("browser");
    expect(platform.autoplayAllowed).toBe(false);
  });

  it("detecta a casca Android pela ponte MtvTv, com autoplay permitido", () => {
    const platform = detectPlatform(win({ MtvTv: { exitApp: vi.fn() } }));
    expect(platform.kind).toBe("android");
    expect(platform.autoplayAllowed).toBe(true);
  });

  it("detecta a Tizen pela API tizen, com autoplay permitido", () => {
    const platform = detectPlatform(win({ tizen: {} }));
    expect(platform.kind).toBe("tizen");
    expect(platform.autoplayAllowed).toBe(true);
  });

  it("sair do app chama a ponte na Android", () => {
    const exitApp = vi.fn();
    detectPlatform(win({ MtvTv: { exitApp } })).exitApp();
    expect(exitApp).toHaveBeenCalledOnce();
  });

  it("sair do app no navegador não faz nada nem quebra", () => {
    expect(() => detectPlatform(win({})).exitApp()).not.toThrow();
  });
});
