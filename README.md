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

## Collections previstas

- `users`
- `places`
- `stamps`
- `itinerary_templates`
- `user_itineraries`
- `checkins`
- `reactions`
- `user_stamps`

## Próximos passos (quando for implementar)

1. `npm init` / instalar dependências (express, mongoose, jsonwebtoken, zod…)
2. Copiar `.env.example` → `.env`
3. Escrever models em `src/models/`
4. Seed a partir de `data/lugares.json`
