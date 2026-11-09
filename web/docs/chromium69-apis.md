# APIs acima do Chromium 69

A Samsung Q80 (Tizen 5.5) roda **Chromium 69** (medido na TV, ver [`tizen/README.md`](../../tizen/README.md#chromium-da-q80)). Este documento lista o que o app usa de JS e CSS acima dessa versão e como cada item é tratado. Levantado em 2026-11-08 a partir de `src/` e dos bundles `dist/` (build padrão) e `dist-tizen/` (`pnpm build:tizen`).

## Como o build da Tizen trata

- `pnpm build:tizen` roda `vite build --mode tizen`: `build.target` e `build.cssTarget` em `chrome69`, saída em `web/dist-tizen/`. O `pnpm build` (web e Android) não muda.
- Em seguida, [`scripts/check-bundle.ts`](../scripts/check-bundle.ts) confere o `dist-tizen/` e falha o build se sobrar sintaxe acima do alvo. JS: parse como ES2020 e reprova `?.`, `??` e BigInt; o que for mais novo (class fields, `??=` etc.) nem passa no parse. CSS: reprova `inset`, `aspect-ratio`, `:is()`, `:where()`, `:has()` e `@layer`.
- O verificador olha só sintaxe. APIs de runtime (métodos e objetos do navegador) passam pelo levantamento abaixo e por polyfill quando faltam.

## Resolvido pela conversão (sintaxe)

| Recurso | Chromium | Onde aparece | No `dist-tizen/` |
| --- | --- | --- | --- |
| `?.` (optional chaining) | 80 | vários módulos de `src/` | reescrito |
| `??` (nullish coalescing) | 80 | vários módulos de `src/` | reescrito |
| `??=` | 85 | `tuner/tuner.ts`, `preferences/preferences.ts`, `player/youtube-player.ts` | reescrito |
| `inset` | 87 | 9 regras de `style.css` | vira `top`/`right`/`bottom`/`left` |

## Resolvido por polyfill (runtime)

| API | Chromium | Onde aparece | Tratamento |
| --- | --- | --- | --- |
| `Element.replaceChildren` | 86 | `overlays/overlays-view.ts` (guia e lower third) | [`src/platform/chromium69-polyfills.ts`](../src/platform/chromium69-polyfills.ts), instalado só no build da Tizen (`import.meta.env.MODE === "tizen"`); sem ele a chamada lança `TypeError` e o guia e o lower third não abrem |

Foi a única API de runtime acima do 69 achada. Não entra nenhum outro polyfill.

## Não resolvido (fica para a issue #50)

A conversão de CSS não tem como reescrever estes itens, e o verificador não os reprova. O efeito na Q80 é só visual: o resto da regra continua valendo.

| Recurso | Chromium | Onde aparece | Efeito no 69 |
| --- | --- | --- | --- |
| `gap` em contêiner flex | 84 | `.exit-band`, `.exit-options`, `.exit-option span`, `.guide`, `.guide-channel` | itens encostados, sem espaço entre eles |
| `column-gap` em contêiner flex | 84 | `.guide-hint` | dicas do rodapé do guia encostadas |
| `backdrop-filter` | 76 | `.exit-confirm` | fundo da confirmação de saída sem desfoque (o fundo semitransparente continua) |
| `border-block` | 87 | `.exit-band` | faixa da confirmação de saída sem as bordas de cima e de baixo; a conversão não reescreve porque o valor usa `var(--cyan)` |

`gap` em contêiner **grid** (`.status-overlay`, `#fatal`, `.fake-player`, `column-gap` de `.guide-row`/`.guide-columns`) é suportado desde o Chromium 66 e não entra aqui.

## Seguro no 69

Usados pelo app e suportados pelo Chromium 69, sem conversão nem polyfill:

- **JS (sintaxe):** módulos ES (`<script type="module">`), `async`/`await`, spread e rest de objeto, classes sem fields, template literals.
- **JS (runtime):** `fetch`, `localStorage`, `URLSearchParams`, `Map`/`Set`, `Promise`, `Array.from`, `Array.prototype.flatMap` (chegou exatamente no 69), `Object.entries`, `String.prototype.padStart`, `Math.imul`, `Number.isFinite`, `Element.append`/`prepend`/`remove`, `classList.toggle(nome, força)`, `scrollIntoView({ block: "nearest" })`, `addEventListener` com `{ once, capture }`, eventos `keydown` (`event.key`), `pointerdown`, `online`/`offline` e `navigator.onLine`. O `modulepreload` que o Vite injeta usa `MutationObserver` e `relList.supports`, ambos antigos.
- **CSS:** custom properties (`var()`), `calc()`, grid com `minmax()`, `place-items`/`place-content`, `clip-path: polygon()`, `object-fit`, `-webkit-line-clamp`, `scroll-padding-top` (69), cores `#rrggbbaa` (62), `radial-gradient`, `@font-face` com WOFF2.

`Array.prototype.at` só aparece em `player/fake-player.ts` usado por testes, fora do bundle. Não há `structuredClone`, `Object.fromEntries`, `Object.hasOwn`, `replaceAll`, `Promise.allSettled`, `globalThis` nem `ResizeObserver` no app.

## Fora deste levantamento

Não depende da versão do Chromium e só dá para confirmar na TV:

- O script da API do player do YouTube vem de `youtube.com` em tempo de execução, então o build não controla a sintaxe dele.
- Como a Tizen serve o pacote (`file://` ou outro esquema) pode afetar `<script type="module">` e o `fetch("./catalog.json")`.
