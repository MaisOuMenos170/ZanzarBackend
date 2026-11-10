import { MAX_SEARCH_RESULTS, SERVICE_AREA, type OsmType } from "../../../constants/place-suggestions";
import { logger } from "../../../utils/logger";
import { zanzarCategoryFromOsm } from "./osm-category";

const log = logger.child({ module: "place-suggestions", layer: "osm" });

/** A place as OpenStreetMap describes it, already reduced to what Zanzar needs. */
export interface OsmPlace {
    type: OsmType;
    id: number;
    name: string;
    address: string;
    latitude: number;
    longitude: number;
    /** Raw OSM `category` and `type` (e.g. "amenity" / "cafe"). */
    osmCategory: string;
    osmPlaceType: string;
    /** Zanzar category, or null when we do not accept this kind of place. */
    category: string | null;
}

export interface NearPoint {
    lat: number;
    lng: number;
}

export interface OsmClient {
    search(query: string, near?: NearPoint): Promise<OsmPlace[]>;
    /** Null when OpenStreetMap has no such object. Throws when OpenStreetMap could not be reached. */
    lookup(type: OsmType, id: number): Promise<OsmPlace | null>;
}

export function isInsideServiceArea(latitude: number, longitude: number): boolean {
    return (
        latitude <= SERVICE_AREA.latMax &&
        latitude >= SERVICE_AREA.latMin &&
        longitude >= SERVICE_AREA.lonMin &&
        longitude <= SERVICE_AREA.lonMax
    );
}

interface NominatimResult {
    osm_type?: string;
    osm_id?: number;
    lat?: string;
    lon?: string;
    category?: string;
    type?: string;
    name?: string;
    display_name?: string;
}

const OSM_TYPES_BY_NAME: Record<string, OsmType> = { node: "node", way: "way", relation: "relation" };
const LOOKUP_PREFIX: Record<OsmType, string> = { node: "N", way: "W", relation: "R" };
const MAX_ADDRESS_LENGTH = 300;

export function placeFromNominatim(raw: NominatimResult): OsmPlace | null {
    const type = raw.osm_type ? OSM_TYPES_BY_NAME[raw.osm_type] : undefined;
    const latitude = Number(raw.lat);
    const longitude = Number(raw.lon);
    if (!type || typeof raw.osm_id !== "number" || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

    const displayName = raw.display_name?.trim() ?? "";
    const name = raw.name?.trim() || displayName.split(",")[0]?.trim() || "";
    if (!name) return null;

    const osmCategory = raw.category ?? "";
    const osmPlaceType = raw.type ?? "";
    return {
        type,
        id: raw.osm_id,
        name,
        address: (displayName || name).slice(0, MAX_ADDRESS_LENGTH),
        latitude,
        longitude,
        osmCategory,
        osmPlaceType,
        category: zanzarCategoryFromOsm(osmCategory, osmPlaceType),
    };
}

export interface NominatimOptions {
    baseUrl: string;
    userAgent: string;
    fetchFn?: typeof fetch;
    /** The public Nominatim allows one request per second at most. */
    minIntervalMs?: number;
    cacheTtlMs?: number;
    timeoutMs?: number;
    sleep?: (ms: number) => Promise<void>;
    now?: () => number;
}

const MAX_CACHE_ENTRIES = 500;

/**
 * Talks to Nominatim following the public usage policy (docs: operations.osmfoundation.org/policies/nominatim):
 * identifying User-Agent, one request per second, results cached, and search only on explicit submit (no autocomplete).
 */
export class NominatimClient implements OsmClient {
    private readonly fetchFn: typeof fetch;
    private readonly minIntervalMs: number;
    private readonly cacheTtlMs: number;
    private readonly timeoutMs: number;
    private readonly sleep: (ms: number) => Promise<void>;
    private readonly now: () => number;
    private readonly cache = new Map<string, { expiresAt: number; value: unknown }>();
    private chain: Promise<unknown> = Promise.resolve();
    private lastRequestAt = 0;

    constructor(private readonly options: NominatimOptions) {
        this.fetchFn = options.fetchFn ?? fetch;
        this.minIntervalMs = options.minIntervalMs ?? 1000;
        this.cacheTtlMs = options.cacheTtlMs ?? 10 * 60 * 1000;
        this.timeoutMs = options.timeoutMs ?? 8000;
        this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
        this.now = options.now ?? Date.now;
    }

    async search(query: string, near?: NearPoint): Promise<OsmPlace[]> {
        const params = new URLSearchParams({
            q: query,
            format: "jsonv2",
            limit: String(MAX_SEARCH_RESULTS * 2),
            countrycodes: "br",
            "accept-language": "pt-BR",
        });
        if (near && isInsideServiceArea(near.lat, near.lng)) {
            // Around the user, only as a bias: results outside the area are dropped below anyway.
            const d = 0.1;
            params.set("viewbox", `${near.lng - d},${near.lat + d},${near.lng + d},${near.lat - d}`);
        } else {
            params.set("viewbox", `${SERVICE_AREA.lonMin},${SERVICE_AREA.latMax},${SERVICE_AREA.lonMax},${SERVICE_AREA.latMin}`);
            params.set("bounded", "1");
        }

        const results = await this.get<NominatimResult[]>(`/search?${params.toString()}`);
        const inArea = results
            .map(placeFromNominatim)
            .filter((place): place is OsmPlace => place !== null && isInsideServiceArea(place.latitude, place.longitude));
        // Neighbourhoods, bus stops and the like come back too; the kinds we take go first so the cut keeps them.
        const accepted = inArea.filter((place) => place.category !== null);
        const others = inArea.filter((place) => place.category === null);
        return [...accepted, ...others].slice(0, MAX_SEARCH_RESULTS);
    }

    async lookup(type: OsmType, id: number): Promise<OsmPlace | null> {
        const params = new URLSearchParams({
            osm_ids: `${LOOKUP_PREFIX[type]}${id}`,
            format: "jsonv2",
            "accept-language": "pt-BR",
        });
        const results = await this.get<NominatimResult[]>(`/lookup?${params.toString()}`);
        const first = results[0];
        return first ? placeFromNominatim(first) : null;
    }

    private async get<T>(pathAndQuery: string): Promise<T> {
        const cached = this.cache.get(pathAndQuery);
        if (cached && cached.expiresAt > this.now()) return cached.value as T;

        const value = await this.enqueue(async () => {
            const response = await this.fetchFn(`${this.options.baseUrl}${pathAndQuery}`, {
                headers: { "User-Agent": this.options.userAgent, Accept: "application/json" },
                signal: AbortSignal.timeout(this.timeoutMs),
            });
            if (!response.ok) throw new Error(`Nominatim answered ${response.status}`);
            return (await response.json()) as T;
        });

        if (this.cache.size >= MAX_CACHE_ENTRIES) this.cache.delete(this.cache.keys().next().value as string);
        this.cache.set(pathAndQuery, { expiresAt: this.now() + this.cacheTtlMs, value });
        return value;
    }

    /** Runs requests one at a time, at least `minIntervalMs` apart. A failed request does not block the next. */
    private enqueue<T>(task: () => Promise<T>): Promise<T> {
        const run = async () => {
            const wait = this.lastRequestAt + this.minIntervalMs - this.now();
            if (wait > 0) await this.sleep(wait);
            this.lastRequestAt = this.now();
            return task();
        };
        const result = this.chain.then(run, run);
        this.chain = result.catch((err) => log.warn({ err }, "Nominatim request failed"));
        return result;
    }
}

let client: OsmClient | null = null;

export function getOsmClient(): OsmClient {
    client ??= new NominatimClient({
        baseUrl: process.env.OSM_NOMINATIM_URL ?? "https://nominatim.openstreetmap.org",
        // Nominatim's policy requires an identifying User-Agent; set OSM_USER_AGENT with a real contact in production.
        userAgent: process.env.OSM_USER_AGENT ?? "ZanzarBackend/1.0",
    });
    return client;
}

/** Tests replace the client with a fake. */
export function setOsmClient(replacement: OsmClient | null) {
    client = replacement;
}
