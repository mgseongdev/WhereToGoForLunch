import { chromium } from "playwright";

const base = process.env.BASE_URL || "http://localhost:3000";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

const consoleErrors = [];
const pageErrors = [];
page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(msg.text());
});
page.on("pageerror", (err) => pageErrors.push(String(err)));

await page.goto(base, { waitUntil: "networkidle", timeout: 30000 });
await page.waitForTimeout(800);

const result = await page.evaluate(() => {
  const select = document.getElementById("restaurant-select");
  const options = select ? [...select.options].map((o) => o.textContent.trim()) : [];
  const visitCount = document.getElementById("visit-count")?.textContent ?? null;
  const restaurantCount = document.getElementById("restaurant-count")?.textContent ?? null;
  const visitItems = [...document.querySelectorAll("#visit-list .visit-item__name")].map(
    (el) => el.textContent.trim()
  );
  const restaurantItems = [
    ...document.querySelectorAll("#restaurant-list .restaurant-item__name"),
  ].map((el) => el.textContent.trim());
  const referenceStatus = document.getElementById("reference-status")?.textContent ?? null;
  const toast = document.getElementById("toast");
  return {
    optionCount: options.length,
    firstOptions: options.slice(0, 5),
    visitCount,
    restaurantCount,
    visitItems,
    restaurantItems: restaurantItems.slice(0, 5),
    restaurantItemCount: restaurantItems.length,
    referenceStatus,
    toastVisible: toast ? !toast.hidden : null,
    toastText: toast?.textContent ?? null,
  };
});

await page.click("#btn-recommend");
await page.waitForTimeout(500);
const recommend = await page.evaluate(() => ({
  visible: !document.getElementById("recommend-result")?.hidden,
  name: document.getElementById("recommend-name")?.textContent ?? "",
}));

await page.click(".restaurant-item .btn--edit");
await page.waitForTimeout(400);
const edit = await page.evaluate(() => ({
  editing: !!document.querySelector(".restaurant-item--editing"),
  name: document.getElementById("inline-restaurant-name")?.value ?? null,
}));

const report = { base, result, recommend, edit, consoleErrors, pageErrors };
console.log(JSON.stringify(report, null, 2));

const ok =
  result.optionCount > 1 &&
  result.restaurantItemCount > 0 &&
  result.visitItems.length > 0 &&
  recommend.visible &&
  Boolean(recommend.name) &&
  edit.editing &&
  pageErrors.length === 0 &&
  consoleErrors.length === 0;

await browser.close();
process.exit(ok ? 0 : 1);
