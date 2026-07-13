require("dotenv").config();

const path = require("path");
const express = require("express");

const kakaoSearch = require("../api/kakao/search");
const restaurantsIndex = require("../api/restaurants/index");
const restaurantById = require("../api/restaurants/[id]");
const visitsIndex = require("../api/visits/index");
const visitById = require("../api/visits/[id]");
const referenceIndex = require("../api/reference/index");

const app = express();
const port = Number(process.env.PORT || 3000);

app.use(express.json({ limit: "1mb" }));

function run(handler) {
  return (req, res) => {
    Promise.resolve(handler(req, res)).catch((error) => {
      console.error(error);
      if (!res.headersSent) {
        res.status(500).json({ error: error.message || "서버 오류" });
      }
    });
  };
}

app.all("/api/kakao/search", run(kakaoSearch));
app.all("/api/restaurants", run(restaurantsIndex));
app.all("/api/restaurants/:id", (req, res, next) => {
  req.query = { ...req.query, id: req.params.id };
  return run(restaurantById)(req, res, next);
});
app.all("/api/visits", run(visitsIndex));
app.all("/api/visits/:id", (req, res) => {
  req.query = { ...req.query, id: req.params.id };
  return run(visitById)(req, res);
});
app.all("/api/reference", run(referenceIndex));

app.use(express.static(path.join(__dirname, "..")));

app.listen(port, () => {
  console.log(`로컬 서버 실행: http://localhost:${port}`);
  console.log("API 예시: http://localhost:%s/api/restaurants", port);
});
