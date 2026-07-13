const DISTANCE_NEAR_MAX = 400;
const DISTANCE_MEDIUM_MAX = 1000;

function haversineMeters(lat1, lon1, lat2, lon2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const earthRadius = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;

  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function metersToBand(meters) {
  if (meters == null || Number.isNaN(meters)) return null;
  if (meters <= DISTANCE_NEAR_MAX) return "near";
  if (meters <= DISTANCE_MEDIUM_MAX) return "medium";
  return "far";
}

function applyDistance(restaurant, referencePoint) {
  if (
    !referencePoint ||
    restaurant.latitude == null ||
    restaurant.longitude == null
  ) {
    return {
      ...restaurant,
      distance_meters: null,
      distance_band: null,
    };
  }

  const distanceMeters = Math.round(
    haversineMeters(
      referencePoint.latitude,
      referencePoint.longitude,
      restaurant.latitude,
      restaurant.longitude
    )
  );

  return {
    ...restaurant,
    distance_meters: distanceMeters,
    distance_band: metersToBand(distanceMeters),
  };
}

module.exports = { haversineMeters, metersToBand, applyDistance };
