# scripts/

Único diretório de scripts do backend. Cada subpasta agrupa um tema e tem seu próprio README com a execução.

| Pasta | Tema | Comandos npm |
|---|---|---|
| [`setup/`](setup/README.md) | Criação de collections e índices | `setup:collections`, `db:init` |
| [`seed/`](seed/README.md) | Seed e sync de `stamp_catalog` e `places` | `seed`, `sync:lugares`, `db:init` |
| [`validators/`](validators/README.md) | `$jsonSchema` gerado dos models Mongoose | `db:validate`, `db:validate:dry` |
| [`migrations/`](migrations/README.md) | Migrações pontuais de dados | `db:migrate:geo` |
| [`triggers/`](triggers/README.md) | Atlas Database Triggers (legado E2) | desativar trigger no Atlas UI após E2 — ver README |
| [`dev/`](dev/README.md) | Utilitários de desenvolvimento local | `tunnel`, `atlas:ip` |
| `lib/` | Código compartilhado (`mongosh-run.sh`, `resolve-mongo-uri.py`) | — |

Os scripts `.sh` devem ser executados da raiz do projeto (via `npm run`) e usam `MONGODB_URI` (ou `MDB_MCP_CONNECTION_STRING`, ou o arquivo apontado por `ENV_FILE`, padrão `~/.mcp-env`). Requer `mongosh` e `python3`.
