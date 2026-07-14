const { getSupabase } = require("../_lib/supabase");
const { withHandler, sendJson, sendError, readJson } = require("../_lib/http");
const { applyDistance } = require("../_lib/distance");

module.exports = withHandler(async (req, res) => {
  const supabase = getSupabase();
  const id = req.query.id;

  if (!id) {
    sendError(res, 400, "restaurant id가 필요합니다.");
    return;
  }

  if (req.method === "PUT" || req.method === "PATCH") {
    const body = await readJson(req);
    const { data: reference } = await supabase
      .from("reference_points")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const payload = applyDistance(
      {
        name: body.name,
        cuisine: body.cuisine,
        memo: body.memo ?? "",
        address: body.address ?? "",
        latitude: body.latitude ?? null,
        longitude: body.longitude ?? null,
        distance_meters: body.distance_meters ?? null,
        distance_band: body.distance_band ?? null,
        exclude_for_team_leader: Boolean(body.exclude_for_team_leader),
      },
      reference
    );

    const { data, error } = await supabase
      .from("restaurants")
      .update(payload)
      .eq("id", id)
      .select()
      .maybeSingle();

    if (error) {
      sendError(res, 500, error.message);
      return;
    }

    if (!data) {
      sendError(res, 403, "식당을 수정할 권한이 없습니다.");
      return;
    }

    sendJson(res, 200, { restaurant: data });
    return;
  }

  if (req.method === "DELETE") {
    const { error } = await supabase.from("restaurants").delete().eq("id", id);
    if (error) {
      sendError(res, 500, error.message);
      return;
    }
    sendJson(res, 200, { ok: true });
    return;
  }

  sendError(res, 405, "Method not allowed");
});
