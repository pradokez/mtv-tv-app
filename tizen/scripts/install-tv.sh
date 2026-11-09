#!/usr/bin/env bash
# Instala o .wgt de tizen/build na TV e abre o app.
# Uso: tizen/scripts/install-tv.sh [ip-da-tv]     (padrão: $TV_IP ou 192.168.0.13)
# ATENÇÃO: a TV é compartilhada e tem dados de uso reais; confirme com o dono antes.
set -euo pipefail

cd "$(dirname "$0")/.."
# shellcheck source=env.sh
. "$PWD/scripts/env.sh"

TV="${1:-${TV_IP:-$TV_IP_DEFAULT}}"
APP_ID="mtvtv0001.MtvTv"
WGT="$(ls "$PWD"/build/*.wgt 2>/dev/null | head -1 || true)"
[ -n "$WGT" ] || { echo "Nenhum .wgt em tizen/build; rode scripts/build-wgt.sh antes." >&2; exit 1; }

nc -z -w3 "$TV" 26101 || { echo "Porta 26101 fechada em $TV: reative o modo desenvolvedor e reinicie a TV." >&2; exit 1; }
sdb connect "$TV"
tizen install -n "$WGT" -t "$TV:26101"
tizen run -p "$APP_ID" -t "$TV:26101"
