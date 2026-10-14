import { dayNumber, previousIso } from "./dates.mjs";

// 날짜와 띠 이름을 씨앗으로 쓰는 결정적 난수입니다. 같은 날에는 항상 같은 글이 나옵니다.
export function hashString(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function mulberry32(seed) {
  let state = seed >>> 0;
  return function rng() {
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle(list, salt) {
  const copy = list.slice();
  const random = mulberry32(hashString(String(salt)));
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
}

// 같은 날 12띠가 서로 다른 문장을 받도록, 날짜만큼 밀어 가며 나눕니다.
export function dealOne(list, iso, salt, index) {
  if (list.length < 12) {
    throw new Error(`${salt} 문구는 12개 이상이어야 합니다.`);
  }
  const ordered = shuffle(list, salt);
  return ordered[(dayNumber(iso) + index) % ordered.length];
}

function pickN(list, iso, salt, count) {
  if (list.length < count) {
    throw new Error(`${salt} 문구가 부족합니다.`);
  }
  const copy = list.slice();
  const random = mulberry32(hashString(`${iso}:${salt}`));
  const chosen = [];
  for (let index = 0; index < count; index += 1) {
    const pick = Math.floor(random() * copy.length);
    chosen.push(copy.splice(pick, 1)[0]);
  }
  return chosen;
}

function sameSet(left, right) {
  return left.length === right.length && left.every((item) => right.includes(item));
}

// 어제와 같은 조합이 나오면 한 칸 밀어, 바로 옆 날짜와 글이 겹치지 않게 합니다.
export function pickFresh(list, iso, salt) {
  const today = pickN(list, iso, salt, 1)[0];
  const yesterday = pickN(list, previousIso(iso), salt, 1)[0];
  if (today !== yesterday) return today;
  const index = list.indexOf(today);
  return list[(index + 1) % list.length];
}

export function pickPairFresh(list, iso, salt) {
  let pair = pickN(list, iso, salt, 2);
  const yesterday = pickN(list, previousIso(iso), salt, 2);
  if (!sameSet(pair, yesterday)) return pair;
  pair = pickN(list, iso, `${salt}:shift`, 2);
  if (!sameSet(pair, yesterday)) return pair;
  const index = list.indexOf(yesterday[0]);
  return [list[(index + 2) % list.length], list[(index + 3) % list.length]];
}
