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
      "durationSec": 225,                 // opcional na fase 1; exigido pela grade ao vivo (fase 2)
      "artist": "a-ha",                   // opcional
      "song": "Take On Me",               // opcional
      "title": "a-ha - Take On Me (Official Video)" // opcional: título original do YouTube
    }
  }
}
```

- Os vídeos ficam num mapa por ID, separados dos canais. Um clipe que aparece em vários canais é descrito uma vez só.
- Sem `artist` ou `song`, a tarja usa `title`.

## Regras de carga

- `schemaVersion` diferente de `1`, ou ausente, gera `CatalogError` com uma mensagem clara (ex.: `Catálogo com esquema v2; este app entende v1`), e o app mostra essa mensagem na tela.
- Forma inválida (`channels` que não é uma lista, `videos` que não é um objeto, canal sem `id`/`name`/`icon`/`order`/`videoIds`) também gera `CatalogError`.
- IDs em `videoIds` sem entrada em `videos` são ignorados. Canais que ficam sem vídeo são omitidos.
- Os canais são listados em ordem crescente de `order`. O primeiro é o canal padrão.

## Versionamento

Qualquer mudança incompatível (renomear ou remover campo, mudar tipo ou semântica) incrementa `CATALOG_SCHEMA_VERSION` em `schema.ts` e a versão gravada pelo Catalog Builder. Campos novos e opcionais não exigem nova versão.
