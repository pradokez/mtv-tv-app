# Casca Android TV

APK Kotlin com uma Activity em tela cheia e uma única WebView que carrega o app hospedado no
GitHub Pages (`BuildConfig.APP_URL`, de `config/hosted.json`; ver [URL do app hospedado](#url-do-app-hospedado)).
O APK não tem o app web nem o catálogo: o único asset é `app/src/main/assets/aviso.html`, a tela
de aviso de quando o app não carrega. Publicar o site atualiza a TV sem reinstalar.

A casca chama `window.dispatchTvKey(type, key, code, keyCode, androidKeyCode)` a cada tecla
(setas, OK = `Enter`, Voltar = `Escape`, CH+/CH- = `ChannelUp`/`ChannelDown`, keyCode 427/428; Menu = `ContextMenu` e tecla amarela = `ColorF2Yellow`, que alternam ao vivo/fila; Info = `Info`, keyCode 165, que mostra a tarja) e
também dispara o evento no `document`. Se a função retornar `true`, a tecla foi tratada; no Voltar,
retornar algo diferente de `true` (ou a função não existir) faz a Activity sair.

A WebView segue com JavaScript e DOM storage ligados, `mediaPlaybackRequiresUserGesture = false`
(autoplay com som), sem acesso a arquivo nem a content provider e com conteúdo misto bloqueado. A
Activity mantém a tela acesa (`FLAG_KEEP_SCREEN_ON`) e esconde as barras do sistema.

## Pré-requisitos no Mac

- JDK 17 (`brew install openjdk@17`, e `JAVA_HOME` apontando para ele)
- Android SDK com `platform-tools` (`adb`) e `platforms;android-34` (`brew install --cask android-commandlinetools`).
  Crie `android/local.properties` com `sdk.dir=<caminho do SDK>` (o arquivo é ignorado pelo git).
- Node (o build lê a URL por `web/scripts/hosted-config.ts`). Não precisa de `pnpm build`.

## Instalar na TV (TCL C06)

1. Na TV: **Configurações → Sistema → Sobre**, e aperte OK sete vezes em **Build do Android TV** para liberar o modo desenvolvedor.
2. **Configurações → Sistema → Opções do desenvolvedor**: ligue **Depuração USB** e **Depuração por rede/ADB sobre rede** (o nome varia entre versões).
3. Veja o IP da TV em **Configurações → Rede e Internet**. Mac e TV precisam estar na mesma rede.
4. No Mac, rode:

   ```bash
   android/scripts/install-tv.sh <ip-da-tv>      # ou TV_IP=<ip-da-tv>; porta padrão 5555
   ```

   O script compila o APK (`./gradlew assembleDebug`), instala com `adb install -r` e abre o app. O app web e o catálogo vêm do site publicado (ver [Publicar e rollback](#publicar-e-rollback)).
5. Na primeira conexão a TV mostra "Permitir depuração?". Escolha **Sempre permitir** e rode o script de novo se precisar.
6. O app aparece na tela inicial (linha de apps) com banner.

## Emulador

`scripts/install-tv.sh --device emulator-5554` instala em um emulador Android TV já aberto.
No emulador, desligue a verificação do Play Protect para a instalação não travar:
`adb shell settings put global package_verifier_enable 0`.

## Aviso de falha e nova tentativa

Se o frame principal do app falhar (erro de rede, HTTP 400 ou mais, ou nada aparecer em 20 s), a
casca troca a página por `assets/aviso.html`, com a mesma identidade do lançador da Tizen: marca
MTV TV, "Sem conexão com a internet" (sem rede) ou "Não foi possível abrir o MTV TV" (com rede),
"Tentando de novo automaticamente…" e o botão Sair.

- **Nova tentativa:** a cada 10 s enquanto o aviso está na tela, e na hora em que a rede volta
  (`ConnectivityManager.registerDefaultNetworkCallback`). A casca primeiro sonda a URL (HEAD, 8 s
  de limite) e só recarrega a WebView se ela responder com sucesso, para o aviso não piscar a
  página de erro da WebView a cada tentativa. As tentativas param em `onPause` e voltam em `onResume`.
- **Sair:** com o aviso na tela, Voltar e OK fecham o app, tratados pela própria casca. O aviso não
  usa a ponte `MtvTv.exitApp()` (ver abaixo), e as teclas não vão para `window.dispatchTvKey`.
- Quando o app já abriu, perder a rede não troca nada: o app web trata o offline sozinho.

## Política de origem

`OriginPolicy` (`app/src/main/java/app/mtvtv/OriginPolicy.kt`) é Kotlin puro e decide duas coisas a
partir de uma URL:

- `canNavigate(url)`: a casca só navega para o app hospedado, **dentro do caminho base**
  (`https://<domínio><caminho>`, ex.: `https://usuario.github.io/mtv-tv-app/`), e para o player do
  YouTube (`www.youtube.com` e `www.youtube-nocookie.com`). Recusa outro caminho do mesmo domínio
  (outro repositório do `github.io`), `/mtv-tv-app-parecido`, `..` e `%2e`/`%2f`/`%5c` no caminho,
  `http`, `file:`, `javascript:`, `data:`, subdomínios parecidos, credenciais na URL, porta
  diferente da padrão e URL malformada.
- `canCallExitApp(url)`: só páginas do app hospedado, dentro do caminho base, podem chamar
  `MtvTv.exitApp()`. O YouTube não pode.

O domínio e o caminho vêm por parâmetro (`OriginPolicy(hostedBaseUrl)`, `https://<domínio><caminho>`,
barra final opcional; caminho `/` vale o domínio inteiro); o
construtor lança `IllegalArgumentException` se a base for inválida.

A `MainActivity` usa a política com `BuildConfig.APP_URL`, pelas regras de `ShellState`
(`app/src/main/java/app/mtvtv/ShellState.kt`, também Kotlin puro):

- **Navegação:** `shouldOverrideUrlLoading` barra toda navegação do frame principal fora de
  `canNavigate`. Os frames internos (o player do YouTube) não são policiados pela casca; o CSP do
  app hospedado já limita `frame-src` ao YouTube.
- **Sair pela ponte:** a WebView injeta `MtvTv` em toda página e frame e não diz de onde veio a
  chamada. Por isso `exitApp()` lê a URL da página principal na thread principal, na hora de
  decidir, e só fecha o app se ela passar em `canCallExitApp` e o aviso não estiver na tela.
- **Aviso:** carregado com base nula (`about:blank`, origem opaca, sem o localStorage do app
  hospedado), reprovado por `canCallExitApp`. Sair nele é pelas teclas, nunca pela ponte.

## Testes unitários

```bash
cd android && ./gradlew test
```

`OriginPolicyTest` e `ShellStateTest` rodam na JVM, sem emulador.

## URL do app hospedado

O build lê o domínio e o caminho base de `config/hosted.json` (versionado). O Gradle chama `web/scripts/hosted-config.ts android-url` e expõe o resultado como `BuildConfig.APP_URL`, a mesma URL usada para gerar o `config.xml` da Tizen. Sem o arquivo, o build falha dizendo o que criar. Ver [`tizen/README.md`](../tizen/README.md#configuração-por-build).

## Publicar e rollback

A TCL abre o app do GitHub Pages. Os comandos ficam no [README](../README.md#publicar-o-site): `pnpm publish:site`, `pnpm publish:list` e `pnpm publish:rollback <tag>` (rodam em `web/`).

- Depois de publicar ou de fazer rollback, basta reabrir o app na TV. Não precisa reinstalar.
- Reinstale (`install-tv.sh`) só se mudar o `config/hosted.json` ou a casca (`android/`).
- Uma publicação quebrada quebra o app na TV até o rollback.
