# Validação final na TV (issue #13)

**Resultado parcial.** A validação foi interrompida por decisão da dona do projeto em 2026-11-08. O que falta está na issue #35.

- **Aparelho:** TCL C06, Android 11, WebView 156, viewport 961×541.
- **Build:** `main` em `1be544f` mais a correção do som (seção [Correção](#correção)), com o catálogo real (111 canais, 106.554 vídeos). Não inclui a #34, mesclada depois.

## Como foi verificado

- **adb + CDP:** teclas com `adb input keyevent`, que passam pela casca Android, e leitura do DOM, do localStorage e do player dentro do iframe do YouTube com [`android/scripts/tv-cdp.mjs`](../../android/scripts/tv-cdp.mjs).
- **Grade:** o clipe esperado foi calculado com `web/src/schedule/live-schedule.ts` e o catálogo real, e comparado com o `video_id` e o `currentTime` do player.
- **Relógio:** nas bordas e na história 29, `Date.now` foi deslocado só em memória, só na origem do app.
- **Controle físico:** feito pela dona do projeto, na TV. Esse é o único teste que prova os keycodes reais do controle; o adb só prova o mapeamento da casca.

## Legenda

| Marca | Significado |
| --- | --- |
| ✅ | Verificado |
| ⚠️ | Verificado com ressalva ou desvio |
| ❌ | Divergência em aberto, na #35 |
| ⏳ | Não verificado, na #35 |

## Histórias

### Abrir e assistir

| # | Estado | Passos e resultado |
| --- | --- | --- |
| 1 | ✅ | Controle físico: banner na lista de apps, abre direto. |
| 2 | ✅ | Canal X = `90s`. Após `force-stop` e reabrir, e após HOME e reabrir, volta em `90s`, tocando. |
| 3 | ✅ | `pm clear` e abrir: canal `70s` (o primeiro), tocando em ~16 s. |
| 4 | ⚠️ | Sem elementos do navegador, e o player ocupa a tela. Desvio 1: a interface do YouTube aparece no início de cada clipe. |
| 5 | ✅ | Toca sem apertar play. Falhou antes da correção; depois dela, 10 trocas seguidas sem mudo nem aviso. |
| 6 | ✅ | Fila: posicionei o vídeo 4 s antes do fim, e o próximo começou sozinho, com tarja. |
| 7 | ⏳ | `FLAG_KEEP_SCREEN_ON` está no código, mas a espera além do descanso de 5 min não foi feita. |

### Controle remoto

| # | Estado | Passos e resultado |
| --- | --- | --- |
| 8 | ✅ | adb: cima no último (`deankarr`) vai a `70s`; baixo no primeiro volta a `deankarr`. Controle físico ok. |
| 9 | ✅ | adb: CH+ de `70s` a `80s`, CH- de volta. Controle físico ok. |
| 10 | ✅ | adb: a tarja bate com o catálogo e com o título no YouTube ("ABBA", "Ring, Ring", "01 · MTV 70s"). Controle físico: conferida em 3 canais. |
| 11 | ✅ | Tarja aparece na troca de canal e de clipe; sumiu na checagem seguinte, 9 s depois. |
| 12 | ✅ | adb e controle físico. |
| 13 | ⚠️ | adb: na fila, seta direita troca o clipe e fica no canal. Faltou confirmar no controle físico. |
| 14 | ✅ | adb: mesmo `video_id`, aviso "Ao vivo não se pula". Controle físico ok. |
| 15 | ✅ | adb e controle físico: Voltar fecha tarja e guia, sem abrir a confirmação de saída. |
| 16 | ⚠️ | adb: a confirmação abre em "Continuar"; Voltar e "Continuar" cancelam; "Sair" leva à home da TV. Faltou confirmar no controle físico. |
| 17 | ✅ | 10× pela casca e rajada de 10 a cada 100 ms: canal certo, 1 iframe, 1 `<video>`. Controle físico ok. |

### Guia de canais

| # | Estado | Passos e resultado |
| --- | --- | --- |
| 18 | ✅ | 113 linhas (111 canais e 2 ajustes). Todo canal com nome e ícone. |
| 19 | ✅ | Baixo 3× e OK: sintoniza o canal em foco e fecha o guia. |
| 20 | ✅ | Foco e marca de sintonizado no canal atual. |
| 21 | ✅ | O texto da linha bate com a grade, e sintonizar toca o mesmo `video_id`. |
| 22 | ✅ | Marcar, desmarcar e persistir após `force-stop`. |
| 23 | ✅ | Favoritos no topo, com o foco acompanhando o canal marcado. |
| 24 | ✅ | Com filtro, o zapping só passa por favoritos. Sem favoritos, zapping normal e aviso "Sem favoritos: mostrando todos os canais". |
| 25 | ✅ | Dona do projeto, a ~3 m: legível, foco claro. Nomes longos são truncados no modo ao vivo. |
| 26 | ✅ | Player em estado de reprodução com o guia aberto. |

### Modo ao vivo

| # | Estado | Passos e resultado |
| --- | --- | --- |
| 27 | ⚠️ | Em 5 sintonias, o `video_id` bateu e começou no meio do clipe, de 4 a 9 s atrás da grade. Ver a #35. |
| 28 | ⏳ | Comparação com o Mac não feita. |
| 29 | ⚠️ | Com o relógio +10 min (simulado, sem esperar): `video_id` da grade, 9 s atrás. De volta ao relógio real, volta o clipe da grade. |
| 30 | ⚠️ | Calculado, não assistido: nos 111 canais, um ciclo toca cada vídeo uma vez. |
| 31 | ✅ | Linha "Modo" do guia e tecla Menu alternam; persiste após `force-stop`. |
| 32 | ⏳ | Só com testes de unidade. |

### Robustez

| # | Estado | Passos e resultado |
| --- | --- | --- |
| 33, 34, 35 | ⏳ | Não testadas nesta validação. |
| 36 | ⚠️ | Desvio 2: sem as 3 h; ficam os dados da #8. |
| 37 | ⚠️ | Dona do projeto: fluido, sem engasgos. Sem medição de frames. Qualidade observada variou de `small` a `hd720`, conforme o vídeo e o carregamento. |
| 38 | ⏳ | Passou na #8, em build anterior; não repetida. |

### Catálogo e manutenção

| # | Estado | Passos e resultado |
| --- | --- | --- |
| 39 | ✅ | `pnpm catalog` executado pela dona do projeto: 111 canais, 106.554 vídeos. |
| 40 | ✅ | Script no `catalog.json`: 0 vídeos sem `durationSec`. |
| 41 | ✅ | Relatório: 59 privados ou removidos, 4 não embutíveis, 3 sem duração. |
| 42 | ⚠️ | Relatório: 2.133 unidades, compatível com lotes de 50. Console do Google não conferido. |
| 43 | ⏳ | Segunda execução não feita. |
| 44 | ✅ | Relatório traz canais, válidos, descartados e cota. |
| 45, 46, 48 | ⏳ | Não testadas; a 45 e a 48 só têm testes de código. |
| 47 | ⏳ | Depende da #30; o APK foi instalado à mão. |
| 49 | ⚠️ | Script: chaves só `artist`, `song`, `durationSec`, `title`, sem ano. 100.726 com artista e música, 5.813 só com título, 15 sem metadado. 287 artistas contêm "channel", como "Ronja´s Dr Hook Channel": o dado vem do índice do site e não foi medido o quanto está errado. |

## Casos de borda

| Caso | Estado | Resultado |
| --- | --- | --- |
| Virada de ciclo | ⚠️ | Entra o primeiro do ciclo seguinte, sem repetir, ~10 s depois do previsto. |
| Último segundo de um clipe | ❌ | Carrega o clipe anterior e depois o próximo, que começa ~5 s depois do fim na grade. |
| Zapping ao vivo com "só favoritos" | ⏳ | Teste interrompido. |
| Guia aberto na troca de clipe | ✅ | A linha do canal sintonizado atualiza; foco e rolagem não mudam. |
| Sem internet ao abrir | ⏳ | Não testado. |
| Canal em que todos falham | ⏳ | Não testado. |
| O que não deve acontecer | ⚠️ | No que foi testado: sem tela de erro, sem vídeo duplicado, sem foco preso. Sem provocar erros de vídeo, não prova a parte da tela de erro. |

## Validação visual

Capturas da TV, no PR. Nada foi capturado no Mac.

| Tela | Estado |
| --- | --- |
| Vídeo limpo | ✅ |
| Tarja com artista e música, sobre vídeo claro | ✅ |
| Tarja só com título, sem metadado, título longo, sobre vídeo escuro | ⏳ |
| Confirmação de saída | ✅ |
| Guia: normal, com favoritos, sem favoritos (aviso), "agora no ar" | ✅ |
| Sem internet e canal sem vídeos | ⏳ |
| Área segura, legibilidade a 3 m, foco | ✅ Avaliação da dona do projeto |
| Saltos de layout ao abrir e fechar | ⏳ Não medido |

## Correção

**Vídeo mudo ao trocar de canal.** A checagem de autoplay rodava 1,5 s depois do load, com o player ainda carregando, e isso era lido como bloqueio. O vídeo ficava mudo com "Aperte qualquer tecla para ligar o som", atrás da tarja. Agora a checagem não roda na casca Android, e no navegador para depois do primeiro clipe com som.

## Desvios conscientes

1. **Interface do YouTube no início de cada clipe (história 4).** Título, pausa, "Mais vídeos" e logo aparecem por ~3 s depois que o vídeo começa, também por cima da tarja. O player embutido do YouTube traz isso mesmo com `controls=0`, e trocar o User-Agent não muda. **Motivo:** a dona do projeto não se incomoda, e as alternativas (cobrir com cortina ou injetar CSS no iframe) têm custo próprio.
2. **Sem o teste de 3 h (história 36).** **Motivo:** decisão da dona do projeto. A memória em uso longo segue sem conclusão, como em [`docs/teste-resistencia/`](../teste-resistencia/README.md).

## Observações para repetir o teste

- Gravações no localStorage logo antes de `force-stop` se perdem. Com 3 s de espera, persistiram. Isso também explica resultados do log com `modo: queue`.
- `screencap` falha às vezes nessa TV, e o script tenta de novo.
- Com a TV em descanso de tela (`DreamActivity`), a lista de páginas do CDP vem vazia: acorde a TV antes.
