#!/usr/bin/env bash
# Compila o APK e instala na TV pela rede.
# Uso: scripts/install-tv.sh <ip-da-tv>[:porta]      (porta padrão 5555)
#      scripts/install-tv.sh --device <serial>        (dispositivo/emulador já conectado)
set -euo pipefail

cd "$(dirname "$0")/.."

if [ $# -lt 1 ]; then
  echo "Uso: $0 <ip-da-tv>[:porta]  |  $0 --device <serial>" >&2
  exit 1
fi

if [ "$1" = "--device" ]; then
  SERIAL="${2:?informe o serial (adb devices)}"
else
  SERIAL="$1"
  case "$SERIAL" in *:*) ;; *) SERIAL="$SERIAL:5555" ;; esac
  echo "Conectando em $SERIAL..."
  adb connect "$SERIAL"
fi

echo "Compilando..."
./gradlew --quiet assembleDebug

APK="app/build/outputs/apk/debug/app-debug.apk"
echo "Instalando $APK em $SERIAL..."
adb -s "$SERIAL" install -r "$APK"

echo "Abrindo o app..."
adb -s "$SERIAL" shell am start -n app.mtvtv/.MainActivity
echo "Pronto."
