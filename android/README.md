# Casca Android TV

APK Kotlin com uma Activity em tela cheia e uma única WebView que carrega o app web de
`app/src/main/assets/web/index.html`. Enquanto a #2 não está integrada, esse arquivo é uma página
de exemplo que mostra a última tecla recebida.

## Trocar a página de exemplo pelo app web

O build do app web (#2) deve ser copiado para **`android/app/src/main/assets/web/`** (com
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

- `canNavigate(url)`: a casca só navega para o app hospedado (`https://<domínio>/`, em
  qualquer caminho) e para o player do YouTube (`www.youtube.com` e `www.youtube-nocookie.com`).
  Recusa `http`, `file:`, `javascript:`, `data:`, subdomínios parecidos, credenciais na URL, porta
  diferente da padrão e URL malformada.
- `canCallExitApp(url)`: só o app hospedado pode chamar `MtvTv.exitApp()`. O YouTube não pode.

O domínio vem por parâmetro (`OriginPolicy(hostedBaseUrl)`, `https://<domínio>/`); o
construtor lança `IllegalArgumentException` se a base for inválida. A `MainActivity` ainda não usa
a política: isso entra na #64.

## Testes unitários

```bash
cd android && ./gradlew test
```

## URL do app hospedado

O build lê o domínio de `config/hosted.json` (versionado). O Gradle chama `web/scripts/hosted-config.ts android-url` e expõe o resultado como `BuildConfig.APP_URL`, a mesma URL usada para gerar o `config.xml` da Tizen. Sem o arquivo, o build falha dizendo o que criar. Ver [`tizen/README.md`](../tizen/README.md#configuração-por-build).
