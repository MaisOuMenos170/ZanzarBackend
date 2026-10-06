/**
 * Resolve MongoDB URI, converting mongodb+srv when DNS SRV fails (EBADRESP).
 * Mirrors scripts/lib/resolve-mongo-uri.py for Node (dev server, validators).
 */

const CLUSTER_ZANZAR_STANDARD =
    "mongodb://{auth}" +
    "ac-yatndwg-shard-00-00.9lbgwfu.mongodb.net:27017," +
    "ac-yatndwg-shard-00-01.9lbgwfu.mongodb.net:27017," +
    "ac-yatndwg-shard-00-02.9lbgwfu.mongodb.net:27017/" +
    "{database}?ssl=true&replicaSet=atlas-1hpih3-shard-0&authSource=admin";

function parseSrv(uri: string): { user: string; password: string; host: string; database: string } {
    const prefix = "mongodb+srv://";
    if (!uri.startsWith(prefix)) {
        throw new Error("Expected mongodb+srv URI");
    }

    const rest = uri.slice(prefix.length);
    const atIndex = rest.indexOf("@");
    if (atIndex === -1) {
        throw new Error("Invalid mongodb+srv URI: missing credentials");
    }

    const userinfo = rest.slice(0, atIndex);
    const hostpart = rest.slice(atIndex + 1);
    const colonIndex = userinfo.indexOf(":");
    if (colonIndex === -1) {
        throw new Error("Invalid mongodb+srv URI: missing password");
    }

    const user = decodeURIComponent(userinfo.slice(0, colonIndex));
    const password = decodeURIComponent(userinfo.slice(colonIndex + 1));

    const hostAndMore = hostpart.split("?")[0] ?? hostpart;
    const slashIndex = hostAndMore.indexOf("/");
    if (slashIndex === -1) {
        return { user, password, host: hostAndMore, database: "Zanzardb" };
    }

    return {
        user,
        password,
        host: hostAndMore.slice(0, slashIndex),
        database: hostAndMore.slice(slashIndex + 1) || "Zanzardb",
    };
}

function injectAuth(standardUri: string, user: string, password: string): string {
    if (!standardUri.startsWith("mongodb://")) {
        throw new Error("MONGODB_URI_STANDARD must start with mongodb://");
    }

    const body = standardUri.slice("mongodb://".length);
    if (body.includes("@")) {
        return standardUri;
    }

    const userQ = encodeURIComponent(user);
    const passQ = encodeURIComponent(password);
    return `mongodb://${userQ}:${passQ}@${body}`;
}

function ensureAuthSource(uri: string): string {
    if (uri.includes("authSource=")) {
        return uri;
    }
    const joiner = uri.includes("?") ? "&" : "?";
    return `${uri}${joiner}authSource=admin`;
}

export function resolveMongoUri(uri: string): string {
    const trimmed = uri.trim();
    if (!trimmed) {
        throw new Error("Empty MongoDB URI");
    }

    if (trimmed.startsWith("mongodb://")) {
        return ensureAuthSource(trimmed);
    }

    if (!trimmed.startsWith("mongodb+srv://")) {
        throw new Error("URI must start with mongodb:// or mongodb+srv://");
    }

    const { user, password, host, database } = parseSrv(trimmed);
    const standardOverride = process.env.MONGODB_URI_STANDARD?.trim();

    if (standardOverride) {
        return ensureAuthSource(injectAuth(standardOverride, user, password));
    }

    if (host === "clusterzanzar.9lbgwfu.mongodb.net") {
        const auth = `${encodeURIComponent(user)}:${encodeURIComponent(password)}@`;
        return CLUSTER_ZANZAR_STANDARD.replace("{auth}", auth).replace("{database}", database);
    }

    return trimmed;
}
