const { getSupabase } = require("../_lib/supabase");
const { withHandler, sendJson, sendError, readJson } = require("../_lib/http");
const { applyDistance } = require("../_lib/distance");

module.exports = withHandler(async (req, res) => {
  const supabase = getSupabase();

  if (req.method === "GET") {
    const { data, error } = await supabase
      .from("reference_points")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      sendError(res, 500, error.message);
      return;
    }

    sendJson(res, 200, { reference: data ?? null });
    return;
  }

  if (req.method === "POST" || req.method === "PUT") {
    const body = await readJson(req);
    const payload = {
      name: body.name,
      address: body.address,
      latitude: body.latitude,
      longitude: body.longitude,
      updated_at: new Date().toISOString(),
    };

    const existing = await supabase
      .from("reference_points")
      .select("id")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing.error) {
      sendError(res, 500, existing.error.message);
      return;
    }

    let saved;
    if (existing.data?.id) {
      const { data, error } = await supabase
        .from("reference_points")
        .update(payload)
        .eq("id", existing.data.id)
        .select()
        .single();
      if (error) {
        sendError(res, 500, error.message);
        return;
      }
      saved = data;
    } else {
      const { data, error } = await supabase
        .from("reference_points")
        .insert(payload)
        .select()
        .single();
      if (error) {
        sendError(res, 500, error.message);
        return;
      }
      saved = data;
    }

    const { data: restaurants, error: listError } = await supabase
      .from("restaurants")
      .select("*");

    if (!listError && restaurants?.length) {
      await Promise.all(
        restaurants.map((restaurant) => {
          const updated = applyDistance(restaurant, saved);
          return supabase
            .from("restaurants")
            .update({
              distance_meters: updated.distance_meters,
              distance_band: updated.distance_band,
            })
            .eq("id", restaurant.id);
        })
      );
    }

    sendJson(res, 200, { reference: saved });
    return;
  }

  sendError(res, 405, "Method not allowed");
});
