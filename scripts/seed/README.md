# seed/

Carga inicial de `stamp_catalog` e `places`.

```bash
npm run seed          # stamp_catalog + places a partir de data/lugares.json
npm run sync:lugares  # baixa lugares.json do GitHub (CacheGoogleMaps), atualiza data/lugares.json e espelha no Atlas (upsert + remove órfãos + tags/nickname)
```

Variável opcional: `LUGARES_URL` (URL alternativa do JSON no sync).

- `seed-zanzardb.{js,sh}` — seed local.
- `sync-lugares-from-github.{js,sh}` — sync remoto.
- `lugares-lib.js` — lógica compartilhada (lugares.json → documento `places`), carregada via `load()` do mongosh.
