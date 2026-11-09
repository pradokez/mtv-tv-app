#!/usr/bin/env bash
# Gera o .wgt assinado com o perfil Samsung (padrão: mtvtv).
# Uso: tizen/scripts/build-wgt.sh [--test|--app]
#   --test  página de teste (navigator.userAgent), sem catálogo (padrão)
#   --app   rebuilda o app web (pnpm build) e empacota web/dist
set -euo pipefail

cd "$(dirname "$0")/.."
TIZEN_DIR="$PWD"
REPO_DIR="$(cd .. && pwd)"
# shellcheck source=env.sh
. "$TIZEN_DIR/scripts/env.sh"

MODE="${1:---test}"
case "$MODE" in
  --test) SRC="$TIZEN_DIR/test-page" ;;
  --app)
    echo "Compilando o app web..."
    (cd "$REPO_DIR/web" && pnpm build)
    SRC="$REPO_DIR/web/dist"
    ;;
  *) echo "Uso: $0 [--test|--app]" >&2; exit 1 ;;
esac

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
cp -R "$SRC/." "$STAGE/"
cp "$TIZEN_DIR/config.xml" "$TIZEN_DIR/icon.png" "$STAGE/"

OUT="$TIZEN_DIR/build"
rm -rf "$OUT"
mkdir -p "$OUT"
tizen package -t wgt -s "$CERT_PROFILE" -o "$OUT" -- "$STAGE"
# O pkgcmd da TV falha com espaço no nome do arquivo ("MTV TV.wgt").
for f in "$OUT"/*.wgt; do mv "$f" "$OUT/mtv-tv.wgt"; done
echo "Pacote: $OUT/mtv-tv.wgt"
