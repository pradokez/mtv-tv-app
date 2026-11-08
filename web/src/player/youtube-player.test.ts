import { afterEach, describe, expect, it, vi } from "vitest";
import type { Clock } from "../lib/clock";
import { createYouTubePlayer } from "./youtube-player";

const UNSTARTED = -1;
const PLAYING = 1;

type Events = { onReady(): void; onStateChange(event: { data: number }): void };

class FakeYTPlayer {
  static last: FakeYTPlayer;
  state = UNSTARTED;
  muted = false;
  options: { events: Events };
  constructor(_el: unknown, options: { events: Events }) {
    this.options = options;
    FakeYTPlayer.last = this;
  }
  loadVideoById() {}
  playVideo() {}
  mute() {
    this.muted = true;
  }
  unMute() {
    this.muted = false;
  }
  getPlayerState() {
    return this.state;
  }
  setPlaybackQuality() {}
  destroy() {}
}

function fakeClock() {
  let now = 0;
  let nextId = 0;
  const timers = new Map<number, { at: number; cb: () => void }>();
  const clock: Clock = {
    now: () => now,
    setTimeout: (cb, ms) => {
      const id = ++nextId;
      timers.set(id, { at: now + ms, cb });
      return id as unknown as ReturnType<typeof setTimeout>;
    },
    clearTimeout: (id) => void timers.delete(id as unknown as number),
  };
  const advance = (ms: number) => {
    now += ms;
    for (const [id, t] of [...timers]) {
      if (t.at <= now) {
        timers.delete(id);
        t.cb();
      }
    }
  };
  return { clock, advance };
}

const fakeElement = () => ({ hidden: true, className: "", textContent: "", append() {}, prepend() {} });

async function setup(autoplayAllowed?: boolean) {
  const { clock, advance } = fakeClock();
  const listeners = new Map<string, () => void>();
  vi.stubGlobal("document", { createElement: fakeElement });
  vi.stubGlobal("window", {
    YT: { Player: FakeYTPlayer },
    location: { origin: "https://app.test" },
    addEventListener: (type: string, cb: () => void) => listeners.set(type, cb),
  });
  const player = createYouTubePlayer(fakeElement() as unknown as HTMLElement, { clock, autoplayAllowed });
  await Promise.resolve(); // the IFrame API promise
  await Promise.resolve();
  const yt = FakeYTPlayer.last;
  yt.options.events.onReady();
  return { player, yt, advance, listeners };
}

describe("YouTube player: autoplay fallback", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("mutes when the browser leaves the first clip unstarted", async () => {
    const { player, yt, advance } = await setup();
    player.load("a", 0);
    advance(1500);
    expect(yt.muted).toBe(true);
  });

  it("does not mute a clip still loading once a clip has played with sound", async () => {
    const { player, yt, advance } = await setup();
    player.load("a", 0);
    yt.state = PLAYING;
    yt.options.events.onStateChange({ data: PLAYING });
    yt.state = UNSTARTED;
    player.load("b", 90);
    advance(1500);
    expect(yt.muted).toBe(false);
  });

  it("does not mute the next clips after a key turned the sound on", async () => {
    const { player, yt, advance, listeners } = await setup();
    player.load("a", 0);
    advance(1500);
    listeners.get("keydown")!();
    expect(yt.muted).toBe(false);
    yt.state = UNSTARTED;
    player.load("b", 90);
    advance(1500);
    expect(yt.muted).toBe(false);
  });

  it("never mutes where autoplay is known to be allowed, as in the Android shell", async () => {
    const { player, yt, advance } = await setup(true);
    player.load("a", 0);
    advance(1500);
    expect(yt.muted).toBe(false);
  });
});
