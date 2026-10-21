import type { Schema } from "mongoose";

/**
 * Converte um Schema do Mongoose em `$jsonSchema` para o validador do MongoDB/Atlas.
 * O model é a fonte única: o que o Mongoose declara é o que vai para o banco.
 *
 * Limitações:
 * - `Mixed` é tratado como `object` (todos os usos do projeto são objetos).
 * - Só opções declarativas são traduzidas (type, required, enum, match, min/max,
 *   minlength/maxlength e `minItems` via src/models/helpers.ts). Validators com
 *   função arbitrária não têm equivalente no $jsonSchema.
 * - `default`, `lowercase`, `trim` e índices não são aplicados pelo banco.
 * - O validador só protege escritas que não passam pelo Mongoose (seed, scripts, Atlas UI).
 */

export type JsonSchema = Record<string, unknown>;

interface SchemaTypeLike {
    instance: string;
    isRequired?: boolean;
    enumValues?: unknown[];
    options: Record<string, unknown>;
    validators: Array<{ minItems?: number }>;
    schema?: Schema;
    embeddedSchemaType?: SchemaTypeLike;
}

interface ObjectNode {
    properties: Record<string, JsonSchema | ObjectNode>;
    required: Set<string>;
}

const NUMBER_BSON = ["int", "long", "double"];
const IGNORED_PATHS = new Set(["__v"]);

const isNode = (value: JsonSchema | ObjectNode): value is ObjectNode => "required" in value && value.required instanceof Set;

/** Opções do Mongoose aceitam `valor` ou `[valor, mensagem]`. */
function optionValue(value: unknown): unknown {
    return Array.isArray(value) ? value[0] : value;
}

function scalarSchema(path: SchemaTypeLike): JsonSchema {
    const { options } = path;
    switch (path.instance) {
        case "String": {
            const result: JsonSchema = { bsonType: "string" };
            const minLength = optionValue(options.minlength);
            const maxLength = optionValue(options.maxlength);
            const match = optionValue(options.match);
            if (typeof minLength === "number") result.minLength = minLength;
            if (typeof maxLength === "number") result.maxLength = maxLength;
            if (match instanceof RegExp) result.pattern = match.source;
            if (path.enumValues?.length) result.enum = [...path.enumValues];
            return result;
        }
        case "Number": {
            const result: JsonSchema = { bsonType: NUMBER_BSON };
            const min = optionValue(options.min);
            const max = optionValue(options.max);
            if (typeof min === "number") result.minimum = min;
            if (typeof max === "number") result.maximum = max;
            return result;
        }
        case "Date":
            return { bsonType: "date" };
        case "ObjectId":
            return { bsonType: "objectId" };
        case "Boolean":
            return { bsonType: "bool" };
        case "Mixed":
            return { bsonType: "object" };
        default:
            throw new Error(`Tipo Mongoose sem mapeamento para $jsonSchema: ${path.instance}`);
    }
}

function pathSchema(path: SchemaTypeLike): JsonSchema {
    let result: JsonSchema;

    if (path.instance === "Array") {
        result = { bsonType: "array" };
        if (path.schema) {
            result.items = schemaToJsonSchema(path.schema);
        } else if (path.embeddedSchemaType) {
            result.items = pathSchema(path.embeddedSchemaType);
        }
        const minItems = path.validators.find((v) => typeof v.minItems === "number")?.minItems;
        if (minItems !== undefined) result.minItems = minItems;
    } else if (path.instance === "Embedded" && path.schema) {
        result = schemaToJsonSchema(path.schema);
    } else {
        result = scalarSchema(path);
    }

    // `default: null` significa que o campo aceita null (ex.: activeItinerary).
    return path.options.default === null ? { anyOf: [result, { bsonType: "null" }] } : result;
}

/** Nomes dos campos de timestamp gerados pelo Mongoose, respeitando `timestamps: {...}`. */
function timestampFields(schema: Schema): string[] {
    const option = schema.options.timestamps;
    if (!option) return [];
    if (option === true) return ["createdAt", "updatedAt"];

    const resolve = (value: unknown, fallback: string): string | null => {
        if (value === undefined || value === true) return fallback;
        return typeof value === "string" ? value : null;
    };
    return [resolve(option.createdAt, "createdAt"), resolve(option.updatedAt, "updatedAt")].filter(
        (name): name is string => name !== null,
    );
}

function finalize(node: ObjectNode): JsonSchema {
    const properties: Record<string, JsonSchema> = {};
    for (const [key, value] of Object.entries(node.properties)) {
        properties[key] = isNode(value) ? finalize(value) : value;
    }
    const result: JsonSchema = { bsonType: "object", properties };
    // O MongoDB rejeita `required: []`.
    if (node.required.size > 0) result.required = [...node.required];
    return result;
}

export function schemaToJsonSchema(schema: Schema): JsonSchema {
    const root: ObjectNode = { properties: {}, required: new Set() };
    const timestamps = new Set(timestampFields(schema));

    for (const [name, path] of Object.entries(schema.paths as unknown as Record<string, SchemaTypeLike>)) {
        if (IGNORED_PATHS.has(name)) continue;

        // Paths com ponto (`geometry.location.lat`) viram objetos aninhados.
        const segments = name.split(".");
        const leaf = segments.pop() as string;
        let node = root;
        for (const segment of segments) {
            const existing = node.properties[segment];
            const child = existing && isNode(existing) ? existing : { properties: {}, required: new Set<string>() };
            node.properties[segment] = child;
            node = child;
        }

        node.properties[leaf] = pathSchema(path);
        if (path.isRequired || (segments.length === 0 && timestamps.has(leaf))) node.required.add(leaf);
    }

    // Objeto aninhado com campo obrigatório é, na prática, obrigatório (o Mongoose valida assim).
    const propagate = (node: ObjectNode) => {
        for (const [key, value] of Object.entries(node.properties)) {
            if (!isNode(value)) continue;
            propagate(value);
            if (value.required.size > 0) node.required.add(key);
        }
    };
    propagate(root);

    const result = finalize(root);
    if (schema.options.strict === false) result.additionalProperties = true;
    return result;
}
