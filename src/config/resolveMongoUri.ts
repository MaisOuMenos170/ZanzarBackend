/**
 * Converts mongodb+srv URIs to a standard replica-set URI when Node's DNS
 * cannot resolve SRV records (common macOS error: querySrv EBADRESP).
 */
export function resolveMongoUri(rawUri: string): string {
    const uri = rawUri.trim();
    if (!uri.startsWith("mongodb+srv://")) {
        return ensureAuthSource(uri);
    }

    const standardOverride = process.env.MONGODB_URI_STANDARD?.trim();
    if (standardOverride) {
        return ensureAuthSource(injectAuth(standardOverride, uri));
    }

    const parsed = parseSrvUri(uri);
    if (parsed.host === "clusterzanzar.9lbgwfu.mongodb.net") {
        const auth = `${encodeURIComponent(parsed.user)}:${encodeURIComponent(parsed.password)}@`;
        return ensureAuthSource(
            `mongodb://${auth}` +
                "ac-yatndwg-shard-00-00.9lbgwfu.mongodb.net:27017," +
                "ac-yatndwg-shard-00-01.9lbgwfu.mongodb.net:27017," +
                "ac-yatndwg-shard-00-02.9lbgwfu.mongodb.net:27017/" +
                `${parsed.database}?ssl=true&replicaSet=atlas-1hpih3-shard-0&authSource=admin`,
        );
    }

    return uri;
}

function parseSrvUri(uri: string): { user: string; password: string; host: string; database: string } {
    const rest = uri.slice("mongodb+srv://".length);
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

    const hostAndMore = hostpart.split("?")[0];
    const slashIndex = hostAndMore.indexOf("/");
    const host = slashIndex === -1 ? hostAndMore : hostAndMore.slice(0, slashIndex);
    const database = slashIndex === -1 ? "Zanzardb" : hostAndMore.slice(slashIndex + 1);

    return {
        user: decodeURIComponent(userinfo.slice(0, colonIndex)),
        password: decodeURIComponent(userinfo.slice(colonIndex + 1)),
        host,
        database,
    };
}

function injectAuth(standardUri: string, srvUri: string): string {
    if (!standardUri.startsWith("mongodb://")) {
        throw new Error("MONGODB_URI_STANDARD must start with mongodb://");
    }

    const body = standardUri.slice("mongodb://".length);
    if (body.split("/")[0].includes("@")) {
        return standardUri;
    }

    const { user, password } = parseSrvUri(srvUri);
    return `mongodb://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${body}`;
}

function ensureAuthSource(uri: string): string {
    if (uri.includes("authSource=")) {
        return uri;
    }
    return uri.includes("?") ? `${uri}&authSource=admin` : `${uri}?authSource=admin`;
}

export function redactMongoUri(uri: string): string {
    return uri.replace(/\/\/([^:@/]+):([^@/]+)@/, "//$1:***@");
}
