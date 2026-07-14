const { getSupabase } = require("../_lib/supabase");
const { withHandler, sendJson, sendError, readJson } = require("../_lib/http");
const { applyDistance } = require("../_lib/distance");
const { withCreateTimestamps } = require("../_lib/timestamps");

module.exports = withHandler(async (req, res) => {
  const supabase = getSupabase();

  if (req.method === "GET") {
    const { data, error } = await supabase
      .from("restaurants")
      .select("*")
      .order("name", { ascending: true });

    if (error) {
      sendError(res, 500, error.message);
      return;
    }

    sendJson(res, 200, { restaurants: data ?? [] });
    return;
  }

  if (req.method === "POST") {
    const body = await readJson(req);
    const { data: reference } = await supabase
      .from("reference_points")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const payload = withCreateTimestamps(
      applyDistance(
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
      )
    );

    const { data, error } = await supabase
      .from("restaurants")
      .insert(payload)
      .select()
      .single();

    if (error) {
      sendError(res, 500, error.message);
      return;
    }

    sendJson(res, 201, { restaurant: data });
    return;
  }

  sendError(res, 405, "Method not allowed");
});
