/**
 * LEGADO — descontinuado após E2 (check-in síncrono na API).
 * Não mantenha este trigger ativo no Atlas junto com POST /checkIn (contagem em dobro).
 *
 * Atlas Database Trigger: Zanzardb.checkins → INSERT (Full Document ligado).
 *
 * Efeitos do check-in (diagrama CheckIns):
 *  1. users.checkInCount +1 e users.stamps push
 *  2. places.zanzar.checkInCount +1
 *  3. progresso do activeItinerary; 100% → completedItineraries
 *
 * Idempotente: o update do usuário só casa se o stamp deste checkin ainda não
 * existe, então um retry do trigger não conta duas vezes.
 *
 * Deploy: Atlas → App Services → Triggers → Database, collection `checkins`,
 * operation type Insert, Full Document ON, colar esta função. O nome do data
 * source abaixo deve ser o do cluster (ClusterZanzar).
 */

const DATA_SOURCE = 'ClusterZanzar';
const DB_NAME = 'Zanzardb';

function findProgressEntry(active, place) {
  if (active.routeType === 'free') {
    const eligible = active.eligiblePlaceIds || [];
    if (eligible.length > 0) {
      if (!eligible.includes(place.place_id)) return null;
    } else if (active.targetCategory !== place.zanzar.category) {
      return null;
    }
    if (active.places.some((slot) => slot.isCompleted && slot.placeId === place.place_id)) return null;
    return active.places.find((p) => !p.isCompleted) ?? null;
  }
  return active.places.find((p) => p.placeId === place.place_id && !p.isCompleted) ?? null;
}

async function applyCheckin(dbx, checkin) {
  const place = await dbx.collection('places').findOne({ place_id: checkin.placeId });
  if (!place) return;

  const user = await dbx.collection('users').findOne({
    _id: checkin.userId,
    'stamps.checkinId': { $ne: checkin._id },
  });
  if (!user) return; // usuário inexistente ou evento já processado

  const stamp = {
    stampId: place.zanzar.stampId,
    stampType: place.zanzar.category,
    placeId: place.place_id,
    placeName: place.name,
    checkinId: checkin._id,
    datetime: checkin.datetime,
  };

  const update = { $inc: { checkInCount: 1 }, $push: { stamps: stamp }, $set: { updatedAt: new Date() } };

  const active = user.activeItinerary;
  const entry = active && findProgressEntry(active, place);
  if (entry) {
    const places = active.places.map((p) =>
      p === entry
        ? {
            ...p,
            placeId: place.place_id,
            isCompleted: true,
            datetime: checkin.datetime,
            stamp: place.zanzar.stampId,
          }
        : p,
    );
    if (places.every((p) => p.isCompleted)) {
      update.$push.completedItineraries = { ...active, places, completedAt: new Date() };
      update.$set.activeItinerary = null;
    } else {
      update.$set.activeItinerary = { ...active, places };
    }
  }

  const res = await dbx
    .collection('users')
    .updateOne({ _id: user._id, 'stamps.checkinId': { $ne: checkin._id } }, update);
  if (res.modifiedCount === 0) return;

  await dbx
    .collection('places')
    .updateOne({ place_id: place.place_id }, { $inc: { 'zanzar.checkInCount': 1 } });
}

exports = async function (changeEvent) {
  const dbx = context.services.get(DATA_SOURCE).db(DB_NAME);
  await applyCheckin(dbx, changeEvent.fullDocument);
};

// Permite testar localmente com node (fora do Atlas `module` não existe no runtime).
if (typeof module !== 'undefined') module.exports = { applyCheckin };
