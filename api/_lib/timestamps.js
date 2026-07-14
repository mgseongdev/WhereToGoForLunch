function nowIso() {
  return new Date().toISOString();
}

/** 등록/수정 시각. created_by/updated_by는 Auth 연동 전까지 null 유지. */
function withCreateTimestamps(payload = {}) {
  const now = nowIso();
  return {
    ...payload,
    created_at: payload.created_at ?? now,
    updated_at: payload.updated_at ?? now,
  };
}

function withUpdateTimestamps(payload = {}) {
  return {
    ...payload,
    updated_at: nowIso(),
  };
}

module.exports = {
  nowIso,
  withCreateTimestamps,
  withUpdateTimestamps,
};
