const DEFAULT_CHECKIN_RADIUS_METERS = 150;

export function getCheckinRadiusMeters(): number {
    const raw = process.env.CHECKIN_RADIUS_METERS?.trim();
    if (!raw) {
        return DEFAULT_CHECKIN_RADIUS_METERS;
    }

    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return DEFAULT_CHECKIN_RADIUS_METERS;
    }

    return parsed;
}
