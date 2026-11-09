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

  describe("Tizen", () => {
    const tizenStub = () => {
      const exit = vi.fn();
      const request = vi.fn();
      const release = vi.fn();
      const tizen = {
        application: { getCurrentApplication: () => ({ exit }) },
        power: { request, release },
      };
      return { tizen, exit, request, release };
    };

    it("sair do app encerra a aplicação atual", () => {
      const { tizen, exit } = tizenStub();
      detectPlatform(win({ tizen })).exitApp();
      expect(exit).toHaveBeenCalledOnce();
    });

    it("sair do app libera o pedido de tela acesa antes de encerrar", () => {
      const { tizen, release } = tizenStub();
      const platform = detectPlatform(win({ tizen }));
      platform.keepScreenOn();
      platform.exitApp();
      expect(release).toHaveBeenCalledWith("SCREEN");
    });

    it("pede tela acesa e libera ao encerrar", () => {
      const { tizen, request, release } = tizenStub();
      const stop = detectPlatform(win({ tizen })).keepScreenOn();
      expect(request).toHaveBeenCalledWith("SCREEN", "SCREEN_NORMAL");
      expect(release).not.toHaveBeenCalled();
      stop();
      expect(release).toHaveBeenCalledWith("SCREEN");
    });

    it("não quebra se a API de aplicação ou de energia falhar", () => {
      const tizen = {
        application: {
          getCurrentApplication: () => {
            throw new Error("sem acesso");
          },
        },
        power: {
          request: () => {
            throw new Error("sem privilégio");
          },
          release: () => {
            throw new Error("sem privilégio");
          },
        },
      };
      const platform = detectPlatform(win({ tizen }));
      expect(() => platform.keepScreenOn()()).not.toThrow();
      expect(() => platform.exitApp()).not.toThrow();
    });
  });

  it("Android e navegador não pedem tela acesa", () => {
    const exitApp = vi.fn();
    for (const w of [win({ MtvTv: { exitApp } }), win({})]) {
      expect(() => detectPlatform(w).keepScreenOn()()).not.toThrow();
    }
  });
});
