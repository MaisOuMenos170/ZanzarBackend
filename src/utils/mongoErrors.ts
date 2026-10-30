/** True for MongoDB duplicate key errors (unique index violations). */
export function isDuplicateKeyError(error: unknown): boolean {
    return (
        typeof error === "object"
        && error !== null
        && "code" in error
        && (error.code === 11000 || error.code === 11001)
    );
}
