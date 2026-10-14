import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { composeAll, renderBlurbs, renderBody } from "./lib/compose.mjs";
import { editorialDate } from "./lib/dates.mjs";

const BODY_RE = /[ \t]*<p><strong>Daily theme:<\/strong>[\s\S]*?\n<p>At the end of the day,[\s\S]*?<\/p>/;
const LONG_DATE_RE =
  /\b(?:January|February|March|April|May|June|July|August|September|October|November|December) \d{1,2}, \d{4}\b/g;
const BLURB_START = "<!-- daily-sign-blurbs:start -->";
const BLURB_END = "<!-- daily-sign-blurbs:end -->";
const HOME_ANCHOR =
  "<h2>Daily readings for all 12 Chinese zodiac signs</h2><p>The Rat, Ox, Tiger, Rabbit, Dragon, Snake, Horse, Goat, Monkey, Rooster, Dog, and Pig pages are refreshed each day. The guidance is written in clear English and avoids guaranteed outcomes, artificial urgency, and professional advice.</p>";

export function repoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

function versionHash(text) {
  return crypto.createHash("sha256").update(text).digest("hex").slice(0, 20);
}

function ensureWebPageDate(html, iso) {
  const marker = '"@type": "WebPage"';
  const start = html.indexOf(marker);
  if (start < 0) throw new Error("ld+json WebPage가 없습니다.");
  const nextType = html.indexOf('"@type":', start + marker.length);
  const end = nextType === -1 ? html.indexOf("</script>", start) : nextType;
  let slice = html.slice(start, end);
  if (slice.includes('"dateModified"')) {
    slice = slice.replace(/("dateModified": ")\d{4}-\d{2}-\d{2}(")/, `$1${iso}$2`);
  } else if (!slice.includes('"inLanguage": "en"')) {
    throw new Error("WebPage inLanguage이 없습니다.");
  } else {
    slice = slice.replace('"inLanguage": "en"', `"inLanguage": "en", "dateModified": "${iso}"`);
  }
  return html.slice(0, start) + slice + html.slice(end);
}

function updateVersion(html, source) {
  if (!html.includes('name="hermes-content-version"')) {
    throw new Error("hermes-content-version 메타가 없습니다.");
  }
  const hash = versionHash(source);
  return html.replace(/(<meta name="hermes-content-version" content=")[0-9a-f]+(")/, `$1${hash}$2`);
}

export function applyZodiacPage(html, reading) {
  const body = renderBody(reading);
  if (!BODY_RE.test(html)) {
    throw new Error(`${reading.id} 페이지에서 매일 바뀌는 본문을 찾지 못했습니다.`);
  }
  let next = html.replace(BODY_RE, body);
  next = next.replace(LONG_DATE_RE, reading.long);
  next = next.replace(/Updated for \d{4}-\d{2}-\d{2}/g, `Updated for ${reading.iso}`);
  next = next.replace(
    /(<meta property="article:modified_time" content=")\d{4}-\d{2}-\d{2}(")/,
    `$1${reading.iso}$2`,
  );
  next = next.replace(/("dateModified": ")\d{4}-\d{2}-\d{2}(")/g, `$1${reading.iso}$2`);
  next = ensureWebPageDate(next, reading.iso);
  next = updateVersion(next, body);
  if (!next.includes('<meta property="article:published_time" content="2026-09-02">')) {
    throw new Error(`${reading.id}의 처음 발행일이 바뀌었습니다.`);
  }
  if (!next.includes('"datePublished": "2026-09-02"')) {
    throw new Error(`${reading.id}의 datePublished가 바뀌었습니다.`);
  }
  return next;
}

export function applyHomePage(html, readings) {
  const blurbs = renderBlurbs(readings);
  const iso = readings[0].iso;
  let next = html;
  if (!next.includes(BLURB_START)) {
    if (!next.includes(HOME_ANCHOR)) {
      throw new Error("홈페이지의 일일 운세 삽입 위치를 찾지 못했습니다.");
    }
    next = next.replace(HOME_ANCHOR, `${HOME_ANCHOR}\n${BLURB_START}\n${BLURB_END}\n`);
  }
  const block = `${BLURB_START}\n${blurbs}\n${BLURB_END}`;
  const replaced = next.replace(new RegExp(`${BLURB_START}[\\s\\S]*?${BLURB_END}`), block);
  if (!replaced.includes(blurbs)) {
    throw new Error("홈페이지 운세 요약을 넣지 못했습니다.");
  }
  next = replaced;
  next = next.replace(/Updated for \d{4}-\d{2}-\d{2}/g, `Updated for ${iso}`);
  next = next.replace(/("dateModified": ")\d{4}-\d{2}-\d{2}(")/g, `$1${iso}$2`);
  next = ensureWebPageDate(next, iso);
  next = updateVersion(next, blurbs);
  return next;
}

export function applySitemap(xml, iso) {
  const matches = xml.match(/<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/g) || [];
  if (matches.length !== 13) {
    throw new Error(`sitemap lastmod는 홈과 12띠, 총 13개여야 합니다. 현재 ${matches.length}개입니다.`);
  }
  return xml.replace(/<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/g, `<lastmod>${iso}</lastmod>`);
}

export function generate(root, override) {
  const date = editorialDate(new Date(), override);
  const readings = composeAll(date.iso);
  const homePath = path.join(root, "index.html");
  fs.writeFileSync(homePath, applyHomePage(fs.readFileSync(homePath, "utf8"), readings));
  for (const reading of readings) {
    const pagePath = path.join(root, "zodiac", reading.id, "index.html");
    fs.writeFileSync(pagePath, applyZodiacPage(fs.readFileSync(pagePath, "utf8"), reading));
  }
  const sitemapPath = path.join(root, "sitemap.xml");
  fs.writeFileSync(sitemapPath, applySitemap(fs.readFileSync(sitemapPath, "utf8"), date.iso));
  return date;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const date = generate(repoRoot());
  process.stdout.write(`${date.iso}\n`);
}
