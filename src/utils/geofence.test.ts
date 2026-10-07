import assert from 'node:assert/strict';
import { assertWithinCheckinRadius, haversineDistanceMeters } from './geofence.js';
import { AppError } from '../errors/appError.js';

const placeCoords = {
  geometry: { location: { lat: -25.4284, lng: -49.2733 } },
};

// Curitiba centro → ~111m por 0.001° lat
const nearby = { lat: -25.4294, lng: -49.2733 };
const farAway = { lat: -25.5, lng: -49.3 };

assert.ok(haversineDistanceMeters(placeCoords.geometry.location, nearby) < 200);
assert.ok(haversineDistanceMeters(placeCoords.geometry.location, farAway) > 5000);

assertWithinCheckinRadius(placeCoords, nearby, 150);
assertWithinCheckinRadius(placeCoords, undefined, 150);

try {
  assertWithinCheckinRadius(placeCoords, farAway, 150);
  assert.fail('expected AppError');
} catch (error) {
  assert.ok(error instanceof AppError);
  assert.equal(error.statusCode, 422);
}

console.log('geofence.test.ts: ok');
