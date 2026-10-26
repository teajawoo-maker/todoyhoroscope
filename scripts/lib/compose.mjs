import { ANIMALS } from "./animals/index.mjs";
import { editorialDate } from "./dates.mjs";
import { dealOne, pickFresh, pickPairFresh } from "./rng.mjs";
import {
  ACTIONS,
  actionFrames,
  advantageFrames,
  cautionCheckFrames,
  CLOSE_CHECKS,
  closingFrames,
  CUES,
  cueFrames,
  FOLLOWS,
  METHODS,
  MONEY_CHECKS,
  OPENERS,
  promptFrames,
  TAILS,
  themeCheckFrames,
  themeFrames,
  THEMES,
  URGENCY,
} from "./shared.mjs";

const PARAGRAPH_KEYS = ["work", "money", "love", "wellbeing", "timing"];

function lintAnimals() {
  const expected = ["rat", "ox", "tiger", "rabbit", "dragon", "snake", "horse", "goat", "monkey", "rooster", "dog", "pig"];
  const ids = ANIMALS.map((animal) => animal.id);
  if (ids.join(",") !== expected.join(",")) {
    throw new Error(`띠 순서가 라이브 사이트와 다릅니다: ${ids.join(",")}`);
  }
  const seen = new Map();
  for (const animal of ANIMALS) {
    for (const key of ["strengths", "cautions", "checks", "home", ...PARAGRAPH_KEYS]) {
      const list = animal[key];
      if (!Array.isArray(list) || list.length < 6) {
        throw new Error(`${animal.id}.${key} 문구가 부족합니다.`);
      }
      for (const phrase of list) {
        if (typeof phrase !== "string" || phrase.trim() !== phrase || phrase.length < 20) {
          throw new Error(`${animal.id}.${key} 문구가 너무 짧거나 공백이 이상합니다.`);
        }
        if (phrase.includes("<") || phrase.includes(">") || phrase.includes("At the end of the day")) {
          throw new Error(`${animal.id}.${key} 문구에 HTML이나 고정 문장이 있습니다.`);
        }
        if (key === "home" && !phrase.includes("{theme}")) {
          throw new Error(`${animal.id} 홈 문장에 {theme}이 없습니다.`);
        }
        if (PARAGRAPH_KEYS.includes(key) && phrase.split(/\s+/).length < 12) {
          throw new Error(`${animal.id}.${key} 문장이 얇습니다: ${phrase}`);
        }
        const owner = seen.get(phrase);
        if (owner) {
          throw new Error(`문구가 겹칩니다 (${owner} / ${animal.id}): ${phrase.slice(0, 80)}`);
        }
        seen.set(phrase, `${animal.id}.${key}`);
      }
    }
  }
}

lintAnimals();

export function escapeHtml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

export function composeAnimal(animal, index, iso, long) {
  const theme = dealOne(THEMES, iso, "themes", index);
  const opener = dealOne(OPENERS, iso, "openers", index);
  const themeFrame = dealOne(themeFrames, iso, "theme-frames", index);
  const strength = pickFresh(animal.strengths, iso, `${animal.id}:strength`);
  const caution = pickFresh(animal.cautions, iso, `${animal.id}:caution`);
  const advantageFrame = dealOne(advantageFrames, iso, "advantage-frames", index);
  const cue = dealOne(CUES, iso, "cues", index);
  const method = dealOne(METHODS, iso, "methods", index);
  const urgency = dealOne(URGENCY, iso, "urgency", index);
  const cueFrame = dealOne(cueFrames, iso, "cue-frames", index);
  const action = dealOne(ACTIONS, iso, "actions", index);
  const follow = dealOne(FOLLOWS, iso, "follows", index);
  const actionFrame = dealOne(actionFrames, iso, "action-frames", index);
  const promptFrame = dealOne(promptFrames, iso, "prompt-frames", index);
  const tail = dealOne(TAILS, iso, "tails", index);
  const work = pickPairFresh(animal.work, iso, `${animal.id}:work`);
  const money = pickPairFresh(animal.money, iso, `${animal.id}:money`);
  const love = pickPairFresh(animal.love, iso, `${animal.id}:love`);
  const wellbeing = pickFresh(animal.wellbeing, iso, `${animal.id}:wellbeing`);
  const timing = pickFresh(animal.timing, iso, `${animal.id}:timing`);
  const personalCheck = pickFresh(animal.checks, iso, `${animal.id}:check`);
  const moneyCheck = dealOne(MONEY_CHECKS, iso, "money-checks", index);
  const closeCheck = dealOne(CLOSE_CHECKS, iso, "close-checks", index);
  const cautionCheck = dealOne(cautionCheckFrames, iso, "caution-checks", index);
  const themeCheck = dealOne(themeCheckFrames, iso, "theme-checks", index);
  const closingFrame = dealOne(closingFrames, iso, "closing-frames", index);
  const homeTemplate = pickFresh(animal.home, iso, `${animal.id}:home`);

  return {
    id: animal.id,
    name: animal.name,
    iso,
    long,
    theme,
    themeSentence: themeFrame(theme, opener, iso),
    advantage: advantageFrame(animal.name, strength, caution),
    snapshotLead: `${cueFrame(cue)} ${method} ${urgency}`,
    snapshotAction: actionFrame(action, follow),
    work,
    money,
    love,
    wellbeing,
    timing,
    checks: [
      themeCheck(theme),
      cautionCheck(caution),
      personalCheck,
      moneyCheck,
      closeCheck,
    ],
    prompt: promptFrame(cue),
    closing: `${closingFrame(animal.name, strength)} ${tail}`,
    homeSentence: homeTemplate.replaceAll("{theme}", theme),
  };
}

export function composeAll(iso) {
  const date = editorialDate(new Date(), iso);
  return ANIMALS.map((animal, index) => composeAnimal(animal, index, date.iso, date.long));
}

export function renderBody(reading) {
  const text = escapeHtml;
  return `      <p><strong>Daily theme:</strong> ${text(reading.themeSentence)}</p>
<p>${text(reading.advantage)}</p>

<h2>Today's ${reading.name} snapshot</h2>
<p>${text(reading.snapshotLead)}</p>
<p>${text(reading.snapshotAction)}</p>

<h2>Work and practical decisions</h2>
<p>${text(reading.work[0])}</p>
<p>${text(reading.work[1])}</p>

<h2>Money and everyday choices</h2>
<p>${text(reading.money[0])}</p>
<p>${text(reading.money[1])}</p>
<p>This horoscope offers general reflection only and is not financial advice.</p>

<h2>Love, friendship, and communication</h2>
<p>${text(reading.love[0])}</p>
<p>${text(reading.love[1])}</p>

<h2>Wellbeing and daily rhythm</h2>
<p>${text(reading.wellbeing)}</p>
<p>Pay attention to ordinary signals such as hunger, fatigue, tension, and overstimulation. A horoscope cannot diagnose or treat a health concern. Use qualified medical help for symptoms or decisions that need professional care.</p>

<h2>Best timing for the day</h2>
<p>${text(reading.timing)}</p>

<h2>Today&#x27;s ${reading.name} checklist</h2>
<ul>
  <li>${text(reading.checks[0])}</li>
  <li>${text(reading.checks[1])}</li>
  <li>${text(reading.checks[2])}</li>
  <li>${text(reading.checks[3])}</li>
  <li>${text(reading.checks[4])}</li>
</ul>
<p><strong>Reflection prompt:</strong> ${text(reading.prompt)}</p>
<p>At the end of the day, ${text(reading.closing)}</p>`;
}

export function renderBlurbs(readings) {
  return readings
    .map(
      (reading) =>
        `<p><strong>${escapeHtml(reading.name)}.</strong> ${escapeHtml(reading.homeSentence)} <a href="/zodiac/${reading.id}/">Read the full ${escapeHtml(reading.name)} horoscope for ${escapeHtml(reading.long)}</a>.</p>`,
    )
    .join("\n");
}
