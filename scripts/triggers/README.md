# triggers/

Funções de Atlas Database Triggers. Não rodam localmente: são publicadas no Atlas.

## on-checkin-created.js

INSERT em `Zanzardb.checkins` → incrementa `users.checkInCount` e `places.zanzar.checkInCount`, adiciona o selo em `users.stamps` e avança o `activeItinerary`.

Deploy: Atlas → App Services → Triggers → Database → collection `checkins`, operation **Insert**, **Full Document** ligado, colar a função. `DATA_SOURCE` no topo do arquivo deve ser o nome do cluster (`ClusterZanzar`). Sem o trigger publicado, check-ins não atualizam contadores nem selos.
