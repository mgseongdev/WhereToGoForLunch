const DISTANCE_NEAR_MAX = 400;
const DISTANCE_MEDIUM_MAX = 1000;
const RECENT_LUNCH_DAYS = 14;

let restaurantAddressSearch = null;
let referenceAddressSearch = null;
let inlineAddressSearch = null;
let editingRestaurantId = null;
let editingVisitId = null;
let restaurantCuisineTab = "전체";
let cachedRestaurants = [];
let cachedVisits = [];
let lastRecommendedRestaurant = null;

const CUISINE_OPTIONS = ["한식", "중식", "일식", "아시안", "양식", "패스트푸드", "분식", "기타"];
const DISTANCE_BANDS = ["near", "medium", "far"];

const els = {
  referenceForm: document.getElementById("reference-form"),
  referenceName: document.getElementById("reference-name"),
  referenceAddress: document.getElementById("reference-address"),
  referenceLat: document.getElementById("reference-lat"),
  referenceLng: document.getElementById("reference-lng"),
  referenceResolved: document.getElementById("reference-resolved"),
  referenceSuggestions: document.getElementById("reference-suggestions"),
  referenceStatus: document.getElementById("reference-status"),
  restaurantForm: document.getElementById("restaurant-form"),
  newRestaurantName: document.getElementById("new-restaurant-name"),
  newRestaurantAddress: document.getElementById("new-restaurant-address"),
  newRestaurantLat: document.getElementById("new-restaurant-lat"),
  newRestaurantLng: document.getElementById("new-restaurant-lng"),
  newRestaurantResolved: document.getElementById("new-restaurant-resolved"),
  newRestaurantSuggestions: document.getElementById("new-restaurant-suggestions"),
  newRestaurantCuisine: document.getElementById("new-restaurant-cuisine"),
  newRestaurantMemo: document.getElementById("new-restaurant-memo"),
  newRestaurantTeamLeaderOk: document.getElementById("new-restaurant-team-leader-ok"),
  restaurantFormDesc: document.getElementById("restaurant-form-desc"),
  restaurantCuisineTabs: document.getElementById("restaurant-cuisine-tabs"),
  restaurantList: document.getElementById("restaurant-list"),
  restaurantCount: document.getElementById("restaurant-count"),
  restaurantEmpty: document.getElementById("restaurant-empty"),
  restaurantSelect: document.getElementById("restaurant-select"),
  form: document.getElementById("visit-form"),
  visitDate: document.getElementById("visit-date"),
  visitDateText: document.getElementById("visit-date-text"),
  visitDateWeekday: document.getElementById("visit-date-weekday"),
  memo: document.getElementById("memo"),
  visitList: document.getElementById("visit-list"),
  visitCount: document.getElementById("visit-count"),
  historyEmpty: document.getElementById("history-empty"),
  btnRecommend: document.getElementById("btn-recommend"),
  btnRecommendVisit: document.getElementById("btn-recommend-visit"),
  recommendResult: document.getElementById("recommend-result"),
  recommendEmpty: document.getElementById("recommend-empty"),
  recommendName: document.getElementById("recommend-name"),
  recommendMeta: document.getElementById("recommend-meta"),
  toast: document.getElementById("toast"),
};

async function apiRequest(path, options = {}) {
  const headers = { ...(options.headers ?? {}) };
  if (options.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(path, {
    ...options,
    headers,
  });

  let data = null;
  const text = await response.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { error: text };
    }
  }

  if (!response.ok) {
    throw new Error(data?.error || `요청에 실패했습니다. (${response.status})`);
  }

  return data;
}

function todayString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function setDefaultVisitDate() {
  els.visitDate.value = todayString();
  updateVisitDateWeekday();
}

function bandLabel(band) {
  if (band === "near") return "가까움";
  if (band === "medium") return "중간";
  if (band === "far") return "먼 곳";
  return "미설정";
}

function metersToBand(meters) {
  if (meters == null || Number.isNaN(meters)) return null;
  if (meters <= DISTANCE_NEAR_MAX) return "near";
  if (meters <= DISTANCE_MEDIUM_MAX) return "medium";
  return "far";
}

function formatDistance(meters) {
  if (meters == null) return "";
  if (meters < 1000) return `${meters}m`;
  return `${(meters / 1000).toFixed(1)}km`;
}

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

function applyDistanceToRestaurant(restaurant, referencePoint) {
  if (
    !referencePoint ||
    restaurant.latitude == null ||
    restaurant.longitude == null
  ) {
    return { ...restaurant, distanceMeters: null, distanceBand: null };
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
    distanceMeters,
    distanceBand: metersToBand(distanceMeters),
  };
}

async function searchKakaoPlaces(query, referencePoint = null) {
  const params = new URLSearchParams({ query });

  if (referencePoint?.latitude != null && referencePoint?.longitude != null) {
    params.set("latitude", String(referencePoint.latitude));
    params.set("longitude", String(referencePoint.longitude));
  }

  const data = await apiRequest(`/api/kakao/search?${params}`);
  return data.places ?? [];
}

function createAddressSearch({
  input,
  list,
  latInput,
  lngInput,
  resolvedInput,
  getSearchQuery,
  onSelectPlace,
  sortByReference = false,
}) {
  if (!input || !list || !latInput || !lngInput || !resolvedInput) {
    throw new Error("주소 검색 요소를 찾지 못했습니다. 페이지를 새로고침해 주세요.");
  }

  let debounceTimer = null;
  let selectedPlace = null;

  function clearSelection() {
    selectedPlace = null;
    latInput.value = "";
    lngInput.value = "";
    resolvedInput.value = "";
    list.hidden = true;
    list.innerHTML = "";
  }

  function selectPlace(place) {
    selectedPlace = place;
    input.value = place.address;
    latInput.value = String(place.latitude);
    lngInput.value = String(place.longitude);
    resolvedInput.value = "1";
    list.hidden = true;
    list.innerHTML = "";

    if (onSelectPlace) {
      onSelectPlace(place);
    }
  }

  async function renderSuggestions(query) {
    const referencePoint = sortByReference ? await loadReferencePoint() : null;
    const places = await searchKakaoPlaces(query, referencePoint);

    if (places.length === 0) {
      list.innerHTML = `<li class="address-suggestions__empty">검색 결과가 없습니다.</li>`;
      list.hidden = false;
      return;
    }

    const hint =
      sortByReference && !referencePoint
        ? `<li class="address-suggestions__hint">기준 위치를 설정하면 가까운 순으로 표시됩니다.</li>`
        : "";

    list.innerHTML =
      hint +
      places
        .map((place, index) => {
          const distanceText =
            place.distanceMeters != null ? ` · ${formatDistance(place.distanceMeters)}` : "";

          return `
          <li>
            <button type="button" class="address-suggestions__item" data-index="${index}">
              <strong>${escapeHtml(place.name)}</strong>
              <span>${escapeHtml(place.address)}${distanceText}</span>
            </button>
          </li>
        `;
        })
        .join("");

    list.hidden = false;

    list.querySelectorAll(".address-suggestions__item").forEach((button) => {
      button.addEventListener("click", () => {
        selectPlace(places[Number(button.dataset.index)]);
      });
    });
  }

  function scheduleSearch(rawQuery, { clearOnSearch = true } = {}) {
    clearTimeout(debounceTimer);
    if (clearOnSearch) {
      clearSelection();
    }

    const query = rawQuery.trim();
    if (query.length < 2) {
      if (!clearOnSearch) {
        list.hidden = true;
        list.innerHTML = "";
      }
      return;
    }

    debounceTimer = setTimeout(async () => {
      try {
        const searchQuery = getSearchQuery ? getSearchQuery(query) : query;
        await renderSuggestions(searchQuery);
      } catch (error) {
        console.error("주소 검색 오류:", error);
        showToast(error.message, true);
      }
    }, 300);
  }

  input.addEventListener("input", () => {
    scheduleSearch(input.value);
  });

  input.addEventListener("focus", () => {
    if (list.children.length > 0) list.hidden = false;
  });

  return {
    search(query, options) {
      scheduleSearch(query, options);
    },
    getSelectedPlace() {
      const lat = parseFloat(latInput.value);
      const lng = parseFloat(lngInput.value);
      const hasCoords =
        resolvedInput.value === "1" && !Number.isNaN(lat) && !Number.isNaN(lng);

      if (!hasCoords) return null;

      return {
        name: selectedPlace?.name ?? "",
        address: selectedPlace?.address ?? input.value.trim(),
        latitude: selectedPlace?.latitude ?? lat,
        longitude: selectedPlace?.longitude ?? lng,
      };
    },
    reset() {
      input.value = "";
      clearSelection();
    },
    hasValidSelection() {
      return resolvedInput.value === "1";
    },
    fill(place) {
      if (!place) return;
      selectedPlace = {
        name: place.name ?? "",
        address: place.address ?? "",
        latitude: place.latitude,
        longitude: place.longitude,
      };
      input.value = place.address ?? "";
      latInput.value = place.latitude != null ? String(place.latitude) : "";
      lngInput.value = place.longitude != null ? String(place.longitude) : "";
      resolvedInput.value = place.latitude != null && place.longitude != null ? "1" : "";
    },
  };
}

function bindAddressSearchDismiss() {
  document.addEventListener("click", (event) => {
    const restaurantField = els.newRestaurantSuggestions.closest(".address-field");
    const isInsideRestaurantSearch =
      restaurantField?.contains(event.target) || els.newRestaurantName.contains(event.target);

    if (!isInsideRestaurantSearch) {
      els.newRestaurantSuggestions.hidden = true;
    }

    const inlineSuggestions = document.getElementById("inline-restaurant-suggestions");
    const inlineName = document.getElementById("inline-restaurant-name");
    const inlineField = inlineSuggestions?.closest(".address-field");
    const isInsideInlineSearch =
      inlineField?.contains(event.target) || inlineName?.contains(event.target);

    if (inlineSuggestions && !isInsideInlineSearch) {
      inlineSuggestions.hidden = true;
    }

    const referenceField = els.referenceSuggestions.closest(".address-field");
    if (referenceField && !referenceField.contains(event.target)) {
      els.referenceSuggestions.hidden = true;
    }
  });
}

function formatDate(dateString) {
  const date = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateString;
  return date.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  });
}

function formatWeekday(dateString) {
  const date = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("ko-KR", { weekday: "long" });
}

function formatDateShort(dateString) {
  const date = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateString;
  return date.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
  });
}

function updateVisitDateWeekday(input = els.visitDate) {
  if (!input) return;

  const field = input.closest(".date-field");
  const valueEl =
    input === els.visitDate
      ? els.visitDateText
      : field?.querySelector(".date-field__value");
  const weekdayEl =
    input === els.visitDate
      ? els.visitDateWeekday
      : field?.querySelector("[data-inline-visit-weekday], .date-field__weekday");

  if (valueEl) {
    valueEl.textContent = input.value ? formatDateShort(input.value) : "";
  }
  if (weekdayEl) {
    weekdayEl.textContent = input.value ? formatWeekday(input.value) : "";
  }
}

function showToast(message, isError = false) {
  els.toast.textContent = message;
  els.toast.classList.toggle("toast--error", isError);
  els.toast.hidden = false;

  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => {
    els.toast.hidden = true;
  }, 2400);
}

function createId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    try {
      return crypto.randomUUID();
    } catch {
      // file:// 등 비보안 컨텍스트에서는 randomUUID가 실패할 수 있음
    }
  }

  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizeReferencePoint(raw) {
  if (!raw) return null;

  return {
    id: raw.id ?? createId(),
    name: String(raw.name ?? "기준 위치").trim(),
    address: String(raw.address ?? "").trim(),
    latitude: raw.latitude != null ? Number(raw.latitude) : null,
    longitude: raw.longitude != null ? Number(raw.longitude) : null,
    updatedAt: raw.updated_at ?? raw.updatedAt ?? new Date().toISOString(),
  };
}

function normalizeRestaurant(raw) {
  return {
    id: raw.id ?? createId(),
    name: String(raw.name ?? "").trim(),
    cuisine: raw.cuisine ?? "기타",
    memo: String(raw.memo ?? "").trim(),
    address: String(raw.address ?? "").trim(),
    latitude: raw.latitude != null ? Number(raw.latitude) : null,
    longitude: raw.longitude != null ? Number(raw.longitude) : null,
    distanceMeters:
      raw.distance_meters != null ? Number(raw.distance_meters) : raw.distanceMeters ?? null,
    distanceBand: raw.distance_band ?? raw.distanceBand ?? null,
    excludeForTeamLeader: Boolean(
      raw.exclude_for_team_leader ?? raw.excludeForTeamLeader ?? false
    ),
    createdAt: raw.created_at ?? raw.createdAt ?? new Date().toISOString(),
  };
}

function normalizeVisit(raw) {
  const restaurant = raw.restaurants ?? null;

  return {
    id: raw.id ?? createId(),
    restaurantId: raw.restaurant_id ?? raw.restaurantId ?? restaurant?.id ?? null,
    name: restaurant?.name ?? String(raw.name ?? "").trim(),
    cuisine: restaurant?.cuisine ?? raw.cuisine ?? "기타",
    date: raw.date ?? todayString(),
    memo: String(raw.memo ?? "").trim(),
    createdAt: raw.created_at ?? raw.createdAt ?? new Date().toISOString(),
  };
}

function getRestaurantById(restaurants, id) {
  return restaurants.find((restaurant) => restaurant.id === id) ?? null;
}

function countVisitsForRestaurant(visits, restaurantId) {
  return visits.filter((visit) => visit.restaurantId === restaurantId).length;
}

function restaurantPayload(restaurant) {
  return {
    name: restaurant.name,
    cuisine: restaurant.cuisine,
    memo: restaurant.memo,
    address: restaurant.address,
    latitude: restaurant.latitude,
    longitude: restaurant.longitude,
    distance_meters: restaurant.distanceMeters,
    distance_band: restaurant.distanceBand,
    exclude_for_team_leader: Boolean(restaurant.excludeForTeamLeader),
  };
}

async function loadReferencePoint() {
  try {
    const data = await apiRequest("/api/reference");
    return normalizeReferencePoint(data.reference);
  } catch (error) {
    console.error("기준 위치 불러오기 오류:", error);
    showToast(error.message, true);
    return null;
  }
}

async function saveReferencePoint(point) {
  const data = await apiRequest("/api/reference", {
    method: "POST",
    body: JSON.stringify({
      name: point.name,
      address: point.address,
      latitude: point.latitude,
      longitude: point.longitude,
    }),
  });
  return normalizeReferencePoint(data.reference);
}

async function loadRestaurants(referencePoint = null) {
  try {
    const data = await apiRequest("/api/restaurants");
    const restaurants = (data.restaurants ?? []).map(normalizeRestaurant);
    const reference = referencePoint ?? (await loadReferencePoint());
    return restaurants.map((restaurant) => applyDistanceToRestaurant(restaurant, reference));
  } catch (error) {
    console.error("식당 불러오기 오류:", error);
    showToast(error.message, true);
    return [];
  }
}

async function saveRestaurant(restaurant) {
  try {
    const data = await apiRequest("/api/restaurants", {
      method: "POST",
      body: JSON.stringify(restaurantPayload(restaurant)),
    });
    return normalizeRestaurant(data.restaurant);
  } catch (error) {
    console.error("식당 저장 오류:", error);
    showToast(`식당 추가 실패: ${error.message}`, true);
    throw error;
  }
}

async function updateRestaurant(restaurant) {
  try {
    await apiRequest(`/api/restaurants/${restaurant.id}`, {
      method: "PUT",
      body: JSON.stringify(restaurantPayload(restaurant)),
    });
  } catch (error) {
    console.error("식당 수정 오류:", error);
    showToast(`식당 수정 실패: ${error.message}`, true);
    throw error;
  }
}

async function recalculateAllRestaurantDistances(referencePoint) {
  // 기준 위치 저장 API에서 거리 재계산을 처리합니다.
  return loadRestaurants(referencePoint);
}

async function deleteRestaurant(id) {
  try {
    await apiRequest(`/api/restaurants/${id}`, { method: "DELETE" });
  } catch (error) {
    showToast(`식당 삭제 실패: ${error.message}`, true);
    throw error;
  }
}

async function loadVisits() {
  try {
    const data = await apiRequest("/api/visits");
    return (data.visits ?? []).map(normalizeVisit);
  } catch (error) {
    console.error("방문 기록 불러오기 오류:", error);
    showToast(error.message, true);
    return [];
  }
}

async function saveVisit(visit) {
  try {
    const data = await apiRequest("/api/visits", {
      method: "POST",
      body: JSON.stringify({
        restaurant_id: visit.restaurantId,
        restaurantId: visit.restaurantId,
        name: visit.name,
        cuisine: visit.cuisine,
        date: visit.date,
        memo: visit.memo,
      }),
    });
    return normalizeVisit(data.visit);
  } catch (error) {
    console.error("방문 저장 오류:", error);
    showToast(`저장 실패: ${error.message}`, true);
    throw error;
  }
}

async function updateVisit(visit) {
  try {
    await apiRequest(`/api/visits/${visit.id}`, {
      method: "PUT",
      body: JSON.stringify({
        restaurant_id: visit.restaurantId,
        restaurantId: visit.restaurantId,
        name: visit.name,
        cuisine: visit.cuisine,
        date: visit.date,
        memo: visit.memo,
      }),
    });
  } catch (error) {
    console.error("방문 수정 오류:", error);
    showToast(`수정 실패: ${error.message}`, true);
    throw error;
  }
}

async function deleteVisit(id) {
  try {
    await apiRequest(`/api/visits/${id}`, { method: "DELETE" });
  } catch (error) {
    showToast("삭제에 실패했습니다.", true);
    throw error;
  }
}

function cancelInlineEdit() {
  editingRestaurantId = null;
  inlineAddressSearch = null;
}

function cancelInlineVisitEdit() {
  editingVisitId = null;
}

function getInlineRestaurantPlace() {
  const nameInput = document.getElementById("inline-restaurant-name");
  const selected = inlineAddressSearch?.getSelectedPlace();

  if (selected) return selected;

  const lat = parseFloat(document.getElementById("inline-restaurant-lat")?.value ?? "");
  const lng = parseFloat(document.getElementById("inline-restaurant-lng")?.value ?? "");
  const address = document.getElementById("inline-restaurant-address")?.value.trim() ?? "";

  if (!address || Number.isNaN(lat) || Number.isNaN(lng)) return null;

  return {
    name: nameInput?.value.trim() ?? "",
    address,
    latitude: lat,
    longitude: lng,
  };
}

function setupInlineAddressSearch(restaurant) {
  const nameInput = document.getElementById("inline-restaurant-name");
  const addressInput = document.getElementById("inline-restaurant-address");
  const suggestions = document.getElementById("inline-restaurant-suggestions");
  const latInput = document.getElementById("inline-restaurant-lat");
  const lngInput = document.getElementById("inline-restaurant-lng");
  const resolvedInput = document.getElementById("inline-restaurant-resolved");

  if (!nameInput || !addressInput) return;

  inlineAddressSearch = createAddressSearch({
    input: addressInput,
    list: suggestions,
    latInput,
    lngInput,
    resolvedInput,
    sortByReference: true,
    getSearchQuery: (query) => {
      const name = nameInput.value.trim();
      if (document.activeElement === addressInput) {
        return name ? `${name} ${query}` : query;
      }
      return query;
    },
    onSelectPlace: (place) => {
      nameInput.value = place.name;
    },
  });

  inlineAddressSearch.fill({
    name: restaurant.name,
    address: restaurant.address ?? "",
    latitude: restaurant.latitude,
    longitude: restaurant.longitude,
  });

  nameInput.addEventListener("input", () => {
    inlineAddressSearch.search(nameInput.value, { clearOnSearch: false });
  });
}

function daysSince(dateString) {
  const today = new Date(`${todayString()}T00:00:00`);
  const target = new Date(`${dateString}T00:00:00`);
  return Math.floor((today - target) / (1000 * 60 * 60 * 24));
}

function buildRestaurantProfiles(restaurants, visits) {
  const visitsByRestaurant = new Map();

  for (const visit of visits) {
    if (!visit.restaurantId) continue;
    if (!visitsByRestaurant.has(visit.restaurantId)) {
      visitsByRestaurant.set(visit.restaurantId, []);
    }
    visitsByRestaurant.get(visit.restaurantId).push(visit);
  }

  return restaurants.map((restaurant) => {
    const restaurantVisits = visitsByRestaurant.get(restaurant.id) ?? [];
    const visitCount = restaurantVisits.length;
    let lastVisitDate = null;

    if (visitCount > 0) {
      const lastVisit = restaurantVisits.reduce((latest, current) =>
        current.date > latest.date ? current : latest
      );
      lastVisitDate = lastVisit.date;
    }

    const daysSinceVisit = lastVisitDate ? daysSince(lastVisitDate) : null;

    return {
      restaurantId: restaurant.id,
      name: restaurant.name,
      cuisine: restaurant.cuisine,
      address: restaurant.address ?? "",
      distanceBand: restaurant.distanceBand ?? null,
      distanceMeters: restaurant.distanceMeters ?? null,
      excludeForTeamLeader: Boolean(restaurant.excludeForTeamLeader),
      visitCount,
      lastVisitDate,
      daysSinceVisit,
      neverVisited: visitCount === 0,
    };
  });
}

function getRecentCuisines(visits, withinDays) {
  const cuisines = new Set();

  for (const visit of visits) {
    if (daysSince(visit.date) < withinDays) {
      cuisines.add(visit.cuisine);
    }
  }

  return cuisines;
}

function pickRandom(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function shuffleArray(items) {
  const copy = [...items];

  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }

  return copy;
}

function getCheckedFilterValues(name) {
  return [...document.querySelectorAll(`input[name="${name}"]:checked`)].map(
    (input) => input.value
  );
}

function initFilterSelectAll(masterId, childName) {
  const master = document.getElementById(masterId);
  if (!master) return;

  const getChildren = () => [...document.querySelectorAll(`input[name="${childName}"]`)];

  function syncMaster() {
    const children = getChildren();
    const checkedCount = children.filter((child) => child.checked).length;
    master.checked = checkedCount === children.length;
    master.indeterminate = checkedCount > 0 && checkedCount < children.length;
  }

  master.addEventListener("change", () => {
    const checked = master.checked;
    master.indeterminate = false;
    getChildren().forEach((child) => {
      child.checked = checked;
    });
  });

  getChildren().forEach((child) => {
    child.addEventListener("change", syncMaster);
  });

  syncMaster();
}

function getRecommendFilters() {
  return {
    cuisines: getCheckedFilterValues("filter-cuisine"),
    distances: getCheckedFilterValues("filter-distance"),
    teamLeaderOptions: getCheckedFilterValues("filter-team-leader"),
  };
}

function applyRecommendFilters(profiles, filters) {
  if (
    filters.cuisines.length === 0 ||
    filters.distances.length === 0 ||
    filters.teamLeaderOptions.length === 0
  ) {
    return [];
  }

  let filtered = profiles.filter((item) => filters.cuisines.includes(item.cuisine));

  const includeOk = filters.teamLeaderOptions.includes("ok");
  const includeExcluded = filters.teamLeaderOptions.includes("excluded");
  if (!(includeOk && includeExcluded)) {
    filtered = filtered.filter((item) =>
      item.excludeForTeamLeader ? includeExcluded : includeOk
    );
  }

  const allDistancesSelected = DISTANCE_BANDS.every((band) => filters.distances.includes(band));
  if (!allDistancesSelected) {
    filtered = filtered.filter(
      (item) => item.distanceBand && filters.distances.includes(item.distanceBand)
    );
  }

  return filtered;
}

function pickRecommendation(visits, restaurants, filters = {}) {
  let profiles = applyRecommendFilters(buildRestaurantProfiles(restaurants, visits), filters);

  if (profiles.length === 0) return null;

  const recentCuisines = getRecentCuisines(visits, RECENT_LUNCH_DAYS);

  const strategies = shuffleArray([
    {
      pool: profiles.filter(
        (item) =>
          item.neverVisited ||
          (item.daysSinceVisit != null && item.daysSinceVisit >= RECENT_LUNCH_DAYS)
      ),
    },
    {
      pool: profiles.filter((item) => !recentCuisines.has(item.cuisine)),
    },
    {
      pool: profiles.filter(
        (item) =>
          item.neverVisited ||
          (item.daysSinceVisit != null && item.daysSinceVisit >= 7)
      ),
    },
  ]);

  for (const strategy of strategies) {
    if (strategy.pool.length === 0) continue;
    return pickRandom(strategy.pool);
  }

  return pickRandom(profiles);
}

function renderReferenceStatus(referencePoint) {
  if (!referencePoint) {
    els.referenceStatus.textContent = "기준 위치가 설정되지 않았습니다.";
    els.referenceStatus.classList.remove("reference-status--active");
    return;
  }

  els.referenceStatus.textContent = `${referencePoint.name} · ${referencePoint.address}`;
  els.referenceStatus.classList.add("reference-status--active");
  referenceAddressSearch?.fill(referencePoint);
  if (els.referenceName) {
    els.referenceName.value = referencePoint.name;
  }
}

function renderRestaurantSelect(restaurants) {
  const currentValue = els.restaurantSelect.value;
  const options = ['<option value="">식당을 선택하세요</option>'];

  for (const restaurant of restaurants) {
    const distanceText = restaurant.distanceMeters != null
      ? ` · ${bandLabel(restaurant.distanceBand)}`
      : "";
    options.push(
      `<option value="${restaurant.id}">${escapeHtml(restaurant.name)} (${escapeHtml(restaurant.cuisine)}${distanceText})</option>`
    );
  }

  els.restaurantSelect.innerHTML = options.join("");

  if (currentValue && restaurants.some((restaurant) => restaurant.id === currentValue)) {
    els.restaurantSelect.value = currentValue;
  }
}

function renderRestaurantCuisineTabs(restaurants) {
  const tabs = ["전체", ...CUISINE_OPTIONS];

  els.restaurantCuisineTabs.innerHTML = tabs
    .map((tab) => {
      const count =
        tab === "전체"
          ? restaurants.length
          : restaurants.filter((restaurant) => restaurant.cuisine === tab).length;
      const isActive = restaurantCuisineTab === tab;

      return `
        <button
          type="button"
          class="cuisine-tabs__btn${isActive ? " is-active" : ""}"
          role="tab"
          aria-selected="${isActive}"
          data-cuisine-tab="${escapeHtml(tab)}"
        >
          ${escapeHtml(tab)}
          <span class="cuisine-tabs__count">${count}</span>
        </button>
      `;
    })
    .join("");
}

function getRestaurantsForActiveTab(restaurants) {
  if (restaurantCuisineTab === "전체") return restaurants;
  return restaurants.filter((restaurant) => restaurant.cuisine === restaurantCuisineTab);
}

function buildCuisineOptions(selected = "") {
  const value = CUISINE_OPTIONS.includes(selected) ? selected : selected ? "기타" : "";

  return [
    `<option value="">선택</option>`,
    ...CUISINE_OPTIONS.map(
      (cuisine) =>
        `<option value="${cuisine}" ${cuisine === value ? "selected" : ""}>${cuisine}</option>`
    ),
  ].join("");
}

function renderRestaurantViewItem(restaurant, visitCount) {
  const distanceBadge =
    restaurant.distanceBand != null
      ? `<span class="distance-badge distance-badge--${restaurant.distanceBand}">${bandLabel(restaurant.distanceBand)} · ${formatDistance(restaurant.distanceMeters)}</span>`
      : `<span class="distance-badge distance-badge--unknown">거리 미설정</span>`;
  const teamLeaderBadge = restaurant.excludeForTeamLeader
    ? `<span class="distance-badge distance-badge--excluded">팀장님 불가</span>`
    : `<span class="distance-badge distance-badge--ok">팀장님 가능</span>`;

  return `
    <div class="restaurant-item__content">
      <div class="restaurant-item__top">
        <div>
          <h3 class="restaurant-item__name">${escapeHtml(restaurant.name)}</h3>
          <p class="restaurant-item__meta">${escapeHtml(restaurant.cuisine)} · 방문 ${visitCount}회</p>
        </div>
        <div class="restaurant-item__badges">
          ${teamLeaderBadge}
          ${distanceBadge}
        </div>
      </div>
      ${restaurant.address ? `<p class="restaurant-item__address">${escapeHtml(restaurant.address)}</p>` : ""}
      ${restaurant.memo ? `<p class="restaurant-item__memo">${escapeHtml(restaurant.memo)}</p>` : ""}
    </div>
    <div class="restaurant-item__actions">
      <button type="button" class="btn btn--ghost btn--edit" data-edit-restaurant-id="${restaurant.id}">수정</button>
      <button type="button" class="btn btn--ghost" data-delete-restaurant-id="${restaurant.id}">삭제</button>
    </div>
  `;
}

function renderRestaurantEditItem(restaurant) {
  return `
    <form class="restaurant-item__edit-form form" data-inline-edit-id="${restaurant.id}" novalidate>
      <p class="restaurant-item__edit-label">식당 수정</p>
      <div class="form__row">
        <label class="form__label" for="inline-restaurant-name">식당 이름</label>
        <input
          type="text"
          id="inline-restaurant-name"
          class="form__input"
          value="${escapeHtml(restaurant.name)}"
          maxlength="80"
          autocomplete="off"
          required
        >
      </div>
      <div class="form__row">
        <label class="form__label" for="inline-restaurant-address">주소 검색</label>
        <div class="address-field">
          <input
            type="text"
            id="inline-restaurant-address"
            class="form__input address-field__input"
            value="${escapeHtml(restaurant.address ?? "")}"
            placeholder="주소·건물명으로도 검색 가능"
            autocomplete="off"
            required
          >
          <input type="hidden" id="inline-restaurant-lat" value="${restaurant.latitude ?? ""}">
          <input type="hidden" id="inline-restaurant-lng" value="${restaurant.longitude ?? ""}">
          <input type="hidden" id="inline-restaurant-resolved" value="${restaurant.latitude != null && restaurant.longitude != null ? "1" : ""}">
          <ul id="inline-restaurant-suggestions" class="address-suggestions" hidden></ul>
        </div>
      </div>
      <div class="form__grid form__grid--2">
        <div class="form__row">
          <label class="form__label" for="inline-restaurant-cuisine">음식 종류</label>
          <select id="inline-restaurant-cuisine" class="form__input" required>
            ${buildCuisineOptions(restaurant.cuisine)}
          </select>
        </div>
        <div class="form__row">
          <label class="form__label" for="inline-restaurant-memo">메모 <span class="form__optional">(선택)</span></label>
          <input
            type="text"
            id="inline-restaurant-memo"
            class="form__input"
            value="${escapeHtml(restaurant.memo ?? "")}"
            maxlength="120"
          >
        </div>
      </div>
      <div class="form__row">
        <label class="toggle-field" for="inline-restaurant-team-leader-ok">
          <span class="toggle-field__text">
            <span class="toggle-field__title">팀장님과 함께 가능</span>
            <span class="toggle-field__hint">끄면 추천에서 제외됩니다</span>
          </span>
          <input
            type="checkbox"
            id="inline-restaurant-team-leader-ok"
            class="toggle-field__input"
            role="switch"
            ${restaurant.excludeForTeamLeader ? "" : "checked"}
          >
          <span class="toggle-field__switch" aria-hidden="true"></span>
        </label>
      </div>
      <div class="form__actions">
        <button type="submit" class="btn btn--secondary">저장</button>
        <button type="button" class="btn btn--ghost" data-cancel-inline-edit>취소</button>
      </div>
    </form>
  `;
}

function renderRestaurants(restaurants, visits) {
  renderRestaurantCuisineTabs(restaurants);

  const visibleRestaurants = getRestaurantsForActiveTab(restaurants);
  els.restaurantCount.textContent = `${visibleRestaurants.length}곳`;
  els.restaurantList.innerHTML = "";
  els.restaurantEmpty.hidden = visibleRestaurants.length > 0;
  els.restaurantEmpty.textContent =
    restaurants.length === 0
      ? "등록된 식당이 없습니다."
      : `"${restaurantCuisineTab}" 식당이 없습니다.`;

  for (const restaurant of visibleRestaurants) {
    const visitCount = countVisitsForRestaurant(visits, restaurant.id);
    const isEditing = restaurant.id === editingRestaurantId;
    const item = document.createElement("li");

    item.className = "restaurant-item";
    if (isEditing) {
      item.classList.add("restaurant-item--editing");
    }
    item.dataset.restaurantId = restaurant.id;
    item.innerHTML = isEditing
      ? renderRestaurantEditItem(restaurant)
      : renderRestaurantViewItem(restaurant, visitCount);

    els.restaurantList.appendChild(item);
  }

  if (editingRestaurantId) {
    const editingRestaurant = visibleRestaurants.find(
      (restaurant) => restaurant.id === editingRestaurantId
    );
    if (editingRestaurant) {
      setupInlineAddressSearch(editingRestaurant);
    } else {
      cancelInlineEdit();
    }
  }
}

function buildVisitRestaurantOptions(selectedId = "") {
  const options = ['<option value="">식당을 선택하세요</option>'];

  for (const restaurant of cachedRestaurants) {
    const selected = restaurant.id === selectedId ? "selected" : "";
    options.push(
      `<option value="${restaurant.id}" ${selected}>${escapeHtml(restaurant.name)} (${escapeHtml(restaurant.cuisine)})</option>`
    );
  }

  if (
    selectedId &&
    !cachedRestaurants.some((restaurant) => restaurant.id === selectedId)
  ) {
    const visit = cachedVisits.find((item) => item.restaurantId === selectedId);
    if (visit) {
      options.push(
        `<option value="${selectedId}" selected>${escapeHtml(visit.name)} (${escapeHtml(visit.cuisine)})</option>`
      );
    }
  }

  return options.join("");
}

function renderVisitViewItem(visit) {
  return `
    <div class="visit-item__content">
      <div class="visit-item__top">
        <div>
          <h3 class="visit-item__name">${escapeHtml(visit.name)}</h3>
          <p class="visit-item__meta">${escapeHtml(visit.cuisine)} · ${formatDate(visit.date)}</p>
        </div>
      </div>
      ${visit.memo ? `<p class="visit-item__memo">${escapeHtml(visit.memo)}</p>` : ""}
    </div>
    <div class="visit-item__actions">
      <button type="button" class="btn btn--ghost btn--edit" data-edit-visit-id="${visit.id}">수정</button>
      <button type="button" class="btn btn--ghost" data-delete-visit-id="${visit.id}">삭제</button>
    </div>
  `;
}

function renderVisitEditItem(visit) {
  return `
    <form class="visit-item__edit-form form" data-inline-visit-edit-id="${visit.id}" novalidate>
      <p class="visit-item__edit-label">방문 기록 수정</p>
      <div class="form__row">
        <label class="form__label" for="inline-visit-restaurant">식당</label>
        <select id="inline-visit-restaurant" class="form__input" required>
          ${buildVisitRestaurantOptions(visit.restaurantId ?? "")}
        </select>
      </div>
      <div class="form__row">
        <label class="form__label" for="inline-visit-date">방문 날짜</label>
        <div class="date-field">
          <div class="date-field__summary" aria-hidden="true">
            <span class="date-field__value">${escapeHtml(formatDateShort(visit.date))}</span>
            <span class="date-field__weekday" data-inline-visit-weekday>${escapeHtml(formatWeekday(visit.date))}</span>
          </div>
          <input type="date" id="inline-visit-date" class="form__input date-field__input" value="${escapeHtml(visit.date)}" required>
        </div>
      </div>
      <div class="form__row">
        <label class="form__label" for="inline-visit-memo">방문 메모 <span class="form__optional">(선택)</span></label>
        <textarea
          id="inline-visit-memo"
          class="form__input form__textarea"
          rows="2"
          maxlength="300"
        >${escapeHtml(visit.memo ?? "")}</textarea>
      </div>
      <div class="form__actions">
        <button type="submit" class="btn btn--secondary">저장</button>
        <button type="button" class="btn btn--ghost" data-cancel-inline-visit-edit>취소</button>
      </div>
    </form>
  `;
}

function renderVisits(visits) {
  els.visitCount.textContent = `${visits.length}건`;
  els.visitList.innerHTML = "";
  els.historyEmpty.hidden = visits.length > 0;

  for (const visit of visits) {
    const isEditing = visit.id === editingVisitId;
    const item = document.createElement("li");
    item.className = "visit-item";
    if (isEditing) {
      item.classList.add("visit-item--editing");
    }
    item.dataset.visitId = visit.id;
    item.innerHTML = isEditing
      ? renderVisitEditItem(visit)
      : renderVisitViewItem(visit);
    els.visitList.appendChild(item);
  }

  if (editingVisitId) {
    const editingVisit = visits.find((visit) => visit.id === editingVisitId);
    if (!editingVisit) {
      cancelInlineVisitEdit();
    }
  }
}

function renderRecommendation(result) {
  if (!result) {
    lastRecommendedRestaurant = null;
    els.recommendResult.hidden = true;
    els.recommendEmpty.hidden = false;
    return;
  }

  lastRecommendedRestaurant = {
    restaurantId: result.restaurantId,
    name: result.name,
    cuisine: result.cuisine,
  };

  const distanceText =
    result.distanceMeters != null
      ? ` · ${bandLabel(result.distanceBand)} (${formatDistance(result.distanceMeters)})`
      : "";

  els.recommendEmpty.hidden = true;
  els.recommendResult.hidden = false;
  els.recommendName.textContent = result.name;
  els.btnRecommendVisit.disabled = false;
  els.btnRecommendVisit.textContent = "여기 가기";

  const visitText =
    result.visitCount > 0 && result.lastVisitDate
      ? ` · 마지막 방문 ${formatDate(result.lastVisitDate)} · ${result.visitCount}회 방문`
      : " · 아직 방문 기록 없음";

  els.recommendMeta.textContent = `${result.cuisine}${distanceText}${visitText}`;
}

async function handleRecommendVisit() {
  if (!lastRecommendedRestaurant?.restaurantId) {
    showToast("추천 식당이 없습니다. 먼저 추천을 받아 주세요.", true);
    return;
  }

  const today = todayString();
  const alreadyRecorded = cachedVisits.some(
    (visit) =>
      visit.restaurantId === lastRecommendedRestaurant.restaurantId && visit.date === today
  );

  if (alreadyRecorded) {
    showToast("오늘 이미 이 식당으로 기록되어 있어요.", true);
    els.btnRecommendVisit.disabled = true;
    els.btnRecommendVisit.textContent = "오늘 기록됨";
    return;
  }

  const visit = normalizeVisit({
    restaurantId: lastRecommendedRestaurant.restaurantId,
    name: lastRecommendedRestaurant.name,
    cuisine: lastRecommendedRestaurant.cuisine,
    date: today,
    memo: "추천으로 방문",
  });

  els.btnRecommendVisit.disabled = true;

  try {
    await saveVisit(visit);
    await refresh();
    els.btnRecommendVisit.textContent = "오늘 기록됨";
    showToast(`${lastRecommendedRestaurant.name}에 오늘 방문으로 기록했어요.`);
  } catch (error) {
    console.error("추천 방문 기록 오류:", error);
    els.btnRecommendVisit.disabled = false;
    if (!els.toast.hidden) return;
    showToast("방문 기록 중 오류가 발생했습니다.", true);
  }
}

async function refresh() {
  let referencePoint = null;
  let restaurants = [];
  let visits = [];

  try {
    referencePoint = await loadReferencePoint();
  } catch (error) {
    console.error("기준 위치 갱신 오류:", error);
  }

  try {
    restaurants = await loadRestaurants(referencePoint);
  } catch (error) {
    console.error("식당 목록 갱신 오류:", error);
    showToast(error.message || "식당 목록을 불러오지 못했습니다.", true);
  }

  try {
    visits = await loadVisits();
  } catch (error) {
    console.error("방문 기록 갱신 오류:", error);
    showToast(error.message || "방문 기록을 불러오지 못했습니다.", true);
  }

  cachedRestaurants = restaurants;
  cachedVisits = visits;

  try {
    renderRestaurants(restaurants, visits);
    renderRestaurantSelect(restaurants);
    renderVisits(visits);
    renderReferenceStatus(referencePoint);
  } catch (error) {
    console.error("화면 갱신 오류:", error);
    showToast(error.message || "화면을 갱신하지 못했습니다.", true);
  }

  return { referencePoint, restaurants, visits };
}

async function handleReferenceSubmit(event) {
  event.preventDefault();

  const name = els.referenceName.value.trim();
  const place = referenceAddressSearch.getSelectedPlace();

  if (!name || !place) {
    showToast("이름을 입력하고 주소 검색 결과에서 항목을 선택해 주세요.", true);
    return;
  }

  const point = normalizeReferencePoint({
    name,
    address: place.address,
    latitude: place.latitude,
    longitude: place.longitude,
  });

  try {
    await saveReferencePoint(point);
    await refresh();
    showToast("기준 위치가 저장되었습니다.");
  } catch (error) {
    console.error("기준 위치 저장 오류:", error);
    showToast(error?.message ?? "기준 위치 저장에 실패했습니다.", true);
  }
}

async function handleRestaurantSubmit(event) {
  event.preventDefault();

  const name = els.newRestaurantName.value.trim();
  const cuisine = els.newRestaurantCuisine.value;
  const memo = els.newRestaurantMemo.value.trim();
  const excludeForTeamLeader = !els.newRestaurantTeamLeaderOk.checked;
  const place = restaurantAddressSearch.getSelectedPlace();

  if (!name || !cuisine) {
    showToast("식당 이름과 음식 종류를 입력해 주세요.", true);
    return;
  }

  if (!place) {
    showToast("주소 검색 결과에서 식당 위치를 선택해 주세요.", true);
    return;
  }

  const restaurants = await loadRestaurants();
  const isDuplicate = restaurants.some(
    (restaurant) => restaurant.name.toLowerCase() === name.toLowerCase()
  );

  if (isDuplicate) {
    showToast("이미 등록된 식당 이름입니다.", true);
    els.restaurantForm.reset();
    els.newRestaurantTeamLeaderOk.checked = true;
    restaurantAddressSearch.reset();
    return;
  }

  const referencePoint = await loadReferencePoint();
  let restaurant = normalizeRestaurant({
    name,
    cuisine,
    memo,
    address: place.address,
    latitude: place.latitude,
    longitude: place.longitude,
    excludeForTeamLeader,
  });
  restaurant = applyDistanceToRestaurant(restaurant, referencePoint);

  try {
    await saveRestaurant(restaurant);
    els.restaurantForm.reset();
    els.newRestaurantTeamLeaderOk.checked = true;
    restaurantAddressSearch.reset();
    await refresh();
    showToast("식당이 추가되었습니다.");
  } catch (error) {
    console.error("식당 추가 오류:", error);
    if (!els.toast.hidden) return;
    showToast("식당 추가 중 오류가 발생했습니다.", true);
  }
}

async function handleInlineRestaurantSubmit(event) {
  event.preventDefault();

  const form = event.target.closest("[data-inline-edit-id]");
  if (!form) return;

  const restaurantId = form.dataset.inlineEditId;
  const name = document.getElementById("inline-restaurant-name")?.value.trim() ?? "";
  const cuisine = document.getElementById("inline-restaurant-cuisine")?.value ?? "";
  const memo = document.getElementById("inline-restaurant-memo")?.value.trim() ?? "";
  const excludeForTeamLeader = !document.getElementById("inline-restaurant-team-leader-ok")
    ?.checked;
  const place = getInlineRestaurantPlace();

  if (!name || !cuisine) {
    showToast("식당 이름과 음식 종류를 입력해 주세요.", true);
    return;
  }

  if (!place) {
    showToast("주소 검색 결과에서 식당 위치를 선택해 주세요.", true);
    return;
  }

  const restaurants = await loadRestaurants();
  const existing = getRestaurantById(restaurants, restaurantId);

  if (!existing) {
    showToast("수정할 식당을 찾을 수 없습니다.", true);
    cancelInlineEdit();
    await refresh();
    return;
  }

  const isDuplicate = restaurants.some(
    (restaurant) =>
      restaurant.id !== restaurantId && restaurant.name.toLowerCase() === name.toLowerCase()
  );

  if (isDuplicate) {
    showToast("이미 등록된 식당 이름입니다.", true);
    return;
  }

  const referencePoint = await loadReferencePoint();
  let restaurant = normalizeRestaurant({
    id: restaurantId,
    name,
    cuisine,
    memo,
    address: place.address,
    latitude: place.latitude,
    longitude: place.longitude,
    excludeForTeamLeader,
    createdAt: existing.createdAt,
  });
  restaurant = applyDistanceToRestaurant(restaurant, referencePoint);

  try {
    await updateRestaurant(restaurant);
    cancelInlineEdit();
    await refresh();
    showToast("식당 정보가 수정되었습니다.");
  } catch (error) {
    console.error("식당 수정 오류:", error);
    if (!els.toast.hidden) return;
    showToast("식당 수정 중 오류가 발생했습니다.", true);
  }
}

async function handleVisitSubmit(event) {
  event.preventDefault();

  const restaurantId = els.restaurantSelect.value;
  const date = els.visitDate.value;
  const memo = els.memo.value.trim();

  if (!restaurantId || !date) {
    showToast("식당과 날짜를 입력해 주세요.", true);
    return;
  }

  const restaurants = await loadRestaurants();
  const restaurant = getRestaurantById(restaurants, restaurantId);

  if (!restaurant) {
    showToast("선택한 식당을 찾을 수 없습니다.", true);
    return;
  }

  const visit = normalizeVisit({
    restaurantId,
    name: restaurant.name,
    cuisine: restaurant.cuisine,
    date,
    memo,
  });

  try {
    await saveVisit(visit);
    els.form.reset();
    setDefaultVisitDate();
    await refresh();
    showToast("방문 기록이 저장되었습니다.");
  } catch (error) {
    console.error("저장 처리 오류:", error);
    if (!els.toast.hidden) return;
    showToast("저장 중 오류가 발생했습니다.", true);
  }
}

async function handleRestaurantListClick(event) {
  const cancelButton = event.target.closest("[data-cancel-inline-edit]");
  if (cancelButton) {
    cancelInlineEdit();
    await refresh();
    return;
  }

  const deleteButton = event.target.closest("[data-delete-restaurant-id]");
  if (deleteButton) {
    const id = deleteButton.dataset.deleteRestaurantId;
    const visits = await loadVisits();
    const visitCount = countVisitsForRestaurant(visits, id);
    const message =
      visitCount > 0
        ? `이 식당을 삭제할까요? 방문 기록 ${visitCount}건도 함께 삭제됩니다.`
        : "이 식당을 삭제할까요?";

    if (!confirm(message)) return;

    try {
      if (editingRestaurantId === id) {
        cancelInlineEdit();
      }
      await deleteRestaurant(id);
      await refresh();
      showToast("식당을 삭제했습니다.");
    } catch {
      // toast already shown
    }
    return;
  }

  const editButton = event.target.closest("[data-edit-restaurant-id]");
  if (!editButton) return;

  editingRestaurantId = editButton.dataset.editRestaurantId;
  if (editingVisitId) cancelInlineVisitEdit();
  await refresh();

  const editingItem = els.restaurantList.querySelector(".restaurant-item--editing");
  editingItem?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  document.getElementById("inline-restaurant-name")?.focus();
}

async function handleVisitListClick(event) {
  const cancelButton = event.target.closest("[data-cancel-inline-visit-edit]");
  if (cancelButton) {
    cancelInlineVisitEdit();
    renderVisits(cachedVisits);
    return;
  }

  const editButton = event.target.closest("[data-edit-visit-id]");
  if (editButton) {
    editingVisitId = editButton.dataset.editVisitId;
    if (editingRestaurantId) cancelInlineEdit();
    renderVisits(cachedVisits);

    const editingItem = els.visitList.querySelector(".visit-item--editing");
    editingItem?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    document.getElementById("inline-visit-restaurant")?.focus();
    return;
  }

  const deleteButton = event.target.closest("[data-delete-visit-id]");
  if (!deleteButton) return;

  const id = deleteButton.dataset.deleteVisitId;
  if (!confirm("이 방문 기록을 삭제할까요?")) return;

  try {
    await deleteVisit(id);
    if (editingVisitId === id) cancelInlineVisitEdit();
    await refresh();
    showToast("기록을 삭제했습니다.");
  } catch {
    // toast already shown
  }
}

async function handleInlineVisitSubmit(event) {
  event.preventDefault();

  const form = event.target.closest("[data-inline-visit-edit-id]");
  if (!form) return;

  const visitId = form.dataset.inlineVisitEditId;
  const restaurantId = document.getElementById("inline-visit-restaurant")?.value ?? "";
  const date = document.getElementById("inline-visit-date")?.value ?? "";
  const memo = document.getElementById("inline-visit-memo")?.value.trim() ?? "";

  if (!restaurantId || !date) {
    showToast("식당과 날짜를 입력해 주세요.", true);
    return;
  }

  const existing = cachedVisits.find((visit) => visit.id === visitId);
  if (!existing) {
    showToast("수정할 방문 기록을 찾을 수 없습니다.", true);
    cancelInlineVisitEdit();
    await refresh();
    return;
  }

  const restaurant = getRestaurantById(cachedRestaurants, restaurantId);
  if (!restaurant) {
    showToast("선택한 식당을 찾을 수 없습니다.", true);
    return;
  }

  const visit = normalizeVisit({
    id: visitId,
    restaurantId,
    name: restaurant.name,
    cuisine: restaurant.cuisine,
    date,
    memo,
    createdAt: existing.createdAt,
  });

  try {
    await updateVisit(visit);
    cancelInlineVisitEdit();
    await refresh();
    showToast("방문 기록이 수정되었습니다.");
  } catch (error) {
    console.error("방문 수정 오류:", error);
    if (!els.toast.hidden) return;
    showToast("방문 수정 중 오류가 발생했습니다.", true);
  }
}

async function handleRecommend() {
  const { restaurants, visits } = await refresh();
  const filters = getRecommendFilters();
  const result = pickRecommendation(visits, restaurants, filters);
  renderRecommendation(result);
}

function bindEvents() {
  els.referenceForm.addEventListener("submit", handleReferenceSubmit);
  els.restaurantForm.addEventListener("submit", handleRestaurantSubmit);
  els.restaurantList.addEventListener("submit", handleInlineRestaurantSubmit);
  els.form.addEventListener("submit", handleVisitSubmit);
  els.visitList.addEventListener("submit", handleInlineVisitSubmit);
  els.visitDate.addEventListener("change", () => updateVisitDateWeekday());
  els.visitDate.addEventListener("input", () => updateVisitDateWeekday());
  els.visitList.addEventListener("change", (event) => {
    if (event.target?.id !== "inline-visit-date") return;
    updateVisitDateWeekday(event.target);
  });
  els.visitList.addEventListener("input", (event) => {
    if (event.target?.id !== "inline-visit-date") return;
    updateVisitDateWeekday(event.target);
  });
  els.restaurantList.addEventListener("click", handleRestaurantListClick);
  els.visitList.addEventListener("click", handleVisitListClick);
  els.btnRecommend.addEventListener("click", handleRecommend);
  els.btnRecommendVisit.addEventListener("click", handleRecommendVisit);
  els.restaurantCuisineTabs.addEventListener("click", (event) => {
    const button = event.target.closest("[data-cuisine-tab]");
    if (!button) return;

    const nextTab = button.dataset.cuisineTab;
    if (!nextTab || nextTab === restaurantCuisineTab) return;

    restaurantCuisineTab = nextTab;
    if (editingRestaurantId) cancelInlineEdit();
    renderRestaurants(cachedRestaurants, cachedVisits);
  });
  initFilterSelectAll("filter-cuisine-all", "filter-cuisine");
  initFilterSelectAll("filter-distance-all", "filter-distance");
  initFilterSelectAll("filter-team-leader-all", "filter-team-leader");
  bindAddressSearchDismiss();
}

async function init() {
  try {
    bindEvents();
    setDefaultVisitDate();

    restaurantAddressSearch = createAddressSearch({
      input: els.newRestaurantAddress,
      list: els.newRestaurantSuggestions,
      latInput: els.newRestaurantLat,
      lngInput: els.newRestaurantLng,
      resolvedInput: els.newRestaurantResolved,
      getSearchQuery: (query) => {
        const name = els.newRestaurantName.value.trim();
        if (document.activeElement === els.newRestaurantAddress) {
          return name ? `${name} ${query}` : query;
        }
        return query;
      },
      onSelectPlace: (place) => {
        els.newRestaurantName.value = place.name;
      },
      sortByReference: true,
    });

    els.newRestaurantName.addEventListener("input", () => {
      restaurantAddressSearch.search(els.newRestaurantName.value, { clearOnSearch: false });
    });

    els.newRestaurantName.addEventListener("focus", () => {
      const query = els.newRestaurantName.value.trim();
      if (query.length >= 2 && els.newRestaurantSuggestions.children.length > 0) {
        els.newRestaurantSuggestions.hidden = false;
      }
    });

    referenceAddressSearch = createAddressSearch({
      input: els.referenceAddress,
      list: els.referenceSuggestions,
      latInput: els.referenceLat,
      lngInput: els.referenceLng,
      resolvedInput: els.referenceResolved,
    });

    await refresh();
  } catch (error) {
    console.error("초기화 오류:", error);
    showToast(error.message || "앱 초기화에 실패했습니다.", true);
  }
}

init();
