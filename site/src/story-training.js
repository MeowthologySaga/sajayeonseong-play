export const STORY_TRAINING_STORAGE_KEY = "sajayeonseong-story-v1";

export const STORY_TRAINING_EVENT = Object.freeze({
  MATCH: "match",
  COMBO: "combo",
  QUEUE: "queue",
  IDIOM: "idiom",
  GUARDED_HIT: "guarded-hit",
  JOURNEY_OPENED: "journey-opened"
});

// Story lessons can point at one of the ordinary in-game idioms.  Keeping the
// target here lets the UI lesson and the saved objective share the same ID.
export const STORY_TRAINING_IDIOM_TARGET_IDS = Object.freeze({
  "four-letter-power": "twoBirds"
});

export const STORY_TRAINING_GUARD_LESSONS = Object.freeze({
  "read-the-intent": Object.freeze({
    chapterId: "read-the-intent",
    requiredElement: "earth",
    intentId: "story-stump-strike",
    intentName: "등걸 내려치기",
    damage: 7,
    responseHint: "토 매치로 보호막 생성"
  })
});

export function getStoryTrainingGuardLesson(chapterId) {
  return STORY_TRAINING_GUARD_LESSONS[chapterId] || null;
}

export function evaluateStoryTrainingGuardHit({ chapterId, intentId, absorbed, hpDamage } = {}) {
  const lesson = getStoryTrainingGuardLesson(chapterId);
  const absorbedAmount = Number(absorbed);
  const hpDamageAmount = Number(hpDamage);
  const isComplete = Boolean(lesson)
    && intentId === lesson.intentId
    && Number.isFinite(absorbedAmount)
    && absorbedAmount >= lesson.damage
    && Number.isFinite(hpDamageAmount)
    && hpDamageAmount === 0;
  return { type: STORY_TRAINING_EVENT.GUARDED_HIT, count: isComplete ? 1 : 0 };
}

function freezeChapter(chapter) {
  const objective = { ...chapter.objective };
  if (Array.isArray(objective.targets)) objective.targets = Object.freeze([...objective.targets]);
  return Object.freeze({ ...chapter, objective: Object.freeze(objective) });
}

export const STORY_TRAINING_CHAPTERS = Object.freeze([
  freezeChapter({ id: "disaster-gate", number: 1, title: "재앙의 문", objective: { event: STORY_TRAINING_EVENT.MATCH, target: 1, mode: "sum" } }),
  freezeChapter({ id: "five-lights", number: 2, title: "다섯 빛", objective: { event: STORY_TRAINING_EVENT.COMBO, target: 2, mode: "max" } }),
  freezeChapter({ id: "gathered-letters", number: 3, title: "모인 글자", objective: { event: STORY_TRAINING_EVENT.QUEUE, target: 2, mode: "unique", targets: ["木", "林"] } }),
  freezeChapter({ id: "four-letter-power", number: 4, title: "네 글자의 힘", objective: { event: STORY_TRAINING_EVENT.IDIOM, target: 1, mode: "unique", targets: [STORY_TRAINING_IDIOM_TARGET_IDS["four-letter-power"]] } }),
  freezeChapter({ id: "read-the-intent", number: 5, title: "적의 예고", objective: { event: STORY_TRAINING_EVENT.GUARDED_HIT, target: 1, mode: "sum" } }),
  freezeChapter({ id: "journey-begins", number: 6, title: "행로의 시작", objective: { event: STORY_TRAINING_EVENT.JOURNEY_OPENED, target: 1, mode: "sum" } })
]);

const CHAPTER_BY_ID = new Map(STORY_TRAINING_CHAPTERS.map((chapter) => [chapter.id, chapter]));

export function createDefaultStoryProgress() {
  return { version: 1, completedChapterIds: [], lastChapterId: null, seenDialogueIds: [], updatedAt: 0 };
}

export function sanitizeStoryProgress(input) {
  const defaults = createDefaultStoryProgress();
  if (!input || typeof input !== "object" || Array.isArray(input)) return defaults;
  const validIds = new Set(STORY_TRAINING_CHAPTERS.map((chapter) => chapter.id));
  const completedChapterIds = [...new Set(Array.isArray(input.completedChapterIds) ? input.completedChapterIds : [])]
    .filter((id) => validIds.has(id));
  const lastChapterId = validIds.has(input.lastChapterId) ? input.lastChapterId : completedChapterIds.at(-1) || null;
  const seenDialogueIds = [...new Set(Array.isArray(input.seenDialogueIds) ? input.seenDialogueIds : [])]
    .filter((id) => typeof id === "string" && id.length <= 80)
    .slice(-100);
  return {
    version: 1,
    completedChapterIds,
    lastChapterId,
    seenDialogueIds,
    updatedAt: Math.max(0, Math.floor(Number(input.updatedAt) || 0))
  };
}

export function createStoryTrainingSession(chapterId = STORY_TRAINING_CHAPTERS[0].id) {
  const chapter = CHAPTER_BY_ID.get(chapterId) || STORY_TRAINING_CHAPTERS[0];
  return {
    chapterId: chapter.id,
    status: "active",
    progress: 0,
    target: chapter.objective.target,
    event: chapter.objective.event,
    collected: []
  };
}

export function applyStoryTrainingEvent(session, event) {
  if (!session || session.status !== "active" || !event || event.type !== session.event) return session ? { ...session } : null;
  const chapter = CHAPTER_BY_ID.get(session.chapterId);
  if (!chapter) return { ...session };
  if (chapter.objective.mode === "unique") {
    const targets = new Set(chapter.objective.targets || []);
    const collected = new Set(Array.isArray(session.collected) ? session.collected : []);
    const values = Array.isArray(event.values) ? event.values : [event.value];
    values.filter((value) => targets.has(value)).forEach((value) => collected.add(value));
    const progress = Math.min(session.target, collected.size);
    return { ...session, collected: [...collected], progress, status: progress >= session.target ? "complete" : "active" };
  }
  const amount = Math.max(0, Number(event.count ?? event.value ?? 1) || 0);
  const progress = chapter.objective.mode === "max"
    ? Math.max(session.progress || 0, amount)
    : (session.progress || 0) + amount;
  const normalized = Math.min(session.target, progress);
  return { ...session, progress: normalized, status: normalized >= session.target ? "complete" : "active" };
}

export function completeStoryTrainingChapter(progress, session, completedAt = Date.now()) {
  const current = sanitizeStoryProgress(progress);
  if (!session || session.status !== "complete" || !CHAPTER_BY_ID.has(session.chapterId)) return current;
  return {
    ...current,
    completedChapterIds: [...new Set([...current.completedChapterIds, session.chapterId])],
    lastChapterId: session.chapterId,
    updatedAt: Math.max(current.updatedAt, Math.floor(Number(completedAt) || 0))
  };
}

export function getStoryTrainingChapter(chapterId) {
  return CHAPTER_BY_ID.get(chapterId) || null;
}

export function isStoryTrainingChapterUnlocked(progress, chapterId) {
  const index = STORY_TRAINING_CHAPTERS.findIndex((chapter) => chapter.id === chapterId);
  if (index < 0) return false;
  if (index === 0) return true;
  const completed = new Set(sanitizeStoryProgress(progress).completedChapterIds);
  return completed.has(STORY_TRAINING_CHAPTERS[index - 1].id);
}

export function getNextStoryTrainingChapterId(progress) {
  const current = sanitizeStoryProgress(progress);
  return STORY_TRAINING_CHAPTERS.find((chapter) => !current.completedChapterIds.includes(chapter.id)
    && isStoryTrainingChapterUnlocked(current, chapter.id))?.id || null;
}
