#!/usr/bin/env bash
# Compila o APK e instala na TV pela rede.
# Uso: scripts/install-tv.sh <ip-da-tv>[:porta]      (porta padrão 5555; ou TV_IP=<ip-da-tv>)
#      scripts/install-tv.sh --device <serial>        (dispositivo/emulador já conectado)
set -euo pipefail

cd "$(dirname "$0")/.."
ANDROID_DIR="$PWD"
REPO_DIR="$(cd .. && pwd)"
WEB_DIR="$REPO_DIR/web"

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

if [ -f "$WEB_DIR/public/catalog.json" ]; then
  echo "Catálogo real encontrado em web/public/catalog.json."
else
  echo "Aviso: web/public/catalog.json não foi encontrado; o app usará o catálogo de exemplo de 2 canais." >&2
  echo "Para gerar o catálogo real: cd web && YOUTUBE_API_KEY=... pnpm catalog" >&2
fi

echo "Compilando o app web..."
(cd "$WEB_DIR" && pnpm build)

ASSETS_DIR="$ANDROID_DIR/app/src/main/assets/web"
BACKUP_DIR="$(mktemp -d)"
HAD_ASSETS=false
if [ -d "$ASSETS_DIR" ]; then
  HAD_ASSETS=true
  cp -R "$ASSETS_DIR" "$BACKUP_DIR/web"
fi

restore_assets() {
  rm -rf "$ASSETS_DIR"
  if [ "$HAD_ASSETS" = true ]; then
    mkdir -p "$(dirname "$ASSETS_DIR")"
    mv "$BACKUP_DIR/web" "$ASSETS_DIR"
  fi
  rm -rf "$BACKUP_DIR"
}
trap restore_assets EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

rm -rf "$ASSETS_DIR"
mkdir -p "$ASSETS_DIR"
cp -R "$WEB_DIR/dist/." "$ASSETS_DIR/"

echo "Compilando o APK..."
./gradlew --quiet assembleDebug

APK="app/build/outputs/apk/debug/app-debug.apk"
echo "Instalando $APK em $SERIAL..."
adb -s "$SERIAL" install -r "$APK"

echo "Abrindo o app..."
adb -s "$SERIAL" shell am start -n app.mtvtv/.MainActivity
echo "Pronto."
