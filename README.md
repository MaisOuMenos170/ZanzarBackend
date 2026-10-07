# ZanzarBackend

API REST do Zanzar — Express · Mongoose · MongoDB · JWT · TypeScript.

## Estrutura

```text
ZanzarBackend/
├── data/
│   └── lugares.json       # lugares (Google Places + extensão zanzar)
├── scripts/               # seed, setup, migrations, triggers (legado), dev
├── src/
│   ├── config/            # env, MongoDB, resolução de URI
│   ├── models/            # schemas Mongoose
│   ├── modules/           # routes → controller → service → repository
│   ├── events/triggers/   # lógica de domínio reutilizada pela API
│   ├── schemas/           # validação Zod (request/response)
│   └── utils/             # geofence, logger, helpers
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
| `checkins` | CheckIns | Visita (`userId`, `placeId`, `datetime`, `coordinates?`, `stampIdGranted`); efeitos aplicados pela API |
| `rating` | Rating / Reações | Reação pós-visita (`impressionTag`) |
| `sync_mutations` | — | Idempotência do sync offline |

### Check-in síncrono (API)

O `POST /checkIn` aplica **todos os efeitos na mesma requisição** (transação MongoDB):

- insert em `checkins` (+ `serverReceivedAt`, `coordinates` opcional, `stampIdGranted`)
- `users.checkInCount +1`, push em `users.stamps`
- `places.zanzar.checkInCount +1`
- progresso do `activeItinerary` (rota fixa e livre)

Resposta `201` traz o selo e o progresso para o app exibir o alert imediatamente.

**Geofence:** se o body incluir `coordinates`, a distância ao lugar é validada contra `CHECKIN_RADIUS_METERS` (padrão 150 m); fora do raio → `422`. Sem `coordinates`, a validação é ignorada (compatibilidade com builds antigos do app).

**Atlas trigger legado:** após o deploy do E2, **desative manualmente** o Database Trigger de `checkins` INSERT no Atlas App Services — o MCP do MongoDB não faz isso. Passo a passo + checklist: [`scripts/triggers/README.md`](scripts/triggers/README.md). Se trigger e API rodarem juntos, contadores e selos duplicam.

Roteiros do usuário ficam **embed** em `users` (não há collection `user_itineraries`).

### Inicializar banco (collections + seed)

```bash
npm run db:init      # setup + seed (recomendado na 1ª vez)
npm run setup:collections
npm run seed         # stamp_catalog + places (data/lugares.json local)
npm run sync:lugares # baixa GitHub CacheGoogleMaps → upsert no Atlas
npm run db:validate  # gera o $jsonSchema dos models Mongoose e aplica no Atlas (+ rename impressions→rating); use db:validate:dry para só imprimir
```

Cada tema de `scripts/` tem README próprio ([índice](scripts/README.md)).

Alternativa: Atlas → **ClusterZanzar** → **Browse Collections** → `_MONGOSH` → colar os `.js` de `scripts/setup/`.

## Endpoints (REST)

Base URL: `http://127.0.0.1:3000` (ou `PORT` / túnel). Prefixo comum: JSON, exceto onde indicado.

| Método | Path | Auth | Descrição |
|--------|------|------|-----------|
| GET | `/health` | — | Health check |
| POST | `/register` | — | Criar conta (rate limit) |
| POST | `/login` | — | JWT (rate limit) |
| POST | `/logout` | Bearer | Invalida sessão (`tokenVersion`) |
| GET | `/places` | opcional | Lista lugares (`lat`, `lng`, `radius`, …) |
| GET | `/places/photo?ref=&maxwidth=` | — | Proxy foto Google (rate limit; `GOOGLE_PLACES_API_KEY`) |
| GET | `/places/:placeId` | opcional | Detalhe do lugar |
| GET | `/itineraries` | Bearer | Roteiros curados |
| GET | `/itineraries/:slug` | Bearer | Detalhe por slug |
| POST | `/itineraries/:slug/activate` | Bearer | Ativa roteiro (409 se já houver ativo) |
| POST | `/itineraries/active/abandon` | Bearer | Abandona roteiro ativo |
| GET | `/user/:id` | Bearer (owner) | Usuário |
| GET | `/user/:id/profile?limit=` | Bearer (owner) | Perfil enriquecido (`itinerariesCount`, `impressionTag`) |
| GET | `/user/:id/itinerary` | Bearer (owner) | Roteiro ativo + progresso |
| POST | `/checkIn` | Bearer | Check-in síncrono (idempotente, geofence opcional) |
| GET | `/checkIn?placeId=` | Bearer | Check-in existente usuário+lugar |
| POST | `/rating` | Bearer | Reação pós-visita |
| GET | `/rating?placeId=` | Bearer | Reação existente |
| GET | `/stamps/:stampId` | Bearer | Metadados do selo |

Rotas após login usam `Authorization: Bearer <token>` exceto `/places`, `/places/photo` e auth público. Detalhes de body/resposta: seções abaixo e código em `src/modules/*/`.

### Checklist até o banco MVP ficar 100%

| Etapa | Comando / artefato | Status típico |
|-------|-------------------|---------------|
| 1. Collections + índices | `npm run setup:collections` | ✅ feito |
| 2. Seed selos + lugares | `npm run seed` | ✅ feito |
| 3. Validation JSON Schema | `npm run db:validate` | próximo passo |
| 4. Roteiros curados | seed manual em `itineraries` | conteúdo editorial |
| 5. Backend (Mongoose + API) | `src/models`, `src/routes` | código |
| 6. Lógica de negócio | transações check-in/rating | código |

## Desenvolvimento local — API + Cloudflare Tunnel

Para testar o app iOS no **simulador**, basta subir o backend em `http://127.0.0.1:3000`. No **iPhone físico**, o aparelho não alcança o `localhost` do Mac — use um [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/do-more-with-tunnels/trycloudflare/) para expor a API com uma URL pública temporária (`*.trycloudflare.com`).

Documentação completa do script que atualiza a URL no app: [Zanzar/README.md — Desenvolvimento local](https://github.com/MaisOuMenos170/Zanzar#desenvolvimento-local--api-via-cloudflare-tunnel) (ou o arquivo `README.md` no repositório irmão `Zanzar`).

### Pré-requisitos

| Ferramenta | Para quê |
|---|---|
| Node.js ≥ 20 | Rodar o backend (`npm run dev`) |
| [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/) | Criar o túnel `trycloudflare.com` |
| [ripgrep](https://github.com/BurntSushi/ripgrep) (`rg`) | O `dev-tunnel.sh` extrai a URL do log do túnel |
| Repositório `Zanzar` no mesmo diretório pai | Ex.: `~/projetos/ZanzarBackend` e `~/projetos/Zanzar` |

Instalar dependências no macOS (Homebrew):

```bash
brew install cloudflared ripgrep
```

### 1. Subir o backend

```bash
npm install
cp .env.example .env   # preencher MONGODB_URI, JWT_SECRET, etc.
npm run dev
```

O servidor sobe na porta `3000` (ou a definida em `PORT` no `.env`). Confirme localmente:

```bash
curl http://127.0.0.1:3000/health
```

### 2. Expor a API para o iPhone (fluxo recomendado)

Com o backend rodando, em **outro terminal**:

```bash
npm run tunnel
```

O script:

1. Inicia `cloudflared tunnel --url http://127.0.0.1:3000`
2. Aguarda a URL pública (ex.: `https://invest-plaza-assessed-lived.trycloudflare.com`)
3. Chama automaticamente `../Zanzar/scripts/update-api-tunnel-url.sh <url>`
4. Mantém o túnel aberto até `Ctrl+C`

Teste o túnel:

```bash
curl https://sua-url-aqui.trycloudflare.com/health
```

Depois, **rebuild** o app no Xcode (⌘B / ⌘R) para o Info.plist pegar a URL nova.

### 3. Fluxo manual (sem `dev-tunnel.sh`)

```bash
# Terminal 1 — backend
npm run dev

# Terminal 2 — túnel (copie a URL do log)
cloudflared tunnel --url http://127.0.0.1:3000

# Terminal 3 — atualizar o app iOS (a partir da raiz do Zanzar)
cd ../Zanzar
./scripts/update-api-tunnel-url.sh https://sua-url-aqui.trycloudflare.com
```

### Observações

- **URL efêmera** — toda vez que o `cloudflared` reinicia, a URL muda. Rode `dev-tunnel.sh` (ou o script do app) de novo.
- **Porta customizada** — `PORT=4000 npm run tunnel` aponta o túnel para outra porta.
- **Só Debug no app** — a URL de túnel é gravada apenas na configuração Debug do Xcode; Release usa URL de produção.

## Check-in

Exige `Authorization: Bearer <token>`.

### `POST /checkIn`

Body:

```json
{
  "placeId": "ChIJ...",
  "datetime": "2026-10-07T12:00:00.000Z",
  "clientMutationId": "550e8400-e29b-41d4-a716-446655440000",
  "coordinates": { "lat": -25.428, "lng": -49.273, "accuracyMeters": 12 }
}
```

`coordinates` é opcional. Resposta `201`:

```json
{
  "stampIdGranted": "stamp_park",
  "isNewStamp": true,
  "itineraryProgress": { "completedSlots": 1, "totalSlots": 4 },
  "isItineraryCompleted": false
}
```

`itineraryProgress` é `null` sem roteiro ativo. Replay com o mesmo `clientMutationId` devolve a mesma resposta (idempotente).

## Perfil e logout

Ambas exigem `Authorization: Bearer <token>`.

### `GET /user/:id/profile?limit=5`

Só o próprio usuário (`:id` deve ser o do token). `limit` é opcional (1–20, padrão 5) e controla `recentCheckIns`.

```json
{
  "username": "tiago",
  "checkInCount": 12,
  "itinerariesCount": 2,
  "stampsCount": 12,
  "recentCheckIns": [
    {
      "placeId": "ChIJ...",
      "placeName": "Bar do Zé",
      "datetime": "2026-10-05T18:30:00.000Z",
      "photoReference": "AUacSh...",
      "stamp": { "stampId": "bar", "imageUrl": "/assets/stamps/bar.png" },
      "impressionTag": "happy"
    }
  ]
}
```

`itinerariesCount` soma roteiro ativo + `inactiveItineraries` + `completedItineraries`. `photoReference` é o `photo_reference` da primeira foto do lugar no Google (ou `null`); `stamp` é `null` quando o lugar não tem selo ativo no `stamp_catalog`; `impressionTag` vem da collection `rating` (ou `null` sem reação).

### `GET /places/photo?ref=&maxwidth=800`

Proxy público para a Google Places Photo API. A chave fica só no servidor (`GOOGLE_PLACES_API_KEY` no `.env`). Resposta binária (`image/jpeg` ou o content-type devolvido pelo Google) com cache de 24 h. `ref` ausente ou maior que 2048 caracteres → `400`. Rate limit por IP. O app iOS carrega essa URL com `AsyncImage`, sem header `Authorization`.

O app iOS monta a URL como `{ZanzarAPIBaseURL}/places/photo?ref=...&maxwidth=800` — não carrega mais chave do Google no bundle.

### `POST /logout`

Responde `204`. Incrementa `users.tokenVersion`; o JWT carrega esse valor (`login`) e `validateAuthToken` o compara com o banco, então todos os tokens emitidos antes do logout passam a retornar `401`. Tokens antigos sem o campo contam como versão 0.

## Logging

Logs estruturados com [pino](https://getpino.io) (`src/utils/logger.ts`). Importe `logger` e use campos estruturados em vez de interpolar strings:

```ts
import { logger } from "../../utils/logger";

const log = logger.child({ module: "checkin", layer: "service" });

log.info({ userId, placeId }, "Checking in user at place");
log.error({ err, userId, placeId }, "Failed to create check-in");
```

### Controlar o nível de log

O nível é definido pela variável `LOG_LEVEL` no `.env` (padrão: `info`; maiúsculas/minúsculas tanto faz — `DEBUG` funciona). Um valor inválido não derruba o servidor: ele usa `info` e registra um aviso. Só aparecem logs do nível escolhido **e dos mais severos**:

| `LOG_LEVEL` | O que aparece | Quando usar |
|---|---|---|
| `debug` | tudo: chamadas ao banco (antes/depois de cada query), além dos níveis abaixo | investigar um bug |
| `info` *(padrão)* | uma linha por request, operações de negócio ("Fetching…", "Check-in registered…"), startup | uso normal / produção |
| `warn` | requests rejeitados (401, 403, 400, 409, 404), rate limit, falhas de login, desconexão do banco | só o que merece atenção |
| `error` | falhas inesperadas (5xx) e erros de banco | só problemas reais |
| `fatal` | o servidor não conseguiu subir (Mongo, porta em uso) / crash | — |
| `silent` | nada | testes |

```bash
LOG_LEVEL=debug npm run dev     # só para esta execução
```

Ou fixe no `.env`: `LOG_LEVEL="debug"`. O nível é lido na inicialização, então reinicie o servidor após mudar.

Shutdown: `SIGTERM`/`SIGINT` terminam os requests em andamento e fecham o servidor e a conexão com o Mongo. Se não terminar em 10 s, ou com um segundo `Ctrl+C`, o processo sai na hora.

Também:

- `NODE_ENV=production` imprime **JSON** (uma linha por log, ideal para agregadores); qualquer outro valor usa `pino-pretty`, legível no terminal.
- `NODE_ENV=test` silencia os logs automaticamente.

### O que é logado e onde

Cada camada tem uma função diferente:

| Camada | O que loga | Nível |
|---|---|---|
| Middleware de request (`requestLogger`) + `errorHandler` | uma linha por request (`método`, `path`, `status`, `durationMs`, `ip`) e a causa de toda falha | info / warn / error |
| Middlewares de auth, validação, ownership e rate limit | o motivo da rejeição (token ausente/inválido, campos que falharam no zod, 403, 429) | warn |
| Services | operações de negócio com ids, replays idempotentes, corridas de chave duplicada, login ok/falho | info / warn |
| Repositories | cada chamada ao banco (antes e depois) e erros com operação + ids, que são relançados | debug / error |
| Startup / shutdown (`index.ts`, `database.ts`) | conexão com o Mongo (host e nome do banco), porta (ou falha ao abrir a porta), SIGTERM/SIGINT, erros fatais | info / fatal |

Controllers não logam: o log de request e os logs dos services já cobrem.

### Rastreando um request

Todo request recebe um `reqId` (UUID), devolvido no header `X-Request-Id`. Esse `reqId` — e o `userId`, depois da autenticação — é adicionado automaticamente a **todas** as linhas de log daquele request (middleware → service → repository → `errorHandler`), via `AsyncLocalStorage` (`src/utils/requestContext.ts`). Para ver o caminho completo de um request que falhou, filtre pelo `reqId`:

```bash
# em produção (JSON)
npm start | grep '"reqId":"<id-do-header-x-request-id>"'
```

`/health` não gera log de request (probes encheriam o log); a chamada aparece só em `debug`. Requests abortados pelo cliente (ou cortados por timeout de proxy) geram uma linha `warn` com `aborted: true`.

Todo log traz `service`, `pid` e `hostname`, para distinguir instâncias quando houver mais de uma.

### Convenções

- Helpers em `src/utils/httpLog.ts` (`getRequestPath`, `summarizeIssues`) e `src/utils/mongoErrors.ts` (`isDuplicateKeyError`).
- Use `logger.child({ module, layer })` por arquivo e **campos estruturados** (`{ userId, placeId }`).
- Logue só ids e contagens — nunca body, token, senha ou documentos inteiros.
- Erros esperados (`AppError` lançado no service) **não** são logados onde são lançados: o `errorHandler` loga uma vez, com o contexto do request.
- Erros inesperados/de banco são logados no repository (com operação + ids) e relançados; o `errorHandler` loga o resultado final com o mesmo `reqId`.
- Coordenadas (`lat`/`lng`) de busca de lugares **não** são logadas (localização do usuário).
- Violação de índice único (race de check-in/rating/e-mail duplicado) é logada como `warn` no repository, não `error`: vira 409 para o cliente.
- Dados sensíveis são mascarados como `[REDACTED]` (`authorization`, `cookie`, `email`, `password`, `passwordHash`, `token`, `refreshToken`, em até um nível de aninhamento). A URI do MongoDB nunca é logada (contém credenciais no Atlas); só host e nome do banco.
- Falhas de login logam sempre o mesmo motivo (`invalid_credentials`), sem `userId` e sem e-mail: nem a resposta HTTP nem os logs permitem descobrir quais e-mails existem.
- Erros são serializados por `serializeError` (`src/utils/logger.ts`): erros de chave duplicada (E11000) e de validação/cast do Mongoose logam só o tipo e os **nomes** dos campos, nunca os valores enviados (o erro bruto do Mongo inclui `keyValue` com o e-mail).

## Deploy (Railway) — development e production

Dois ambientes no mesmo projeto Railway, cada um com **seu próprio cluster Atlas**. O Railway guarda as variáveis por ambiente (o repo só versiona os templates `*.example`; `.env`, `.env.production` etc. são ignorados pelo git).

| Ambiente Railway | Branch | Template de variáveis | Signup (`POST /register`) |
|---|---|---|---|
| `development` | `develop` | [`.env.development.example`](.env.development.example) | **bloqueado** (403) |
| `production` | `main` | [`.env.production.example`](.env.production.example) | liberado |

- Build/start vêm de [`railway.json`](railway.json): `npm ci --include=dev && npm run build`, depois `npm start` (`node dist/index.js`). Healthcheck em `GET /health`. `PORT` é injetado pelo Railway.
- O signup é bloqueado quando `NODE_ENV=development`. `SIGNUP_ENABLED=true|false` sobrescreve isso (útil para criar contas de teste no dev ou rodar `npm run dev` local com cadastro). Sem `NODE_ENV=development` o cadastro fica liberado.
- Use `JWT_SECRET` **diferente** em cada ambiente (um token do dev nunca vale em produção). Em `NODE_ENV=production` o servidor não sobe com `JWT_SECRET` de menos de 32 caracteres. Gere com `openssl rand -base64 48`.
- Atlas, por cluster: crie um usuário de banco, mantenha o database `Zanzardb` (os scripts mongosh usam esse nome fixo) e libere o acesso de rede do Railway em **Network Access** (os IPs de saída do Railway são dinâmicos, então na prática `0.0.0.0/0`, a menos que use IP estático).
- Inicializar cada cluster separadamente. Os scripts leem `ENV_FILE` (ou `~/.mcp-env`), **não** o `.env` do repo — confira qual cluster está apontado antes de rodar:

```bash
ENV_FILE=./.env.development npm run db:init && ENV_FILE=./.env.development npm run db:validate
ENV_FILE=./.env.production  npm run db:init && ENV_FILE=./.env.production  npm run db:validate
```

## Testes

```bash
npm test          # Vitest (HTTP/mocks) + testes legados (geofence, inferência, …)
npm run typecheck
```

CI: `.github/workflows/ci.yml` (push/PR em `main` e `develop`).