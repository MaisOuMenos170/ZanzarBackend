# migrations/

Migrações pontuais de dados. Rode uma vez por ambiente.

```bash
npm run db:migrate:geo   # places: cria geoLocation (GeoJSON Point) a partir de geometry.location
npm run db:backfill:completers            # roteiros: recalcula completedCount e recentCompleters a partir de users (dry-run)
npm run db:backfill:completers -- --apply # idem, gravando
```
