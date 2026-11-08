import type { Clock, TimerId } from "../lib/clock";
import type { GuideRow } from "./guide";
import type { GuideOnAir } from "./on-air";
import type { OverlayState } from "./overlays";

export interface OverlaysViewDeps {
  clock: Clock;
  /** What is on air in a channel right now; `undefined` when the guide shows no "now on air" (queue mode). */
  onAir?: (channelId: string, nowMs: number) => GuideOnAir | undefined;
}

/** Rows around the focus that get their "now on air" filled in: the visible ones, with some margin. */
const ON_AIR_WINDOW = 8;
/** Waits a bit past the end of a clip, so the refresh surely sees the next one on air. */
const REFRESH_SLACK_MS = 50;

/** Renders the overlay state into the lower third, the guide and the exit confirmation. */
export function mountOverlaysView(root: HTMLElement, deps?: OverlaysViewDeps): (state: OverlayState) => void {
  const lowerThird = document.createElement("div");
  lowerThird.className = "lower-third";
  lowerThird.hidden = true;

  const dialog = document.createElement("div");
  dialog.className = "exit-confirm";
  dialog.setAttribute("role", "alertdialog");
  dialog.hidden = true;
  const band = document.createElement("div");
  band.className = "exit-band";
  const kicker = document.createElement("p");
  kicker.className = "exit-kicker";
  kicker.textContent = "// ENCERRAR SESSÃO";
  const question = document.createElement("p");
  question.className = "exit-question";
  question.textContent = "Sair do MTV TV?";
  const heading = document.createElement("div");
  heading.append(kicker, question);
  const options = document.createElement("div");
  options.className = "exit-options";
  const optionEls = {
    exit: option("Sair"),
    continue: option("Continuar"),
  };
  options.append(optionEls.exit, optionEls.continue);
  band.append(heading, options);
  dialog.append(band);

  const notice = document.createElement("div");
  notice.className = "notice";
  notice.setAttribute("role", "status");
  notice.hidden = true;

  const guide = createGuideView(deps);
  root.append(lowerThird, guide.el, dialog, notice);

  return (state) => {
    guide.render(state);
    lowerThird.hidden = state.overlay !== "info";
    if (state.overlay === "info") {
      lowerThird.replaceChildren(
        ...state.lines.map((text, i, all) => {
          const line = document.createElement("p");
          // Last line is always the channel; the first is artist/title; the rest is the song.
          line.className = i === all.length - 1 ? "lt-channel" : i === 0 ? "lt-main" : "lt-sub";
          line.textContent = text;
          return line;
        }),
      );
    }
    notice.hidden = state.notice === undefined;
    if (state.notice !== undefined) notice.textContent = state.notice;
    dialog.hidden = state.overlay !== "exitConfirm";
    optionEls.exit.classList.toggle("selected", state.exitChoice === "exit");
    optionEls.continue.classList.toggle("selected", state.exitChoice === "continue");
  };
}

function option(label: string): HTMLElement {
  const el = document.createElement("div");
  el.className = "exit-option";
  const text = document.createElement("span");
  text.textContent = label;
  el.append(text);
  return el;
}

/**
 * The guide is a panel on the left. Rows are rebuilt only when the row list
 * changes (a favorite toggled); moving the focus just flips a class, so
 * scrolling through 113 channels stays cheap on the TV. The "now on air" text
 * is only computed for the rows around the focus, and again when the first of
 * those clips ends.
 */
function createGuideView(deps?: OverlaysViewDeps): { el: HTMLElement; render(state: OverlayState): void } {
  const el = document.createElement("nav");
  el.className = "guide";
  el.setAttribute("aria-label", "Guia de canais");
  el.hidden = true;
  const list = document.createElement("ul");
  el.append(list);

  let shownRows: readonly GuideRow[] | undefined;
  let items: HTMLElement[] = [];
  let focused: HTMLElement | undefined;
  let refreshTimer: TimerId | undefined;
  /** Row index -> when the clip filled into it ends (`Infinity`: nothing on air to track). */
  const filledUntil = new Map<number, number>();
  let focusIndex = 0;

  const stopRefresh = () => {
    if (refreshTimer !== undefined) deps?.clock.clearTimeout(refreshTimer);
    refreshTimer = undefined;
  };

  /** Fills the "now on air" of the rows around the focus; returns when the first of those clips ends. */
  const fillOnAir = (now: number): number => {
    let nextEnd = Infinity;
    if (!deps?.onAir || !shownRows) return nextEnd;
    const from = Math.max(0, focusIndex - ON_AIR_WINDOW);
    const to = Math.min(shownRows.length, focusIndex + ON_AIR_WINDOW + 1);
    for (let i = from; i < to; i++) {
      const row = shownRows[i]!;
      const target = items[i]?.querySelector<HTMLElement>(".guide-onair");
      if (row.kind !== "channel" || !target) continue;
      // Rows already filled with a clip that is still on air stay as they are:
      // moving the focus then only fills the row that just entered the window.
      let endsAt = filledUntil.get(i);
      if (endsAt === undefined || endsAt <= now) {
        const info = deps.onAir(row.id, now);
        target.replaceChildren(...onAirLines(info));
        endsAt = info?.endsAtMs ?? Infinity;
        filledUntil.set(i, endsAt);
      }
      nextEnd = Math.min(nextEnd, endsAt);
    }
    return nextEnd;
  };

  const refreshOnAir = () => {
    stopRefresh();
    const now = deps?.clock.now() ?? 0;
    const nextEnd = fillOnAir(now);
    // Scroll only after filling: the "now on air" lines change the height of
    // the rows above the focus, which would otherwise push it out of view.
    focused?.scrollIntoView({ block: "nearest" });
    if (deps && nextEnd < Infinity) {
      refreshTimer = deps.clock.setTimeout(refreshOnAir, Math.max(nextEnd - now, 0) + REFRESH_SLACK_MS);
    }
  };

  return {
    el,
    render(state) {
      el.hidden = state.overlay !== "guide";
      if (state.overlay !== "guide") {
        shownRows = undefined;
        stopRefresh();
        return;
      }
      const { rows, focus } = state.guide;
      let stale = false;
      if (rows !== shownRows) {
        shownRows = rows;
        items = rows.map(guideItem);
        list.replaceChildren(...items);
        filledUntil.clear();
        focused = undefined;
        stale = true;
      }
      if (focused !== items[focus]) {
        focused?.classList.remove("focused");
        focused = items[focus];
        focused?.classList.add("focused");
        focusIndex = focus;
        stale = true;
      }
      if (stale) refreshOnAir();
    },
  };
}

function settingItem(labelText: string, valueText: string): HTMLElement {
  const li = document.createElement("li");
  li.className = "guide-row guide-setting";
  const label = document.createElement("span");
  label.className = "guide-name";
  label.textContent = labelText;
  const value = document.createElement("span");
  value.className = "guide-value";
  value.textContent = valueText;
  li.append(label, value);
  return li;
}

function guideItem(row: GuideRow): HTMLElement {
  if (row.kind === "mode") return settingItem("Modo", row.mode === "live" ? "Ao vivo" : "Fila");
  if (row.kind === "filter") {
    return settingItem("Só favoritos ao zapear", row.ignored ? "Sem favoritos" : row.on ? "Ligado" : "Desligado");
  }
  const li = document.createElement("li");
  li.className = "guide-row";
  const icon = document.createElement("span");
  icon.className = "guide-icon";
  if (/^(\/|\.|https?:)/.test(row.icon)) {
    const img = document.createElement("img");
    img.src = row.icon;
    img.alt = "";
    icon.append(img);
  } else {
    icon.textContent = row.icon;
  }
  const text = document.createElement("span");
  text.className = "guide-text";
  const name = document.createElement("span");
  name.className = "guide-name";
  name.textContent = row.name;
  const onAir = document.createElement("span");
  onAir.className = "guide-onair";
  text.append(name, onAir);
  const star = document.createElement("span");
  star.className = "guide-star";
  star.textContent = row.favorite ? "★" : "";
  li.append(icon, text, star);
  return li;
}

function onAirLines(info: GuideOnAir | undefined): HTMLElement[] {
  const line = (className: string, text: string) => {
    const el = document.createElement("span");
    el.className = className;
    el.textContent = text;
    return el;
  };
  const lines: HTMLElement[] = [];
  if (info?.now) lines.push(line("guide-now", info.now));
  if (info?.next) lines.push(line("guide-next", `A seguir: ${info.next}`));
  return lines;
}
