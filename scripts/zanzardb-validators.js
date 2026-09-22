/**
 * JSON Schema validators ($jsonSchema) para MongoDB Atlas — database Zanzardb.
 * Alinhado ao molde Zanzar (schema-proposto.md).
 */

const STAMP_IDS = [
  'stamp_museum',
  'stamp_park',
  'stamp_restaurant',
  'stamp_bar',
  'stamp_cafe',
  'stamp_historic',
  'stamp_tourist',
];

const ZANZAR_CATEGORIES = [
  'museum',
  'park',
  'restaurant',
  'bar',
  'cafe',
  'historic',
  'tourist',
];

const objectIdField = { bsonType: 'objectId' };
const objectIdString = {
  bsonType: 'string',
  pattern: '^[a-f\\d]{24}$',
};

const userStampShape = {
  bsonType: 'object',
  required: ['stampId', 'stampType', 'placeId', 'placeName', 'checkinId', 'datetime'],
  properties: {
    stampId: { enum: STAMP_IDS },
    stampType: { bsonType: 'string' },
    placeId: { bsonType: 'string' },
    placeName: { bsonType: 'string' },
    checkinId: objectIdField,
    datetime: { bsonType: 'date' },
  },
};

const itineraryPlaceProgressShape = {
  bsonType: 'object',
  required: ['placeId', 'isCompleted'],
  properties: {
    placeId: { bsonType: 'string' },
    isCompleted: { bsonType: 'bool' },
    datetime: { bsonType: 'date' },
    stamp: { enum: STAMP_IDS },
  },
};

const userItineraryEmbedShape = {
  bsonType: 'object',
  required: [
    'itineraryTemplateId',
    'name',
    'description',
    'category',
    'objectives',
    'startedAt',
    'places',
  ],
  properties: {
    itineraryTemplateId: objectIdField,
    name: { bsonType: 'string' },
    description: { bsonType: 'string' },
    category: { bsonType: 'string' },
    objectives: { bsonType: 'array', items: { bsonType: 'string' } },
    startedAt: { bsonType: 'date' },
    places: {
      bsonType: 'array',
      minItems: 1,
      items: itineraryPlaceProgressShape,
    },
  },
};

const completedItineraryShape = {
  bsonType: 'object',
  required: [
    'itineraryTemplateId',
    'name',
    'description',
    'category',
    'objectives',
    'startedAt',
    'places',
    'completedAt',
  ],
  properties: {
    ...userItineraryEmbedShape.properties,
    completedAt: { bsonType: 'date' },
  },
};

const zanzarExtensionShape = {
  bsonType: 'object',
  required: ['category', 'stampId', 'tags', 'checkInCount', 'impressionCounts'],
  properties: {
    category: { enum: ZANZAR_CATEGORIES },
    stampId: { enum: STAMP_IDS },
    tags: { bsonType: 'array', items: { bsonType: 'string' } },
    checkInCount: { bsonType: ['int', 'long', 'double'], minimum: 0 },
    impressionCounts: { bsonType: 'object' },
  },
};

const coordinatesShape = {
  bsonType: 'object',
  required: ['lat', 'lng'],
  properties: {
    lat: { bsonType: ['double', 'int', 'long'] },
    lng: { bsonType: ['double', 'int', 'long'] },
    accuracyMeters: { bsonType: ['double', 'int', 'long'], minimum: 0 },
  },
};

const ZANZARDB_VALIDATORS = {
  users: {
    bsonType: 'object',
    required: [
      'username',
      'email',
      'passwordHash',
      'checkInCount',
      'tokenVersion',
      'stamps',
      'inactiveItineraries',
      'completedItineraries',
      'createdAt',
      'updatedAt',
    ],
    properties: {
      _id: objectIdField,
      username: { bsonType: 'string', minLength: 3, maxLength: 30 },
      email: { bsonType: 'string' },
      passwordHash: { bsonType: 'string' },
      checkInCount: { bsonType: ['int', 'long', 'double'], minimum: 0 },
      tokenVersion: { bsonType: ['int', 'long', 'double'], minimum: 0 },
      stamps: { bsonType: 'array', items: userStampShape },
      activeItinerary: {
        anyOf: [userItineraryEmbedShape, { bsonType: 'null' }],
      },
      inactiveItineraries: {
        bsonType: 'array',
        items: userItineraryEmbedShape,
      },
      completedItineraries: {
        bsonType: 'array',
        items: completedItineraryShape,
      },
      createdAt: { bsonType: 'date' },
      updatedAt: { bsonType: 'date' },
    },
  },

  places: {
    bsonType: 'object',
    required: ['place_id', 'name', 'geometry', 'zanzar', 'added_at', 'updated_at'],
    properties: {
      _id: objectIdField,
      place_id: { bsonType: 'string' },
      name: { bsonType: 'string' },
      nickname: { bsonType: 'string' },
      formatted_address: { bsonType: 'string' },
      address_components: { bsonType: 'array' },
      geometry: {
        bsonType: 'object',
        required: ['location'],
        properties: {
          location: {
            bsonType: 'object',
            required: ['lat', 'lng'],
            properties: {
              lat: { bsonType: ['double', 'int', 'long'] },
              lng: { bsonType: ['double', 'int', 'long'] },
            },
          },
          viewport: { bsonType: 'object' },
        },
      },
      types: { bsonType: 'array', items: { bsonType: 'string' } },
      business_status: { bsonType: 'string' },
      editorial_summary: { bsonType: 'object' },
      opening_hours: { bsonType: 'object' },
      formatted_phone_number: { bsonType: 'string' },
      international_phone_number: { bsonType: 'string' },
      website: { bsonType: 'string' },
      url: { bsonType: 'string' },
      rating: { bsonType: ['double', 'int', 'long'] },
      user_ratings_total: { bsonType: ['int', 'long', 'double'] },
      price_level: { bsonType: ['int', 'long', 'double'] },
      photos: { bsonType: 'array' },
      zanzar: zanzarExtensionShape,
      added_at: { bsonType: 'date' },
      updated_at: { bsonType: 'date' },
    },
    additionalProperties: true,
  },

  stamp_catalog: {
    bsonType: 'object',
    required: ['stampId', 'stampType', 'label', 'imageUrl', 'sortOrder', 'isActive'],
    properties: {
      _id: objectIdField,
      stampId: { enum: STAMP_IDS },
      stampType: { enum: ZANZAR_CATEGORIES },
      label: { bsonType: 'string' },
      imageUrl: { bsonType: 'string' },
      sortOrder: { bsonType: ['int', 'long', 'double'], minimum: 0 },
      isActive: { bsonType: 'bool' },
    },
  },

  itineraries: {
    bsonType: 'object',
    required: [
      'slug',
      'name',
      'description',
      'category',
      'objectives',
      'placeIds',
      'isPublished',
      'createdAt',
      'updatedAt',
    ],
    properties: {
      _id: objectIdField,
      slug: { bsonType: 'string' },
      name: { bsonType: 'string' },
      description: { bsonType: 'string' },
      category: { bsonType: 'string' },
      objectives: { bsonType: 'array', items: { bsonType: 'string' } },
      placeIds: {
        bsonType: 'array',
        minItems: 1,
        items: { bsonType: 'string' },
      },
      coverImageUrl: { bsonType: 'string' },
      isPublished: { bsonType: 'bool' },
      createdBy: { bsonType: 'string' },
      createdAt: { bsonType: 'date' },
      updatedAt: { bsonType: 'date' },
    },
  },

  checkins: {
    bsonType: 'object',
    required: [
      'userId',
      'placeId',
      'datetime',
      'serverReceivedAt',
      'clientMutationId',
      'stampIdGranted',
    ],
    properties: {
      _id: objectIdField,
      userId: objectIdField,
      placeId: { bsonType: 'string' },
      datetime: { bsonType: 'date' },
      serverReceivedAt: { bsonType: 'date' },
      clientMutationId: { bsonType: 'string' },
      stampIdGranted: { enum: STAMP_IDS },
      coordinates: coordinatesShape,
    },
  },

  /** Rating / Reações (diagrama) — collection `rating` */
  rating: {
    bsonType: 'object',
    required: ['userId', 'placeId', 'impressionTag', 'clientMutationId', 'createdAt'],
    properties: {
      _id: objectIdField,
      userId: objectIdField,
      placeId: { bsonType: 'string' },
      checkinId: objectIdField,
      impressionTag: {
        bsonType: 'string',
        minLength: 1,
        pattern: '^[a-z][a-z0-9_]*$',
      },
      clientMutationId: { bsonType: 'string' },
      createdAt: { bsonType: 'date' },
    },
  },

  sync_mutations: {
    bsonType: 'object',
    required: [
      'clientMutationId',
      'userId',
      'mutationType',
      'resultStatus',
      'resultPayload',
      'processedAt',
    ],
    properties: {
      _id: objectIdField,
      clientMutationId: { bsonType: 'string' },
      userId: objectIdField,
      mutationType: { enum: ['checkin', 'rating'] },
      resultStatus: { enum: ['accepted', 'rejected'] },
      resultPayload: { bsonType: 'object' },
      processedAt: { bsonType: 'date' },
    },
  },
};

function applyCollectionValidator(dbx, collectionName, jsonSchema) {
  const exists = dbx.getCollectionNames().includes(collectionName);
  const validator = { $jsonSchema: jsonSchema };
  const options = {
    validationLevel: 'strict',
    validationAction: 'error',
  };

  if (!exists) {
    dbx.createCollection(collectionName, { validator, ...options });
    return { collection: collectionName, action: 'created_with_validator' };
  }

  const result = dbx.runCommand({
    collMod: collectionName,
    validator,
    ...options,
  });

  return {
    collection: collectionName,
    action: 'collMod',
    ok: result.ok === 1,
    errMsg: result.errmsg,
  };
}

function migrateImpressionsToRating(dbx) {
  const names = dbx.getCollectionNames();
  if (!names.includes('impressions')) {
    return { migrated: false, reason: 'impressions_not_found' };
  }
  if (names.includes('rating')) {
    return { migrated: false, reason: 'rating_already_exists' };
  }
  dbx.impressions.renameCollection('rating');
  return { migrated: true, from: 'impressions', to: 'rating' };
}
