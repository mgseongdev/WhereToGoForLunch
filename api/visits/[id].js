const { getSupabase } = require("../_lib/supabase");
const { withHandler, sendJson, sendError, readJson } = require("../_lib/http");
const { withUpdateTimestamps } = require("../_lib/timestamps");

module.exports = withHandler(async (req, res) => {
  const supabase = getSupabase();
  const id = req.query.id;

  if (!id) {
    sendError(res, 400, "visit id가 필요합니다.");
    return;
  }

  if (req.method === "PUT" || req.method === "PATCH") {
    const body = await readJson(req);

    const attempts = [
      {
        payload: withUpdateTimestamps({
          restaurant_id: body.restaurant_id ?? body.restaurantId,
          date: body.date,
          memo: body.memo ?? "",
        }),
        select: "*, restaurants(name, cuisine)",
      },
      {
        payload: withUpdateTimestamps({
          name: body.name,
          cuisine: body.cuisine,
          date: body.date,
          memo: body.memo ?? "",
        }),
        select: "*",
      },
    ];

    let lastError = null;

    for (const attempt of attempts) {
      const { data, error } = await supabase
        .from("visits")
        .update(attempt.payload)
        .eq("id", id)
        .select(attempt.select)
        .maybeSingle();

      if (error) {
        lastError = error;
        continue;
      }

      if (data) {
        sendJson(res, 200, { visit: data, ok: true });
        return;
      }
    }

    if (lastError) {
      sendError(res, 500, lastError.message);
      return;
    }

    sendError(
      res,
      403,
      "방문 기록을 수정할 수 없습니다. Supabase SQL Editor에서 migrate-visits-update.sql을 실행해 주세요."
    );
    return;
  }

  if (req.method === "DELETE") {
    const { data, error } = await supabase
      .from("visits")
      .delete()
      .eq("id", id)
      .select("id")
      .maybeSingle();

    if (error) {
      sendError(res, 500, error.message);
      return;
    }

    if (!data) {
      sendError(res, 404, "삭제할 방문 기록을 찾지 못했거나 권한이 없습니다.");
      return;
    }

    sendJson(res, 200, { ok: true });
    return;
  }

  sendError(res, 405, "Method not allowed");
});
