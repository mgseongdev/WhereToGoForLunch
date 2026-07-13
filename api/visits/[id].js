const { getSupabase } = require("../_lib/supabase");
const { withHandler, sendJson, sendError, readJson } = require("../_lib/http");

module.exports = withHandler(async (req, res) => {
  const supabase = getSupabase();
  const id = req.query.id;

  if (!id) {
    sendError(res, 400, "visit id가 필요합니다.");
    return;
  }

  if (req.method === "PUT" || req.method === "PATCH") {
    const body = await readJson(req);
    const payload = {
      restaurant_id: body.restaurant_id ?? body.restaurantId,
      date: body.date,
      memo: body.memo ?? "",
    };

    const { error } = await supabase.from("visits").update(payload).eq("id", id);
    if (!error) {
      sendJson(res, 200, { ok: true });
      return;
    }

    const legacyPayload = {
      name: body.name,
      cuisine: body.cuisine,
      date: body.date,
      memo: body.memo ?? "",
    };

    const legacy = await supabase.from("visits").update(legacyPayload).eq("id", id);
    if (legacy.error) {
      sendError(res, 500, legacy.error.message);
      return;
    }

    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === "DELETE") {
    const { error } = await supabase.from("visits").delete().eq("id", id);
    if (error) {
      sendError(res, 500, error.message);
      return;
    }
    sendJson(res, 200, { ok: true });
    return;
  }

  sendError(res, 405, "Method not allowed");
});
