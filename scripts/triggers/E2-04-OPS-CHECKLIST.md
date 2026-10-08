# E2-04 — Checklist ops (Atlas trigger)

**Status:** pendente confirmação manual no Atlas UI (não automatizável via MCP/CI).

## Antes

- [ ] API E2 deployada ou `npm run dev` apontando para o cluster compartilhado
- [ ] Leu [`README.md`](README.md) → seção “Desativar o trigger no Atlas”

## Desativar

- [ ] Atlas → App Services → Triggers → trigger `checkins` **Insert** → **Disable** ou **Delete**
- [ ] Se não existir App Services / trigger: marcar “N/A — nunca publicado”

## Validar (sem duplicar contadores)

1. Anote `users.checkInCount` e `users.stamps.length` **antes** de um check-in de teste (lugar novo).
2. `POST /checkIn` autenticado.
3. Confirme **+1** em `checkInCount`, **+1** stamp, resposta `201` com `stampIdGranted`.

| Sintoma | Causa provável |
|---------|----------------|
| +2 em contadores | Trigger Atlas ainda ativo |
| +1 | OK |

Comandos e exemplo mongosh: [`README.md`](README.md#verificar-que-está-correto).

## Registrar conclusão

Atualize a task **E2-04** em `Zanzar/MVP-TASKS.md` com data e “trigger desativado” ou “N/A”.
