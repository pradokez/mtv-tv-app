# Casca Android TV

APK Kotlin com uma Activity em tela cheia e uma única WebView que carrega o app web de
`app/src/main/assets/web/index.html`. O versionado é uma página de exemplo que mostra a última
tecla recebida; o `scripts/install-tv.sh` troca pelo build do app web na hora de compilar o APK e restaura a página de exemplo depois.

## Trocar a página de exemplo pelo app web

O build do app web deve ser copiado para **`android/app/src/main/assets/web/`** (com
`index.html` na raiz dessa pasta). Basta substituir o conteúdo da pasta e reinstalar.

A casca chama `window.dispatchTvKey(type, key, code, keyCode, androidKeyCode)` a cada tecla
(setas, OK = `Enter`, Voltar = `Escape`, CH+/CH- = `ChannelUp`/`ChannelDown`, keyCode 427/428; Menu = `ContextMenu` e tecla amarela = `ColorF2Yellow`, que alternam ao vivo/fila; Info = `Info`, keyCode 165, que mostra a tarja) e
também dispara o evento no `document`. Se a função retornar `true`, a tecla foi tratada; no Voltar,
retornar algo diferente de `true` faz a Activity sair.

## Pré-requisitos no Mac

- JDK 17 (`brew install openjdk@17`, e `JAVA_HOME` apontando para ele)
- Android SDK com `platform-tools` (`adb`) e `platforms;android-34` (`brew install --cask android-commandlinetools`).
  Crie `android/local.properties` com `sdk.dir=<caminho do SDK>` (o arquivo é ignorado pelo git).

## Instalar na TV (TCL C06)

1. Se quiser os canais reais, gere antes o snapshot em `../web/` com `YOUTUBE_API_KEY=... pnpm catalog`. Sem `../web/public/catalog.json`, o script de instalação avisa que usará o catálogo de exemplo de 2 canais.
2. Na TV: **Configurações → Sistema → Sobre**, e aperte OK sete vezes em **Build do Android TV** para liberar o modo desenvolvedor.
3. **Configurações → Sistema → Opções do desenvolvedor**: ligue **Depuração USB** e **Depuração por rede/ADB sobre rede** (o nome varia entre versões).
4. Veja o IP da TV em **Configurações → Rede e Internet**. Mac e TV precisam estar na mesma rede.
5. No Mac, rode:

   ```bash
   android/scripts/install-tv.sh <ip-da-tv>      # ou TV_IP=<ip-da-tv>; porta padrão 5555
   ```

   O script compila `../web/` com `pnpm build`, usa temporariamente o resultado em `app/src/main/assets/web/`, compila (`./gradlew assembleDebug`), instala com `adb install -r` e abre o app. Ao terminar ou falhar, restaura os assets versionados.
6. Na primeira conexão a TV mostra "Permitir depuração?". Escolha **Sempre permitir** e rode o script de novo se precisar.
7. O app aparece na tela inicial (linha de apps) com banner.

## Emulador

`scripts/install-tv.sh --device emulator-5554` instala em um emulador Android TV já aberto.
No emulador, desligue a verificação do Play Protect para a instalação não travar:
`adb shell settings put global package_verifier_enable 0`.

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
construtor lança `IllegalArgumentException` se a base for inválida. A `MainActivity` ainda não usa
a política: isso entra na #64.

## Testes unitários

```bash
cd android && ./gradlew test
```

## URL do app hospedado

O build lê o domínio e o caminho base de `config/hosted.json` (versionado). O Gradle chama `web/scripts/hosted-config.ts android-url` e expõe o resultado como `BuildConfig.APP_URL`, a mesma URL usada para gerar o `config.xml` da Tizen. Sem o arquivo, o build falha dizendo o que criar. Ver [`tizen/README.md`](../tizen/README.md#configuração-por-build).

## Publicar e rollback

Os comandos de publicar e de rollback do site estão no [README](../README.md#publicar-o-site).

**Estado atual (até a #64):** a `MainActivity` carrega `assets/web/index.html` de dentro do APK (`START_URL`), então publicar ou fazer rollback não muda nada na TCL. Para atualizar o app, reinstale com `android/scripts/install-tv.sh`. Depois da #64 a casca carrega `BuildConfig.APP_URL` e passa a seguir o site publicado.
