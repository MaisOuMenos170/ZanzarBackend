#!/usr/bin/env bash
set -euo pipefail

IP="$(curl -s --max-time 5 https://api.ipify.org 2>/dev/null || echo "desconhecido")"
echo "IP público atual: $IP"
echo "Atlas → ZanzarBackend → Network Access → Add IP Address"
echo "Dev rápido (menos seguro): Allow Access from Anywhere 0.0.0.0/0"
