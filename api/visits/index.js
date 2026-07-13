const { getSupabase } = require("../_lib/supabase");
const { withHandler, sendJson, sendError, readJson } = require("../_lib/http");

module.exports = withHandler(async (req, res) => {
  const supabase = getSupabase();

  if (req.method === "GET") {
    const joined = await supabase
      .from("visits")
      .select("*, restaurants(name, cuisine, address, distance_band, distance_meters)")
      .order("date", { ascending: false });

    if (!joined.error) {
      sendJson(res, 200, { visits: joined.data ?? [] });
      return;
    }

    const legacy = await supabase.from("visits").select("*").order("date", { ascending: false });
    if (legacy.error) {
      sendError(res, 500, legacy.error.message);
      return;
    }

    sendJson(res, 200, { visits: legacy.data ?? [] });
    return;
  }

  if (req.method === "POST") {
    const body = await readJson(req);
    const payload = {
      restaurant_id: body.restaurant_id ?? body.restaurantId,
      date: body.date,
      memo: body.memo ?? "",
    };

    const joined = await supabase
      .from("visits")
      .insert(payload)
      .select("*, restaurants(name, cuisine)")
      .single();

    if (!joined.error) {
      sendJson(res, 201, { visit: joined.data });
      return;
    }

    const legacyPayload = {
      name: body.name,
      cuisine: body.cuisine,
      date: body.date,
      memo: body.memo ?? "",
    };

    const legacy = await supabase.from("visits").insert(legacyPayload).select().single();
    if (legacy.error) {
      sendError(res, 500, legacy.error.message);
      return;
    }

    sendJson(res, 201, { visit: legacy.data });
    return;
  }

  sendError(res, 405, "Method not allowed");
});
