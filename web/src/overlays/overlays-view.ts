import type { GuideRow } from "./guide";
import type { OverlayState } from "./overlays";

/** Renders the overlay state into the lower third, the guide and the exit confirmation. */
export function mountOverlaysView(root: HTMLElement): (state: OverlayState) => void {
  const lowerThird = document.createElement("div");
  lowerThird.className = "lower-third";
  lowerThird.hidden = true;

  const dialog = document.createElement("div");
  dialog.className = "exit-confirm";
  dialog.setAttribute("role", "alertdialog");
  dialog.hidden = true;
  const question = document.createElement("p");
  question.textContent = "Sair do MTV TV?";
  const options = document.createElement("div");
  const optionEls = {
    exit: option("Sair"),
    continue: option("Continuar"),
  };
  options.append(optionEls.exit, optionEls.continue);
  dialog.append(question, options);

  const guide = createGuideView();
  root.append(lowerThird, guide.el, dialog);

  return (state) => {
    guide.render(state);
    lowerThird.hidden = state.overlay !== "info";
    if (state.overlay === "info") {
      lowerThird.replaceChildren(
        ...state.lines.map((text) => {
          const line = document.createElement("p");
          line.textContent = text;
          return line;
        }),
      );
    }
    dialog.hidden = state.overlay !== "exitConfirm";
    optionEls.exit.classList.toggle("selected", state.exitChoice === "exit");
    optionEls.continue.classList.toggle("selected", state.exitChoice === "continue");
  };
}

function option(label: string): HTMLElement {
  const el = document.createElement("span");
  el.className = "exit-option";
  el.textContent = label;
  return el;
}

/**
 * The guide is a panel on the left. Rows are rebuilt only when the row list
 * changes (a favorite toggled); moving the focus just flips a class, so
 * scrolling through 113 channels stays cheap on the TV.
 */
function createGuideView(): { el: HTMLElement; render(state: OverlayState): void } {
  const el = document.createElement("nav");
  el.className = "guide";
  el.setAttribute("aria-label", "Guia de canais");
  el.hidden = true;
  const list = document.createElement("ul");
  el.append(list);

  let shownRows: readonly GuideRow[] | undefined;
  let items: HTMLElement[] = [];
  let focused: HTMLElement | undefined;

  return {
    el,
    render(state) {
      el.hidden = state.overlay !== "guide";
      if (state.overlay !== "guide") {
        shownRows = undefined;
        return;
      }
      const { rows, focus } = state.guide;
      if (rows !== shownRows) {
        shownRows = rows;
        items = rows.map(guideItem);
        list.replaceChildren(...items);
        focused = undefined;
      }
      if (focused !== items[focus]) {
        focused?.classList.remove("focused");
        focused = items[focus];
        focused?.classList.add("focused");
        focused?.scrollIntoView({ block: "nearest" });
      }
    },
  };
}

function guideItem(row: GuideRow): HTMLElement {
  const li = document.createElement("li");
  if (row.kind === "filter") {
    li.className = "guide-row guide-filter";
    const label = document.createElement("span");
    label.className = "guide-name";
    label.textContent = "Só favoritos";
    const value = document.createElement("span");
    value.className = "guide-value";
    value.textContent = row.ignored ? "Ligado, sem favoritos: ignorado" : row.on ? "Ligado" : "Desligado";
    li.append(label, value);
    return li;
  }
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
  const name = document.createElement("span");
  name.className = "guide-name";
  name.textContent = row.name;
  const star = document.createElement("span");
  star.className = "guide-star";
  star.textContent = row.favorite ? "★" : "";
  li.append(icon, name, star);
  return li;
}
