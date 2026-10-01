# ZanzarBackend

Base do backend — **só estrutura de pastas e config mínima**. Sem código implementado ainda.

Stack planejada: Express · Mongoose · MongoDB · JWT · TypeScript.

## Estrutura

```text
ZanzarBackend/
├── data/
│   └── lugares.json       # dados de lugares (Google Places + campos futuros)
├── scripts/               # seed, setup, migrations, triggers, dev (ver scripts/README.md)
├── src/
│   ├── config/            # env, conexão MongoDB
│   ├── models/            # schemas Mongoose (8 collections)
│   ├── routes/            # endpoints REST
│   ├── services/          # regras de negócio
│   ├── middleware/        # auth JWT, validação
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
| `checkins` | CheckIns | Visita (`userId`, `placeId`, `datetime`); selo e contadores via Atlas trigger |
| `rating` | Rating / Reações | Reação pós-visita (`impressionTag`) |
| `sync_mutations` | — | Idempotência do sync offline |

### Trigger de check-in (Atlas)

O `POST /checkIn` só insere o documento em `checkins`. Contadores (`users.checkInCount`, `places.zanzar.checkInCount`), selo em `users.stamps` e progresso do roteiro são aplicados por um Database Trigger em [`scripts/triggers/on-checkin-created.js`](scripts/triggers/README.md).

Deploy manual: Atlas → App Services → Triggers → Database → collection `checkins`, operation **Insert**, **Full Document** ligado, colar a função. Sem o trigger publicado, check-ins não atualizam contadores nem selos.

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

Shutdown: `SIGTERM`/`SIGINT` terminam os requests em andamento e fecham o servidor e a conexão com o Mongo. Um segundo `Ctrl+C` encerra o processo na hora.

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
- Dados sensíveis são mascarados como `[REDACTED]` (`authorization`, `password`, `passwordHash`, `token`). A URI do MongoDB nunca é logada (contém credenciais no Atlas); só host e nome do banco.
- Falhas de login logam o motivo real (`user_not_found` / `bad_password`), mas o cliente recebe sempre "Invalid credentials". E-mail não é logado.

## Próximos passos (quando for implementar)

1. `npm init` / instalar dependências (express, mongoose, jsonwebtoken, zod…)
2. Copiar `.env.example` → `.env`
3. Escrever models em `src/models/`
4. Seed a partir de `data/lugares.json`