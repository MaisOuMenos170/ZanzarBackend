# seed/

Carga inicial de `stamp_catalog` e `places`.

```bash
npm run seed          # stamp_catalog + places a partir de data/lugares.json (upsert only, sem remover órfãos)
npm run sync:lugares  # baixa lugares.json do GitHub (CacheGoogleMaps), atualiza data/lugares.json e espelha no Atlas (upsert + remove órfãos + tags/nickname)
```

| Comando | Upsert | Remove órfãos | Fonte do JSON |
|---|---|---|---|
| `npm run seed` | Sim | Não | `data/lugares.json` local |
| `npm run sync:lugares` | Sim | Sim* | GitHub (CacheGoogleMaps) |

\* `syncPlaces` aborta se o catálogo estiver vazio/truncado ou com entradas inválidas. Lugares com `checkInCount > 0` nunca são removidos (ficam em `skippedOrphans`).

Variável opcional: `LUGARES_URL` (URL alternativa do JSON no sync).

- `seed-zanzardb.{js,sh}` — seed local.
- `sync-lugares-from-github.{js,sh}` — sync remoto.
- `lugares-lib.js` — lógica compartilhada (lugares.json → documento `places`), carregada via `load()` do mongosh.
- `lugares-inference.js` — inferência tag → category/stampId (testável via `npm test`).
