// 사이트 독자가 미국 영어권이라, '오늘'은 뉴욕 시각의 달력 날짜로 잡습니다.
export const EDITORIAL_TIME_ZONE = "America/New_York";

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

export function editorialDate(now = new Date(), override = process.env.HOROSCOPE_DATE) {
  const raw = typeof override === "string" ? override.trim() : "";
  const iso = raw ? raw : formatIso(now, EDITORIAL_TIME_ZONE);
  assertIso(iso);
  return { iso, long: longDate(iso), timeZone: EDITORIAL_TIME_ZONE };
}

export function assertIso(iso) {
  if (!ISO_RE.test(iso)) {
    throw new Error(`날짜는 YYYY-MM-DD 형식이어야 합니다. 받은 값: ${iso}`);
  }
  const [year, month, day] = iso.split("-").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day));
  if (
    utc.getUTCFullYear() !== year ||
    utc.getUTCMonth() !== month - 1 ||
    utc.getUTCDate() !== day
  ) {
    throw new Error(`달력에 없는 날짜입니다: ${iso}`);
  }
  return iso;
}

export function longDate(iso) {
  assertIso(iso);
  const [year, month, day] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

export function previousIso(iso) {
  assertIso(iso);
  const [year, month, day] = iso.split("-").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day));
  utc.setUTCDate(utc.getUTCDate() - 1);
  return utc.toISOString().slice(0, 10);
}

export function nextIso(iso) {
  assertIso(iso);
  const [year, month, day] = iso.split("-").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day));
  utc.setUTCDate(utc.getUTCDate() + 1);
  return utc.toISOString().slice(0, 10);
}

export function dayNumber(iso) {
  assertIso(iso);
  const [year, month, day] = iso.split("-").map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / 86400000);
}

function formatIso(now, timeZone) {
  const iso = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return assertIso(iso);
}
