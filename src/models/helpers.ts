/**
 * Validator de array com no máximo `max` itens. `maxItems` é lido por
 * src/db/mongoose-to-jsonschema.ts para gerar o `maxItems` do $jsonSchema do Atlas.
 */
export const maxArrayItems = (max: number) => ({
    validator: (items: unknown[]) => items.length <= max,
    message: `deve ter no máximo ${max} itens`,
    maxItems: max,
});

/**
 * Validator de array com no mínimo 1 item. `minItems` é lido por
 * src/db/mongoose-to-jsonschema.ts para gerar o `minItems` do $jsonSchema do Atlas.
 */
export const nonEmptyArray = {
    validator: (items: unknown[]) => items.length >= 1,
    message: "deve ter pelo menos 1 item",
    minItems: 1,
};
