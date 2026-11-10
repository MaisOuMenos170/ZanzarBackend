import type { ZanzarCategory } from "../../../constants/zanzar-categories";

/**
 * Maps an OpenStreetMap `category`/`type` pair (as Nominatim reports them) to a Zanzar category.
 * `null` means we do not take this kind of place: bus stops, offices, shops that are not food, and so on.
 */
const RULES: Record<string, Record<string, ZanzarCategory>> = {
    amenity: {
        restaurant: "restaurant",
        fast_food: "restaurant",
        food_court: "restaurant",
        bar: "bar",
        pub: "bar",
        biergarten: "bar",
        cafe: "cafe",
        ice_cream: "cafe",
        nightclub: "party",
        theatre: "curiosity",
        cinema: "curiosity",
        arts_centre: "curiosity",
        planetarium: "curiosity",
        place_of_worship: "historic",
        marketplace: "tourist",
    },
    tourism: {
        museum: "museum",
        gallery: "museum",
        attraction: "tourist",
        viewpoint: "tourist",
        artwork: "tourist",
        zoo: "curiosity",
        aquarium: "curiosity",
        theme_park: "curiosity",
    },
    leisure: {
        park: "park",
        garden: "park",
        nature_reserve: "park",
    },
    shop: {
        bakery: "cafe",
        pastry: "cafe",
        coffee: "cafe",
    },
};

/** Anything tagged `historic=*` is accepted as a historic place. */
const ALWAYS_HISTORIC_CATEGORY = "historic";

export function zanzarCategoryFromOsm(osmCategory: string | undefined, osmType: string | undefined): ZanzarCategory | null {
    if (!osmCategory) return null;
    if (osmCategory === ALWAYS_HISTORIC_CATEGORY) return "historic";
    if (!osmType) return null;
    return RULES[osmCategory]?.[osmType] ?? null;
}
