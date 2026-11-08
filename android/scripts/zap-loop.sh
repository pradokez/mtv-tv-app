#!/usr/bin/env bash
# Simula zapping na TV: manda CH+ (KEYCODE_CHANNEL_UP) a cada N segundos (teste de resistência, #8).
# Uso: scripts/zap-loop.sh <serial> [intervalo-em-segundos]   (padrão 15)
# Termina com Ctrl+C ou kill. Falhas do adb são ignoradas; o laço segue na próxima rodada.
set -uo pipefail

SERIAL="${1:?uso: $0 <serial> [intervalo]}"
INTERVAL="${2:-15}"

n=0
while true; do
  n=$((n+1))
  if adb -s "$SERIAL" shell input keyevent KEYCODE_CHANNEL_UP >/dev/null 2>&1; then
    echo "$(date -u +%FT%TZ) zap $n"
  else
    echo "$(date -u +%FT%TZ) zap $n FALHOU (adb)"
    adb connect "$SERIAL" >/dev/null 2>&1
  fi
  sleep "$INTERVAL"
done
