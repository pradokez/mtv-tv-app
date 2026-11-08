#!/usr/bin/env bash
# Amostra a memória do app na TV a cada N segundos e grava um CSV (teste de resistência, #8).
# Uso: scripts/sample-memory.sh <serial> <saida.csv> [intervalo-em-segundos]   (padrão 60)
# Mede o processo do app e o renderer do WebView (processo à parte), mais a memória do sistema.
# Termina com Ctrl+C ou kill. Se o adb cair, tenta reconectar e segue anotando.
set -uo pipefail

SERIAL="${1:?uso: $0 <serial> <saida.csv> [intervalo]}"
OUT="${2:?informe o CSV de saída}"
INTERVAL="${3:-60}"
PKG=app.mtvtv

adbs() { adb -s "$SERIAL" "$@"; }

[ -s "$OUT" ] || echo "iso_time,elapsed_s,app_pid,app_pss_kb,app_java_kb,app_native_kb,app_graphics_kb,renderer_pid,renderer_pss_kb,mem_available_kb,mem_free_kb,focus_ok,note" > "$OUT"

START=$(date +%s)
LAST_PID=""
while true; do
  NOW=$(date +%s)
  note=""
  if ! adbs shell true >/dev/null 2>&1; then
    adb connect "$SERIAL" >/dev/null 2>&1
    if ! adbs shell true >/dev/null 2>&1; then
      echo "$(date -u +%FT%TZ),$((NOW-START)),,,,,,,,,,,adb_offline" >> "$OUT"
      sleep "$INTERVAL"; continue
    fi
    note="adb_reconnected"
  fi

  pid=$(adbs shell pidof "$PKG" | tr -d '\r' | awk '{print $1}')
  if [ -n "$LAST_PID" ] && [ "$pid" != "$LAST_PID" ]; then note="${note:+$note;}pid_changed(${LAST_PID}->${pid:-none})"; fi
  [ -n "$pid" ] && LAST_PID="$pid"

  app_pss=""; java=""; native=""; gfx=""; rpid=""; rpss=""
  if [ -n "$pid" ]; then
    summary=$(adbs shell dumpsys meminfo "$pid" 2>/dev/null)
    app_pss=$(echo "$summary" | awk '/TOTAL PSS:/ {print $3; exit}')
    java=$(echo "$summary" | awk '/Java Heap:/ {print $3; exit}')
    native=$(echo "$summary" | awk '/Native Heap:/ {print $3; exit}')
    gfx=$(echo "$summary" | awk '/Graphics:/ {print $2; exit}')
  fi
  rpid=$(adbs shell ps -A 2>/dev/null | tr -d '\r' | awk '/sandboxed_process/ {print $2; exit}')
  [ -n "$rpid" ] && rpss=$(adbs shell dumpsys meminfo "$rpid" 2>/dev/null | awk '/TOTAL PSS:/ {print $3; exit}')

  avail=$(adbs shell grep -E '^MemAvailable' /proc/meminfo | tr -d '\r' | awk '{print $2}')
  free=$(adbs shell grep -E '^MemFree' /proc/meminfo | tr -d '\r' | awk '{print $2}')
  if adbs shell dumpsys window 2>/dev/null | grep -q "mCurrentFocus=.*$PKG"; then focus=1; else focus=0; fi

  echo "$(date -u +%FT%TZ),$((NOW-START)),$pid,$app_pss,$java,$native,$gfx,$rpid,$rpss,$avail,$free,$focus,$note" >> "$OUT"
  sleep "$INTERVAL"
done
