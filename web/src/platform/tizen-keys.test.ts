import { beforeAll, describe, expect, it, vi } from "vitest";
import { detectPlatform } from "./platform";

// O ambiente de teste é node (sem DOM): um KeyboardEvent mínimo basta.
class FakeKeyboardEvent extends Event {
  readonly key: string;
  readonly code: string;
  readonly keyCode: number;
  readonly repeat: boolean;
  constructor(type: string, init: Partial<KeyboardEvent> & EventInit = {}) {
    super(type, init);
    this.key = init.key ?? "";
    this.code = init.code ?? "";
    this.keyCode = init.keyCode ?? 0;
    this.repeat = init.repeat ?? false;
  }
}

beforeAll(() => {
  vi.stubGlobal("KeyboardEvent", FakeKeyboardEvent);
});

function setup() {
  const registerKey = vi.fn();
  const fake = new EventTarget() as unknown as Window;
  Object.assign(fake, { tizen: { tvinputdevice: { registerKey } } });
  detectPlatform(fake).init();
  const seen: KeyboardEvent[] = [];
  fake.addEventListener("keydown", (e) => seen.push(e as KeyboardEvent));
  return { fake, registerKey, seen };
}

function press(fake: Window, keyCode: number, key = "Unidentified") {
  const event = new KeyboardEvent("keydown", { key, keyCode, cancelable: true, bubbles: true });
  fake.dispatchEvent(event);
  return event;
}

describe("teclas nativas da Tizen", () => {
  it("registra CH+, CH- e Play/Pause na inicialização", () => {
    const { registerKey } = setup();
    expect(registerKey.mock.calls.map((c) => c[0])).toEqual(["ChannelUp", "ChannelDown", "MediaPlayPause"]);
  });

  it("não quebra se registerKey falhar ou a API não existir", () => {
    const fake = new EventTarget() as unknown as Window;
    Object.assign(fake, { tizen: { tvinputdevice: { registerKey: () => { throw new Error("x"); } } } });
    expect(() => detectPlatform(fake).init()).not.toThrow();
    const bare = Object.assign(new EventTarget(), { tizen: {} }) as unknown as Window;
    expect(() => detectPlatform(bare).init()).not.toThrow();
  });

  it.each([
    [10009, "GoBack"],
    [427, "ChannelUp"],
    [428, "ChannelDown"],
    [10252, "MediaPlayPause"],
  ])("converte o código nativo %i na tecla lógica %s", (keyCode, logical) => {
    const { fake, seen } = setup();
    press(fake, keyCode);
    expect(seen).toHaveLength(1);
    expect(seen[0]!.key).toBe(logical);
  });

  it("suprime o default do Play/Pause nativo e não deixa o evento nativo passar", () => {
    const { fake, seen } = setup();
    const native = press(fake, 10252);
    expect(native.defaultPrevented).toBe(true);
    expect(seen.map((e) => e.key)).toEqual(["MediaPlayPause"]);
  });

  it("deixa passar teclas sem conversão e eventos já lógicos", () => {
    const { fake, seen } = setup();
    press(fake, 13, "Enter");
    press(fake, 427, "ChannelUp");
    expect(seen.map((e) => e.key)).toEqual(["Enter", "ChannelUp"]);
  });

  it("fora da Tizen, init não registra nada nem converte", () => {
    const fake = new EventTarget() as unknown as Window;
    const seen: KeyboardEvent[] = [];
    detectPlatform(fake).init();
    fake.addEventListener("keydown", (e) => seen.push(e as KeyboardEvent));
    press(fake, 427);
    expect(seen[0]!.key).toBe("Unidentified");
  });
});
