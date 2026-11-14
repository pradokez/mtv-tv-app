#!/usr/bin/env bash
# Compila o APK e instala na TV pela rede. O APK só tem a casca: o app web vem da URL hospedada
# (config/hosted.json), então publicar o site atualiza a TV sem reinstalar.
# Uso: scripts/install-tv.sh <ip-da-tv>[:porta]      (porta padrão 5555; ou TV_IP=<ip-da-tv>)
#      scripts/install-tv.sh --device <serial>        (dispositivo/emulador já conectado)
set -euo pipefail

cd "$(dirname "$0")/.."

TARGET="${1:-${TV_IP:-}}"
if [ -z "$TARGET" ]; then
  echo "Uso: $0 <ip-da-tv>[:porta]  |  TV_IP=<ip-da-tv> $0  |  $0 --device <serial>" >&2
  exit 1
fi

if [ "$TARGET" = "--device" ]; then
  SERIAL="${2:?informe o serial (adb devices)}"
else
  SERIAL="$TARGET"
  case "$SERIAL" in *:*) ;; *) SERIAL="$SERIAL:5555" ;; esac
  echo "Conectando em $SERIAL..."
  adb connect "$SERIAL"
fi

echo "Compilando o APK..."
./gradlew --quiet assembleDebug

APK="app/build/outputs/apk/debug/app-debug.apk"
echo "Instalando $APK em $SERIAL..."
adb -s "$SERIAL" install -r "$APK"

echo "Abrindo o app..."
adb -s "$SERIAL" shell am start -n app.mtvtv/.MainActivity
echo "Pronto."
