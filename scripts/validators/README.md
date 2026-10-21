# validators/

Gera o `$jsonSchema` a partir dos models Mongoose (`src/models`) e aplica como validador das collections no Atlas.

```bash
npm run db:validate       # aplica no Atlas (+ rename impressions → rating)
npm run db:validate:dry   # só imprime, não altera nada
```

Usa `tsx` e lê `MONGODB_URI` do `.env`. Depende de `src/db/mongoose-to-jsonschema.ts`. Rode novamente sempre que um model mudar.
