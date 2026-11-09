# Ambiente do Tizen Studio (usado pelos outros scripts). Não execute direto.
export TIZEN_STUDIO="${TIZEN_STUDIO:-$HOME/tizen-studio}"
export PATH="$TIZEN_STUDIO/tools/ide/bin:$TIZEN_STUDIO/tools:$PATH"
if [ -z "${JAVA_HOME:-}" ]; then
  for j in /opt/homebrew/opt/openjdk@17 /opt/homebrew/opt/openjdk; do
    [ -d "$j" ] && export JAVA_HOME="$j" && break
  done
fi
[ -n "${JAVA_HOME:-}" ] && export PATH="$JAVA_HOME/bin:$PATH"
export TV_IP_DEFAULT=192.168.0.13
export SDB_PORT=26101
export CERT_PROFILE="${CERT_PROFILE:-mtvtv}"
# Sem espaço no nome: o pkgcmd da TV falha com "MTV TV.wgt".
export WGT_NAME=mtv-tv.wgt
