# triggers/

Funções de **Atlas Database Triggers** (legado). A lógica equivalente roda na **API REST** via `src/events/triggers/` — importada pelos services.

## on-checkin-created.js — ⚠️ descontinuado (E2)

**Não publique / desative** este trigger no Atlas após o deploy do check-in síncrono.

Antes: INSERT em `checkins` disparava contadores, selo e progresso de roteiro de forma assíncrona.

Agora: `POST /checkIn` (`src/modules/checkin/checkin.service.ts`) faz tudo na mesma transação e responde com `stampIdGranted` + `itineraryProgress`. Se o trigger Atlas continuar ativo, os efeitos serão aplicados **duas vezes**.

O arquivo permanece no repo como referência e para testes locais (`module.exports`).

### Checklist de deploy (uma vez)

1. Deploy da API com E2 mergeado
2. Atlas → App Services → Triggers → desativar ou remover o trigger de `checkins` INSERT
3. Confirmar: um check-in incrementa `checkInCount` exatamente 1
