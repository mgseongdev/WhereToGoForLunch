const { withHandler, sendJson, sendError } = require("../_lib/http");
const { haversineMeters } = require("../_lib/distance");

module.exports = withHandler(async (req, res) => {
  if (req.method !== "GET") {
    sendError(res, 405, "Method not allowed");
    return;
  }

  const key = process.env.KAKAO_REST_API_KEY;
  if (!key) {
    sendError(res, 500, "KAKAO_REST_API_KEY가 설정되지 않았습니다.");
    return;
  }

  const query = String(req.query.query || "").trim();
  if (query.length < 2) {
    sendJson(res, 200, { places: [] });
    return;
  }

  const latitude = parseFloat(req.query.latitude || "");
  const longitude = parseFloat(req.query.longitude || "");
  const hasReference = !Number.isNaN(latitude) && !Number.isNaN(longitude);

  const params = new URLSearchParams({
    query,
    size: "15",
  });

  if (hasReference) {
    params.set("x", String(longitude));
    params.set("y", String(latitude));
    params.set("sort", "distance");
    params.set("radius", "20000");
  }

  const response = await fetch(
    `https://dapi.kakao.com/v2/local/search/keyword.json?${params}`,
    { headers: { Authorization: `KakaoAK ${key}` } }
  );

  if (!response.ok) {
    sendError(
      res,
      502,
      "주소 검색에 실패했습니다. 카카오 개발자 콘솔에서 Web 플랫폼을 등록했는지 확인하세요."
    );
    return;
  }

  const data = await response.json();
  let places = (data.documents ?? []).map((doc) => {
    const placeLat = parseFloat(doc.y);
    const placeLng = parseFloat(doc.x);
    const distanceMeters = hasReference
      ? Math.round(haversineMeters(latitude, longitude, placeLat, placeLng))
      : doc.distance != null
        ? Number(doc.distance)
        : null;

    return {
      name: doc.place_name,
      address: doc.road_address_name || doc.address_name,
      latitude: placeLat,
      longitude: placeLng,
      distanceMeters,
      label: `${doc.place_name} · ${doc.road_address_name || doc.address_name}`,
    };
  });

  if (hasReference) {
    places.sort((a, b) => (a.distanceMeters ?? Infinity) - (b.distanceMeters ?? Infinity));
  }

  sendJson(res, 200, { places: places.slice(0, 8) });
});
