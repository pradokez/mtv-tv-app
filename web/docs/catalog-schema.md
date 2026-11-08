# Esquema do snapshot do catálogo — v1

O app web lê o catálogo de `catalog.json`, ao lado do `index.html` no build. O snapshot real é gerado pelo Catalog Builder (`pnpm catalog`) em `web/public/catalog.json`, que nunca é commitado. Sem ele, o dev server e o build usam o catálogo de exemplo `web/fixtures/catalog.example.json`.

Os tipos TypeScript em [`src/catalog/schema.ts`](../src/catalog/schema.ts) são a fonte da verdade. Este documento os descreve.

## Formato

```jsonc
{
  "schemaVersion": 1,                     // obrigatório; o app só aceita 1
  "generatedAt": "2026-11-07T00:00:00Z",  // opcional, informativo
  "channels": [
    {
      "id": "80s",                        // único; usado em preferências e na URL
      "name": "Anos 80",                  // exibido no guia e na tarja
      "icon": "📼",                         // emoji, ou caminho relativo ao index.html/URL de imagem
      "order": 0,                         // posição na lista de canais (crescente)
      "videoIds": ["djV11Xbc914"]         // IDs do YouTube, na ordem da playlist
    }
  ],
  "videos": {
    "djV11Xbc914": {
      "durationSec": 225,                 // em segundos; sempre presente no snapshot gerado pelo `pnpm catalog`. Vídeo sem duração fica fora da grade ao vivo; canal sem nenhuma toca em modo fila
      "artist": "a-ha",                   // opcional
      "song": "Take On Me",               // opcional
      "title": "a-ha - Take On Me (Official Video)" // opcional: título original do YouTube
    }
  }
}
```

- Os vídeos ficam num mapa por ID, separados dos canais. Um clipe que aparece em vários canais é descrito uma vez só.
- Sem `artist` ou `song`, a tarja usa `title`.
- `durationSec` vem da YouTube Data API (`contentDetails.duration`) e está presente em todo vídeo do snapshot gerado pelo Catalog Builder: vídeos privados, removidos, não embutíveis ou sem duração são descartados antes de gravar. No esquema ele segue opcional, porque o catálogo de exemplo e catálogos antigos podem não tê-lo; a grade ao vivo (fase 2) depende dele.

## Geração

`pnpm catalog` exige a chave da YouTube Data API v3 em `YOUTUBE_API_KEY` (só por variável de ambiente, nunca no repositório). As consultas vão em lotes de 50 IDs (`videos.list`, `part=contentDetails,status`, 1 unidade de cota por lote, ~2.150 unidades na primeira execução). As respostas ficam em cache em `web/.cache/youtube-meta.json`, ignorado pelo git e gravado após cada lote: uma execução interrompida retoma de onde parou e as seguintes só consultam IDs novos.

## Regras de carga

- `schemaVersion` diferente de `1`, ou ausente, gera `CatalogError` com uma mensagem clara (ex.: `Catálogo com esquema v2; este app entende v1`), e o app mostra essa mensagem na tela.
- Forma inválida (`channels` que não é uma lista, `videos` que não é um objeto, canal sem `id`/`name`/`icon`/`order`/`videoIds`) também gera `CatalogError`.
- IDs em `videoIds` sem entrada em `videos` são ignorados. Canais que ficam sem vídeo são omitidos.
- Os canais são listados em ordem crescente de `order`. O primeiro é o canal padrão.

## Versionamento

Qualquer mudança incompatível (renomear ou remover campo, mudar tipo ou semântica) incrementa `CATALOG_SCHEMA_VERSION` em `schema.ts` e a versão gravada pelo Catalog Builder. Campos novos e opcionais não exigem nova versão.
