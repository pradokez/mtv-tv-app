# Teste de resistência na TV (issue #8)

Aparelho: TCL C06, Android 11 (SDK 30), `MemTotal` ≈ 940 MB. Build: `main` em `ed44639`, com o catálogo real
(111 canais, 106.620 vídeos, ~10 MB) empacotado nos assets. WebView 156.0.8078.47.

## Resultado

| Critério da issue | Resultado |
| --- | --- |
| Rodar 3 h sem travar nem fechar | **Não cumprido.** O teste foi interrompido por decisão do dono do projeto após ~9 min de amostragem (33 trocas de canal, uma a cada 15 s). Sem travamentos nem reinícios do app nesse período. |
| Memória ao longo do teste | Tabela abaixo. Só 9 amostras, insuficientes para afirmar que não há vazamento. |
| Fluidez e qualidade-alvo | Fluidez avaliada a olho pelo dono: "muito boa e rápida", inclusive no zapping a cada 15 s. Qualidade-alvo: **mantida em até 720p** (`setPlaybackQuality("hd720")` em `web/src/player/youtube-player.ts`), sem necessidade de reduzir. |
| Retomada após standby | **Cumprido.** `KEYCODE_SLEEP`, TV volta em 15–20 s direto no app, mesmo pid (4875), vídeo tocando. |
| Problemas viram issues | Nenhum problema confirmado, nenhuma issue aberta. |

A conclusão sobre memória em horas de uso **fica em aberto**: foi aceita sem a medição longa.

## Memória (KB)

PSS do app, PSS do renderer do WebView (processo `sandboxed_process`, à parte) e `MemAvailable` do sistema. Dados brutos em
[`memoria.csv`](memoria.csv).

| min | app | renderer | MemAvailable |
| ---: | ---: | ---: | ---: |
| 0 | 124.115 | 111.090 | 229.824 |
| 1 | 117.021 | 106.408 | 267.028 |
| 2 | 119.795 | 108.142 | 222.860 |
| 3 | 114.546 | 121.649 | 274.184 |
| 4 | 114.805 | 120.966 | 237.816 |
| 5 | 107.222 | 117.125 | 218.100 |
| 6 | 114.431 | 119.278 | 204.856 |
| 7 | 128.443 | 125.733 | 180.576 |
| 8 | 127.360 | 131.731 | 195.268 |

O app ficou entre 107 e 128 MB e o renderer subiu de 106 para 132 MB, com `MemAvailable` caindo de ~270 para ~190 MB. Em 9
minutos isso é indistinguível de oscilação normal (cache do WebView), mas é o ponto a observar se aparecerem fechamentos
em uso longo. Se acontecerem, as correções previstas na issue são limitar a qualidade ou recriar o player periodicamente.

## Como repetir

```bash
export PATH="/opt/homebrew/share/android-commandlinetools/platform-tools:$PATH"
cd web && pnpm catalog && pnpm publish:site  # catálogo real (não commitar) e publicação: a TCL abre o site
cd ../android && scripts/install-tv.sh <ip>:5555
scripts/sample-memory.sh <ip>:5555 ../docs/teste-resistencia/memoria.csv 60   # uma amostra por minuto
scripts/zap-loop.sh <ip>:5555 15                                                # CH+ a cada 15 s
```

Cuidados aprendidos:
- **A TV é única:** outra sessão instalando o app na mesma TV reinicia o processo (`installPackageLI` no logcat) e
  invalida a medição. Garanta que só uma sessão use o aparelho.
- **Standby derruba o adb** (`device offline`) e a depuração por rede pode voltar desligada; reative-a na TV antes de
  reconectar.
- O `sample-memory.sh` registra `pid_changed` e `adb_offline` na coluna `note` para distinguir reinícios de quedas do adb.
