# MTV TV

App Android TV de uso pessoal que toca canais de videoclipes no estilo da MTV antiga, operável só pelo controle remoto. Ver o PRD na issue #1.

O repositório tem duas partes:

- `web/`: app web em TypeScript (Vite) com o player, a lógica dos canais e as sobreposições. Roda no navegador do Mac para desenvolver.
- `android/`: casca Kotlin com uma WebView em tela cheia que carrega o build de `web/` (issue #3).

## App web

Requisitos: Node 22+ e pnpm.

```bash
cd web
pnpm install
pnpm dev         # http://localhost:5173 — toca o primeiro canal do catálogo
pnpm test        # Vitest
pnpm typecheck   # tsc estrito
pnpm build       # gera web/dist/
```

- **Tela cheia no Mac:** ⌃⌘F no navegador. O app ocupa a janela inteira e não usa a Fullscreen API, que exige um gesto do usuário.
- **Som:** navegadores de desktop bloqueiam autoplay com som. Nesse caso o clipe toca mudo e aparece "Aperte qualquer tecla para ligar o som". Para evitar o aviso, libere "Som: Permitir" para `localhost` nas configurações do site no Chrome.
- **Sem rede ou sem YouTube:** `http://localhost:5173/?player=fake` troca o player por um painel com o vídeo atual e botões "Terminar" e "Erro".
- **Vídeo com erro e sem internet:** um vídeo que falha é pulado e não volta na sessão. Se todos os vídeos de um canal falham, aparece "Nenhum clipe disponível neste canal" (no `?player=fake`, aperte "Erro" até esgotar o canal). Para simular falta de internet, use DevTools → Network → Offline: aparece "Sem conexão com a internet" e, ao voltar a rede, o clipe atual recomeça sozinho.
- **Catálogo:** `web/public/catalog.json` é um catálogo de exemplo. O formato está em [`web/docs/catalog-schema.md`](web/docs/catalog-schema.md).
- O app não faz nenhuma requisição ao site original do catálogo: a CSP do `index.html` só libera o próprio app e o player do YouTube, e um teste falha se o código citar o domínio.

## Contrato com a casca Android

- **Build:** `pnpm build` gera `web/dist/` (`index.html`, `assets/`, `catalog.json`, `icons/`), com caminhos relativos.
- **Origem:** sirva o build pelo `WebViewAssetLoader` (`https://appassets.androidplatform.net/assets/web/index.html`), não por `file://`. O app carrega o catálogo com `fetch`, que não funciona em `file://`, e o player do YouTube exige uma origem HTTP(S).
- **Teclas:** o app lê só `KeyboardEvent.key`. A casca repassa setas como `ArrowUp`/`ArrowDown`/`ArrowLeft`/`ArrowRight`, OK como `Enter`, Voltar como `Escape` e CH+/CH- como `ChannelUp`/`ChannelDown`.
- **Empacotamento:** a casca carrega `assets/web/index.html`. O conteúdo de `web/dist/` deve chegar a `android/app/src/main/assets/web/` no build do APK (de preferência por uma task Gradle, sem commitar o build).
- **WebView:** JavaScript e DOM storage ligados, e `mediaPlaybackRequiresUserGesture = false`, para o autoplay com som funcionar.
