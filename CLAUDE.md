# ZanzarBackend

API REST do Zanzar (app iOS em `../Zanzar`, repositório git separado). Veja `../Zanzar/docs/APP-BACKEND.md` para a ligação entre os dois.

## Stack

- Node >= 20 (CI usa 22), TypeScript, Express 5, Mongoose 9, Zod 4, JWT (access + refresh), bcrypt, helmet, express-rate-limit, pino.
- MongoDB Atlas, database `Zanzardb`. Sem Docker e sem `mongod` local: o desenvolvimento aponta para o Atlas (`MONGODB_URI`).
- Deploy: Railway (Nixpacks, `npm run build` + `npm start`, healthcheck `/health`). Ver `railway.json`.
- Testes: vitest (`*.vitest.ts`) e um conjunto legado rodado com `tsx` (`*.test.ts`, ver `test:legacy` no `package.json`).

## Linguagens

| Linguagem | Onde | Para quê |
|---|---|---|
| TypeScript | `src/` (112 arquivos), `scripts/validators/` | A API inteira e o aplicador de `$jsonSchema` |
| JavaScript | `scripts/seed`, `scripts/setup`, `scripts/migrations`, `scripts/triggers` | Seed de lugares/selos, criação de collections, migração de geolocalização, trigger legado do Atlas (mongosh) |
| Shell | `scripts/**/*.sh` | Wrappers dos scripts acima, túnel Cloudflare, liberar IP no Atlas |
| Python | `scripts/lib/resolve-mongo-uri.py` | Resolve a URI do Mongo para os scripts shell |
| `.mjs` | `scripts/contracts/comment.mjs` | Comenta no PR as mudanças de contrato com o app |
| YAML | `.github/workflows` | CI e checagem do contrato de schema |

## Estrutura

```
src/index.ts            entrada: env, rate limit global, rotas, shutdown gracioso
src/config/             env, conexão MongoDB
src/modules/<x>/        routes -> controller -> service -> repository
                        x = auth, users, places, checkin, rating, stamps, itineraries, health, sync
src/schemas/            Zod: contrato de request/response (fonte da verdade do formato)
src/models/             schemas Mongoose (collections)
src/middlewares/        validateAuthToken, validateSchema, rateLimiters, errorHandler, requestLogger
src/events/triggers/    lógica de domínio reaproveitada pela API (check-in, progresso de roteiro)
src/constants/          categorias, impression tags, auth
scripts/                db, seed, migrações, dev (ver scripts/README.md)
data/lugares.json       seed de lugares (Google Places + extensão `zanzar`)
data/place-images.json  fotos dos lugares (URL + crédito), mescladas no seed; ver scripts/seed/README.md
```

Collections: `users`, `places`, `stamp_catalog`, `itineraries`, `checkins`, `rating`, `sync_mutations`. Roteiros do usuário ficam embutidos em `users`.

## Rodar e testar

```bash
npm ci
cp .env.example .env     # preencher; nunca commitar
npm run dev              # tsx watch src/index.ts
npm run typecheck
npx vitest run           # 18 testes
npm test                 # vitest + legado (tsx)
npm run build && npm start
```

- Estado em 2026-10-29: `typecheck` limpo e `vitest` 9 arquivos / 18 testes passando. O `test:legacy` não foi executado.
- Variáveis (só nomes): `NODE_ENV`, `PORT`, `MONGODB_URI`, `MONGODB_URI_STANDARD`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `CHECKIN_RADIUS_METERS`, `GOOGLE_PLACES_API_KEY`, `SIGNUP_ENABLED`, `LOG_LEVEL`. Obrigatórias na subida: `JWT_SECRET` e `MONGODB_URI`.
- A porta padrão no código é 8000, mas README e app assumem 3000. Defina `PORT=3000` no `.env` local.
- Banco: `npm run db:init` (collections + seed), `npm run db:validate:dry` antes de `db:validate`.
- Check-in usa transação MongoDB: precisa de replica set (Atlas serve).

## Convenções

- Rota nova: schema Zod em `src/schemas`, módulo com routes/controller/service/repository, `validateSchema` na rota.
- Mudou um schema usado pelo app? Atualize `scripts/contracts/swift-clients.json` e avise o app. O CI `schema-contract.yml` comenta no PR.
- Fotos: `places.images[]` (URL https + crédito). Nada de Google Places Photos (pago e proibido guardar). `npm run images:add` para fotos livres da Commons.
- Logs com pino (`src/utils/logger`); campos sensíveis já são redigidos. Não logar tokens nem senhas.
- Testes novos em vitest (`*.vitest.ts`). Não adicione testes novos ao grupo legado.
- Segredos só em `.env` (ignorado). Não leia nem imprima valores; cite apenas os nomes.

## Qual ferramenta usar

| Situação | Ferramenta |
|---|---|
| Entender fluxo / quem chama quem | codebase-memory (`search_graph`, `trace_path`) e `stacklit.json` |
| Contrato com o app | `src/schemas/*` + `scripts/contracts/swift-clients.json` |
| Biblioteca (Mongoose, Zod, Express, vitest) | Context7 |
| Lacunas de teste | skill `test-gap-audit` (`.agents/skills`) |
| Banco | `scripts/` via npm scripts; mongosh não está instalado |
