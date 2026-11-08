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

  root.append(lowerThird, dialog);

  return (state) => {
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
