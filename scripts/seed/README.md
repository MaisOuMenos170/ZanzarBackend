# seed/

Carga inicial de `stamp_catalog`, `places` e templates de `itineraries`.

```bash
npm run db:validate   # após mudar models (ex.: E1 routeType) — atualiza $jsonSchema no Atlas
npm run seed          # stamp_catalog + places + itineraries a partir de data/lugares.json (upsert only, sem remover órfãos)
npm run sync:lugares  # baixa lugares.json do GitHub (CacheGoogleMaps), atualiza data/lugares.json e espelha no Atlas (upsert + remove órfãos + tags/nickname)
```

Se o seed falhar com `Document failed validation`, o validador da collection no Atlas está desatualizado — rode `npm run db:validate` e tente de novo.

| Comando | Upsert | Remove órfãos | Fonte do JSON |
|---|---|---|---|
| `npm run seed` | Sim | Não | `data/lugares.json` local |
| `npm run sync:lugares` | Sim | Sim* | GitHub (CacheGoogleMaps) |

\* `syncPlaces` aborta se o catálogo estiver vazio/truncado ou com entradas inválidas. Lugares com `checkInCount > 0` nunca são removidos (ficam em `skippedOrphans`).

Variável opcional: `LUGARES_URL` (URL alternativa do JSON no sync).

### Fotos dos lugares (`images`)

O app mostra `places.images[]`: URL `https` + crédito (autor, licença, link da fonte). As fotos do Google (`photos[]`) não são mais usadas pelo app: são pagas, vencem e a política do Google proíbe guardá-las.

As imagens ficam em `data/place-images.json` (`{ "<place_id>": [ { url, credit } ] }`) porque o `sync:lugares` sobrescreve o `lugares.json`. `npm run seed` e `npm run sync:lugares` mesclam o manifesto ao catálogo (`place-images.js`), recusam crédito incompleto e nunca apagam imagens de lugares que não estão no manifesto.

Para pontos turísticos há fotos livres na Wikimedia Commons. Escolha o arquivo à mão (a busca por proximidade traz fotos do entorno):

```bash
npm run images:add -- --place <place_id> --commons "File:Nome.jpg" --commons "File:Outro.jpg"          # simulação
npm run images:add -- --place <place_id> --commons "File:Nome.jpg" --commons "File:Outro.jpg" --apply  # grava
```

Aceita CC0, domínio público, CC BY e CC BY-SA (recusa NC e ND). A licença exige mostrar o autor na tela, e o app já mostra. Depois: `npm run db:validate` (uma vez, para o campo `images`) e `npm run seed`.

Para bares, restaurantes e cafés, que não têm foto livre, a foto precisa ser própria ou cedida pelo estabelecimento: ponha a URL e o crédito no manifesto.

- `seed-zanzardb.{js,sh}` — seed local.
- `sync-lugares-from-github.{js,sh}` — sync remoto.
- `lugares-lib.js` — lógica compartilhada (lugares.json → documento `places`), carregada via `load()` do mongosh.
- `lugares-inference.js` — inferência tag → category/stampId (testável via `npm test`).

### Templates de roteiro (MVP)

| Slug | Tipo | Descrição |
| --- | --- | --- |
| `visitando-parques` | `free` | 4 check-ins em qualquer lugar da categoria `park`; `completedCount: 40` |
| `centro-historico` | `fixed` | Ruínas de São Francisco → Cavalo Babão → Memorial de Curitiba → Arcádia; `completedCount: 20` |
