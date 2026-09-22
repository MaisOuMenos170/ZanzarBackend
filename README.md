# ZanzarBackend

Base do backend — **só estrutura de pastas e config mínima**. Sem código implementado ainda.

Stack planejada: Express · Mongoose · MongoDB · JWT · TypeScript

## Estrutura

```text
ZanzarBackend/
├── data/
│   └── lugares.json       # dados de lugares (Google Places + campos futuros)
├── src/
│   ├── config/            # env, conexão MongoDB
│   ├── models/            # schemas Mongoose (8 collections)
│   ├── routes/            # endpoints REST
│   ├── services/          # regras de negócio
│   ├── middleware/        # auth JWT, validação
│   ├── scripts/           # seed, migrations
│   ├── types/             # tipos compartilhados
│   └── utils/             # helpers (geofence, categorias…)
├── .env.example
├── tsconfig.json
└── package.json
```

## Collections (database `Zanzardb`)

Schema oficial: `schema-proposto.md` (ZanzarProjetinho / docs banco-de-dados).

| Collection | Diagrama / Notion | Descrição |
|---|---|---|
| `users` | User / Perfil | Conta, selos embed, roteiros active/inactive/completed |
| `places` | Places | Google Places + extensão `zanzar` |
| `stamp_catalog` | Stamp | Catálogo curado (1 selo por categoria) |
| `itineraries` | Itinerary (geral) | Templates de roteiros curados |
| `checkins` | CheckIns | Visita; dispara selo e contadores |
| `impressions` | Rating / Reações | Emoji pós-visita (`impressionTag`) |
| `sync_mutations` | — | Idempotência do sync offline |

Roteiros do usuário ficam **embed** em `users` (não há collection `user_itineraries`).

### Inicializar banco (collections + seed)

```bash
npm run db:init      # setup + seed (recomendado na 1ª vez)
npm run setup:collections
npm run seed         # stamp_catalog + 17 places de data/lugares.json
```

Alternativa: Atlas → **ClusterZanzar** → **Browse Collections** → `_MONGOSH` → colar os `.js` de `scripts/`.

### Checklist até o banco MVP ficar 100%

| Etapa | Comando / artefato | Status típico |
|-------|-------------------|---------------|
| 1. Collections + índices | `npm run setup:collections` | ✅ feito |
| 2. Seed selos + lugares | `npm run seed` | próximo passo |
| 3. Roteiros curados | seed manual em `itineraries` | conteúdo editorial |
| 4. Backend (Mongoose + API) | `src/models`, `src/routes` | código |
| 5. Lógica de negócio | transações check-in/impression | código |

## Próximos passos (quando for implementar)

1. `npm init` / instalar dependências (express, mongoose, jsonwebtoken, zod…)
2. Copiar `.env.example` → `.env`
3. Escrever models em `src/models/`
4. Seed a partir de `data/lugares.json`
