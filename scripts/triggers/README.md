# triggers/

Funções de **Atlas Database Triggers** (legado). A lógica equivalente roda na **API REST** via `src/events/triggers/` — importada pelos services (`checkin.service.ts`).

## on-checkin-created.js — ⚠️ descontinuado (E2)

**Não mantenha este trigger ativo no Atlas** depois que o E2 (check-in síncrono) estiver em produção.

| Antes (Atlas trigger) | Agora (API) |
|---|---|
| `POST /checkIn` só insere em `checkins` | `POST /checkIn` aplica tudo na mesma transação |
| Efeitos assíncronos (contadores, selo, roteiro) | Resposta `201` com `stampIdGranted` + `itineraryProgress` |
| App não sabia o selo na hora | App exibe alert imediatamente |

Se o trigger Atlas **e** a API rodarem juntos, contadores e selos são aplicados **em dobro**.

O arquivo `.js` permanece no repo como referência e para testes locais (`module.exports`).

---

## Desativar o trigger no Atlas (manual, uma vez)

> **Nota:** o MCP do MongoDB no Cursor **não** gerencia App Services / Database Triggers (só cluster, queries e streams). Este passo é feito no [Atlas UI](https://cloud.mongodb.com).

### Pré-requisito

- E2 mergeado e API deployada (ou `npm run dev` apontando pro mesmo cluster em dev).

### Passo a passo

1. Acesse [cloud.mongodb.com](https://cloud.mongodb.com) e entre no projeto do Zanzar.
2. No menu lateral, abra **App Services** (às vezes aparece como **Atlas App Services**).
3. Selecione o **App** vinculado ao cluster **ClusterZanzar** (data source `ClusterZanzar` / database `Zanzardb`).
4. Vá em **Triggers** (ou **Database Triggers**).
5. Localize o trigger configurado para:
   - **Collection:** `checkins` (database `Zanzardb`)
   - **Operation type:** `Insert`
   - Função equivalente a `on-checkin-created.js`
6. **Disable** (pausar) ou **Delete** (remover). Preferência: **Disable** em dev se quiser reativar para comparar; **Delete** em produção quando tiver certeza.
7. Salve / confirme.

### Se não aparecer nenhum trigger

Provavelmente o trigger **nunca foi publicado** no Atlas — nesse caso não há nada a desativar. Siga direto para a verificação abaixo.

### Se não aparecer App Services

Alguns projetos Atlas usam só o cluster, sem App. Triggers de banco exigem um App Services app. Sem app = sem trigger ativo.

---

## Verificar que está correto

Depois de desativar (ou confirmar que não existia trigger):

1. Anote `users.checkInCount` e quantidade de itens em `users.stamps` **antes** de um check-in de teste.
2. Faça `POST /checkIn` autenticado (mesmo usuário, lugar novo).
3. Confira no MongoDB (Atlas UI, mongosh ou MCP `find`):

| Campo | Esperado |
|---|---|
| `users.checkInCount` | +1 (não +2) |
| `users.stamps` | +1 entrada (não duplicada) |
| `places.zanzar.checkInCount` | +1 no lugar |
| Resposta HTTP `201` | `stampIdGranted`, `isNewStamp`, `itineraryProgress` |

**Sintoma de trigger ainda ativo:** `checkInCount` ou `stamps` pulam de 2 em 2 por check-in.

### Exemplo mongosh (opcional)

```javascript
const dbx = db.getSiblingDB('Zanzardb');
const userId = ObjectId('…'); // id do usuário de teste
const before = dbx.users.findOne({ _id: userId }, { checkInCount: 1, stamps: 1 });
// … POST /checkIn …
const after = dbx.users.findOne({ _id: userId }, { checkInCount: 1, stamps: 1 });
printjson({ before, after, deltaCount: after.checkInCount - before.checkInCount, deltaStamps: after.stamps.length - before.stamps.length });
// deltaCount e deltaStamps devem ser 1
```

---

## Checklist de deploy (copiar no PR / release)

- [ ] E2 mergeado (`POST /checkIn` síncrono)
- [ ] `npm run db:validate` rodado se o model de `checkins` mudou
- [ ] API deployada / dev apontando pro cluster certo
- [ ] Trigger `checkins` INSERT **desativado ou removido** no Atlas App Services
- [ ] Check-in de teste: contadores +1, resposta `201` com selo
- [ ] (Opcional) Roteiro ativo: progresso avança 1 slot por check-in elegível

---

## Referência técnica do trigger legado

Deploy original (não repetir após E2):

- Atlas → App Services → Triggers → Database
- Collection `checkins`, operation **Insert**, **Full Document** ON
- Colar `on-checkin-created.js`
- `DATA_SOURCE` no topo do arquivo = nome do cluster (`ClusterZanzar`)

Lógica atual da API: `src/modules/checkin/checkin.service.ts` + `src/events/triggers/itinerary-progress.ts`.
