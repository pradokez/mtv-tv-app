#!/usr/bin/env bash
# Gera o .wgt assinado com o perfil Samsung (padrão: mtvtv).
# Uso: tizen/scripts/build-wgt.sh [--test|--app]
#   --test  página de teste (navigator.userAgent), sem catálogo (padrão)
#   --app   lançador local (tizen/launcher) que abre a URL hospedada de config/hosted.json; sem app nem catálogo no pacote
set -euo pipefail

cd "$(dirname "$0")/.."
TIZEN_DIR="$PWD"
REPO_DIR="$(cd .. && pwd)"
# shellcheck source=env.sh
. "$TIZEN_DIR/scripts/env.sh"

MODE="${1:---test}"
case "$MODE" in
  --test) SRC="$TIZEN_DIR/test-page"; CONFIG_FLAG="--test" ;;
  --app) SRC="$TIZEN_DIR/launcher"; CONFIG_FLAG="" ;;
  *) echo "Uso: $0 [--test|--app]" >&2; exit 1 ;;
esac

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
cp -R "$SRC/." "$STAGE/"
cp "$TIZEN_DIR/icon.png" "$STAGE/"
# config.js leva a URL hospedada ao lançador (só no --app; o --test não usa).
[ "$MODE" = "--app" ] && node "$REPO_DIR/web/scripts/hosted-config.ts" launcher-config > "$STAGE/config.js"
# config.xml sai do modelo + config/hosted.json (versionado); falha se faltar o arquivo.
node "$REPO_DIR/web/scripts/hosted-config.ts" tizen-config $CONFIG_FLAG > "$STAGE/config.xml"

OUT="$TIZEN_DIR/build"
rm -rf "$OUT"
mkdir -p "$OUT"
tizen package -t wgt -s "$CERT_PROFILE" -o "$OUT" -- "$STAGE"

# O tizen gera "<name do config.xml>.wgt"; renomeia para $WGT_NAME (ver env.sh).
shopt -s nullglob
PKGS=("$OUT"/*.wgt)
[ "${#PKGS[@]}" -eq 1 ] || { echo "Esperava 1 .wgt em $OUT, achei ${#PKGS[@]}." >&2; exit 1; }
mv "${PKGS[0]}" "$OUT/$WGT_NAME"

# Com perfil inexistente o tizen package sai com 0 e gera o pacote sem assinatura.
SIGS="$(unzip -Z1 "$OUT/$WGT_NAME")"
for sig in author-signature.xml signature1.xml; do
  grep -qx "$sig" <<<"$SIGS" || {
    echo "Pacote sem $sig: confira o perfil '$CERT_PROFILE' (tizen security-profiles list)." >&2
    rm -f "$OUT/$WGT_NAME"
    exit 1
  }
done
echo "Pacote: $OUT/$WGT_NAME"
