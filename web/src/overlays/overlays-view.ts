import type { OverlayState } from "./overlays";

/** Renders the overlay state into the lower third and the exit confirmation. */
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

  root.append(lowerThird, dialog);

  return (state) => {
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
