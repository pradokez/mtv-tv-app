#!/usr/bin/env bash
# Instala o .wgt de tizen/build na TV e abre o app.
# Uso: tizen/scripts/install-tv.sh [ip-da-tv]     (padrão: $TV_IP ou 192.168.0.13)
# ATENÇÃO: a TV é compartilhada e tem dados de uso reais; confirme com o dono antes.
set -euo pipefail

cd "$(dirname "$0")/.."
# shellcheck source=env.sh
. "$PWD/scripts/env.sh"

TV="${1:-${TV_IP:-$TV_IP_DEFAULT}}"
APP_ID="$(sed -n 's/.*<tizen:application id="\([^"]*\)".*/\1/p' config.xml)"
[ -n "$APP_ID" ] || { echo "Não achei o id do app em tizen/config.xml." >&2; exit 1; }
WGT="$PWD/build/$WGT_NAME"
[ -f "$WGT" ] || { echo "Nenhum $WGT_NAME em tizen/build; rode scripts/build-wgt.sh antes." >&2; exit 1; }

nc -z -w3 "$TV" "$SDB_PORT" || { echo "Porta $SDB_PORT fechada em $TV: reative o modo desenvolvedor e reinicie a TV." >&2; exit 1; }
sdb connect "$TV:$SDB_PORT"
tizen install -n "$WGT" -s "$TV:$SDB_PORT"
tizen run -p "$APP_ID" -s "$TV:$SDB_PORT"
