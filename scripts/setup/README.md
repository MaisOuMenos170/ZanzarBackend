# setup/

Cria as collections e os índices do MVP no database `Zanzardb`.

```bash
npm run setup:collections   # bash scripts/setup/setup-collections.sh
```

- `setup-collections.js` — roda no mongosh; também pode ser colado em Atlas → Browse Collections → `_MONGOSH`.
- `setup-collections.sh` — resolve a URI e chama o `.js` via `lib/mongosh-run.sh`.

Idempotente: collections já existentes são só listadas. Para setup + seed de uma vez: `npm run db:init`.
