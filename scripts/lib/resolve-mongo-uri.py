#!/usr/bin/env python3
"""Resolve MongoDB URI, converting mongodb+srv when DNS SRV fails (EBADRESP)."""

from __future__ import annotations

import os
import sys
import urllib.parse

# ClusterZanzar (Atlas sa-east-1) — evita querySrv quando o DNS local falha.
CLUSTER_ZANZAR_STANDARD = (
    "mongodb://{auth}"
    "ac-yatndwg-shard-00-00.9lbgwfu.mongodb.net:27017,"
    "ac-yatndwg-shard-00-01.9lbgwfu.mongodb.net:27017,"
    "ac-yatndwg-shard-00-02.9lbgwfu.mongodb.net:27017/"
    "{database}?ssl=true&replicaSet=atlas-1hpih3-shard-0&authSource=admin"
)


def parse_srv(uri: str) -> tuple[str, str, str, str]:
    prefix = "mongodb+srv://"
    if not uri.startswith(prefix):
        raise ValueError("Expected mongodb+srv URI")

    rest = uri[len(prefix) :]
    userinfo, hostpart = rest.split("@", 1)
    user, password = userinfo.split(":", 1)
    host_and_more = hostpart.split("?", 1)[0]
    if "/" in host_and_more:
        host, database = host_and_more.split("/", 1)
    else:
        host, database = host_and_more, "Zanzardb"
    return user, password, host, database


def inject_auth(standard_uri: str, user: str, password: str) -> str:
    if not standard_uri.startswith("mongodb://"):
        raise ValueError("MONGODB_URI_STANDARD must start with mongodb://")

    body = standard_uri[len("mongodb://") :]
    if "@" in body.split("/", 1)[0]:
        return standard_uri

    user_q = urllib.parse.quote(user, safe="")
    pass_q = urllib.parse.quote(password, safe="")
    return f"mongodb://{user_q}:{pass_q}@{body}"


def ensure_auth_source(uri: str) -> str:
    if "authSource=" in uri:
        return uri
    joiner = "&" if "?" in uri else "?"
    return f"{uri}{joiner}authSource=admin"


def resolve(uri: str) -> str:
    uri = uri.strip()
    if not uri:
        raise ValueError("Empty MongoDB URI")

    if uri.startswith("mongodb://"):
        return ensure_auth_source(uri)

    if not uri.startswith("mongodb+srv://"):
        raise ValueError("URI must start with mongodb:// or mongodb+srv://")

    user, password, host, database = parse_srv(uri)
    standard_override = os.environ.get("MONGODB_URI_STANDARD", "").strip()

    if standard_override:
        resolved = inject_auth(standard_override, user, password)
        return ensure_auth_source(resolved)

    if host == "clusterzanzar.9lbgwfu.mongodb.net":
        user_q = urllib.parse.quote(user, safe="")
        pass_q = urllib.parse.quote(password, safe="")
        auth = f"{user_q}:{pass_q}@"
        return CLUSTER_ZANZAR_STANDARD.format(auth=auth, database=database)

    return uri


def main() -> int:
    uri = sys.argv[1] if len(sys.argv) > 1 else os.environ.get("MONGODB_URI", "")
    if not uri:
        uri = os.environ.get("MDB_MCP_CONNECTION_STRING", "")

    try:
        print(resolve(uri))
        return 0
    except ValueError as error:
        print(f"resolve-mongo-uri: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
