import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { composeAll, renderBody } from "./lib/compose.mjs";
import { longDate, nextIso } from "./lib/dates.mjs";
import { applySitemap, applyZodiacPage, generate, repoRoot } from "./generate-daily.mjs";

const ROOT = repoRoot();
const ANIMALS = ["rat", "ox", "tiger", "rabbit", "dragon", "snake", "horse", "goat", "monkey", "rooster", "dog", "pig"];
const STYLE_HASH = "fd5bdec45395890f475345c2e561c00ff18c5e65fbebc0db4ff0b64fa4612888";
const PUBLISHED = "2026-09-02";
const FIXED_SENTENCES = new Set([
  "This horoscope offers general reflection only and is not financial advice.",
  "Pay attention to ordinary signals such as hunger, fatigue, tension, and overstimulation.",
  "A horoscope cannot diagnose or treat a health concern.",
  "Use qualified medical help for symptoms or decisions that need professional care.",
]);

const failures = [];

function fail(message) {
  failures.push(message);
}

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function sha256(content) {
  return crypto.createHash("sha256").update(content).digest("hex");
}

function tagOutline(html) {
  const tags = [];
  const re = /<\/?([a-zA-Z0-9:-]+)(?:\s[^>]*)?>/g;
  for (const match of html.matchAll(re)) {
    tags.push(match[0].startsWith("</") ? `/${match[1].toLowerCase()}` : match[1].toLowerCase());
  }
  return `${tags.join("\n")}\n`;
}

function stripBlurbs(html) {
  return html.replace(/<!-- daily-sign-blurbs:start -->[\s\S]*?<!-- daily-sign-blurbs:end -->\n?/g, "");
}

function articleWords(html) {
  const article = html.match(/<article>([\s\S]*?)<\/article>/);
  if (!article) return 0;
  const text = article[1]
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
  return text ? text.split(" ").length : 0;
}

function sentencesOf(html) {
  const body = html.match(/<p><strong>Daily theme:<\/strong>[\s\S]*?<p>At the end of the day,[\s\S]*?<\/p>/);
  if (!body) return [];
  const text = body[0]
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
  return text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence && !FIXED_SENTENCES.has(sentence));
}

function jsonScripts(html) {
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((match) =>
    JSON.parse(match[1]),
  );
}

function walkDates(start, days) {
  const dates = [start];
  for (let index = 1; index < days; index += 1) dates.push(nextIso(dates.at(-1)));
  return dates;
}

function sameFileBytes(leftRoot, rightRoot, relativePath) {
  const left = fs.readFileSync(path.join(leftRoot, relativePath));
  const right = fs.readFileSync(path.join(rightRoot, relativePath));
  return left.equals(right);
}

function checkStaticHashes() {
  const expected = JSON.parse(read("scripts/fixtures/static-hashes.json"));
  for (const [relativePath, hash] of Object.entries(expected)) {
    const actual = sha256(fs.readFileSync(path.join(ROOT, relativePath)));
    if (actual !== hash) fail(`정적 파일이 바뀌었습니다: ${relativePath}`);
  }
}

function checkOutlines(homeHtml) {
  const homeOutline = tagOutline(stripBlurbs(homeHtml));
  const expectedHome = fs.readFileSync(path.join(ROOT, "scripts/fixtures/home-outline.txt"), "utf8");
  if (homeOutline !== expectedHome) fail("홈페이지 태그 구조가 라이브 거울과 다릅니다.");
  const expectedZodiac = fs.readFileSync(path.join(ROOT, "scripts/fixtures/zodiac-outline.txt"), "utf8");
  for (const animal of ANIMALS) {
    const outline = tagOutline(read(`zodiac/${animal}/index.html`));
    if (outline !== expectedZodiac) fail(`${animal} 페이지 태그 구조가 라이브 거울과 다릅니다.`);
  }
}

function checkPage(animal, html, iso) {
  const name = animal[0].toUpperCase() + animal.slice(1);
  if (!html.includes(`<link rel="canonical" href="https://todoyhoroscope.com/zodiac/${animal}/">`)) {
    fail(`${animal} canonical이 바뀌었습니다.`);
  }
  if ((html.match(/<ins/g) || []).length !== 2) fail(`${animal} 광고 슬롯 수가 바뀌었습니다.`);
  if (!html.includes("ca-pub-4963638838326204")) fail(`${animal} AdSense 클라이언트가 없습니다.`);
  if ((html.match(/adsbygoogle = window\.adsbygoogle/g) || []).length !== 2) {
    fail(`${animal} 광고 push 횟수가 바뀌었습니다.`);
  }
  if (!html.includes(`Updated for ${iso}`)) fail(`${animal} Updated for 날짜가 ${iso}가 아닙니다.`);
  if (!html.includes(`<title>${name} Horoscope Today (${longDate(iso)}):`)) {
    fail(`${animal} 제목의 날짜가 ${longDate(iso)}가 아닙니다.`);
  }
  if (!html.includes(`<meta property="article:published_time" content="${PUBLISHED}">`)) {
    fail(`${animal} published_time이 보존되지 않았습니다.`);
  }
  if (!html.includes(`<meta property="article:modified_time" content="${iso}">`)) {
    fail(`${animal} modified_time이 ${iso}가 아닙니다.`);
  }
  if (!html.includes(`aria-current="page">${name}</a>`)) fail(`${animal} 현재 페이지 표시가 없습니다.`);
  if (!html.includes(`href="/signs/${animal}/"`)) fail(`${animal} 에버그린 가이드 링크가 없습니다.`);
  const words = articleWords(html);
  if (words < 520) fail(`${animal} 본문이 짧습니다 (${words}단어).`);
  const headings = [...html.matchAll(/<h2>(.*?)<\/h2>/g)].map((match) => match[1]);
  const expectedHeadings = [
    `Today's ${name} snapshot`,
    "Work and practical decisions",
    "Money and everyday choices",
    "Love, friendship, and communication",
    "Wellbeing and daily rhythm",
    "Best timing for the day",
    `Today&#x27;s ${name} checklist`,
    "More daily zodiac readings",
  ];
  if (headings.join("|") !== expectedHeadings.join("|")) {
    fail(`${animal} 소제목이 라이브와 다릅니다: ${headings.join(" | ")}`);
  }
  const data = jsonScripts(html)[0];
  const page = data["@graph"].find((node) => node["@type"] === "WebPage");
  const article = data["@graph"].find((node) => node["@type"] === "Article");
  if (page.dateModified !== iso) fail(`${animal} WebPage dateModified가 ${page.dateModified}입니다.`);
  if (article.dateModified !== iso) fail(`${animal} Article dateModified가 ${article.dateModified}입니다.`);
  if (article.datePublished !== PUBLISHED) fail(`${animal} datePublished가 바뀌었습니다.`);
  if (!article.headline.includes(name)) fail(`${animal} headline이 이상합니다.`);
  const style = html.match(/<style>[\s\S]*?<\/style>/)[0];
  if (sha256(style) !== STYLE_HASH) fail(`${animal} CSS가 바뀌었습니다.`);
  const nav = html.match(/<nav>[\s\S]*?<\/nav>/)[0];
  if (!nav.includes('<a href="/zodiac/ox/">Daily Zodiac</a>')) fail(`${animal} 내비게이션이 바뀌었습니다.`);
  if (!html.includes("Horoscopes are for entertainment and personal reflection.")) {
    fail(`${animal} 면책 문구가 없습니다.`);
  }
}

function checkHome(html, iso) {
  if ((html.match(/<ins/g) || []).length !== 1) fail("홈 광고 슬롯 수가 바뀌었습니다.");
  if (!html.includes("ca-pub-4963638838326204")) fail("홈 AdSense 클라이언트가 없습니다.");
  if (!html.includes(`Updated for ${iso}`)) fail("홈 Updated for 날짜가 맞지 않습니다.");
  if (!html.includes('<link rel="canonical" href="https://todoyhoroscope.com/">')) fail("홈 canonical이 바뀌었습니다.");
  const headings = [...html.matchAll(/<h2>(.*?)<\/h2>/g)].map((match) => match[1]);
  const expected = [
    "How to use today's Chinese zodiac horoscope",
    "Daily readings for all 12 Chinese zodiac signs",
    "Evergreen guides for every sign",
  ];
  if (headings.join("|") !== expected.join("|")) fail(`홈 소제목이 바뀌었습니다: ${headings.join(" | ")}`);
  for (const animal of ANIMALS) {
    if (!html.includes(`href="/zodiac/${animal}/"`)) fail(`홈에 ${animal} 링크가 없습니다.`);
  }
  const blurbs = html.match(/<!-- daily-sign-blurbs:start -->([\s\S]*?)<!-- daily-sign-blurbs:end -->/);
  if (!blurbs) fail("홈 일일 요약 영역이 없습니다.");
  const blocks = blurbs[1].split("<p>").filter((part) => part.trim());
  if (blocks.length !== 12) fail(`홈 일일 요약이 12개가 아닙니다 (${blocks.length}).`);
  const data = jsonScripts(html)[0];
  const page = data["@graph"].find((node) => node["@type"] === "WebPage");
  if (page.dateModified !== iso) fail(`홈 dateModified가 ${page.dateModified}입니다.`);
  const style = html.match(/<style>[\s\S]*?<\/style>/)[0];
  if (sha256(style) !== STYLE_HASH) fail("홈 CSS가 바뀌었습니다.");
}

function checkSitemap(xml, iso) {
  const withDates = [...xml.matchAll(/<loc>([^<]+)<\/loc>\s*<lastmod>([^<]+)<\/lastmod>/g)];
  if (withDates.length !== 13) fail(`lastmod가 있는 URL이 ${withDates.length}개입니다.`);
  const locs = withDates.map((match) => match[1]);
  if (!locs.includes("https://todoyhoroscope.com/")) fail("sitemap 홈 lastmod가 없습니다.");
  for (const animal of ANIMALS) {
    if (!locs.includes(`https://todoyhoroscope.com/zodiac/${animal}/`)) {
      fail(`sitemap에 ${animal} lastmod가 없습니다.`);
    }
  }
  for (const match of withDates) {
    if (match[2] !== iso) fail(`${match[1]} lastmod가 ${match[2]}입니다.`);
  }
  if (xml.includes("<lastmod>") && (xml.match(/<lastmod>/g) || []).length !== 13) {
    fail("lastmod 개수가 13이 아닙니다.");
  }
  for (const evergreen of [
    "https://todoyhoroscope.com/signs/rat/",
    "https://todoyhoroscope.com/guides/chinese-zodiac-signs/",
    "https://todoyhoroscope.com/tools/chinese-zodiac-sign-finder/",
  ]) {
    const block = xml.split(`<loc>${evergreen}</loc>`)[1]?.slice(0, 180) || "";
    if (block.includes("<lastmod>")) fail(`${evergreen}에 lastmod가 새로 생겼습니다.`);
  }
}

function checkVariety(iso) {
  const readings = composeAll(iso);
  const perAnimal = readings.map((reading) => sentencesOf(renderBody(reading)));
  for (let left = 0; left < perAnimal.length; left += 1) {
    for (let right = left + 1; right < perAnimal.length; right += 1) {
      const shared = perAnimal[left].filter((sentence) => perAnimal[right].includes(sentence));
      if (shared.length) {
        fail(`${readings[left].id}와 ${readings[right].id}가 같은 문장을 씁니다: ${shared[0]}`);
      }
    }
  }
  for (const animal of ANIMALS) {
    const seen = new Set();
    for (const date of walkDates(iso, 90)) {
      const reading = composeAll(date).find((item) => item.id === animal);
      const body = renderBody(reading);
      if (seen.has(body)) fail(`${animal} 본문이 90일 안에 반복됩니다 (${date}).`);
      seen.add(body);
    }
    const today = renderBody(composeAll(iso).find((item) => item.id === animal));
    const tomorrow = renderBody(composeAll(nextIso(iso)).find((item) => item.id === animal));
    if (today === tomorrow) fail(`${animal}의 오늘과 내일이 같습니다.`);
  }
}

function checkIdempotent(iso) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "horoscope-"));
  fs.cpSync(ROOT, temp, {
    recursive: true,
    filter: (source) => {
      const relative = path.relative(ROOT, source);
      return relative === "" || (!relative.startsWith(".git") && !relative.startsWith("node_modules"));
    },
  });
  generate(temp, iso);
  const daily = ["index.html", "sitemap.xml", ...ANIMALS.map((animal) => `zodiac/${animal}/index.html`)];
  for (const relative of daily) {
    if (!sameFileBytes(ROOT, temp, relative)) fail(`같은 날짜로 다시 생성하면 ${relative}이 달라집니다.`);
  }
  const tomorrow = nextIso(iso);
  generate(temp, tomorrow);
  for (const relative of daily) {
    if (sameFileBytes(ROOT, temp, relative)) fail(`다음 날 생성 뒤에도 ${relative}이 그대로입니다.`);
  }
  const hashes = JSON.parse(read("scripts/fixtures/static-hashes.json"));
  for (const relative of Object.keys(hashes)) {
    if (!sameFileBytes(ROOT, temp, relative)) fail(`날짜를 바꿔도 건드려선 안 되는 파일입니다: ${relative}`);
  }
  const sample = fs.readFileSync(path.join(temp, "zodiac/rat/index.html"), "utf8");
  if (!sample.includes(`Updated for ${tomorrow}`)) fail("다음 날 샘플 날짜가 반영되지 않았습니다.");
  fs.rmSync(temp, { recursive: true, force: true });
}

function renderedMatchesFiles(iso) {
  const readings = composeAll(iso);
  for (const reading of readings) {
    const current = read(`zodiac/${reading.id}/index.html`);
    if (applyZodiacPage(current, reading) !== current) fail(`${reading.id} 파일이 생성기 결과와 다릅니다.`);
  }
  const sitemap = read("sitemap.xml");
  if (applySitemap(sitemap, iso) !== sitemap) fail("sitemap이 생성기 결과와 다릅니다.");
}

function main() {
  const home = read("index.html");
  const updated = home.match(/Updated for (\d{4}-\d{2}-\d{2})/);
  if (!updated) {
    fail("홈에 Updated for 날짜가 없습니다.");
    console.error(failures.join("\n"));
    process.exit(1);
  }
  const iso = updated[1];
  checkStaticHashes();
  checkOutlines(home);
  checkHome(home, iso);
  checkSitemap(read("sitemap.xml"), iso);
  for (const animal of ANIMALS) checkPage(animal, read(`zodiac/${animal}/index.html`), iso);
  checkVariety(iso);
  renderedMatchesFiles(iso);
  checkIdempotent(iso);
  if (failures.length) {
    console.error(failures.join("\n"));
    process.exit(1);
  }
  const ratWords = articleWords(read("zodiac/rat/index.html"));
  console.log(`ok ${iso} rat-words=${ratWords}`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main();
