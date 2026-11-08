# Casca Android TV

APK Kotlin com uma Activity em tela cheia e uma única WebView que carrega o app web de
`app/src/main/assets/web/index.html`. Enquanto a #2 não está integrada, esse arquivo é uma página
de exemplo que mostra a última tecla recebida.

## Trocar a página de exemplo pelo app web

O build do app web (#2) deve ser copiado para **`android/app/src/main/assets/web/`** (com
`index.html` na raiz dessa pasta). Basta substituir o conteúdo da pasta e reinstalar.

A casca chama `window.dispatchTvKey(type, key, code, keyCode, androidKeyCode)` a cada tecla
(setas, OK = `Enter`, Voltar = `Escape`, CH+/CH- = `ChannelUp`/`ChannelDown`, keyCode 427/428; Menu = `ContextMenu` e tecla amarela = `ColorF2Yellow`, que alternam ao vivo/fila) e
também dispara o evento no `document`. Se a função retornar `true`, a tecla foi tratada; no Voltar,
retornar algo diferente de `true` faz a Activity sair.

## Pré-requisitos no Mac

- JDK 17 (`brew install openjdk@17`, e `JAVA_HOME` apontando para ele)
- Android SDK com `platform-tools` (`adb`) e `platforms;android-34` (`brew install --cask android-commandlinetools`).
  Crie `android/local.properties` com `sdk.dir=<caminho do SDK>` (o arquivo é ignorado pelo git).

## Instalar na TV (TCL C06)

1. Na TV: **Configurações → Sistema → Sobre**, e aperte OK sete vezes em **Build do Android TV** para liberar o modo desenvolvedor.
2. **Configurações → Sistema → Opções do desenvolvedor**: ligue **Depuração USB** e **Depuração por rede/ADB sobre rede** (o nome varia entre versões).
3. Veja o IP da TV em **Configurações → Rede e Internet**. Mac e TV precisam estar na mesma rede.
4. No Mac, rode:

   ```bash
   android/scripts/install-tv.sh 192.168.0.50      # porta padrão 5555
   ```

   O script faz `adb connect`, compila (`./gradlew assembleDebug`), instala com `adb install -r` e abre o app.
5. Na primeira conexão a TV mostra "Permitir depuração?". Escolha **Sempre permitir** e rode o script de novo se precisar.
6. O app aparece na tela inicial (linha de apps) com banner.

## Emulador

`scripts/install-tv.sh --device emulator-5554` instala em um emulador Android TV já aberto.
No emulador, desligue a verificação do Play Protect para a instalação não travar:
`adb shell settings put global package_verifier_enable 0`.
