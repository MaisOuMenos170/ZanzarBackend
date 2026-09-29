# dev/

Utilitários de desenvolvimento local.

```bash
npm run tunnel   # Cloudflare Tunnel para o backend e atualiza a URL no app iOS (repo irmão Zanzar)
npm run atlas:ip # mostra seu IP público para liberar em Atlas → Network Access
```

`tunnel` requer `cloudflared`, `rg` (ripgrep) e o repositório `Zanzar` no mesmo diretório pai; use `PORT=4000 npm run tunnel` para outra porta.
