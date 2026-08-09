import { AUDIO_MANIFEST, buildAct1EntryCadence, buildIdiomSpecs, describeIdiomEffectSpec, ELEMENT_AFFINITIES, ENCOUNTER_CATALOG, EVENT_CATALOG, RELIC_CATALOG, RUN_CONTENT } from "./src/content.js?v=20260809-final-audit-1";
import { ASSET_MANIFEST } from "./src/assets.js?v=20260809-submission-polish-3";
import { AudioDirector } from "./src/audio.js?v=20260809-master-2";
import { interpolateGridPath } from "./src/drag-path.js?v=20260807-drag-1";
import { findElementMatches } from "./src/match-groups.js?v=20260809-final-audit-1";
import { calculateElementProcChance, ELEMENT_PROC_RULES, formatProcPercent, rollElementProc } from "./src/element-procs.js?v=20260807-procs-1";
import { BATTLE_DISPLAY_STORAGE_KEY, getBattleFeedbackDuration, getIdiomCastTiming, IDIOM_SPEED_STORAGE_KEY, normalizeBattleDisplay, normalizeIdiomSpeed } from "./src/presentation-settings.js?v=20260809-master-2";
import { buildIdiomFocusEntries, chooseFocusedIdiomEntry, getIdiomFocusRovingIndex } from "./src/idiom-focus.js?v=20260808-early-feedback-3";
import { buildCharacterVolumes, buildRunCharacterPool, chooseRotatingRecipes, createRunRoute, createSeededRng, pickWithRng, randomFrom, RUN_LIMITS, shuffleWithRng, validateGameCatalog } from "./src/run-engine.js?v=20260808-balance-economy-1";
import { decodeRunSave, describeRunSaveStage, encodeRunSave, RUN_SAVE_KEY } from "./src/save.js?v=20260808-save-3";
import { buildReviveCharacterPool, passesReviveTrace, scoreReviveTrace } from "./src/revive.js?v=20260807-revive-3";
import { chooseEmergencyIdiom, claimRunTrigger, findRunRelicEffect, RUNTIME_RELIC_EFFECT_TYPES } from "./src/relics.js?v=20260807-relics-1";
import { createRewardBuildSnapshot, evaluateRewardSynergy } from "./src/reward-synergy.js?v=20260808-reward-synergy-2";
import { awardTalismanPieces, createDefaultJaryeongMetaState, exchangeTalismanPiecesForSummonTicket, getJaryeongRarity, getPreparedJaryeongParty, JARYEONG_SUMMON_RARITY_WEIGHTS, resetTargetFragmentPity, sanitizeJaryeongMetaState, setEquippedJaryeongParty, summonRandomJaryeong, TALISMAN_PIECES_PER_SUMMON_TICKET } from "./src/jaryeong-meta.js?v=20260809-random-summon-1";
import { selectBackgroundForScene } from "./src/background-rotation.js?v=20260807-background-rotation-1";
import { applyCombatObjectiveEvent, COMBAT_OBJECTIVE_EVENT, COMBAT_OBJECTIVE_TYPE, isCombatObjectiveComplete, normalizeCombatObjectiveState, resolveCombatObjectiveReward, selectCombatObjective } from "./src/combat-objectives.js?v=20260808-turn-resilience-1";
import { advanceRareEncounterTurn, calculateIdiomWeaknessBonus, createRareEncounterState, deterministicRareRoll, RARE_GIMMICKS, rollRareEncounter } from "./src/rare-encounters.js?v=20260808-rare-1";
import { advanceFirstBattleOnboarding, createFirstBattleOnboarding, FIRST_BATTLE_ONBOARDING_EVENT, getCurrentFirstBattleHint, getFirstBattleCoachProgress, issueFirstBattleOnboardingGrants } from "./src/first-battle-onboarding.js?v=20260808-first-battle-3";
import { getBossTurnPlan, resolveBossBoardEffect } from "./src/boss-patterns.js?v=20260809-submission-polish-3";
import { calculateElementMatchAttack, capJaryeongSkillDamage, MAX_JARYEONG_DAMAGE_RATIO } from "./src/jaryeong-build-balance.js?v=20260808-build-balance-1";
import { STORY_TRAINING_CHAPTERS, STORY_TRAINING_EVENT, STORY_TRAINING_IDIOM_TARGET_IDS, STORY_TRAINING_STORAGE_KEY, applyStoryTrainingEvent, completeStoryTrainingChapter, createDefaultStoryProgress, createStoryTrainingSession, evaluateStoryTrainingGuardHit, getNextStoryTrainingChapterId, getStoryTrainingChapter, getStoryTrainingGuardLesson, isStoryTrainingChapterUnlocked, sanitizeStoryProgress } from "./src/story-training.js?v=20260809-master-2";

(function () {
  "use strict";

  let ROWS = 5;
  let COLS = 6;
  const MOVE_SECONDS = 5;
  const BASE_PLAYER_HP = 115;
  const PANG_SECONDS = 60;
  const PANG_MAX_TIME = 75;
  const PANG_QUEUE_MAX = 12;
  const MAX_QUEUE = RUN_LIMITS.baseQueueMax;
  const IDIOM_RECIPE_COUNT = 3;
  const IDIOM_RECIPE_MIN_TURNS = 3;
  const IDIOM_RECIPE_MAX_TURNS = 7;
  const BURN_DURATION_TURNS = 3;
  const FIRE_PROC_BURN_PER_UNIT = 2;
  const INITIAL_IDIOM_DRAFT_COUNT = RUN_LIMITS.initialIdiomCount;
  const READING_MODE_KEY = "sajayeonseong-reading-mode-v4";
  const IDIOM_DISPLAY_MODE_KEY = "sajayeonseong-idiom-display-v4";
  const PRODUCTION_BUILD = true;
  const ELEMENTS = [
    { id: "wood", symbol: "木", label: "목" },
    { id: "fire", symbol: "火", label: "화" },
    { id: "earth", symbol: "土", label: "토" },
    { id: "metal", symbol: "金", label: "금" },
    { id: "water", symbol: "水", label: "수" }
  ];
  const DATASET = window.SAJAYEONSEONG_DATA || { version: "fallback", characters: [], idioms: [] };
  const HUN_EUM_DATA = window.SAJAYEONSEONG_HUN_EUM || { records: {} };
  // 전체 1,135자·75성어를 해금 대상으로 사용한다. 실제 한 런은 선택한
  // 문자권과 장착 성어의 필수 한자만 합쳐 90~140자로 제한한다.
  const DATASET_ROLLOUT = Object.freeze({
    activeCharacterLimit: null,
    activeIdiomHanja: null
  });
  const PANG_IDIOM_HANJA = ["一心同體", "一葉知秋", "心機一轉", "轉禍爲福", "一石二鳥", "知彼知己"];
  const ELEMENT_RULES = Object.freeze({
    wood: { damage: 8, label: "목", effect: ELEMENT_PROC_RULES.wood.effect },
    fire: { damage: 12, label: "화", effect: ELEMENT_PROC_RULES.fire.effect },
    earth: { damage: 7, label: "토", effect: ELEMENT_PROC_RULES.earth.effect },
    metal: { damage: 9, label: "금", effect: ELEMENT_PROC_RULES.metal.effect },
    water: { damage: 7, label: "수", effect: ELEMENT_PROC_RULES.water.effect }
  });
  const ELEMENT_SYNERGIES = Object.freeze([
    { from: "water", to: "wood", label: "水→木", text: "다음 목 회복 확률·회복량 증가", buff: "wood" },
    { from: "wood", to: "fire", label: "木→火", text: "다음 화상 확률·중첩 증가", buff: "fire" },
    { from: "fire", to: "earth", label: "火→土", text: "다음 토 보호막 확률·획득량 증가", buff: "earth" },
    { from: "earth", to: "metal", label: "土→金", text: "다음 금 관통 확률·위력 증가", buff: "metal" },
    { from: "metal", to: "water", label: "金→水", text: "다음 수 지연 발동률 증가", buff: "water" }
  ]);
  const FALLBACK_READINGS = {
    轉: "구를 전", 禍: "재앙 화", 爲: "할 위", 福: "복 복",
    一: "한 일", 石: "돌 석", 二: "두 이", 鳥: "새 조",
    有: "있을 유", 備: "갖출 비", 無: "없을 무", 患: "근심 환",
    天: "하늘 천", 地: "땅 지", 人: "사람 인", 心: "마음 심",
    力: "힘 력", 生: "날 생", 死: "죽을 사", 光: "빛 광",
    暗: "어두울 암", 山: "메 산", 川: "내 천", 風: "바람 풍",
    雨: "비 우", 雷: "우레 뢰", 龍: "용 룡", 鬼: "귀신 귀", 門: "문 문"
  };
  // 데이터셋의 reading은 음(예: 讀 → 독)만 담길 수 있으므로, 훈음이 없는
  // 글자는 이 보완표를 사용한다. 이후 데이터에 hunEum/radicalHunEum이
  // 들어오면 아래 DATASET_HUN_EUM에서 자동으로 우선 반영한다.
  const FALLBACK_HUN_EUM = {
    天: "하늘 천", 地: "땅 지", 玄: "검을 현", 黃: "누를 황", 宇: "집 우", 宙: "집 주", 洪: "넓을 홍", 荒: "거칠 황",
    日: "날 일", 月: "달 월", 盈: "찰 영", 昃: "기울 측", 辰: "별 진", 宿: "잘 숙", 列: "벌일 렬", 張: "베풀 장",
    寒: "찰 한", 來: "올 래", 暑: "더울 서", 往: "갈 왕", 秋: "가을 추", 收: "거둘 수", 冬: "겨울 동", 藏: "감출 장",
    閏: "윤달 윤", 餘: "남을 여", 成: "이룰 성", 歲: "해 세", 律: "법 률", 呂: "음률 려", 調: "고를 조", 陽: "볕 양",
    雲: "구름 운", 騰: "오를 등", 致: "이를 치", 雨: "비 우", 露: "이슬 로", 結: "맺을 결", 爲: "할 위", 霜: "서리 상", 土: "흙 토",
    金: "쇠 금", 生: "날 생", 麗: "고울 려", 水: "물 수", 玉: "구슬 옥", 出: "날 출", 崑: "산 이름 곤", 岡: "산등성이 강",
    劍: "칼 검", 號: "이름 호", 巨: "클 거", 闕: "대궐 궐", 珠: "구슬 주", 稱: "일컬을 칭", 夜: "밤 야", 光: "빛 광",
    果: "열매 과", 珍: "보배 진", 李: "오얏 리", 柰: "능금나무 내", 菜: "나물 채", 重: "무거울 중", 芥: "겨자 개", 薑: "생강 강",
    海: "바다 해", 鹹: "짤 함", 河: "물 하", 淡: "묽을 담", 鱗: "비늘 린", 潛: "잠길 잠", 羽: "깃 우", 翔: "날 상",
    龍: "용 룡", 師: "스승 사", 火: "불 화", 帝: "임금 제", 鳥: "새 조", 官: "벼슬 관", 人: "사람 인", 皇: "임금 황",
    始: "비로소 시", 制: "지을 제", 文: "글월 문", 字: "글자 자", 乃: "이에 내", 服: "옷 복", 衣: "옷 의", 裳: "치마 상",
    推: "밀 추", 位: "자리 위", 讓: "사양할 양", 國: "나라 국", 有: "있을 유", 虞: "생각할 우", 陶: "질그릇 도", 唐: "당나라 당",
    弔: "조상할 조", 民: "백성 민", 伐: "칠 벌", 罪: "허물 죄", 周: "두루 주", 發: "필 발", 殷: "성할 은", 湯: "끓일 탕",
    坐: "앉을 좌", 朝: "아침 조", 問: "물을 문", 道: "길 도", 垂: "드리울 수", 拱: "두 손 맞잡을 공", 平: "평평할 평", 章: "글 장",
    愛: "사랑 애", 育: "기를 육", 黎: "검을 려", 首: "머리 수", 臣: "신하 신", 伏: "엎드릴 복", 戎: "오랑캐 융", 羌: "오랑캐 강",
    遐: "멀 하", 邇: "가까울 이", 壹: "한 일", 體: "몸 체", 率: "거느릴 솔", 賓: "손 빈", 歸: "돌아갈 귀", 王: "임금 왕",
    鳴: "울 명", 鳳: "봉황새 봉", 在: "있을 재", 樹: "나무 수", 白: "흰 백", 駒: "망아지 구", 食: "먹을 식", 場: "마당 장",
    化: "될 화", 被: "입을 피", 草: "풀 초", 木: "나무 목", 賴: "힘입을 뢰", 及: "미칠 급", 萬: "일만 만", 方: "모 방",
    蓋: "덮을 개", 此: "이 차", 身: "몸 신", 髮: "터럭 발", 四: "넉 사", 大: "큰 대", 五: "다섯 오", 常: "항상 상",
    恭: "공손할 공", 惟: "생각할 유", 鞠: "기를 국", 養: "기를 양", 豈: "어찌 기", 敢: "감히 감", 毁: "헐 훼", 傷: "다칠 상",
    同: "한가지 동", 葉: "잎 엽", 知: "알 지", 機: "틀 기", 體: "몸 체", 彼: "저 피", 己: "몸 기", 牛: "소 우", 經: "지날 경",
    讀: "읽을 독", 獨: "홀로 독", 石: "돌 석", 二: "두 이", 福: "복 복", 門: "문 문", 心: "마음 심", 力: "힘 력",
    死: "죽을 사", 山: "메 산", 川: "내 천", 風: "바람 풍", 雷: "우레 뢰", 鬼: "귀신 귀",
    一: "한 일", 心: "마음 심", 同: "한가지 동", 葉: "잎 엽", 知: "알 지", 言: "말씀 언", 千: "일천 천", 意: "뜻 의",
    石: "돌 석", 二: "두 이", 彼: "저 피", 己: "몸 기", 器: "그릇 기", 晚: "늦을 만", 過: "지날 과", 猶: "오히려 유",
    不: "아닐 불", 易: "바꿀 역", 思: "생각 사", 之: "갈 지", 異: "다를 이", 口: "입 구", 聲: "소리 성", 以: "써 이",
    交: "사귈 교", 林: "수풀 림", 森: "수풀 삼",
    傳: "전할 전", 里: "마을 리", 積: "쌓을 적", 累: "여러 루", 少: "적을 소", 多: "많을 다", 小: "작을 소", 無: "없을 무",
    用: "쓸 용", 物: "물건 물", 公: "공평할 공", 明: "밝을 명", 正: "바를 정", 高: "높을 고", 馬: "말 마", 肥: "살찔 비",
    者: "사람 자", 解: "풀 해", 溫: "따뜻할 온", 故: "옛 고", 新: "새 신", 禍: "재앙 화", 福: "복 복", 右: "오른 우",
    左: "왼 좌", 自: "스스로 자", 業: "업 업", 得: "얻을 득", 面: "낯 면", 楚: "초나라 초", 歌: "노래 가", 百: "일백 백", 中: "가운데 중"
  };
  const LEGACY_EXTRA_CHARS = [..."天地人心力生死光暗山川風雨雷龍鬼門"];
  const DATASET_CHARACTERS = Array.isArray(DATASET.characters) ? DATASET.characters
    .filter((entry) => entry?.hanja && entry?.reading)
    .map((entry) => ({ ...entry, ...(HUN_EUM_DATA.records?.[entry.hanja] || {}) })) : [];
  const DATASET_HUN_EUM = Object.fromEntries(DATASET_CHARACTERS
    .map((entry) => [entry.hanja, entry.hunEum || entry.hun_eum || entry.radicalHunEum || entry.radical_hun_eum])
    .filter(([, hunEum]) => hunEum));
  const HANJA_READINGS = {
    ...Object.fromEntries(DATASET_CHARACTERS.map((entry) => [entry.hanja, entry.reading])),
    ...DATASET_HUN_EUM,
    ...FALLBACK_READINGS,
    ...FALLBACK_HUN_EUM
  };
  const CHARACTER_BY_HANJA = new Map(DATASET_CHARACTERS.map((entry) => [entry.hanja, entry]));
  const LEGACY_IDIOM_ROWS = [
    { hanja: "轉禍爲福", reading: "전화위복", meaning: "재앙이 바뀌어 복이 됨", category: "위기·역전", tier: "희귀" },
    { hanja: "一石二鳥", reading: "일석이조", meaning: "한 가지 일로 두 가지 이익을 얻음", category: "지혜·판단", tier: "중급" },
    { hanja: "知彼知己", reading: "지피지기", meaning: "상대와 자신을 모두 잘 앎", category: "전쟁·승부", tier: "중급" }
  ];
  // 사자성어는 이름만 모은 목록이 아니라, 뜻에 맞는 효과 ID·역할·설명을
  // 함께 가진 데이터로 관리한다. 새 성어를 추가할 때 전투 로직을 복사하지
  // 않고 이 표와 효과 핸들러만 연결하면 된다.
  const IDIOM_EFFECT_LIBRARY = Object.freeze({
    "一心同體": { id: "oneMind", role: "방어·연대", desc: "보호막 8 · 큐의 중복 글자 종류마다 보호막 3", effect: "한마음의 결계가 큐를 감쌉니다" },
    "心機一轉": { id: "resetMind", role: "정화·회복", desc: "약화 하나를 지우고 체력 12 회복 · 제거 시 다음 이동시간 증가", effect: "마음이 한 번 돌아 생명력이 이어집니다" },
    "一葉知秋": { id: "leafSignal", role: "예측·제어", desc: "적 행동 1턴 지연 · 다음 약점 공격 피해 +25%", effect: "한 잎의 신호가 적의 행동을 늦춥니다" },
    "一言千金": { id: "oneWordGold", role: "문자 보존·게이지", desc: "사용한 글자 하나를 큐로 되돌리고 해당 자령 게이지 +2", effect: "한마디의 가치가 사라지지 않고 돌아옵니다" },
    "一心一意": { id: "singlePurpose", role: "단일 속성 집중", desc: "이번 턴 최다 속성 피해를 한 번 더 반복 · 단일 속성이면 강화", effect: "한뜻으로 모인 속성이 한 번 더 울립니다" },
    "一石二鳥": { id: "twoBirds", role: "효과 복제", desc: "이번 턴 피해·회복·보호막을 50%만큼 한 번 더 적용", effect: "하나의 성과가 두 번 울려 퍼집니다" },
    "知彼知己": { id: "prepared", role: "대비·방어", desc: "보호막 24 · 다음 적 공격 피해 65% 감소", effect: "다가올 피해를 미리 봉인합니다" },
    "人山人海": { id: "crowd", role: "다수·편성 보상", desc: "큐 글자와 편성 자령 수에 비례한 고정 피해 · 큐가 많으면 보호막", effect: "모인 글자와 자령이 파도를 만듭니다" },
    "大器晚成": { id: "lateBloom", role: "후반 성장", desc: "10 + 현재 턴×3 피해 · 7턴 이후 보호막 추가", effect: "늦게 피는 힘이 전장을 뒤집습니다" },
    "過猶不及": { id: "moderation", role: "적정 콤보 보상", desc: "콤보 구간에 따라 고정 피해와 보호막을 조절", effect: "지나침과 모자람 사이의 힘을 얻습니다" },
    "易地思之": { id: "swapView", role: "상태 역전", desc: "약화를 지우고 적을 2턴 취약하게 함 · 약화가 없으면 양쪽 피해 보정", effect: "서로의 처지를 바꾸어 흐름을 뒤집습니다" },
    "異口同聲": { id: "manyVoices", role: "다속성 공격", desc: "제거한 속성 종류마다 추가 피해 · 3속성이면 게이지 충전", effect: "여러 속성이 한 목소리로 울립니다" },
    "以心傳心": { id: "heartShare", role: "게이지 공유", desc: "가장 높은 자령 게이지를 다른 자령에게 나눔", effect: "말하지 않아도 마음과 게이지가 이어집니다" },
    "一日千里": { id: "thousandLi", role: "속도·추가 제어", desc: "다음 이동시간 +1.25초 · 5콤보 이상이면 적 지연", effect: "하루 천 리의 속도로 다음 수를 준비합니다" },
    "日積月累": { id: "dailyAccumulation", role: "런 누적 성장", desc: "이번 런 누적 스택 +1 · 스택마다 피해 +4%", effect: "매일 쌓인 힘이 런 전체를 키웁니다" },
    "積少成多": { id: "smallToMany", role: "소형 매치 보상", desc: "정확히 3개 매치 그룹마다 피해 6과 보호막 2", effect: "작은 매치가 모여 큰 방패가 됩니다" },
    "大同小異": { id: "mostlySame", role: "보드 정리·속성 집중", desc: "두 번째로 많은 속성 타일 3개를 최다 속성으로 변환", effect: "비슷한 흐름을 하나의 색으로 모읍니다" },
    "無用之物": { id: "discardUseless", role: "큐 정리·자원 전환", desc: "성어에 필요 없는 큐 글자 최대 4개를 피해와 보호막으로 전환", effect: "쓸모없던 글자도 마지막 힘이 됩니다" },
    "有口無言": { id: "silence", role: "침묵·피해 감소", desc: "다음 적 행동의 부가효과를 봉인하고 피해 감소", effect: "말 없는 결계가 적의 수를 막습니다" },
    "一字千金": { id: "oneCharGold", role: "문자 재사용·공명", desc: "사용한 글자 하나를 되돌리고 해당 자령 게이지와 피해를 보탬", effect: "글자 하나가 금처럼 다시 빛납니다" },
    "人生無常": { id: "impermanence", role: "보드·큐 초기화", desc: "보드를 새로 섞고 큐 수명을 초기화 · 약화 제거와 회복", effect: "흐름을 비우고 새로운 판을 엽니다" },
    "公明正大": { id: "fairAndSquare", role: "공정한 고정 피해", desc: "약점·저항·보호를 무시하는 26 고정 피해 · 약화 제거", effect: "흔들리지 않는 공정한 한 수입니다" },
    "天高馬肥": { id: "autumnHarvest", role: "풍요·회복·충전", desc: "체력 14 회복 · 다음 이동시간 증가 · 다음 턴 게이지 보너스", effect: "가을의 풍요가 다음 수를 채웁니다" },
    "結者解之": { id: "untieKnot", role: "해제·반격", desc: "플레이어 약화·타일 봉인·큐 봉인을 제거하고 반격", effect: "맺힌 매듭을 스스로 풀어냅니다" },
    "溫故知新": { id: "learnFromOld", role: "이전 성어 복제", desc: "직전 성어의 기본 효과를 50% 위력으로 반복", effect: "지난 배움이 새로운 힘으로 돌아옵니다" },
    "轉禍爲福": { id: "fortune", role: "위기 정화·회복", desc: "모든 약화를 제거하고 체력·보호막을 회복", effect: "재앙이 복으로 뒤집힙니다" },
    "右往左往": { id: "confusedRush", role: "혼돈 재배치·시간 확보", desc: "보드 재배치 · 부족한 두 속성 보정 · 이동시간과 지연 확보", effect: "갈팡질팡하는 흐름을 기회로 바꿉니다" },
    "自業自得": { id: "ownDoing", role: "반사·응징", desc: "다음 적 공격을 줄이고 감소 전 피해를 적에게 반사", effect: "적의 힘이 적에게 돌아갑니다" },
    "四面楚歌": { id: "surrounded", role: "위기 역전", desc: "위기일 때 45 고정 피해 · 보호막 · 적 지연", effect: "몰릴수록 마지막 길이 열립니다" },
    "百發百中": { id: "sureHit", role: "확정 치명타·마무리", desc: "이번 턴 최다 속성 피해를 175%로 반복하고 저항 무시", effect: "한 발 한 발이 반드시 뜻에 닿습니다" }
  });
  const IDIOM_EFFECTS = Object.freeze(IDIOM_EFFECT_LIBRARY);
  const RAW_IDIOM_ROWS = Array.isArray(DATASET.idioms) && DATASET.idioms.length ? DATASET.idioms : LEGACY_IDIOM_ROWS;
  const DECLARATIVE_IDIOM_BY_HANJA = new Map(buildIdiomSpecs(
    RAW_IDIOM_ROWS,
    Object.fromEntries(Object.entries(IDIOM_EFFECTS).map(([hanja, effect]) => [hanja, effect.id]))
  ).map((idiom) => [idiom.hanja, idiom]));
  const ALL_IDIOMS = RAW_IDIOM_ROWS.map((entry, index) => {
    const effect = IDIOM_EFFECTS[entry.hanja] || {};
    const declarative = DECLARATIVE_IDIOM_BY_HANJA.get(entry.hanja);
    return {
      id: effect.id || `dataset-${index}-${entry.hanja}`,
      name: entry.reading,
      reading: `${entry.reading} · ${entry.meaning}`,
      pronunciation: entry.reading,
      meaning: entry.meaning,
      chars: [...entry.hanja],
      desc: effect.desc || entry.meaning,
      effect: effect.effect || "성어 공명 · 추가 피해",
      role: effect.role || entry.category || "전투 효과",
      effectId: effect.id || `dataset-${index}-${entry.hanja}`,
      effectSpec: { ...(declarative?.effectSpec || {}), ...effect },
      category: entry.category,
      tier: entry.tier,
      sourceHanja: entry.hanja
    };
  });
  const IDIOM_BY_HANJA = new Map(ALL_IDIOMS.map((idiom) => [idiom.sourceHanja, idiom]));
  const ACTIVE_IDIOMS = DATASET_ROLLOUT.activeIdiomHanja == null
    ? ALL_IDIOMS
    : DATASET_ROLLOUT.activeIdiomHanja.map((hanja) => IDIOM_BY_HANJA.get(hanja)).filter(Boolean);
  const PANG_IDIOMS = PANG_IDIOM_HANJA.map((hanja) => IDIOM_BY_HANJA.get(hanja)).filter(Boolean);
  const IDIOMS = ACTIVE_IDIOMS.length ? ACTIVE_IDIOMS : ALL_IDIOMS.slice(0, 3);
  const IDIOM_REWARD_OVERRIDES = { fortune: 4000, twoBirds: 8000, prepared: 3000 };
  const PANG_IDIOM_REWARDS = Object.fromEntries(PANG_IDIOMS.map((idiom, index) => {
    const score = IDIOM_REWARD_OVERRIDES[idiom.id] || 2200 + index * 450;
    return [idiom.id, { score, text: `+${score.toLocaleString("ko-KR")}점` }];
  }));
  const orderedCharacters = [...DATASET_CHARACTERS].sort((a, b) =>
    (a.firstSequence || Number.MAX_SAFE_INTEGER) - (b.firstSequence || Number.MAX_SAFE_INTEGER) ||
    (b.curatedUsage || 0) - (a.curatedUsage || 0) || a.hanja.localeCompare(b.hanja)
  );
  const rolloutCharacters = DATASET_ROLLOUT.activeCharacterLimit == null
    ? orderedCharacters
    : orderedCharacters.slice(0, DATASET_ROLLOUT.activeCharacterLimit);
  const activeCharacterSet = new Set(rolloutCharacters.map((entry) => entry.hanja));
  IDIOMS.forEach((idiom) => idiom.chars.forEach((char) => activeCharacterSet.add(char)));
  const ACTIVE_CHARACTERS = orderedCharacters.filter((entry) => activeCharacterSet.has(entry.hanja));
  const CHARACTER_POOL = ACTIVE_CHARACTERS.length ? ACTIVE_CHARACTERS.map((entry) => entry.hanja) : [...new Set([...IDIOMS.flatMap((idiom) => idiom.chars), ...LEGACY_EXTRA_CHARS])];
  const CHARACTER_VOLUMES = buildCharacterVolumes(DATASET_CHARACTERS);
  const REVIVE_CHARACTER_POOL = buildReviveCharacterPool(DATASET_CHARACTERS, HANJA_READINGS);
  const JARYEONG_LIBRARY = Object.freeze([
    { id: "wood-mok", hanja: "木", reading: "나무 목", meaning: "성장", element: "wood", attack: 8, skillName: "덩굴 자람", skillDesc: "체력 10 회복 · 목 타일 3개 생성", leaderSkill: "목 회복량 +25%", bodyType: "semi-humanoid", personality: "느긋하고 다정한 숲의 수호자" },
    { id: "wood-tree", hanja: "樹", reading: "나무 수", meaning: "숲과 생명", element: "wood", attack: 7, skillName: "생명의 그늘", skillDesc: "보호막 10 획득 · 체력 8 회복", leaderSkill: "목 매치마다 보호막 +1", bodyType: "semi-humanoid", personality: "작은 생명을 돌보는 나무 정령" },
    { id: "wood-life", hanja: "生", reading: "날 생", meaning: "생명", element: "wood", attack: 9, skillName: "새싹 회복", skillDesc: "체력 18 회복", leaderSkill: "회복 효과 +20%", bodyType: "plant-spirit", personality: "끝까지 다시 피어나는 새싹" },
    { id: "wood-bamboo", hanja: "竹", reading: "대 죽", meaning: "대나무", element: "wood", attack: 8, skillName: "죽엽 정화", skillDesc: "봉인 타일 전부 해제 · 문자 큐 수명 초기화", leaderSkill: "목 회복량 +25%", bodyType: "bamboo-mantis", personality: "매듭을 끊고 길을 여는 날렵한 대나무 사마귀" },
    { id: "wood-orchid", hanja: "蘭", reading: "난초 란", meaning: "난초", element: "wood", attack: 7, skillName: "난향 회귀", skillDesc: "직전 회복량을 다시 회복 · 최소 10", leaderSkill: "회복 효과 +20%", bodyType: "orchid-mask", personality: "전장의 치유 향기를 기억해 되돌려 주는 난초 가면" },
    { id: "wood-forest", hanja: "森", reading: "수풀 삼", meaning: "숲", element: "wood", attack: 9, skillName: "삼림 맥동", skillDesc: "즉시 8 회복 · 3턴 동안 턴마다 6 회복", leaderSkill: "회복 효과 +20%", bodyType: "moss-stag", personality: "등 위의 작은 숲을 흔들어 오래가는 생명장을 펼치는 이끼사슴" },
    { id: "fire-hwa", hanja: "火", reading: "불 화", meaning: "불꽃", element: "fire", attack: 12, skillName: "불씨 폭발", skillDesc: "적에게 14 피해 · 화상 2", leaderSkill: "화 피해 +15%", bodyType: "floating", personality: "성급하지만 정의감이 강한 불꽃" },
    { id: "fire-light", hanja: "光", reading: "빛 광", meaning: "빛", element: "fire", attack: 10, skillName: "섬광", skillDesc: "적에게 12 피해 · 다음 화상 강화", leaderSkill: "화상 피해 +1", bodyType: "floating", personality: "어둠을 밀어내는 장난꾸러기" },
    { id: "fire-sun", hanja: "日", reading: "날 일", meaning: "태양", element: "fire", attack: 11, skillName: "정오의 일격", skillDesc: "적에게 20 피해", leaderSkill: "첫 화 공격 강화", bodyType: "sun-spirit", personality: "한낮처럼 당당한 작은 태양" },
    { id: "fire-lantern", hanja: "燈", reading: "등잔 등", meaning: "등불", element: "fire", attack: 10, skillName: "등화 폭쇄", skillDesc: "화상을 6배 피해로 폭발 · 기본 8 피해", leaderSkill: "화 피해 +15%", bodyType: "lantern-moth", personality: "모아 둔 불씨를 한순간에 터뜨리는 등불나방" },
    { id: "fire-fox", hanja: "狐", reading: "여우 호", meaning: "여우", element: "fire", attack: 11, skillName: "화필 전환", skillDesc: "오래된 문자 2개를 화속성화 · 화 타일 3개 생성", leaderSkill: "화 피해 +15%", bodyType: "brushfire-fox", personality: "꼬리 붓으로 낡은 글자에 새 불씨를 칠하는 먹여우" },
    { id: "fire-phoenix", hanja: "鳳", reading: "봉황 봉", meaning: "봉황", element: "fire", attack: 13, skillName: "봉염 귀환", skillDesc: "다음 전투불능 시 체력 35% 부활 · 최대 20% 반격", leaderSkill: "화 피해 +15%", bodyType: "flame-phoenix", personality: "꺼진 획에서 다시 날아올라 마지막 불씨를 돌려주는 봉황" },
    { id: "earth-to", hanja: "土", reading: "흙 토", meaning: "대지", element: "earth", attack: 7, skillName: "대지의 품", skillDesc: "보호막 20 획득", leaderSkill: "보호막 획득량 +25%", bodyType: "stone-guardian", personality: "말이 적고 믿음직한 수호령" },
    { id: "earth-stone", hanja: "石", reading: "돌 석", meaning: "바위", element: "earth", attack: 8, skillName: "돌벽", skillDesc: "보호막 14 · 다음 피해 10% 감소", leaderSkill: "토 매치마다 보호막 +1", bodyType: "stone-guardian", personality: "작지만 무너지지 않는 돌" },
    { id: "earth-mountain", hanja: "山", reading: "메 산", meaning: "산", element: "earth", attack: 9, skillName: "산울림", skillDesc: "적에게 10 피해 · 보호막 8", leaderSkill: "최대 보호막 +12", bodyType: "mountain-spirit", personality: "느리지만 누구보다 오래 버틴다" },
    { id: "earth-pottery", hanja: "陶", reading: "질그릇 도", meaning: "도자기", element: "earth", attack: 7, skillName: "청자 저장", skillDesc: "보호막 12 · 다음 자령 충전 +1 · 이동 +1초", leaderSkill: "보호막 획득량 +25%", bodyType: "celadon-crab", personality: "금 간 힘도 차곡차곡 저장하는 청자 항아리게" },
    { id: "earth-tortoise", hanja: "龜", reading: "거북 귀", meaning: "거북", element: "earth", attack: 6, skillName: "육각 성곽", skillDesc: "보호막 18 · 다음 피격 피해 25% 감소", leaderSkill: "보호막 획득량 +25%", bodyType: "flagstone-tortoise", personality: "낮은 돌등을 성곽처럼 포개 아군을 지키는 이끼거북" },
    { id: "earth-valley", hanja: "谷", reading: "골 곡", meaning: "골짜기", element: "earth", attack: 10, skillName: "협곡 분류", skillDesc: "다음 3회 피격의 45%를 3턴에 나눠 받음", leaderSkill: "보호막 획득량 +25%", bodyType: "canyon-salamander", personality: "한 번의 충격을 여러 지층으로 흘려 보내는 협곡도롱뇽" },
    { id: "metal-gold", hanja: "金", reading: "쇠 금", meaning: "금속", element: "metal", attack: 9, skillName: "금빛 관통", skillDesc: "적에게 16 피해 · 다음 금 확정 관통", leaderSkill: "금 피해 +15%", bodyType: "armored", personality: "규칙을 중시하는 소형 호위무사" },
    { id: "metal-sword", hanja: "劍", reading: "칼 검", meaning: "검", element: "metal", attack: 11, skillName: "일섬", skillDesc: "적에게 20 피해", leaderSkill: "금 치명타 확률 증가", bodyType: "armored", personality: "한 번의 칼끝에 집중하는 전사" },
    { id: "metal-jade", hanja: "玉", reading: "구슬 옥", meaning: "옥", element: "metal", attack: 8, skillName: "옥갑", skillDesc: "보호막 12 · 금 게이지 +1", leaderSkill: "관통 피해 +10%", bodyType: "relic-spirit", personality: "차갑지만 빛나는 보석 정령" },
    { id: "metal-bell", hanja: "鐘", reading: "쇠북 종", meaning: "종", element: "metal", attack: 8, skillName: "종음 침묵", skillDesc: "적 부가효과 1턴 봉인 · 보호막 6", leaderSkill: "금 피해 +15%", bodyType: "bronze-bell", personality: "한 번의 울림으로 사악한 술식을 잠재우는 청동 종" },
    { id: "metal-mirror", hanja: "鏡", reading: "거울 경", meaning: "거울", element: "metal", attack: 7, skillName: "명경반조", skillDesc: "다음 적 공격 35% 경감 · 원 피해 75% 반사", leaderSkill: "관통 피해 +10%", bodyType: "ritual-mirror", personality: "다가올 일격을 한눈에 비추어 되돌리는 의식 거울" },
    { id: "metal-chain", hanja: "鎖", reading: "쇠사슬 쇄", meaning: "사슬", element: "metal", attack: 10, skillName: "쇄맥 봉인", skillDesc: "현재 적 행동 1턴 결박 · 보호막 무시 8 피해", leaderSkill: "관통 피해 +10%", bodyType: "chain-centipede", personality: "흩어진 고리를 맞물려 적의 다음 술식을 묶는 자물쇠지네" },
    { id: "water-sui", hanja: "水", reading: "물 수", meaning: "물", element: "water", attack: 7, skillName: "물결 지연", skillDesc: "적 행동 1턴 지연 · 수 타일 2개 생성", leaderSkill: "지연 발동률 +8%p", bodyType: "fluid", personality: "상황에 맞춰 흐르는 물방울" },
    { id: "water-rain", hanja: "雨", reading: "비 우", meaning: "비", element: "water", attack: 7, skillName: "비의 장막", skillDesc: "보호막 8 · 적 행동 1턴 지연", leaderSkill: "지연 발동률 +8%p", bodyType: "fluid", personality: "조용히 전장을 적시는 비" },
    { id: "water-sea", hanja: "海", reading: "바다 해", meaning: "바다", element: "water", attack: 8, skillName: "깊은 파도", skillDesc: "적에게 12 피해 · 행동 지연", leaderSkill: "수 피해 +15% · 지연 발동률 +8%p", bodyType: "fluid", personality: "깊이를 숨긴 느긋한 바다 요괴" },
    { id: "water-abyss", hanja: "淵", reading: "못 연", meaning: "깊은 못", element: "water", attack: 8, skillName: "심연 차폐", skillDesc: "적 행동 1턴 지연 · 부가효과 1턴 봉인", leaderSkill: "지연 발동률 +8%p", bodyType: "abyss-manta", personality: "고요한 눈으로 다음 위협을 삼키는 심연 가오리" },
    { id: "water-ice", hanja: "氷", reading: "얼음 빙", meaning: "얼음", element: "water", attack: 9, skillName: "빙류 정지", skillDesc: "적 행동 1턴 지연 · 다음 이동시간 +2초", leaderSkill: "지연 발동률 +8%p", bodyType: "ice-koi", personality: "시간의 물결을 얼려 한 번 더 생각할 틈을 만드는 얼음잉어" },
    { id: "water-mist", hanja: "霧", reading: "안개 무", meaning: "안개", element: "water", attack: 8, skillName: "무영 수막", skillDesc: "다음 피해 50% 감소 · 부가효과 봉인 · 이동 +1.5초", leaderSkill: "지연 발동률 +8%p", bodyType: "mist-octopus", personality: "위협의 윤곽을 흐려 가장 안전한 반격 창을 보여 주는 구름문어" }
  ].map((jaryeong) => ({
    ...jaryeong,
    procChanceBonus: .03,
    leaderProcChanceBonus: .08,
    leaderSkill: jaryeong.element === "water" ? jaryeong.leaderSkill : `${jaryeong.leaderSkill} · ${ELEMENT_PROC_RULES[jaryeong.element].effect} 발동률 +8%p`,
    asset: ASSET_MANIFEST.jaryeongs[jaryeong.id],
    name: ({
      "wood-mok": "목령", "wood-tree": "수령", "wood-life": "생령",
      "wood-bamboo": "죽령", "wood-orchid": "난령", "wood-forest": "삼령",
      "fire-hwa": "화령", "fire-light": "광령", "fire-sun": "일령",
      "fire-lantern": "등령", "fire-fox": "호령", "fire-phoenix": "봉령",
      "earth-to": "토령", "earth-stone": "석령", "earth-mountain": "산령",
      "earth-pottery": "도령", "earth-tortoise": "귀령", "earth-valley": "곡령",
      "metal-gold": "금령", "metal-sword": "검령", "metal-jade": "옥령",
      "metal-bell": "종령", "metal-mirror": "경령", "metal-chain": "쇄령",
      "water-sui": "수령", "water-rain": "우령", "water-sea": "해령", "water-abyss": "연령", "water-ice": "빙령", "water-mist": "무령"
    })[jaryeong.id] || `${jaryeong.hanja}령`,
    skillId: `${jaryeong.id}-skill`,
    leaderEffectId: `${jaryeong.id}-leader`,
    wildBehaviorId: ({
      "wood-mok": "wild-growth", "wood-tree": "wild-canopy", "wood-life": "wild-regrowth",
      "wood-bamboo": "wild-bamboo", "wood-orchid": "wild-orchid", "wood-forest": "wild-forest",
      "fire-hwa": "wild-ember", "fire-light": "wild-flash", "fire-sun": "wild-sun",
      "fire-lantern": "wild-lantern", "fire-fox": "wild-fox", "fire-phoenix": "wild-phoenix",
      "earth-to": "wild-earth-wall", "earth-stone": "wild-stone-guard", "earth-mountain": "wild-landslide",
      "earth-pottery": "wild-pottery", "earth-tortoise": "wild-tortoise", "earth-valley": "wild-valley",
      "metal-gold": "wild-pierce", "metal-sword": "wild-sword", "metal-jade": "wild-reflect",
      "metal-bell": "wild-bell", "metal-mirror": "wild-mirror", "metal-chain": "wild-chain",
      "water-sui": "wild-tide", "water-rain": "wild-rain", "water-sea": "wild-sea", "water-abyss": "wild-abyss", "water-ice": "wild-ice", "water-mist": "wild-mist"
    })[jaryeong.id] || "wild-growth"
  })));
  const JARYEONG_SKILL_EFFECTS = Object.freeze({
    "wood-mok-skill": [{ type: "healPlayer", amount: 10 }, { type: "convertTiles", element: "wood", count: 3 }],
    "wood-tree-skill": [{ type: "gainShield", amount: 10 }, { type: "healPlayer", amount: 8 }],
    "wood-life-skill": [{ type: "healPlayer", amount: 18 }, { type: "healPlayerIfLow", threshold: 35, amount: 8 }],
    "wood-bamboo-skill": [{ type: "cleansePlayerStatuses" }, { type: "resetQueueAges" }],
    "wood-orchid-skill": [{ type: "repeatLastHeal", minimum: 10 }],
    "wood-forest-skill": [{ type: "healPlayer", amount: 8 }, { type: "healingField", turns: 3, amount: 6 }],
    "fire-hwa-skill": [{ type: "dealDamage", amount: 14 }, { type: "applyBurn", amount: 2 }],
    "fire-light-skill": [{ type: "dealDamage", amount: 12 }, { type: "increaseNextElement", element: "fire", amount: 1 }],
    "fire-sun-skill": [{ type: "dealDamage", amount: 20 }],
    "fire-lantern-skill": [{ type: "dealDamage", amount: 8 }, { type: "detonateBurn", multiplier: 6 }],
    "fire-fox-skill": [{ type: "convertOldestQueue", element: "fire", count: 2 }, { type: "convertTiles", element: "fire", count: 3 }],
    "fire-phoenix-skill": [{ type: "armRebirth", hpRatio: .35, counterDamageRatio: MAX_JARYEONG_DAMAGE_RATIO }],
    "earth-to-skill": [{ type: "gainShield", amount: 20 }],
    "earth-stone-skill": [{ type: "gainShield", amount: 14 }, { type: "reduceNextEnemyDamage", ratio: .1 }],
    "earth-mountain-skill": [{ type: "dealDamage", amount: 10 }, { type: "gainShield", amount: 8 }],
    "earth-pottery-skill": [{ type: "gainShield", amount: 12 }, { type: "gainPartyCharge", amount: 1 }],
    "earth-tortoise-skill": [{ type: "gainShield", amount: 18 }, { type: "reduceNextEnemyDamage", ratio: .25 }],
    "earth-valley-skill": [{ type: "splitIncomingDamage", ratio: .45, hits: 3, ticks: 3 }],
    "metal-gold-skill": [{ type: "dealDamage", amount: 16 }, { type: "pierceNextElement", element: "metal" }],
    "metal-sword-skill": [{ type: "dealDamage", amount: 20 }],
    "metal-jade-skill": [{ type: "gainShield", amount: 12 }, { type: "gainPartyCharge", element: "metal", amount: 1 }],
    "metal-bell-skill": [{ type: "gainShield", amount: 6 }, { type: "silenceEnemy", turns: 1 }],
    "metal-mirror-skill": [{ type: "reflectNextEnemyAttack", ratio: .75, damageReduction: .35 }],
    "metal-chain-skill": [{ type: "bindEnemyIntent", turns: 1 }, { type: "dealDamage", amount: 8 }],
    "water-sui-skill": [{ type: "delayEnemy", turns: 1 }, { type: "convertTiles", element: "water", count: 2 }],
    "water-rain-skill": [{ type: "gainShield", amount: 8 }, { type: "delayEnemy", turns: 1 }],
    "water-sea-skill": [{ type: "dealDamage", amount: 12 }, { type: "delayEnemy", turns: 1 }],
    "water-abyss-skill": [{ type: "delayEnemy", turns: 1 }, { type: "silenceEnemy", turns: 1 }],
    "water-ice-skill": [{ type: "delayEnemy", turns: 1 }, { type: "increaseMoveTime", seconds: 2 }],
    "water-mist-skill": [{ type: "reduceNextEnemyDamage", ratio: .5 }, { type: "silenceEnemy", turns: 1 }, { type: "increaseMoveTime", seconds: 1.5 }]
  });
  const JARYEONG_SKILL_LIBRARY = Object.freeze(Object.fromEntries(JARYEONG_LIBRARY.map((jaryeong) => [jaryeong.skillId, {
    id: jaryeong.skillId,
    ownerId: jaryeong.id,
    cost: 5,
    name: jaryeong.skillName,
    description: jaryeong.skillDesc,
    effects: JARYEONG_SKILL_EFFECTS[jaryeong.skillId] || []
  }])));
  const LEADER_EFFECT_LIBRARY = Object.freeze(Object.fromEntries(JARYEONG_LIBRARY.map((jaryeong) => [jaryeong.leaderEffectId, {
    id: jaryeong.leaderEffectId,
    ownerId: jaryeong.id,
    trigger: jaryeong.element === "water" ? "afterWaterMatch" : "afterElementMatch",
    type: jaryeong.element === "wood" ? "healMultiplier" : jaryeong.element === "earth" ? "shieldMultiplier" : jaryeong.element === "water" ? "procChanceBonus" : "elementDamageMultiplier",
    value: jaryeong.element === "wood" || jaryeong.element === "earth" ? 1.25 : jaryeong.element === "water" ? .08 : 1.15,
    description: jaryeong.leaderSkill
  }])));
  const BASE_ENEMIES = [
    {
      id: "mist-dokkaebi",
      name: "먹구름 도깨비",
      glyph: "禍",
      hp: 105,
      weakElement: ELEMENT_AFFINITIES.wood.weakElement,
      resistElement: ELEMENT_AFFINITIES.wood.resistElement,
      className: "enemy-1",
      phases: [{
        id: "mist",
        label: "먹구름",
        minHpRatio: 0,
        sequence: [{
          id: "mist-claw",
          kind: "attack",
          name: "먹빛 발톱",
          icon: "⚔",
          damage: 12,
          effectText: "12 피해",
          threat: "medium",
          threatLabel: "보통",
          responseHint: "보호막 권장"
        }]
      }]
    },
    {
      id: "geumgang-general",
      name: "금강 석장군",
      glyph: "石",
      hp: 155,
      weakElement: ELEMENT_AFFINITIES.fire.weakElement,
      resistElement: ELEMENT_AFFINITIES.fire.resistElement,
      className: "enemy-2",
      phases: [{
        id: "stone",
        label: "금강",
        minHpRatio: 0,
        sequence: [{
          id: "stone-slam",
          kind: "attack",
          name: "바위 내려찍기",
          icon: "⚔",
          damage: 17,
          effectText: "17 피해",
          threat: "high",
          threatLabel: "주의",
          responseHint: "보호막 권장"
        }]
      }]
    },
    {
      id: "calamity-dragon",
      name: "재앙을 삼킨 용",
      glyph: "患",
      hp: 225,
      weakElement: ELEMENT_AFFINITIES.earth.weakElement,
      resistElement: ELEMENT_AFFINITIES.earth.resistElement,
      className: "enemy-3",
      phases: [
        {
          id: "dragon-awakened",
          label: "용맥 개방",
          minHpRatio: 0.6,
          sequence: [
            {
              id: "dragon-breath",
              kind: "attack",
              name: "재앙의 숨결",
              icon: "⚔",
              damage: 23,
              effectText: "23 피해",
              threat: "high",
              threatLabel: "위험",
              responseHint: "보호막 권장"
            },
            {
              id: "dragon-weaken",
              kind: "weaken",
              name: "용맥의 낙인",
              icon: "☄",
              damage: 23,
              effect: { type: "weaken", turns: 1 },
              effectText: "23 피해 · 기력 약화",
              threat: "high",
              threatLabel: "위험",
              responseHint: "회복·대비 권장"
            }
          ]
        },
        {
          id: "dragon-rage",
          label: "재앙 폭주",
          minHpRatio: 0,
          sequence: [
            {
              id: "dragon-rage-breath",
              kind: "attack",
              name: "재앙의 숨결",
              icon: "⚔",
              damage: 23,
              effectText: "23 피해",
              threat: "high",
              threatLabel: "위험",
              responseHint: "보호막 권장"
            },
            {
              id: "dragon-rage-weaken",
              kind: "weaken",
              name: "용맥의 낙인",
              icon: "☄",
              damage: 23,
              effect: { type: "weaken", turns: 1 },
              effectText: "23 피해 · 기력 약화",
              threat: "high",
              threatLabel: "위험",
              responseHint: "회복·대비 권장"
            }
          ]
        }
      ]
    }
  ];

  const WILD_BEHAVIORS = Object.freeze({
    "wild-growth": {
      label: "덩굴 흡수",
      phases: [{
        id: "wild-growth",
        label: "덩굴 흡수",
        minHpRatio: 0,
        sequence: buildAct1EntryCadence("wild-growth", {
          id: "wild-growth-strike",
          kind: "attack",
          name: "덩굴 휘감기",
          icon: "⚔",
          damage: 12,
          effect: { type: "healEnemy", amount: 6 },
          effectText: "12 피해 · 기운 6 회복",
          threat: "medium",
          threatLabel: "보통",
          responseHint: "보호막 권장"
        })
      }]
    },
    "wild-ember": {
      label: "불씨 폭발",
      phases: [{
        id: "wild-ember",
        label: "불씨 폭발",
        minHpRatio: 0,
        sequence: [{
          id: "wild-ember-burst",
          kind: "attack",
          name: "불씨 폭발",
          icon: "⚔",
          damage: 17,
          effect: { type: "weaken", turns: 1, healReduction: .25 },
          effectText: "17 피해 · 다음 회복 -25%",
          threat: "high",
          threatLabel: "주의",
          responseHint: "보호막·회복 권장"
        }]
      }]
    },
    "wild-tide": {
      label: "물결 지연",
      phases: [
        {
          id: "wild-tide-awakened",
          label: "물결 개방",
          minHpRatio: 0.6,
          sequence: [
            {
              id: "wild-tide-crash",
              kind: "attack",
              name: "깊은 파도",
              icon: "⚔",
              damage: 23,
              effect: { type: "reduceMoveTime", seconds: .5 },
              effectText: "23 피해 · 다음 이동시간 -0.5초",
              threat: "high",
              threatLabel: "위험",
              responseHint: "보호막 권장"
            },
            {
              id: "wild-tide-delay",
              kind: "weaken",
              name: "물결의 낙인",
              icon: "☄",
              damage: 23,
              effect: { type: "weaken", turns: 1 },
              effectText: "23 피해 · 기력 약화",
              threat: "high",
              threatLabel: "위험",
              responseHint: "회복·대비 권장"
            }
          ]
        },
        {
          id: "wild-tide-rage",
          label: "물결 폭주",
          minHpRatio: 0,
          sequence: [
            {
              id: "wild-tide-rage-crash",
              kind: "attack",
              name: "깊은 파도",
              icon: "⚔",
              damage: 23,
              effect: { type: "reduceMoveTime", seconds: .5 },
              effectText: "23 피해 · 다음 이동시간 -0.5초",
              threat: "high",
              threatLabel: "위험",
              responseHint: "보호막 권장"
            },
            {
              id: "wild-tide-rage-delay",
              kind: "weaken",
              name: "물결의 낙인",
              icon: "☄",
              damage: 23,
              effect: { type: "weaken", turns: 1 },
              effectText: "23 피해 · 기력 약화",
              threat: "high",
              threatLabel: "위험",
              responseHint: "회복·대비 권장"
            }
          ]
        }
      ]
    },
    "wild-canopy": {
      label: "수관 보호",
      phases: [{
        id: "wild-canopy",
        label: "수관 보호",
        minHpRatio: 0,
        sequence: buildAct1EntryCadence("wild-canopy", {
          id: "wild-canopy-guard",
          kind: "attack",
          name: "수관 보호",
          icon: "🛡",
          damage: 10,
          effect: { type: "gainEnemyShield", amount: 18 },
          effectText: "10 피해 · 보호막 18 · 전 속성 유효 · 금 관통 추천",
          threat: "medium",
          threatLabel: "주의",
          responseHint: "모든 속성으로 파괴 가능 · 금 관통이 특히 효과적입니다"
        })
      }]
    },
    "wild-regrowth": {
      label: "새싹 재생",
      phases: [
        { id: "wild-regrowth", label: "뿌리의 시험", minHpRatio: .6, sequence: [
          { id: "wild-regrowth-roots", kind: "control", name: "휘감는 뿌리", icon: "木", damage: 12, effect: { type: "lockTiles", count: 2, turns: 1 }, effectText: "12 피해 · 타일 2개 1턴 봉인", threat: "medium", threatLabel: "주의", responseHint: "봉인 전에 이동 경로를 넓게 확보하세요" },
          { id: "wild-regrowth-heal", kind: "heal", name: "새싹 재생", icon: "✦", damage: 10, effect: { type: "healEnemyUnlessBurning", amount: 14 }, effectText: "10 피해 · 화상이 없으면 기운 14 회복", threat: "medium", threatLabel: "주의", responseHint: "화상을 남겨 재생을 끊으세요" }
        ] },
        { id: "wild-regrowth-awakened", label: "만생의 폭주", minHpRatio: 0, sequence: [
          { id: "wild-regrowth-roots-awakened", kind: "control", name: "폭주하는 뿌리", icon: "木", damage: 18, effect: { type: "lockTiles", count: 3, turns: 1 }, effectText: "18 피해 · 타일 3개 1턴 봉인", threat: "high", threatLabel: "위험", responseHint: "봉인을 풀 수단과 짧은 경로를 준비하세요" },
          { id: "wild-regrowth-heal-awakened", kind: "heal", name: "만생 재생", icon: "✦", damage: 14, effect: { type: "healEnemyUnlessBurning", amount: 18 }, effectText: "14 피해 · 화상이 없으면 기운 18 회복", threat: "high", threatLabel: "위험", responseHint: "화상과 성어를 이어 재생을 차단하세요" }
        ] }
      ]
    },
    "wild-bamboo": {
      label: "죽엽 견제",
      phases: [{
        id: "wild-bamboo",
        label: "죽엽 견제",
        minHpRatio: 0,
        sequence: buildAct1EntryCadence("wild-bamboo", {
          id: "wild-bamboo-bind",
          kind: "control",
          name: "마디 베기",
          icon: "竹",
          damage: 12,
          effect: { type: "reduceMoveTime", seconds: .5 },
          effectText: "12 피해 · 다음 이동시간 -0.5초",
          threat: "medium",
          threatLabel: "주의",
          responseHint: "다음 이동 경로를 미리 읽으세요"
        })
      }]
    },
    "wild-orchid": {
      label: "난향 회귀",
      phases: [{ id: "wild-orchid", label: "난향 회귀", minHpRatio: 0, sequence: [{ id: "wild-orchid-heal", kind: "heal", name: "되감는 향기", icon: "蘭", damage: 14, effect: { type: "healEnemy", amount: 18 }, effectText: "14 피해 · 기운 18 회복", threat: "high", threatLabel: "위험", responseHint: "회복 전에 화상으로 압박하세요" }] }]
    },
    "wild-forest": {
      label: "고목의 맥동",
      phases: [{ id: "wild-forest", label: "고목의 맥동", minHpRatio: 0, sequence: [{ id: "wild-forest-bloom", kind: "heal", name: "숲등 확장", icon: "森", damage: 18, effect: { type: "healEnemy", amount: 24 }, effectText: "18 피해 · 기운 24 회복", threat: "high", threatLabel: "위험", responseHint: "회복 주기 전에 화상과 성어를 집중하세요" }] }]
    },
    "wild-flash": {
      label: "눈부신 섬광",
      phases: [{
        id: "wild-flash",
        label: "눈부신 섬광",
        minHpRatio: 0,
        sequence: buildAct1EntryCadence("wild-flash", {
          id: "wild-flash-strike",
          kind: "attack",
          name: "눈부신 섬광",
          icon: "☀",
          damage: 10,
          effect: { type: "reduceMoveTime", seconds: .7 },
          effectText: "10 피해 · 다음 이동시간 -0.7초",
          threat: "medium",
          threatLabel: "주의",
          responseHint: "다음 이동을 빠르게 준비하세요"
        })
      }]
    },
    "wild-sun": {
      label: "태양 충전",
      phases: [{ id: "wild-sun", label: "태양 충전", minHpRatio: 0, sequence: [{ id: "wild-sun-strike", kind: "attack", name: "태양 충전", icon: "☀", damage: 24, effectText: "24 피해 · 강한 단일 공격", threat: "high", threatLabel: "위험", responseHint: "보호막을 준비하세요" }] }]
    },
    "boss-crimson-order": {
      label: "적월의 순서",
      phases: [
        { id: "crimson-order", label: "적월의 순서", minHpRatio: .6, sequence: [
          { id: "crimson-seal", kind: "control", name: "적월 봉인", icon: "封", damage: 16, effect: { type: "lockTiles", count: 3, turns: 1 }, effectText: "16 피해 · 타일 3개 1턴 봉인", threat: "medium", threatLabel: "주의", responseHint: "다음 성어 문자의 이동 경로를 먼저 확보하세요" },
          { id: "crimson-scorch", kind: "control", name: "문자 소각", icon: "火", damage: 18, effect: { type: "decayQueue", turns: 1 }, effectText: "18 피해 · 오래된 문자 수명 감소", threat: "high", threatLabel: "위험", responseHint: "오래된 문자부터 성어에 사용하세요" },
          { id: "crimson-strike", kind: "attack", name: "정오 일섬", icon: "☀", damage: 24, effectText: "24 피해 · 강한 단일 공격", threat: "high", threatLabel: "위험", responseHint: "보호막과 회복을 준비하세요" }
        ] },
        { id: "crimson-order-awakened", label: "적월 폭주", minHpRatio: 0, sequence: [
          { id: "crimson-seal-awakened", kind: "control", name: "적월 대봉인", icon: "封", damage: 20, effect: { type: "lockTiles", count: 4, turns: 1 }, effectText: "20 피해 · 타일 4개 1턴 봉인", threat: "high", threatLabel: "위험", responseHint: "봉인을 풀고 성어 순서를 다시 짜세요" },
          { id: "crimson-scorch-awakened", kind: "control", name: "성어 소각", icon: "火", damage: 22, effect: { type: "decayQueue", turns: 2 }, effectText: "22 피해 · 오래된 문자 수명 크게 감소", threat: "high", threatLabel: "위험", responseHint: "완성 직전 성어를 이번 턴에 사용하세요" },
          { id: "crimson-strike-awakened", kind: "attack", name: "적월 일섬", icon: "☀", damage: 30, effectText: "30 피해 · 폭주 강공격", threat: "high", threatLabel: "위험", responseHint: "지연·보호막·회복 중 하나를 반드시 준비하세요" }
        ] }
      ]
    },
    "wild-lantern": {
      label: "등화 분진",
      phases: [{ id: "wild-lantern", label: "등화 분진", minHpRatio: 0, sequence: [{ id: "wild-lantern-dust", kind: "weaken", name: "그을음 날개", icon: "燈", damage: 15, effect: { type: "weaken", turns: 1, healReduction: .2 }, effectText: "15 피해 · 다음 회복 -20%", threat: "medium", threatLabel: "주의", responseHint: "회복 전에 빠르게 진정시키세요" }] }]
    },
    "wild-fox": {
      label: "묵화 불씨",
      phases: [{ id: "wild-fox", label: "묵화 불씨", minHpRatio: 0, sequence: [{ id: "wild-fox-burn", kind: "attack", name: "꼬리 붓질", icon: "狐", damage: 17, effect: { type: "burnPlayer", amount: 4 }, effectText: "17 피해 · 추가 화상 4", threat: "high", threatLabel: "위험", responseHint: "보호막과 회복을 함께 준비하세요" }] }]
    },
    "wild-phoenix": {
      label: "봉염 폭우",
      phases: [{ id: "wild-phoenix", label: "봉염 폭우", minHpRatio: 0, sequence: [{ id: "wild-phoenix-fall", kind: "attack", name: "불깃 낙하", icon: "鳳", damage: 22, effect: { type: "burnPlayer", amount: 6 }, effectText: "22 피해 · 추가 화상 6", threat: "high", threatLabel: "위험", responseHint: "수 지연과 보호막을 함께 준비하세요" }] }]
    },
    "wild-earth-wall": {
      label: "대지의 벽",
      phases: [{ id: "wild-earth-wall", label: "대지의 벽", minHpRatio: 0, sequence: [{ id: "wild-earth-wall-strike", kind: "attack", name: "대지의 벽", icon: "▣", damage: 12, effect: { type: "gainEnemyShield", amount: 18 }, effectText: "12 피해 · 야생 보호막 18", threat: "medium", threatLabel: "주의", responseHint: "금 관통으로 압박하세요" }] }]
    },
    "wild-stone-guard": {
      label: "석화 방어",
      phases: [{ id: "wild-stone-guard", label: "석화 방어", minHpRatio: 0, sequence: [{ id: "wild-stone-guard-strike", kind: "attack", name: "석화 방어", icon: "▣", damage: 10, effect: { type: "gainEnemyShield", amount: 18 }, effectText: "10 피해 · 야생 보호막 18", threat: "medium", threatLabel: "주의", responseHint: "보호막이 쌓이기 전에 공격하세요" }] }]
    },
    "wild-landslide": {
      label: "산사태",
      phases: [{ id: "wild-landslide", label: "산사태", minHpRatio: 0, sequence: [{ id: "wild-landslide-strike", kind: "attack", name: "무너진 암벽", icon: "⛰", damage: 18, effect: { type: "gainEnemyShield", amount: 14 }, effectText: "18 피해 · 암벽 보호막 14", threat: "high", threatLabel: "위험", responseHint: "금 관통으로 암벽을 깨뜨리세요" }] }]
    },
    "wild-pottery": {
      label: "청자 축적",
      phases: [{ id: "wild-pottery", label: "청자 축적", minHpRatio: 0, sequence: [{ id: "wild-pottery-store", kind: "attack", name: "금빛 봉합", icon: "陶", damage: 15, effect: { type: "gainEnemyShield", amount: 24 }, effectText: "15 피해 · 야생 보호막 24", threat: "high", threatLabel: "위험", responseHint: "금 관통으로 축적을 깨뜨리세요" }] }]
    },
    "wild-tortoise": {
      label: "육각 성곽",
      phases: [{ id: "wild-tortoise", label: "육각 성곽", minHpRatio: 0, sequence: [{ id: "wild-tortoise-wall", kind: "guard", name: "돌등 닫기", icon: "龜", damage: 14, effect: { type: "gainEnemyShield", amount: 22 }, effectText: "14 피해 · 야생 보호막 22", threat: "medium", threatLabel: "주의", responseHint: "금 관통으로 돌등을 여세요" }] }]
    },
    "wild-valley": {
      label: "협곡 붕괴",
      phases: [{ id: "wild-valley", label: "협곡 붕괴", minHpRatio: 0, sequence: [{ id: "wild-valley-collapse", kind: "control", name: "지층 쓸림", icon: "谷", damage: 20, effect: { type: "decayQueue", turns: 1 }, effectText: "20 피해 · 오래된 문자 수명 감소", threat: "high", threatLabel: "위험", responseHint: "오래된 문자를 먼저 사용하세요" }] }]
    },
    "wild-pierce": {
      label: "갑주 관통",
      phases: [{ id: "wild-pierce", label: "갑주 관통", minHpRatio: 0, sequence: [{ id: "wild-pierce-strike", kind: "attack", name: "갑주 관통", icon: "◇", damage: 16, effect: { type: "pierce" }, effectText: "16 피해 · 보호막 무시", threat: "high", threatLabel: "위험", responseHint: "회복을 준비하세요" }] }]
    },
    "wild-sword": {
      label: "예고된 일섬",
      phases: [{ id: "wild-sword", label: "예고된 일섬", minHpRatio: 0, sequence: [{ id: "wild-sword-strike", kind: "attack", name: "예고된 일섬", icon: "⚔", damage: 22, effect: { type: "pierce" }, effectText: "22 피해 · 보호막 무시", threat: "high", threatLabel: "위험", responseHint: "지피지기 대비를 권장합니다" }] }]
    },
    "wild-reflect": {
      label: "옥의 반사막",
      phases: [{ id: "wild-reflect", label: "옥의 반사막", minHpRatio: 0, sequence: [{ id: "wild-reflect-strike", kind: "attack", name: "옥의 반사막", icon: "◇", damage: 10, effect: { type: "gainEnemyShield", amount: 16 }, effectText: "10 피해 · 야생 보호막 16", threat: "medium", threatLabel: "주의", responseHint: "보호막을 걷은 뒤 공격하세요" }] }]
    },
    "wild-bell": {
      label: "공명 쇠약",
      phases: [{ id: "wild-bell", label: "공명 쇠약", minHpRatio: 0, sequence: [{ id: "wild-bell-ring", kind: "control", name: "낡은 종소리", icon: "鐘", damage: 18, effect: { type: "decayQueue", turns: 1 }, effectText: "18 피해 · 오래된 문자 수명 감소", threat: "high", threatLabel: "위험", responseHint: "오래된 문자를 먼저 성어로 쓰세요" }] }]
    },
    "wild-mirror": {
      label: "은빛 역광",
      phases: [{ id: "wild-mirror", label: "은빛 역광", minHpRatio: 0, sequence: [{ id: "wild-mirror-pierce", kind: "attack", name: "거울 일섬", icon: "鏡", damage: 24, effect: { type: "pierce" }, effectText: "24 피해 · 보호막 무시", threat: "high", threatLabel: "위험", responseHint: "지연·반사로 일격을 피하세요" }] }]
    },
    "wild-chain": {
      label: "고리 압착",
      phases: [{ id: "wild-chain", label: "고리 압착", minHpRatio: 0, sequence: [
        { id: "wild-chain-drag", kind: "control", name: "문자 끌어당김", icon: "鎖", damage: 23, effect: { type: "decayQueue", turns: 1 }, effectText: "23 피해 · 오래된 문자 수명 감소", threat: "high", threatLabel: "위험", responseHint: "오래된 문자를 먼저 성어로 사용하세요" },
        { id: "wild-chain-lock", kind: "control", name: "자물쇠 협착", icon: "鎖", damage: 20, effect: { type: "reduceMoveTime", seconds: .7 }, effectText: "20 피해 · 다음 이동시간 -0.7초", threat: "high", threatLabel: "위험", responseHint: "짧은 이동 경로를 미리 확보하세요" }
      ] }]
    },
    "wild-rain": {
      label: "비의 장막",
      phases: [{ id: "wild-rain", label: "비의 장막", minHpRatio: 0, sequence: [{ id: "wild-rain-strike", kind: "attack", name: "비의 장막", icon: "☂", damage: 10, effect: { type: "reduceMoveTime", seconds: .5 }, effectText: "10 피해 · 다음 이동시간 -0.5초", threat: "medium", threatLabel: "주의", responseHint: "수 매치로 흐름을 되찾으세요" }] }]
    },
    "wild-sea": {
      label: "깊은 파도",
      phases: [{ id: "wild-sea", label: "깊은 파도", minHpRatio: 0, sequence: [{ id: "wild-sea-strike", kind: "attack", name: "깊은 파도", icon: "≈", damage: 16, effect: { type: "decayQueue", turns: 1 }, effectText: "16 피해 · 오래된 문자 수명 감소", threat: "high", threatLabel: "위험", responseHint: "큐를 비우거나 성어를 완성하세요" }] }]
    },
    "boss-moon-trial": {
      label: "심해의 시험",
      phases: [
        { id: "moon-trial", label: "심해의 시험", minHpRatio: .6, sequence: [
          { id: "moon-barrier", kind: "guard", name: "심해 장막", icon: "水", damage: 14, effect: { type: "gainEnemyShield", amount: 28 }, effectText: "14 피해 · 야생 보호막 28", threat: "medium", threatLabel: "주의", responseHint: "금 관통이나 집중 공격으로 장막을 걷어내세요" },
          { id: "moon-pierce", kind: "attack", name: "월광 관통", icon: "月", damage: 26, effect: { type: "pierce" }, effectText: "26 피해 · 보호막 무시", threat: "high", threatLabel: "위험", responseHint: "체력 회복과 지연을 준비하세요" },
          { id: "moon-decay", kind: "control", name: "심해 침식", icon: "≈", damage: 20, effect: { type: "decayQueue", turns: 1 }, effectText: "20 피해 · 오래된 문자 수명 감소", threat: "high", threatLabel: "위험", responseHint: "핵심 성어 문자를 먼저 사용하세요" }
        ] },
        { id: "moon-trial-awakened", label: "심해월 폭주", minHpRatio: 0, sequence: [
          { id: "moon-barrier-awakened", kind: "guard", name: "만월 장막", icon: "水", damage: 18, effect: { type: "gainEnemyShield", amount: 40 }, effectText: "18 피해 · 야생 보호막 40", threat: "high", threatLabel: "위험", responseHint: "관통과 성어 화력을 한 턴에 집중하세요" },
          { id: "moon-pierce-awakened", kind: "attack", name: "심해월 관통", icon: "月", damage: 34, effect: { type: "pierce" }, effectText: "34 피해 · 보호막 무시", threat: "high", threatLabel: "위험", responseHint: "지연하거나 체력을 충분히 회복하세요" },
          { id: "moon-decay-awakened", kind: "control", name: "망각의 파도", icon: "≈", damage: 24, effect: { type: "decayQueue", turns: 2 }, effectText: "24 피해 · 오래된 문자 수명 크게 감소", threat: "high", threatLabel: "위험", responseHint: "완성 가능한 성어를 미루지 마세요" }
        ] }
      ]
    },
    "wild-abyss": {
      label: "심연 은폐",
      phases: [{ id: "wild-abyss", label: "심연 은폐", minHpRatio: 0, sequence: [
        { id: "wild-abyss-dim", kind: "control", name: "깊이 가리기", icon: "淵", damage: 19, effect: { type: "reduceMoveTime", seconds: .7 }, effectText: "19 피해 · 다음 이동시간 -0.7초", threat: "high", threatLabel: "위험", responseHint: "다음 이동을 짧게 준비하세요" },
        { id: "wild-abyss-pull", kind: "weaken", name: "심연의 끌림", icon: "≈", damage: 17, effect: { type: "weaken", turns: 1 }, effectText: "17 피해 · 기력 약화", threat: "medium", threatLabel: "주의", responseHint: "정화·회복을 준비하세요" }
      ] }]
    },
    "wild-ice": {
      label: "빙류 결박",
      phases: [{ id: "wild-ice", label: "빙류 결박", minHpRatio: 0, sequence: [{ id: "wild-ice-freeze", kind: "control", name: "서리 지느러미", icon: "氷", damage: 20, effect: { type: "reduceMoveTime", seconds: 1 }, effectText: "20 피해 · 다음 이동시간 -1초", threat: "high", threatLabel: "위험", responseHint: "짧고 확실한 경로를 준비하세요" }] }]
    },
    "wild-mist": {
      label: "무영 수역",
      phases: [{ id: "wild-mist", label: "무영 수역", minHpRatio: 0, sequence: [
        { id: "wild-mist-dim", kind: "control", name: "시야 침잠", icon: "霧", damage: 22, effect: { type: "reduceMoveTime", seconds: 1.2 }, effectText: "22 피해 · 다음 이동시간 -1.2초", threat: "high", threatLabel: "위험", responseHint: "짧고 확실한 경로를 준비하세요" },
        { id: "wild-mist-soak", kind: "weaken", name: "젖은 먹빛", icon: "霧", damage: 20, effect: { type: "weaken", turns: 1 }, effectText: "20 피해 · 기력 약화", threat: "high", threatLabel: "위험", responseHint: "정화와 회복을 준비하세요" }
      ] }]
    }
  });

  const ENCOUNTER_LIBRARY = Object.freeze([
    {
      id: "forest-01",
      stage: 1,
      rewardPoolId: "forest-basic",
      weakElement: ELEMENT_AFFINITIES.wood.weakElement,
      resistElement: ELEMENT_AFFINITIES.wood.resistElement,
      enemies: [{ jaryeongId: "wood-mok", level: 1, maxHp: 105, behaviorId: "wild-growth" }]
    },
    {
      id: "ember-02",
      stage: 2,
      rewardPoolId: "ember-basic",
      weakElement: ELEMENT_AFFINITIES.fire.weakElement,
      resistElement: ELEMENT_AFFINITIES.fire.resistElement,
      enemies: [{ jaryeongId: "fire-hwa", level: 1, maxHp: 155, behaviorId: "wild-ember" }]
    },
    {
      id: "tide-03",
      stage: 3,
      rewardPoolId: "tide-boss",
      weakElement: ELEMENT_AFFINITIES.water.weakElement,
      resistElement: ELEMENT_AFFINITIES.water.resistElement,
      enemies: [{ jaryeongId: "water-sui", level: 2, maxHp: 225, behaviorId: "wild-tide" }]
    }
  ]);

  const ENEMIES = ENCOUNTER_LIBRARY.map((encounter, index) => {
    const slot = encounter.enemies[0];
    const jaryeong = JARYEONG_LIBRARY.find((candidate) => candidate.id === slot.jaryeongId);
    const behavior = WILD_BEHAVIORS[slot.behaviorId];
    const legacy = BASE_ENEMIES[index] || BASE_ENEMIES[0];
    return {
      ...legacy,
      id: encounter.id,
      encounterId: encounter.id,
      jaryeongId: slot.jaryeongId,
      level: slot.level,
      maxHp: slot.maxHp,
      hp: slot.maxHp,
      name: `야생 ${jaryeong?.name || jaryeong?.hanja || "자령"}`,
      glyph: jaryeong?.hanja || legacy.glyph,
      wildLabel: encounter.stage >= 3 ? "우두머리 자령" : "야생 자령",
      className: `enemy-${index + 1}`,
      asset: jaryeong?.asset,
      weakElement: encounter.weakElement,
      resistElement: encounter.resistElement,
      behaviorId: slot.behaviorId,
      behaviorLabel: behavior?.label || "야생 행동",
      phases: behavior?.phases || legacy.phases
    };
  });

  function createRoguelikeEnemy(encounter, index) {
    const jaryeong = JARYEONG_LIBRARY.find((candidate) => candidate.id === encounter.jaryeongId);
    const behavior = WILD_BEHAVIORS[encounter.behaviorId];
    const legacy = BASE_ENEMIES[Math.min(BASE_ENEMIES.length - 1, Math.max(0, encounter.act - 1))] || BASE_ENEMIES[0];
    const basePhases = behavior?.phases?.length ? behavior.phases : legacy.phases;
    const firstDamage = basePhases?.[0]?.sequence?.find((intent) => intent.damage)?.damage || encounter.damage || 12;
    const scale = Math.max(.8, (encounter.damage || firstDamage) / firstDamage);
    const phases = basePhases.map((phase) => ({
      ...phase,
      sequence: phase.sequence.map((intent) => ({
        ...intent,
        damage: Math.max(0, Math.round((intent.damage || 0) * scale)),
        effectText: intent.damage ? `${Math.max(0, Math.round((intent.damage || 0) * scale))} 피해${intent.effect ? ` · ${intent.effectText?.split(" · ").slice(1).join(" · ") || "부가효과"}` : ""}` : intent.effectText
      }))
    }));
    if (encounter.kind === "boss" && phases.length === 1) {
      phases.push({
        ...phases[0],
        id: `${phases[0].id}-awakened`,
        label: "부적 폭주",
        minHpRatio: 0,
        sequence: phases[0].sequence.map((intent) => ({
          ...intent,
          id: `${intent.id}-awakened`,
          name: `폭주 · ${intent.name}`,
          damage: Math.round((intent.damage || 0) * 1.25),
          effectText: `${Math.round((intent.damage || 0) * 1.25)} 피해 · 강화 패턴`,
          threat: "high",
          threatLabel: "위험"
        }))
      });
      phases[0] = { ...phases[0], minHpRatio: .6 };
    }
    return {
      ...legacy,
      ...encounter,
      encounterId: encounter.id,
      hp: encounter.maxHp,
      maxHp: encounter.maxHp,
      glyph: jaryeong?.hanja || legacy.glyph,
      wildLabel: encounter.kind === "boss" ? "장 수호자" : encounter.kind === "elite" ? "정예 자령" : "야생 자령",
      className: `enemy-${index % 3 + 1} ${encounter.kind}`,
      asset: encounter.kind === "boss" ? ASSET_MANIFEST.bosses?.[encounter.id] || jaryeong?.asset : jaryeong?.asset,
      phases
    };
  }

  const ROGUELIKE_ENEMIES = Object.freeze(ENCOUNTER_CATALOG.map(createRoguelikeEnemy));
  const ROGUELIKE_ENEMY_BY_ID = new Map(ROGUELIKE_ENEMIES.map((enemy) => [enemy.encounterId, enemy]));
  const DEBUG_MULTI_ENCOUNTER_IDS = Object.freeze(["forest-sprout", "forest-canopy", "forest-ember"]);

  // Hidden submission QA encounter. Experimental boss mechanics stay isolated
  // here until their clarity and pacing are verified in the browser.
  const DEBUG_PATTERN_TRIAL_ENEMY = Object.freeze({
    id: "debug-pattern-trial",
    encounterId: "debug-pattern-trial",
    jaryeongId: "water-sui",
    name: "결계 시험령 · 수경",
    glyph: "結",
    hp: 240,
    maxHp: 240,
    weakElement: ELEMENT_AFFINITIES.water.weakElement,
    resistElement: ELEMENT_AFFINITIES.water.resistElement,
    className: "enemy-3 debug-pattern-trial",
    wildLabel: "봉인된 시험 자령",
    asset: JARYEONG_LIBRARY.find((jaryeong) => jaryeong.id === "water-sui")?.asset,
    phases: [{
      id: "debug-pattern-cycle",
      label: "세 가지 방해 술식",
      minHpRatio: 0,
      sequence: [
        {
          id: "debug-pattern-seal",
          kind: "control",
          name: "결문 봉쇄",
          icon: "封",
          damage: 6,
          effect: { type: "lockTiles", count: 3, durationTurns: 2, visual: "seal" },
          effectText: "6 피해 · 타일 3개 2턴 봉인",
          threat: "medium",
          threatLabel: "시험",
          responseHint: "봉인되지 않은 칸으로 짧은 경로를 만드세요"
        },
        {
          id: "debug-pattern-queue",
          kind: "control",
          name: "문자 흩뜨리기",
          icon: "散",
          damage: 6,
          effect: { type: "removeQueueCharacters", count: 2 },
          effectText: "6 피해 · 문자 큐에서 임의의 글자 2개 제거",
          threat: "high",
          threatLabel: "시험",
          responseHint: "완성 직전 글자를 먼저 성어에 사용하세요"
        },
        {
          id: "debug-pattern-barrier",
          kind: "guard",
          name: "수경 연성막",
          icon: "結",
          damage: 0,
          effect: { type: "gainElementBarrier", amount: 48, preferredElement: "water", breakMultiplier: 2, mode: "replace" },
          effectText: "수 속성 파괴력 ×2 · 다른 속성도 정상 유효",
          threat: "medium",
          threatLabel: "시험",
          responseHint: "모든 속성으로 깰 수 있으며 수 매치가 두 배 빠릅니다"
        },
        {
          id: "debug-pattern-strike",
          kind: "attack",
          name: "검증 파동",
          icon: "⚔",
          damage: 10,
          effectText: "10 피해 · 시험 주기 반복",
          threat: "medium",
          threatLabel: "시험",
          responseHint: "연성막·봉인·문자 큐 변화를 다시 비교하세요"
        }
      ]
    }]
  });

  function createEnemyPlan() {
    return { phaseIndex: 0, cursor: 0, queue: [], pendingPhaseIndex: null, lastAnnouncedKey: "" };
  }

  const $ = (selector) => document.querySelector(selector);
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const formatDefenseValue = (value) => {
    const safe = Math.max(0, Number(value) || 0);
    return Number.isInteger(safe) ? String(safe) : safe.toFixed(1).replace(/\.0$/, "");
  };
  const state = {
    board: [], queue: [], turn: 1, wave: 0, enemyHp: 0,
    playerHp: BASE_PLAYER_HP, shield: 0, delayed: 0, weakened: false, weakenedTurns: 0, prepared: false,
    enemyBurn: 0, enemyBurnTurns: 0, nextElementBoosts: {},
    reviveUsed: false, totalCombos: 0, totalIdioms: 0,
    dragging: false, dragMoved: false, resolving: false, jaryeongSkillAnimating: false, selected: null, keyboardFocus: { r: 0, c: 0 }, timerId: null, moveStartedAt: 0, currentMoveLimit: MOVE_SECONDS,
    freshQueueIds: new Set(), gameOver: false, pointerX: 0, pointerY: 0,
    mode: null, pangRunning: false, pangScore: 0, pangBestCombo: 0,
    pangMoves: 0, pangTimeLeft: PANG_SECONDS, pangTimerId: null,
    pangLastTick: 0, pangOrigin: null, pangTarget: null, pangMoved: false,
    pangEndPending: false, dragPreview: null, readingMode: "large", idiomSpeed: "slow", battleDisplayMode: "slow", idiomDisplayMode: "all-large", swapAnimationUntil: 0, audioContext: null,
    enemyPlan: createEnemyPlan(), stageIdiomIds: [], usedStageIdiomIds: new Set(), rotatingIdiomIds: [], usedRotatingIdiomIds: new Set(), readyIdiomIds: new Set(), run: null,
    nextIdiomRecipeTurn: 0, idiomRecipeInterval: 0, recipeSupplyUntilTurn: 0, idiomDetailId: null, focusedIdiomId: null, jaryeongInspectorId: null,
    nextMoveBonus: 0, enemyMovePenalty: 0, currentChargeBonus: 0, nextChargeBonus: 0, nextPlayerDamageBonus: 0, nextWeaknessDamageBonus: 0,
    enemyVulnerableTurns: 0, enemyVulnerableRatio: 0, enemySilenced: 0, healReductionTurns: 0, healReductionRatio: 0,
    reflectNextEnemyAttack: null, nextEnemyDamageReduction: 0, enemyDamageMultiplier: 1, enemyShield: 0, enemyElementBarrier: null,
    healingFieldTurns: 0, healingFieldAmount: 0, phoenixRebirthReady: 0, damageSplitHits: 0, damageSplitRatio: 0,
    deferredDamage: 0, deferredDamageTicks: 0, boundEnemyIntentTurns: 0,
    idiomGrowthStacks: 0, turnsSinceIdiom: 0, lastActivatedIdiomId: null,
    lastTurnElementDamage: {}, lastMatchGroupSizes: [], lastWideMatchElements: [], lastPlayerHealing: 0, turnTotals: { damage: 0, heal: 0, shield: 0, burn: 0, delay: 0, elementDamage: {} },
    lockedTiles: new Map(), activeSealVisual: "seal", combatObjective: null, rareEncounter: null, firstBattleOnboarding: null, storySession: null, storyGuardEarthProcUsed: false, storyDragSnapshot: null,
    debugEnemyOverride: null, debugEnemyGroup: null,
    sessionRng: createSeededRng(`session-${Date.now()}`)
  };

  const audioDirector = new AudioDirector(AUDIO_MANIFEST);
  const META_KEY = "sajayeonseong-meta-v1";
  const RUN_SAVE_FIELDS = [
    "board", "queue", "turn", "wave", "enemyHp", "playerHp", "shield", "delayed", "weakened", "weakenedTurns", "prepared",
    "enemyBurn", "enemyBurnTurns", "nextElementBoosts", "reviveUsed", "totalCombos", "totalIdioms", "stageIdiomIds", "rotatingIdiomIds",
    "nextIdiomRecipeTurn", "idiomRecipeInterval", "recipeSupplyUntilTurn", "nextMoveBonus", "enemyMovePenalty",
    "currentChargeBonus", "nextChargeBonus", "nextPlayerDamageBonus", "nextWeaknessDamageBonus", "enemyVulnerableTurns",
    "enemyVulnerableRatio", "enemySilenced", "healReductionTurns", "healReductionRatio", "reflectNextEnemyAttack",
    "nextEnemyDamageReduction", "enemyDamageMultiplier", "enemyShield", "enemyElementBarrier", "idiomGrowthStacks", "turnsSinceIdiom", "lastActivatedIdiomId",
    "healingFieldTurns", "healingFieldAmount", "phoenixRebirthReady", "damageSplitHits", "damageSplitRatio", "deferredDamage", "deferredDamageTicks", "boundEnemyIntentTurns",
    "lastTurnElementDamage", "lastMatchGroupSizes", "lastPlayerHealing", "turnTotals", "enemyPlan", "activeSealVisual", "combatObjective", "rareEncounter", "firstBattleOnboarding", "gameOver"
  ];
  let runSaveTimer = null;
  let nodeChoiceResolving = false;
  let rewardChoiceResolving = false;

  function loadMetaProgress() {
    const defaultJaryeongMeta = createDefaultJaryeongMetaState();
    const defaults = {
      ink: 0,
      maxHpBonus: 0,
      startShieldBonus: 0,
      rewardRerolls: 1,
      selectedVolumeIndex: 0,
      unlockedVolumes: 10,
      sealRank: 0,
      seenCharacters: [],
      usedCharacters: [],
      masteredCharacters: [],
      seenIdioms: [],
      usedIdioms: [],
      masteredIdioms: [],
      seenJaryeongs: Object.keys(defaultJaryeongMeta.owned),
      jaryeongMeta: defaultJaryeongMeta,
      completedRuns: 0,
      bestTimeMs: null
    };
    try {
      const loaded = { ...defaults, ...JSON.parse(localStorage.getItem(META_KEY) || "{}") };
      loaded.jaryeongMeta = sanitizeJaryeongMetaState(loaded.jaryeongMeta || loaded);
      loaded.seenJaryeongs = [...new Set([
        ...(Array.isArray(loaded.seenJaryeongs) ? loaded.seenJaryeongs : []),
        ...Object.keys(loaded.jaryeongMeta.owned || {})
      ])];
      return loaded;
    } catch { return defaults; }
  }

  const metaProgress = loadMetaProgress();

  function loadStoryProgress() {
    try { return sanitizeStoryProgress(JSON.parse(localStorage.getItem(STORY_TRAINING_STORAGE_KEY) || "{}")); }
    catch { return createDefaultStoryProgress(); }
  }

  let storyProgress = loadStoryProgress();
  let selectedStoryChapterId = "disaster-gate";
  const IMPLEMENTED_STORY_CHAPTER_IDS = new Set(["disaster-gate", "five-lights", "gathered-letters", "four-letter-power", "read-the-intent", "journey-begins"]);
  const DEFAULT_STORY_INTRO_STEPS = Object.freeze([
    Object.freeze({ title: "누르고 유지", copy: "타일 하나를 잡은 채 손을 떼지 마세요" }),
    Object.freeze({ title: "경로 그리기", copy: "지나가는 칸마다 타일이 계속 자리를 바꿉니다" }),
    Object.freeze({ title: "놓아서 연성", copy: "원하는 자리에서 놓으면 여러 매치를 한 번에 판정합니다" })
  ]);
  const STORY_PRESENTATION = Object.freeze({
    "disaster-gate": Object.freeze({
      introKicker: "第壹章 · 문자술사의 첫 수련",
      introTitle: "재앙의 문 앞에서,<br /><span>첫 연성</span>을 배우세요.",
      introCopy: "타일 하나를 누른 채 이웃 칸을 지나가면 지나온 칸과 계속 자리가 바뀝니다. 원하는 자리에서 손을 놓아 같은 오행 세 개를 이으세요.",
      activeTitle: "잡고 · 끌고 · 놓으세요",
      activeGuide: "빛나는 木을 누른 채 위 칸까지 끌고 가세요. 손을 놓는 순간 보드가 판정됩니다.",
      completeTitle: "첫 빛을 이었습니다",
      completeGuide: "같은 빛 세 개가 이어졌습니다. 첫 연성의 원리를 기록합니다.",
      progressLabel: (session) => `${session.progress} / ${session.target} 매치`,
      startLog: "木 타일을 누른 채 위 칸까지 끌고 가세요. 손을 놓을 때 매치가 판정됩니다.",
      resultTitle: "첫 빛을 이었습니다",
      resultCopy: "핵심은 한 칸 교환이 아니라 ‘누른 채 이동’입니다. 지나가는 칸마다 자리가 바뀌고, 손을 놓는 순간 매치가 판정됩니다.",
      recap: [["1", "누르고 유지"], ["2", "경로 이동"], ["3", "놓아서 판정"]]
    }),
    "five-lights": Object.freeze({
      introKicker: "第貳章 · 다섯 빛의 흐름",
      introTitle: "한 번의 이동으로,<br /><span>두 빛</span>을 깨우세요.",
      introCopy: "이제 한 칸에서 손을 떼지 않습니다. 표시된 交 타일을 잡고 ‘위 → 왼쪽 → 왼쪽’으로 이어서 끌어 한 번의 경로로 2콤보를 완성하세요.",
      activeTitle: "손을 떼지 말고 길게 이으세요",
      activeGuide: "交를 누른 채 위 → 왼쪽 → 왼쪽. 마지막 칸에서 놓아야 토·화 2콤보가 함께 완성됩니다.",
      completeTitle: "두 빛을 함께 깨웠습니다",
      completeGuide: "한 번의 이동으로 두 매치를 만들었습니다. 콤보가 공격과 부가효과를 함께 키웁니다.",
      progressLabel: (session) => `${session.progress} / ${session.target} 콤보`,
      startLog: "交를 잡고 손을 떼지 않은 채 위 → 왼쪽 → 왼쪽으로 이동하세요. 마지막 칸에서 놓으면 2콤보가 완성됩니다.",
      resultTitle: "한 번의 경로로 두 빛을 깨웠습니다",
      resultCopy: "한 타일을 오래 끌수록 보드 전체를 재배치할 수 있습니다. 좋은 경로 하나가 여러 매치와 콤보를 동시에 만듭니다.",
      recap: [["1", "누른 채 이동"], ["2", "경로 설계"], ["3", "2콤보 동시 완성"]]
    }),
    "gathered-letters": Object.freeze({
      introKicker: "第參章 · 모인 글자의 뜻",
      introTitle: "사라진 타일에서,<br /><span>글자</span>를 모으세요.",
      introCopy: "매치된 타일의 한자는 아래 문자 큐에 남습니다. 표시된 森 타일을 위로 옮겨 木과 林을 함께 모으세요.",
      activeTitle: "木과 林을 문자 큐에 모으세요",
      activeGuide: "빛나는 森 타일을 바로 위 칸으로 옮기면 木·林이 포함된 목 매치가 완성됩니다.",
      completeTitle: "글자가 부적으로 남았습니다",
      completeGuide: "매치된 木과 林이 문자 큐에 모였습니다. 네 글자가 모이면 사자성어가 발동합니다.",
      progressLabel: (session) => ["木", "林"].map((char) => `${char} ${session.collected?.includes(char) ? "✓" : "○"}`).join(" · "),
      startLog: "표시된 森 타일을 위 칸으로 옮겨 木과 林을 문자 큐에 모으세요.",
      resultTitle: "글자가 부적으로 남았습니다",
      resultCopy: "매치된 한자는 문자 큐에 쌓입니다. 필요한 네 글자를 모으면 사자성어 부적이 발동합니다.",
      recap: [["1", "한자 매치"], ["2", "문자 큐 수집"], ["3", "성어 재료 준비"]]
    }),
    "four-letter-power": Object.freeze({
      introKicker: "第肆章 · 네 글자의 힘",
      introTitle: "모아 둔 세 글자에,<br /><span>마지막 한 글자</span>를 더하세요.",
      introCopy: "앞선 수련에서 모아 둔 一·石·二가 문자 큐에 있습니다. 빛나는 鳥 타일을 위로 옮겨 매치하면 네 글자가 갖춰집니다. 실제로 일석이조가 발동하며, 사용한 네 글자는 큐에서 사라집니다.",
      activeTitle: "일석이조를 발동하세요",
      activeGuide: "빛나는 鳥 타일을 바로 위 칸으로 옮기세요. 一·石·二에 鳥가 더해져 일석이조가 실제로 발동합니다.",
      completeTitle: "일석이조가 발동했습니다",
      completeGuide: "실제 성어 효과가 적용됐고, 사용한 一·石·二·鳥는 문자 큐에서 사라졌습니다.",
      progressLabel: (session) => `${session.progress} / ${session.target} 성어 발동`,
      startLog: "문자 큐의 一·石·二에 鳥를 더하세요. 이번 수련에서는 고정 연성식 일석이조만 발동합니다.",
      resultTitle: "일석이조가 두 번 울렸습니다",
      resultCopy: "일석이조(一石二鳥)는 한 가지 일로 두 가지 이익을 얻는다는 뜻입니다. 한 번의 성과가 두 번 울리듯 이번 턴의 피해·회복·보호막이 절반만큼 한 번 더 적용됐습니다. 성어마다 고유 효과가 있으니, 연성행로에서는 필요한 네 글자를 모아 전략에 맞게 발동하세요.",
      recap: [["一石二鳥", "네 글자 완성"], ["발동", "문자 큐 소비"], ["고유 효과", "한 번 더 울림"]]
    }),
    "read-the-intent": Object.freeze({
      introKicker: "第伍章 · 적의 예고",
      introTitle: "다가올 일곱 피해를,<br /><span>토 보호막</span>으로 막으세요.",
      introCopy: "적의 의도는 미리 보입니다. 빛나는 土 타일을 위로 옮겨 토 3매치를 만들면 보호막이 생깁니다. 다음 적 턴의 등걸 내려치기 7 피해를 체력 피해 0으로 모두 막아야 수련이 완료됩니다.",
      activeTitle: "등걸 내려치기를 모두 막으세요",
      activeGuide: "빛나는 土 타일을 바로 위 칸으로 옮겨 토 3매치를 만드세요. 토 보호막이 다음 적 턴의 7 피해를 모두 막습니다.",
      completeTitle: "보호막이 7을 모두 막음",
      completeGuide: "예고된 공격의 체력 피해가 0이 되었습니다. 적 의도와 방어 결과를 함께 확인했습니다.",
      progressLabel: (session) => `${session.progress} / ${session.target} 완전 방어`,
      startLog: "등걸 내려치기 7 피해가 다음 적 턴에 옵니다. 토 매치로 보호막을 만들고 체력 피해 없이 막으세요.",
      resultTitle: "보호막이 7을 모두 막음",
      resultCopy: "적의 예고 ‘등걸 내려치기 · 7 피해’를 읽고 토 매치로 만든 보호막이 7을 모두 막음. 체력 피해가 0이 된 것을 확인한 뒤 수련을 마칩니다.",
      recap: [["1", "적 의도 읽기"], ["2", "토 3매치"], ["3", "7 전부 방어"]]
    }),
    "journey-begins": Object.freeze({
      introKicker: "第陸章 · 행로의 시작",
      introTitle: "여섯 수련을 지나,<br /><span>연성행로</span>를 준비하세요.",
      introCopy: "빛 세 개를 이어 글자를 모으고, 네 글자로 성어를 발동하고, 적의 예고에는 맞는 대응을 고릅니다. 이제 배운 규칙을 실제 행로의 빌드로 이어갈 차례입니다.",
      introSteps: Object.freeze([
        Object.freeze({ title: "빛 연결", copy: "같은 빛 3개를 이어 매치를 만듭니다" }),
        Object.freeze({ title: "글자·성어", copy: "문자 큐로 네 글자 성어를 준비합니다" }),
        Object.freeze({ title: "예고 대응", copy: "적 의도를 읽고 맞는 효과를 고릅니다" })
      ]),
      startButtonLabel: "수련을 마치고 행로 준비 보기",
      activeTitle: "연성행로 준비를 엽니다",
      activeGuide: "배운 규칙은 행로에서 자령·성어·유물 빌드로 이어집니다.",
      completeTitle: "수련을 졸업했습니다",
      completeGuide: "연성행로 준비 화면이 열렸습니다. 출발 전 리더와 성어를 고르세요.",
      progressLabel: (session) => `${session.progress} / ${session.target} 행로 준비`,
      startLog: "수련에서 배운 빛·문자·성어·예고 대응을 실제 연성행로 준비에서 이어갑니다.",
      resultTitle: "수련을 졸업했습니다",
      resultCopy: "빛 3매치, 문자 큐, 사자성어, 적 의도 대응을 실제 연성행로의 선택과 빌드로 이어갈 준비가 되었습니다.",
      recap: [["빛 연결", "3매치"], ["글자·성어", "문자 큐"], ["예고 대응", "방어 선택"]]
    })
  });

  const STORY_PATH_GUIDES = Object.freeze({
    "disaster-gate": Object.freeze({ path: Object.freeze([[1, 2], [0, 2]]), caption: "누른 채 위로", result: "놓으면 1 MATCH" }),
    "five-lights": Object.freeze({ path: Object.freeze([[1, 2], [0, 2], [0, 1], [0, 0]]), caption: "손을 떼지 말고 · 위 → 왼쪽 → 왼쪽", result: "마지막에 놓기 · 2 COMBO" }),
    "gathered-letters": Object.freeze({ path: Object.freeze([[1, 2], [0, 2]]), caption: "森을 누른 채 위로", result: "木 · 林 수집" }),
    "four-letter-power": Object.freeze({ path: Object.freeze([[1, 2], [0, 2]]), caption: "鳥를 누른 채 위로", result: "一石二鳥 발동" }),
    "read-the-intent": Object.freeze({ path: Object.freeze([[1, 2], [0, 2]]), caption: "土를 누른 채 위로", result: "보호막 생성" })
  });

  function activeStoryPathGuide() {
    if (state.mode !== "puzzle" || state.storySession?.status !== "active" || state.turn !== 1 || state.totalCombos !== 0) return null;
    return STORY_PATH_GUIDES[state.storySession.chapterId] || null;
  }

  function isExpectedStoryPathCell(row, col, index) {
    const guide = activeStoryPathGuide();
    if (!guide) return true;
    const expected = guide.path?.[index];
    return Boolean(expected && expected[0] === row && expected[1] === col);
  }

  function isStoryPathComplete() {
    const guide = activeStoryPathGuide();
    return !guide || (state.dragTrail?.length || 0) >= guide.path.length;
  }

  function rejectStoryPathGesture(message) {
    showBattleFeedback("prepare", "수련 경로를 따라가세요", message);
    addLog(`<strong>수련 경로 고정</strong> · ${message}`, "miss");
    $("#board .story-guide-start")?.focus({ preventScroll: true });
  }

  let storyPathAnimation = null;
  let storyPathSignature = "";

  function hideStoryPathDemo() {
    storyPathAnimation?.cancel?.();
    storyPathAnimation = null;
    storyPathSignature = "";
    const demo = $("#story-path-demo");
    if (demo) demo.hidden = true;
  }

  function hideLiveDragPath() {
    const svg = $("#drag-live-svg");
    if (svg) svg.hidden = true;
    const banner = $("#drag-state-banner");
    if (banner) banner.hidden = true;
  }

  function renderLiveDragPath() {
    const svg = $("#drag-live-svg");
    const line = $("#drag-live-line");
    const board = $("#board");
    const banner = $("#drag-state-banner");
    const count = $("#drag-state-count");
    if (!svg || !line || !board || !state.dragging || state.mode === "pang" || !Array.isArray(state.dragTrail) || !state.dragTrail.length) {
      hideLiveDragPath();
      return;
    }
    if (banner) banner.hidden = false;
    if (count) {
      const moves = Math.max(0, state.dragTrail.length - 1);
      count.textContent = moves ? `${moves}칸 이동 중` : "잡은 상태";
    }
    // The full journey leaves route planning to the player. The small holding
    // banner stays useful, while the drawn line remains a tutorial-only aid.
    if (state.mode === "roguelike") {
      svg.hidden = true;
      return;
    }
    if (state.dragTrail.length < 2) {
      svg.hidden = true;
      return;
    }
    const wrap = board.parentElement;
    const wrapRect = wrap?.getBoundingClientRect();
    if (!wrapRect?.width || !wrapRect?.height) return hideLiveDragPath();
    const points = state.dragTrail.map((key) => {
      const [row, col] = String(key).split(",").map(Number);
      const tile = board.querySelector(`[data-row="${row}"][data-col="${col}"]`);
      const rect = tile?.getBoundingClientRect();
      if (!rect) return null;
      return `${rect.left - wrapRect.left + rect.width / 2},${rect.top - wrapRect.top + rect.height / 2}`;
    }).filter(Boolean);
    if (points.length < 2) {
      svg.hidden = true;
      return;
    }
    svg.setAttribute("viewBox", `0 0 ${wrapRect.width} ${wrapRect.height}`);
    line.setAttribute("points", points.join(" "));
    svg.hidden = false;
  }

  function renderStoryPathDemo() {
    const demo = $("#story-path-demo");
    const board = $("#board");
    const guide = activeStoryPathGuide();
    if (!demo || !board || !guide || state.dragging || state.resolving || state.gameOver) return hideStoryPathDemo();
    const wrap = demo.parentElement;
    const wrapRect = wrap?.getBoundingClientRect();
    if (!wrapRect?.width || !wrapRect?.height) return hideStoryPathDemo();
    const points = guide.path.map(([r, c]) => {
      const tile = board.querySelector(`[data-row="${r}"][data-col="${c}"]`);
      const rect = tile?.getBoundingClientRect();
      if (!rect) return null;
      return { x: rect.left - wrapRect.left + rect.width / 2, y: rect.top - wrapRect.top + rect.height / 2 };
    });
    if (points.some((point) => !point)) return hideStoryPathDemo();
    const signature = `${state.storySession.chapterId}|${Math.round(wrapRect.width)}x${Math.round(wrapRect.height)}|${points.map((p) => `${Math.round(p.x)},${Math.round(p.y)}`).join(";")}`;
    demo.hidden = false;
    $("#story-path-svg").setAttribute("viewBox", `0 0 ${wrapRect.width} ${wrapRect.height}`);
    $("#story-path-line").setAttribute("points", points.map((point) => `${point.x},${point.y}`).join(" "));
    $("#story-path-caption").textContent = guide.caption;
    $("#story-path-result").textContent = guide.result;
    $("#story-path-steps").innerHTML = points.map((point, index) => `<span style="left:${point.x}px;top:${point.y}px" data-step="${index === 0 ? "잡기" : index === points.length - 1 ? "놓기" : index}"></span>`).join("");
    if (signature === storyPathSignature && storyPathAnimation) return;
    storyPathAnimation?.cancel?.();
    storyPathSignature = signature;
    const cursor = $("#story-path-cursor");
    if (!cursor) return;
    const translate = (point, scale = 1) => `translate(${point.x}px, ${point.y}px) translate(-50%, -50%) scale(${scale})`;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      cursor.style.transform = translate(points[0]);
      return;
    }
    const travelStart = .16;
    const travelEnd = .72;
    const keyframes = [
      { transform: translate(points[0], .72), opacity: 0, offset: 0 },
      { transform: translate(points[0], 1), opacity: 1, offset: .08 },
      { transform: translate(points[0], .9), opacity: 1, offset: travelStart }
    ];
    points.slice(1).forEach((point, index) => {
      const denominator = Math.max(1, points.length - 1);
      keyframes.push({ transform: translate(point, .9), opacity: 1, offset: travelStart + (index + 1) / denominator * (travelEnd - travelStart) });
    });
    const finalPoint = points[points.length - 1];
    keyframes.push(
      { transform: translate(finalPoint, 1.08), opacity: 1, offset: .8 },
      { transform: translate(finalPoint, .86), opacity: 0, offset: .9 },
      { transform: translate(points[0], .72), opacity: 0, offset: 1 }
    );
    if (typeof cursor.animate !== "function") {
      cursor.style.transform = translate(points[0]);
      cursor.style.opacity = "1";
      return;
    }
    storyPathAnimation = cursor.animate(keyframes, { duration: guide.path.length > 2 ? 3600 : 2800, iterations: Infinity, easing: "ease-in-out" });
  }

  function saveStoryProgress() {
    storyProgress = sanitizeStoryProgress(storyProgress);
    try { localStorage.setItem(STORY_TRAINING_STORAGE_KEY, JSON.stringify(storyProgress)); } catch {}
  }

  function saveMetaProgress() {
    metaProgress.jaryeongMeta = sanitizeJaryeongMetaState(metaProgress.jaryeongMeta);
    try { localStorage.setItem(META_KEY, JSON.stringify(metaProgress)); } catch {}
  }

  function cloneSaveValue(value) {
    if (value == null) return value;
    try { return structuredClone(value); } catch { return JSON.parse(JSON.stringify(value)); }
  }

  const SOFT_ELEMENT_BARRIER_KIND = "soft-element-barrier";
  const SOFT_ELEMENT_BARRIER_VERSION = 2;

  function getElementMeta(elementId) {
    return ELEMENTS.find((element) => element.id === elementId) || ELEMENTS[0];
  }

  function createSoftElementBarrier({ hp = 0, maxHp = hp, preferredElement = "water", breakMultiplier = 2 } = {}) {
    const safeHp = Math.max(0, Number(hp) || 0);
    if (!safeHp) return null;
    const safeElement = ELEMENTS.some((element) => element.id === preferredElement) ? preferredElement : "water";
    const safeMultiplier = Math.max(1, Number(breakMultiplier) || 2);
    return {
      kind: SOFT_ELEMENT_BARRIER_KIND,
      version: SOFT_ELEMENT_BARRIER_VERSION,
      hp: safeHp,
      maxHp: Math.max(safeHp, Number(maxHp) || safeHp),
      preferredElement: safeElement,
      breakMultiplier: safeMultiplier
    };
  }

  function sanitizeSoftElementBarrier(rawBarrier) {
    if (!rawBarrier || typeof rawBarrier !== "object" || Array.isArray(rawBarrier)) return null;
    if (rawBarrier.kind !== SOFT_ELEMENT_BARRIER_KIND || Number(rawBarrier.version) !== SOFT_ELEMENT_BARRIER_VERSION) return null;
    return createSoftElementBarrier(rawBarrier);
  }

  function resolveElementBarrierHit(rawBarrier, rawDamage, attackElement = null) {
    const barrier = sanitizeSoftElementBarrier(rawBarrier);
    const damage = Math.max(0, Number(rawDamage) || 0);
    if (!barrier || !damage) {
      return {
        barrier,
        barrierDamage: 0,
        rawConsumed: 0,
        overflowDamage: damage,
        preferred: false,
        multiplier: 1,
        broken: !barrier
      };
    }
    const preferred = attackElement === barrier.preferredElement;
    const multiplier = preferred ? barrier.breakMultiplier : 1;
    const barrierDamage = Math.min(barrier.hp, damage * multiplier);
    const rawConsumed = barrierDamage / multiplier;
    const remainingHp = Math.max(0, barrier.hp - barrierDamage);
    return {
      barrier: remainingHp > 0 ? { ...barrier, hp: remainingHp } : null,
      barrierDamage,
      rawConsumed,
      overflowDamage: Math.max(0, damage - rawConsumed),
      preferred,
      multiplier,
      broken: remainingHp <= 0
    };
  }

  function legacyElementBarrierHp(rawBarrier) {
    if (!rawBarrier || typeof rawBarrier !== "object" || Array.isArray(rawBarrier)) return 0;
    if (rawBarrier.kind === SOFT_ELEMENT_BARRIER_KIND && Number(rawBarrier.version) === SOFT_ELEMENT_BARRIER_VERSION) return 0;
    const hp = Math.max(0, Number(rawBarrier.hp) || 0);
    const remainingTurns = Math.max(0, Math.floor(Number(rawBarrier.remainingTurns) || 0));
    return remainingTurns > 0 ? hp : 0;
  }

  function captureRunBattleState() {
    const battle = {};
    RUN_SAVE_FIELDS.forEach((key) => { battle[key] = cloneSaveValue(state[key]); });
    battle.freshQueueIds = [...state.freshQueueIds];
    battle.usedStageIdiomIds = [...state.usedStageIdiomIds];
    battle.usedRotatingIdiomIds = [...state.usedRotatingIdiomIds];
    battle.readyIdiomIds = [...state.readyIdiomIds];
    battle.lockedTiles = [...state.lockedTiles.entries()];
    battle.battleLogHtml = $("#battle-log")?.innerHTML || "";
    return battle;
  }

  function readActiveRunSave() {
    let raw = null;
    try { raw = localStorage.getItem(RUN_SAVE_KEY); } catch { return null; }
    const decoded = decodeRunSave(raw);
    if (decoded.ok) return decoded.payload;
    if (raw) {
      try { localStorage.removeItem(RUN_SAVE_KEY); } catch {}
    }
    return null;
  }

  function formatRunSaveElapsed(milliseconds) {
    const totalSeconds = Math.max(0, Math.floor((Number(milliseconds) || 0) / 1000));
    return `${Math.floor(totalSeconds / 60)}분 ${String(totalSeconds % 60).padStart(2, "0")}초`;
  }

  function syncRunSaveControls() {
    const panel = $("#roguelike-resume-panel");
    const startButton = $("#roguelike-start-button");
    if (!panel || !startButton) return;
    const saved = readActiveRunSave();
    panel.hidden = !saved;
    startButton.innerHTML = saved ? `새 행로 시작 <span>↻</span>` : `행로 출발 <span>→</span>`;
    startButton.classList.toggle("has-save", Boolean(saved));
    if ($("#volume-picker-title")) $("#volume-picker-title").textContent = saved ? "새 행로 문자권" : "이번 런 문자권";
    const menuJourneyLabel = $("#menu-journey-label");
    if (menuJourneyLabel) menuJourneyLabel.textContent = saved ? "연성행로 이어가기" : "연성행로 출발";
    if (!saved) return;
    const stage = describeRunSaveStage(saved);
    const savedVolume = CHARACTER_VOLUMES[clamp(Number(saved.run.characterVolumeIndex) || 0, 0, CHARACTER_VOLUMES.length - 1)];
    $("#roguelike-save-title").textContent = `제${saved.run.act || 1}막 · ${stage.label}`;
    $("#roguelike-save-seed").textContent = `시드 ${saved.run.seed}`;
    $("#roguelike-save-summary").textContent = `노드 ${Math.min(15, (saved.run.routeIndex || 0) + 1)} / 15 · ${savedVolume?.label || "문자권 미정"} · 플레이 ${formatRunSaveElapsed(saved.elapsedMs)}`;
  }

  function clearActiveRunSave({ sync = true } = {}) {
    if (runSaveTimer) clearTimeout(runSaveTimer);
    runSaveTimer = null;
    try { localStorage.removeItem(RUN_SAVE_KEY); } catch {}
    if (sync) syncRunSaveControls();
  }

  function saveActiveRun({ allowGameOver = false } = {}) {
    if (state.mode !== "roguelike" || !state.run) return false;
    if (state.run.completed || state.run.finalized) {
      clearActiveRunSave();
      return false;
    }
    if (state.dragging || state.resolving || (state.gameOver && !allowGameOver)) return false;
    try {
      const raw = encodeRunSave({
        run: cloneSaveValue(state.run),
        battle: captureRunBattleState(),
        elapsedMs: Date.now() - (state.run.startedAt || Date.now())
      });
      localStorage.setItem(RUN_SAVE_KEY, raw);
      syncRunSaveControls();
      return true;
    } catch (error) {
      console.warn("run save skipped", error);
      return false;
    }
  }

  function scheduleActiveRunSave() {
    if (state.mode !== "roguelike" || !state.run) return;
    if (runSaveTimer) clearTimeout(runSaveTimer);
    runSaveTimer = setTimeout(() => {
      runSaveTimer = null;
      saveActiveRun();
    }, 0);
  }

  function restoreRunBattleState(battle) {
    RUN_SAVE_FIELDS.forEach((key) => { state[key] = cloneSaveValue(battle[key]); });
    [
      "lastPlayerHealing", "healingFieldTurns", "healingFieldAmount", "phoenixRebirthReady",
      "damageSplitHits", "damageSplitRatio", "deferredDamage", "deferredDamageTicks",
      "boundEnemyIntentTurns", "weakenedTurns"
    ].forEach((key) => { state[key] = Number(state[key]) || 0; });
    if (state.weakened && state.weakenedTurns <= 0) state.weakenedTurns = 1;
    state.freshQueueIds = new Set(battle.freshQueueIds || []);
    state.usedStageIdiomIds = new Set(battle.usedStageIdiomIds || []);
    state.usedRotatingIdiomIds = new Set(battle.usedRotatingIdiomIds || []);
    state.readyIdiomIds = new Set(battle.readyIdiomIds || []);
    state.lockedTiles = new Map(battle.lockedTiles || []);
    state.activeSealVisual = typeof battle.activeSealVisual === "string" ? battle.activeSealVisual : "seal";
    // Save v1 compatibility: the retired hard-immunity barrier becomes a common
    // shield. Only the versioned soft barrier (all elements valid) is restored.
    const legacyBarrierHp = legacyElementBarrierHp(battle.enemyElementBarrier);
    if (legacyBarrierHp) {
      state.enemyShield = Math.max(0, Number(state.enemyShield) || 0) + legacyBarrierHp;
      state.enemyElementBarrier = null;
    } else {
      state.enemyElementBarrier = sanitizeSoftElementBarrier(battle.enemyElementBarrier);
    }
    state.combatObjective = normalizeCombatObjectiveState(battle.combatObjective);
    state.rareEncounter = battle.rareEncounter && typeof battle.rareEncounter === "object" ? cloneSaveValue(battle.rareEncounter) : null;
    state.dragging = false;
    state.dragMoved = false;
    state.selected = null;
    state.keyboardFocus = { r: 0, c: 0 };
    state.timerId = null;
    state.resolving = false;
    state.jaryeongSkillAnimating = false;
    state.swapAnimationUntil = 0;
    clearDragPreview();
    if ($("#battle-log")) $("#battle-log").innerHTML = battle.battleLogHtml || "";
  }

  function resumeRoguelikeRun() {
    const saved = readActiveRunSave();
    if (!saved) {
      setStoryGraduationBannerVisible(false);
      syncRunSaveControls();
      return;
    }
    setStoryGraduationBannerVisible(false);
    closeGameOverlays();
    $("#main-menu").classList.remove("open");
    document.body.classList.remove("menu-mode", "puzzle-mode", "pang-mode");
    document.body.classList.add("roguelike-mode");
    state.mode = "roguelike";
    state.run = cloneSaveValue(saved.run);
    const savedMaxHp = Math.max(1, Number(state.run.maxHp) || BASE_PLAYER_HP);
    state.run.maxHp = Math.max(BASE_PLAYER_HP, savedMaxHp);
    state.run.moveSeconds = Math.max(MOVE_SECONDS, Number(state.run.moveSeconds) || 0);
    state.run.queueMax = Math.max(RUN_LIMITS.baseQueueMax, Number(state.run.queueMax) || 0);
    state.run.startedAt = Date.now() - saved.elapsedMs;
    restoreRunBattleState(saved.battle);
    state.playerHp = Math.min(state.run.maxHp, Math.max(0, Number(state.playerHp) || 0) + Math.max(0, state.run.maxHp - savedMaxHp));
    $("#mode-kicker").textContent = "ROGUELIKE MODE";
    $("#mode-title").textContent = "연성행로";
    updateAll();
    addLog(`<strong>행로 이어하기</strong> · ${state.run.seed} · 같은 시드와 보드 상태를 복원했습니다.`, "start");
    if (state.gameOver && state.playerHp <= 0 && !state.reviveUsed) {
      finishRoguelikeRun(false, { canRevive: true, restored: true });
    } else if (!state.run.leaderJaryeongId) {
      openRoguelikeLeaderPicker();
    } else if (state.run.idiomBookIds.length < INITIAL_IDIOM_DRAFT_COUNT) {
      openRoguelikeDraft();
    } else if (state.run.pendingIdiomReplacementId) {
      renderIdiomReplacement();
      $("#idiom-replacement-modal").classList.add("open");
    } else if (state.run.pendingContractJaryeongId) {
      renderJaryeongContract();
      $("#jaryeong-contract-modal").classList.add("open");
    } else if (state.run.pendingReward) {
      renderRoguelikeRewards();
      $("#roguelike-reward-modal").classList.add("open");
    } else if (state.run.currentEncounterId) {
      updateAll();
    } else if (state.run.currentNodeId) {
      const node = currentRouteTier()?.choices.find((candidate) => candidate.id === state.run.currentNodeId);
      if (node) openRunNode(node);
      else openRoguelikeRoute();
    } else {
      openRoguelikeRoute();
    }
    playRoguelikeBgm({ immediate: true });
    saveActiveRun({ allowGameOver: state.gameOver });
  }

  function rememberMeta(key, values) {
    const next = new Set(metaProgress[key] || []);
    (Array.isArray(values) ? values : [values]).filter(Boolean).forEach((value) => next.add(value));
    metaProgress[key] = [...next];
  }

  function syncAudioControls() {
    const { bgmEnabled, sfxEnabled, bgmVolume, sfxVolume } = audioDirector.settings;
    if ($("#bgm-enabled")) $("#bgm-enabled").checked = bgmEnabled;
    if ($("#sfx-enabled")) $("#sfx-enabled").checked = sfxEnabled;
    if ($("#bgm-volume")) $("#bgm-volume").value = Math.round(bgmVolume * 100);
    if ($("#sfx-volume")) $("#sfx-volume").value = Math.round(sfxVolume * 100);
  }

  function randomValue() {
    return randomFrom(state.run?.rng || state.sessionRng);
  }

  function shuffled(items) {
    return shuffleWithRng(items, state.run?.rng || state.sessionRng);
  }

  function idiomsFromIds(ids = []) {
    const byId = new Map(ALL_IDIOMS.map((idiom) => [idiom.id, idiom]));
    return ids.map((id) => byId.get(id)).filter(Boolean);
  }

  function getFixedIdioms() {
    if (state.mode === "pang") return PANG_IDIOMS;
    if (state.mode === "roguelike" && state.run) return idiomsFromIds(state.run.activeIdiomIds || []);
    if (state.stageIdiomIds?.length) return idiomsFromIds(state.stageIdiomIds);
    return (ACTIVE_IDIOMS.length ? ACTIVE_IDIOMS : IDIOMS).slice(0, IDIOM_RECIPE_COUNT);
  }

  function getRotatingIdioms() {
    return state.mode === "pang" ? [] : idiomsFromIds(state.rotatingIdiomIds);
  }

  function getCurrentIdioms() {
    if (state.mode === "pang") return PANG_IDIOMS;
    return [...new Map([...getFixedIdioms(), ...getRotatingIdioms()].map((idiom) => [idiom.id, idiom])).values()];
  }

  function choosePuzzleStageIdioms() {
    const pool = ACTIVE_IDIOMS.length ? ACTIVE_IDIOMS : IDIOMS;
    if (!pool.length) return;
    const used = state.usedStageIdiomIds || new Set();
    let available = pool.filter((idiom) => !used.has(idiom.id));
    if (available.length < Math.min(IDIOM_RECIPE_COUNT, pool.length)) {
      used.clear();
      available = [...pool];
    }
    const choices = shuffled(available).slice(0, Math.min(IDIOM_RECIPE_COUNT, pool.length));
    choices.forEach((idiom) => used.add(idiom.id));
    state.stageIdiomIds = choices.map((idiom) => idiom.id);
    state.usedStageIdiomIds = used;
  }

  function rollIdiomRecipeInterval() {
    return IDIOM_RECIPE_MIN_TURNS + Math.floor(randomValue() * (IDIOM_RECIPE_MAX_TURNS - IDIOM_RECIPE_MIN_TURNS + 1));
  }

  function refreshRotatingIdioms({ force = false, announce = false } = {}) {
    if (state.mode === "pang") return false;
    if (!force && state.nextIdiomRecipeTurn > state.turn) return false;
    const selection = chooseRotatingRecipes({
      items: ACTIVE_IDIOMS.length ? ACTIVE_IDIOMS : IDIOMS,
      fixedIds: getFixedIdioms().map((idiom) => idiom.id),
      usedIds: [...(state.usedRotatingIdiomIds || [])],
      previousIds: state.rotatingIdiomIds || [],
      count: IDIOM_RECIPE_COUNT,
      rng: state.run?.rng || state.sessionRng
    });
    const choices = selection.choices;
    if (!choices.length) return false;
    state.rotatingIdiomIds = choices.map((idiom) => idiom.id);
    state.usedRotatingIdiomIds = new Set(selection.usedIds);
    state.idiomRecipeInterval = rollIdiomRecipeInterval();
    state.nextIdiomRecipeTurn = state.turn + state.idiomRecipeInterval;
    state.recipeSupplyUntilTurn = state.turn + 2;
    choices.forEach((idiom) => rememberMeta("seenIdioms", idiom.id));
    if (announce && choices.length) {
      addLog(`<strong>순환 연성식 교체</strong> · ${choices.map((idiom) => idiom.name).join(" · ")} · 고정 성어는 그대로 유지`, "start");
    }
    return true;
  }

  function getMoveSeconds() {
    const base = state.mode === "roguelike" && state.run ? state.run.moveSeconds : MOVE_SECONDS;
    return Math.max(1, base + (state.nextMoveBonus || 0) - (state.enemyMovePenalty || 0));
  }

  function getQueueMax() {
    return state.mode === "roguelike" && state.run ? state.run.queueMax : MAX_QUEUE;
  }

  function getQueueLife() {
    return state.mode === "roguelike" && state.run ? state.run.queueLife : 3;
  }

  function getRunRelicEffect(type, predicate = null) {
    if (state.mode !== "roguelike" || !state.run) return null;
    return findRunRelicEffect(RELIC_CATALOG, state.run.relicIds, type, predicate);
  }

  function elementProcContext(element, units = 1, synergyStacks = 0) {
    const party = getPartyJaryeongs().filter((jaryeong) => jaryeong.element === element);
    const partyLevelSum = party.reduce((sum, jaryeong) => sum
      + (state.run?.jaryeongLevels?.[jaryeong.id] || 1)
      + (state.run?.jaryeongAwakenings?.[jaryeong.id] || 0), 0);
    const leader = getLeaderJaryeong();
    const relic = getRunRelicEffect("elementProcChance", (effect) => effect.element === element);
    return {
      units,
      synergyStacks,
      partyMembers: party.length,
      partyLevelSum,
      leaderMatches: leader?.element === element,
      affinityStacks: state.run?.elementAffinity?.[element] || 0,
      focusStacks: state.run?.focusBuildElement === element ? state.run?.focusBuildStacks || 0 : 0,
      relicBonus: relic?.amount || 0
    };
  }

  function getElementProcDetails(element, units = 1, synergyStacks = 0) {
    return calculateElementProcChance(element, elementProcContext(element, units, synergyStacks));
  }

  function renderElementProcLegend() {
    document.querySelectorAll("[data-element-proc]").forEach((node) => {
      const element = node.dataset.elementProc;
      const details = getElementProcDetails(element);
      const rule = ELEMENT_PROC_RULES[element];
      const label = ELEMENT_RULES[element]?.label || element;
      const percent = details ? formatProcPercent(details.chance) : "0%";
      const value = node.querySelector("b");
      if (value && value.textContent !== percent) value.textContent = percent;
      if (!details || !rule) return;
      const bonuses = Object.entries(details.bonuses).filter(([, amount]) => amount > 0).map(([source, amount]) => {
        const sourceLabel = ({ match: "대형 매치", synergy: "상생", party: "자령 편성", levels: "자령 레벨", leader: "리더", affinity: "오행 공명", focus: "빌드 집중", relic: "유물" })[source] || source;
        return `${sourceLabel} +${Math.round(amount * 100)}%p`;
      });
      node.title = `${label} ${rule.effect} · 현재 ${percent} (기본 ${formatProcPercent(rule.baseChance)}, 상한 ${formatProcPercent(rule.maxChance)})${bonuses.length ? ` · ${bonuses.join(" · ")}` : ""}`;
      node.setAttribute("aria-label", node.title);
    });
  }

  function encounterRelicKey(type) {
    return `battle:${state.run?.battleIndex || 0}:${type}`;
  }

  function idiomRole(idiom) {
    return idiom?.effectSpec?.tags?.find((tag) => !["idiom", "chain"].includes(tag)) || idiom?.category || "general";
  }

  function uid() { return `${Date.now()}-${Math.floor(randomValue() * 0xffffffff).toString(36)}`; }
  function randomOf(list) { return pickWithRng(list, state.run?.rng || state.sessionRng); }
  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
  function maxPlayerHp() { return state.mode === "roguelike" && state.run ? state.run.maxHp : BASE_PLAYER_HP; }
  function maxPlayerShield() { return Math.round(maxPlayerHp() * RUN_LIMITS.maxShieldRatio); }

  function resetTurnTotals() {
    state.turnTotals = { damage: 0, heal: 0, shield: 0, burn: 0, delay: 0, elementDamage: {} };
  }

  function recordTurnTotal(type, amount, element = null) {
    if (!state.turnTotals) resetTurnTotals();
    if (type in state.turnTotals && type !== "elementDamage") state.turnTotals[type] += amount;
    if (element) state.turnTotals.elementDamage[element] = (state.turnTotals.elementDamage[element] || 0) + amount;
  }

  function addEnemyBurn(amount, turns = BURN_DURATION_TURNS) {
    const added = Math.max(0, Math.round(Number(amount) || 0));
    if (!added) return 0;
    state.enemyBurn = Math.max(0, Math.round(Number(state.enemyBurn) || 0)) + added;
    state.enemyBurnTurns = Math.max(Math.max(0, Math.round(Number(state.enemyBurnTurns) || 0)), Math.max(1, Math.round(Number(turns) || BURN_DURATION_TURNS)));
    return added;
  }

  function clearEnemyBurn() {
    state.enemyBurn = 0;
    state.enemyBurnTurns = 0;
  }

  function healPlayer(amount) {
    const before = state.playerHp;
    const reduced = state.healReductionTurns > 0 ? Math.max(0, amount) * (1 - (state.healReductionRatio || 0)) : amount;
    const effective = Math.max(0, reduced);
    const overflow = Math.max(0, before + effective - maxPlayerHp());
    state.playerHp = clamp(before + effective, 0, maxPlayerHp());
    const healed = state.playerHp - before;
    if (healed) {
      recordTurnTotal("heal", healed);
      state.lastPlayerHealing = healed;
      audioDirector.playSfx("heal");
    }
    const overflowRelic = getRunRelicEffect("overhealShield");
    if (overflow > 0 && overflowRelic) {
      const converted = gainShield(Math.round(overflow * (overflowRelic.ratio || 0)));
      if (converted) addLog(`<strong>${overflowRelic.relicName}</strong> · 초과 회복 ${Math.round(overflow)} 중 ${converted}를 보호막으로 전환`, "alchemy");
    }
    return healed;
  }

  function gainShield(amount) {
    const gained = Math.max(0, Math.round(amount || 0));
    const before = state.shield;
    state.shield = Math.min(maxPlayerShield(), state.shield + gained);
    const actual = state.shield - before;
    if (actual) {
      recordTurnTotal("shield", actual);
      audioDirector.playSfx("shield");
    }
    return actual;
  }

  function tileKey(row, col) { return `${row},${col}`; }

  async function lockRandomTiles(count = 2, turns = 1, visual = "seal") {
    if (state.mode !== "puzzle" && state.mode !== "roguelike") return 0;
    if (!(state.lockedTiles instanceof Map)) state.lockedTiles = new Map();
    const beforeCount = state.lockedTiles.size;
    const cells = [];
    for (let row = 0; row < ROWS; row++) for (let col = 0; col < COLS; col++) {
      if (!isTileLocked(row, col)) cells.push([row, col]);
    }
    const targets = shuffled(cells).slice(0, Math.min(count, cells.length));
    const enemy = $("#enemy-sprite");
    if (enemy && targets.length) {
      await Promise.all(targets.map(async ([row, col], index) => {
        const tile = $("#board")?.querySelector(`[data-row="${row}"][data-col="${col}"]`);
        if (!tile) return;
        await wait(index * 90);
        const label = visual === "vine" ? "蔓" : visual === "magma-chain" ? "鎖" : visual === "seaweed-net" ? "藻" : "封";
        await launchCombatProjectile(enemy, tile, { kind: "seal", variant: visual, label, duration: 620 });
      }));
    }
    state.activeSealVisual = visual;
    targets.forEach(([row, col]) => state.lockedTiles.set(tileKey(row, col), turns));
    const appliedCount = Math.max(0, state.lockedTiles.size - beforeCount);
    if (appliedCount) recordCombatObjectiveEvent({ type: COMBAT_OBJECTIVE_EVENT.SEALS_APPLIED, count: appliedCount });
    renderBoard();
    targets.forEach(([row, col]) => {
      const tile = $("#board")?.querySelector(`[data-row="${row}"][data-col="${col}"]`);
      tile?.classList.add("seal-landing");
      window.setTimeout(() => tile?.classList.remove("seal-landing"), 520);
    });
    return appliedCount;
  }

  function isTileLocked(row, col) {
    return state.lockedTiles instanceof Map && (state.lockedTiles.get(tileKey(row, col)) || 0) > 0;
  }

  function reduceTileLocks() {
    if (!(state.lockedTiles instanceof Map)) return;
    for (const [key, turns] of state.lockedTiles) {
      if (turns <= 1) state.lockedTiles.delete(key);
      else state.lockedTiles.set(key, turns - 1);
    }
    if (!state.lockedTiles.size) state.activeSealVisual = "seal";
  }

  function cleansePlayerStatuses() {
    let removed = 0;
    if (state.weakened) { state.weakened = false; state.weakenedTurns = 0; removed++; }
    if (state.healReductionTurns > 0) { state.healReductionTurns = 0; state.healReductionRatio = 0; removed++; }
    if (state.lockedTiles instanceof Map && state.lockedTiles.size) {
      const removedLocks = state.lockedTiles.size;
      removed += removedLocks;
      state.lockedTiles.clear();
      recordCombatObjectiveEvent({ type: COMBAT_OBJECTIVE_EVENT.SEALS_REMOVED, count: removedLocks });
    }
    return removed;
  }

  function returnQueueCharacters(chars, count = 1) {
    const unique = [...new Set((chars || []).filter(Boolean))];
    if (!unique.length) return 0;
    const selected = unique.slice(0, count);
    selected.forEach((char) => {
      if (state.queue.length >= getQueueMax()) state.queue.shift();
      const entry = { id: uid(), char, born: state.turn };
      state.queue.push(entry);
      state.freshQueueIds.add(entry.id);
    });
    return selected.length;
  }

  function removeRandomQueueCharacters(count = 1) {
    const pool = [...state.queue];
    const removed = [];
    const safeCount = Math.min(pool.length, Math.max(0, Math.floor(Number(count) || 0)));
    while (removed.length < safeCount && pool.length) {
      const index = Math.min(pool.length - 1, Math.floor(randomValue() * pool.length));
      removed.push(pool.splice(index, 1)[0]);
    }
    if (!removed.length) return removed;
    const removedIds = new Set(removed.map((entry) => entry.id));
    state.queue = state.queue.filter((entry) => !removedIds.has(entry.id));
    removedIds.forEach((id) => state.freshQueueIds.delete(id));
    return removed;
  }

  function resetQueueAges() {
    state.queue.forEach((entry) => { entry.born = state.turn; });
  }

  function partyChargeAll(amount = 1) {
    getPartyJaryeongs().forEach((jaryeong) => chargeJaryeong(jaryeong.id, amount));
  }

  function getJaryeongLevel(id) {
    return state.run?.jaryeongLevels?.[id] || 1;
  }

  function isDebugMultiBattle() {
    return Boolean(state.debugEnemyGroup?.members?.length);
  }

  function activeDebugEnemyMember() {
    if (!isDebugMultiBattle()) return null;
    const group = state.debugEnemyGroup;
    const requested = group.members[group.activeIndex];
    return requested || group.members[0] || null;
  }

  function persistActiveDebugEnemyMember() {
    const member = activeDebugEnemyMember();
    if (!member) return;
    member.currentHp = Math.max(0, Number(state.enemyHp) || 0);
    member.burn = Math.max(0, Number(state.enemyBurn) || 0);
    member.burnTurns = Math.max(0, Number(state.enemyBurnTurns) || 0);
    member.shield = Math.max(0, Number(state.enemyShield) || 0);
    member.elementBarrier = sanitizeSoftElementBarrier(state.enemyElementBarrier);
  }

  function loadDebugEnemyMember(index, { persist = true } = {}) {
    if (!isDebugMultiBattle()) return false;
    const group = state.debugEnemyGroup;
    if (persist) persistActiveDebugEnemyMember();
    const member = group.members[index];
    if (!member || member.currentHp <= 0) return false;
    group.activeIndex = index;
    state.enemyHp = member.currentHp;
    state.enemyBurn = member.burn || 0;
    state.enemyBurnTurns = member.burnTurns || 0;
    state.enemyShield = member.shield || 0;
    state.enemyElementBarrier = sanitizeSoftElementBarrier(member.elementBarrier);
    state.enemyPlan = createEnemyPlan();
    state.enemyPlan.phaseIndex = getEnemyPhaseIndex(member.enemy, member.currentHp);
    return true;
  }

  function createDebugEnemyGroup() {
    const members = DEBUG_MULTI_ENCOUNTER_IDS.map((encounterId, index) => {
      const source = ROGUELIKE_ENEMY_BY_ID.get(encounterId) || ROGUELIKE_ENEMIES[index];
      const hp = Math.min(150, Math.max(105, Number(source?.hp) || 120));
      const enemy = {
        ...source,
        id: `debug-multi-${source.id || encounterId}`,
        encounterId: `debug-multi-${encounterId}`,
        hp,
        maxHp: hp,
        damage: 6 + index * 2,
        wildLabel: "다수전 시험 자령"
      };
      return {
        enemy,
        currentHp: hp,
        burn: 0,
        shield: 0,
        elementBarrier: null,
        attackEvery: 2,
        attackCountdown: 1
      };
    });
    return { activeIndex: 0, members };
  }

  function getDebugEnemyIntentAtOffset(member, offset = 0) {
    const countdown = Math.max(0, Number(member?.attackCountdown) || 0);
    const every = Math.max(2, Number(member?.attackEvery) || 2);
    const willAttack = offset >= countdown && (offset - countdown) % every === 0;
    if (!willAttack) {
      return {
        id: `debug-multi-prepare-${offset}`,
        kind: "prepare",
        name: "호흡 가다듬기",
        icon: "◌",
        damage: 0,
        effectText: "이번 턴 체력 피해 없음 · 다음 공격 준비",
        threat: "low",
        threatLabel: "안전",
        responseHint: "공격이 오기 전에 4개 매치로 전체를 압박하세요"
      };
    }
    const damage = Math.max(1, Number(member?.enemy?.damage) || 6);
    return {
      id: `debug-multi-strike-${offset}`,
      kind: "attack",
      name: "합동 기습",
      icon: "⚔",
      damage,
      effectText: `${damage} 피해 · 살아 있는 자령이 함께 공격`,
      threat: "medium",
      threatLabel: "공격",
      responseHint: "보호막을 준비하거나 공격 전에 수를 줄이세요"
    };
  }

  function renderDebugEnemyGroup() {
    const wrap = $("#debug-enemy-squad");
    if (!wrap) return;
    const active = isDebugMultiBattle();
    wrap.hidden = !active;
    document.body.classList.toggle("debug-multi-mode", active);
    if (!active) {
      wrap.replaceChildren();
      return;
    }
    persistActiveDebugEnemyMember();
    const group = state.debugEnemyGroup;
    wrap.innerHTML = group.members.map((member, index) => {
      const enemy = member.enemy;
      const hpPercent = clamp(member.currentHp / Math.max(1, enemy.hp) * 100, 0, 100);
      const defeated = member.currentHp <= 0;
      const selected = index === group.activeIndex && !defeated;
      const turnLabel = member.attackCountdown <= 0 ? "이번 연성 후 공격" : `공격까지 ${member.attackCountdown}턴`;
      const art = enemy.asset?.idle || "";
      const barrier = sanitizeSoftElementBarrier(member.elementBarrier);
      const auraClass = barrier?.hp > 0 ? ` active barrier-${barrier.preferredElement}` : member.shield > 0 ? " active common" : "";
      const burnBadge = member.burn > 0 ? `<b class="multi-enemy-burn" aria-label="화상 ${formatDefenseValue(member.burn)}">火 ${formatDefenseValue(member.burn)}</b>` : "";
      return `<button type="button" class="multi-enemy-unit${selected ? " selected" : ""}${defeated ? " defeated" : ""}" data-debug-enemy-target="${index}" ${defeated ? "disabled" : ""} aria-pressed="${selected}" aria-label="${escapeHtml(`${enemy.name}, 기운 ${Math.ceil(member.currentHp)}/${enemy.hp}, ${turnLabel}${selected ? ", 현재 대상" : ""}`)}"><span class="multi-enemy-countdown ${member.attackCountdown <= 0 ? "imminent" : "safe"}">${member.attackCountdown <= 0 ? "공격!" : `${member.attackCountdown}턴`}</span><span class="multi-enemy-art-wrap"><img src="${art}" alt="${escapeHtml(enemy.name)}" decoding="async" /><i class="multi-enemy-aura${auraClass}" aria-hidden="true"></i>${burnBadge}</span><strong>${escapeHtml(enemy.name.replace(/^.*의\s*/, ""))}</strong><span class="multi-enemy-hp"><i style="width:${hpPercent}%"></i></span><small>${Math.max(0, Math.ceil(member.currentHp))}/${enemy.hp} · ${turnLabel}</small></button>`;
    }).join("");
  }

  function selectDebugEnemyTarget(index) {
    if (!loadDebugEnemyMember(Number(index))) return;
    updateAll();
    addLog(`<strong>집중 대상 변경</strong> · ${currentEnemy().name}`, "start");
  }

  function currentEnemy() {
    const multiMember = activeDebugEnemyMember();
    if (multiMember) return multiMember.enemy;
    if (state.debugEnemyOverride) return state.debugEnemyOverride;
    if (state.mode === "roguelike" && state.run?.currentEncounterId) {
      const enemy = ROGUELIKE_ENEMY_BY_ID.get(state.run.currentEncounterId) || ROGUELIKE_ENEMIES[0];
      if (state.rareEncounter && state.rareEncounter.status !== "escaped") {
        return { ...enemy, rare: true, name: `희귀 ${enemy.name}`, wildLabel: "도주 희귀 자령" };
      }
      return enemy;
    }
    return ENEMIES[state.wave] || ENEMIES[0];
  }

  function enemyCanSealTiles(enemy) {
    return Boolean(
      getBossTurnPlan(enemy, 7)?.action?.effect?.type === "lockTiles"
      || enemy?.phases?.some((phase) => phase.sequence?.some((intent) => intent.effect?.type === "lockTiles"))
    );
  }

  function partyCanCleanseSeals() {
    return getPartyJaryeongs().some((jaryeong) => jaryeong.id === "wood-bamboo")
      || getCurrentIdioms().some((idiom) => (idiom.effectId || idiom.id) === "untieKnot");
  }

  function chooseCombatObjective(enemy) {
    const run = state.run;
    if (!run) return null;
    for (let attempt = 0; attempt < 12; attempt++) {
      const objective = selectCombatObjective({
        seed: `${run.seed}|objective:${attempt}`,
        coordinates: { act: run.act, routeIndex: run.routeIndex, battleIndex: run.battleIndex }
      });
      if (objective.type === COMBAT_OBJECTIVE_TYPE.SHIELD_VICTORY && state.shield <= 0) continue;
      if (objective.type === COMBAT_OBJECTIVE_TYPE.CLEAR_SEALS && (!enemyCanSealTiles(enemy) || !partyCanCleanseSeals())) continue;
      return { ...objective, rewardGranted: false, rewardReceipt: null };
    }
    return {
      ...selectCombatObjective({
        seed: `${run.seed}|objective:fallback`,
        coordinates: { act: run.act, routeIndex: run.routeIndex, battleIndex: run.battleIndex }
      }),
      rewardGranted: false,
      rewardReceipt: null
    };
  }

  function recordCombatObjectiveEvent(event) {
    if (state.mode !== "roguelike" || !state.combatObjective) return;
    const normalized = normalizeCombatObjectiveState(state.combatObjective);
    if (!normalized) {
      console.warn("invalid combat objective was discarded before it could interrupt combat");
      state.combatObjective = null;
      return;
    }
    try {
      const previousStatus = normalized.status;
      state.combatObjective = applyCombatObjectiveEvent(normalized, event);
      if (previousStatus !== "completed" && state.combatObjective.status === "completed") {
        addLog(`<strong>작은 목표 달성</strong> · ${state.combatObjective.title} · 전투 승리 시 추가 보상`, "victory");
        audioDirector.playSfx("reward");
      }
    } catch (error) {
      console.warn("combat objective event skipped to keep the turn running", error);
      state.combatObjective = null;
    }
  }

  function objectiveProgressText(objective = state.combatObjective) {
    if (!objective) return "";
    if (objective.rewardGranted) return "보상 완료";
    if (objective.status === "completed") return "달성";
    if (objective.status === "failed") return "실패";
    const progress = objective.progress || {};
    switch (objective.type) {
      case COMBAT_OBJECTIVE_TYPE.SHIELD_VICTORY: return `보호 ${Math.max(0, Math.floor(state.shield || 0))}`;
      case COMBAT_OBJECTIVE_TYPE.ELEMENT_PROCS: return `${progress.count || 0} / ${objective.target.count} ${ELEMENT_RULES[objective.target.element]?.label || "오행"}`;
      case COMBAT_OBJECTIVE_TYPE.IDIOM_ACTIVATIONS: return `${progress.count || 0} / ${objective.target.count}`;
      case COMBAT_OBJECTIVE_TYPE.CLEAR_SEALS: return progress.applied ? `남음 ${progress.remaining || 0}` : "봉인 대기";
      case COMBAT_OBJECTIVE_TYPE.TURN_LIMIT_VICTORY: return `${state.turn} / ${objective.target.turnLimit}턴`;
      default: return "진행 중";
    }
  }

  function rareGimmickLabel(rare = state.rareEncounter) {
    if (!rare) return "";
    if (rare.gimmick === RARE_GIMMICKS.TALISMAN_SHIELD) return `부적 보호막 ${Math.max(0, Math.ceil(state.enemyShield || 0))}`;
    if (rare.gimmick === RARE_GIMMICKS.IDIOM_WEAKNESS) {
      const idiom = ALL_IDIOMS.find((candidate) => candidate.id === rare.idiomWeakness?.idiomId);
      return `약점 ${idiom?.name || "성어"}`;
    }
    return "황급한 도주";
  }

  function renderCombatMission() {
    const card = $("#combat-mission");
    const hud = $("#roguelike-hud");
    if (!card || !hud) return;
    const objective = state.mode === "roguelike" ? state.combatObjective : null;
    card.hidden = !objective;
    hud.classList.toggle("has-combat-mission", Boolean(objective));
    if (!objective) return;
    const rare = state.rareEncounter?.status === "active" ? state.rareEncounter : null;
    card.classList.toggle("is-complete", objective.status === "completed" || objective.rewardGranted);
    card.classList.toggle("is-rare", Boolean(rare));
    $("#combat-mission-glyph").textContent = rare ? "稀" : objective.status === "completed" ? "成" : "目";
    $("#combat-mission-kicker").textContent = rare
      ? `희귀 조우 · ${rare.escapeCountdown}턴 후 도주 · ${rareGimmickLabel(rare)}`
      : "작은 목표 · 추가 보상";
    $("#combat-mission-title").textContent = objective.title;
    $("#combat-mission-progress").textContent = objectiveProgressText(objective);
    const label = `${rare ? `희귀 자령, ${rare.escapeCountdown}턴 후 도주, ${rareGimmickLabel(rare)}. ` : ""}작은 목표 ${objective.title}. ${objective.description}. ${objectiveProgressText(objective)}`;
    card.setAttribute("aria-label", label);
    card.title = label;
  }

  function getActiveFirstBattleCoachProgress() {
    if (state.mode !== "roguelike" || !state.run?.currentEncounterId || state.gameOver || state.run?.completed) return null;
    return getFirstBattleCoachProgress(state.firstBattleOnboarding);
  }

  function renderFirstBattleCoach() {
    const coach = $("#first-battle-coach");
    if (!coach) return;
    const progress = getActiveFirstBattleCoachProgress();
    coach.hidden = !progress;
    if (!progress) {
      coach.removeAttribute("data-stage");
      const skillButton = $("#first-battle-coach-skill");
      if (skillButton) {
        skillButton.disabled = true;
        skillButton.removeAttribute("data-jaryeong-skill");
        skillButton.removeAttribute("data-skill-key");
      }
      return;
    }

    const hintText = progress.currentHint?.text || "첫 전투 안내를 계속합니다.";
    $("#first-battle-coach-hint").textContent = hintText;
    coach.dataset.stage = progress.currentHint?.id || "read-intent";
    coach.setAttribute("aria-label", `첫 전투 길잡이. ${hintText}`);

    const stageLabels = ["의도 읽기", "대응 선택", "결과 확인"];
    const steps = $("#first-battle-coach-steps");
    if (steps) {
      progress.stages.forEach((stage, index) => {
        const step = steps.children[index];
        if (!step) return;
        const label = stageLabels[index] || stage.id;
        step.dataset.state = stage.status;
        step.setAttribute("aria-label", `${label} ${stage.status === "complete" ? "완료" : stage.status === "current" ? "진행 중" : "대기"}`);
        if (stage.status === "current") step.setAttribute("aria-current", "step");
        else step.removeAttribute("aria-current");
      });
    }

    const supply = progress.characterSupply || {};
    const requiredCharacters = Array.isArray(supply.requiredCharacters) ? supply.requiredCharacters : [];
    const fixedIdiom = getFixedIdioms().find((idiom) => {
      const idiomId = String(idiom?.id || idiom?.sourceHanja || (Array.isArray(idiom?.chars) ? idiom.chars.join("") : ""));
      return idiomId === supply.idiomId;
    });
    const deliveryText = (turn) => (supply.deliveries || []).find((delivery) => delivery.turn === turn)?.characters?.join(" · ") || "없음";
    const supportText = `고정 성어 지원 · ${fixedIdiom?.name || requiredCharacters.join("") || "고정 성어"} ${requiredCharacters.join("")} · 1턴 ${deliveryText(1)} · 2턴 ${deliveryText(2)}`;
    const support = $("#first-battle-coach-supply");
    support.textContent = supportText;
    support.title = supportText;
    support.setAttribute("aria-label", supportText);

    const leaderId = progress.leaderCharge?.jaryeongId;
    const leader = getJaryeong(leaderId);
    const leaderIndex = (state.run?.partyJaryeongIds || []).indexOf(leaderId);
    const skillKey = leaderIndex >= 0 ? leaderIndex + 1 : 1;
    const requiredCharge = Number(progress.leaderCharge?.charge) || 5;
    const charge = state.run?.skillCharges?.[leaderId] || 0;
    const skillReady = Boolean(leader && leaderIndex >= 0 && charge >= requiredCharge && !state.resolving && !state.jaryeongSkillAnimating && !state.gameOver);
    const skillButton = $("#first-battle-coach-skill");
    skillButton.dataset.jaryeongSkill = leaderId || "";
    skillButton.dataset.skillKey = String(skillKey);
    skillButton.disabled = !skillReady;
    $("#first-battle-coach-skill-key").textContent = String(skillKey);
    $("#first-battle-coach-skill-name").textContent = `${leader?.name || "리더"} · ${leader?.skillName || "기술"}`;
    $("#first-battle-coach-skill-detail").textContent = leader?.skillDesc || "리더 기술을 준비 중입니다.";
    $("#first-battle-coach-skill-charge").textContent = `기운 ${charge}/${requiredCharge}`;
    skillButton.setAttribute("aria-label", `${skillKey}번. ${leader?.name || "리더"}의 ${leader?.skillName || "기술"}. ${leader?.skillDesc || ""}. 기운 ${charge}/${requiredCharge}${skillReady ? ". 지금 사용" : ". 아직 준비 중"}`);
  }

  function getEnemyPhaseIndex(enemy = currentEnemy(), hp = state.enemyHp) {
    if (!enemy?.phases?.length) return 0;
    const ratio = enemy.hp ? hp / enemy.hp : 1;
    const sorted = enemy.phases
      .map((phase, index) => ({ phase, index }))
      .sort((a, b) => (b.phase.minHpRatio || 0) - (a.phase.minHpRatio || 0));
    return sorted.find((entry) => ratio >= (entry.phase.minHpRatio || 0))?.index ?? sorted.at(-1).index;
  }

  function getEnemyPhase(enemy = currentEnemy()) {
    return enemy?.phases?.[state.enemyPlan.phaseIndex] || enemy?.phases?.[0] || { id: "default", label: "일반", sequence: [] };
  }

  function scheduleEnemyPhase() {
    if (state.mode !== "puzzle" && state.mode !== "roguelike") return;
    const desiredIndex = getEnemyPhaseIndex();
    if (desiredIndex !== state.enemyPlan.phaseIndex) state.enemyPlan.pendingPhaseIndex = desiredIndex;
  }

  function ensureEnemyPlan() {
    const phase = getEnemyPhase();
    const sequence = phase.sequence || [];
    if (!sequence.length) return [];
    while (state.enemyPlan.queue.length < 3) {
      const nextIndex = (state.enemyPlan.cursor + state.enemyPlan.queue.length) % sequence.length;
      state.enemyPlan.queue.push(sequence[nextIndex]);
    }
    return state.enemyPlan.queue;
  }

  function resetEnemyPlan() {
    state.enemyPlan = createEnemyPlan();
    state.enemyPlan.phaseIndex = getEnemyPhaseIndex();
    ensureEnemyPlan();
    const live = $("#enemy-intent-live");
    if (live) live.textContent = "";
  }

  function getEnemyForecast() {
    return ensureEnemyPlan();
  }

  function getActiveStoryGuardLesson() {
    if (state.mode !== "puzzle" || state.storySession?.status !== "active") return null;
    return getStoryTrainingGuardLesson(state.storySession.chapterId);
  }

  function createStoryGuardIntent(lesson) {
    return {
      id: lesson.intentId,
      kind: "attack",
      name: lesson.intentName,
      icon: "⚔",
      damage: lesson.damage,
      effect: { type: "story-guard" },
      effectText: `${lesson.damage} 피해 · 보호막으로 모두 막기`,
      threat: "medium",
      threatLabel: "주의",
      responseHint: lesson.responseHint
    };
  }

  function currentEnemyIntent(requestedTurn = state.turn) {
    const storyGuardLesson = getActiveStoryGuardLesson();
    if (storyGuardLesson) return createStoryGuardIntent(storyGuardLesson);
    const multiMember = activeDebugEnemyMember();
    if (multiMember) return getDebugEnemyIntentAtOffset(multiMember, Math.max(0, requestedTurn - state.turn));
    const enemy = currentEnemy();
    const bossPlan = getBossTurnPlan(enemy, requestedTurn);
    if (bossPlan) {
      const action = bossPlan.action;
      const effect = action.effect || {};
      const warning = bossPlan.telegraphs[0];
      const isBasic = !Number.isFinite(action.schedule?.firstTurn);
      const baseDamage = Math.max(0, enemy.damage || 0);
      const damage = ["damage", "damageAndBurn"].includes(effect.type)
        ? Math.round(baseDamage * (effect.damageScale || 1))
        : 0;
      const effectText = ({
        gainEnemyShield: `보호막 ${effect.amount || 0} · 모든 속성 공격으로 파괴 가능`,
        lockTiles: `타일 ${effect.count || 2}개를 ${effect.durationTurns || 3}턴 봉인`,
        removeQueueCharacters: `문자 큐에서 임의의 글자 ${effect.count || 1}개 제거`,
        healEnemyUnlessBurning: `화상이 없으면 기운 ${effect.amount || 0} 회복`,
        resetBoard: "地震海溢 · 그리드 전체 재생성",
        damageAndBurn: `${damage} 피해 · 추가 화상 ${effect.burn || 0}`,
        damage: `${damage} 피해`
      })[effect.type] || action.name;
      return {
        id: action.id,
        kind: action.kind === "barrier" ? "guard" : action.kind === "seal" || action.kind === "board" ? "control" : action.kind,
        name: action.name,
        icon: ({ barrier: "結", seal: "封", board: "溢", recovery: "生", control: "散", attack: "⚔" })[action.kind] || "⚔",
        damage,
        effect,
        effectText,
        threat: isBasic ? "medium" : "high",
        threatLabel: isBasic ? "주의" : "위험",
        responseHint: warning
          ? `다음 턴 ${warning.name} · ${warning.text}`
          : action.telegraph || "보스의 주기를 읽고 다음 행동에 대비하세요"
      };
    }
    return getEnemyForecast()[0] || {
      id: "fallback-strike",
      kind: "attack",
      name: "적의 공격",
      icon: "⚔",
      damage: 0,
      effectText: "행동 예고 없음",
      threat: "medium",
      threatLabel: "보통",
      responseHint: "보드 흐름을 이어가세요"
    };
  }

  function intentDealsPlayerDamage(intent) {
    if ((Number(intent?.damage) || 0) > 0) return true;
    const effect = intent?.effect || {};
    return (effect.type === "damageAndBurn" && (Number(effect.burn) || 0) > 0)
      || (effect.type === "burnPlayer" && (Number(effect.amount) || 0) > 0);
  }

  function turnsUntilEnemyAttack() {
    if (state.boundEnemyIntentTurns > 0) return state.boundEnemyIntentTurns;
    const delay = Math.max(0, Number(state.delayed) || 0);
    const multiMember = activeDebugEnemyMember();
    if (multiMember) return Math.max(0, Number(multiMember.attackCountdown) || 0) + delay;
    const storyGuardLesson = getActiveStoryGuardLesson();
    if (storyGuardLesson) return delay;
    const enemy = currentEnemy();
    if (getBossTurnPlan(enemy, state.turn)) {
      for (let offset = 0; offset < 12; offset++) {
        if (intentDealsPlayerDamage(currentEnemyIntent(state.turn + offset))) return offset + delay;
      }
      return null;
    }
    const sequence = getEnemyPhase(enemy).sequence || [];
    if (!sequence.length) return null;
    for (let offset = 0; offset < Math.max(12, sequence.length * 2); offset++) {
      const index = (state.enemyPlan.cursor + offset) % sequence.length;
      if (intentDealsPlayerDamage(sequence[index])) return offset + delay;
    }
    return null;
  }

  function advanceEnemyPlan() {
    const enemy = currentEnemy();
    if (getBossTurnPlan(enemy, state.turn)) return;
    const plan = state.enemyPlan;
    const nextPhaseIndex = plan.pendingPhaseIndex;
    if (nextPhaseIndex != null && nextPhaseIndex !== plan.phaseIndex) {
      plan.phaseIndex = nextPhaseIndex;
      plan.pendingPhaseIndex = null;
      plan.cursor = 0;
      plan.queue = [];
      const phase = getEnemyPhase(enemy);
      showEnemyPhaseBanner(phase);
    } else {
      const sequence = getEnemyPhase(enemy).sequence || [];
      plan.cursor = sequence.length ? (plan.cursor + 1) % sequence.length : 0;
      plan.queue = [];
    }
    ensureEnemyPlan();
  }

  function intentThreatLabel(intent) {
    return intent?.threatLabel || ({ high: "위험", medium: "주의", low: "낮음" }[intent?.threat] || "보통");
  }

  function intentKindLabel(intent) {
    if (intent?.kind === "prepare") return "준비 예고";
    if (intent?.kind === "weaken") return "약화 예고";
    if (intent?.kind === "control") return "상태 예고";
    return "다음 행동";
  }

  function makePatternStep() {
    const node = document.createElement("div");
    node.className = "pattern-step";
    node.innerHTML = "<span class=\"pattern-step-index\"></span><b class=\"pattern-step-icon\"></b><span class=\"pattern-step-copy\"></span>";
    return node;
  }

  function renderEnemyStatuses() {
    const enemyWrap = $("#enemy-status");
    const playerWrap = $("#player-status");
    const enemyEntries = [];
    const playerEntries = [];
    if (state.enemyBurn) enemyEntries.push({ className: "status-burn", text: `🔥 화상 ${state.enemyBurn} × ${state.enemyBurnTurns || BURN_DURATION_TURNS}턴 · 총 ${state.enemyBurn * (state.enemyBurnTurns || BURN_DURATION_TURNS)}` });
    if (state.delayed) enemyEntries.push({ className: "status-delay", text: `⌛ 행동 지연 ${state.delayed}턴` });
    if (state.enemyVulnerableTurns) enemyEntries.push({ className: "status-weakened", text: `◌ 취약 ${state.enemyVulnerableTurns}턴 · 피해 +${Math.round((state.enemyVulnerableRatio || 0) * 100)}%` });
    if (state.enemySilenced) enemyEntries.push({ className: "status-delay", text: `🔇 침묵 ${state.enemySilenced}턴` });
    if (state.boundEnemyIntentTurns) enemyEntries.push({ className: "status-delay", text: `⛓ 쇄맥 봉인 ${state.boundEnemyIntentTurns}턴` });

    if (state.weakened) playerEntries.push({ className: "status-negative", text: `☄ 기력 약화 ${state.weakenedTurns || 1}회 · 내 피해 -25%` });
    if (state.healReductionTurns) playerEntries.push({ className: "status-negative", text: `☄ 회복 약화 ${state.healReductionTurns}턴 · 회복 -${Math.round((state.healReductionRatio || 0) * 100)}%` });
    if (state.prepared) playerEntries.push({ className: "status-positive", text: "◈ 지피지기 대비 활성" });
    if (state.nextEnemyDamageReduction) playerEntries.push({ className: "status-positive", text: `☁ 다음 적 공격 -${Math.round(state.nextEnemyDamageReduction * 100)}%` });
    if (state.reflectNextEnemyAttack) {
      const reflect = state.reflectNextEnemyAttack;
      playerEntries.push({
        className: "status-reflect",
        text: `鏡 ${reflect.label || "자업자득"} · 다음 적 공격 ${Math.round((reflect.damageReduction || 0) * 100)}% 감소 · 감소 전 피해 ${Math.round((reflect.ratio || 0) * 100)}% 반사`
      });
    }
    if (state.healingFieldTurns) playerEntries.push({ className: "status-positive", text: `🌲 회복장 ${state.healingFieldTurns}턴 · +${state.healingFieldAmount}` });
    if (state.phoenixRebirthReady) playerEntries.push({ className: "status-positive", text: `🔥 봉염 귀환 · 부활 반격 ${state.phoenixRebirthReady}` });
    if (state.damageSplitHits) playerEntries.push({ className: "status-positive", text: `谷 협곡 분류 ${state.damageSplitHits}회` });
    if (state.deferredDamage) playerEntries.push({ className: "status-negative", text: `◌ 유예 피해 ${state.deferredDamage} · ${state.deferredDamageTicks}턴` });
    if (state.idiomGrowthStacks) playerEntries.push({ className: "status-positive", text: `昇 일취월장 ${state.idiomGrowthStacks}중첩 · 성어 피해 +${state.idiomGrowthStacks * 4}%` });
    if (state.nextMoveBonus) playerEntries.push({ className: "status-positive", text: `時 다음 이동 +${formatDefenseValue(state.nextMoveBonus)}초` });
    if (state.nextPlayerDamageBonus) playerEntries.push({ className: "status-positive", text: `攻 다음 연성 피해 +${Math.round(state.nextPlayerDamageBonus * 100)}%` });
    if (state.nextChargeBonus) playerEntries.push({ className: "status-positive", text: `靈 다음 자령 기운 +${state.nextChargeBonus}` });

    const renderEntries = (wrap, entries, emptyText) => {
      if (!wrap) return;
      if (!entries.length) {
        const empty = document.createElement("span");
        empty.className = "status-pill muted";
        empty.textContent = emptyText;
        wrap.replaceChildren(empty);
        return;
      }
      const fragment = document.createDocumentFragment();
      entries.forEach(({ className, text }) => {
        const pill = document.createElement("span");
        pill.className = `status-pill ${className}`;
        pill.textContent = text;
        fragment.appendChild(pill);
      });
      wrap.replaceChildren(fragment);
    };
    renderEntries(enemyWrap, enemyEntries, "적 상태 없음");
    renderEntries(playerWrap, playerEntries, "버프·약화 없음");
  }

  function renderDefenseHud() {
    const playerShield = Math.max(0, Number(state.shield) || 0);
    const playerShieldText = formatDefenseValue(playerShield);
    const playerBadge = $("#shield-badge");
    if (playerBadge) {
      playerBadge.classList.toggle("is-active", playerShield > 0);
      playerBadge.classList.toggle("is-empty", playerShield <= 0);
      playerBadge.setAttribute("aria-label", `보호막 ${playerShieldText}`);
      playerBadge.title = `보호막 ${playerShieldText}`;
      const value = playerBadge.querySelector("b");
      if (value) value.textContent = playerShieldText;
    }

    const wrap = $("#enemy-defense-hud");
    const shield = $("#enemy-shield-hud");
    const elementBarrierHud = $("#enemy-element-barrier-hud");
    if (!wrap || !shield || !elementBarrierHud) return;
    const enemyShield = Math.max(0, Number(state.enemyShield) || 0);
    const enemyShieldText = formatDefenseValue(enemyShield);
    const elementBarrier = sanitizeSoftElementBarrier(state.enemyElementBarrier);
    state.enemyElementBarrier = elementBarrier;
    const hasElementBarrier = Boolean(elementBarrier?.hp > 0);
    wrap.hidden = enemyShield <= 0 && !hasElementBarrier;
    shield.hidden = enemyShield <= 0;
    if (enemyShield > 0) {
      shield.querySelector("strong").textContent = enemyShieldText;
      shield.setAttribute("aria-label", `적 보호막 ${enemyShieldText}. 모든 속성 공격으로 파괴할 수 있으며 금 관통이 효과적입니다.`);
    }
    elementBarrierHud.hidden = !hasElementBarrier;
    if (hasElementBarrier) {
      const element = getElementMeta(elementBarrier.preferredElement);
      const barrierText = formatDefenseValue(elementBarrier.hp);
      const multiplierText = formatDefenseValue(elementBarrier.breakMultiplier);
      elementBarrierHud.querySelector("b").textContent = `結 ${element.symbol} 속성 연성막`;
      elementBarrierHud.querySelector("strong").textContent = barrierText;
      elementBarrierHud.querySelector("small").textContent = `모든 속성 유효 · ${element.label} 파괴력 ×${multiplierText}`;
      elementBarrierHud.setAttribute("aria-label", `적 ${element.label} 속성 연성막 ${barrierText}. 모든 속성 공격이 유효하며 ${element.label} 속성은 파괴력 ${multiplierText}배입니다.`);
    }
    const labels = [];
    if (enemyShield > 0) labels.push(`일반 보호막 ${enemyShieldText}, 전 속성 유효`);
    if (hasElementBarrier) {
      const element = getElementMeta(elementBarrier.preferredElement);
      labels.push(`${element.label} 속성 연성막 ${formatDefenseValue(elementBarrier.hp)}, ${element.label} 파괴력 ${formatDefenseValue(elementBarrier.breakMultiplier)}배`);
    }
    if (labels.length) {
      wrap.setAttribute("aria-label", labels.join(". "));
    } else {
      wrap.setAttribute("aria-label", "적 보호 상태 없음");
    }
  }

  function renderEnemyVisualStatuses(enemy = currentEnemy()) {
    const sprite = $("#enemy-sprite");
    if (!sprite) return;
    const barrier = sanitizeSoftElementBarrier(state.enemyElementBarrier);
    const hasElementBarrier = Boolean(barrier?.hp > 0);
    const hasCommonShield = Math.max(0, Number(state.enemyShield) || 0) > 0;
    sprite.classList.toggle("has-common-shield", hasCommonShield);
    sprite.classList.toggle("has-element-barrier", hasElementBarrier);
    ELEMENTS.forEach((element) => sprite.classList.toggle(`barrier-${element.id}`, hasElementBarrier && barrier.preferredElement === element.id));

    const burnBadge = $("#enemy-burn-status");
    const burn = Math.max(0, Number(state.enemyBurn) || 0);
    if (burnBadge) {
      burnBadge.hidden = burn <= 0;
      burnBadge.classList.toggle("is-active", burn > 0);
      const value = burnBadge.querySelector("strong");
      const turns = Math.max(0, Number(state.enemyBurnTurns) || 0);
      if (value) value.textContent = `${formatDefenseValue(burn)}×${turns}`;
      burnBadge.setAttribute("aria-label", `화상 ${formatDefenseValue(burn)} 피해가 ${turns}턴 동안 지속됩니다. 예상 총 피해 ${formatDefenseValue(burn * turns)}.`);
    }

    const statusLabels = [];
    if (hasElementBarrier) {
      const element = getElementMeta(barrier.preferredElement);
      statusLabels.push(`${element.label} 속성 연성막 ${formatDefenseValue(barrier.hp)}`);
    } else if (hasCommonShield) statusLabels.push(`보호막 ${formatDefenseValue(state.enemyShield)}`);
    if (burn > 0) statusLabels.push(`화상 ${formatDefenseValue(burn)}`);
    sprite.setAttribute("aria-label", `${enemy?.name || "적 자령"}${statusLabels.length ? `, ${statusLabels.join(", ")}` : ""}`);
  }

  function getJaryeong(id) {
    return JARYEONG_LIBRARY.find((jaryeong) => jaryeong.id === id) || null;
  }

  function getTalismanAnchor(jaryeong, frameKey = "idle") {
    return jaryeong?.asset?.talismanAnchors?.[frameKey] || jaryeong?.asset?.talismanAnchors?.idle || { x: 50, y: 48, width: 19, rotate: 0 };
  }

  function talismanStyle(jaryeong, frameKey = "idle") {
    const anchor = getTalismanAnchor(jaryeong, frameKey);
    return `--talisman-x:${anchor.x}%;--talisman-y:${anchor.y}%;--talisman-width:${anchor.width}%;--talisman-rotate:${anchor.rotate || 0}deg`;
  }

  function tamedSpriteMarkup(jaryeong, { frameKey = "idle", alt = "" } = {}) {
    if (!jaryeong) return "";
    return `<img class="sprite-body" src="${jaryeong.asset?.[frameKey] || jaryeong.asset?.idle || ""}" alt="${escapeHtml(alt)}" decoding="async" /><img class="tamed-talisman" src="${jaryeong.asset?.talisman || ""}" alt="" aria-hidden="true" style="${talismanStyle(jaryeong, frameKey)}" />`;
  }

  function prefersReducedMotion() {
    return Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
  }

  async function showJaryeongSkillCutin(jaryeong, skill) {
    const cutin = $("#jaryeong-skill-cutin");
    if (!cutin || !jaryeong) return;
    const element = ELEMENT_RULES[jaryeong.element];
    const title = `${jaryeong.hanja}령 · ${jaryeong.name}`;
    const skillName = skill?.name || jaryeong.skillName || "기술 발동";
    const detail = skill?.description || jaryeong.skillDesc || "자령의 기운이 전장을 감쌉니다.";
    const announcement = `${title}. ${skillName}. ${detail}`;
    cutin.dataset.element = jaryeong.element || "wood";
    const live = $("#jaryeong-skill-cutin-live");
    if (live) live.textContent = announcement;
    $("#jaryeong-skill-cutin-art").innerHTML = tamedSpriteMarkup(jaryeong, { frameKey: "attack", alt: "" });
    $("#jaryeong-skill-cutin-element").textContent = `${element?.symbol || "靈"} ${element?.label || "오행"} 자령`;
    $("#jaryeong-skill-cutin-title").textContent = title;
    $("#jaryeong-skill-cutin-name").textContent = skillName;
    $("#jaryeong-skill-cutin-detail").textContent = detail;
    cutin.hidden = false;
    cutin.classList.remove("show");
    void cutin.offsetWidth;
    cutin.classList.add("show");
    const reducedMotion = prefersReducedMotion();
    await wait(reducedMotion ? 100 : state.idiomSpeed === "slow" ? 1050 : 860);
    cutin.classList.remove("show");
    if (!reducedMotion) await wait(130);
    cutin.hidden = true;
  }

  function setTalismanFrame(container, jaryeong, frameKey = "idle") {
    const talisman = container?.querySelector(".tamed-talisman");
    if (!talisman || !jaryeong) return;
    const anchor = getTalismanAnchor(jaryeong, frameKey);
    talisman.style.setProperty("--talisman-x", `${anchor.x}%`);
    talisman.style.setProperty("--talisman-y", `${anchor.y}%`);
    talisman.style.setProperty("--talisman-width", `${anchor.width}%`);
    talisman.style.setProperty("--talisman-rotate", `${anchor.rotate || 0}deg`);
    talisman.dataset.frame = frameKey;
  }

  function renderMenuSpiritParade() {
    const wrap = $("#menu-spirit-parade");
    if (!wrap) return;
    const ids = ["wood-mok", "fire-hwa", "earth-to", "metal-gold", "water-sui"];
    wrap.innerHTML = ids.map((id) => {
      const jaryeong = getJaryeong(id);
      return `<span data-menu-jaryeong="${id}">${tamedSpriteMarkup(jaryeong)}</span>`;
    }).join("");
  }

  function getPartyJaryeongs() {
    return (state.run?.partyJaryeongIds || []).map(getJaryeong).filter(Boolean);
  }

  function getLeaderJaryeong() {
    return getJaryeong(state.run?.leaderJaryeongId);
  }

  function renderEnemyAffinity() {
    const wrap = $("#enemy-affinity");
    if (!wrap) return;
    const enemy = currentEnemy();
    const weak = ELEMENTS.find((element) => element.id === enemy?.weakElement);
    const resist = ELEMENTS.find((element) => element.id === enemy?.resistElement);
    if (!weak && !resist) {
      wrap.textContent = "상성 정보 없음";
      return;
    }
    wrap.innerHTML = `${weak ? `<span class="affinity-weak"><b>약점</b> ${weak.symbol} ${weak.label} +30%</span>` : ""}${resist ? `<span class="affinity-resist"><b>저항</b> ${resist.symbol} ${resist.label} -20%</span>` : ""}`;
  }

  let enemyAffinityTooltipPinned = false;

  function setEnemyAffinityTooltipOpen(open) {
    const trigger = $("#enemy-kind-label");
    const tooltip = $("#enemy-affinity-tooltip");
    if (!trigger || !tooltip) return;
    tooltip.hidden = !open;
    trigger.setAttribute("aria-expanded", String(Boolean(open)));
  }

  function describeEnemyAffinity(element, modifier) {
    if (!element) return "상성 정보 없음";
    return `${element.symbol} ${element.label} 속성 피해 ${modifier}`;
  }

  function updateEnemyAffinityTooltip(enemy, enemyJaryeong, studyHanja, studyReading, studyMeaning) {
    const trigger = $("#enemy-kind-label");
    const anchor = $("#enemy-kind-label-anchor");
    const tooltip = $("#enemy-affinity-tooltip");
    if (!trigger || !anchor || !tooltip) return;

    const weak = ELEMENTS.find((element) => element.id === enemy?.weakElement);
    const resist = ELEMENTS.find((element) => element.id === enemy?.resistElement);
    const enemyElement = enemyJaryeong?.element || "";
    const weakText = describeEnemyAffinity(weak, "+30%");
    const resistText = describeEnemyAffinity(resist, "-20%");

    $("#enemy-affinity-tooltip-title").textContent = `${studyHanja} · ${studyReading} 전투 상성`;
    $("#enemy-affinity-tooltip-weak").textContent = weakText;
    $("#enemy-affinity-tooltip-resist").textContent = resistText;

    if (enemyElement) {
      trigger.dataset.element = enemyElement;
      anchor.dataset.element = enemyElement;
    } else {
      delete trigger.dataset.element;
      delete anchor.dataset.element;
    }
    trigger.setAttribute("aria-label", `${enemy.wildLabel || "야생 자령"}, ${studyHanja}, ${studyReading}, 뜻 ${studyMeaning}. 약점: ${weakText}. 저항: ${resistText}. 눌러서 전투 상성 보기`);
  }

  function setupEnemyAffinityTooltip() {
    const anchor = $("#enemy-kind-label-anchor");
    const trigger = $("#enemy-kind-label");
    if (!anchor || !trigger || trigger.dataset.affinityTooltipReady === "true") return;
    trigger.dataset.affinityTooltipReady = "true";

    anchor.addEventListener("pointerenter", (event) => {
      if (!event.pointerType || event.pointerType === "mouse") setEnemyAffinityTooltipOpen(true);
    });
    anchor.addEventListener("pointerleave", (event) => {
      if ((!event.pointerType || event.pointerType === "mouse") && !enemyAffinityTooltipPinned) setEnemyAffinityTooltipOpen(false);
    });
    trigger.addEventListener("focus", () => setEnemyAffinityTooltipOpen(true));
    anchor.addEventListener("focusout", () => {
      window.setTimeout(() => {
        if (!anchor.contains(document.activeElement)) {
          enemyAffinityTooltipPinned = false;
          setEnemyAffinityTooltipOpen(false);
        }
      }, 0);
    });
    trigger.addEventListener("click", () => {
      enemyAffinityTooltipPinned = !enemyAffinityTooltipPinned;
      setEnemyAffinityTooltipOpen(enemyAffinityTooltipPinned);
    });
    document.addEventListener("pointerdown", (event) => {
      if (!anchor.contains(event.target)) {
        enemyAffinityTooltipPinned = false;
        setEnemyAffinityTooltipOpen(false);
      }
    });
    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape" || $("#enemy-affinity-tooltip")?.hidden) return;
      event.preventDefault();
      enemyAffinityTooltipPinned = false;
      setEnemyAffinityTooltipOpen(false);
      trigger.focus({ preventScroll: true });
    });
  }

  let jaryeongInspectorReturnFocus = null;

  function getJaryeongSkillAvailability(jaryeong) {
    const skill = JARYEONG_SKILL_LIBRARY[jaryeong?.skillId] || {
      cost: 5,
      name: jaryeong?.skillName || "기술",
      description: jaryeong?.skillDesc || "기술 효과"
    };
    const cost = Math.max(1, Number(skill.cost) || 5);
    const charge = Math.max(0, Math.min(cost, Number(state.run?.skillCharges?.[jaryeong?.id]) || 0));
    const full = charge >= cost;
    const processing = Boolean(state.resolving || state.jaryeongSkillAnimating);
    const moving = Boolean(state.dragging);
    const canCast = full && !processing && !moving && !state.gameOver;
    const status = canCast ? "ready"
      : processing ? "processing"
        : moving ? "moving"
          : state.gameOver ? "ended"
            : "charging";
    const statusText = status === "ready" ? `기운 ${charge}/${cost} · 발동 가능`
      : status === "processing" ? `기운 ${charge}/${cost} · 연성 처리 중`
        : status === "moving" ? `기운 ${charge}/${cost} · 드롭 이동 중`
          : status === "ended" ? `기운 ${charge}/${cost} · 전투 종료`
            : `기운 ${charge}/${cost} · 충전 중`;
    const railText = status === "ready" ? "발동!"
      : status === "processing" ? "처리 중"
        : status === "moving" ? "이동 중"
          : status === "ended" ? "종료"
            : `${charge}/${cost}`;
    const castText = status === "ready" ? `${jaryeong?.skillName || skill.name} 발동`
      : status === "processing" ? "연성 처리 중"
        : status === "moving" ? "드롭 이동 중"
          : state.gameOver ? "전투 종료"
            : `기운 ${charge}/${cost} · 충전 중`;
    return { skill, cost, charge, canCast, status, statusText, railText, castText };
  }

  function jaryeongSkillChargeGuide(jaryeong) {
    const element = ELEMENT_RULES[jaryeong?.element] || {};
    const elementName = `${element.symbol || "五"} ${element.label || "같은 오행"}`.trim();
    return `${elementName} 3연성 +1 · ${jaryeong?.hanja || "내"} 한자 +2`;
  }

  function focusJaryeongInspectorTrigger(id) {
    if (!id) return;
    requestAnimationFrame(() => document.querySelector(`[data-jaryeong-inspector="${id}"]`)?.focus({ preventScroll: true }));
  }

  function renderJaryeongSkillInspector() {
    const inspector = $("#jaryeong-skill-inspector");
    if (!inspector) return;
    const id = state.jaryeongInspectorId;
    const jaryeong = getJaryeong(id);
    const inParty = Boolean(jaryeong && state.mode === "roguelike" && state.run?.partyJaryeongIds?.includes(id));
    document.querySelectorAll("[data-jaryeong-inspector]").forEach((button) => {
      button.setAttribute("aria-expanded", String(inParty && button.dataset.jaryeongInspector === id));
    });
    if (!inParty) {
      state.jaryeongInspectorId = null;
      inspector.hidden = true;
      inspector.removeAttribute("data-element");
      return;
    }
    const availability = getJaryeongSkillAvailability(jaryeong);
    const element = ELEMENT_RULES[jaryeong.element] || {};
    const partyIndex = state.run.partyJaryeongIds.indexOf(jaryeong.id);
    const level = state.run.jaryeongLevels?.[jaryeong.id] || 1;
    const awakening = state.run.jaryeongAwakenings?.[jaryeong.id] || 0;
    const guide = jaryeongSkillChargeGuide(jaryeong);
    inspector.hidden = false;
    inspector.dataset.element = jaryeong.element || "wood";
    $("#jaryeong-skill-inspector-art").innerHTML = tamedSpriteMarkup(jaryeong, { frameKey: availability.canCast ? "attack" : "idle", alt: "" });
    $("#jaryeong-skill-inspector-kicker").textContent = `${element.symbol || "靈"} ${element.label || "오행"} 자령 · ${partyIndex + 1}번 단축키`;
    $("#jaryeong-skill-inspector-title").textContent = `${jaryeong.name} · ${availability.skill.name}`;
    $("#jaryeong-skill-inspector-effect").textContent = availability.skill.description;
    $("#jaryeong-skill-inspector-status").textContent = `${availability.statusText}${awakening ? ` · 각성 ${awakening}/5` : ` · Lv.${level}`}`;
    $("#jaryeong-skill-inspector-guide").textContent = `충전법 · ${guide}`;
    const cast = $("#jaryeong-skill-inspector-cast");
    cast.dataset.jaryeongSkill = jaryeong.id;
    cast.dataset.skillKey = String(partyIndex + 1);
    cast.textContent = availability.castText;
    cast.setAttribute("aria-disabled", String(!availability.canCast));
    cast.setAttribute("aria-label", `${partyIndex + 1}번. ${jaryeong.name}의 ${availability.skill.name}. ${availability.skill.description}. ${availability.statusText}. ${guide}${availability.canCast ? ". 지금 발동" : ". 아직 발동할 수 없습니다."}`);
    cast.classList.toggle("is-ready", availability.canCast);
    cast.classList.toggle("is-blocked", !availability.canCast);
  }

  function openJaryeongSkillInspector(id, trigger = null) {
    const jaryeong = getJaryeong(id);
    if (!jaryeong || !state.run?.partyJaryeongIds?.includes(id)) return false;
    jaryeongInspectorReturnFocus = trigger || document.activeElement;
    state.jaryeongInspectorId = id;
    const panel = $("#jaryeong-panel");
    const partyButton = $("#hud-party-button");
    panel?.classList.remove("hud-expanded");
    partyButton?.setAttribute("aria-expanded", "false");
    renderJaryeongSkillInspector();
    audioDirector.playSfx("ui-confirm");
    $("#jaryeong-skill-inspector-cast")?.focus({ preventScroll: true });
    return true;
  }

  function closeJaryeongSkillInspector({ restoreFocus = true, playSound = true } = {}) {
    const inspector = $("#jaryeong-skill-inspector");
    const selectedId = state.jaryeongInspectorId;
    const wasOpen = Boolean(selectedId && inspector && !inspector.hidden);
    state.jaryeongInspectorId = null;
    if (inspector) {
      inspector.hidden = true;
      inspector.removeAttribute("data-element");
    }
    document.querySelectorAll("[data-jaryeong-inspector]").forEach((button) => button.setAttribute("aria-expanded", "false"));
    if (wasOpen && playSound) audioDirector.playSfx("ui-cancel");
    if (wasOpen && restoreFocus) {
      const returnTarget = jaryeongInspectorReturnFocus;
      window.setTimeout(() => {
        if (returnTarget?.isConnected) returnTarget.focus({ preventScroll: true });
        else focusJaryeongInspectorTrigger(selectedId);
      }, 0);
    }
    jaryeongInspectorReturnFocus = null;
    return wasOpen;
  }

  async function castJaryeongInspectorSkill() {
    const id = state.jaryeongInspectorId;
    const jaryeong = getJaryeong(id);
    const availability = jaryeong ? getJaryeongSkillAvailability(jaryeong) : null;
    if (!jaryeong || !availability?.canCast) {
      renderJaryeongSkillInspector();
      return false;
    }
    closeJaryeongSkillInspector({ restoreFocus: false });
    await useJaryeongSkill(id);
    focusJaryeongInspectorTrigger(id);
    return true;
  }

  function renderJaryeongPanel() {
    const panel = $("#jaryeong-panel");
    const wrap = $("#jaryeong-party");
    if (!panel || !wrap) return;
    const active = state.mode === "roguelike";
    panel.classList.toggle("is-active", active);
    if (!active) {
      state.jaryeongInspectorId = null;
      wrap.replaceChildren();
      renderJaryeongSkillInspector();
      const stage = $("#jaryeong-squad-stage");
      if (stage) { stage.replaceChildren(); stage.classList.remove("active"); }
      return;
    }
    const run = state.run;
    const partyIds = run?.partyJaryeongIds || [];
    const fragment = document.createDocumentFragment();
    for (let index = 0; index < 5; index++) {
      const jaryeong = getJaryeong(partyIds[index]);
      const slot = document.createElement("div");
      slot.className = `jaryeong-slot${jaryeong ? " filled" : " empty"}`;
      if (!jaryeong) {
        slot.innerHTML = `<span class="jaryeong-empty-glyph">＋</span><small>자령 ${index + 1}</small>`;
        fragment.appendChild(slot);
        continue;
      }
      const level = run.jaryeongLevels?.[jaryeong.id] || 1;
      const awakening = run.jaryeongAwakenings?.[jaryeong.id] || 0;
      const availability = getJaryeongSkillAvailability(jaryeong);
      const guide = jaryeongSkillChargeGuide(jaryeong);
      slot.classList.add(`skill-${availability.status}`);
      slot.classList.toggle("inspected", state.jaryeongInspectorId === jaryeong.id);
      slot.innerHTML = `<button type="button" class="jaryeong-inspector-trigger" data-jaryeong-inspector="${jaryeong.id}" data-skill-key="${index + 1}" aria-controls="jaryeong-skill-inspector" aria-expanded="${state.jaryeongInspectorId === jaryeong.id}" aria-label="${escapeHtml(`${index + 1}번. ${jaryeong.name}의 ${availability.skill.name}. ${availability.skill.description}. ${availability.statusText}. ${guide}. 스킬 정보 열기`)}"><span class="jaryeong-avatar ${jaryeong.element}">${tamedSpriteMarkup(jaryeong)}</span><span class="jaryeong-slot-copy"><b>${escapeHtml(jaryeong.name)} <small>Lv.${level}${awakening ? ` · 覺${awakening}` : ""}</small></b><em><strong>${escapeHtml(availability.skill.name)}</strong> · ${escapeHtml(availability.skill.description)}</em></span><span class="jaryeong-rail-status" aria-hidden="true"><b>${escapeHtml(availability.skill.name)}</b><small>${escapeHtml(availability.railText)}</small></span></button>`;
      fragment.appendChild(slot);
    }
    wrap.replaceChildren(fragment);
    const label = $("#jaryeong-party-label");
    if (label) label.textContent = `${partyIds.length}/5 편성 · 리더 ${getLeaderJaryeong()?.hanja || "-"}`;
    renderJaryeongSkillInspector();
    renderJaryeongStage();
  }

  let activeCombatHudDrawer = null;

  function currentRunRelics() {
    return (state.run?.relicIds || []).map((id) => RELIC_CATALOG.find((relic) => relic.id === id)).filter(Boolean);
  }

  function relicAssetUrl(id) {
    return `assets/ui/relics-v1/${encodeURIComponent(id)}.png`;
  }

  function renderCombatHudDrawer() {
    const drawer = $("#hud-secondary-drawer");
    const title = $("#hud-drawer-title");
    const content = $("#hud-drawer-content");
    if (!drawer || !title || !content) return;
    const open = state.mode === "roguelike" && Boolean(activeCombatHudDrawer);
    drawer.hidden = !open;
    drawer.classList.toggle("open", open);
    document.querySelectorAll("[data-hud-drawer]").forEach((button) => {
      const selected = open && button.dataset.hudDrawer === activeCombatHudDrawer;
      button.classList.toggle("active", selected);
      button.setAttribute("aria-expanded", String(selected));
    });
    if (!open) {
      content.replaceChildren();
      return;
    }
    if (activeCombatHudDrawer === "relics") {
      const relics = currentRunRelics();
      title.textContent = `유물 ${relics.length}종`;
      content.innerHTML = relics.length
        ? `<div class="hud-relic-list">${relics.map((relic) => `<article><b class="relic-art"><img src="${relicAssetUrl(relic.id)}" alt="" /></b><span><strong>${escapeHtml(relic.name)}</strong><small>${escapeHtml(relic.desc)}</small></span></article>`).join("")}</div>`
        : '<p class="hud-drawer-empty"><b>寶</b><span>아직 획득한 유물이 없습니다.<small>전투 보상과 행로 이벤트에서 유물을 얻을 수 있습니다.</small></span></p>';
      return;
    }
    const battleLog = $("#battle-log");
    const entries = battleLog ? [...battleLog.children] : [];
    title.textContent = `전투 기록 ${entries.length}`;
    content.innerHTML = entries.length
      ? `<div class="hud-log-list">${entries.map((entry) => entry.outerHTML).join("")}</div>`
      : '<p class="hud-drawer-empty"><b>記</b><span>아직 기록된 전투 행동이 없습니다.<small>매치와 적 행동 결과가 여기에 쌓입니다.</small></span></p>';
  }

  function syncCombatHud() {
    const relicCount = $("#hud-relic-count");
    const logCount = $("#hud-log-count");
    if (relicCount) relicCount.textContent = String(currentRunRelics().length);
    if (logCount) logCount.textContent = String($("#battle-log")?.children.length || 0);
    if (activeCombatHudDrawer) renderCombatHudDrawer();
  }

  function setCombatHudDrawer(kind = null) {
    activeCombatHudDrawer = activeCombatHudDrawer === kind ? null : kind;
    renderCombatHudDrawer();
    audioDirector.playSfx(activeCombatHudDrawer ? "ui-confirm" : "ui-cancel");
  }

  function toggleCombatParty() {
    const panel = $("#jaryeong-panel");
    const button = $("#hud-party-button");
    if (!panel || !button) return;
    const expanded = !panel.classList.contains("hud-expanded");
    panel.classList.toggle("hud-expanded", expanded);
    button.setAttribute("aria-expanded", String(expanded));
    audioDirector.playSfx(expanded ? "ui-confirm" : "ui-cancel");
  }

  function closeCombatHudPanels() {
    activeCombatHudDrawer = null;
    closeJaryeongSkillInspector({ restoreFocus: false, playSound: false });
    const panel = $("#jaryeong-panel");
    const partyButton = $("#hud-party-button");
    panel?.classList.remove("hud-expanded");
    partyButton?.setAttribute("aria-expanded", "false");
    renderCombatHudDrawer();
  }

  function renderJaryeongStage() {
    const wrap = $("#jaryeong-squad-stage");
    if (!wrap) return;
    const party = state.mode === "roguelike" ? getPartyJaryeongs() : [];
    wrap.classList.toggle("active", party.length > 0);
    wrap.innerHTML = party.map((jaryeong, index) => `<div class="squad-jaryeong ${jaryeong.element}" style="--slot:${index}" data-squad-jaryeong="${jaryeong.id}">${tamedSpriteMarkup(jaryeong, { alt: `${jaryeong.name} · ${jaryeong.reading}` })}</div>`).join("");
  }

  function showEnemyPhaseBanner(phase) {
    const banner = $("#enemy-phase-banner");
    if (!banner || !phase) return;
    banner.textContent = `페이즈 전환 · ${phase.label}`;
    banner.classList.remove("show");
    void banner.offsetWidth;
    banner.classList.add("show");
    window.setTimeout(() => banner.classList.remove("show"), 1900);
  }

  function renderEnemyIntent() {
    const enemy = currentEnemy();
    const storyGuardLesson = getActiveStoryGuardLesson();
    const multiMember = activeDebugEnemyMember();
    const bossPatternActive = !storyGuardLesson && !multiMember && Boolean(getBossTurnPlan(enemy, state.turn));
    const forecast = storyGuardLesson
      ? [0, 1, 2].map((offset) => currentEnemyIntent(state.turn + offset))
      : multiMember
      ? [0, 1, 2].map((offset) => getDebugEnemyIntentAtOffset(multiMember, offset))
      : bossPatternActive
      ? [0, 1, 2].map((offset) => currentEnemyIntent(state.turn + offset))
      : getEnemyForecast();
    const intent = forecast[0] || currentEnemyIntent();
    const attackTurns = turnsUntilEnemyAttack();
    const imminentAttack = attackTurns === 0;
    const safeTurn = attackTurns == null || attackTurns > 0;
    const phase = getEnemyPhase(enemy);
    const pendingPhase = state.enemyPlan.pendingPhaseIndex != null ? enemy.phases?.[state.enemyPlan.pendingPhaseIndex] : null;
    const card = $("#enemy-intent");
    const key = storyGuardLesson
      ? `story:${storyGuardLesson.chapterId}:${state.turn}:${intent.id}`
      : bossPatternActive ? `${enemy.encounterId}:${state.turn}:${intent.id}` : `${state.wave}:${phase.id}:${state.enemyPlan.cursor}`;
    const previousKey = state.enemyPlan.lastAnnouncedKey;
    if (card) {
      card.className = `enemy-intent-card threat-${intent.threat || "medium"}${state.delayed ? " is-delayed" : ""}${safeTurn ? " is-safe-turn" : " is-imminent-turn"}`;
      $("#enemy-intent-icon").textContent = state.delayed ? "⌛" : (intent.icon || "⚔");
      $("#enemy-intent-kind").textContent = state.delayed ? "행동 지연" : safeTurn ? "이번 턴 공격 없음" : intentKindLabel(intent);
      $("#enemy-intent-timing").textContent = attackTurns == null
        ? "공격 예고 없음"
        : imminentAttack
          ? "이번 연성 후 공격"
          : `공격까지 ${attackTurns}턴`;
      const countdown = $("#enemy-attack-countdown");
      if (countdown) {
        countdown.className = `enemy-attack-countdown ${imminentAttack ? "is-imminent" : "is-safe"}`;
        $("#enemy-attack-countdown-label").textContent = attackTurns == null ? "공격" : "공격까지";
        $("#enemy-attack-countdown-value").textContent = attackTurns == null ? "–" : String(attackTurns);
        $("#enemy-attack-countdown-unit").textContent = attackTurns == null ? "" : "턴";
        $("#enemy-attack-countdown-note").textContent = attackTurns == null
          ? "현재 주기에 직접 피해 없음"
          : imminentAttack
            ? "이번 연성 뒤 바로 공격"
            : attackTurns === 1
              ? "이번 턴은 안전 · 다음 연성 뒤 공격"
              : `${attackTurns}번의 연성 뒤 공격`;
        countdown.setAttribute("aria-label", attackTurns == null ? "현재 공격 예고 없음" : imminentAttack ? "이번 연성 후 적이 공격합니다" : `적 공격까지 ${attackTurns}턴`);
      }
      const threat = $("#enemy-intent-threat");
      threat.textContent = intentThreatLabel(intent);
      threat.className = `intent-threat threat-${intent.threat || "medium"}`;
      $("#enemy-intent-name").textContent = intent.name;
      $("#enemy-intent-value").textContent = intent.effectText || `${intent.damage || 0} 피해`;
      $("#enemy-intent-response").textContent = `권장 대응: ${intent.responseHint || "보드 흐름을 이어가세요"}`;
    }
    const phaseLabel = $("#enemy-phase-label");
    if (phaseLabel) phaseLabel.textContent = storyGuardLesson
      ? `수련 전용 예고 · ${storyGuardLesson.intentName}`
      : multiMember
      ? `다수전 시험 · ${state.debugEnemyGroup.members.filter((member) => member.currentHp > 0).length}체 생존`
      : bossPatternActive
      ? `보스 전용 패턴 · ${enemy.name}`
      : `${state.enemyPlan.phaseIndex + 1}단계 · ${phase.label}${pendingPhase ? ` · 다음부터 ${pendingPhase.label}` : ""}`;
    const cycle = $("#enemy-pattern-cycle");
    if (cycle) cycle.textContent = storyGuardLesson ? "고정 수련 패턴" : bossPatternActive ? "7턴 순환 · 7턴째 봉인" : (phase.sequence?.length || 1) === 1 ? "고정 패턴" : `${phase.sequence.length}턴 순환`;
    const timeline = $("#enemy-pattern-timeline");
    if (timeline) {
      forecast.forEach((entry, index) => {
        const node = timeline.children[index] || timeline.appendChild(makePatternStep());
        node.className = `pattern-step ${index === 0 ? "current" : index === 1 ? "next" : "later"} threat-${entry.threat || "medium"}`;
        node.dataset.intentId = entry.id;
        node.querySelector(".pattern-step-index").textContent = index === 0 ? "지금" : `${index}턴 뒤`;
        node.querySelector(".pattern-step-icon").textContent = entry.icon || "⚔";
        node.querySelector(".pattern-step-copy").textContent = entry.name;
        node.title = `${entry.name} · ${entry.effectText || "행동 예고"}`;
      });
      while (timeline.children.length > forecast.length) timeline.lastElementChild.remove();
    }
    if (previousKey && previousKey !== key && card) {
      card.classList.remove("telegraphing");
      void card.offsetWidth;
      card.classList.add("telegraphing");
      const live = $("#enemy-intent-live");
      if (live) live.textContent = `${enemy.name} 다음 행동: ${intent.name}, ${intent.effectText || "행동 예고"}. 권장 대응: ${intent.responseHint || "보드 흐름을 이어가세요"}`;
    }
    state.enemyPlan.lastAnnouncedKey = key;
  }

  function updateReadingModeButtons() {
    document.querySelectorAll("[data-reading-mode]").forEach((button) => {
      const selected = button.dataset.readingMode === state.readingMode;
      button.classList.toggle("selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
  }

  function setReadingMode(mode, persist = true) {
    state.readingMode = mode === "large" ? "large" : "compact";
    document.body.classList.toggle("reading-large", state.readingMode === "large");
    updateReadingModeButtons();
    if (persist) {
      try { localStorage.setItem(READING_MODE_KEY, state.readingMode); } catch {}
    }
  }

  function loadReadingMode() {
    let saved = "large";
    try { saved = localStorage.getItem(READING_MODE_KEY) || "large"; } catch {}
    setReadingMode(saved, false);
  }

  function updateIdiomSpeedButtons() {
    document.querySelectorAll("[data-idiom-speed]").forEach((button) => {
      const selected = button.dataset.idiomSpeed === state.idiomSpeed;
      button.classList.toggle("selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
  }

  function setIdiomSpeed(speed, persist = true) {
    state.idiomSpeed = normalizeIdiomSpeed(speed);
    document.body.dataset.idiomSpeed = state.idiomSpeed;
    updateIdiomSpeedButtons();
    if (persist) {
      try { localStorage.setItem(IDIOM_SPEED_STORAGE_KEY, state.idiomSpeed); } catch {}
    }
  }

  function loadIdiomSpeed() {
    let saved = "slow";
    try { saved = localStorage.getItem(IDIOM_SPEED_STORAGE_KEY) || "slow"; } catch {}
    setIdiomSpeed(saved, false);
  }

  function updateBattleDisplayButtons() {
    document.querySelectorAll("[data-battle-display]").forEach((button) => {
      const selected = button.dataset.battleDisplay === state.battleDisplayMode;
      button.classList.toggle("selected", selected);
      button.setAttribute("aria-checked", String(selected));
      button.tabIndex = selected ? 0 : -1;
    });
  }

  function setBattleDisplayMode(mode, persist = true) {
    state.battleDisplayMode = normalizeBattleDisplay(mode);
    document.body.dataset.battleDisplay = state.battleDisplayMode;
    updateBattleDisplayButtons();
    if (persist) {
      try { localStorage.setItem(BATTLE_DISPLAY_STORAGE_KEY, state.battleDisplayMode); } catch {}
    }
  }

  function loadBattleDisplayMode() {
    // Production default: keep combat cause/result copy on screen long enough to read.
    let saved = "slow";
    try { saved = localStorage.getItem(BATTLE_DISPLAY_STORAGE_KEY) || "slow"; } catch {}
    setBattleDisplayMode(saved, false);
  }

  function handleBattleDisplayKeydown(event) {
    const option = event.target.closest?.("[data-battle-display]");
    if (!option || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    const options = [...document.querySelectorAll("[data-battle-display]")];
    const current = Math.max(0, options.indexOf(option));
    const next = event.key === "Home" ? 0
      : event.key === "End" ? options.length - 1
        : (current + (event.key === "ArrowRight" ? 1 : -1) + options.length) % options.length;
    event.preventDefault();
    setBattleDisplayMode(options[next].dataset.battleDisplay);
    options[next].focus({ preventScroll: true });
  }

  function updateIdiomDisplayButtons() {
    document.querySelectorAll("[data-idiom-display]").forEach((button) => {
      const selected = button.dataset.idiomDisplay === state.idiomDisplayMode;
      button.classList.toggle("selected", selected);
      button.setAttribute("aria-checked", String(selected));
      button.tabIndex = selected ? 0 : -1;
    });
  }

  function setIdiomDisplayMode(mode, persist = true) {
    state.idiomDisplayMode = ["focus", "all-large", "compact"].includes(mode) ? mode : "balanced";
    document.body.dataset.idiomDisplay = state.idiomDisplayMode;
    updateIdiomDisplayButtons();
    if (state.mode) renderIdioms();
    if (persist) {
      try { localStorage.setItem(IDIOM_DISPLAY_MODE_KEY, state.idiomDisplayMode); } catch {}
    }
  }

  function loadIdiomDisplayMode() {
    let saved = "all-large";
    try { saved = localStorage.getItem(IDIOM_DISPLAY_MODE_KEY) || "all-large"; } catch {}
    setIdiomDisplayMode(saved, false);
  }

  function handleIdiomDisplayKeydown(event) {
    const option = event.target.closest?.("[data-idiom-display]");
    if (!option || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    const options = [...document.querySelectorAll("[data-idiom-display]")];
    const current = Math.max(0, options.indexOf(option));
    const next = event.key === "Home" ? 0
      : event.key === "End" ? options.length - 1
        : (current + (event.key === "ArrowRight" ? 1 : -1) + options.length) % options.length;
    event.preventDefault();
    setIdiomDisplayMode(options[next].dataset.idiomDisplay);
    options[next].focus({ preventScroll: true });
  }

  function openSettings() {
    updateReadingModeButtons();
    updateIdiomSpeedButtons();
    updateBattleDisplayButtons();
    updateIdiomDisplayButtons();
    syncAudioControls();
    const modal = $("#settings-modal");
    modal.inert = false;
    modal.classList.add("open");
    $("#settings-close").focus({ preventScroll: true });
  }

  function closeSettings() {
    $("#settings-modal").classList.remove("open");
  }

  let glossaryFilter = "all";

  function normalizeGlossaryText(value) {
    return String(value || "").normalize("NFKC").toLocaleLowerCase("ko-KR").replace(/\s+/g, " ").trim();
  }

  function filterGlossary() {
    const query = normalizeGlossaryText($("#glossary-search")?.value);
    let visibleCount = 0;
    document.querySelectorAll("#glossary-sections [data-glossary-section]").forEach((section) => {
      const sectionMatches = glossaryFilter === "all" || section.dataset.glossarySection === glossaryFilter;
      let sectionCount = 0;
      section.querySelectorAll(".glossary-entry").forEach((entry) => {
        const haystack = normalizeGlossaryText(`${entry.textContent} ${entry.dataset.glossaryTerms || ""}`);
        const visible = sectionMatches && (!query || haystack.includes(query));
        entry.hidden = !visible;
        if (visible) sectionCount++;
      });
      section.hidden = sectionCount === 0;
      visibleCount += sectionCount;
    });
    const count = $("#glossary-result-count");
    if (count) count.textContent = query
      ? `‘${$("#glossary-search").value.trim()}’ 검색 결과 ${visibleCount}개`
      : glossaryFilter === "all" ? `전체 용어 ${visibleCount}개` : `선택한 분류의 용어 ${visibleCount}개`;
    const empty = $("#glossary-empty");
    if (empty) empty.hidden = visibleCount > 0;
  }

  function setGlossaryFilter(filter = "all") {
    const available = new Set(["all", "world", "alchemy", "jaryeong", "journey", "boss"]);
    glossaryFilter = available.has(filter) ? filter : "all";
    document.querySelectorAll("[data-glossary-filter]").forEach((button) => {
      const active = button.dataset.glossaryFilter === glossaryFilter;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    filterGlossary();
  }

  function prepareGlossaryEntries() {
    document.querySelectorAll("#glossary-sections .glossary-entry").forEach((entry) => {
      entry.setAttribute("role", "button");
      entry.setAttribute("tabindex", "0");
      if (!entry.hasAttribute("aria-expanded")) entry.setAttribute("aria-expanded", "false");
    });
  }

  function toggleGlossaryEntry(entry, expanded = !entry.classList.contains("expanded")) {
    if (!entry?.classList.contains("glossary-entry")) return;
    entry.classList.toggle("expanded", expanded);
    entry.setAttribute("aria-expanded", String(expanded));
  }

  function jumpToGlossaryTerm(button) {
    const query = button?.dataset.glossaryJump || "";
    if (!query) return;
    setGlossaryFilter(button.dataset.glossaryJumpFilter || "all");
    const search = $("#glossary-search");
    if (search) search.value = query;
    filterGlossary();
    const visibleEntries = [...document.querySelectorAll("#glossary-sections .glossary-entry:not([hidden])")];
    const normalizedQuery = normalizeGlossaryText(query);
    const target = visibleEntries.find((entry) => normalizeGlossaryText(entry.querySelector("dt")?.textContent) === normalizedQuery)
      || visibleEntries.find((entry) => normalizeGlossaryText(entry.dataset.glossaryTerms).split(" ").includes(normalizedQuery))
      || visibleEntries[0];
    if (!target) return;
    toggleGlossaryEntry(target, true);
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(() => target.focus({ preventScroll: true }), 180);
  }

  function openGlossary() {
    prepareGlossaryEntries();
    filterGlossary();
    $("#glossary-modal").classList.add("open");
    $("#glossary-search")?.focus({ preventScroll: true });
  }

  function closeGlossary() {
    $("#glossary-modal").classList.remove("open");
  }

  function openIdiomDetail(id) {
    const idiom = ALL_IDIOMS.find((candidate) => candidate.id === id);
    if (!idiom || state.mode === "pang") return;
    state.idiomDetailId = id;
    $("#idiom-detail-glyphs").innerHTML = idiom.chars.map((char) => `<b title="${char} · ${HANJA_READINGS[char]}">${char}</b>`).join("");
    $("#idiom-detail-title").textContent = idiom.name;
    $("#idiom-detail-reading").textContent = `${idiom.sourceHanja} · ${idiom.pronunciation || idiom.name}`;
    $("#idiom-detail-meaning").textContent = idiomMeaningText(idiom);
    $("#idiom-detail-effect").textContent = idiomEffectText(idiom);
    $("#idiom-detail-modal").classList.add("open");
    $("#idiom-detail-close").focus();
  }

  function closeIdiomDetail() {
    $("#idiom-detail-modal").classList.remove("open");
    state.idiomDetailId = null;
  }

  const DEBUG_UNLOCK_PRESS_COUNT = 5;
  let debugUnlocked = false;
  let debugUnlockPresses = 0;

  function unlockDebugTools() {
    if (debugUnlocked) return;
    debugUnlocked = true;
    [$("#debug-button"), $("#menu-debug-button"), $("#menu-debug-entry")].forEach((button) => {
      if (!button) return;
      button.hidden = false;
      button.disabled = false;
      button.removeAttribute("aria-hidden");
      button.removeAttribute("tabindex");
      button.classList.add("debug-unlocked");
    });
    const modal = $("#debug-modal");
    if (modal) {
      modal.hidden = false;
      modal.classList.add("debug-unlocked");
      modal.setAttribute("aria-hidden", "true");
      modal.inert = true;
    }
    const trigger = $("#debug-unlock-trigger");
    if (trigger) trigger.setAttribute("aria-label", "사자연성 제목 인장, 디버그 시험실 해금됨");
    const progress = $("#debug-unlock-progress");
    if (progress) {
      progress.hidden = false;
      progress.textContent = "디버그 시험실 해금 완료 · 아래 버튼에서 열 수 있습니다";
      progress.classList.add("unlocked");
    }
    const message = $("#debug-message");
    if (message) message.textContent = "시험실 봉인이 풀렸습니다. 연성막·봉인·문자 큐 제거와 3체 다수전·4개 광역공격·무작위 부적 소환을 확인하세요.";
    audioDirector.playSfx("ui-confirm");
  }

  function handleDebugUnlockPress() {
    const trigger = $("#debug-unlock-trigger");
    if (debugUnlocked) {
      trigger?.classList.add("secret-tap");
      window.setTimeout(() => trigger?.classList.remove("secret-tap"), 240);
      return;
    }
    debugUnlockPresses++;
    trigger?.classList.remove("secret-tap");
    requestAnimationFrame(() => trigger?.classList.add("secret-tap"));
    window.setTimeout(() => trigger?.classList.remove("secret-tap"), 240);
    const remaining = Math.max(0, DEBUG_UNLOCK_PRESS_COUNT - debugUnlockPresses);
    if (trigger) trigger.setAttribute("aria-label", remaining ? `사자연성 제목 인장, 시험실 해금까지 ${remaining}번` : "사자연성 제목 인장, 디버그 시험실 해금됨");
    const progress = $("#debug-unlock-progress");
    if (progress) {
      progress.hidden = false;
      progress.textContent = `시험실 봉인 ${Math.min(debugUnlockPresses, DEBUG_UNLOCK_PRESS_COUNT)} / ${DEBUG_UNLOCK_PRESS_COUNT}`;
    }
    if (debugUnlockPresses >= DEBUG_UNLOCK_PRESS_COUNT) unlockDebugTools();
  }

  function debugUnlockAllJaryeongs() {
    const current = sanitizeJaryeongMetaState(metaProgress.jaryeongMeta);
    JARYEONG_LIBRARY.forEach((jaryeong) => {
      current.owned[jaryeong.id] ||= { level: 1, levelProgress: 0, awakening: 0, duplicateSummons: 0 };
    });
    metaProgress.jaryeongMeta = sanitizeJaryeongMetaState(current);
    metaProgress.seenJaryeongs = [...new Set([...(metaProgress.seenJaryeongs || []), ...JARYEONG_LIBRARY.map((entry) => entry.id)])];
    saveMetaProgress();
    renderJaryeongMeta();
    debugMessage(`모든 자령 ${JARYEONG_LIBRARY.length}종을 Lv.1 상태로 해금했습니다. 출전 편성에서 전체 목록을 확인하세요.`);
    audioDirector.playSfx("reward");
  }

  function debugResetAllData() {
    const confirmed = window.confirm("사자연성의 런·수집·튜토리얼·표시·음향 저장 데이터를 모두 초기화할까요? 이 작업은 되돌릴 수 없습니다.");
    if (!confirmed) {
      debugMessage("게임 데이터 초기화를 취소했습니다.");
      return;
    }
    [META_KEY, RUN_SAVE_KEY, STORY_TRAINING_STORAGE_KEY, READING_MODE_KEY, IDIOM_DISPLAY_MODE_KEY, IDIOM_SPEED_STORAGE_KEY, BATTLE_DISPLAY_STORAGE_KEY, "sajayeonseong-audio-v4"].forEach((key) => {
      try { localStorage.removeItem(key); } catch {}
    });
    window.location.reload();
  }

  function debugCombatAllowed() {
    return state.mode === "puzzle" || state.mode === "roguelike";
  }

  function debugModeLabel() {
    if (state.mode === "puzzle") return "퍼즐 모드";
    if (state.mode === "roguelike") return "로그라이크";
    if (state.mode === "pang") return "팡팡 모드";
    return "메인 메뉴";
  }

  function updateDebugPanel() {
    const allowed = debugCombatAllowed();
    const modeValue = $("#debug-mode-value");
    const hpValue = $("#debug-hp-value");
    const reviveValue = $("#debug-revive-value");
    const barrierValue = $("#debug-barrier-value");
    const copy = $("#debug-copy");
    if (modeValue) modeValue.textContent = debugModeLabel();
    if (hpValue) hpValue.textContent = allowed ? `${Math.max(0, Math.ceil(state.playerHp))} / ${maxPlayerHp()}` : "-";
    if (reviveValue) reviveValue.textContent = allowed ? (state.reviveUsed ? "사용함" : "가능") : "-";
    if (barrierValue) {
      const barrier = sanitizeSoftElementBarrier(state.enemyElementBarrier);
      const element = barrier ? getElementMeta(barrier.preferredElement) : null;
      barrierValue.textContent = !allowed ? "-" : barrier
        ? `${element.symbol} ${formatDefenseValue(barrier.hp)} / ${formatDefenseValue(barrier.maxHp)} · ×${formatDefenseValue(barrier.breakMultiplier)}`
        : "없음";
    }
    if (copy) copy.textContent = state.mode === "pang"
      ? "팡팡 모드의 점수·시간 로직은 이 패널에서 바꾸지 않습니다. 퍼즐·로그라이크 전투를 선택하세요."
      : state.mode ? "게임오버·부활 흐름과 전투 상태를 빠르게 확인합니다."
        : "전투 모드에 들어간 뒤 게임오버·부활 흐름을 확인할 수 있습니다.";
    document.querySelectorAll("[data-debug-combat]").forEach((button) => { button.disabled = !allowed; });
    document.querySelectorAll("[data-debug-rogue]").forEach((button) => { button.disabled = state.mode !== "roguelike" || !state.run; });
  }

  function debugMessage(message) {
    const target = $("#debug-message");
    if (target) target.textContent = message;
    updateDebugPanel();
  }

  function openDebug() {
    if (!debugUnlocked) return;
    updateDebugPanel();
    $("#debug-modal").inert = false;
    $("#debug-modal").classList.add("open");
    $("#debug-close").focus({ preventScroll: true });
  }

  function closeDebug() {
    $("#debug-modal").classList.remove("open");
  }

  function closeDebugCombatOverlays() {
    ["#result-modal", "#roguelike-result-modal", "#revive-modal", "#intro-modal", "#roguelike-intro-modal", "#roguelike-leader-modal", "#roguelike-draft-modal", "#roguelike-reward-modal", "#jaryeong-contract-modal"].forEach((selector) => $(selector)?.classList.remove("open"));
  }

  function debugForceDefeat() {
    if (!debugCombatAllowed()) { debugMessage("퍼즐·로그라이크 전투에서만 사용할 수 있습니다."); return; }
    closeDebugCombatOverlays();
    state.reviveUsed = false;
    state.gameOver = false;
    state.resolving = false;
    state.playerHp = 0;
    updateAll();
    closeDebug();
    void handleDefeat();
  }

  function debugResetRevive() {
    if (!debugCombatAllowed()) { debugMessage("퍼즐·로그라이크 전투에서만 사용할 수 있습니다."); return; }
    closeDebugCombatOverlays();
    state.reviveUsed = false;
    state.gameOver = false;
    state.resolving = false;
    state.playerHp = maxPlayerHp();
    state.shield = 0;
    if (state.run) state.run.completed = false;
    updateAll();
    debugMessage("부활 가능 상태로 초기화했습니다.");
  }

  function debugSetEnemyOne() {
    if (!debugCombatAllowed()) { debugMessage("퍼즐·로그라이크 전투에서만 사용할 수 있습니다."); return; }
    state.enemyHp = 1;
    updateAll();
    debugMessage("현재 적 HP를 1로 설정했습니다.");
  }

  function debugHealPlayer() {
    if (!debugCombatAllowed()) { debugMessage("퍼즐·로그라이크 전투에서만 사용할 수 있습니다."); return; }
    closeDebugCombatOverlays();
    state.gameOver = false;
    state.resolving = false;
    state.playerHp = maxPlayerHp();
    updateAll();
    debugMessage("플레이어 HP를 100으로 회복했습니다.");
  }

  function debugAddShield() {
    if (!debugCombatAllowed()) { debugMessage("퍼즐·로그라이크 전투에서만 사용할 수 있습니다."); return; }
    gainShield(50);
    updateAll();
    debugMessage("보호막 50을 추가했습니다.");
  }

  function debugAddEnemyShield() {
    if (!debugCombatAllowed()) { debugMessage("퍼즐·로그라이크 전투에서만 사용할 수 있습니다."); return; }
    state.enemyElementBarrier = null;
    state.enemyShield += 40;
    updateAll();
    debugMessage("적 일반 보호막 40을 추가했습니다. 금빛 반투명 구체와 HUD를 확인하세요.");
  }

  function debugAddEnemyBurn() {
    if (!debugCombatAllowed()) { debugMessage("퍼즐·로그라이크 전투에서만 사용할 수 있습니다."); return; }
    addEnemyBurn(12);
    updateAll();
    debugMessage("적 화상 12를 추가했습니다. 몬스터 옆 火 배지와 수치를 확인하세요.");
  }

  function debugClearQueue() {
    if (!debugCombatAllowed()) { debugMessage("퍼즐·로그라이크 전투에서만 사용할 수 있습니다."); return; }
    state.queue = [];
    state.freshQueueIds.clear();
    updateAll();
    debugMessage("문자 큐를 비웠습니다.");
  }

  function debugForceMatch() {
    if (!debugCombatAllowed() || state.resolving || state.gameOver) return;
    const matchElement = ELEMENTS.find((element) => element.id === "fire") || ELEMENTS[0];
    for (let col = 0; col < 3; col++) {
      state.board[0][col].element = matchElement.id;
      state.board[0][col].symbol = matchElement.symbol;
    }
    renderBoard();
    closeDebug();
    addLog("<strong>공격 연출 QA</strong> · 첫 줄에 화 3매치를 만들었습니다.", "fire");
    window.setTimeout(() => { if (!state.resolving && !state.gameOver) void resolveTurn(); }, 120);
  }

  function debugSummonPatternTrial() {
    closeCombatHudPanels();
    closeGameOverlays();
    $("#main-menu").classList.remove("open");
    document.body.classList.remove("menu-mode", "pang-mode", "roguelike-mode");
    document.body.classList.add("puzzle-mode", "debug-trial-mode");
    state.mode = "puzzle";
    state.run = null;
    state.storySession = null;
    state.debugEnemyGroup = null;
    state.debugEnemyOverride = DEBUG_PATTERN_TRIAL_ENEMY;
    document.body.classList.remove("debug-multi-mode");
    $("#mode-kicker").textContent = "HIDDEN DEBUG LAB";
    $("#mode-title").textContent = "보스 패턴 시험실";
    resetGame();
    state.enemyHp = DEBUG_PATTERN_TRIAL_ENEMY.hp;
    state.enemyShield = 0;
    state.enemyElementBarrier = createSoftElementBarrier({ hp: 48, preferredElement: "water", breakMultiplier: 2 });
    state.queue = [..."木火土金水山林海"].map((char) => ({ id: uid(), char, born: state.turn }));
    state.freshQueueIds = new Set();
    state.lockedTiles = new Map();
    state.gameOver = false;
    state.resolving = false;
    resetEnemyPlan();
    updateAll();
    showBattleFeedback("prepare", "시험령 소환 완료", "수 연성막 48 · 모든 속성 유효 · 수 파괴력 ×2 · 다음 행동은 타일 봉인");
    addLog("<strong>숨은 시험실</strong> · 수 속성 연성막은 모든 속성으로 깨지며 수 공격만 파괴력 ×2입니다.", "water");
    addLog("시험령은 <strong>타일 봉인 → 문자 큐 2개 임의 제거 → 연성막 재전개 → 공격</strong>을 반복합니다.", "start");
  }

  function debugSummonMultiTrial() {
    closeCombatHudPanels();
    closeGameOverlays();
    $("#main-menu").classList.remove("open");
    document.body.classList.remove("menu-mode", "pang-mode", "roguelike-mode", "debug-trial-mode");
    document.body.classList.add("puzzle-mode", "debug-multi-mode");
    state.mode = "puzzle";
    state.run = null;
    state.storySession = null;
    state.debugEnemyOverride = null;
    state.debugEnemyGroup = null;
    $("#mode-kicker").textContent = "HIDDEN DEBUG LAB";
    $("#mode-title").textContent = "다수전·광역공격 시험실";
    resetGame();
    state.debugEnemyGroup = createDebugEnemyGroup();
    loadDebugEnemyMember(0, { persist: false });
    state.gameOver = false;
    state.resolving = false;
    resetEnemyPlan();
    updateAll();
    closeDebug();
    showBattleFeedback("prepare", "다수전 시험 시작", "3체 · 첫 턴 안전 · 다음 연성 뒤 합동 공격 · 4개 이상 매치는 광역");
    addLog("<strong>숨은 다수전 시험실</strong> · 적을 눌러 집중 대상을 바꿀 수 있습니다.", "start");
    addLog("3개 매치는 선택 대상만, <strong>한 덩어리 4개 이상 매치</strong>는 같은 오행 피해가 적 전체에 들어갑니다.", "combo");
  }

  function debugWideMatch() {
    if (!isDebugMultiBattle() || state.resolving || state.gameOver) {
      debugMessage("먼저 ‘다수전 소환’을 눌러 시험 전투를 시작하세요.");
      return;
    }
    const fire = getElementMeta("fire");
    for (let col = 0; col < 4; col++) {
      state.board[0][col].element = fire.id;
      state.board[0][col].symbol = fire.symbol;
    }
    renderBoard();
    closeDebug();
    addLog("<strong>광역공격 QA</strong> · 첫 줄에 화 4매치를 만들었습니다. 세 적의 기운 변화를 비교합니다.", "fire");
    window.setTimeout(() => { if (!state.resolving && !state.gameOver) void resolveTurn(); }, 120);
  }

  function debugGrantSummon() {
    const meta = sanitizeJaryeongMetaState(metaProgress.jaryeongMeta);
    metaProgress.jaryeongMeta = { ...meta, talismanPieces: Math.min(Number.MAX_SAFE_INTEGER, (meta.talismanPieces || 0) + TALISMAN_PIECES_PER_SUMMON_TICKET) };
    saveMetaProgress();
    closeDebug();
    openJaryeongMeta("summon");
    audioDirector.playSfx("reward");
  }

  function debugWaterMatch() {
    if (!debugCombatAllowed() || state.resolving || state.gameOver) return;
    if (!sanitizeSoftElementBarrier(state.enemyElementBarrier)) {
      state.enemyElementBarrier = createSoftElementBarrier({ hp: 48, preferredElement: "water", breakMultiplier: 2 });
    }
    const water = getElementMeta("water");
    for (let col = 0; col < 3; col++) {
      state.board[0][col].element = water.id;
      state.board[0][col].symbol = water.symbol;
    }
    renderBoard();
    closeDebug();
    addLog("<strong>속성 연성막 QA</strong> · 첫 줄에 수 3매치를 만들었습니다. 막 파괴력 ×2를 확인합니다.", "water");
    window.setTimeout(() => { if (!state.resolving && !state.gameOver) void resolveTurn(); }, 120);
  }

  function debugRotateIdioms() {
    if (!debugCombatAllowed()) { debugMessage("퍼즐·로그라이크 전투에서만 사용할 수 있습니다."); return; }
    const fixedIds = getFixedIdioms().map((idiom) => idiom.id);
    refreshRotatingIdioms({ force: true, announce: true });
    renderIdioms();
    const fixedStayed = fixedIds.every((id, index) => getFixedIdioms()[index]?.id === id);
    debugMessage(`${fixedStayed ? "고정 성어 유지" : "고정 성어 변경 감지"} · 순환 성어 ${getRotatingIdioms().map((idiom) => idiom.name).join(" · ")} · 다음 교체 ${state.idiomRecipeInterval}턴 후`);
  }

  function debugFillParty() {
    if (state.mode !== "roguelike" || !state.run?.leaderJaryeongId) {
      debugMessage("리더를 고른 로그라이크 전투에서만 사용할 수 있습니다.");
      return;
    }
    const leaderId = state.run.leaderJaryeongId;
    const ids = [leaderId, ...JARYEONG_LIBRARY.map((jaryeong) => jaryeong.id).filter((id) => id !== leaderId)].slice(0, 5);
    state.run.partyJaryeongIds = ids;
    state.run.jaryeongLevels = Object.fromEntries(ids.map((id) => [id, state.run.jaryeongLevels?.[id] || 1]));
    state.run.jaryeongAwakenings = Object.fromEntries(ids.map((id) => [id, state.run.jaryeongAwakenings?.[id] || 0]));
    state.run.skillCharges = Object.fromEntries(ids.map((id) => [id, state.run.skillCharges?.[id] || 0]));
    rebuildRunCharacterPool();
    updateAll();
    debugMessage("이전 저장 호환 QA용으로 자령 팀을 5명 채웠습니다.");
  }

  function debugGrantRelics() {
    if (state.mode !== "roguelike" || !state.run) {
      debugMessage("로그라이크 런에서만 사용할 수 있습니다.");
      return;
    }
    const before = state.run.relicIds.length;
    RELIC_CATALOG.forEach((relic) => {
      if (state.run.relicIds.includes(relic.id)) return;
      state.run.relicIds.push(relic.id);
      applyRunEffects(relic.effects || []);
    });
    updateAll();
    saveActiveRun();
    debugMessage(`유물 ${state.run.relicIds.length - before}종을 추가했습니다. 총 ${state.run.relicIds.length}/18 · 보상 미리보기와 전투 훅을 재현할 수 있습니다.`);
  }

  function debugResetBattle() {
    if (!debugCombatAllowed()) { debugMessage("퍼즐·로그라이크 전투에서만 사용할 수 있습니다."); return; }
    closeDebugCombatOverlays();
    if (state.mode === "roguelike" && state.run?.currentEncounterId) {
      state.gameOver = false;
      state.resolving = false;
      state.playerHp = state.run.maxHp;
      state.shield = state.run.startShield || 0;
      startRoguelikeBattle();
    } else resetGame();
    debugMessage("현재 전투를 초기화했습니다.");
  }

  async function debugCopySeed() {
    const seed = state.run?.seed || "현재 런 없음";
    try { await navigator.clipboard.writeText(seed); debugMessage(`시드 복사: ${seed}`); }
    catch { debugMessage(`시드: ${seed}`); }
  }

  function debugNextNode() {
    if (state.mode !== "roguelike" || !state.run) { debugMessage("로그라이크 런에서만 사용할 수 있습니다."); return; }
    closeDebugCombatOverlays();
    closeDebug();
    if (state.run.currentNodeId && state.run.currentEncounterId) {
      state.enemyHp = 0;
      void nextWave();
    } else if (state.run.currentNodeId) {
      completeCurrentRunNode();
    } else openRoguelikeRoute();
    debugMessage("현재 진행 기준으로 다음 노드를 열었습니다.");
  }

  function debugShowReward() {
    if (state.mode !== "roguelike" || !state.run?.currentEncounterId) { debugMessage("로그라이크 전투 중에만 사용할 수 있습니다."); return; }
    closeDebugCombatOverlays();
    closeDebug();
    openRoguelikeReward();
    debugMessage("현재 전투의 보상 화면을 열었습니다.");
  }

  async function debugShowLootLayerTest() {
    closeDebugCombatOverlays();
    closeDebug();
    const rewardModal = $("#roguelike-reward-modal");
    rewardModal?.classList.add("open");
    try {
      await showBattleLootCeremony({
        kind: "talisman",
        kicker: "레이어 시험 · 전리품",
        title: "부적 조각 +5",
        detail: "보상창보다 앞에 완전히 표시되어야 합니다."
      });
      await showBattleLootCeremony({
        kind: "escape",
        kicker: "레이어 시험 · 희귀 조우",
        title: "희귀 자령 도주",
        detail: "도주 결과도 다음 경로창보다 앞에 완전히 표시되어야 합니다."
      });
    } finally {
      rewardModal?.classList.remove("open");
      openDebug();
      debugMessage("획득·도주 연출이 보상창 위 최상위 레이어에서 끝까지 표시됐습니다.");
    }
  }

  function debugValidateData() {
    const result = validateGameCatalog({
      characters: DATASET_CHARACTERS,
      idioms: ALL_IDIOMS,
      jaryeongs: JARYEONG_LIBRARY,
      relics: RELIC_CATALOG,
      events: EVENT_CATALOG,
      encounters: ENCOUNTER_CATALOG,
      volumes: CHARACTER_VOLUMES
    });
    debugMessage(result.ok ? `검증 통과 · 한자 ${DATASET_CHARACTERS.length} · 성어 ${ALL_IDIOMS.length} · 자령 ${JARYEONG_LIBRARY.length}` : `검증 실패 · ${result.errors.join(" / ")}`);
  }

  function countChars(entries) {
    return entries.reduce((map, entry) => (map[entry.char] = (map[entry.char] || 0) + 1, map), {});
  }

  function chooseChar() {
    const queueCounts = countChars(state.queue);
    const currentIdioms = getCurrentIdioms();
    const required = countChars(currentIdioms.flatMap((idiom) => idiom.chars).map((char) => ({ char })));
    const needs = Object.keys(required).filter((char) => (queueCounts[char] || 0) < required[char]);
    const idiomChars = currentIdioms.flatMap((idiom) => idiom.chars);
    const basePool = state.mode === "roguelike" && state.run?.characterPool?.length ? state.run.characterPool : CHARACTER_POOL;
    const fullPool = [...new Set([...basePool, ...idiomChars])];
    if (state.mode !== "pang" && state.turn <= state.recipeSupplyUntilTurn && needs.length && randomValue() < .72) return randomOf(needs);
    if (state.turnsSinceIdiom >= 4 && needs.length) return randomOf(needs);
    const partyHanja = new Set(getPartyJaryeongs().map((jaryeong) => jaryeong.hanja));
    const weighted = [];
    fullPool.forEach((char) => {
      let weight = 1;
      if (needs.includes(char)) weight = 8;
      else if (idiomChars.includes(char)) weight = 3;
      if (partyHanja.has(char)) weight = Math.max(weight, 2);
      for (let index = 0; index < weight; index++) weighted.push(char);
    });
    return randomOf(weighted.length ? weighted : fullPool);
  }

  function makeTile(avoidElement) {
    let element = randomOf(ELEMENTS);
    if (avoidElement && randomValue() < 0.72) {
      const alternatives = ELEMENTS.filter((item) => item.id !== avoidElement);
      element = randomOf(alternatives);
    }
    return { id: uid(), element: element.id, symbol: element.symbol, char: chooseChar() };
  }

  function wouldMatch(board, row, col, element) {
    return (col >= 2 && board[row][col - 1]?.element === element && board[row][col - 2]?.element === element) ||
      (row >= 2 && board[row - 1][col]?.element === element && board[row - 2][col]?.element === element);
  }

  function createBoard() {
    const board = Array.from({ length: ROWS }, () => Array(COLS));
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        let tile = makeTile();
        let safety = 0;
        while (wouldMatch(board, r, c, tile.element) && safety++ < 12) tile = makeTile(tile.element);
        board[r][c] = tile;
      }
    }
    if (state.mode === "roguelike") rememberMeta("seenCharacters", board.flat().map((tile) => tile.char));
    return board;
  }

  function freezeStoryBoard(rows) {
    return Object.freeze(rows.map((row) => Object.freeze([...row])));
  }

  const STORY_BOARD_ELEMENTS = Object.freeze({
    "disaster-gate": freezeStoryBoard([
      ["wood", "wood", "fire", "earth", "metal", "water"],
      ["fire", "earth", "wood", "metal", "water", "fire"],
      ["earth", "metal", "water", "fire", "earth", "metal"],
      ["metal", "water", "fire", "earth", "metal", "water"],
      ["water", "fire", "earth", "metal", "water", "fire"]
    ]),
    "five-lights": freezeStoryBoard([
      ["earth", "earth", "metal", "earth", "earth", "water"],
      ["fire", "water", "fire", "wood", "water", "wood"],
      ["fire", "metal", "metal", "wood", "earth", "water"],
      ["earth", "metal", "wood", "metal", "earth", "wood"],
      ["water", "fire", "fire", "earth", "water", "metal"]
    ]),
    "gathered-letters": freezeStoryBoard([
      ["wood", "wood", "fire", "earth", "metal", "water"],
      ["fire", "earth", "wood", "metal", "water", "fire"],
      ["earth", "metal", "water", "fire", "earth", "metal"],
      ["metal", "water", "fire", "earth", "metal", "water"],
      ["water", "fire", "earth", "metal", "water", "fire"]
    ]),
    "four-letter-power": freezeStoryBoard([
      ["wood", "wood", "fire", "earth", "metal", "water"],
      ["fire", "earth", "wood", "metal", "water", "fire"],
      ["earth", "metal", "water", "fire", "earth", "metal"],
      ["metal", "water", "fire", "earth", "metal", "water"],
      ["water", "fire", "earth", "metal", "water", "fire"]
    ]),
    "read-the-intent": freezeStoryBoard([
      ["earth", "earth", "fire", "wood", "metal", "water"],
      ["wood", "fire", "earth", "metal", "water", "wood"],
      ["fire", "metal", "water", "earth", "wood", "metal"],
      ["metal", "water", "fire", "wood", "earth", "water"],
      ["water", "wood", "metal", "fire", "water", "earth"]
    ])
  });

  const STORY_TILE_CHARACTERS = Object.freeze({
    "disaster-gate": Object.freeze({ "1,2": "木" }),
    "five-lights": Object.freeze({ "1,2": "交" }),
    "gathered-letters": Object.freeze({ "0,0": "木", "0,1": "林", "1,2": "森" }),
    "read-the-intent": Object.freeze({ "1,2": "土" })
  });

  function getStoryIdiomLesson(chapterId) {
    const targetId = STORY_TRAINING_IDIOM_TARGET_IDS[chapterId];
    const idiom = targetId ? ALL_IDIOMS.find((entry) => entry.id === targetId) : null;
    if (!idiom || idiom.chars.length !== 4) return null;
    return { idiom, seedCharacters: idiom.chars.slice(0, -1), triggerCharacter: idiom.chars.at(-1) };
  }

  function prepareStoryIdiomLesson(chapterId) {
    const lesson = getStoryIdiomLesson(chapterId);
    if (!lesson) return null;
    state.stageIdiomIds = [lesson.idiom.id];
    state.usedStageIdiomIds = new Set([lesson.idiom.id]);
    state.rotatingIdiomIds = [];
    state.usedRotatingIdiomIds = new Set();
    state.nextIdiomRecipeTurn = Number.MAX_SAFE_INTEGER;
    state.idiomRecipeInterval = 0;
    state.recipeSupplyUntilTurn = 0;
    state.queue = lesson.seedCharacters.map((char) => ({ id: uid(), char, born: state.turn }));
    state.freshQueueIds = new Set();
    return lesson;
  }

  function setTileElement(tile, elementId) {
    const element = ELEMENTS.find((entry) => entry.id === elementId) || ELEMENTS[0];
    return { ...tile, element: element.id, symbol: element.symbol };
  }

  function prepareStoryBoard(chapterId) {
    const pattern = STORY_BOARD_ELEMENTS[chapterId] || STORY_BOARD_ELEMENTS["disaster-gate"];
    const lesson = getStoryIdiomLesson(chapterId);
    const characters = {
      ...(STORY_TILE_CHARACTERS[chapterId] || {}),
      ...(lesson ? { "1,2": lesson.triggerCharacter } : {})
    };
    state.board = state.board.map((row, r) => row.map((tile, c) => ({
      ...setTileElement(tile, pattern[r][c]),
      ...(characters[`${r},${c}`] ? { char: characters[`${r},${c}`] } : {})
    })));
    renderBoard();
  }

  function resetGame() {
    clearInterval(state.timerId);
    clearInterval(state.pangTimerId);
    ROWS = 5; COLS = 6;
    state.queue = [];
    state.turn = 1;
    state.stageIdiomIds = [];
    state.usedStageIdiomIds = new Set();
    state.rotatingIdiomIds = [];
    state.usedRotatingIdiomIds = new Set();
    state.nextIdiomRecipeTurn = 0;
    state.idiomRecipeInterval = 0;
    state.recipeSupplyUntilTurn = 0;
    if (state.mode === "puzzle") {
      choosePuzzleStageIdioms();
      refreshRotatingIdioms({ force: true });
    }
    const freshBoard = createBoard();
    Object.assign(state, {
      board: freshBoard, queue: [], turn: 1, wave: 0, enemyHp: state.debugEnemyOverride?.hp || ENEMIES[0].hp,
      playerHp: BASE_PLAYER_HP, shield: 0, delayed: 0, weakened: false, prepared: false,
      enemyBurn: 0, nextElementBoosts: {}, enemyShield: 0, enemyElementBarrier: null,
      totalCombos: 0, totalIdioms: 0,
      reviveUsed: false, dragging: false, dragMoved: false,
      resolving: false, selected: null, keyboardFocus: { r: 0, c: 0 }, timerId: null, currentMoveLimit: MOVE_SECONDS, freshQueueIds: new Set(), gameOver: false,
      pointerX: 0, pointerY: 0, pangRunning: false, pangEndPending: false, dragPreview: null,
      swapAnimationUntil: 0, enemyPlan: createEnemyPlan(), stageIdiomIds: state.stageIdiomIds, usedStageIdiomIds: state.usedStageIdiomIds,
      rotatingIdiomIds: state.rotatingIdiomIds, usedRotatingIdiomIds: state.usedRotatingIdiomIds,
      readyIdiomIds: new Set(),
      nextIdiomRecipeTurn: state.nextIdiomRecipeTurn, idiomRecipeInterval: state.idiomRecipeInterval, recipeSupplyUntilTurn: state.recipeSupplyUntilTurn,
      nextMoveBonus: 0, enemyMovePenalty: 0, currentChargeBonus: 0, nextChargeBonus: 0, nextPlayerDamageBonus: 0, nextWeaknessDamageBonus: 0,
      enemyVulnerableTurns: 0, enemyVulnerableRatio: 0, enemySilenced: 0, healReductionTurns: 0, healReductionRatio: 0,
      reflectNextEnemyAttack: null, nextEnemyDamageReduction: 0, idiomGrowthStacks: 0, turnsSinceIdiom: 0, lastActivatedIdiomId: null,
      healingFieldTurns: 0, healingFieldAmount: 0, phoenixRebirthReady: 0, damageSplitHits: 0, damageSplitRatio: 0,
      deferredDamage: 0, deferredDamageTicks: 0, boundEnemyIntentTurns: 0,
      lastTurnElementDamage: {}, lastMatchGroupSizes: [], lastWideMatchElements: [], lastPlayerHealing: 0, turnTotals: { damage: 0, heal: 0, shield: 0, burn: 0, delay: 0, elementDamage: {} },
      lockedTiles: new Map(), activeSealVisual: "seal", storyGuardEarthProcUsed: false
    });
    resetEnemyPlan();
    clearDragPreview();
    $("#cursor-timer").classList.remove("active", "danger");
    $("#battle-log").innerHTML = "";
    addLog("문이 열렸습니다. <strong>첫 연성</strong>을 준비하세요.", "start");
    updateAll();
  }

  function tileElement(tile, row, col) {
    const button = document.createElement("button");
    paintTile(button, tile, row, col);
    return button;
  }

  function paintTile(button, tile, row, col, falling = false) {
    const changed = button.dataset.id !== tile.id;
    const contentChanged = button.dataset.char !== tile.char;
    button.className = `tile ${tile.element}`;
    const storyGuide = activeStoryPathGuide();
    const storyGuideIndex = storyGuide?.path.findIndex(([guideRow, guideCol]) => guideRow === row && guideCol === col) ?? -1;
    if (storyGuideIndex === 0) {
      button.classList.add("story-guide-start");
      button.dataset.guideLabel = "잡기";
    } else if (storyGuideIndex > 0) {
      button.classList.add("story-guide-step");
      button.dataset.guideLabel = storyGuideIndex === storyGuide.path.length - 1 ? "놓기" : String(storyGuideIndex);
      if (storyGuideIndex === storyGuide.path.length - 1) button.classList.add("story-guide-target");
    }
    if (state.dragging && Array.isArray(state.dragTrail) && state.dragTrail.includes(`${row},${col}`)) button.classList.add("drag-trail");
    if (falling && changed) button.classList.add("falling");
    if (isTileLocked(row, col)) button.classList.add("locked", `seal-${state.activeSealVisual || "seal"}`);
    button.dataset.row = row;
    button.dataset.col = col;
    button.dataset.id = tile.id;
    button.dataset.char = tile.char;
    button.dataset.symbol = tile.symbol;
    button.setAttribute("role", "gridcell");
    button.setAttribute("aria-selected", String(Boolean(state.selected?.r === row && state.selected?.c === col)));
    const keyboardFocus = state.keyboardFocus || { r: 0, c: 0 };
    button.tabIndex = keyboardFocus.r === row && keyboardFocus.c === col ? 0 : -1;
    const lockTurns = state.lockedTiles instanceof Map ? state.lockedTiles.get(tileKey(row, col)) || 0 : 0;
    const tileElementMeta = ELEMENTS.find((element) => element.id === tile?.element) || ELEMENTS[0];
    const tileChar = typeof tile?.char === "string" && tile.char ? tile.char : "?";
    const tileReading = HANJA_READINGS[tileChar] || "훈음 미상";
    button.setAttribute("aria-label", `${tileElementMeta.label} 속성, ${tileChar}, ${tileReading}${lockTurns ? `, ${lockTurns}턴 봉인` : ""}`);
    button.title = `${tileChar} · ${tileReading}`;
    if (changed || contentChanged) button.innerHTML = `<span class="hanja">${tileChar}</span><small class="tile-reading">${tileReading}</small>`;
    return changed;
  }

  function renderBoard(options = {}) {
    const board = $("#board");
    board.style.setProperty("--cols", COLS);
    board.setAttribute("aria-label", `${ROWS}행 ${COLS}열 오행 퍼즐 보드`);
    if (state.mode !== "puzzle" && state.mode !== "roguelike") {
      if (board.children.length !== ROWS * COLS) {
        board.innerHTML = "";
        state.board.forEach((row, r) => row.forEach((tile, c) => board.appendChild(tileElement(tile, r, c))));
      } else {
        state.board.forEach((row, r) => row.forEach((tile, c) => paintTile(board.children[r * COLS + c], tile, r, c, options.falling)));
      }
      if (state.selected) {
        board.querySelector(`[data-row="${state.selected.r}"][data-col="${state.selected.c}"]`)?.classList.add("selected");
      }
      return;
    }
    const beforeRects = new Map([...board.children].map((node) => [node.dataset.id, node.getBoundingClientRect()]));
    const nodesById = new Map([...board.children].map((node) => [node.dataset.id, node]));
    if (board.children.length !== ROWS * COLS) {
      board.innerHTML = "";
      nodesById.clear();
    }
    const fragment = document.createDocumentFragment();
    state.board.forEach((row, r) => row.forEach((tile, c) => {
      const node = nodesById.get(tile.id) || tileElement(tile, r, c);
      paintTile(node, tile, r, c, options.falling);
      if (state.selected?.r === r && state.selected?.c === c) node.classList.add("selected");
      if (state.dragging && state.dragPreview?.id === tile.id) node.classList.add("dragging-source");
      fragment.appendChild(node);
    }));
    board.replaceChildren(fragment);
    if (options.animateSwap) animateBoardMovement(beforeRects, options.animateSwapDuration || 220);
  }

  function animateBoardMovement(beforeRects, duration) {
    const board = $("#board");
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    if (reduceMotion) return;
    let moved = false;
    [...board.children].forEach((node) => {
      const before = beforeRects.get(node.dataset.id);
      if (!before) return;
      const after = node.getBoundingClientRect();
      const dx = before.left - after.left;
      const dy = before.top - after.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
      moved = true;
      const baseTransform = node.classList.contains("dragging-source") ? "scale(.95)"
        : node.classList.contains("selected") ? "scale(1.08)" : "none";
      const animationToken = uid();
      node.dataset.swapAnimation = animationToken;
      node.style.transition = "none";
      node.style.transform = `translate3d(${dx}px, ${dy}px, 0) ${baseTransform === "none" ? "" : baseTransform}`;
      requestAnimationFrame(() => {
        if (node.dataset.swapAnimation !== animationToken) return;
        node.style.transition = `transform ${duration}ms cubic-bezier(.2,.8,.25,1)`;
        node.style.transform = baseTransform;
      });
      setTimeout(() => {
        if (node.dataset.swapAnimation !== animationToken) return;
        delete node.dataset.swapAnimation;
        node.style.transition = "";
        node.style.transform = "";
      }, duration + 35);
    });
    if (moved) state.swapAnimationUntil = performance.now() + duration;
  }

  function renderQueue() {
    const wrap = $("#letter-queue");
    wrap.innerHTML = "";
    const queueMax = getQueueMax();
    const coach = getActiveFirstBattleCoachProgress();
    const supportedCharacters = (coach?.characterSupply?.requiredCharacters || []).reduce((counts, char) => {
      counts.set(char, (counts.get(char) || 0) + 1);
      return counts;
    }, new Map());
    wrap.style.setProperty("--queue-size", queueMax);
    for (let i = 0; i < queueMax; i++) {
      const entry = state.queue[i];
      const slot = document.createElement("span");
      const availableSupportCount = entry ? supportedCharacters.get(entry.char) || 0 : 0;
      const isFixedIdiomSupport = availableSupportCount > 0;
      if (isFixedIdiomSupport) supportedCharacters.set(entry.char, availableSupportCount - 1);
      slot.className = `queue-slot${entry ? " filled" : ""}${entry && state.freshQueueIds.has(entry.id) ? " new" : ""}${isFixedIdiomSupport ? " first-battle-supply" : ""}`;
      if (entry) {
        const queueLife = getQueueLife();
        const remaining = Math.max(0, queueLife - (state.turn - entry.born));
        slot.innerHTML = `${entry.char}<span class="queue-life">${Array.from({ length: queueLife }, (_, n) => `<i class="${n < remaining ? "on" : ""}"></i>`).join("")}</span>`;
        slot.title = `${entry.char} · ${HANJA_READINGS[entry.char]} · ${remaining}턴 남음`;
        slot.setAttribute("aria-label", `${entry.char}, ${HANJA_READINGS[entry.char]}, ${remaining}턴 남음${isFixedIdiomSupport ? ", 고정 성어 지원 문자" : ""}`);
        if (isFixedIdiomSupport) slot.dataset.firstBattleSupply = "fixed-idiom";
      } else slot.textContent = "·";
      wrap.appendChild(slot);
    }
    $("#queue-count").textContent = state.queue.length;
    $("#queue-limit").textContent = queueMax;
    const queueTitle = $(".queue-title small");
    if (queueTitle) queueTitle.lastChild.textContent = ` · 최대 ${getQueueLife()}턴 보존`;
  }

  function idiomAvailability(idiom, pool = state.queue) {
    const available = countChars(pool);
    const used = {};
    return idiom.chars.map((char) => {
      used[char] = (used[char] || 0) + 1;
      return used[char] <= (available[char] || 0);
    });
  }

  function describeIdiomOps(idiom) {
    return describeIdiomEffectSpec(idiom.effectSpec).text;
  }

  function idiomEffectText(idiom) {
    const curated = IDIOM_EFFECTS[idiom.sourceHanja];
    return curated?.desc || describeIdiomOps(idiom);
  }

  function idiomMeaningText(idiom) {
    return idiom.meaning || String(idiom.reading || "").split(" · ").slice(1).join(" · ") || "뜻 정보 준비 중";
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  }

  function getIdiomActivationPreview() {
    const preview = new Map();
    let availableEntries = [...state.queue];
    for (const idiom of getCurrentIdioms()) {
      const availability = idiomAvailability(idiom, availableEntries);
      const selected = selectUsedEntries(idiom, availableEntries);
      const ready = selected.length === idiom.chars.length;
      preview.set(idiom.id, { availability, ready });
      if (ready) {
        const selectedIds = new Set(selected.map((entry) => entry.id));
        availableEntries = availableEntries.filter((entry) => !selectedIds.has(entry.id));
      }
    }
    return preview;
  }

  function renderIdiomCard(idiom, setKind, preview) {
    const availability = preview?.availability || idiomAvailability(idiom);
    const ready = preview?.ready ?? availability.every(Boolean);
    const effectText = idiomEffectText(idiom);
    const missingChars = idiom.chars.filter((char, index) => !availability[index]);
    const requirementText = ready ? "발동 준비" : `필요 ${missingChars.join("·")}`;
    const upgrade = state.run?.idiomUpgrades?.[idiom.id] || 0;
    const tooltip = `${idiom.sourceHanja} · ${idiom.pronunciation || idiom.name}\n전투 효과: ${effectText}\n클릭하면 뜻 보기`;
    return `<button type="button" class="idiom-card ${setKind} ${ready ? "ready" : ""}" data-idiom-detail="${escapeHtml(idiom.id)}" title="${escapeHtml(tooltip)}" aria-label="${escapeHtml(`${idiom.name}. ${requirementText}. 효과: ${effectText}. 눌러서 뜻 보기`)}">
      <div class="idiom-title"><strong>${escapeHtml(idiom.name)}</strong>${upgrade ? `<i class="idiom-level">Lv.${upgrade + 1} · ${100 + upgrade * 15}%</i>` : ""}<em class="idiom-requirement">${escapeHtml(requirementText)}</em></div>
      <div class="idiom-slots">${idiom.chars.map((char, i) => `<span class="idiom-slot ${availability[i] ? "collected" : ""}" title="${escapeHtml(`${char} · ${HANJA_READINGS[char]}`)}"><b>${char}</b><small>${escapeHtml(HANJA_READINGS[char])}</small></span>`).join("")}</div>
      <p class="idiom-effect"><b>효과</b> ${escapeHtml(effectText)}</p>
    </button>`;
  }

  function renderIdiomFocus(idiom, setKind, preview, focusEntries = []) {
    const wrap = $("#idiom-focus");
    if (!wrap || !idiom) {
      if (wrap) wrap.innerHTML = "";
      return;
    }
    const availability = preview?.availability || idiomAvailability(idiom);
    const collected = availability.filter(Boolean).length;
    const ready = preview?.ready ?? collected === idiom.chars.length;
    const effectText = idiomEffectText(idiom);
    const upgrade = state.run?.idiomUpgrades?.[idiom.id] || 0;
    const picker = state.idiomDisplayMode === "focus" && focusEntries.length
      ? `<div class="idiom-focus-picker" role="tablist" aria-label="현재 연성식 탐색">
          <span class="idiom-focus-picker-label">현재 연성식 탐색</span>
          <div class="idiom-focus-picker-options">${focusEntries.map((entry) => `<button type="button" class="idiom-focus-picker-option ${entry.kind} ${entry.id === idiom.id ? "selected" : ""} ${entry.ready ? "ready" : ""}" role="tab" data-idiom-focus-select="${escapeHtml(entry.id)}" aria-controls="idiom-focus-card" aria-selected="${entry.id === idiom.id}" tabindex="${entry.id === idiom.id ? "0" : "-1"}" title="${escapeHtml(`${entry.kind === "fixed" ? "고정" : "순환"} · ${entry.idiom.name} · ${entry.ready ? "발동 준비" : `${entry.collected}/${entry.required} 수집`}`)}"><em>${entry.kind === "fixed" ? "고정" : "순환"}</em><strong>${escapeHtml(entry.idiom.name)}</strong><b>${entry.ready ? "준비" : `${entry.collected}/${entry.required}`}</b></button>`).join("")}</div>
        </div>`
      : "";
    wrap.innerHTML = `${picker}<div id="idiom-focus-card" class="idiom-focus-display" role="tabpanel" aria-label="${escapeHtml(`${idiom.name} 큰 연성식`)}"><button type="button" class="idiom-focus-card ${setKind} ${ready ? "ready" : ""}" data-idiom-detail="${escapeHtml(idiom.id)}" title="${escapeHtml(`전투 효과: ${effectText} · 클릭하면 뜻 보기`)}" aria-label="${escapeHtml(`${idiom.name}, ${collected}글자 수집. 효과: ${effectText}. 눌러서 뜻 보기`)}">
      <span class="idiom-focus-heading"><em>${setKind === "rotating" ? "순환 학습" : "고정 학습"}</em><strong>${escapeHtml(idiom.name)}</strong>${upgrade ? `<i class="idiom-level">Lv.${upgrade + 1} · ${100 + upgrade * 15}%</i>` : ""}<b>${ready ? "연성 가능" : `${collected}/4`}</b></span>
      <span class="idiom-focus-glyphs">${idiom.chars.map((char, index) => `<span class="${availability[index] ? "collected" : ""}"><b>${escapeHtml(char)}</b><small>${escapeHtml(HANJA_READINGS[char])}</small></span>`).join("")}</span>
      <span class="idiom-focus-effect"><b>효과</b>${escapeHtml(effectText)}</span>
    </button></div>`;
  }

  function getIdiomFocusEntries(fixed = getFixedIdioms(), rotating = getRotatingIdioms(), activationPreview = getIdiomActivationPreview()) {
    return buildIdiomFocusEntries(fixed, rotating, activationPreview);
  }

  function renderIdioms() {
    const wrap = $("#idiom-cards");
    const fixed = getFixedIdioms();
    const rotating = getRotatingIdioms();
    const activationPreview = getIdiomActivationPreview();
    const focusEntries = getIdiomFocusEntries(fixed, rotating, activationPreview);
    const focusWrap = $("#idiom-focus");
    const restorePickerFocus = Boolean(focusWrap?.contains(document.activeElement) && document.activeElement?.matches?.("[data-idiom-focus-select]"));
    const readyIds = new Set([...fixed, ...rotating]
      .filter((idiom) => activationPreview.get(idiom.id)?.ready ?? idiomAvailability(idiom).every(Boolean))
      .map((idiom) => idiom.id));
    const newlyReady = [...readyIds].filter((id) => !state.readyIdiomIds.has(id));
    const remaining = Math.max(0, state.nextIdiomRecipeTurn - state.turn) || 1;
    const fixedStoryIdiomLesson = state.mode === "puzzle" && Boolean(getStoryIdiomLesson(state.storySession?.chapterId));
    const rotatingSet = fixedStoryIdiomLesson ? "" : `<section class="idiom-set rotating-set" aria-label="순환 연성식">
      <div class="idiom-set-heading"><b>순환</b><span>${remaining}턴 후 무작위 3개 교체</span></div>
      <div class="idiom-card-grid">${rotating.map((idiom) => renderIdiomCard(idiom, "rotating", activationPreview.get(idiom.id))).join("")}</div>
    </section>`;
    wrap.innerHTML = `<section class="idiom-set fixed-set${fixedStoryIdiomLesson ? " story-lesson-set" : ""}" aria-label="고정 연성식">
      <div class="idiom-set-heading"><b>고정</b><span>내가 고른 성어 · 전투 내내 유지</span></div>
      <div class="idiom-card-grid">${fixed.map((idiom) => renderIdiomCard(idiom, "fixed", activationPreview.get(idiom.id))).join("")}</div>
    </section>${rotatingSet}`;
    const rogueRotatingWrap = $("#roguelike-rotating-cards");
    if (rogueRotatingWrap) {
      rogueRotatingWrap.innerHTML = rotating.map((idiom) => renderIdiomCard(idiom, "rotating", activationPreview.get(idiom.id))).join("");
    }
    const rogueRotatingStatus = $("#roguelike-rotating-status");
    if (rogueRotatingStatus) rogueRotatingStatus.textContent = `${remaining}턴 후 3개 교체`;
    const focused = chooseFocusedIdiomEntry(focusEntries, state.focusedIdiomId);
    if (focused) {
      state.focusedIdiomId = focused.id;
      renderIdiomFocus(focused.idiom, focused.kind, activationPreview.get(focused.id), focusEntries);
    } else renderIdiomFocus(null);
    if (restorePickerFocus && focused) {
      requestAnimationFrame(() => document.querySelector(`[data-idiom-focus-select="${focused.id}"]`)?.focus({ preventScroll: true }));
    }
    const cycle = $("#idiom-cycle-status");
    if (cycle && state.mode !== "pang") {
      cycle.textContent = fixedStoryIdiomLesson
        ? `고정 ${fixed.length} · 이번 수련의 성어 · 클릭하면 뜻 보기`
        : `고정 ${fixed.length} + 순환 ${rotating.length} · 클릭하면 뜻 보기`;
    }
    state.readyIdiomIds = readyIds;
    if (newlyReady.length) audioDirector.playSfx("idiom-ready");
  }

  function selectIdiomFocus(id, { focus = false } = {}) {
    const entries = getIdiomFocusEntries();
    const selected = entries.find((entry) => entry.id === id);
    if (!selected) return false;
    state.focusedIdiomId = selected.id;
    renderIdioms();
    if (focus) {
      requestAnimationFrame(() => document.querySelector(`[data-idiom-focus-select="${selected.id}"]`)?.focus({ preventScroll: true }));
    }
    return true;
  }

  function handleIdiomFocusPickerKeydown(event) {
    const option = event.target.closest?.("[data-idiom-focus-select]");
    if (!option || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    const entries = getIdiomFocusEntries();
    const nextIndex = getIdiomFocusRovingIndex(entries, option.dataset.idiomFocusSelect, event.key);
    if (nextIndex < 0) return;
    event.preventDefault();
    selectIdiomFocus(entries[nextIndex].id, { focus: true });
  }

  function updateVitals() {
    persistActiveDebugEnemyMember();
    const enemy = currentEnemy();
    if (!enemy) return;
    scheduleEnemyPhase();
    $("#enemy-name").textContent = enemy.name;
    const enemyJaryeong = getJaryeong(enemy.jaryeongId);
    const enemyKind = $("#enemy-kind-label");
    if (enemyKind) {
      const studyHanja = enemy.glyph || enemyJaryeong?.hanja || "字";
      const studyReading = enemyJaryeong?.reading || HANJA_READINGS[studyHanja] || "글자 자";
      const studyMeaning = enemyJaryeong?.meaning || CHARACTER_BY_HANJA.get(studyHanja)?.meaning || "한자 자령";
      $("#enemy-study-hanja").textContent = studyHanja;
      $("#enemy-study-reading").textContent = studyReading;
      $("#enemy-study-meaning").textContent = `${studyMeaning} · ${enemy.wildLabel || "야생 자령"}`;
      updateEnemyAffinityTooltip(enemy, enemyJaryeong, studyHanja, studyReading, studyMeaning);
    }
    $("#enemy-hp-text").textContent = `${Math.max(0, Math.ceil(state.enemyHp))} / ${enemy.hp}`;
    const hpPercent = clamp(state.enemyHp / enemy.hp * 100, 0, 100);
    $("#enemy-hp-bar").style.width = `${hpPercent}%`;
    $("#enemy-hp-percent").textContent = `${Math.round(hpPercent)}%`;
    const playerMaxHp = maxPlayerHp();
    $("#player-hp-text").textContent = `${Math.max(0, Math.ceil(state.playerHp))} / ${playerMaxHp}`;
    $("#player-hp-bar").style.width = `${clamp(state.playerHp / playerMaxHp * 100, 0, 100)}%`;
    renderDefenseHud();
    $("#wave-label").textContent = state.mode === "roguelike" ? `제${state.run?.act || 1}막 · ${Math.min(11, (state.run?.combatsWon || 0) + 1)}전` : `제${["일", "이", "삼"][state.wave]}파`;
    $("#turn-label").textContent = `${state.turn}번째 연성`;
    renderEnemyIntent();
    const sprite = $("#enemy-sprite");
    sprite.className = `enemy-sprite ${enemy.className}`;
    const enemyGlyph = sprite.querySelector(".enemy-glyph");
    if (enemyGlyph) enemyGlyph.textContent = enemy.glyph;
    const spriteArt = $("#enemy-sprite-art");
    if (spriteArt) {
      const idleArt = enemy.asset?.idle;
      if (spriteArt.dataset.enemyId !== enemy.id) {
        delete spriteArt.dataset.frameLocked;
        spriteArt.dataset.enemyId = enemy.id;
      }
      if (idleArt) {
        spriteArt.hidden = false;
        if (spriteArt.dataset.frameLocked !== "true") spriteArt.src = idleArt;
        spriteArt.alt = `${enemy.name} 스프라이트`;
      } else {
        delete spriteArt.dataset.frameLocked;
        spriteArt.hidden = true;
        spriteArt.removeAttribute("src");
        spriteArt.alt = "";
      }
      sprite.classList.toggle("has-art", Boolean(idleArt));
    }
    renderEnemyVisualStatuses(enemy);
    renderDebugEnemyGroup();
    renderEnemyStatuses();
    renderEnemyAffinity();
    renderElementProcLegend();
    renderCombatMission();
    $("#total-combos").textContent = state.totalCombos;
    $("#total-idioms").textContent = state.totalIdioms;
    $("#revive-status").textContent = state.reviveUsed ? "사용함" : "가능";
    renderJaryeongPanel();
  }

  function syncStoryMenuStatus() {
    const status = $("#story-menu-status");
    if (!status) return;
    const completed = [...IMPLEMENTED_STORY_CHAPTER_IDS].filter((id) => storyProgress.completedChapterIds.includes(id)).length;
    $("#puzzle-mode-button")?.classList.toggle("first-play-recommended", completed === 0);
    const nextId = getNextStoryTrainingChapterId(storyProgress);
    const next = nextId && IMPLEMENTED_STORY_CHAPTER_IDS.has(nextId) ? getStoryTrainingChapter(nextId) : null;
    status.textContent = completed >= IMPLEMENTED_STORY_CHAPTER_IDS.size
      ? `${completed}장 완료 · 이야기 기록`
      : next
        ? completed === 0
          ? "처음 추천 · 조작부터 배우기"
          : `다음 · 제${next.number}장 ${next.title}`
        : `${completed}장 완료 · 계속 수련`;
  }

  function getDefaultStoryChapterId() {
    const nextId = getNextStoryTrainingChapterId(storyProgress);
    if (nextId && IMPLEMENTED_STORY_CHAPTER_IDS.has(nextId)) return nextId;
    return [...IMPLEMENTED_STORY_CHAPTER_IDS].reverse().find((id) => storyProgress.completedChapterIds.includes(id)) || "disaster-gate";
  }

  function renderStoryChapterSelect() {
    const select = $("#story-chapter-select");
    if (!select) return;
    const completedCount = STORY_TRAINING_CHAPTERS.filter((chapter) => storyProgress.completedChapterIds.includes(chapter.id)).length;
    const firstEntry = completedCount === 0;
    select.hidden = firstEntry;
    const routeHint = $("#story-training-route-hint");
    if (routeHint) routeHint.textContent = firstEntry
      ? "처음에는 장 선택 없이 핵심 조작부터 · 완료하면 다음 장으로 바로 이어집니다"
      : `수련 진행 ${completedCount} / ${STORY_TRAINING_CHAPTERS.length} · 원하는 장은 다시 선택할 수 있습니다`;
    select.innerHTML = STORY_TRAINING_CHAPTERS.map((chapter) => {
      const implemented = IMPLEMENTED_STORY_CHAPTER_IDS.has(chapter.id);
      const unlocked = implemented && isStoryTrainingChapterUnlocked(storyProgress, chapter.id);
      const complete = storyProgress.completedChapterIds.includes(chapter.id);
      const selected = chapter.id === selectedStoryChapterId;
      const status = complete ? "완료" : !implemented ? "준비 중" : unlocked ? "선택 가능" : "이전 장 필요";
      return `<button class="story-chapter-button${selected ? " selected" : ""}${complete ? " complete" : ""}" type="button" data-story-chapter="${chapter.id}" ${unlocked ? "" : "disabled"} aria-pressed="${selected}"><b>${chapter.number}</b><span><strong>${chapter.title}</strong><small>${status}</small></span></button>`;
    }).join("");
  }

  function renderStoryIntroSteps(steps) {
    const container = $("#story-intro-steps");
    if (!container) return;
    const items = Array.isArray(steps) && steps.length === 3 ? steps : DEFAULT_STORY_INTRO_STEPS;
    const fragment = document.createDocumentFragment();
    items.forEach((step, index) => {
      const fallback = DEFAULT_STORY_INTRO_STEPS[index];
      const title = typeof step?.title === "string" ? step.title : fallback.title;
      const copy = typeof step?.copy === "string" ? step.copy : fallback.copy;
      const item = document.createElement("div");
      const number = document.createElement("b");
      const text = document.createElement("span");
      const heading = document.createElement("strong");
      number.textContent = String(index + 1);
      heading.textContent = title;
      text.append(heading, document.createTextNode(copy));
      item.append(number, text);
      fragment.appendChild(item);
    });
    container.replaceChildren(fragment);
  }

  function setStoryStartButtonLabel(label, fallback) {
    const button = $("#start-button");
    if (!button) return;
    const text = typeof label === "string" && label.trim() ? label : fallback;
    const arrow = document.createElement("span");
    arrow.setAttribute("aria-hidden", "true");
    arrow.textContent = "→";
    button.replaceChildren(document.createTextNode(`${text} `), arrow);
  }

  function selectStoryChapter(chapterId, { focus = false } = {}) {
    const chapter = getStoryTrainingChapter(chapterId);
    if (!chapter || !IMPLEMENTED_STORY_CHAPTER_IDS.has(chapterId) || !isStoryTrainingChapterUnlocked(storyProgress, chapterId)) return false;
    selectedStoryChapterId = chapterId;
    const presentation = STORY_PRESENTATION[chapterId];
    $("#story-intro-kicker").textContent = presentation.introKicker;
    $("#intro-title").innerHTML = presentation.introTitle;
    $("#story-intro-copy").textContent = presentation.introCopy;
    renderStoryIntroSteps(presentation.introSteps);
    setStoryStartButtonLabel(presentation.startButtonLabel, `제${chapter.number}장 시작`);
    $("#mode-title").textContent = `제${chapter.number}장 · ${chapter.title}`;
    renderStoryChapterSelect();
    if (focus) $(`[data-story-chapter="${chapterId}"]`)?.focus({ preventScroll: true });
    return true;
  }

  function renderStoryTrainingHud() {
    const hud = $("#story-training-hud");
    if (!hud) return;
    const session = state.mode === "puzzle" ? state.storySession : null;
    hud.hidden = !session;
    if (!session) return;
    const chapter = getStoryTrainingChapter(session.chapterId);
    const presentation = STORY_PRESENTATION[session.chapterId] || STORY_PRESENTATION["disaster-gate"];
    $("#story-training-kicker").textContent = `제${chapter?.number || 1}장 · ${chapter?.title || "재앙의 문"}`;
    $("#story-training-title").textContent = session.status === "complete" ? presentation.completeTitle : presentation.activeTitle;
    $("#story-training-guide").textContent = session.status === "complete" ? presentation.completeGuide : presentation.activeGuide;
    $("#story-training-progress").textContent = presentation.progressLabel(session);
    hud.classList.toggle("is-complete", session.status === "complete");
  }

  function syncStoryPresentationState() {
    const chapterId = state.mode === "puzzle" && state.storySession?.status === "active" ? state.storySession.chapterId : "";
    if (chapterId) document.body.dataset.storyChapterActive = chapterId;
    else delete document.body.dataset.storyChapterActive;
  }

  function updateAll() {
    syncStoryPresentationState();
    renderBoard(); renderQueue(); renderIdioms(); updateVitals(); updateRoguelikeHud(); renderFirstBattleCoach(); renderStoryTrainingHud(); renderStoryPathDemo(); renderLiveDragPath();
    scheduleActiveRunSave();
  }

  function swapCells(a, b) {
    [state.board[a.r][a.c], state.board[b.r][b.c]] = [state.board[b.r][b.c], state.board[a.r][a.c]];
  }

  function ensureAudioContext() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    try {
      if (!state.audioContext) state.audioContext = new AudioContextClass();
      if (state.audioContext.state === "suspended") void state.audioContext.resume().catch(() => {});
    } catch {
      state.audioContext = null;
      return null;
    }
    return state.audioContext;
  }

  let lastPuzzleSwapSoundAt = 0;

  function playSwapSound(step = 1) {
    if (state.mode !== "pang") {
      const now = performance.now();
      if (now - lastPuzzleSwapSoundAt < 160) return;
      lastPuzzleSwapSoundAt = now;
    }
    audioDirector.playSfx(state.mode === "pang" && step > 1 ? "combo-low" : "tile-swap");
  }

  function projectPointerToBoard(clientX, clientY) {
    const board = $("#board");
    const first = board?.querySelector('[data-row="0"][data-col="0"]');
    const last = board?.querySelector(`[data-row="${ROWS - 1}"][data-col="${COLS - 1}"]`);
    if (!board || !first || !last) return null;

    const boardRect = board.getBoundingClientRect();
    const firstCenterX = boardRect.left + first.offsetLeft + first.offsetWidth / 2;
    const firstCenterY = boardRect.top + first.offsetTop + first.offsetHeight / 2;
    const lastCenterX = boardRect.left + last.offsetLeft + last.offsetWidth / 2;
    const lastCenterY = boardRect.top + last.offsetTop + last.offsetHeight / 2;
    const minX = Math.min(firstCenterX, lastCenterX);
    const maxX = Math.max(firstCenterX, lastCenterX);
    const minY = Math.min(firstCenterY, lastCenterY);
    const maxY = Math.max(firstCenterY, lastCenterY);
    const x = clamp(clientX, minX, maxX);
    const y = clamp(clientY, minY, maxY);
    const colProgress = maxX === minX ? 0 : (x - minX) / (maxX - minX);
    const rowProgress = maxY === minY ? 0 : (y - minY) / (maxY - minY);

    return {
      x,
      y,
      cell: {
        r: clamp(Math.round(rowProgress * (ROWS - 1)), 0, ROWS - 1),
        c: clamp(Math.round(colProgress * (COLS - 1)), 0, COLS - 1)
      }
    };
  }

  function beginDrag(event) {
    const secondaryPointer = event.button === 2 || (event.button > 0 && event.buttons && event.buttons !== 1);
    if (state.dragging || state.resolving || state.jaryeongSkillAnimating || state.gameOver || secondaryPointer) return;
    if (state.mode === "pang" && !state.pangRunning) return;
    const tile = event.target.closest(".tile");
    if (!tile) return;
    if (isTileLocked(+tile.dataset.row, +tile.dataset.col)) return;
    if (!isExpectedStoryPathCell(+tile.dataset.row, +tile.dataset.col, 0)) {
      event.preventDefault();
      rejectStoryPathGesture("빛나는 ‘잡기’ 타일부터 시작해야 합니다. 다른 타일은 이 수련에서 움직이지 않습니다.");
      return;
    }
    event.preventDefault();
    state.dragging = true;
    hideStoryPathDemo();
    state.dragTrail = [];
    audioDirector.unlock();
    audioDirector.playSfx("tile-pick");
    state.selected = { r: +tile.dataset.row, c: +tile.dataset.col };
    state.keyboardFocus = { ...state.selected };
    state.dragTrail = [`${state.selected.r},${state.selected.c}`];
    state.storyDragSnapshot = activeStoryPathGuide() ? state.board.map((row) => row.map((entry) => ({ ...entry }))) : null;
    renderLiveDragPath();
    state.pangOrigin = { ...state.selected };
    state.pangTarget = null;
    state.pangMoved = false;
    state.dragPointerId = event.pointerId ?? null;
    if (event.pointerId != null) $("#board").setPointerCapture?.(event.pointerId);
    if (state.mode === "pang") {
      tile.classList.add("selected");
      return;
    }
    state.dragMoved = false;
    state.dragPreview = { ...state.board[state.selected.r][state.selected.c] };
    state.moveStartedAt = performance.now();
    const projected = projectPointerToBoard(event.clientX, event.clientY);
    state.pointerX = projected?.x ?? event.clientX;
    state.pointerY = projected?.y ?? event.clientY;
    tile.classList.add("selected", "dragging-source");
    setDragPreview(state.dragPreview, tile.getBoundingClientRect());
    ensureAudioContext();
    $("#move-timer").classList.add("active");
    state.currentMoveLimit = getMoveSeconds();
    state.nextMoveBonus = 0;
    state.enemyMovePenalty = 0;
    updateCursorTimer(state.currentMoveLimit);
    $("#cursor-timer").classList.add("active");
    clearInterval(state.timerId);
    state.timerId = setInterval(updateMoveTimer, 40);
  }

  function beginKeyboardDrag(tile) {
    const rect = tile.getBoundingClientRect();
    beginDrag({
      button: 0,
      buttons: 1,
      target: tile,
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
      preventDefault() {}
    });
  }

  function moveKeyboardDrag(rowDelta, colDelta) {
    if (!state.dragging || (state.mode !== "puzzle" && state.mode !== "roguelike")) return;
    const current = state.selected;
    const next = {
      r: clamp(current.r + rowDelta, 0, ROWS - 1),
      c: clamp(current.c + colDelta, 0, COLS - 1)
    };
    if ((next.r === current.r && next.c === current.c) || isTileLocked(next.r, next.c)) return;
    if (!isExpectedStoryPathCell(next.r, next.c, state.dragTrail.length)) {
      rejectStoryPathGesture("표시된 다음 칸만 이동할 수 있습니다. 화살표 선을 따라가세요.");
      return;
    }
    swapCells(current, next);
    state.dragMoved = true;
    state.dragTrail.push(`${next.r},${next.c}`);
    state.selected = next;
    state.keyboardFocus = { ...next };
    renderBoard({ animateSwap: true });
    renderLiveDragPath();
    const focusedTile = $("#board").querySelector(`[data-row="${next.r}"][data-col="${next.c}"]`);
    if (focusedTile) {
      const rect = focusedTile.getBoundingClientRect();
      state.pointerX = rect.left + rect.width / 2;
      state.pointerY = rect.top + rect.height / 2;
      setDragPreview(state.dragPreview, rect);
      focusedTile.focus({ preventScroll: true });
    }
    playSwapSound(Math.max(Math.abs(rowDelta), Math.abs(colDelta)));
  }

  function focusBoardTile(rowDelta, colDelta, originTile) {
    const current = {
      r: clamp(Number(originTile?.dataset?.row) || 0, 0, ROWS - 1),
      c: clamp(Number(originTile?.dataset?.col) || 0, 0, COLS - 1)
    };
    const next = {
      r: clamp(current.r + rowDelta, 0, ROWS - 1),
      c: clamp(current.c + colDelta, 0, COLS - 1)
    };
    if (next.r === current.r && next.c === current.c) return;
    state.keyboardFocus = next;
    const board = $("#board");
    [...board.querySelectorAll(".tile")].forEach((node) => {
      node.tabIndex = Number(node.dataset.row) === next.r && Number(node.dataset.col) === next.c ? 0 : -1;
    });
    board.querySelector(`[data-row="${next.r}"][data-col="${next.c}"]`)?.focus({ preventScroll: true });
  }

  function handleBoardKeyboard(event) {
    if ((state.mode !== "puzzle" && state.mode !== "roguelike") || state.jaryeongSkillAnimating) return;
    const tile = event.target.closest?.(".tile");
    if (!tile) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (state.dragging) void endDrag();
      else beginKeyboardDrag(tile);
      return;
    }
    const directions = {
      ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1],
      Home: [-1, -1], PageUp: [-1, 1], End: [1, -1], PageDown: [1, 1]
    };
    const direction = directions[event.key];
    if (!direction) return;
    event.preventDefault();
    if (!state.dragging) {
      // Roving focus keeps the 30-cell board to a single Tab stop. Arrow keys
      // explore the board; Enter/Space then switches into hold-and-drag mode.
      focusBoardTile(...direction, tile);
      return;
    }
    moveKeyboardDrag(...direction);
  }

  function updateMoveTimer() {
    const limit = state.currentMoveLimit || getMoveSeconds();
    const remain = Math.max(0, limit - (performance.now() - state.moveStartedAt) / 1000);
    $("#move-timer strong").textContent = remain.toFixed(1);
    $("#move-timer i").style.transform = `scaleX(${remain / limit})`;
    updateCursorTimer(remain);
    if (remain <= 0) endDrag();
  }

  function updateCursorTimer(remain) {
    const cursor = $("#cursor-timer");
    const limit = state.currentMoveLimit || getMoveSeconds();
    cursor.style.left = `${state.pointerX}px`;
    cursor.style.top = `${state.pointerY}px`;
    cursor.style.setProperty("--progress", `${remain / limit * 360}deg`);
    cursor.querySelector("strong").textContent = remain.toFixed(1);
    cursor.classList.toggle("danger", remain <= 1);
  }

  function setDragPreview(tile, rect) {
    const ghost = $("#drag-ghost");
    if (!ghost || !tile) return clearDragPreview();
    ghost.className = `drag-ghost ${tile.element} show`;
    ghost.innerHTML = `<span class="hanja">${tile.char}</span><small class="tile-reading">${HANJA_READINGS[tile.char]}</small>`;
    ghost.style.width = `${rect?.width || 48}px`;
    ghost.style.height = `${rect?.height || rect?.width || 48}px`;
    ghost.style.left = `${state.pointerX}px`;
    ghost.style.top = `${state.pointerY}px`;
  }

  function clearDragPreview() {
    const ghost = $("#drag-ghost");
    if (!ghost) return;
    ghost.className = "drag-ghost";
    ghost.innerHTML = "";
    ghost.style.width = "";
    ghost.style.height = "";
  }

  function releaseDragPointerCapture() {
    const pointerId = state.dragPointerId;
    state.dragPointerId = null;
    if (pointerId == null) return;
    const board = $("#board");
    try {
      if (board?.hasPointerCapture?.(pointerId)) board.releasePointerCapture(pointerId);
    } catch {
      // Pointer capture may already have been released by the browser.
    }
  }

  function finishDragAfterPointerLoss() {
    if (!state.dragging) return;
    void endDrag().catch((error) => {
      console.error("drag finalization failed after pointer loss", error);
      if (!state.gameOver && !state.resolving) updateAll();
    });
  }

  function dragMove(event) {
    if (!state.dragging || state.resolving) return;
    if (state.mode === "pang") {
      const hovered = document.elementFromPoint(event.clientX, event.clientY)?.closest(".tile");
      if (!hovered) return;
      const next = { r: +hovered.dataset.row, c: +hovered.dataset.col };
      if (isTileLocked(next.r, next.c)) return;
      const current = state.selected;
      const rowDistance = Math.abs(next.r - current.r);
      const colDistance = Math.abs(next.c - current.c);
      if (rowDistance + colDistance !== 1) return;
      if (state.pangMoved) return;
      swapCells(current, next);
      state.pangTarget = { ...next };
      state.pangMoved = true;
      state.selected = next;
      renderBoard();
      return;
    }

    const projected = projectPointerToBoard(event.clientX, event.clientY);
    if (!projected) return;
    state.pointerX = projected.x;
    state.pointerY = projected.y;
    const limit = state.currentMoveLimit || getMoveSeconds();
    updateCursorTimer(Math.max(0, limit - (performance.now() - state.moveStartedAt) / 1000));
    const ghost = $("#drag-ghost");
    if (ghost) {
      ghost.style.left = `${state.pointerX}px`;
      ghost.style.top = `${state.pointerY}px`;
    }

    const current = state.selected;
    const path = interpolateGridPath(current, projected.cell);
    if (!path.length) return;
    let cursor = current;
    let swapCount = 0;
    for (const next of path) {
      if (isTileLocked(next.r, next.c)) break;
      if (!isExpectedStoryPathCell(next.r, next.c, state.dragTrail.length)) break;
      swapCells(cursor, next);
      cursor = next;
      state.dragTrail.push(`${next.r},${next.c}`);
      if (state.dragTrail.length > 48) state.dragTrail.shift();
      swapCount++;
      if (isStoryPathComplete()) break;
    }
    if (!swapCount) return;
    state.dragMoved = true;
    state.selected = cursor;
    renderBoard({ animateSwap: true, animateSwapDuration: swapCount > 1 ? 150 : 185 });
    renderLiveDragPath();
    playSwapSound(swapCount);
  }

  async function endDrag() {
    if (!state.dragging) return;
    state.dragging = false;
    releaseDragPointerCapture();
    if (state.mode === "pang") {
      clearInterval(state.timerId);
      state.timerId = null;
      state.selected = null;
      const origin = state.pangOrigin;
      const target = state.pangTarget;
      const moved = state.pangMoved;
      if (state.gameOver && moved) swapCells(origin, target);
      renderBoard();
      if (!state.gameOver && moved) await resolvePangMove(origin, target);
      else if (state.pangEndPending) finishPangRun();
      return;
    }
    const settleMs = Math.max(0, state.swapAnimationUntil - performance.now());
    const moved = state.dragMoved;
    const storyPathValid = isStoryPathComplete();
    const storyDragSnapshot = state.storyDragSnapshot;
    if (state.selected) state.keyboardFocus = { ...state.selected };
    clearInterval(state.timerId);
    state.timerId = null;
    clearDragPreview();
    state.dragPreview = null;
    state.storyDragSnapshot = null;
    state.dragMoved = false;
    state.dragTrail = [];
    hideLiveDragPath();
    state.selected = null;
    $("#move-timer").classList.remove("active");
    $("#cursor-timer").classList.remove("active", "danger");
    $("#move-timer strong").textContent = getMoveSeconds().toFixed(1);
    $("#move-timer i").style.transform = "scaleX(1)";
    if (moved && !storyPathValid && storyDragSnapshot) state.board = storyDragSnapshot;
    renderBoard();
    if (!moved) {
      // A tap/click without moving a tile is a cancelled gesture, not a turn.
      // This prevents first-time players from being punished while learning
      // the hold-and-drag control and matches the expected P&D interaction.
      state.swapAnimationUntil = 0;
      renderStoryPathDemo();
      return;
    }
    if (!storyPathValid) {
      state.swapAnimationUntil = 0;
      rejectStoryPathGesture("끝까지 이동하기 전에 놓았습니다. 보드를 되돌렸으니 표시된 ‘놓기’ 칸까지 이어가세요.");
      renderStoryPathDemo();
      return;
    }
    if (settleMs) await wait(settleMs);
    state.swapAnimationUntil = 0;
    await resolveTurn();
  }

  function findMatches() {
    return findElementMatches(state.board);
  }

  function fallAndFill(matched) {
    for (let c = 0; c < COLS; c++) {
      const survivors = [];
      for (let r = ROWS - 1; r >= 0; r--) if (!matched.has(`${r},${c}`)) survivors.push(state.board[r][c]);
      for (let r = ROWS - 1, i = 0; r >= 0; r--, i++) state.board[r][c] = survivors[i] || makeTile();
    }
  }

  function showCombo(count, cascade = 1) {
    const badge = $("#combo-badge");
    const isPuzzleChain = (state.mode === "puzzle" || state.mode === "roguelike") && cascade > 1;
    badge.querySelector("strong").textContent = count;
    badge.querySelector("span").textContent = isPuzzleChain ? `연쇄 ${cascade}` : "COMBO";
    badge.setAttribute("aria-label", isPuzzleChain ? `${cascade}연쇄 ${count}콤보` : `${count}콤보`);
    badge.classList.toggle("chain", isPuzzleChain);
    badge.classList.remove("show"); void badge.offsetWidth; badge.classList.add("show");
  }

  function activeEnemyVisualTarget() {
    return isDebugMultiBattle()
      ? $("#debug-enemy-squad .multi-enemy-unit.selected")
      : $("#enemy-sprite");
  }

  function activeEnemyArtElement() {
    return isDebugMultiBattle()
      ? $("#debug-enemy-squad .multi-enemy-unit.selected .multi-enemy-art-wrap img")
      : $("#enemy-sprite-art");
  }

  function floatDamage(amount, label = "", kind = "player") {
    const el = $("#damage-float");
    el.textContent = `${label}${Math.round(amount)}`;
    el.classList.toggle("from-player", kind === "player");
    el.classList.toggle("from-effect", kind !== "player");
    el.classList.remove("show"); void el.offsetWidth; el.classList.add("show");
    const sprite = activeEnemyVisualTarget();
    sprite?.classList.remove("enemy-hit");
    if (sprite) { void sprite.offsetWidth; sprite.classList.add("enemy-hit"); }
    const bar = document.querySelector(".enemy-bar");
    bar?.classList.remove("damage-pulse");
    if (bar) { void bar.offsetWidth; bar.classList.add("damage-pulse"); }
  }

  let battleFeedbackTimer = null;

  function showBattleFeedback(kind, title, detail) {
    const feedback = $("#battle-feedback");
    if (!feedback) return;
    window.clearTimeout(battleFeedbackTimer);
    $("#battle-feedback-kicker").textContent = kind === "drop" ? "전리품" : kind === "prepare" ? "적 준비" : kind === "enemy" ? "적 공격" : "내 공격";
    $("#battle-feedback-title").textContent = title;
    $("#battle-feedback-detail").textContent = detail;
    feedback.classList.remove("player", "enemy", "show");
    const duration = getBattleFeedbackDuration(state.battleDisplayMode, kind === "drop" ? "player" : kind);
    feedback.style.setProperty("--feedback-duration", `${duration}ms`);
    void feedback.offsetWidth;
    feedback.classList.add(kind === "enemy" || kind === "prepare" ? "enemy" : "player", "show");
    battleFeedbackTimer = window.setTimeout(() => feedback.classList.remove("show"), duration);
  }

  async function showElementProcFeedback(procs = []) {
    const activated = procs.filter((proc) => proc?.activated);
    const overlay = $("#element-proc-overlay");
    if (!overlay || !activated.length) return;
    overlay.innerHTML = activated.map((proc) => {
      const element = getElementMeta(proc.element);
      return `<article class="element-proc-card ${escapeHtml(proc.element)}"><b>${escapeHtml(element.symbol)}</b><span><small>${escapeHtml(element.label)} 오행 특수효과</small><strong>${escapeHtml(proc.effectText)}</strong><em>발동률 ${escapeHtml(formatProcPercent(proc.chance))}</em></span></article>`;
    }).join("");
    overlay.hidden = false;
    overlay.classList.remove("show");
    void overlay.offsetWidth;
    overlay.classList.add("show");
    audioDirector.playSfx("idiom-ready");
    await wait(state.battleDisplayMode === "slow" ? 1900 : 900);
    overlay.classList.remove("show");
    await wait(180);
    overlay.hidden = true;
  }

  async function showBattleLootCeremony({ kind = "talisman", kicker = "전리품", title, detail } = {}) {
    const overlay = $("#battle-loot-overlay");
    if (!overlay) return;
    // The battlefield is a z-index:0 stacking context in the in-game layout.
    // Move result ceremonies to the document top layer so route/reward modals
    // can never cover talisman drops or rare-enemy escapes.
    if (overlay.parentElement !== document.body) document.body.append(overlay);
    const art = $("#battle-loot-art");
    overlay.dataset.kind = kind;
    if (art) art.hidden = kind !== "talisman";
    $("#battle-loot-kicker").textContent = kicker;
    $("#battle-loot-title").textContent = title || "보상 획득";
    $("#battle-loot-detail").textContent = detail || "행로 기록에 반영되었습니다.";
    overlay.hidden = false;
    overlay.classList.remove("show");
    void overlay.offsetWidth;
    overlay.classList.add("show");
    audioDirector.playSfx(kind === "escape" ? "enemy-prepare" : "reward");
    await wait(state.idiomSpeed === "slow" ? 2700 : 1450);
    overlay.classList.remove("show");
    await wait(220);
    overlay.hidden = true;
  }

  function showPlayerHitFeedback(damage, absorbed = 0, secondaryDamage = 0) {
    const value = $("#player-damage-float");
    const panel = $("#puzzle-panel");
    const totalDamage = Math.max(0, damage) + Math.max(0, secondaryDamage);
    if (value) {
      value.textContent = totalDamage > 0
        ? `−${Math.round(totalDamage)} HP${secondaryDamage > 0 ? ` · 화상 ${Math.round(secondaryDamage)}` : ""}`
        : `보호막 ${Math.round(absorbed)} 방어`;
      value.classList.toggle("blocked", totalDamage <= 0);
      value.classList.remove("show");
      void value.offsetWidth;
      value.classList.add("show");
    }
    panel?.classList.remove("player-hit");
    if (panel) { void panel.offsetWidth; panel.classList.add("player-hit"); }
    const bar = document.querySelector(".player-bar");
    bar?.classList.remove("damage-pulse");
    if (bar) { void bar.offsetWidth; bar.classList.add("damage-pulse"); }
    audioDirector.playSfx(totalDamage > 0 ? "debuff" : "shield");
  }

  let enemyArtRestoreTimer = null;
  let idleSpriteAlt = false;

  function setEnemyArtFrame(frameKey, restoreMs = 0) {
    const enemy = currentEnemy();
    const art = activeEnemyArtElement();
    const src = enemy?.asset?.[frameKey];
    if (!art || !src) return;
    window.clearTimeout(enemyArtRestoreTimer);
    art.dataset.frameLocked = "true";
    art.src = src;
    if (restoreMs > 0) {
      enemyArtRestoreTimer = window.setTimeout(() => {
        delete art.dataset.frameLocked;
        const current = currentEnemy();
        const idleArt = current?.asset?.idle;
        art.hidden = !idleArt;
        if (idleArt) art.src = idleArt;
        else art.removeAttribute("src");
      }, restoreMs);
    }
  }

  function tickIdleSprites() {
    if (document.hidden) return;
    idleSpriteAlt = !idleSpriteAlt;
    const enemyArt = $("#enemy-sprite-art");
    const enemy = currentEnemy();
    if (enemyArt && enemyArt.dataset.frameLocked !== "true" && enemy?.asset?.idle) {
      enemyArt.src = idleSpriteAlt && enemy.asset.idleAlt ? enemy.asset.idleAlt : enemy.asset.idle;
    }
    if (isDebugMultiBattle()) {
      state.debugEnemyGroup.members.forEach((member, index) => {
        const art = $(`#debug-enemy-squad [data-debug-enemy-target="${index}"] .multi-enemy-art-wrap img`);
        if (!art || art.dataset.frameLocked === "true" || !member.enemy?.asset?.idle) return;
        art.src = idleSpriteAlt && member.enemy.asset.idleAlt ? member.enemy.asset.idleAlt : member.enemy.asset.idle;
      });
    }
    document.querySelectorAll("[data-squad-jaryeong] .sprite-body").forEach((img) => {
      const member = img.closest("[data-squad-jaryeong]");
      const jaryeong = getJaryeong(member?.dataset.squadJaryeong);
      const frameKey = idleSpriteAlt && jaryeong?.asset?.idleAlt ? "idleAlt" : "idle";
      if (jaryeong?.asset?.idle) {
        img.src = jaryeong.asset[frameKey];
        setTalismanFrame(member, jaryeong, frameKey);
      }
    });
  }

  const COMBAT_PROJECTILE_COLORS = Object.freeze({
    wood: "#70d98e", fire: "#ff704f", earth: "#d2aa62", metal: "#e7edf2", water: "#62b9f2", seal: "#e4513e"
  });

  async function launchCombatProjectile(fromElement, toElement, { element = "wood", kind = "attack", variant = "", label = "" , duration = 480 } = {}) {
    const layer = $("#combat-projectile-layer");
    if (!layer || !fromElement || !toElement) return;
    const from = fromElement.getBoundingClientRect();
    const to = toElement.getBoundingClientRect();
    const startX = from.left + from.width / 2;
    const startY = from.top + from.height / 2;
    const endX = to.left + to.width / 2;
    const endY = to.top + to.height / 2;
    const projectile = document.createElement("span");
    projectile.className = `combat-projectile ${kind === "seal" ? `seal ${variant}` : element}`;
    projectile.textContent = label;
    projectile.style.setProperty("--projectile-x", `${startX}px`);
    projectile.style.setProperty("--projectile-y", `${startY}px`);
    projectile.style.setProperty("--projectile-dx", `${endX - startX}px`);
    projectile.style.setProperty("--projectile-dy", `${endY - startY}px`);
    projectile.style.setProperty("--projectile-color", COMBAT_PROJECTILE_COLORS[kind === "seal" ? "seal" : element] || COMBAT_PROJECTILE_COLORS.wood);
    projectile.style.setProperty("--projectile-duration", `${duration}ms`);
    layer.appendChild(projectile);
    await wait(duration);
    projectile.remove();
  }

  async function animateSquadElement(element, memberId = null) {
    const enemyTarget = activeEnemyVisualTarget();
    const members = [...document.querySelectorAll(`.squad-jaryeong.${element}`)]
      .filter((member) => !memberId || member.dataset.squadJaryeong === memberId);
    if (!enemyTarget || !members.length) return;
    await Promise.all(members.map(async (member, index) => {
      const jaryeong = getJaryeong(member.dataset.squadJaryeong);
      const img = member.querySelector(".sprite-body");
      if (!img || !jaryeong?.asset?.attack) return;
      await wait(index * 65);
      img.src = jaryeong.asset.attack;
      setTalismanFrame(member, jaryeong, "attack");
      member.classList.remove("attacking");
      void member.offsetWidth;
      member.classList.add("attacking");
      window.setTimeout(() => {
        member.classList.remove("attacking");
        img.src = jaryeong.asset.idle;
        setTalismanFrame(member, jaryeong, "idle");
      }, 560);
      await launchCombatProjectile(member, enemyTarget, { element, duration: 480 });
    }));
    enemyTarget.classList.remove("projectile-hit");
    void enemyTarget.offsetWidth;
    enemyTarget.classList.add("projectile-hit");
    window.setTimeout(() => enemyTarget.classList.remove("projectile-hit"), 320);
  }

  function updatePangHud() {
    $("#pang-score").textContent = Math.round(state.pangScore).toLocaleString("ko-KR");
    $("#pang-best-combo").textContent = state.pangBestCombo;
    $("#pang-time-text").textContent = Math.max(0, state.pangTimeLeft).toFixed(1);
    $("#pang-time-bar").style.transform = `scaleX(${clamp(state.pangTimeLeft / PANG_MAX_TIME, 0, 1)})`;
    $("#pang-time-bar").parentElement.classList.toggle("danger", state.pangTimeLeft <= 10);
  }

  function renderPangIdioms() {
    const wrap = $("#pang-idiom-strip");
    wrap.innerHTML = PANG_IDIOMS.map((idiom) => {
      const availability = idiomAvailability(idiom);
      const ready = availability.every(Boolean);
      return `<div class="pang-idiom-card ${ready ? "ready" : ""}"><b>${idiom.name}</b><span class="pang-mini-slots">${idiom.chars.map((char, index) => `<span class="${availability[index] ? "on" : ""}" title="${char} · ${HANJA_READINGS[char]}">${char}</span>`).join("")}</span></div>`;
    }).join("");
  }

  function showPangTimeGain(amount) {
    const gain = $("#pang-time-gain");
    gain.textContent = `+${amount.toFixed(1)}`;
    gain.classList.remove("show"); void gain.offsetWidth; gain.classList.add("show");
  }

  function addPangTime(amount) {
    const before = state.pangTimeLeft;
    state.pangTimeLeft = Math.min(PANG_MAX_TIME, state.pangTimeLeft + amount);
    const gained = state.pangTimeLeft - before;
    if (gained >= 0.05) showPangTimeGain(gained);
    updatePangHud();
    return gained;
  }

  function resetPangSkillRail() {
    $("#pang-skill-events").innerHTML = '<p class="pang-skill-empty"><b>네 글자</b>가 모이면<br />이곳에 효과가 기록됩니다.</p>';
  }

  function showPangAlchemy(idiom, rewardText) {
    const events = $("#pang-skill-events");
    events.querySelector(".pang-skill-empty")?.remove();
    const event = document.createElement("article");
    event.className = "pang-skill-event";
    event.innerHTML = `<small>SKILL ACTIVATED</small><h3>${idiom.name}</h3><div class="pang-skill-glyphs">${idiom.chars.map((char) => `<b title="${char} · ${HANJA_READINGS[char]}">${char}</b>`).join("")}</div><p>${rewardText}</p>`;
    events.prepend(event);
    requestAnimationFrame(() => event.classList.add("show"));
    [...events.querySelectorAll(".pang-skill-event")].slice(3).forEach((oldEvent) => oldEvent.remove());
  }

  async function activatePangIdioms() {
    const activated = PANG_IDIOMS.filter((idiom) => idiomAvailability(idiom, state.queue).every(Boolean));
    if (!activated.length) {
      state.queue = state.queue.slice(-PANG_QUEUE_MAX);
      renderPangIdioms();
      return;
    }
    const usedIds = new Set();
    for (const idiom of activated) selectUsedEntries(idiom, state.queue).forEach((entry) => usedIds.add(entry.id));
    for (const idiom of activated) {
      const reward = PANG_IDIOM_REWARDS[idiom.id];
      state.pangIdioms++;
      state.pangScore += reward.score;
      updatePangHud();
      showPangAlchemy(idiom, reward.text);
    }
    state.queue = state.queue.filter((entry) => !usedIds.has(entry.id)).slice(-PANG_QUEUE_MAX);
    renderPangIdioms();
  }

  function preparePangMode() {
    clearInterval(state.timerId); clearInterval(state.pangTimerId);
    ROWS = 7; COLS = 7;
    Object.assign(state, {
      board: [], queue: [], selected: null, dragging: false, dragMoved: false, resolving: false,
      gameOver: false, pangRunning: false, pangScore: 0, pangBestCombo: 0,
      pangMoves: 0, pangTimeLeft: PANG_SECONDS, pangTimerId: null,
      pangLastTick: 0, pangOrigin: null, pangTarget: null, pangMoved: false,
      pangEndPending: false, pangIdioms: 0, dragPreview: null, swapAnimationUntil: 0,
      nextMoveBonus: 0, enemyMovePenalty: 0, currentChargeBonus: 0, nextChargeBonus: 0, nextPlayerDamageBonus: 0, nextWeaknessDamageBonus: 0,
      enemyVulnerableTurns: 0, enemyVulnerableRatio: 0, enemySilenced: 0, healReductionTurns: 0, healReductionRatio: 0,
      reflectNextEnemyAttack: null, nextEnemyDamageReduction: 0, enemyShield: 0, enemyElementBarrier: null, idiomGrowthStacks: 0, turnsSinceIdiom: 0,
      lastActivatedIdiomId: null, lastTurnElementDamage: {}, lastMatchGroupSizes: [],
      turnTotals: { damage: 0, heal: 0, shield: 0, burn: 0, delay: 0, elementDamage: {} },
      lockedTiles: new Map(), activeSealVisual: "seal"
    });
    state.board = createBoard();
    renderBoard(); updatePangHud(); renderPangIdioms(); resetPangSkillRail();
  }

  function beginPangRun() {
    if (state.mode !== "pang") return;
    $("#pang-intro-modal").classList.remove("open");
    $("#pang-result-modal").classList.remove("open");
    state.gameOver = false;
    state.pangRunning = true;
    state.pangEndPending = false;
    state.pangLastTick = performance.now();
    clearInterval(state.pangTimerId);
    state.pangTimerId = setInterval(tickPangTimer, 50);
    updatePangHud();
  }

  function tickPangTimer() {
    if (!state.pangRunning) return;
    const now = performance.now();
    state.pangTimeLeft -= (now - state.pangLastTick) / 1000;
    state.pangLastTick = now;
    if (state.pangTimeLeft <= 0) {
      state.pangTimeLeft = 0;
      requestPangEnd();
    }
    updatePangHud();
  }

  function requestPangEnd() {
    state.pangRunning = false;
    state.gameOver = true;
    clearInterval(state.pangTimerId); state.pangTimerId = null;
    updatePangHud();
    if (state.dragging) {
      state.pangEndPending = true;
      endDrag();
    } else if (state.resolving) state.pangEndPending = true;
    else finishPangRun();
  }

  function finishPangRun() {
    state.pangEndPending = false;
    $("#pang-result-score").textContent = Math.round(state.pangScore).toLocaleString("ko-KR");
    $("#pang-result-combo").textContent = state.pangBestCombo;
    $("#pang-result-moves").textContent = state.pangMoves;
    $("#pang-result-idioms").textContent = state.pangIdioms;
    $("#pang-result-modal").classList.add("open");
  }

  function hasPossiblePangMove() {
    const directions = [[0, 1], [1, 0]];
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      for (const [dr, dc] of directions) {
        const nr = r + dr, nc = c + dc;
        if (nr >= ROWS || nc >= COLS) continue;
        const a = { r, c }, b = { r: nr, c: nc };
        swapCells(a, b);
        const possible = findMatches().matched.size > 0;
        swapCells(a, b);
        if (possible) return true;
      }
    }
    return false;
  }

  async function resolvePangMove(origin, target) {
    state.resolving = true;
    try {
    let matches = findMatches();
    if (!matches.matched.size) {
      const cells = [origin, target].map(({ r, c }) => $("#board").querySelector(`[data-row="${r}"][data-col="${c}"]`));
      cells.forEach((cell) => cell?.classList.add("invalid"));
      await wait(300);
      swapCells(origin, target);
      renderBoard();
      state.resolving = false;
      if (state.pangEndPending) finishPangRun();
      return;
    }

    state.pangMoves++;
    let comboCount = 0;
    let cascade = 0;
    while (matches.matched.size && cascade < 15) {
      cascade++;
      comboCount += matches.groups.length;
      const removedCount = matches.matched.size;
      const matchedEls = [...matches.matched].map((key) => {
        const [r, c] = key.split(",").map(Number);
        return $("#board").querySelector(`[data-row="${r}"][data-col="${c}"]`);
      });
      matchedEls.forEach((el) => el?.classList.add("matched"));
      showCombo(comboCount);
      state.pangScore += Math.round(removedCount * 100 * (1 + Math.max(0, comboCount - 1) * .45));
      state.pangBestCombo = Math.max(state.pangBestCombo, comboCount);
      matches.matched.forEach((key) => {
        const [r, c] = key.split(",").map(Number);
        state.queue.push({ id: uid(), char: state.board[r][c].char, born: state.pangMoves });
      });
      const timeGain = Math.min(2.5, removedCount * .18 + Math.max(0, matches.groups.length - 1) * .25 + Math.max(0, cascade - 1) * .35);
      addPangTime(timeGain);
      renderPangIdioms();
      updatePangHud();
      await wait(235);
      fallAndFill(matches.matched);
      renderBoard({ falling: true });
      await wait(265);
      matches = findMatches();
    }
    await activatePangIdioms();
    if (!hasPossiblePangMove()) {
      state.board = createBoard();
      renderBoard({ falling: true });
      $("#pang-guide").textContent = "가능한 교환이 없어 오행판을 새로 섞었습니다.";
      setTimeout(() => { if (state.mode === "pang") $("#pang-guide").textContent = "이웃한 타일을 밀어 3개 이상 맞추세요. 매치가 없으면 원래 자리로 돌아옵니다."; }, 1500);
    }
    state.resolving = false;
    if (state.pangEndPending) finishPangRun();
    } finally {
      state.resolving = false;
      if (state.pangEndPending) finishPangRun();
    }
  }

  function matchUnits(count) {
    return count > 0 ? Math.max(1, Math.floor(count / 3)) : 0;
  }

  function chargeJaryeong(id, amount = 1) {
    if (!state.run) return;
    state.run.skillCharges = state.run.skillCharges || {};
    state.run.skillCharges[id] = clamp((state.run.skillCharges[id] || 0) + amount, 0, 5);
  }

  function chargePartyByElement(element, count) {
    if (state.mode !== "roguelike" || !state.run) return;
    const amount = matchUnits(count) + (state.currentChargeBonus || 0);
    getPartyJaryeongs().filter((jaryeong) => jaryeong.element === element).forEach((jaryeong) => chargeJaryeong(jaryeong.id, amount));
  }

  function chargePartyByHanja(tiles) {
    if (state.mode !== "roguelike" || !state.run || !tiles?.length) return;
    const counts = tiles.reduce((map, tile) => {
      map[tile.char] = (map[tile.char] || 0) + 1;
      return map;
    }, {});
    getPartyJaryeongs().forEach((jaryeong) => {
      if (counts[jaryeong.hanja]) chargeJaryeong(jaryeong.id, counts[jaryeong.hanja] * 2 + (state.currentChargeBonus || 0));
    });
  }

  function elementMultiplier(element, pierce = false) {
    const enemy = currentEnemy();
    if (enemy.weakElement === element) return 1.3;
    if (element === "metal" && pierce) return 1;
    if (enemy.resistElement === element) return .8;
    return 1;
  }

  function applyDebugMultiAoeDamage(amount, element) {
    if (!isDebugMultiBattle()) return { damage: 0, targets: 0 };
    persistActiveDebugEnemyMember();
    const group = state.debugEnemyGroup;
    let damage = 0;
    let targets = 0;
    const hitIndexes = [];
    group.members.forEach((member, index) => {
      if (index === group.activeIndex || member.currentHp <= 0) return;
      const dealt = Math.min(member.currentHp, Math.max(0, Number(amount) || 0));
      if (dealt <= 0) return;
      member.currentHp -= dealt;
      damage += dealt;
      targets++;
      hitIndexes.push([index, dealt]);
      recordTurnTotal("damage", dealt, element);
    });
    if (!targets) return { damage: 0, targets: 0 };
    renderDebugEnemyGroup();
    hitIndexes.forEach(([index, dealt]) => {
      const unit = $(`#debug-enemy-squad [data-debug-enemy-target="${index}"]`);
      if (!unit) return;
      unit.classList.remove("aoe-hit");
      void unit.offsetWidth;
      unit.classList.add("aoe-hit");
      const value = document.createElement("b");
      value.className = "multi-enemy-damage";
      value.textContent = `−${Math.round(dealt)}`;
      unit.appendChild(value);
      window.setTimeout(() => value.remove(), 650);
    });
    return { damage, targets };
  }

  async function applyElementMatchEffects(elementCounts, comboScale) {
    const activeElements = Object.entries(elementCounts).filter(([, count]) => count > 0).map(([element]) => element);
    const activeSet = new Set(activeElements);
    const leader = getLeaderJaryeong();
    const total = { damage: 0, elementBarrierDamage: 0, enemyShieldDamage: 0, aoeDamage: 0, aoeTargets: 0, heal: 0, shield: 0, burn: 0, delay: 0, logs: [], procs: [], strikes: [], byElement: {} };
    activeElements.forEach((element) => {
      const count = elementCounts[element];
      const units = matchUnits(count);
      const leaderEffect = leader ? LEADER_EFFECT_LIBRARY[leader.leaderEffectId] : null;
      const leaderDamageBonus = leader?.element === element && leaderEffect?.type === "elementDamageMultiplier" ? leaderEffect.value : 1;
      const leaderHealBonus = leader?.element === "wood" && element === "wood" ? leaderEffect?.value || 1.25 : 1;
      const leaderShieldBonus = leader?.element === "earth" && element === "earth" ? leaderEffect?.value || 1.25 : 1;
      const synergyBonus = state.nextElementBoosts[element] || 0;
      state.nextElementBoosts[element] = 0;
      const party = getPartyJaryeongs().filter((jaryeong) => jaryeong.element === element);
      const storyGuardLesson = getActiveStoryGuardLesson();
      const forceStoryEarthShield = Boolean(storyGuardLesson)
        && element === storyGuardLesson.requiredElement
        && !state.storyGuardEarthProcUsed;
      let proc = rollElementProc(element, elementProcContext(element, units, synergyBonus), randomValue);
      if (forceStoryEarthShield) {
        proc = { ...proc, chance: 1, roll: 0, activated: true, storyTraining: true };
        state.storyGuardEarthProcUsed = true;
      }
      const procRule = proc.rule;
      const metalPiercing = element === "metal" && proc.activated;
      const playerDamageBonus = state.nextPlayerDamageBonus || 0;
      const weaknessBonus = currentEnemy().weakElement === element ? (state.nextWeaknessDamageBonus || 0) : 0;
      const affinityStacks = state.run?.elementAffinity?.[element] || 0;
      const focusStacks = state.run?.focusBuildElement === element ? state.run?.focusBuildStacks || 0 : 0;
      const buildMultiplier = Math.min(RUN_LIMITS.maxDamageMultiplier, 1 + affinityStacks * .08 + focusStacks * .05);
      const procDamageMultiplier = metalPiercing ? procRule.damageMultiplier : 1;
      const attackProfile = calculateElementMatchAttack({
        units,
        comboScale,
        members: party.map((jaryeong) => ({
          attack: jaryeong.attack,
          level: state.run?.jaryeongLevels?.[jaryeong.id] || 1,
          awakening: state.run?.jaryeongAwakenings?.[jaryeong.id] || 0
        })),
        leaderMultiplier: leaderDamageBonus,
        systemMultiplier: buildMultiplier * (1 + synergyBonus * .18) * procDamageMultiplier
          * elementMultiplier(element, metalPiercing) * (1 + weaknessBonus)
          * (state.weakened ? .75 : 1) * (1 + playerDamageBonus)
          * (1 + (state.idiomGrowthStacks || 0) * .04)
      });
      const damage = Math.round(attackProfile.totalDamage);
      if (damage > 0) total.strikes.push({ element, damage, memberIds: party.map((jaryeong) => jaryeong.id), jaryeongRatio: attackProfile.jaryeongRatio });
      chargePartyByElement(element, count);
      let procResult = `${procRule.effect} 미발동`;
      if (proc.activated && element === "wood") {
        const amount = Math.round(units * procRule.amountPerUnit * leaderHealBonus * (1 + synergyBonus * .4));
        total.heal += amount;
        procResult = `회복 +${amount}`;
      }
      if (proc.activated && element === "fire") {
        const amount = Math.max(1, Math.round(units * FIRE_PROC_BURN_PER_UNIT * (1 + synergyBonus)));
        total.burn += amount;
        addEnemyBurn(amount);
        procResult = `화상 ${amount} × ${BURN_DURATION_TURNS}턴`;
      }
      if (proc.activated && element === "earth") {
        const amount = Math.round(units * procRule.amountPerUnit * leaderShieldBonus * (1 + synergyBonus));
        total.shield += amount;
        procResult = forceStoryEarthShield
          ? `보호막 +${amount} · 수련 보정: 토 보호막 확정`
          : `보호막 +${amount}`;
      }
      if (proc.activated && element === "water") {
        total.delay = Math.max(total.delay, procRule.turns || 1);
        procResult = `행동 지연 ${procRule.turns || 1}턴`;
      }
      if (metalPiercing) {
        const metalPierce = getRunRelicEffect("metalPierce");
        const breakPower = procRule.shieldBreakBase + units * procRule.shieldBreakPerUnit + (metalPierce?.amount || 0);
        const pierced = Math.min(state.enemyShield, breakPower);
        state.enemyShield -= pierced;
        procResult = `관통 피해 +${Math.round((procRule.damageMultiplier - 1) * 100)}%${pierced ? ` · 보호막 ${pierced} 파괴` : ""}`;
      }
      total.procs.push({ ...proc, effectText: procResult });
    });

    const rainbow = getRunRelicEffect("rainbowCharge");
    if (rainbow && activeElements.length >= 4) {
      partyChargeAll(rainbow.amount || 1);
      addLog(`<strong>${rainbow.relicName}</strong> · ${activeElements.length}속성 연성으로 전체 자령 기운 +${rainbow.amount || 1}`, "alchemy");
    }

    ELEMENT_SYNERGIES.forEach((synergy) => {
      if (!activeSet.has(synergy.from) || !activeSet.has(synergy.to)) return;
      state.nextElementBoosts[synergy.buff] = (state.nextElementBoosts[synergy.buff] || 0) + 1;
      addLog(`<strong>${synergy.label} 상생</strong> · ${synergy.text}`, "combo");
    });
    for (const strike of total.strikes) {
      const element = strike.element;
      if (strike.memberIds.length) await animateSquadElement(element);
      audioDirector.playSfx(`hit-${element}`);
      const dealt = applyDamage(strike.damage, `${ELEMENT_RULES[element].label}${strike.memberIds.length ? " 자령" : " 연성"} −`, { feedbackKind: "player", element });
      const damageResolution = state.lastEnemyDamageResolution || {};
      total.damage += dealt;
      total.elementBarrierDamage += damageResolution.elementBarrierDamage || 0;
      total.enemyShieldDamage += damageResolution.commonShieldDamage || 0;
      total.byElement[element] = (total.byElement[element] || 0) + dealt;
      if (state.lastWideMatchElements.includes(element)) {
        const aoe = applyDebugMultiAoeDamage(strike.damage, element);
        total.damage += aoe.damage;
        total.aoeDamage += aoe.damage;
        total.aoeTargets += aoe.targets;
        total.byElement[element] = (total.byElement[element] || 0) + aoe.damage;
      }
      await wait(90);
    }
    if (total.aoeTargets) {
      addLog(`<strong>4개 이상 광역공격</strong> · 선택 대상 밖 ${total.aoeTargets}체에 추가 피해 ${Math.round(total.aoeDamage)}`, "fire");
    }
    if (total.heal) healPlayer(total.heal);
    if (total.shield) gainShield(total.shield);
    if (total.delay) {
      const beforeDelay = state.delayed;
      state.delayed = Math.min(RUN_LIMITS.maxDelay, Math.max(state.delayed, total.delay));
      recordTurnTotal("delay", Math.max(0, state.delayed - beforeDelay));
    }
    if (total.burn) recordTurnTotal("burn", total.burn);
    if (total.procs.length) {
      const procSummary = total.procs.map((proc) => `${ELEMENT_RULES[proc.element].label} ${proc.effectText} (${formatProcPercent(proc.chance)})`).join(" · ");
      addLog(`<strong>부가효과 판정</strong> · ${procSummary}`, total.procs.some((proc) => proc.activated) ? "alchemy" : "miss");
      await showElementProcFeedback(total.procs);
    }
    state.lastTurnElementDamage = { ...total.byElement };
    if (activeElements.length) state.nextWeaknessDamageBonus = 0;
    state.nextPlayerDamageBonus = 0;
    return total;
  }

  function applyJaryeongSkillDamage(amount, label, jaryeong, options = {}) {
    const enemy = currentEnemy();
    const capped = capJaryeongSkillDamage(amount, enemy?.hp || enemy?.maxHp || 1);
    return applyDamage(capped, label, { ...options, element: jaryeong?.element, feedbackKind: "player" });
  }

  async function useJaryeongSkill(id) {
    if (state.mode !== "roguelike" || !state.run || state.resolving || state.jaryeongSkillAnimating || state.dragging || state.gameOver) return;
    const jaryeong = getJaryeong(id);
    if (!jaryeong || !state.run.partyJaryeongIds.includes(id) || (state.run.skillCharges?.[id] || 0) < 5) return;
    const skill = JARYEONG_SKILL_LIBRARY[jaryeong.skillId] || { name: jaryeong.skillName, description: jaryeong.skillDesc };
    const level = getJaryeongLevel(id);
    // 이전 저장의 Lv.5 각성 판정은 유지하면서, 영구 메타 각성도 전투 효과에 반영한다.
    const awakened = (state.run.jaryeongAwakenings?.[id] || 0) > 0 || level >= 5;
    // The ephemeral animation guard prevents duplicate pointer/keyboard casts.
    // Keep the persisted charge intact through the visual beat so a reload or
    // menu exit cannot consume energy before the skill effect is committed.
    state.jaryeongSkillAnimating = true;
    updateAll();
    try {
      await showJaryeongSkillCutin(jaryeong, skill);
      if (state.mode !== "roguelike" || !state.run || state.gameOver) return;
      const offensiveSkill = /피해|공격|폭쇄|반동/.test(`${skill.name || ""} ${skill.description || ""}`)
        || ["earth-mountain", "metal-chain", "metal-sword", "water-sea"].includes(jaryeong.id);
      if (offensiveSkill) await animateSquadElement(jaryeong.element, jaryeong.id);
      if (state.mode !== "roguelike" || !state.run || state.gameOver) return;
      state.run.skillCharges[id] = 0;
      switch (jaryeong.element) {
      case "wood":
        if (jaryeong.id === "wood-bamboo") {
          const removedLocks = state.lockedTiles?.size || 0;
          state.lockedTiles?.clear();
          if (removedLocks) recordCombatObjectiveEvent({ type: COMBAT_OBJECTIVE_EVENT.SEALS_REMOVED, count: removedLocks });
          resetQueueAges();
          if (removedLocks) gainShield(Math.min(12, removedLocks * 3));
        } else if (jaryeong.id === "wood-forest") {
          healPlayer(8);
          state.healingFieldTurns = awakened ? 4 : 3;
          state.healingFieldAmount = awakened ? 8 : 6;
        } else if (jaryeong.id === "wood-orchid") {
          const copiedHealing = Math.max(10, state.lastPlayerHealing || 0);
          healPlayer(Math.round(copiedHealing * (awakened ? 1.5 : 1)));
        } else if (jaryeong.id === "wood-life") healPlayer(state.playerHp <= 35 ? 26 : 18);
        else if (jaryeong.id === "wood-tree") { gainShield(10); healPlayer(8); }
        else {
          healPlayer(10);
          addBoardElementTiles("wood", awakened ? 4 : 3);
          if (awakened) gainShield(6);
        }
        state.nextElementBoosts.wood = (state.nextElementBoosts.wood || 0) + 1;
        break;
      case "fire":
        if (jaryeong.id === "fire-lantern") {
          const burnDamage = state.enemyBurn * (awakened ? 7 : 6);
          applyJaryeongSkillDamage(8 + burnDamage, "등화 폭쇄 −", jaryeong);
          clearEnemyBurn();
        } else if (jaryeong.id === "fire-phoenix") {
          state.phoenixRebirthReady = Math.max(
            state.phoenixRebirthReady || 0,
            capJaryeongSkillDamage(Number.MAX_SAFE_INTEGER, currentEnemy()?.hp || 1)
          );
        } else if (jaryeong.id === "fire-fox") {
          const fire = ELEMENTS.find((entry) => entry.id === "fire");
          [...state.queue].sort((a, b) => a.born - b.born).slice(0, awakened ? 3 : 2).forEach((entry) => {
            entry.element = "fire";
            entry.symbol = fire?.symbol || "火";
          });
          addBoardElementTiles("fire", awakened ? 4 : 3);
        } else {
          applyJaryeongSkillDamage(jaryeong.id === "fire-sun" ? 20 : jaryeong.id === "fire-light" ? 12 : 14, "스킬 −", jaryeong);
          addEnemyBurn((jaryeong.id === "fire-hwa" ? 2 : 1) + (awakened ? 1 : 0));
        }
        state.nextElementBoosts.fire = (state.nextElementBoosts.fire || 0) + 1;
        break;
      case "earth":
        gainShield(jaryeong.id === "earth-to" ? 20 : jaryeong.id === "earth-mountain" ? 8 : jaryeong.id === "earth-pottery" ? 12 : jaryeong.id === "earth-tortoise" ? 18 : jaryeong.id === "earth-valley" ? 0 : 14);
        if (jaryeong.id === "earth-stone") state.nextEnemyDamageReduction = Math.max(state.nextEnemyDamageReduction || 0, .1);
        if (jaryeong.id === "earth-mountain") applyJaryeongSkillDamage(10, "스킬 −", jaryeong);
        if (jaryeong.id === "earth-pottery") {
          state.nextChargeBonus = Math.max(state.nextChargeBonus || 0, 1);
          state.nextMoveBonus += awakened ? 1.5 : 1;
        }
        if (jaryeong.id === "earth-tortoise") state.nextEnemyDamageReduction = Math.max(state.nextEnemyDamageReduction || 0, awakened ? .35 : .25);
        if (jaryeong.id === "earth-valley") {
          state.damageSplitHits = awakened ? 4 : 3;
          state.damageSplitRatio = awakened ? .55 : .45;
        }
        break;
      case "metal":
        if (jaryeong.id === "metal-bell") {
          state.enemySilenced = Math.max(state.enemySilenced, awakened ? 2 : 1);
          gainShield(6);
        } else if (jaryeong.id === "metal-mirror") {
          state.reflectNextEnemyAttack = { ratio: awakened ? 1 : .75, damageReduction: awakened ? .5 : .35, label: "경령 · 명경반조", element: "metal" };
        } else if (jaryeong.id === "metal-chain") {
          state.boundEnemyIntentTurns = Math.max(state.boundEnemyIntentTurns || 0, awakened ? 2 : 1);
          applyJaryeongSkillDamage(8, "쇄맥 −", jaryeong, { ignoreShield: true });
        } else if (jaryeong.id === "metal-jade") {
          gainShield(12);
          getPartyJaryeongs().filter((member) => member.element === "metal" && member.id !== jaryeong.id).forEach((member) => chargeJaryeong(member.id, 1));
        } else applyJaryeongSkillDamage(jaryeong.id === "metal-sword" ? 20 : 16, "스킬 −", jaryeong, { ignoreShield: true });
        state.nextElementBoosts.metal = (state.nextElementBoosts.metal || 0) + 1;
        break;
      case "water":
        if (["water-sui", "water-rain", "water-sea", "water-abyss", "water-ice"].includes(jaryeong.id)) {
          state.delayed = Math.max(state.delayed, 1);
        }
        state.nextElementBoosts.water = (state.nextElementBoosts.water || 0) + 1;
        if (jaryeong.id === "water-abyss") state.enemySilenced = Math.max(state.enemySilenced, awakened ? 2 : 1);
        if (jaryeong.id === "water-ice") state.nextMoveBonus += awakened ? 3 : 2;
        if (jaryeong.id === "water-mist") {
          state.nextEnemyDamageReduction = Math.max(state.nextEnemyDamageReduction || 0, awakened ? .6 : .5);
          state.enemySilenced = Math.max(state.enemySilenced, awakened ? 2 : 1);
          state.nextMoveBonus += awakened ? 2 : 1.5;
        }
        if (jaryeong.id === "water-sui") addBoardElementTiles("water", awakened ? 4 : 2);
        if (jaryeong.id === "water-sea") applyJaryeongSkillDamage(12, "스킬 −", jaryeong);
        if (jaryeong.id === "water-rain") gainShield(awakened ? 12 : 8);
        break;
      }
      showBattleFeedback("player", `${jaryeong.hanja}령 · ${skill.name}`, skill.description);
      addLog(`<strong>${jaryeong.hanja}령 · ${skill.name}</strong> · ${skill.description}`, "alchemy");
      updateAll();
      if (state.enemyHp <= 0) {
        state.resolving = true;
        try {
          await nextWave();
        } finally {
          state.resolving = false;
        }
        saveActiveRun();
      }
    } finally {
      state.jaryeongSkillAnimating = false;
      if (!state.resolving) updateAll();
    }
  }

  function advanceRareAfterPlayerTurn() {
    if (!state.rareEncounter || state.rareEncounter.status !== "active") return false;
    state.rareEncounter.enemyHp = Math.max(0, state.enemyHp);
    state.rareEncounter.talismanShield = Math.max(0, state.enemyShield || 0);
    state.rareEncounter = advanceRareEncounterTurn(state.rareEncounter, 1);
    return state.rareEncounter.status === "escaped";
  }

  async function finishEscapedRareEncounter() {
    const escapedEnemy = currentEnemy();
    recordCombatObjectiveEvent({ type: COMBAT_OBJECTIVE_EVENT.BATTLE_LOST });
    if (state.run) {
      state.run.rareEncountersEscaped = (state.run.rareEncountersEscaped || 0) + 1;
      state.run.rewardHistory.push(`rare-escaped:${escapedEnemy?.jaryeongId || escapedEnemy?.id || "unknown"}`);
      state.run.pendingReward = false;
      state.run.pendingContractJaryeongId = null;
      state.run.rewardChoices = [];
    }
    addLog(`<strong>${escapedEnemy?.name || "희귀 자령"} 도주</strong> · 행로는 계속되지만 전투·작은 목표 보상은 받지 못합니다.`, "miss");
    showBattleFeedback("enemy", "희귀 자령이 달아났습니다", "런은 끝나지 않습니다 · 다음 경로를 선택하세요");
    await showBattleLootCeremony({
      kind: "escape",
      kicker: "희귀 조우 종료",
      title: `${escapedEnemy?.name || "희귀 자령"} 도주`,
      detail: "보상 없이 사라졌습니다 · 연성행로는 계속됩니다"
    });
    state.resolving = false;
    state.rareEncounter = null;
    state.combatObjective = null;
    completeCurrentRunNode();
    saveActiveRun();
  }

  async function resolveTurn() {
    state.resolving = true;
    try {
    state.freshQueueIds.clear();
    deliverFirstBattleCharacters(state.turn);
    state.currentChargeBonus = state.nextChargeBonus || 0;
    state.nextChargeBonus = 0;
    resetTurnTotals();
    state.lastMatchGroupSizes = [];
    state.lastWideMatchElements = [];
    const wideMatchElements = new Set();
    const removedTiles = [];
    const elementCounts = Object.fromEntries(ELEMENTS.map((e) => [e.id, 0]));
    let cascade = 0;
    let comboCount = 0;
    let matches = findMatches();
    if (!matches.matched.size) {
      addLog("빛이 이어지지 않았습니다. 야생 자령이 틈을 노립니다.", "miss");
    }
    while (matches.matched.size && cascade < 12) {
      cascade++;
      comboCount += matches.groups.length;
      matches.groups.forEach((group) => {
        state.lastMatchGroupSizes.push(group.length);
        if (group.length < 4) return;
        const [row, col] = group[0] || [];
        const element = state.board?.[row]?.[col]?.element;
        if (element) wideMatchElements.add(element);
      });
      state.lastWideMatchElements = [...wideMatchElements];
      // Snapshot the set before the animation/fall phase. The next scan must
      // always use the freshly filled board, never the previous match set.
      const matched = new Set(matches.matched);
      const matchedEls = [...matched].map((key) => {
        const [r, c] = key.split(",").map(Number); return $("#board").querySelector(`[data-row="${r}"][data-col="${c}"]`);
      });
      matchedEls.forEach((el) => {
        el?.classList.toggle("chain-hit", cascade > 1);
        el?.classList.add("matched");
      });
      showCombo(comboCount, cascade);
      audioDirector.playSfx(comboCount >= 6 ? "combo-high" : cascade > 1 ? "combo-low" : "tile-match");
      await wait(280);
      matched.forEach((key) => {
        const [r, c] = key.split(",").map(Number);
        const tile = state.board[r][c]; removedTiles.push(tile); elementCounts[tile.element]++;
      });
      fallAndFill(matched);
      renderBoard({ falling: true });
      await wait(310);
      // Re-scan after the fall animation. This is the cascade boundary: any
      // new 3+ match created by the refill is resolved as the next chain step.
      matches = findMatches();
    }
    if (cascade) {
      state.totalCombos += comboCount;
      const comboScale = 1 + Math.max(0, comboCount - 1) * .25;
      let elemental = { damage: 0, elementBarrierDamage: 0, enemyShieldDamage: 0, aoeDamage: 0, aoeTargets: 0, heal: 0, shield: 0, burn: 0, delay: 0, logs: [], procs: [], strikes: [], byElement: {} };
      try {
        elemental = await applyElementMatchEffects(elementCounts, comboScale);
      } catch (error) {
        console.error("element match effects failed; continuing queue and turn resolution", error);
        addLog("<strong>전투 계산 복구</strong> · 공격 부가 계산 일부를 건너뛰고 문자 큐와 턴 처리를 계속합니다.", "miss");
      }
      const outcome = [`기운 피해 ${elemental.damage}`];
      if (elemental.aoeTargets) outcome.push(`광역 ${elemental.aoeTargets}체 · ${elemental.aoeDamage} 피해`);
      if (elemental.elementBarrierDamage) outcome.push(`연성막 ${elemental.elementBarrierDamage} 파괴`);
      if (elemental.enemyShieldDamage) outcome.push(`보호막 ${elemental.enemyShieldDamage} 파괴`);
      if (elemental.heal) outcome.push(`체력 +${elemental.heal}`);
      if (elemental.shield) outcome.push(`보호막 +${elemental.shield}`);
      if (elemental.delay) outcome.push(`적 ${elemental.delay}턴 지연`);
      if (elemental.burn) outcome.push(`화상 ${elemental.burn}`);
      const activatedProcs = elemental.procs.filter((proc) => proc.activated);
      activatedProcs.forEach((proc) => recordCombatObjectiveEvent({ type: COMBAT_OBJECTIVE_EVENT.ELEMENT_PROC, element: proc.element, count: 1 }));
      outcome.push(activatedProcs.length
        ? `부가효과: ${activatedProcs.map((proc) => `${ELEMENT_RULES[proc.element].label} ${proc.rule.effect}`).join(" · ")}`
        : "부가효과 미발동");
      showBattleFeedback("player", `${comboCount}콤보 · ${removedTiles.length}드롭`, outcome.join(" · "));
      addLog(`<strong>${comboCount}콤보</strong> · ${removedTiles.length}개 제거 · 기운 피해 ${elemental.damage}${elemental.aoeTargets ? ` · 광역 ${elemental.aoeTargets}체 ${elemental.aoeDamage} 피해` : ""}${elemental.elementBarrierDamage ? ` · 연성막 ${elemental.elementBarrierDamage} 파괴` : ""}${elemental.enemyShieldDamage ? ` · 보호막 ${elemental.enemyShieldDamage} 파괴` : ""}${elemental.heal ? ` · 회복 ${elemental.heal}` : ""}${elemental.shield ? ` · 보호 ${elemental.shield}` : ""}${elemental.delay ? ` · 행동 지연 ${elemental.delay}턴` : ""}${elemental.burn ? ` · 화상 ${elemental.burn}` : ""}`, "combo");
    }

    removedTiles.forEach((tile) => {
      const entry = { id: uid(), char: tile.char, born: state.turn };
      state.queue.push(entry); state.freshQueueIds.add(entry.id);
    });
    const queueRefresh = getRunRelicEffect("refreshOldest");
    if (queueRefresh && comboCount >= (queueRefresh.combo || 4) && state.queue.length) {
      const oldest = [...state.queue].sort((a, b) => a.born - b.born)[0];
      oldest.born = state.turn;
      addLog(`<strong>${queueRefresh.relicName}</strong> · ${oldest.char} 문자의 수명을 초기화`, "alchemy");
    }
    chargePartyByHanja(removedTiles);
    renderQueue(); renderIdioms(); updateVitals();
    // Give the player a readable beat to connect the match with its combat
    // outcome before idiom and enemy responses can replace the result banner.
    await wait(cascade ? 700 : 250);
    let activated = { activated: [], usedIds: new Set() };
    try {
      activated = await activateIdioms(elementCounts, comboCount);
    } catch (error) {
      console.error("idiom activation failed; continuing enemy turn resolution", error);
      addLog("<strong>연성식 복구</strong> · 성어 처리 일부를 건너뛰고 적 턴을 계속합니다.", "miss");
    }
    if (activated.activated.length) recordCombatObjectiveEvent({ type: COMBAT_OBJECTIVE_EVENT.IDIOM_ACTIVATED, count: activated.activated.length });
    cleanQueue(activated.usedIds);
    state.turnsSinceIdiom = activated.activated.length ? 0 : (state.turnsSinceIdiom || 0) + 1;
    renderQueue(); renderIdioms(); updateVitals();
    if (restartLongDragLessonIfNeeded(comboCount)) return;
    if (state.storySession?.event !== STORY_TRAINING_EVENT.GUARDED_HIT
      && (comboCount > 0 || activated.activated.length)
      && finishStoryTrainingTurn(comboCount, removedTiles, activated.activated)) return;
    if (state.weakenedTurns > 0) {
      state.weakenedTurns--;
      if (!state.weakenedTurns) state.weakened = false;
    }
    if (state.healReductionTurns > 0) {
      state.healReductionTurns--;
      if (!state.healReductionTurns) state.healReductionRatio = 0;
    }
    // Locks created by the previous enemy action remain through this player
    // move, then expire before the enemy can apply a fresh lock for next turn.
    reduceTileLocks();
    advanceFirstBattleGuide(FIRST_BATTLE_ONBOARDING_EVENT.RESPONSE_CHOSEN);

    let enemyActed = false;
    if (state.enemyHp <= 0) {
      await nextWave();
    } else {
      if (advanceRareAfterPlayerTurn()) {
        await finishEscapedRareEncounter();
        return;
      }
      const hourglass = getRunRelicEffect("turnSevenDelay");
      if (hourglass && state.turn === 7 && claimRunTrigger(state.run, encounterRelicKey("turnSevenDelay"))) {
        state.delayed = Math.min(RUN_LIMITS.maxDelay, state.delayed + (hourglass.turns || 1));
        addLog(`<strong>${hourglass.relicName}</strong> · 7턴째의 적 행동을 ${hourglass.turns || 1}턴 지연`, "water");
      }
      enemyActed = await enemyTurn();
      if (enemyActed) advanceFirstBattleGuide(FIRST_BATTLE_ONBOARDING_EVENT.ENEMY_ACTION_RESOLVED);
    }
    if (!state.gameOver) {
      if (state.enemyVulnerableTurns > 0) state.enemyVulnerableTurns--;
      if (enemyActed && state.enemySilenced > 0) state.enemySilenced--;
      state.currentChargeBonus = 0;
      state.turn++;
      if (state.enemyHp > 0 && state.healingFieldTurns > 0) {
        const healed = healPlayer(state.healingFieldAmount || 0);
        state.healingFieldTurns--;
        addLog(`<strong>삼림 맥동</strong> · 체력 ${healed} 회복 · ${state.healingFieldTurns}턴 남음`, "wood");
      }
      if (state.enemyHp > 0 && state.deferredDamageTicks > 0 && state.deferredDamage > 0) {
        const deferredTick = Math.ceil(state.deferredDamage / state.deferredDamageTicks);
        state.deferredDamage = Math.max(0, state.deferredDamage - deferredTick);
        state.deferredDamageTicks--;
        state.playerHp = Math.max(0, state.playerHp - deferredTick);
        addLog(`<strong>협곡 분류</strong> · 미뤄 둔 피해 ${deferredTick} · ${state.deferredDamageTicks}턴 남음`, "earth");
        if (state.playerHp <= 0) {
          await handleDefeat();
          if (state.gameOver) return;
          if (state.enemyHp <= 0) {
            state.resolving = false;
            saveActiveRun();
            return;
          }
        }
      }
      state.queue = state.queue.filter((entry) => state.turn - entry.born < getQueueLife());
      if (state.queue.length > getQueueMax()) state.queue = state.queue.slice(-getQueueMax());
      state.freshQueueIds.clear();
      deliverFirstBattleCharacters(state.turn);
      refreshRotatingIdioms({ announce: true });
      state.resolving = false;
      updateAll();
    }
    } finally {
      state.resolving = false;
    }
  }

  function applyDamage(amount, label = "−", options = {}) {
    const raw = Math.max(0, Number(amount) || 0);
    state.lastEnemyDamageResolution = {
      hpDamage: 0,
      elementBarrierDamage: 0,
      commonShieldDamage: 0,
      totalImpact: 0,
      element: options.element || null
    };
    if (!raw) return 0;
    const vulnerableBonus = options.ignoreVulnerability ? 0 : (state.enemyVulnerableTurns > 0 ? state.enemyVulnerableRatio || 0 : 0);
    let dealt = raw * (1 + vulnerableBonus);
    let elementBarrierDamage = 0;
    if (!options.ignoreBarrier && state.enemyElementBarrier) {
      const barrierBefore = sanitizeSoftElementBarrier(state.enemyElementBarrier);
      const barrierResult = resolveElementBarrierHit(barrierBefore, dealt, options.element || null);
      state.enemyElementBarrier = barrierResult.barrier;
      dealt = barrierResult.overflowDamage;
      elementBarrierDamage = barrierResult.barrierDamage;
      if (barrierResult.barrierDamage > 0) {
        const preferredElement = getElementMeta(barrierBefore.preferredElement);
        const barrierLabel = barrierResult.preferred
          ? `${preferredElement.symbol} 유효타 ×${formatDefenseValue(barrierResult.multiplier)} · 연성막 −`
          : "연성막 −";
        floatDamage(barrierResult.barrierDamage, barrierLabel, "effect");
        audioDirector.playSfx("enemy-hit");
        setEnemyArtFrame("hurt", 240);
        if (barrierResult.broken) {
          addLog(`<strong>${preferredElement.label} 속성 연성막 파괴</strong> · 모든 속성이 유효하며 ${preferredElement.label} 공격은 파괴력 ×${formatDefenseValue(barrierBefore.breakMultiplier)}`, preferredElement.id);
        }
      }
    }
    let absorbedByShield = 0;
    if (!options.ignoreShield && state.enemyShield > 0) {
      absorbedByShield = Math.min(state.enemyShield, dealt);
      state.enemyShield -= absorbedByShield;
      dealt -= absorbedByShield;
      if (absorbedByShield > 0) floatDamage(absorbedByShield, "보호막 −", "effect");
    }
    if (dealt > 0) state.enemyHp -= dealt;
    state.lastEnemyDamageResolution = {
      hpDamage: dealt,
      elementBarrierDamage,
      commonShieldDamage: absorbedByShield,
      totalImpact: dealt + elementBarrierDamage + absorbedByShield,
      element: options.element || null
    };
    recordTurnTotal("damage", dealt, options.element || null);
    if (dealt > 0) {
      audioDirector.playSfx("enemy-hit");
      floatDamage(dealt, label, options.feedbackKind || "effect");
      setEnemyArtFrame("hurt", 320);
    }
    updateVitals();
    return dealt;
  }

  function applyTrueDamage(amount, label = "−") {
    return applyDamage(amount, label, { ignoreVulnerability: true, ignoreShield: true, ignoreBarrier: true });
  }

  function selectUsedEntries(idiom, pool) {
    const selected = [];
    const remaining = [...pool];
    idiom.chars.forEach((char) => {
      const index = remaining.findIndex((entry) => entry.char === char && !selected.includes(entry));
      if (index >= 0) selected.push(remaining.splice(index, 1)[0]);
    });
    return selected;
  }

  function tryEmergencyIdiomSupply() {
    const relic = getRunRelicEffect("emergencyIdiom");
    const run = state.run;
    const triggerKey = "run:emergencyIdiom";
    if (!relic || !run || state.playerHp / Math.max(1, maxPlayerHp()) > .3 || run.relicState?.triggered?.[triggerKey]) return null;
    const choice = chooseEmergencyIdiom(getCurrentIdioms(), state.queue);
    if (!choice?.missingChars?.length) return null;
    const preserved = new Set(selectUsedEntries(choice.idiom, state.queue).map((entry) => entry.id));
    let overflow = Math.max(0, state.queue.length + choice.missingChars.length - getQueueMax());
    if (overflow) {
      const removable = [...state.queue].filter((entry) => !preserved.has(entry.id)).sort((a, b) => a.born - b.born);
      const removedIds = new Set(removable.slice(0, overflow).map((entry) => entry.id));
      state.queue = state.queue.filter((entry) => !removedIds.has(entry.id));
      overflow -= removedIds.size;
    }
    if (overflow > 0 || !claimRunTrigger(run, triggerKey)) return null;
    choice.missingChars.forEach((char) => {
      const entry = { id: uid(), char, born: state.turn };
      state.queue.push(entry);
      state.freshQueueIds.add(entry.id);
    });
    addLog(`<strong>${relic.relicName}</strong> · 위기 보충으로 ${choice.idiom.name}의 ${choice.missingChars.join("·")} 문자를 공급`, "alchemy");
    return choice;
  }

  async function activateIdioms(elementCounts, comboCount) {
    tryEmergencyIdiomSupply();
    const activated = [];
    const usedIds = new Set();
    const usedEntriesById = new Map();
    let availableEntries = [...state.queue];
    for (const idiom of getCurrentIdioms()) {
      const selected = selectUsedEntries(idiom, availableEntries);
      if (selected.length !== idiom.chars.length) continue;
      activated.push(idiom);
      usedEntriesById.set(idiom.id, selected);
      selected.forEach((entry) => usedIds.add(entry.id));
      const selectedIds = new Set(selected.map((entry) => entry.id));
      availableEntries = availableEntries.filter((entry) => !selectedIds.has(entry.id));
    }
    for (const idiom of activated) {
      state.totalIdioms++;
      const previousIdiomId = state.lastActivatedIdiomId;
      const usedEntries = usedEntriesById.get(idiom.id) || [];
      rememberMeta("usedIdioms", idiom.id);
      rememberMeta("usedCharacters", usedEntries.map((entry) => entry.char));
      if ((state.run?.idiomUpgrades?.[idiom.id] || 0) >= 2) rememberMeta("masteredIdioms", idiom.id);
      audioDirector.playSfx("idiom-cast");
      await showAlchemy(idiom);
      const pendingPower = state.run?.pendingFlags?.nextIdiomPower || 0;
      const beforePowerTotals = {
        damage: state.turnTotals?.damage || 0,
        heal: state.turnTotals?.heal || 0,
        shield: state.turnTotals?.shield || 0
      };
      applyBaseIdiomEffect(idiom, elementCounts, comboCount, { previousIdiomId, usedEntries });
      const upgradeLevel = state.run?.idiomUpgrades?.[idiom.id] || 0;
      if (upgradeLevel > 0) {
        const ratio = upgradeLevel * .15;
        const bonusDamage = Math.round(Math.max(0, (state.turnTotals?.damage || 0) - beforePowerTotals.damage) * ratio);
        const bonusHeal = Math.round(Math.max(0, (state.turnTotals?.heal || 0) - beforePowerTotals.heal) * ratio);
        const bonusShield = Math.round(Math.max(0, (state.turnTotals?.shield || 0) - beforePowerTotals.shield) * ratio);
        if (bonusDamage) applyTrueDamage(bonusDamage, "심화 −");
        if (bonusHeal) healPlayer(bonusHeal);
        if (bonusShield) gainShield(bonusShield);
        addLog(`<strong>${idiom.name} Lv.${upgradeLevel + 1}</strong> · 심화 수치 +${Math.round(ratio * 100)}%${bonusDamage || bonusHeal || bonusShield ? ` (피해 ${bonusDamage} · 회복 ${bonusHeal} · 보호 ${bonusShield})` : ""}`, "alchemy");
      }
      if (pendingPower && state.run) {
        delete state.run.pendingFlags.nextIdiomPower;
        const bonusDamage = Math.round(Math.max(0, (state.turnTotals?.damage || 0) - beforePowerTotals.damage) * pendingPower);
        const bonusHeal = Math.round(Math.max(0, (state.turnTotals?.heal || 0) - beforePowerTotals.heal) * pendingPower);
        const bonusShield = Math.round(Math.max(0, (state.turnTotals?.shield || 0) - beforePowerTotals.shield) * pendingPower);
        if (bonusDamage) applyTrueDamage(bonusDamage, "복습 −");
        if (bonusHeal) healPlayer(bonusHeal);
        if (bonusShield) gainShield(bonusShield);
        addLog(`<strong>서당 복습</strong> · 다음 성어 수치 +${Math.round(pendingPower * 100)}%${bonusDamage || bonusHeal || bonusShield ? ` (피해 ${bonusDamage} · 회복 ${bonusHeal} · 보호 ${bonusShield})` : ""}`, "alchemy");
      }
      if (state.rareEncounter?.status === "active" && state.rareEncounter.gimmick === RARE_GIMMICKS.IDIOM_WEAKNESS) {
        const idiomDamage = Math.max(12, Math.max(0, (state.turnTotals?.damage || 0) - beforePowerTotals.damage));
        const weakness = calculateIdiomWeaknessBonus(state.rareEncounter, { baseDamage: idiomDamage, idiomId: idiom.id });
        if (weakness.matched && weakness.bonusDamage > 0) {
          const dealt = applyTrueDamage(weakness.bonusDamage, "희귀 약점 −");
          addLog(`<strong>희귀 성어 약점</strong> · ${idiom.name} 공명 추가 피해 ${dealt}`, "alchemy");
        }
      }
      applyJaryeongResonance(idiom);
      if (state.run) {
        const firstCharge = getRunRelicEffect("firstIdiomCharge");
        if (firstCharge && claimRunTrigger(state.run, encounterRelicKey("firstIdiomCharge"))) {
          partyChargeAll(firstCharge.amount || 1);
          addLog(`<strong>${firstCharge.relicName}</strong> · 이번 전투 첫 성어로 전체 자령 기운 +${firstCharge.amount || 1}`, "alchemy");
        }
        const roleChain = getRunRelicEffect("roleChainDamage");
        const previousIdiom = previousIdiomId ? ALL_IDIOMS.find((candidate) => candidate.id === previousIdiomId) : null;
        if (roleChain && previousIdiom && idiomRole(previousIdiom) !== idiomRole(idiom)) {
          applyTrueDamage(roleChain.amount || 0, "연쇄 −");
          addLog(`<strong>${roleChain.relicName}</strong> · ${idiomRole(previousIdiom)}→${idiomRole(idiom)} 역할 연쇄 피해 ${roleChain.amount || 0}`, "alchemy");
        }
        state.run.relicState ||= { triggered: {}, idiomsCast: 0 };
        state.run.relicState.triggered ||= {};
        state.run.relicState.idiomsCast = (state.run.relicState.idiomsCast || 0) + 1;
        const thirdIdiom = getRunRelicEffect("thirdIdiomDamage");
        if (thirdIdiom && state.run.relicState.idiomsCast % 3 === 0) {
          applyTrueDamage(thirdIdiom.amount || 0, "먹룡 −");
          addLog(`<strong>${thirdIdiom.relicName}</strong> · ${state.run.relicState.idiomsCast}번째 성어 고정 피해 ${thirdIdiom.amount || 0}`, "alchemy");
        }
      }
      state.lastActivatedIdiomId = idiom.id;
      addLog(`<strong>${idiom.name}</strong> 발동 · ${idiomEffectText(idiom)}`, "alchemy");
      updateVitals();
    }
    return { activated, usedIds };
  }

  function cleanQueue(usedIds) {
    state.queue = state.queue.filter((entry) => !usedIds.has(entry.id));
    if (state.queue.length > getQueueMax()) state.queue = state.queue.slice(-getQueueMax());
  }

  async function showAlchemy(idiom) {
    const overlay = $("#alchemy-overlay");
    const anchor = $("#combat-notification-anchor");
    const timing = getIdiomCastTiming(state.idiomSpeed, state.mode);
    const centered = state.idiomSpeed === "slow";
    // An idiom cast is the next, richer combat notification; do not stack a
    // fading combo card above it in the shared upper-right anchor.
    const feedback = $("#battle-feedback");
    if (feedback?.classList.contains("show")) {
      window.clearTimeout(battleFeedbackTimer);
      feedback.classList.remove("show");
    }
    if (centered && overlay?.parentElement !== document.body) document.body.appendChild(overlay);
    document.body.classList.toggle("alchemy-scene-active", centered);
    try {
      $("#alchemy-glyphs").innerHTML = idiom.chars.map((char, i) => `<span style="animation-delay:${i * timing.glyphStaggerMs}ms">${char}</span>`).join("");
      $("#alchemy-name").textContent = idiom.name;
      $("#alchemy-reading").textContent = `${idiom.sourceHanja} · ${idiom.pronunciation || idiom.name}`;
      $("#alchemy-effect").textContent = idiomEffectText(idiom);
      overlay.style.setProperty("--alchemy-duration", `${timing.animationMs}ms`);
      overlay.classList.remove("show"); void overlay.offsetWidth; overlay.classList.add("show");
      await wait(timing.holdMs);
    } finally {
      overlay?.classList.remove("show");
      document.body.classList.remove("alchemy-scene-active");
      if (centered && anchor && overlay?.parentElement === document.body) anchor.appendChild(overlay);
    }
  }

  function applyJaryeongResonance(idiom) {
    if (state.mode !== "roguelike" || !state.run) return 0;
    const participants = getPartyJaryeongs().filter((jaryeong) => idiom.chars.includes(jaryeong.hanja));
    if (!participants.length) return 0;
    participants.forEach((jaryeong) => chargeJaryeong(jaryeong.id, participants.length >= 4 ? 2 : 1));
    const complete = participants.length >= 4;
    const bonusDamage = complete ? 36 : participants.length * 9;
    applyTrueDamage(bonusDamage, "공명 −");
    if (complete) {
      gainShield(12);
      addLog(`<strong>${idiom.name} 완전 공명</strong> · 자령 전원 게이지 충전 · 보호막 12`, "alchemy");
    } else {
      addLog(`<strong>${idiom.name} 공명</strong> · ${participants.map((jaryeong) => jaryeong.hanja).join("·")} 자령 · 추가 피해 ${bonusDamage}`, "alchemy");
    }
    return participants.length;
  }

  function boardElementCounts() {
    return state.board.flat().reduce((counts, tile) => {
      counts[tile.element] = (counts[tile.element] || 0) + 1;
      return counts;
    }, {});
  }

  function shuffleBoardSafely() {
    const tiles = state.board.flat();
    for (let attempt = 0; attempt < 20; attempt++) {
      const mixed = shuffled(tiles);
      state.board = Array.from({ length: ROWS }, (_, row) => mixed.slice(row * COLS, (row + 1) * COLS));
      if (!findMatches().matched.size) {
        renderBoard({ falling: true });
        return;
      }
    }
    state.board = createBoard();
    renderBoard({ falling: true });
  }

  function convertBoardElements(from, to, count) {
    const cells = [];
    for (let row = 0; row < ROWS; row++) for (let col = 0; col < COLS; col++) {
      if (state.board[row][col].element === from) cells.push([row, col]);
    }
    shuffled(cells).slice(0, count).forEach(([row, col]) => {
      const element = ELEMENTS.find((candidate) => candidate.id === to) || ELEMENTS[0];
      state.board[row][col].element = element.id;
      state.board[row][col].symbol = element.symbol;
    });
    renderBoard();
  }

  function addBoardElementTiles(elementId, count) {
    const element = ELEMENTS.find((candidate) => candidate.id === elementId);
    if (!element) return;
    const cells = [];
    for (let row = 0; row < ROWS; row++) for (let col = 0; col < COLS; col++) cells.push([row, col]);
    shuffled(cells).slice(0, count).forEach(([row, col]) => {
      state.board[row][col].element = element.id;
      state.board[row][col].symbol = element.symbol;
    });
    renderBoard();
  }

  function discardUnneededQueue(limit = 4) {
    const needed = new Set(getCurrentIdioms().flatMap((candidate) => candidate.chars));
    const discard = [];
    const keep = [];
    state.queue.forEach((entry) => {
      if (!needed.has(entry.char) && discard.length < limit) discard.push(entry);
      else keep.push(entry);
    });
    state.queue = keep;
    return discard;
  }

  function applyBaseIdiomEffect(idiom, elementCounts, comboCount, options = {}) {
    const id = idiom.effectId || idiom.id;
    const usedChars = (options.usedEntries || []).map((entry) => entry.char);
    const previousIdiom = options.previousIdiomId ? ALL_IDIOMS.find((candidate) => candidate.id === options.previousIdiomId) : null;
    if (id === "oneMind") {
      const duplicateTypes = Object.values(countChars(state.queue)).filter((count) => count >= 2).length;
      gainShield(8 + duplicateTypes * 3);
      if (duplicateTypes >= 2) partyChargeAll(1);
      return;
    }
    if (id === "resetMind") {
      const removed = state.weakened ? 1 : 0;
      state.weakened = false;
      state.weakenedTurns = 0;
      healPlayer(removed ? 12 : 18);
      if (removed) state.nextMoveBonus += .75;
      return;
    }
    if (id === "leafSignal") {
      state.delayed = Math.max(state.delayed, 1);
      state.nextWeaknessDamageBonus = Math.max(state.nextWeaknessDamageBonus || 0, .25);
      return;
    }
    if (id === "oneWordGold") {
      const returned = returnQueueCharacters(usedChars, 1);
      getPartyJaryeongs().filter((jaryeong) => returned && usedChars.includes(jaryeong.hanja)).forEach((jaryeong) => chargeJaryeong(jaryeong.id, 2));
      return;
    }
    if (id === "singlePurpose") {
      const entries = Object.entries(state.lastTurnElementDamage || {}).sort((a, b) => b[1] - a[1]);
      if (!entries.length) { applyTrueDamage(16, "성어 −"); return; }
      const [element, amount] = entries[0];
      const ratio = entries.length === 1 ? 1.2 : .7;
      applyDamage(Math.round(amount * ratio), "집중 −", { element });
      getPartyJaryeongs().filter((jaryeong) => jaryeong.element === element).forEach((jaryeong) => chargeJaryeong(jaryeong.id, 1));
      return;
    }
    if (id === "twoBirds") {
      const snapshot = { ...state.turnTotals };
      const echoDamage = Math.round((snapshot.damage || 0) * .5);
      const echoHeal = Math.round((snapshot.heal || 0) * .5);
      const echoShield = Math.round((snapshot.shield || 0) * .5);
      const echoBurn = snapshot.burn ? Math.max(1, Math.round(snapshot.burn * .5)) : 0;
      const dealt = echoDamage ? applyTrueDamage(echoDamage, "메아리 −") : 0;
      const healed = echoHeal ? healPlayer(echoHeal) : 0;
      const shielded = echoShield ? gainShield(echoShield) : 0;
      if (echoBurn) { addEnemyBurn(echoBurn); recordTurnTotal("burn", echoBurn); }
      const echoed = [dealt ? `추가 피해 ${dealt}` : "", healed ? `추가 회복 ${healed}` : "", shielded ? `추가 보호막 ${shielded}` : "", echoBurn ? `추가 화상 ${echoBurn}` : ""].filter(Boolean);
      addLog(`<strong>일석이조 메아리</strong> · ${echoed.length ? echoed.join(" · ") : "이번 턴에 복제할 수치가 없었습니다"}`, "alchemy");
      return;
    }
    if (id === "prepared") {
      state.prepared = true;
      gainShield(24);
      return;
    }
    if (id === "crowd") {
      const amount = Math.min(40, state.queue.length * 3 + getPartyJaryeongs().length * 4);
      applyTrueDamage(amount, "군중 −");
      if (state.queue.length >= 8) gainShield(8);
      return;
    }
    if (id === "lateBloom") {
      applyTrueDamage(Math.min(40, 10 + state.turn * 3), "개화 −");
      if (state.turn >= 7) gainShield(12);
      return;
    }
    if (id === "moderation") {
      if (comboCount >= 3 && comboCount <= 5) { applyTrueDamage(24, "중용 −"); gainShield(12); }
      else if (comboCount <= 2) { applyTrueDamage(18, "중용 −"); gainShield(8); }
      else applyTrueDamage(30, "중용 −");
      return;
    }
    if (id === "swapView") {
      if (state.weakened) { state.weakened = false; state.weakenedTurns = 0; }
      else { state.nextEnemyDamageReduction = Math.max(state.nextEnemyDamageReduction || 0, .3); state.nextPlayerDamageBonus = Math.max(state.nextPlayerDamageBonus || 0, .15); }
      state.enemyVulnerableTurns = Math.max(state.enemyVulnerableTurns, 2);
      state.enemyVulnerableRatio = Math.max(state.enemyVulnerableRatio || 0, .2);
      return;
    }
    if (id === "manyVoices") {
      const activeCount = Object.values(elementCounts).filter((count) => count > 0).length;
      const damage = activeCount * 7;
      applyTrueDamage(damage, "합창 −");
      if (activeCount >= 3) partyChargeAll(1);
      if (activeCount >= 5) applyTrueDamage(damage, "합창 −");
      return;
    }
    if (id === "heartShare") {
      const party = getPartyJaryeongs();
      if (!party.length) { healPlayer(10); gainShield(10); return; }
      const highest = Math.max(...party.map((jaryeong) => state.run.skillCharges?.[jaryeong.id] || 0));
      party.forEach((jaryeong) => chargeJaryeong(jaryeong.id, Math.max(0, highest - 1 - (state.run.skillCharges?.[jaryeong.id] || 0))));
      return;
    }
    if (id === "thousandLi") {
      state.nextMoveBonus += 1.25;
      if (comboCount >= 5) state.delayed = Math.max(state.delayed, 1);
      return;
    }
    if (id === "dailyAccumulation") {
      state.idiomGrowthStacks = Math.min(5, (state.idiomGrowthStacks || 0) + 1);
      gainShield(8);
      return;
    }
    if (id === "smallToMany") {
      const groups = (state.lastMatchGroupSizes || []).filter((size) => size === 3);
      if (!groups.length) applyTrueDamage(18, "적소성다 −");
      groups.forEach(() => { applyTrueDamage(6, "적소성다 −"); gainShield(2); });
      if (groups.length >= 4) returnQueueCharacters(usedChars, 1);
      return;
    }
    if (id === "mostlySame") {
      const ranked = Object.entries(boardElementCounts()).sort((a, b) => b[1] - a[1]);
      if (ranked.length >= 2) convertBoardElements(ranked[1][0], ranked[0][0], 3);
      return;
    }
    if (id === "discardUseless") {
      const discarded = discardUnneededQueue(4);
      if (!discarded.length) applyTrueDamage(20, "정리 −");
      discarded.forEach(() => { applyTrueDamage(6, "정리 −"); gainShield(2); });
      return;
    }
    if (id === "silence") {
      state.enemySilenced = Math.max(state.enemySilenced, 1);
      state.nextEnemyDamageReduction = Math.max(state.nextEnemyDamageReduction || 0, .25);
      return;
    }
    if (id === "oneCharGold") {
      const returned = returnQueueCharacters(usedChars, 1);
      const char = usedChars[0];
      getPartyJaryeongs().filter((jaryeong) => returned && jaryeong.hanja === char).forEach((jaryeong) => chargeJaryeong(jaryeong.id, 2));
      if (returned) applyTrueDamage(12, "일자천금 −");
      return;
    }
    if (id === "impermanence") {
      shuffleBoardSafely();
      resetQueueAges();
      cleansePlayerStatuses();
      healPlayer(10);
      return;
    }
    if (id === "fairAndSquare") {
      applyTrueDamage(26, "공정 −");
      state.weakened = false;
      state.weakenedTurns = 0;
      gainShield(8);
      return;
    }
    if (id === "autumnHarvest") {
      healPlayer(14);
      state.nextMoveBonus += .75;
      state.nextChargeBonus = Math.max(state.nextChargeBonus || 0, 1);
      return;
    }
    if (id === "untieKnot") {
      const removed = (state.weakened ? 1 : 0) + (state.lockedTiles?.size || 0);
      cleansePlayerStatuses();
      resetQueueAges();
      applyTrueDamage(Math.max(20, removed * 8), "해결 −");
      return;
    }
    if (id === "learnFromOld") {
      if (!options.allowCopy && options.allowCopy !== undefined) { applyTrueDamage(22, "온고 −"); return; }
      if (previousIdiom && previousIdiom.id !== id) applyBaseIdiomEffect(previousIdiom, elementCounts, comboCount, { allowCopy: false });
      else applyTrueDamage(22, "온고 −");
      return;
    }
    if (id === "fortune") {
      const removed = cleansePlayerStatuses();
      healPlayer(removed ? Math.min(34, 18 + removed * 8) : 10);
      gainShield(removed ? 8 : 4);
      return;
    }
    if (id === "confusedRush") {
      const ranked = Object.entries(boardElementCounts()).sort((a, b) => a[1] - b[1]);
      shuffleBoardSafely();
      ranked.slice(0, 2).forEach(([element]) => addBoardElementTiles(element, 2));
      state.nextMoveBonus += 2;
      state.delayed = Math.max(state.delayed, 1);
      return;
    }
    if (id === "ownDoing") {
      state.reflectNextEnemyAttack = { damageReduction: .5, ratio: 1 };
      return;
    }
    if (id === "surrounded") {
      if (state.playerHp <= 40 || state.shield <= 0) { applyTrueDamage(45, "초가 −"); gainShield(15); state.delayed = Math.max(state.delayed, 1); }
      else applyTrueDamage(30, "초가 −");
      return;
    }
    if (id === "sureHit") {
      const best = Object.entries(state.lastTurnElementDamage || {}).sort((a, b) => b[1] - a[1])[0];
      if (!best) { applyTrueDamage(38, "백발 −"); return; }
      applyTrueDamage(Math.round(best[1] * 1.75), "백발 −");
      getPartyJaryeongs().filter((jaryeong) => jaryeong.element === best[0]).forEach((jaryeong) => chargeJaryeong(jaryeong.id, 1));
      return;
    }
    const ops = idiom.effectSpec?.ops || [{ type: "dealDamage", amount: idiom.tier === "희귀" ? 30 : idiom.tier === "중급" ? 22 : 16 }];
    ops.forEach((op) => {
      const amount = Math.round(op.amount || 0);
      if (op.type === "dealDamage") applyTrueDamage(amount, "성어 −");
      else if (op.type === "gainShield") gainShield(amount);
      else if (op.type === "heal") healPlayer(amount);
      else if (op.type === "delay") state.delayed = Math.min(RUN_LIMITS.maxDelay, state.delayed + (op.turns || 1));
      else if (op.type === "chargeParty") partyChargeAll(op.amount || 1);
      else if (op.type === "returnQueueChar") returnQueueCharacters(usedChars, op.count || 1);
      else if (op.type === "draw") returnQueueCharacters(usedChars, op.count || 1);
      else if (op.type === "gainInk" && state.run) state.run.ink += op.amount || 0;
    });
  }

  async function applyEnemyIntentEffect(intent, silenced = false, context = {}) {
    const effect = intent?.effect;
    if (!effect) return silenced ? " · 부가효과 봉인" : "";
    if (silenced) return " · 부가효과 봉인";
    switch (effect.type) {
      case "weaken":
        audioDirector.playSfx("debuff");
        state.weakened = true;
        state.weakenedTurns = Math.max(state.weakenedTurns || 0, effect.turns || 1);
        if (effect.healReduction) {
          state.healReductionTurns = Math.max(state.healReductionTurns, effect.turns || 1);
          state.healReductionRatio = Math.max(state.healReductionRatio || 0, effect.healReduction);
        }
        return effect.healReduction ? " · 회복 약화" : " · 기력 약화";
      case "lockTiles":
        await lockRandomTiles(effect.count || 2, effect.durationTurns || effect.turns || 1, effect.visual || "seal");
        if (effect.healAmount) state.enemyHp = Math.min(currentEnemy().hp, state.enemyHp + effect.healAmount);
        return ` · ${effect.visual === "vine" ? "덩굴로" : effect.visual === "magma-chain" ? "용암 사슬로" : effect.visual === "seaweed-net" ? "해조 그물로" : "술식으로"} 타일 ${effect.count || 2}개 ${effect.durationTurns || effect.turns || 1}턴 봉인`;
      case "healEnemy":
        state.enemyHp = Math.min(currentEnemy().hp, state.enemyHp + (effect.amount || 0));
        return ` · 기운 ${effect.amount || 0} 회복`;
      case "healEnemyUnlessBurning":
        if (context.enemyWasBurning) return " · 화상으로 재생 차단";
        state.enemyHp = Math.min(currentEnemy().hp, state.enemyHp + (effect.amount || 0));
        return ` · 기운 ${effect.amount || 0} 회복`;
      case "gainEnemyShield":
        state.enemyShield += effect.amount || 0;
        return ` · 보호막 ${effect.amount || 0}`;
      case "gainElementBarrier": {
        const amount = Math.max(0, Number(effect.amount) || 0);
        const preferredElement = ELEMENTS.some((element) => element.id === effect.preferredElement) ? effect.preferredElement : "water";
        const breakMultiplier = Math.max(1, Number(effect.breakMultiplier) || 2);
        const current = sanitizeSoftElementBarrier(state.enemyElementBarrier);
        const shouldStack = effect.mode !== "replace" && current?.preferredElement === preferredElement && current?.breakMultiplier === breakMultiplier;
        state.enemyElementBarrier = createSoftElementBarrier({
          hp: shouldStack ? current.hp + amount : amount,
          maxHp: shouldStack ? current.maxHp + amount : amount,
          preferredElement,
          breakMultiplier
        });
        const element = getElementMeta(preferredElement);
        return ` · ${element.label} 속성 연성막 ${amount} · 모든 속성 유효 · ${element.label} 파괴력 ×${formatDefenseValue(breakMultiplier)}`;
      }
      case "removeQueueCharacters": {
        const removed = removeRandomQueueCharacters(effect.count || 1);
        if (!removed.length) return " · 문자 큐가 비어 제거 실패";
        audioDirector.playSfx("debuff");
        return ` · 문자 큐에서 ${removed.map((entry) => entry.char).join("·")} 제거`;
      }
      case "resetBoard": {
        const result = resolveBossBoardEffect(state.board, effect, createBoard);
        state.board = result.board;
        if (result.clearTileSeals) state.lockedTiles.clear();
        renderBoard({ falling: true });
        await wait(state.idiomSpeed === "slow" ? 700 : 420);
        return " · 地震海溢로 그리드 재생성";
      }
      case "damageAndBurn":
        state.playerHp = Math.max(0, state.playerHp - (effect.burn || 0));
        return ` · 추가 화상 ${effect.burn || 0}`;
      case "reduceMoveTime":
        state.enemyMovePenalty = Math.max(state.enemyMovePenalty || 0, effect.seconds || .5);
        return ` · 다음 이동시간 -${effect.seconds || .5}초`;
      case "decayQueue": {
        const oldest = [...state.queue].sort((a, b) => a.born - b.born)[0];
        if (oldest) oldest.born -= effect.turns || 1;
        return " · 오래된 문자 수명 감소";
      }
      case "burnPlayer":
        state.playerHp = Math.max(0, state.playerHp - (effect.amount || 0));
        return ` · 추가 화상 ${effect.amount || 0}`;
      default:
        return "";
    }
  }

  async function debugMultiEnemyTurn() {
    persistActiveDebugEnemyMember();
    const living = state.debugEnemyGroup.members.filter((member) => member.currentHp > 0);
    const attackers = living.filter((member) => member.attackCountdown <= 0);
    living.forEach((member) => {
      member.attackCountdown = member.attackCountdown <= 0
        ? Math.max(1, (member.attackEvery || 2) - 1)
        : member.attackCountdown - 1;
    });

    if (!attackers.length) {
      renderDebugEnemyGroup();
      showBattleFeedback("prepare", "적 무리 호흡 가다듬기", "이번 턴 체력 피해 없음 · 다음 연성 뒤 합동 공격");
      addLog(`<strong>안전 턴</strong> · ${living.length}체가 공격을 준비합니다. 이번 턴은 체력 피해가 없습니다.`, "start");
      await wait(state.battleDisplayMode === "fast" ? 120 : 240);
      updateVitals();
      return true;
    }

    showBattleFeedback("enemy", `${attackers.length}체 합동 공격`, "이번 연성 뒤 공격 · 각 적의 공격 주기는 2턴");
    attackers.forEach((member) => {
      const index = state.debugEnemyGroup.members.indexOf(member);
      const unit = $(`#debug-enemy-squad [data-debug-enemy-target="${index}"]`);
      unit?.classList.remove("attacking");
      if (unit) { void unit.offsetWidth; unit.classList.add("attacking"); }
    });
    await wait(state.battleDisplayMode === "fast" ? 190 : 340);
    let damage = attackers.reduce((sum, member) => sum + Math.max(1, Number(member.enemy.damage) || 1), 0);
    if (state.prepared) {
      damage = Math.floor(damage * .35);
      state.prepared = false;
      addLog("<strong>지피지기</strong>의 대비가 합동 공격을 크게 막았습니다.", "alchemy");
    }
    if (state.nextEnemyDamageReduction) {
      damage = Math.floor(damage * (1 - state.nextEnemyDamageReduction));
      state.nextEnemyDamageReduction = 0;
    }
    const absorbed = Math.min(state.shield, damage);
    if (absorbed) {
      state.shield -= absorbed;
      recordCombatObjectiveEvent({ type: COMBAT_OBJECTIVE_EVENT.SHIELD_CHANGED, shield: state.shield });
    }
    const hpDamage = Math.max(0, damage - absorbed);
    state.playerHp -= hpDamage;
    showPlayerHitFeedback(hpDamage, absorbed, 0);
    showBattleFeedback("enemy", `${attackers.length}체 합동 기습`, `${absorbed ? `보호막 ${absorbed} 흡수 · ` : ""}${hpDamage ? `체력 ${hpDamage} 감소` : "체력 피해 없음"} · 다음 턴은 준비`);
    addLog(`<strong>다수전 합동 공격</strong> · ${attackers.map((member) => member.enemy.name).join("·")} · ${absorbed ? `보호막 ${absorbed} 흡수 · ` : ""}${hpDamage} 피해`, "enemy");
    updateVitals();
    await wait(180);
    if (state.playerHp <= 0) await handleDefeat();
    return true;
  }

  async function enemyTurn() {
    const enemyWasBurning = state.enemyBurn > 0;
    if (state.enemyBurn > 0) {
      const burn = state.enemyBurn;
      state.enemyBurnTurns = Math.max(0, (state.enemyBurnTurns || BURN_DURATION_TURNS) - 1);
      applyDamage(burn, "화상 −", { element: "fire" });
      const burnEcho = getRunRelicEffect("burnEcho");
      const echoDamage = burnEcho ? applyTrueDamage(burnEcho.amount || 0, "불씨 −") : 0;
      addLog(`자령에게 남은 <strong>화상 ${burn}</strong>이 지속 피해를 주었습니다. · 남은 ${state.enemyBurnTurns}턴${echoDamage ? ` · ${burnEcho.relicName} 추가 피해 ${echoDamage}` : ""}`, "fire");
      showBattleFeedback("player", `화상 지속 피해 ${burn}`, state.enemyBurnTurns > 0 ? `같은 피해가 ${state.enemyBurnTurns}턴 더 이어집니다 · 예상 잔여 ${burn * state.enemyBurnTurns}` : "화상이 모두 소진되었습니다");
      if (state.enemyBurnTurns <= 0) clearEnemyBurn();
      updateVitals();
      if (state.enemyHp <= 0) {
        await nextWave();
        return false;
      }
    }
    if (state.boundEnemyIntentTurns > 0) {
      state.boundEnemyIntentTurns--;
      addLog(`<strong>쇄맥 봉인</strong> · 적의 현재 행동이 묶였습니다.`, "metal");
      updateVitals();
      return false;
    }
    if (state.delayed > 0) {
      state.delayed--;
      addLog("수의 기운이 자령 행동을 <strong>한 턴 늦췄습니다.</strong>", "water");
      updateVitals();
      return false;
    }
    if (isDebugMultiBattle()) return debugMultiEnemyTurn();
    const enemy = currentEnemy();
    const intent = currentEnemyIntent();
    const storyGuardLesson = getActiveStoryGuardLesson();
    const silenced = state.enemySilenced > 0;
    const rawDamage = storyGuardLesson
      ? storyGuardLesson.damage
      : Math.round((intent.damage || 0) * (state.enemyDamageMultiplier || 1));
    const secondaryDamage = !silenced
      ? intent.effect?.type === "damageAndBurn" ? intent.effect.burn || 0
        : intent.effect?.type === "burnPlayer" ? intent.effect.amount || 0
          : 0
      : 0;
    const damagesPlayer = rawDamage > 0 || secondaryDamage > 0;
    showBattleFeedback(
      damagesPlayer ? "enemy" : "prepare",
      damagesPlayer ? `${intent.name} 준비` : `${intent.name} · 공격하지 않음`,
      damagesPlayer ? (intent.effectText || "적이 행동을 준비합니다.") : `이번 턴 체력 피해 없음 · 다음 연성 뒤 공격에 대비하세요 · ${intent.effectText || "기운을 모읍니다."}`
    );
    const storyActionDisplay = state.mode === "puzzle" && state.storySession?.status === "active";
    const telegraphHold = storyActionDisplay
      ? (state.battleDisplayMode === "slow" ? 2100 : 1100)
      : damagesPlayer ? (state.idiomSpeed === "slow" ? 680 : 340) : (state.battleDisplayMode === "fast" ? 100 : 220);
    await wait(telegraphHold);
    setEnemyArtFrame(damagesPlayer ? (enemy.asset?.telegraph ? "telegraph" : "windup") : "idleAlt", 0);
    await wait(damagesPlayer ? 210 : 90);
    if (damagesPlayer) {
      setEnemyArtFrame("attack", 360);
      await wait(120);
    }
    let damage = rawDamage;
    let reflect = null;
    if (damagesPlayer) {
      const bossReflect = getRunRelicEffect("bossReflect");
      if (bossReflect && enemy.kind === "boss" && intent.threat === "high" && !state.reflectNextEnemyAttack && claimRunTrigger(state.run, "run:bossReflect")) {
        state.reflectNextEnemyAttack = { ratio: bossReflect.ratio || 0, damageReduction: 0, label: bossReflect.relicName };
        addLog(`<strong>${bossReflect.relicName}</strong> · 보스의 강공격 ${Math.round((bossReflect.ratio || 0) * 100)}% 반사`, "alchemy");
      }
      if (state.prepared) {
        damage = Math.floor(damage * .35);
        state.prepared = false;
        const preparedIdiom = IDIOMS.find((idiom) => idiom.id === "prepared");
        addLog(`<strong>${preparedIdiom?.name || "지피지기"}</strong>의 대비가 공격을 크게 막았습니다.`, "alchemy");
      }
      const guarded = getRunRelicEffect("guardedDamageReduction");
      if (guarded && state.shield >= 20) damage = Math.floor(damage * (1 - (guarded.ratio || 0)));
      if (state.nextEnemyDamageReduction) {
        damage = Math.floor(damage * (1 - state.nextEnemyDamageReduction));
        state.nextEnemyDamageReduction = 0;
      }
      reflect = state.reflectNextEnemyAttack;
      state.reflectNextEnemyAttack = null;
      if (reflect?.damageReduction) damage = Math.floor(damage * (1 - reflect.damageReduction));
    }
    const piercesShield = damagesPlayer && intent.effect?.type === "pierce" && !silenced;
    const absorbed = damagesPlayer && !piercesShield ? Math.min(state.shield, damage) : 0;
    if (absorbed) {
      state.shield -= absorbed;
      recordCombatObjectiveEvent({ type: COMBAT_OBJECTIVE_EVENT.SHIELD_CHANGED, shield: state.shield });
    }
    damage -= absorbed;
    if (state.damageSplitHits > 0 && damage > 0) {
      const deferred = Math.max(1, Math.floor(damage * (state.damageSplitRatio || 0)));
      damage = Math.max(0, damage - deferred);
      state.deferredDamage += deferred;
      state.deferredDamageTicks = Math.max(state.deferredDamageTicks || 0, 3);
      state.damageSplitHits--;
      addLog(`<strong>협곡 분류</strong> · 체력 피해 ${deferred}을 3턴에 나누어 받습니다.`, "earth");
    }
    const hpDamage = Math.max(0, damage);
    state.playerHp -= hpDamage;
    const effectSuffix = await applyEnemyIntentEffect(intent, silenced, { enemyWasBurning });
    if (hpDamage > 0 || absorbed > 0 || secondaryDamage > 0) showPlayerHitFeedback(hpDamage, absorbed, secondaryDamage);
    const enemyOutcome = [];
    if (absorbed) enemyOutcome.push(`보호막이 ${absorbed} 막음`);
    enemyOutcome.push(hpDamage > 0 ? `체력 ${hpDamage} 감소` : "체력 피해 없음");
    const secondaryEffect = !silenced ? intent.effectText?.split(" · ").slice(1).join(" · ") : "부가효과 봉인";
    if (secondaryEffect) enemyOutcome.push(secondaryEffect);
    showBattleFeedback(damagesPlayer ? "enemy" : "prepare", intent.name, enemyOutcome.join(" · "));
    if (reflect) {
      const reflectedDamage = Math.round(rawDamage * (reflect.ratio || 1));
      applyDamage(reflectedDamage, "반사 −", { ignoreVulnerability: true, ignoreShield: true, element: reflect.element });
      addLog(`<strong>${reflect.label || "자업자득"}</strong> · 적 공격 ${reflectedDamage}를 반사했습니다.`, "alchemy");
    }
    addLog(`${enemy.name}의 ${intent.name} · ${absorbed ? `보호막 ${absorbed} 흡수 · ` : ""}<strong>${hpDamage > 0 || secondaryDamage > 0 ? `${hpDamage + secondaryDamage} 피해` : "체력 피해 없음"}</strong>${effectSuffix}`, "enemy");
    advanceEnemyPlan();
    updateVitals();
    await wait(storyActionDisplay ? (state.battleDisplayMode === "slow" ? 1350 : 720) : 220);
    const storyGuardEvent = storyGuardLesson
      ? evaluateStoryTrainingGuardHit({
        chapterId: state.storySession?.chapterId,
        intentId: intent.id,
        absorbed,
        hpDamage
      })
      : null;
    if (storyGuardEvent?.count) {
      await wait(state.idiomSpeed === "slow" ? 700 : 360);
    }
    if (finishStoryTrainingGuardHit(intent, absorbed, hpDamage, storyGuardEvent)) {
      return true;
    }
    if (state.playerHp <= 0) {
      await handleDefeat();
      return true;
    }
    if (state.enemyHp <= 0) {
      await nextWave();
      return true;
    }
    return true;
  }

  function createRoguelikeRun() {
    const seed = `SAJA-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${Math.floor(randomFrom(state.sessionRng) * 0xffffff).toString(36).toUpperCase().padStart(5, "0")}`;
    const rng = createSeededRng(seed);
    const volumeIndex = clamp(Number(metaProgress.selectedVolumeIndex) || 0, 0, CHARACTER_VOLUMES.length - 1);
    const volume = CHARACTER_VOLUMES[volumeIndex] || CHARACTER_VOLUMES[0];
    metaProgress.jaryeongMeta = resetTargetFragmentPity(metaProgress.jaryeongMeta);
    const preparedParty = getPreparedJaryeongParty(metaProgress.jaryeongMeta);
    metaProgress.jaryeongMeta = preparedParty.state;
    const partyJaryeongIds = preparedParty.partyIds;
    const run = {
      seed,
      rng,
      startedAt: Date.now(),
      route: createRunRoute(rng, RUN_CONTENT),
      routeIndex: 0,
      currentNodeId: null,
      currentEncounterId: null,
      currentEventId: null,
      act: 1,
      combatsWon: 0,
      ink: 0,
      characterVolumeIndex: volumeIndex,
      characterPool: [],
      battleIndex: 0,
      leaderJaryeongId: partyJaryeongIds[0] || null,
      partyJaryeongIds: [...partyJaryeongIds],
      jaryeongLevels: Object.fromEntries(partyJaryeongIds.map((id) => [id, metaProgress.jaryeongMeta.owned?.[id]?.level || 1])),
      jaryeongAwakenings: Object.fromEntries(partyJaryeongIds.map((id) => [id, metaProgress.jaryeongMeta.owned?.[id]?.awakening || 0])),
      skillCharges: Object.fromEntries(partyJaryeongIds.map((id) => [id, 0])),
      jaryeongDraftChoices: [],
      draftStep: 0,
      activeIdiomIds: [],
      idiomBookIds: [],
      idiomUpgrades: {},
      relicIds: [],
      relicState: { triggered: {}, idiomsCast: 0 },
      consumables: {},
      elementAffinity: {},
      focusBuildElement: null,
      focusBuildStacks: 0,
      leaderDelayUsed: false,
      moveSeconds: MOVE_SECONDS,
      queueMax: MAX_QUEUE,
      queueLife: 3,
      rewardChoices: [],
      pendingReward: false,
      pendingContractJaryeongId: null,
      pendingIdiomReplacementId: null,
      encounteredJaryeongIds: [],
      contractFragments: [],
      rewardHistory: [],
      rewardRerolls: Math.min(1, Number(metaProgress.rewardRerolls) || 0),
      maxHp: BASE_PLAYER_HP + Math.min(10, Number(metaProgress.maxHpBonus) || 0),
      pendingFlags: {},
      completedNodeIds: [],
      rareCandidatesSeen: 0,
      rareEncounterSeen: false,
      rareEncountersDefeated: 0,
      rareEncountersEscaped: 0
    };
    run.characterPool = buildRunCharacterPool({ volume, fallbackCharacters: CHARACTER_POOL, rng, targetSize: 125 });
    return run;
  }

  function renderRunCurrencyHud() {
    const wallet = $("#run-currency-hud");
    if (!wallet) return;
    const active = state.mode === "roguelike" && Boolean(state.run);
    wallet.hidden = !active;
    if (!active) return;
    const ink = Math.max(0, Number(state.run.ink) || 0);
    const value = $("#run-currency-value");
    if (value) value.textContent = String(ink);
    const description = `이번 행로에서만 쓰는 먹 ${ink}. 사건·회복·특별 선택의 비용이며 새 행로를 시작하면 초기화됩니다.`;
    wallet.setAttribute("aria-label", description);
    wallet.title = description;
  }

  function updateRoguelikeHud() {
    renderRunCurrencyHud();
    const progress = $("#roguelike-progress");
    const build = $("#roguelike-build");
    if (!progress || !build) return;
    const run = state.run;
    const sceneAct = clamp(run?.act || 1, 1, 3);
    const activeNode = run ? currentRouteTier()?.choices.find((candidate) => candidate.id === run.currentNodeId) : null;
    const sceneKey = `act${sceneAct}${activeNode?.type === "boss" ? "Boss" : ""}`;
    const backgroundSelectionKey = run ? `${sceneKey}:${run.battleIndex || 0}:${run.routeIndex || 0}` : sceneKey;
    if (run && run.currentBackgroundKey !== backgroundSelectionKey) {
      run.currentBackgroundPath = selectBackgroundForScene({
        pools: ASSET_MANIFEST.backgroundPools || ASSET_MANIFEST.backgrounds,
        sceneKey,
        runSeed: run.seed,
        battleIndex: run.battleIndex,
        nodeIndex: run.routeIndex,
        previousBackground: run.currentBackgroundPath,
        fallback: ASSET_MANIFEST.backgrounds[`act${sceneAct}`]
      });
      run.currentBackgroundKey = backgroundSelectionKey;
    }
    const backgroundPath = run?.currentBackgroundPath || ASSET_MANIFEST.backgrounds[`act${sceneAct}`];
    document.body.style.setProperty("--rogue-scene", `url("${backgroundPath}")`);
    document.body.dataset.rogueAct = String(sceneAct);
    const node = run ? clamp((run.routeIndex || 0) + 1, 1, 15) : 1;
    progress.textContent = `제${run?.act || 1}막 · 노드 ${node} / 15`;
    if (!run) {
      build.textContent = "문자권과 성어를 고르고 3막의 행로를 완주하세요";
      renderJaryeongPanel();
      syncCombatHud();
      return;
    }
    const idioms = run.idiomBookIds.length;
    const relics = run.relicIds.length;
    const party = run.partyJaryeongIds?.length || 0;
    const leader = getLeaderJaryeong();
    const stoneBreaks = run.consumables?.["stone-break"] || 0;
    const focusLabel = run.focusBuildStacks ? ` · 집중 ${ELEMENT_RULES[run.focusBuildElement]?.label || "목"}+${run.focusBuildStacks}` : "";
    build.textContent = `리더 ${leader?.name || "-"} · 자령 ${party}/5 · 성어 ${idioms}/${RUN_LIMITS.idiomBookMax} · 유물 ${relics} · 먹 ${run.ink || 0} · 부적 조각 ${metaProgress.jaryeongMeta?.talismanPieces || 0} · 소환권 ${metaProgress.jaryeongMeta?.summonTickets || 0}${stoneBreaks ? ` · 석파 ${stoneBreaks}` : ""}${focusLabel}`;
    renderJaryeongPanel();
    syncCombatHud();
  }

  function prepareRoguelikeRun() {
    state.run = createRoguelikeRun();
    resetGame();
    state.mode = "roguelike";
    state.playerHp = state.run.maxHp;
    state.shield = Math.min(5, Number(metaProgress.startShieldBonus) || 0);
    updateRoguelikeHud();
  }

  function beginRoguelikeRun() {
    if (state.mode !== "roguelike") return;
    setStoryGraduationBannerVisible(false);
    clearActiveRunSave({ sync: false });
    $("#roguelike-intro-modal").classList.remove("open");
    $("#roguelike-result-modal").classList.remove("open");
    prepareRoguelikeRun();
    rememberMeta("seenJaryeongs", state.run.partyJaryeongIds);
    saveMetaProgress();
    openRoguelikeDraft();
  }

  function renderVolumeOptions() {
    const wrap = $("#volume-options");
    if (!wrap) return;
    const selectedIndex = clamp(Number(metaProgress.selectedVolumeIndex) || 0, 0, CHARACTER_VOLUMES.length - 1);
    wrap.innerHTML = CHARACTER_VOLUMES.map((volume, index) => `<button type="button" class="volume-option${index === selectedIndex ? " selected" : ""}" data-volume-index="${index}" aria-pressed="${index === selectedIndex}"><b>${index + 1}</b><span>${volume.label}</span><small>${volume.chars.length}자</small></button>`).join("");
    const volume = CHARACTER_VOLUMES[selectedIndex];
    $("#volume-summary").textContent = `${volume.label} · ${volume.chars.length}자`;
  }

  function chooseCharacterVolume(index) {
    const nextIndex = clamp(Number(index) || 0, 0, CHARACTER_VOLUMES.length - 1);
    metaProgress.selectedVolumeIndex = nextIndex;
    saveMetaProgress();
    renderVolumeOptions();
    audioDirector.playSfx("ui-confirm");
  }

  let codexTab = "characters";

  function metaRankFor(kind, id) {
    const mastered = new Set(metaProgress[`mastered${kind}`] || []);
    const used = new Set(metaProgress[`used${kind}`] || []);
    const seen = new Set(metaProgress[`seen${kind}`] || []);
    if (mastered.has(id)) return { rank: "mastered", label: "숙련" };
    if (used.has(id)) return { rank: "used", label: "사용" };
    if (seen.has(id)) return { rank: "seen", label: "발견" };
    return { rank: "unknown", label: "미발견" };
  }

  function renderCodexControls() {
    const select = $("#codex-volume");
    if (!select) return;
    const previous = select.value || String(metaProgress.selectedVolumeIndex || 0);
    select.innerHTML = CHARACTER_VOLUMES.map((volume, index) => `<option value="${index}">${volume.label} · ${volume.chars.length}자</option>`).join("");
    select.value = CHARACTER_VOLUMES[Number(previous)] ? previous : String(metaProgress.selectedVolumeIndex || 0);
    select.hidden = codexTab !== "characters";
    document.querySelectorAll("[data-codex-tab]").forEach((button) => button.classList.toggle("active", button.dataset.codexTab === codexTab));
  }

  function renderCodex() {
    const grid = $("#codex-grid");
    if (!grid) return;
    renderCodexControls();
    const query = ($("#codex-search")?.value || "").trim().toLowerCase();
    if (codexTab === "characters") {
      const volumeIndex = clamp(Number($("#codex-volume")?.value) || 0, 0, CHARACTER_VOLUMES.length - 1);
      const rows = query ? DATASET_CHARACTERS : CHARACTER_VOLUMES[volumeIndex].rows;
      const filtered = rows.filter((entry) => `${entry.hanja} ${entry.hunEum || ""} ${entry.reading || ""}`.toLowerCase().includes(query)).slice(0, query ? 240 : 140);
      grid.className = "codex-grid character-grid";
      grid.innerHTML = filtered.map((entry) => {
        const status = metaRankFor("Characters", entry.hanja);
        return `<article class="codex-character ${status.rank}"><span>${entry.hanja}</span><strong>${entry.hunEum || entry.reading}</strong><small>${status.label} · ${entry.status === "auto-supplemented" ? "사전 보충" : "검수"}</small></article>`;
      }).join("");
      $("#codex-stats").textContent = `문자권 ${volumeIndex + 1}/10 · 표시 ${filtered.length}자 · 전체 1,135자 · 발견 ${metaProgress.seenCharacters.length}`;
      return;
    }
    if (codexTab === "idioms") {
      const filtered = ALL_IDIOMS.filter((idiom) => `${idiom.sourceHanja} ${idiom.name} ${idiom.reading} ${idiom.category}`.toLowerCase().includes(query));
      grid.className = "codex-grid idiom-grid";
      grid.innerHTML = filtered.map((idiom) => {
        const status = metaRankFor("Idioms", idiom.id);
        return `<article class="codex-idiom ${status.rank}"><div>${idiom.chars.map((char) => `<b>${char}</b>`).join("")}</div><strong>${idiom.name}</strong><p>${idiom.reading}</p><small>${status.label} · ${idiom.role}</small></article>`;
      }).join("");
      $("#codex-stats").textContent = `성어 75종 · 발견 ${metaProgress.seenIdioms.length} · 사용 ${metaProgress.usedIdioms.length} · 숙련 ${metaProgress.masteredIdioms.length}`;
      return;
    }
    const filtered = JARYEONG_LIBRARY.filter((jaryeong) => `${jaryeong.hanja} ${jaryeong.name} ${jaryeong.reading} ${jaryeong.meaning}`.toLowerCase().includes(query));
    grid.className = "codex-grid jaryeong-grid";
    grid.innerHTML = filtered.map((jaryeong) => {
      const status = metaRankFor("Jaryeongs", jaryeong.id);
      return `<article class="codex-jaryeong ${status.rank}"><div class="codex-jaryeong-art ${jaryeong.element}">${tamedSpriteMarkup(jaryeong, { alt: jaryeong.name })}</div><strong>${jaryeong.name}</strong><p>${jaryeong.reading} · ${jaryeong.meaning}</p><small>${status.label} · ${jaryeong.skillName}</small></article>`;
    }).join("");
    $("#codex-stats").textContent = `자령 ${JARYEONG_LIBRARY.length}종 · 발견 ${metaProgress.seenJaryeongs.length}`;
  }

  function openCodex() {
    codexTab = "characters";
    $("#codex-search").value = "";
    renderCodex();
    $("#codex-modal").inert = false;
    $("#codex-modal").classList.add("open");
    $("#codex-search").focus({ preventScroll: true });
  }

  function closeCodex() { $("#codex-modal").classList.remove("open"); }

  function selectCodexTab(tab) {
    if (!["characters", "idioms", "jaryeongs"].includes(tab)) return;
    codexTab = tab;
    renderCodex();
  }

  const JARYEONG_RARITY_LABELS = Object.freeze({ common: "일반", uncommon: "고급", rare: "희귀", legendary: "전설" });
  let jaryeongMetaView = "collection";
  let jaryeongMetaElement = "all";
  let jaryeongMetaSelectedId = "wood-mok";
  let jaryeongPartyDraft = [];
  let jaryeongPartySlot = 0;

  function metaJaryeongState() {
    metaProgress.jaryeongMeta = sanitizeJaryeongMetaState(metaProgress.jaryeongMeta);
    return metaProgress.jaryeongMeta;
  }

  function restoreMetaFocus(selector) {
    window.requestAnimationFrame(() => [...document.querySelectorAll(selector)].find((node) => node.offsetParent !== null)?.focus());
  }

  function renderPreparedParty(partyOverride = null) {
    const prepared = getPreparedJaryeongParty(metaProgress.jaryeongMeta);
    metaProgress.jaryeongMeta = prepared.state;
    const hasSavedPartyOverride = Array.isArray(partyOverride);
    const partyIds = hasSavedPartyOverride ? partyOverride.slice(0, 5) : prepared.partyIds;
    const wrap = $("#meta-prep-party");
    if (wrap) wrap.innerHTML = partyIds.map((id, index) => {
      const jaryeong = getJaryeong(id);
      return `<article class="meta-prep-slot ${jaryeong?.element || ""}"><small>${index === 0 ? "리더" : `${index + 1}`}</small><div>${tamedSpriteMarkup(jaryeong, { alt: `${jaryeong?.name || "자령"} 출전` })}</div><strong>${escapeHtml(jaryeong?.name || id)}</strong></article>`;
    }).join("");
    if ($("#prep-party-title")) $("#prep-party-title").textContent = hasSavedPartyOverride
      ? partyIds.length ? `저장된 출전 자령 ${partyIds.length}명` : "저장 런 · 리더 선택 전"
      : "출전 자령 5명";
    const count = Object.keys(prepared.state.owned || {}).length;
    if ($("#prep-owned-count")) $("#prep-owned-count").textContent = `${count}종`;
  }

  function setJaryeongMetaView(view) {
    if (!["collection", "party", "summon"].includes(view)) return;
    jaryeongMetaView = view;
    const card = $("#jaryeong-meta-modal .jaryeong-meta-card");
    if (card) card.dataset.metaView = view;
    document.querySelectorAll("[data-jaryeong-meta-view]").forEach((button) => {
      const active = button.dataset.jaryeongMetaView === view;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
      button.tabIndex = active ? 0 : -1;
    });
    document.querySelectorAll(".meta-view-panel").forEach((panel) => { panel.hidden = panel.id !== `jaryeong-panel-${view}`; });
    const titles = { collection: ["자령 도감", "보유 자령과 통합 부적 조각·소환권을 확인합니다."], party: ["출전 편성", "런 전에 다섯 자령과 리더를 정합니다."], summon: ["부적 소환", "조각 10개를 소환권으로 바꾸고, 봉인된 부적에서 무작위 자령을 만납니다."] };
    $("#jaryeong-meta-title").textContent = titles[view][0];
    $("#jaryeong-meta-summary").textContent = titles[view][1];
    renderJaryeongMeta();
  }

  function renderJaryeongCollection() {
    const meta = metaJaryeongState();
    const rows = JARYEONG_LIBRARY.filter((jaryeong) => jaryeongMetaElement === "all" || jaryeong.element === jaryeongMetaElement);
    if (!rows.some((entry) => entry.id === jaryeongMetaSelectedId)) jaryeongMetaSelectedId = rows[0]?.id || JARYEONG_LIBRARY[0]?.id;
    $("#jaryeong-meta-grid").innerHTML = rows.map((jaryeong) => {
      const owned = meta.owned[jaryeong.id];
      const rarity = getJaryeongRarity(jaryeong.id) || "common";
      return `<button type="button" class="jaryeong-meta-tile ${jaryeong.element}${owned ? " owned" : " locked"}${jaryeong.id === jaryeongMetaSelectedId ? " selected" : ""}" data-meta-jaryeong="${jaryeong.id}"><div>${tamedSpriteMarkup(jaryeong, { alt: owned ? jaryeong.name : "미소환 자령" })}</div><strong>${owned ? escapeHtml(jaryeong.name) : "미소환"}</strong><small>${JARYEONG_RARITY_LABELS[rarity]} · ${owned ? `Lv.${owned.level}` : "부적에서 발견"}</small></button>`;
    }).join("");
    const selected = getJaryeong(jaryeongMetaSelectedId) || rows[0];
    if (!selected) return;
    const record = meta.owned[selected.id];
    const rarity = getJaryeongRarity(selected.id) || "common";
    const maxed = Boolean(record?.level >= 99 && record?.awakening >= 5);
    $("#jaryeong-meta-detail").innerHTML = `<div class="meta-detail-art ${selected.element}">${tamedSpriteMarkup(selected, { alt: selected.name })}</div><p>${ELEMENTS.find((entry) => entry.id === selected.element)?.symbol || "靈"} · ${JARYEONG_RARITY_LABELS[rarity]}</p><h3>${escapeHtml(selected.name)}</h3><strong>${escapeHtml(selected.reading)} · ${escapeHtml(selected.meaning)}</strong><dl><div><dt>기술</dt><dd>${escapeHtml(selected.skillName)} · ${escapeHtml(selected.skillDesc)}</dd></div><div><dt>리더</dt><dd>${escapeHtml(selected.leaderSkill)}</dd></div></dl><div class="meta-fragment-meter unified"><span style="--fragment-progress:${Math.min(100, (meta.talismanPieces || 0) / TALISMAN_PIECES_PER_SUMMON_TICKET * 100)}%"></span><b>부적 조각 ${meta.talismanPieces || 0} · 소환권 ${meta.summonTickets || 0}</b></div><small>${record ? `Lv.${record.level} · 각성 ${record.awakening}/5 · 성장 ${record.level >= 99 ? "MAX" : `${record.levelProgress}/100`}` : maxed ? "완전 각성" : "무작위 부적 소환에서 발견 가능"}</small>`;
  }

  function renderJaryeongParty() {
    const meta = metaJaryeongState();
    if (jaryeongPartyDraft.length !== 5) jaryeongPartyDraft = [...meta.equippedParty];
    $("#jaryeong-party-slots").innerHTML = jaryeongPartyDraft.map((id, index) => {
      const jaryeong = getJaryeong(id);
      return `<button type="button" class="jaryeong-party-slot ${jaryeong?.element || ""}${index === jaryeongPartySlot ? " selected" : ""}" data-party-slot="${index}"><small>${index === 0 ? "리더" : `슬롯 ${index + 1}`}</small><div>${tamedSpriteMarkup(jaryeong, { alt: jaryeong?.name || "자령" })}</div><strong>${escapeHtml(jaryeong?.name || id)}</strong><em>${index === 0 ? escapeHtml(jaryeong?.leaderSkill || "") : escapeHtml(jaryeong?.skillName || "")}</em></button>`;
    }).join("");
    $("#jaryeong-party-pool").innerHTML = Object.keys(meta.owned).map((id) => {
      const jaryeong = getJaryeong(id);
      if (!jaryeong) return "";
      const inParty = jaryeongPartyDraft.includes(id);
      return `<button type="button" class="party-pool-card ${jaryeong.element}${inParty ? " equipped" : ""}" data-party-jaryeong="${id}"><div>${tamedSpriteMarkup(jaryeong, { alt: jaryeong.name })}</div><span><strong>${escapeHtml(jaryeong.name)}</strong><small>Lv.${meta.owned[id].level} · ${escapeHtml(jaryeong.skillName)}</small></span></button>`;
    }).join("");
    $("#jaryeong-party-status").textContent = `편성 ${jaryeongPartyDraft.length} / 5 · 첫 슬롯 리더`;
  }

  function renderJaryeongSummon() {
    const meta = metaJaryeongState();
    const available = JARYEONG_LIBRARY.filter((jaryeong) => {
      const record = meta.owned[jaryeong.id];
      return !(record?.level >= 99 && record?.awakening >= 5);
    });
    const allMaxed = available.length === 0;
    const ready = (meta.summonTickets || 0) >= 1 && !allMaxed;
    const canExchange = (meta.talismanPieces || 0) >= TALISMAN_PIECES_PER_SUMMON_TICKET;
    const rates = Object.entries(JARYEONG_SUMMON_RARITY_WEIGHTS).map(([rarity, weight]) => `<span class="rarity-${rarity}"><b>${JARYEONG_RARITY_LABELS[rarity]}</b><strong>${weight}%</strong></span>`).join("");
    $("#jaryeong-summon-ritual").innerHTML = `<div class="summon-seal mystery"><i></i><div class="summon-mystery" aria-label="봉인된 무작위 자령 부적"><span>符</span><b>?</b></div></div><p>RANDOM TALISMAN · 무작위 자령</p><h3>봉인된 부적을 열어 보세요</h3><div class="summon-rate-strip" aria-label="소환 확률">${rates}</div><div class="summon-meter"><span style="--fragment-progress:${Math.min(100, (meta.talismanPieces || 0) / TALISMAN_PIECES_PER_SUMMON_TICKET * 100)}%"></span><b>부적 조각 ${meta.talismanPieces || 0} / ${TALISMAN_PIECES_PER_SUMMON_TICKET} · 소환권 ${meta.summonTickets || 0}장</b></div><small>${allMaxed ? "모든 자령의 레벨과 각성이 최대입니다. 소환권은 소비되지 않습니다." : "희귀도를 먼저 추첨한 뒤 해당 등급의 자령 하나가 등장합니다. 완전 성장 자령은 후보에서 제외됩니다."}</small><div class="summon-actions"><button type="button" class="text-button" data-exchange-summon-ticket ${canExchange ? "" : "disabled"}>조각 10개 → 소환권 1장</button><button id="jaryeong-summon-button" type="button" class="primary-button" data-summon-random ${ready ? "" : "disabled"}>${allMaxed ? "모두 완전 각성" : "부적 소환 1회"} <span>券</span></button></div>`;
  }

  function renderJaryeongMeta() {
    renderPreparedParty();
    if (jaryeongMetaView === "collection") renderJaryeongCollection();
    else if (jaryeongMetaView === "party") renderJaryeongParty();
    else renderJaryeongSummon();
  }

  function openJaryeongMeta(view = "collection") {
    const meta = metaJaryeongState();
    jaryeongPartyDraft = [...meta.equippedParty];
    jaryeongMetaSelectedId = meta.equippedParty[0] || JARYEONG_LIBRARY[0]?.id;
    setJaryeongMetaView(view);
    const modal = $("#jaryeong-meta-modal");
    modal.inert = false;
    modal.classList.add("open");
  }

  function closeJaryeongMeta() {
    $("#jaryeong-summon-result-modal").classList.remove("open");
    $("#jaryeong-meta-modal").classList.remove("open");
    const savedRun = $("#roguelike-intro-modal")?.classList.contains("open") ? readActiveRunSave() : null;
    renderPreparedParty(savedRun?.run?.partyJaryeongIds || null);
  }

  function choosePartyJaryeong(id) {
    const existingIndex = jaryeongPartyDraft.indexOf(id);
    if (existingIndex === jaryeongPartySlot) return;
    if (existingIndex >= 0) {
      const previous = jaryeongPartyDraft[jaryeongPartySlot];
      jaryeongPartyDraft[jaryeongPartySlot] = id;
      jaryeongPartyDraft[existingIndex] = previous;
    } else {
      jaryeongPartyDraft[jaryeongPartySlot] = id;
    }
    jaryeongPartySlot = Math.min(4, jaryeongPartySlot + 1);
    renderJaryeongParty();
    restoreMetaFocus(`[data-party-slot="${jaryeongPartySlot}"]`);
    audioDirector.playSfx("ui-confirm");
  }

  function saveJaryeongParty() {
    const result = setEquippedJaryeongParty(metaProgress.jaryeongMeta, jaryeongPartyDraft);
    if (!result.ok) {
      $("#jaryeong-party-status").textContent = "서로 다른 보유 자령 5종이 필요합니다.";
      return;
    }
    metaProgress.jaryeongMeta = result.state;
    saveMetaProgress();
    renderPreparedParty();
    $("#jaryeong-party-status").textContent = "편성을 저장했습니다. 다음 런부터 적용됩니다.";
    audioDirector.playSfx("reward");
  }

  function exchangeSummonTicket() {
    const result = exchangeTalismanPiecesForSummonTicket(metaProgress.jaryeongMeta);
    if (!result.ok) return;
    metaProgress.jaryeongMeta = result.state;
    saveMetaProgress();
    renderJaryeongMeta();
    restoreMetaFocus("[data-exchange-summon-ticket]");
    audioDirector.playSfx("reward");
  }

  function summonRandomJaryeongFromTalisman() {
    const result = summonRandomJaryeong(metaProgress.jaryeongMeta, { randomValue });
    const jaryeong = getJaryeong(result.jaryeongId);
    if (!result.ok || !jaryeong) return;
    metaProgress.jaryeongMeta = result.state;
    rememberMeta("seenJaryeongs", result.jaryeongId);
    saveMetaProgress();
    $("#summon-result-art").className = `summon-result-art ${jaryeong.element}`;
    $("#summon-result-art").innerHTML = tamedSpriteMarkup(jaryeong, { alt: `${jaryeong.name} 소환 결과` });
    $("#summon-result-title").textContent = result.kind === "unlock" ? `${jaryeong.name} 첫 만남` : `${jaryeong.name} 중복 공명`;
    $("#summon-result-copy").textContent = result.kind === "unlock"
      ? `${JARYEONG_RARITY_LABELS[result.rarity]} ${result.rarity === "legendary" ? "등장!" : "등장"} · ${jaryeong.reading} · ${jaryeong.skillName}`
      : `${JARYEONG_RARITY_LABELS[result.rarity]} · 각성 ${result.record.awakening}/5 · 레벨 ${result.record.level} · 성장 ${result.record.level >= 99 ? "MAX" : `${result.record.levelProgress}/100`} · ${jaryeong.skillName}`;
    renderJaryeongMeta();
    $("#jaryeong-summon-result-modal").classList.add("open");
    audioDirector.playSfx("victory");
  }

  function roguelikeDraftPool() {
    return ACTIVE_IDIOMS.filter((idiom) => !state.run?.idiomBookIds.includes(idiom.id));
  }

  function renderRoguelikeDraft() {
    const run = state.run;
    if (!run) return;
    const choices = run.draftChoices || [];
    $("#roguelike-draft-title").textContent = "시작 고정 성어를 고르세요";
    $("#roguelike-draft-copy").textContent = "직접 고른 한 성어는 전투 내내 유지됩니다. 전투에서는 별도의 순환 성어 세 개가 추가됩니다.";
    $("#roguelike-draft-progress").textContent = `${run.idiomBookIds.length} / ${INITIAL_IDIOM_DRAFT_COUNT} 고정 성어 선택 · 순환 성어 3개 별도`;
    $("#roguelike-draft-cards").innerHTML = choices.map((idiom) => {
      const effectText = idiomEffectText(idiom);
      return `<button type="button" class="roguelike-choice" data-roguelike-idiom="${idiom.id}" title="${escapeHtml(`전투 효과: ${effectText}`)}" aria-label="${escapeHtml(`${idiom.name}. 전투 효과: ${effectText}`)}">
      <span class="roguelike-choice-glyphs">${idiom.chars.map((char) => `<b title="${char} · ${HANJA_READINGS[char]}">${char}</b>`).join("")}</span>
      <span class="roguelike-choice-meta"><em>${idiom.tier || "성어"} · ${idiom.category || "연성"} · ${idiom.role || "전투 효과"}</em><strong>${idiom.name}</strong><small>${idiom.pronunciation || idiom.name}</small></span>
      <span class="roguelike-choice-desc"><b>전투 효과</b><br />${escapeHtml(effectText)}</span>
    </button>`;
    }).join("");
  }

  function openRoguelikeDraft() {
    if (!state.run) return;
    const pool = roguelikeDraftPool();
    state.run.draftChoices = shuffled(pool).slice(0, 3);
    renderRoguelikeDraft();
    $("#roguelike-draft-modal").classList.add("open");
  }

  function renderRoguelikeLeaderCards() {
    const wrap = $("#roguelike-leader-cards");
    if (!wrap) return;
    const leaders = ["wood-mok", "fire-hwa", "earth-to", "metal-gold", "water-sui"].map(getJaryeong).filter(Boolean);
    wrap.innerHTML = leaders.map((jaryeong) => `<button type="button" class="roguelike-choice jaryeong-choice" data-roguelike-leader="${jaryeong.id}">
      <span class="jaryeong-choice-portrait ${jaryeong.element}">${tamedSpriteMarkup(jaryeong)}</span>
      <span class="roguelike-choice-meta"><em>${ELEMENT_RULES[jaryeong.element].label} · 리더 스킬</em><strong>${jaryeong.hanja}령</strong><small>${jaryeong.reading} · ${jaryeong.meaning}</small></span>
      <span class="roguelike-choice-desc"><b>${jaryeong.leaderSkill}</b><br />${jaryeong.personality}</span>
    </button>`).join("");
  }

  function openRoguelikeLeaderPicker() {
    if (!state.run) return;
    renderRoguelikeLeaderCards();
    $("#roguelike-leader-modal").classList.add("open");
  }

  function chooseRoguelikeLeader(id) {
    if (state.mode !== "roguelike" || !state.run || state.run.leaderJaryeongId) return;
    const jaryeong = getJaryeong(id);
    if (!jaryeong) return;
    state.run.leaderJaryeongId = id;
    state.run.partyJaryeongIds = [id];
    state.run.jaryeongLevels[id] = 1;
    state.run.skillCharges[id] = 0;
    rememberMeta("seenJaryeongs", id);
    $("#roguelike-leader-modal").classList.remove("open");
    updateRoguelikeHud();
    saveActiveRun();
    openRoguelikeDraft();
  }

  function chooseRoguelikeIdiom(id) {
    if (state.mode !== "roguelike" || !state.run || state.run.pendingReward) return;
    const idiom = ACTIVE_IDIOMS.find((candidate) => candidate.id === id);
    if (!idiom || state.run.idiomBookIds.includes(id)) return;
    if (state.run.activeIdiomIds.length < RUN_LIMITS.activeIdiomMax) state.run.activeIdiomIds.push(id);
    state.run.idiomBookIds.push(id);
    rememberMeta("seenIdioms", id);
    state.run.draftStep++;
    updateRoguelikeHud();
    saveActiveRun();
    if (state.run.idiomBookIds.length >= INITIAL_IDIOM_DRAFT_COUNT) {
      $("#roguelike-draft-modal").classList.remove("open");
      const activeIdioms = state.run.idiomBookIds.map((idiomId) => ALL_IDIOMS.find((candidate) => candidate.id === idiomId)).filter(Boolean);
      state.run.characterPool = buildRunCharacterPool({
        volume: CHARACTER_VOLUMES[state.run.characterVolumeIndex],
        idioms: activeIdioms,
        jaryeongs: getPartyJaryeongs(),
        fallbackCharacters: CHARACTER_POOL,
        rng: state.run.rng,
        targetSize: 125
      });
      state.board = createBoard();
      openRoguelikeRoute();
      return;
    }
    openRoguelikeDraft();
  }

  function currentRouteTier() {
    return state.run?.route?.[state.run.routeIndex] || null;
  }

  function renderRoute() {
    const run = state.run;
    const tier = currentRouteTier();
    if (!run || !tier) return;
    if (run.act && run.act !== tier.act) {
      metaProgress.jaryeongMeta = resetTargetFragmentPity(metaProgress.jaryeongMeta);
      saveMetaProgress();
    }
    run.act = tier.act;
    $("#route-title").textContent = `제${tier.act}막 · ${tier.depth}번째 갈림길`;
    $("#route-copy").textContent = tier.depth === 5 ? "이 장의 수호자가 기다립니다. 지금까지 만든 빌드를 확인하세요." : "다음 두 수 앞을 보고 지금 필요한 길을 고르세요.";
    $("#route-seed-button").textContent = run.seed;
    $("#route-act-strip").innerHTML = [1,2,3].map((act) => `<span class="${act < tier.act ? "complete" : act === tier.act ? "current" : ""}"><b>${act < tier.act ? "✓" : act}</b><small>제${act}막</small></span>`).join("");
    $("#route-choices").innerHTML = tier.choices.map((node) => `<button type="button" class="route-choice type-${node.type}" data-route-node="${node.id}">
      <span class="route-node-icon">${node.icon}</span><span class="route-node-copy"><em>${node.risk} · ${node.type.toUpperCase()}</em><strong>${node.label}</strong><small>${node.description}</small></span><b>이 길 선택 →</b>
    </button>`).join("");
    $("#route-hp").textContent = `체력 ${Math.max(0, Math.ceil(state.playerHp))}/${run.maxHp}`;
    $("#route-ink").textContent = `먹 ${run.ink || 0}`;
    $("#route-party").textContent = `자령 ${run.partyJaryeongIds.length}/5`;
    $("#route-idioms").textContent = `성어 ${run.idiomBookIds.length}/${RUN_LIMITS.idiomBookMax}`;
  }

  function openRoguelikeRoute() {
    if (!state.run || state.run.completed) return;
    renderRoute();
    $("#roguelike-route-modal").classList.add("open");
    playRoguelikeBgm();
    saveActiveRun();
  }

  function currentRoguelikeBgmTarget() {
    const run = state.run;
    if (!run) return null;
    const tier = currentRouteTier();
    const node = tier?.choices.find((candidate) => candidate.id === run.currentNodeId);
    const fightingBoss = Boolean(run.currentEncounterId && node?.type === "boss");
    const zone = fightingBoss ? (run.act === 3 ? "final-boss" : "boss") : `act-${run.act || tier?.act || 1}`;
    const rotationStep = fightingBoss ? (run.currentNodeId || run.battleIndex || 0) : Math.floor((run.combatsWon || 0) / 2);
    return { zone, rotationKey: `${run.seed}:${zone}:${rotationStep}` };
  }

  function playRoguelikeBgm({ immediate = false } = {}) {
    const run = state.run;
    const target = currentRoguelikeBgmTarget();
    if (!run || !target) return;
    const forceRotate = run.currentBgmRotationKey !== target.rotationKey;
    run.currentBgmRotationKey = target.rotationKey;
    void audioDirector.playBgm(target.zone, { immediate, rotationKey: target.rotationKey, forceRotate });
  }

  function chooseRoguelikeNode(id) {
    const run = state.run;
    const tier = currentRouteTier();
    const node = tier?.choices.find((candidate) => candidate.id === id);
    if (!run || !node || run.currentNodeId) return;
    run.currentNodeId = node.id;
    run.act = node.act;
    $("#roguelike-route-modal").classList.remove("open");
    audioDirector.playSfx("ui-confirm");
    if (["battle", "elite", "boss"].includes(node.type)) {
      run.currentEncounterId = node.contentId;
      startRoguelikeBattle();
      return;
    }
    run.currentEventId = node.contentId;
    openRunNode(node);
    saveActiveRun();
  }

  function resetEncounterState() {
    const pending = { ...(state.run?.pendingFlags || {}) };
    const remainingPending = { ...pending };
    ["nextBattleDelay", "nextBattleReduction", "nextMoveSeconds", "openingDamage"].forEach((key) => delete remainingPending[key]);
    state.gameOver = false;
    state.resolving = false;
    state.delayed = pending.nextBattleDelay || 0;
    state.weakened = false;
    state.weakenedTurns = 0;
    state.prepared = false;
    clearEnemyBurn();
    state.enemyShield = 0;
    state.enemyElementBarrier = null;
    state.enemyVulnerableTurns = 0;
    state.enemyVulnerableRatio = 0;
    state.enemySilenced = 0;
    state.healReductionTurns = 0;
    state.healReductionRatio = 0;
    state.reflectNextEnemyAttack = null;
    state.nextEnemyDamageReduction = pending.nextBattleReduction || 0;
    state.enemyDamageMultiplier = 1;
    state.lockedTiles = new Map();
    state.activeSealVisual = "seal";
    state.nextElementBoosts = {};
    state.nextMoveBonus = pending.nextMoveSeconds || 0;
    state.enemyMovePenalty = 0;
    state.currentChargeBonus = 0;
    state.nextChargeBonus = 0;
    state.nextPlayerDamageBonus = 0;
    state.nextWeaknessDamageBonus = 0;
    state.turnsSinceIdiom = 0;
    state.lastActivatedIdiomId = null;
    state.lastTurnElementDamage = {};
    state.lastMatchGroupSizes = [];
    state.lastPlayerHealing = 0;
    state.healingFieldTurns = 0;
    state.healingFieldAmount = 0;
    state.phoenixRebirthReady = 0;
    state.damageSplitHits = 0;
    state.damageSplitRatio = 0;
    state.deferredDamage = 0;
    state.deferredDamageTicks = 0;
    state.boundEnemyIntentTurns = 0;
    state.combatObjective = null;
    state.rareEncounter = null;
    state.firstBattleOnboarding = null;
    resetTurnTotals();
    state.turn = 1;
    state.queue = [];
    state.freshQueueIds.clear();
    if (state.run) {
      state.run.pendingFlags = remainingPending;
      state.run.leaderDelayUsed = false;
    }
    renderFirstBattleCoach();
  }

  function deliverFirstBattleCharacters(turn) {
    const onboarding = state.firstBattleOnboarding;
    if (!onboarding?.eligible || !onboarding.grantIssued || onboarding.finished) return [];
    const deliveredTurns = new Set(onboarding.deliveredTurns || []);
    if (deliveredTurns.has(turn)) return [];
    const delivery = onboarding.plan?.characterSupply?.deliveries?.find((entry) => entry.turn === turn);
    if (!delivery) return [];
    const delivered = [];
    delivery.characters.forEach((char) => {
      if (state.queue.length >= getQueueMax()) state.queue.shift();
      const entry = { id: uid(), char, born: state.turn };
      state.queue.push(entry);
      state.freshQueueIds.add(entry.id);
      delivered.push(char);
    });
    onboarding.deliveredTurns = [...deliveredTurns, turn];
    if (delivered.length) {
      addLog(`<strong>첫 연성 지원</strong> · ${turn}턴 문자 ${delivered.join(" · ")} 공급`, "start");
      const leaderId = onboarding.plan?.leaderCharge?.jaryeongId;
      const leader = leaderId ? getJaryeong(leaderId) : null;
      const supportCopy = turn === 1 && leader
        ? `${delivered.join(" · ")} 문자가 큐에 들어왔습니다. · 하단 1번 ${leader.name} 기술도 5/5 준비 완료`
        : `${delivered.join(" · ")} 문자가 큐에 들어왔습니다.`;
      showBattleFeedback("player", "첫 연성 지원", supportCopy);
    }
    return delivered;
  }

  function advanceFirstBattleGuide(type) {
    if (!state.firstBattleOnboarding?.eligible || state.firstBattleOnboarding.finished) return;
    state.firstBattleOnboarding = advanceFirstBattleOnboarding(state.firstBattleOnboarding, { type });
    const hint = getCurrentFirstBattleHint(state.firstBattleOnboarding);
    if (hint?.text) addLog(`<strong>첫 전투 안내</strong> · ${hint.text}`, "start");
    renderFirstBattleCoach();
  }

  function setupFirstBattleOnboarding(enemy, currentNode) {
    if (!state.run) return;
    const fixedIdioms = getFixedIdioms();
    const leaderId = state.run.leaderJaryeongId || state.run.partyJaryeongIds?.[0] || null;
    state.firstBattleOnboarding = createFirstBattleOnboarding({
      seed: state.run.seed,
      isNewRun: true,
      isResume: false,
      completedRuns: metaProgress.completedRuns || 0,
      battleIndex: state.run.battleIndex || 0,
      encounterKind: currentNode?.type || enemy?.kind || "battle",
      isBoss: currentNode?.type === "boss" || enemy?.kind === "boss",
      partyIds: state.run.partyJaryeongIds,
      leaderId,
      fixedIdioms,
      availableCharacters: state.queue.map((entry) => entry.char),
      enemyIntent: currentEnemyIntent()
    });
    const issued = issueFirstBattleOnboardingGrants(state.firstBattleOnboarding);
    state.firstBattleOnboarding = issued.state;
    if (!issued.grants) return;
    state.firstBattleOnboarding.deliveredTurns = [];
    const leaderGrant = issued.grants.leaderCharge;
    if (leaderGrant?.jaryeongId && state.run.skillCharges) {
      state.run.skillCharges[leaderGrant.jaryeongId] = Math.max(
        state.run.skillCharges[leaderGrant.jaryeongId] || 0,
        leaderGrant.charge || 5
      );
    }
    deliverFirstBattleCharacters(1);
    advanceFirstBattleGuide(FIRST_BATTLE_ONBOARDING_EVENT.INTENT_READ);
    const skillName = getJaryeong(leaderId)?.skillName || "리더 기술";
    addLog(`<strong>리더 기술 준비 완료</strong> · ${skillName}을 바로 눌러 시험할 수 있습니다.`, "alchemy");
  }

  function setupRareEncounter(node, enemy) {
    const run = state.run;
    if (!run || !node || !enemy) return null;
    // Keep the very first combat as the readable onboarding fight. The next
    // normal battle remains the first rare candidate and receives the 35%
    // early-window correction.
    if ((run.combatsWon || 0) === 0) return null;
    const candidatesSeen = Math.max(0, Number(run.rareCandidatesSeen) || 0);
    const decision = rollRareEncounter({
      node,
      runSeed: run.seed,
      act: run.act,
      nodeId: node.id,
      battleIndex: run.battleIndex,
      candidateIndex: candidatesSeen,
      candidatesSeen,
      rareEncounterSeen: run.rareEncounterSeen,
      elapsedMs: Date.now() - (run.startedAt || Date.now())
    });
    if (decision.eligible) run.rareCandidatesSeen = candidatesSeen + 1;
    if (!decision.appears) return null;

    run.rareEncounterSeen = true;
    const gimmickRoll = deterministicRareRoll({
      runSeed: `${run.seed}|rare-gimmick`,
      act: run.act,
      nodeId: node.id,
      battleIndex: run.battleIndex,
      candidateIndex: candidatesSeen + 97
    });
    const gimmicks = Object.values(RARE_GIMMICKS);
    const gimmick = gimmicks[Math.min(gimmicks.length - 1, Math.floor(gimmickRoll * gimmicks.length))];
    const idiomIds = getCurrentIdioms().map((idiom) => idiom.id);
    const weaknessRoll = deterministicRareRoll({
      runSeed: `${run.seed}|rare-weakness`, act: run.act, nodeId: node.id,
      battleIndex: run.battleIndex, candidateIndex: candidatesSeen + 193
    });
    const weaknessIdiomId = idiomIds.length ? idiomIds[Math.min(idiomIds.length - 1, Math.floor(weaknessRoll * idiomIds.length))] : null;
    const rare = createRareEncounterState({
      encounterId: enemy.id,
      gimmick,
      maxHp: enemy.hp,
      escapeTurns: run.act >= 3 ? 3 : 4,
      shield: Math.round(enemy.hp * (run.act >= 3 ? .42 : .34)),
      weaknessIdiomId,
      weaknessMultiplier: 1.5
    });
    rare.enemyHp = state.enemyHp;
    rare.spawnReason = decision.reason;
    rare.spawnChance = decision.chance;
    state.rareEncounter = rare;
    if (gimmick === RARE_GIMMICKS.TALISMAN_SHIELD) state.enemyShield = rare.talismanShield;
    addLog(`<strong>희귀 자령 출현</strong> · ${rare.escapeCountdown}턴 후 도주 · ${rareGimmickLabel(rare)} · 놓쳐도 행로는 계속됩니다.`, "enemy");
    return rare;
  }

  function startRoguelikeBattle() {
    if (!state.run) return;
    state.wave = state.run.combatsWon;
    state.run.battleIndex = state.run.combatsWon;
    resetEncounterState();
    const enemy = currentEnemy();
    state.run.encounteredJaryeongIds = [...new Set([...(state.run.encounteredJaryeongIds || []), enemy.jaryeongId])];
    rememberMeta("seenJaryeongs", enemy.jaryeongId);
    const currentNode = currentRouteTier()?.choices.find((node) => node.id === state.run.currentNodeId);
    const isElite = currentNode?.type === "elite";
    const stoneBreaks = state.run.consumables?.["stone-break"] || 0;
    const consumedStoneBreak = stoneBreaks > 0;
    if (consumedStoneBreak) state.run.consumables["stone-break"] = stoneBreaks - 1;
    const openingDamage = (state.run.pendingFlags?.openingDamage || 0) + (consumedStoneBreak ? 24 : 0);
    const eliteDanger = isElite ? state.run.pendingFlags?.eliteDanger?.ratio || 0 : 0;
    state.enemyHp = Math.max(1, enemy.hp - openingDamage);
    state.enemyDamageMultiplier = 1 + eliteDanger;
    if (isElite && state.run.pendingFlags?.eliteDanger) delete state.run.pendingFlags.eliteDanger;
    refreshRotatingIdioms({ force: true });
    state.board = createBoard();
    state.shield = Math.min(Math.round(state.run.maxHp * RUN_LIMITS.maxShieldRatio), state.shield + (state.run.startShield || 0));
    setupRareEncounter(currentNode, enemy);
    state.combatObjective = chooseCombatObjective(enemy);
    recordCombatObjectiveEvent({ type: COMBAT_OBJECTIVE_EVENT.BATTLE_STARTED, shield: state.shield });
    resetEnemyPlan();
    setupFirstBattleOnboarding(enemy, currentNode);
    addLog(`<strong>고정</strong> ${getFixedIdioms().map((idiom) => idiom.name).join(" · ")} / <strong>순환</strong> ${getRotatingIdioms().map((idiom) => idiom.name).join(" · ")} · 순환식은 ${state.idiomRecipeInterval}턴 후 교체`, "start");
    if (openingDamage) addLog(`<strong>선제 부적</strong> · 전투 시작 피해 ${openingDamage}`, "alchemy");
    if (eliteDanger) addLog(`<strong>봉인된 우물의 대가</strong> · 이번 정예의 공격 피해 +${Math.round(eliteDanger * 100)}%`, "enemy");
    playRoguelikeBgm();
    updateAll();
  }

  function gainRunRelic(rarity = null, forcedId = null) {
    const run = state.run;
    if (!run) return null;
    let pool = RELIC_CATALOG.filter((relic) => !run.relicIds.includes(relic.id));
    if (rarity) pool = pool.filter((relic) => relic.rarity === rarity);
    const relic = forcedId ? RELIC_CATALOG.find((entry) => entry.id === forcedId) : randomOf(pool.length ? pool : RELIC_CATALOG.filter((entry) => !run.relicIds.includes(entry.id)));
    if (!relic) return null;
    run.relicIds.push(relic.id);
    applyRunEffects(relic.effects || []);
    addLog(`<strong>${relic.name}</strong> 획득 · ${relic.desc}`, "victory");
    return relic;
  }

  function gainRunIdiom() {
    const run = state.run;
    if (!run || run.idiomBookIds.length >= RUN_LIMITS.idiomBookMax) return null;
    const pool = ALL_IDIOMS.filter((idiom) => !run.idiomBookIds.includes(idiom.id));
    const idiom = randomOf(pool);
    if (!idiom) return null;
    run.idiomBookIds.push(idiom.id);
    if (run.activeIdiomIds.length < RUN_LIMITS.activeIdiomMax) run.activeIdiomIds.push(idiom.id);
    rememberMeta("seenIdioms", idiom.id);
    rebuildRunCharacterPool();
    return idiom;
  }

  function rebuildRunCharacterPool() {
    const run = state.run;
    if (!run) return [];
    run.characterPool = buildRunCharacterPool({
      volume: CHARACTER_VOLUMES[run.characterVolumeIndex],
      idioms: run.idiomBookIds.map((id) => ALL_IDIOMS.find((candidate) => candidate.id === id)).filter(Boolean),
      jaryeongs: getPartyJaryeongs(),
      fallbackCharacters: CHARACTER_POOL,
      rng: run.rng,
      targetSize: 125
    });
    return run.characterPool;
  }

  function upgradeOwnedIdiom(preferredId = null) {
    const run = state.run;
    if (!run) return null;
    const candidates = run.idiomBookIds.filter((id) => (run.idiomUpgrades[id] || 0) < 2);
    const targetId = candidates.includes(preferredId) ? preferredId : randomOf(candidates);
    if (!targetId) return null;
    const idiom = ALL_IDIOMS.find((candidate) => candidate.id === targetId);
    const before = run.idiomUpgrades[targetId] || 0;
    const after = Math.min(2, before + 1);
    run.idiomUpgrades[targetId] = after;
    return {
      type: "idiom-upgrade",
      targetId,
      name: idiom?.name || "보유 성어",
      chars: idiom?.chars || [],
      before,
      after,
      beforeMultiplier: 100 + before * 15,
      afterMultiplier: 100 + after * 15,
      effectText: idiom ? idiomEffectText(idiom) : "성어 효과"
    };
  }

  async function showSelectionReceipt(modalSelector, receipt) {
    if (!receipt) return;
    const modal = $(modalSelector);
    const card = modal?.querySelector(".modal-card");
    if (!card) return;
    modal.querySelectorAll("button").forEach((button) => { button.disabled = true; });
    card.querySelector(".selection-receipt")?.remove();
    const panel = document.createElement("div");
    panel.className = "selection-receipt";
    panel.setAttribute("role", "status");
    panel.setAttribute("aria-live", "assertive");
    panel.innerHTML = receipt.type === "balance-reward"
      ? `<small>약한 축 보완 완료</small><strong>${escapeHtml(receipt.axisLabel)} 축 · ${escapeHtml(receipt.name)} 획득</strong><span class="selection-receipt-glyphs"><b>${escapeHtml(receipt.glyph || "寶")}</b></span><p>${escapeHtml(receipt.effectText)}</p><em>현재 가장 낮았던 ${escapeHtml(receipt.axisLabel)} 역할을 보강했습니다</em>`
      : `<small>강화 완료</small><strong>${escapeHtml(receipt.name)} · Lv.${receipt.before + 1} → Lv.${receipt.after + 1}</strong><span class="selection-receipt-glyphs">${receipt.chars.map((char) => `<b>${escapeHtml(char)}</b>`).join("")}</span><p>${escapeHtml(receipt.effectText)}</p><em>효과 수치 ${receipt.beforeMultiplier}% → ${receipt.afterMultiplier}%</em>`;
    card.appendChild(panel);
    requestAnimationFrame(() => panel.classList.add("show"));
    audioDirector.playSfx("idiom-ready");
    await wait(state.idiomSpeed === "slow" ? 2400 : 1500);
    panel.remove();
  }

  function applyRunEffects(effects = []) {
    const run = state.run;
    if (!run) return [];
    const receipts = [];
    effects.forEach((effect) => {
      switch (effect.type) {
        case "heal": state.playerHp = clamp(state.playerHp + (effect.amount || 0), 0, run.maxHp); break;
        case "loseHp": state.playerHp = Math.max(1, state.playerHp - (effect.amount || 0)); break;
        case "shield": state.shield = Math.min(Math.round(run.maxHp * RUN_LIMITS.maxShieldRatio), state.shield + (effect.amount || 0)); break;
        case "maxHp": run.maxHp = Math.max(70, run.maxHp + (effect.amount || 0)); state.playerHp = Math.min(run.maxHp, state.playerHp + Math.max(0, effect.amount || 0)); break;
        case "moveSeconds": run.moveSeconds = clamp(run.moveSeconds + (effect.amount || 0), 3, 6); break;
        case "nextMoveSeconds": run.pendingFlags.nextMoveSeconds = (run.pendingFlags.nextMoveSeconds || 0) + (effect.amount || 0); break;
        case "queueMax": run.queueMax = clamp(run.queueMax + (effect.amount || 0), RUN_LIMITS.baseQueueMax, RUN_LIMITS.maxQueueMax); break;
        case "queueLife": run.queueLife = clamp(run.queueLife + (effect.amount || 0), 2, 5); break;
        case "gainInk": run.ink += effect.amount || 0; break;
        case "spendInk": run.ink = Math.max(0, run.ink - (effect.amount || 0)); break;
        case "fragment": run.contractFragments.push(...Array.from({ length: effect.amount || 1 }, (_, index) => `event-fragment-${Date.now()}-${index}`)); break;
        case "reroll": run.rewardRerolls += effect.amount || 0; break;
        case "nextBattleDelay": run.pendingFlags.nextBattleDelay = Math.min(RUN_LIMITS.maxDelay, (run.pendingFlags.nextBattleDelay || 0) + (effect.turns || 1)); break;
        case "nextBattleReduction": run.pendingFlags.nextBattleReduction = Math.max(run.pendingFlags.nextBattleReduction || 0, effect.ratio || 0); break;
        case "openingDamage": run.pendingFlags.openingDamage = (run.pendingFlags.openingDamage || 0) + (effect.amount || 0); break;
        case "nextIdiomPower": run.pendingFlags.nextIdiomPower = Math.max(run.pendingFlags.nextIdiomPower || 0, effect.ratio || 0); break;
        case "elementAffinity": run.elementAffinity = { ...(run.elementAffinity || {}), [effect.element]: (run.elementAffinity?.[effect.element] || 0) + (effect.amount || 1) }; break;
        case "gainRelic": gainRunRelic(); break;
        case "gainRareRelic": gainRunRelic("rare"); break;
        case "gainRelicId": gainRunRelic(null, effect.id); break;
        case "draftIdiom": gainRunIdiom(); break;
        case "upgradeIdiom": {
          const receipt = upgradeOwnedIdiom(effect.targetId);
          if (receipt) receipts.push(receipt);
          break;
        }
        case "removeIdiom": {
          if (run.idiomBookIds.length > RUN_LIMITS.initialIdiomCount) {
            const removed = run.idiomBookIds.at(-1);
            run.idiomBookIds = run.idiomBookIds.filter((id) => id !== removed);
            run.activeIdiomIds = run.activeIdiomIds.filter((id) => id !== removed);
          }
          break;
        }
        case "masterIdiom": rememberMeta("masteredIdioms", randomOf(run.idiomBookIds)); break;
        case "masterCharacters": rememberMeta("masteredCharacters", shuffled(run.characterPool).slice(0, effect.count || 1)); break;
        case "balanceReward": {
          const axes = ["damage", "defense", "control", "queue"];
          const scores = Object.fromEntries(axes.map((axis) => [axis, 0]));
          run.relicIds.map((id) => RELIC_CATALOG.find((relic) => relic.id === id)).filter(Boolean).forEach((relic) => {
            axes.forEach((axis) => { if (relic.tags?.includes(axis)) scores[axis]++; });
          });
          run.activeIdiomIds.map((id) => ALL_IDIOMS.find((idiom) => idiom.id === id)).filter(Boolean).forEach((idiom) => {
            axes.forEach((axis) => { if (idiom.effectSpec?.tags?.includes(axis)) scores[axis]++; });
          });
          const weakest = [...axes].sort((a, b) => scores[a] - scores[b] || a.localeCompare(b))[0];
          const candidates = RELIC_CATALOG.filter((relic) => !run.relicIds.includes(relic.id) && relic.tags?.includes(weakest));
          const selected = randomOf(candidates);
          const gained = selected ? gainRunRelic(null, selected.id) : gainRunRelic("uncommon");
          if (gained) {
            const axisLabels = { damage: "공격", defense: "방어", control: "제어", queue: "문자 큐" };
            receipts.push({
              type: "balance-reward",
              axis: weakest,
              axisLabel: axisLabels[weakest] || weakest,
              name: gained.name,
              glyph: gained.glyph || "寶",
              effectText: gained.desc
            });
          }
          break;
        }
        case "focusBuild": {
          const partyCounts = getPartyJaryeongs().reduce((counts, jaryeong) => {
            counts[jaryeong.element] = (counts[jaryeong.element] || 0) + 1;
            return counts;
          }, {});
          const leaderElement = getLeaderJaryeong()?.element;
          const strongest = Object.entries(partyCounts).sort((a, b) => b[1] - a[1] || (a[0] === leaderElement ? -1 : 1))[0]?.[0] || leaderElement || "wood";
          run.focusBuildElement = strongest;
          run.focusBuildStacks = (run.focusBuildStacks || 0) + (effect.amount || 1);
          break;
        }
        case "startShield": run.startShield = (run.startShield || 0) + (effect.amount || 0); break;
        case "gainConsumable": {
          run.consumables ||= {};
          run.consumables[effect.id] = (run.consumables[effect.id] || 0) + (effect.amount || 1);
          break;
        }
        case "eliteDanger": run.pendingFlags.eliteDanger = { ratio: Math.max(run.pendingFlags.eliteDanger?.ratio || 0, effect.ratio || 0) }; break;
        default:
          if (!RUNTIME_RELIC_EFFECT_TYPES.includes(effect.type)) console.warn(`지원되지 않는 런 효과: ${effect.type}`, effect);
      }
    });
    state.shield = Math.min(Math.round(run.maxHp * RUN_LIMITS.maxShieldRatio), state.shield);
    return receipts;
  }

  function nodeChoices(node) {
    if (node.generatedChoices) return node.generatedChoices;
    if (node.type === "event") node.generatedChoices = EVENT_CATALOG.find((event) => event.id === node.contentId)?.choices || [];
    else if (node.type === "rest") node.generatedChoices = [
      { id: "rest-heal", label: "먹을 갈며 체력 30 회복", effects: [{ type: "heal", amount: 30 }] },
      { id: "rest-upgrade", label: "보유 성어 하나 강화", effects: [{ type: "upgradeIdiom", count: 1 }] },
      { id: "rest-queue", label: "문자 수명 +1턴", effects: [{ type: "queueLife", amount: 1 }] }
    ];
    else if (node.type === "shop") {
      node.generatedChoices = shuffled(RELIC_CATALOG.filter((relic) => !state.run.relicIds.includes(relic.id))).slice(0, 3).map((relic, index) => ({
        id: `shop-${relic.id}`,
        label: `${relic.name} · ${relic.desc}`,
        cost: 24 + index * 8,
        effects: [{ type: "spendInk", amount: 24 + index * 8 }, { type: "gainRelicId", id: relic.id }]
      })).concat({ id: "shop-leave", label: "구매하지 않고 떠난다", effects: [] });
    }
    else node.generatedChoices = [];
    return node.generatedChoices;
  }

  function openRunNode(node) {
    const event = node.type === "event" ? EVENT_CATALOG.find((entry) => entry.id === node.contentId) : null;
    const title = event?.name || node.label;
    const description = event?.description || node.description;
    $("#node-kicker").textContent = `${node.type.toUpperCase()} · 제${node.act}막`;
    $("#node-glyph").textContent = node.icon;
    $("#node-title").textContent = title;
    $("#node-copy").textContent = description;
    $("#node-choices").innerHTML = nodeChoices(node).map((choice) => {
      const lacksInk = choice.cost && state.run.ink < choice.cost;
      const lacksIdioms = choice.minIdioms && state.run.idiomBookIds.length < choice.minIdioms;
      const disabled = lacksInk || lacksIdioms;
      const reason = lacksIdioms ? `성어 ${choice.minIdioms}개 필요` : lacksInk ? "먹 부족" : "선택 →";
      return `<button type="button" data-node-choice="${choice.id}" ${disabled ? "disabled" : ""}><span>${choice.label}</span>${choice.cost ? `<b>먹 ${choice.cost}${lacksInk ? " · 부족" : ""}</b>` : `<b>${reason}</b>`}</button>`;
    }).join("");
    $("#roguelike-node-modal").classList.add("open");
    saveActiveRun();
  }

  function completeCurrentRunNode() {
    const run = state.run;
    if (!run?.currentNodeId) return;
    if (!run.completedNodeIds.includes(run.currentNodeId)) run.completedNodeIds.push(run.currentNodeId);
    const tier = currentRouteTier();
    tier?.choices.forEach((node) => { if (node.id === run.currentNodeId) node.completed = true; });
    run.routeIndex++;
    run.currentNodeId = null;
    run.currentEventId = null;
    run.currentEncounterId = null;
    if (run.routeIndex >= run.route.length) finishRoguelikeRun(true);
    else openRoguelikeRoute();
  }

  async function chooseRunNodeChoice(id) {
    const tier = currentRouteTier();
    const node = tier?.choices.find((candidate) => candidate.id === state.run?.currentNodeId);
    if (!node) return;
    const choice = nodeChoices(node).find((candidate) => candidate.id === id);
    if (!choice || (choice.cost && state.run.ink < choice.cost) || (choice.minIdioms && state.run.idiomBookIds.length < choice.minIdioms)) return;
    if (nodeChoiceResolving) return;
    nodeChoiceResolving = true;
    const nodeModal = $("#roguelike-node-modal");
    nodeModal?.setAttribute("aria-busy", "true");
    try {
      const receipts = applyRunEffects(choice.effects || []);
      state.run.rewardHistory.push(`${node.type}:${choice.id}`);
      const upgradeReceipt = receipts.find((receipt) => receipt.type === "idiom-upgrade");
      if (upgradeReceipt) {
        state.run.rewardHistory.push(`idiom-upgrade:${upgradeReceipt.targetId}:${upgradeReceipt.after}`);
        addLog(`<strong>${upgradeReceipt.name}</strong> 강화 · Lv.${upgradeReceipt.before + 1} → Lv.${upgradeReceipt.after + 1} · 효과 수치 ${upgradeReceipt.beforeMultiplier}% → ${upgradeReceipt.afterMultiplier}%`, "alchemy");
        await showSelectionReceipt("#roguelike-node-modal", upgradeReceipt);
      }
      const balanceReceipt = receipts.find((receipt) => receipt.type === "balance-reward");
      if (balanceReceipt) {
        state.run.rewardHistory.push(`balance:${balanceReceipt.axis}:${balanceReceipt.name}`);
        addLog(`<strong>약한 축 보완</strong> · ${balanceReceipt.axisLabel} · ${balanceReceipt.name} 획득 · ${balanceReceipt.effectText}`, "victory");
        await showSelectionReceipt("#roguelike-node-modal", balanceReceipt);
      }
      $("#roguelike-node-modal").classList.remove("open");
      audioDirector.playSfx("reward");
      completeCurrentRunNode();
      } finally {
      nodeChoiceResolving = false;
      nodeModal?.removeAttribute("aria-busy");
    }
  }
  function drawRoguelikeRewards() {
    const run = state.run;
    const idiomPool = ALL_IDIOMS.filter((idiom) => !run.idiomBookIds.includes(idiom.id));
    const idiom = run.idiomBookIds.length < RUN_LIMITS.idiomBookMax ? randomOf(idiomPool) : null;
    const upgradableIdiomIds = run.idiomBookIds.filter((id) => (run.idiomUpgrades[id] || 0) < 2);
    const upgradeTargetId = randomOf(upgradableIdiomIds);
    const upgradeTarget = ALL_IDIOMS.find((candidate) => candidate.id === upgradeTargetId);
    const idiomReward = idiom ? { type: "idiom", ...idiom } : upgradeTarget ? {
      id: `upgrade-${upgradeTarget.id}`,
      type: "idiom-upgrade",
      targetId: upgradeTarget.id,
      name: `${upgradeTarget.name} 심화`,
      desc: `${idiomEffectText(upgradeTarget)} · 효과 수치 ${100 + (run.idiomUpgrades[upgradeTarget.id] || 0) * 15}% → ${115 + (run.idiomUpgrades[upgradeTarget.id] || 0) * 15}%`,
      chars: upgradeTarget.chars
    } : {
      id: "mastered-idiom-recovery",
      type: "heal",
      name: "완성된 성어첩",
      glyph: "成",
      rarity: "숙련 완료",
      desc: "모든 보유 성어가 최대 강화 · 체력 24 회복 · 먹 6",
      effects: [{ type: "heal", amount: 24 }, { type: "gainInk", amount: 6 }]
    };
    const relicPool = RELIC_CATALOG.filter((relic) => !run.relicIds.includes(relic.id));
    let utility = randomOf(relicPool);
    if (state.playerHp / run.maxHp < .35 && randomValue() < .55) utility = { id: "warm-ink-recovery", type: "heal", name: "따뜻한 먹", glyph: "墨", rarity: "회복", desc: "체력 28 회복 · 보호막 8", effects: [{ type: "heal", amount: 28 }, { type: "shield", amount: 8 }] };
    else if (utility) utility = { ...utility, type: "relic" };
    else utility = { id: "quiet-ink-recovery", type: "heal", name: "고요한 먹", glyph: "墨", rarity: "회복", desc: "체력 20 회복 · 먹 4", effects: [{ type: "heal", amount: 20 }, { type: "gainInk", amount: 4 }] };
    const alternate = randomValue() < .5
      ? { id: "steady-ink", type: "heal", name: "온전한 먹", glyph: "墨", rarity: "정비", desc: "체력 18 회복 · 먹 5", effects: [{ type: "heal", amount: 18 }, { type: "gainInk", amount: 5 }] }
      : (() => {
          const extraRelic = randomOf(relicPool.filter((relic) => relic.id !== utility?.id));
          return extraRelic ? { ...extraRelic, type: "relic" } : { id: "guarded-rest", type: "heal", name: "호신의 여백", glyph: "護", rarity: "정비", desc: "보호막 14 · 먹 4", effects: [{ type: "shield", amount: 14 }, { type: "gainInk", amount: 4 }] };
        })();
    const rewards = [idiomReward, utility, alternate].filter(Boolean);
    const preview = getRunRelicEffect("rewardPreview");
    if (preview) {
      const extraPool = relicPool.filter((relic) => !rewards.some((reward) => reward.id === relic.id));
      const extra = randomOf(extraPool);
      if (extra) rewards.push({ ...extra, type: "relic", preview: true });
      else rewards.push({ id: "scholar-insight", type: "heal", name: "등불의 여백", glyph: "學", rarity: "등불", desc: "체력 16 회복 · 먹 6", effects: [{ type: "heal", amount: 16 }, { type: "gainInk", amount: 6 }], preview: true });
    }
    return rewards;
  }

  function currentRewardBuildSnapshot() {
    const run = state.run;
    return createRewardBuildSnapshot({
      party: getPartyJaryeongs(),
      leader: getLeaderJaryeong(),
      idioms: (run?.idiomBookIds || []).map((id) => ALL_IDIOMS.find((idiom) => idiom.id === id)).filter(Boolean),
      relics: currentRunRelics(),
      hp: state.playerHp,
      maxHp: run?.maxHp || Math.max(1, state.playerHp || 1),
      shield: state.shield
    });
  }

  function rewardSynergyPresentation(reward, buildSnapshot, idiom = null) {
    const notes = evaluateRewardSynergy(idiom ? { ...reward, idiom } : reward, buildSnapshot);
    const summary = notes.map((note) => `${note.badge}: ${note.reason}`).join(" · ");
    const markup = `<span class="reward-synergy" role="note" aria-label="${escapeHtml(`현재 빌드 기준. ${summary}`)}"><span class="reward-synergy-title">현재 빌드 기준</span>${notes.map((note) => `<span class="reward-synergy-note ${escapeHtml(note.tone)}"><b>${escapeHtml(note.badge)}</b><small>${escapeHtml(note.reason)}</small></span>`).join("")}</span>`;
    return { markup, summary };
  }

  function renderRoguelikeRewards() {
    const run = state.run;
    if (!run) return;
    const enemy = currentEnemy();
    $("#roguelike-reward-copy").textContent = `${run.combatsWon}번째 전투 보상 · 성어, 유물, 회복·정비 중 하나를 선택하세요. 부적 조각은 희귀·정예·보스 처치 시 자동 드랍됩니다.`;
    const rewardCards = $("#roguelike-reward-cards");
    rewardCards.classList.toggle("has-four", run.rewardChoices.length >= 4);
    const buildSnapshot = currentRewardBuildSnapshot();
    rewardCards.innerHTML = run.rewardChoices.map((reward) => {
      if (reward.type === "jaryeong") {
        const owned = run.partyJaryeongIds.includes(reward.id);
        const level = run.jaryeongLevels[reward.id] || 0;
        const procEffect = ELEMENT_PROC_RULES[reward.element].effect;
        const procReward = owned ? `${procEffect} 발동률 +1%p` : `${procEffect} 발동률 +3%p`;
        const synergy = rewardSynergyPresentation(reward, buildSnapshot);
        return `<button type="button" class="roguelike-choice reward-choice jaryeong-reward-choice" data-roguelike-reward="${reward.id}">
          <span class="jaryeong-choice-glyph sprite-choice ${reward.element}"><img class="sprite-body" src="${reward.asset?.idle || ""}" alt="${reward.name} · 아직 부적 없는 야생 자령" /></span>
          <span class="roguelike-choice-meta"><em>${ELEMENT_RULES[reward.element].label} · ${owned ? `중복 강화 Lv.${level + 1}` : "부적 계약 후보"}</em><strong>${reward.name}</strong><small>${reward.hanja} · ${reward.reading} · 공격 ${reward.attack}</small></span>
          <span class="roguelike-choice-desc"><b>${reward.skillName}</b><br />${reward.skillDesc}<br /><strong>${procReward}</strong><br /><small>${reward.personality}</small></span>
          ${synergy.markup}
        </button>`;
      }
      if (reward.type === "idiom" || reward.type === "idiom-upgrade") {
        const upgradeTarget = reward.type === "idiom-upgrade" ? ALL_IDIOMS.find((idiom) => idiom.id === reward.targetId) : null;
        const upgradeBefore = upgradeTarget ? (run.idiomUpgrades[upgradeTarget.id] || 0) : 0;
        const effectText = reward.type === "idiom" ? idiomEffectText(reward) : `${upgradeTarget ? idiomEffectText(upgradeTarget) : reward.desc} · 효과 수치 ${100 + upgradeBefore * 15}% → ${115 + upgradeBefore * 15}%`;
        const roleText = reward.type === "idiom" ? (reward.role || "전투 효과") : `Lv.${upgradeBefore + 1} → Lv.${upgradeBefore + 2}`;
        const tooltip = `${reward.name}\n전투 효과: ${effectText}`;
        const synergy = rewardSynergyPresentation(reward, buildSnapshot, upgradeTarget);
        return `<button type="button" class="roguelike-choice reward-choice idiom-reward-choice" data-roguelike-reward="${escapeHtml(reward.id)}" title="${escapeHtml(tooltip)}" aria-label="${escapeHtml(`${reward.name} 보상. 전투 효과: ${effectText}. 현재 빌드 기준: ${synergy.summary}`)}">
          <span class="idiom-reward-art" aria-hidden="true"><img src="assets/ui/idiom-reward-v1/idiom-reward-scroll.png" alt="" /></span>
          <span class="roguelike-choice-glyphs">${(reward.chars || []).map((char) => `<b>${char}</b>`).join("")}</span>
          <span class="roguelike-choice-meta"><em>${escapeHtml(reward.type === "idiom" ? `${reward.tier || "성어"} · ${reward.category || "연성"}` : `${upgradeTarget?.name || "성어"} 강화`)}</em><strong>${escapeHtml(reward.name)}</strong><small>${escapeHtml(roleText)}</small></span>
          <span class="roguelike-choice-desc reward-idiom-copy"><b class="reward-effect-label">전투 효과</b><span class="reward-idiom-effect">${escapeHtml(effectText)}</span></span>
          ${synergy.markup}
        </button>`;
      }
      const typeLabel = reward.preview ? "등불 미리보기" : reward.type === "heal" ? "회복 보상" : "유물 보상";
      const synergy = rewardSynergyPresentation(reward, buildSnapshot);
      return `<button type="button" class="roguelike-choice reward-choice" data-roguelike-reward="${reward.id}">
        <span class="reward-glyph${reward.type === "relic" ? " has-relic-art" : ""}">${reward.type === "relic" ? `<img src="${relicAssetUrl(reward.id)}" alt="${escapeHtml(reward.name)} 유물" />` : (reward.glyph || "◇")}</span>
        <span class="roguelike-choice-meta"><em>${typeLabel} · ${reward.rarity || "보상"}</em><strong>${reward.name}</strong><small>${reward.desc}</small></span>
        <span class="roguelike-choice-desc">다음 전투 전에 즉시 적용됩니다.</span>
        ${synergy.markup}
      </button>`;
    }).join("");
    $("#reward-reroll-count").textContent = run.rewardRerolls;
    $("#roguelike-reward-reroll").disabled = run.rewardRerolls <= 0;
  }

  function openRoguelikeReward() {
    if (!state.run || state.gameOver) return;
    state.run.pendingReward = true;
    state.run.pendingContractJaryeongId = null;
    state.run.rewardChoices = drawRoguelikeRewards();
    renderRoguelikeRewards();
    $("#roguelike-reward-modal").classList.add("open");
    audioDirector.playSfx("reward");
    saveActiveRun();
  }

  function rerollRoguelikeRewards() {
    if (!state.run?.pendingReward || state.run.rewardRerolls <= 0) return;
    state.run.rewardRerolls--;
    state.run.rewardChoices = drawRoguelikeRewards();
    renderRoguelikeRewards();
    audioDirector.playSfx("ui-confirm");
    saveActiveRun();
  }

  function renderJaryeongContract() {
    const run = state.run;
    const candidate = getJaryeong(run?.pendingContractJaryeongId);
    if (!run || !candidate) return;
    $("#contract-title").textContent = `이전 저장 · ${candidate.name} 보상`;
    $("#contract-copy").textContent = `이전 버전의 미완료 보상입니다. 교체하면 ${ELEMENT_PROC_RULES[candidate.element].effect} 발동률 +3%p, 중복 강화는 기존 자령의 발동률 +1%p를 얻습니다. 신규 런의 부적 조각은 희귀·정예·보스 처치 시 자동 드랍됩니다.`;
    $("#contract-candidate").innerHTML = `<span class="jaryeong-choice-glyph ${candidate.element}">${candidate.hanja}</span><span class="contract-candidate-copy"><strong>${candidate.name} · ${candidate.hanja}</strong><small>${candidate.reading} · ${candidate.skillName}<br />${candidate.skillDesc}</small></span>`;
    $("#contract-party-options").innerHTML = run.partyJaryeongIds.map((id, index) => {
      const jaryeong = getJaryeong(id);
      const level = run.jaryeongLevels[id] || 1;
      return `<button type="button" class="contract-party-option" data-contract-replace-index="${index}" aria-label="${jaryeong?.name || "자령"} Lv.${level}과 교체">
        <span class="jaryeong-choice-glyph ${jaryeong?.element || "wood"}">${jaryeong?.hanja || "字"}</span>
        <strong>${jaryeong?.name || "빈 슬롯"}</strong><small>Lv.${level}</small>
      </button>`;
    }).join("");
  }

  function closeJaryeongContract() {
    $("#jaryeong-contract-modal")?.classList.remove("open");
  }

  function advanceAfterRoguelikeReward() {
    rewardChoiceResolving = false;
    $("#roguelike-reward-modal")?.removeAttribute("aria-busy");
    if (!state.run) return;
    state.run.pendingReward = false;
    state.run.pendingContractJaryeongId = null;
    $("#roguelike-reward-modal").classList.remove("open");
    closeJaryeongContract();
    state.run.ink += 8;
    completeCurrentRunNode();
  }

  function contractReplace(index) {
    const run = state.run;
    const candidate = getJaryeong(run?.pendingContractJaryeongId);
    const slotIndex = Number(index);
    if (!run || !candidate || !Number.isInteger(slotIndex) || !run.partyJaryeongIds[slotIndex]) return;
    const replacedId = run.partyJaryeongIds[slotIndex];
    run.partyJaryeongIds[slotIndex] = candidate.id;
    run.jaryeongLevels[candidate.id] = 1;
    run.jaryeongAwakenings = run.jaryeongAwakenings || {};
    run.jaryeongAwakenings[candidate.id] = metaProgress.jaryeongMeta?.owned?.[candidate.id]?.awakening || 0;
    run.skillCharges[candidate.id] = 0;
    run.rewardHistory.push(`contract-replace:${candidate.id}:${replacedId}`);
    rebuildRunCharacterPool();
    addLog(`<strong>${candidate.name} 부적 계약</strong> · ${getJaryeong(replacedId)?.name || "기존 자령"}과 교체 · ${ELEMENT_PROC_RULES[candidate.element].effect} 발동률 +3%p`, "victory");
    advanceAfterRoguelikeReward();
  }

  function contractDuplicate() {
    const run = state.run;
    const candidate = getJaryeong(run?.pendingContractJaryeongId);
    const targetId = run?.partyJaryeongIds?.[0];
    if (!run || !candidate || !targetId) return;
    run.jaryeongLevels[targetId] = (run.jaryeongLevels[targetId] || 1) + 1;
    run.rewardHistory.push(`contract-duplicate:${candidate.id}:${targetId}`);
    rebuildRunCharacterPool();
    addLog(`<strong>${candidate.name} 계약을 공명으로 전환</strong> · ${getJaryeong(targetId)?.name || "기존 자령"} Lv.${run.jaryeongLevels[targetId]} · 해당 속성 발동률 +1%p`, "victory");
    advanceAfterRoguelikeReward();
  }

  function contractAbandon() {
    const run = state.run;
    const candidate = getJaryeong(run?.pendingContractJaryeongId);
    if (!run || !candidate) return;
    run.ink += 8;
    run.rewardHistory.push(`legacy-contract-ink:${candidate.id}:8`);
    rebuildRunCharacterPool();
    addLog(`<strong>${candidate.name} 영입을 포기했습니다.</strong> · 먹 8 획득`, "victory");
    advanceAfterRoguelikeReward();
  }

  function idiomQueueReadiness(idiom) {
    const available = new Map();
    (state.queue || []).forEach((entry) => available.set(entry.char, (available.get(entry.char) || 0) + 1));
    let ready = 0;
    (idiom?.chars || []).forEach((char) => {
      const count = available.get(char) || 0;
      if (count > 0) {
        ready++;
        available.set(char, count - 1);
      }
    });
    return { ready, total: idiom?.chars?.length || 4 };
  }

  function idiomComparisonMarkup(idiom, { candidate = false, index = -1 } = {}) {
    if (!idiom) return "";
    const readiness = idiomQueueReadiness(idiom);
    const upgrade = state.run?.idiomUpgrades?.[idiom.id] || 0;
    const label = candidate ? "새로 획득" : `현재 고정 ${index + 1}`;
    const action = candidate ? "" : `<span class="idiom-replacement-action">이 성어와 교체</span>`;
    const body = `<span class="idiom-replacement-meta"><em>${label} · Lv.${upgrade + 1}</em><strong>${escapeHtml(idiom.name)}</strong><small>${escapeHtml(idiom.role || idiom.category || "복합 효과")}</small></span>
      <span class="idiom-replacement-glyphs">${(idiom.chars || []).map((char) => `<b class="${(state.queue || []).some((entry) => entry.char === char) ? "ready" : ""}">${escapeHtml(char)}</b>`).join("")}</span>
      <span class="idiom-replacement-effect"><b>발동 효과</b>${escapeHtml(idiomEffectText(idiom))}</span>
      <span class="idiom-replacement-readiness">현재 큐 준비 ${readiness.ready}/${readiness.total}${action}</span>`;
    return candidate
      ? `<article class="idiom-comparison-card candidate">${body}</article>`
      : `<button type="button" class="idiom-comparison-card" data-idiom-replace-index="${index}" aria-label="${escapeHtml(idiom.name)}을 새 성어와 교체">${body}</button>`;
  }

  function renderIdiomReplacement() {
    const run = state.run;
    const candidate = ALL_IDIOMS.find((idiom) => idiom.id === run?.pendingIdiomReplacementId);
    if (!run || !candidate) return;
    $("#idiom-replacement-title").textContent = `${candidate.name}을 고정할까요?`;
    $("#idiom-replacement-copy").textContent = "고정 연성식은 최대 4개입니다. 역할, 실제 발동 효과, 강화 단계와 현재 문자 큐 준비도를 비교하세요.";
    $("#idiom-replacement-candidate").innerHTML = idiomComparisonMarkup(candidate, { candidate: true });
    $("#idiom-replacement-options").innerHTML = run.activeIdiomIds
      .map((id, index) => idiomComparisonMarkup(ALL_IDIOMS.find((idiom) => idiom.id === id), { index }))
      .join("");
  }

  function finishIdiomReplacement(index = null) {
    const run = state.run;
    const candidateId = run?.pendingIdiomReplacementId;
    if (!run || !candidateId) return;
    const slotIndex = Number(index);
    if (index !== null && Number.isInteger(slotIndex) && run.activeIdiomIds[slotIndex]) {
      const replacedId = run.activeIdiomIds[slotIndex];
      run.activeIdiomIds[slotIndex] = candidateId;
      run.rewardHistory.push(`idiom-fixed-replace:${candidateId}:${replacedId}`);
      addLog(`<strong>${ALL_IDIOMS.find((idiom) => idiom.id === candidateId)?.name || "새 성어"}</strong> 고정 · ${ALL_IDIOMS.find((idiom) => idiom.id === replacedId)?.name || "기존 성어"}은 성어첩에 보관`, "alchemy");
    } else {
      run.rewardHistory.push(`idiom-fixed-keep:${candidateId}`);
      addLog(`<strong>현재 고정 연성식 유지</strong> · ${ALL_IDIOMS.find((idiom) => idiom.id === candidateId)?.name || "새 성어"}은 성어첩에 보관`, "alchemy");
    }
    run.pendingIdiomReplacementId = null;
    $("#idiom-replacement-modal").classList.remove("open");
    rebuildRunCharacterPool();
    audioDirector.playSfx("ui-confirm");
    advanceAfterRoguelikeReward();
  }

  async function chooseRoguelikeReward(id) {
    if (state.mode !== "roguelike" || !state.run?.pendingReward) return;
    const reward = state.run.rewardChoices.find((candidate) => candidate.id === id);
    if (!reward) return;
    if (rewardChoiceResolving) return;
    rewardChoiceResolving = true;
    const rewardModal = $("#roguelike-reward-modal");
    rewardModal?.setAttribute("aria-busy", "true");
    let handedOffRewardSelection = false;
    try {
      let selectionReceipt = null;
      if (reward.type === "fragment") {
        const legacySource = ["rare", "elite", "boss"].includes(reward.fragmentSource) ? reward.fragmentSource : "rare";
        const result = awardTalismanPieces(metaProgress.jaryeongMeta, { source: legacySource });
        if (!result.ok) return;
        metaProgress.jaryeongMeta = result.state;
        saveMetaProgress();
        state.run.rewardHistory.push(`talisman-piece:legacy:${result.award.amount}`);
        addLog(`<strong>이전 보상 호환</strong> · 통합 부적 조각 +${result.award.amount} · 누적 ${result.award.totalPieces}`, "victory");
      } else if (reward.type === "jaryeong") {
        const existingIndex = state.run.partyJaryeongIds.indexOf(id);
        if (existingIndex >= 0) {
          state.run.jaryeongLevels[id] = (state.run.jaryeongLevels[id] || 1) + 1;
          addLog(`<strong>${reward.hanja}령 중복 획득</strong> · 공격력 강화 · ${ELEMENT_PROC_RULES[reward.element].effect} 발동률 +1%p`, "victory");
        } else if (state.run.partyJaryeongIds.length < 5) {
          state.run.partyJaryeongIds.push(id);
          state.run.jaryeongLevels[id] = 1;
          state.run.jaryeongAwakenings = state.run.jaryeongAwakenings || {};
          state.run.jaryeongAwakenings[id] = metaProgress.jaryeongMeta?.owned?.[id]?.awakening || 0;
          state.run.skillCharges[id] = 0;
          rememberMeta("seenJaryeongs", id);
          addLog(`<strong>${reward.name} 부적 계약</strong> · ${reward.hanja} · ${reward.skillName} · ${ELEMENT_PROC_RULES[reward.element].effect} 발동률 +3%p`, "victory");
        } else {
          state.run.pendingContractJaryeongId = reward.id;
          renderJaryeongContract();
          $("#roguelike-reward-modal").classList.remove("open");
          $("#jaryeong-contract-modal").classList.add("open");
          $("#contract-duplicate-button").focus();
          saveActiveRun();
          handedOffRewardSelection = true;
          return;
        }
        state.run.rewardHistory.push(`jaryeong:${reward.id}`);
      } else if (reward.type === "idiom") {
        if (state.run.idiomBookIds.includes(reward.id)) return;
        if (state.run.idiomBookIds.length < RUN_LIMITS.idiomBookMax) {
          state.run.idiomBookIds.push(reward.id);
          const needsReplacement = state.run.activeIdiomIds.length >= RUN_LIMITS.activeIdiomMax
            && !state.run.activeIdiomIds.includes(reward.id);
          if (!needsReplacement && state.run.activeIdiomIds.length < RUN_LIMITS.activeIdiomMax) state.run.activeIdiomIds.push(reward.id);
          rememberMeta("seenIdioms", reward.id);
          addLog(`<strong>${reward.name}</strong> 성어 획득 · ${reward.desc}`, "alchemy");
          if (needsReplacement) {
            state.run.pendingIdiomReplacementId = reward.id;
            state.run.rewardHistory.push(`idiom:${reward.id}`);
            rebuildRunCharacterPool();
            renderIdiomReplacement();
            $("#roguelike-reward-modal").classList.remove("open");
            $("#idiom-replacement-modal").classList.add("open");
            $("#idiom-replacement-options [data-idiom-replace-index]")?.focus();
            saveActiveRun();
            handedOffRewardSelection = true;
            return;
          }
        } else {
          selectionReceipt = upgradeOwnedIdiom();
          if (selectionReceipt) addLog(`<strong>${selectionReceipt.name}</strong> 강화 · Lv.${selectionReceipt.before + 1} → Lv.${selectionReceipt.after + 1} · 효과 수치 ${selectionReceipt.beforeMultiplier}% → ${selectionReceipt.afterMultiplier}%`, "alchemy");
        }
        state.run.rewardHistory.push(`idiom:${reward.id}`);
      } else if (reward.type === "idiom-upgrade") {
        selectionReceipt = upgradeOwnedIdiom(reward.targetId);
        if (!selectionReceipt) return;
        state.run.rewardHistory.push(`idiom-upgrade:${selectionReceipt.targetId}:${selectionReceipt.after}`);
        addLog(`<strong>${selectionReceipt.name}</strong> 강화 · Lv.${selectionReceipt.before + 1} → Lv.${selectionReceipt.after + 1} · 효과 수치 ${selectionReceipt.beforeMultiplier}% → ${selectionReceipt.afterMultiplier}%`, "alchemy");
      } else {
        if (reward.type === "relic" && !state.run.relicIds.includes(reward.id)) state.run.relicIds.push(reward.id);
        applyRunEffects(reward.effects || []);
        state.run.rewardHistory.push(reward.id);
        addLog(`<strong>${reward.name}</strong> 획득 · ${reward.desc}`, "victory");
      }
      rebuildRunCharacterPool();
      audioDirector.playSfx("ui-confirm");
      if (selectionReceipt) await showSelectionReceipt("#roguelike-reward-modal", selectionReceipt);
      advanceAfterRoguelikeReward();
      } finally {
      if (!handedOffRewardSelection) {
        rewardChoiceResolving = false;
        rewardModal?.removeAttribute("aria-busy");
      }
    }
  }
  function finishRoguelikeRun(won, options = {}) {
    const canRevive = Boolean(options.canRevive && !won && !state.reviveUsed);
    state.gameOver = true;
    state.resolving = false;
    renderFirstBattleCoach();
    state.run && (state.run.completed = won || !canRevive);
    const durationMs = state.run ? Date.now() - state.run.startedAt : 0;
    if (state.run?.completed && !state.run.finalized) {
      state.run.finalized = true;
      const earnedInk = Math.max(8, (state.run.combatsWon || 0) * 4 + (won ? 24 : 0));
      metaProgress.ink += earnedInk;
      if (won) {
        metaProgress.completedRuns++;
        metaProgress.maxHpBonus = Math.min(5, Math.floor(metaProgress.completedRuns / 2));
        metaProgress.startShieldBonus = Math.min(5, Math.floor(metaProgress.completedRuns / 3));
        metaProgress.bestTimeMs = metaProgress.bestTimeMs == null ? durationMs : Math.min(metaProgress.bestTimeMs, durationMs);
      }
      rememberMeta("seenCharacters", state.run.characterPool);
      rememberMeta("seenJaryeongs", state.run.encounteredJaryeongIds);
      saveMetaProgress();
    }
    $("#roguelike-result-kicker").textContent = won ? "RUN COMPLETE · 연성 완료" : "RUN OVER · 연성 중단";
    $("#roguelike-result-title").textContent = won ? "연성행로를 돌파했습니다" : "연성행로가 끊겼습니다";
    $("#roguelike-result-copy").textContent = won
      ? `3막의 행로를 완주했습니다. ${(durationMs / 60000).toFixed(1)}분 · 먹 ${Math.max(8, (state.run?.combatsWon || 0) * 4 + 24)} 획득`
      : canRevive ? "한자 쓰기로 한 번 부활할 수 있습니다. 제출 버튼을 눌러 유사도를 확인하세요."
        : "다음 런에서는 다른 리더와 자령 공명으로 흐름을 바꿔 보세요.";
    $("#roguelike-result-battles").textContent = state.run?.combatsWon || 0;
    $("#roguelike-result-combos").textContent = state.totalCombos;
    $("#roguelike-result-idioms").textContent = state.totalIdioms;
    const pieceRewards = (state.run?.rewardHistory || []).filter((entry) => entry.startsWith("talisman-piece:"));
    const pieceTotal = pieceRewards.reduce((sum, entry) => sum + (Number(entry.split(":").at(-1)) || 0), 0);
    $("#roguelike-result-fragments").textContent = pieceTotal;
    $("#roguelike-result-build").textContent = state.run ? `리더 ${getLeaderJaryeong()?.name || "-"} · ${getPartyJaryeongs().map((jaryeong) => jaryeong.name).join(" · ")} · 희귀 진정 ${state.run.rareEncountersDefeated || 0} / 도주 ${state.run.rareEncountersEscaped || 0} · 통합 부적 조각 ${pieceTotal}개 · 성어 ${state.run.idiomBookIds.map((id) => ALL_IDIOMS.find((idiom) => idiom.id === id)?.name).filter(Boolean).join(" · ")}` : "-";
    $("#roguelike-result-party").innerHTML = getPartyJaryeongs().map((jaryeong, index) => `<span class="${jaryeong.element}"><small>${index === 0 ? "리더" : index + 1}</small>${tamedSpriteMarkup(jaryeong, { alt: jaryeong.name })}<b>${escapeHtml(jaryeong.name)}</b></span>`).join("");
    $("#roguelike-revive-result-button").hidden = !canRevive;
    const resultCard = $("#roguelike-result-modal .roguelike-result-card");
    if (resultCard) {
      resultCard.dataset.outcome = won ? "victory" : "defeat";
      resultCard.style.setProperty("--result-scene", `url("${won ? ASSET_MANIFEST.backgrounds.victory : ASSET_MANIFEST.backgrounds.defeat}")`);
    }
    $("#roguelike-result-modal").classList.add("open");
    audioDirector.playSfx(won ? "victory" : "defeat");
    if (won) void audioDirector.playBgm("victory");
    if (won || !canRevive) clearActiveRunSave();
    else saveActiveRun({ allowGameOver: true });
  }

  function grantCombatObjectiveVictoryReward(enemy) {
    if (state.mode !== "roguelike" || !state.run || !state.combatObjective) return null;
    recordCombatObjectiveEvent({
      type: COMBAT_OBJECTIVE_EVENT.BATTLE_WON,
      turn: state.turn,
      shield: state.shield
    });
    const objective = state.combatObjective;
    if (!isCombatObjectiveComplete(objective) || objective.rewardGranted) return null;
    const reward = resolveCombatObjectiveReward(objective, { encounteredJaryeongId: enemy?.jaryeongId });
    if (!reward) return null;
    let receipt = null;
    if (reward.kind === "ink") {
      state.run.ink += reward.amount;
      receipt = { kind: "ink", amount: reward.amount };
      addLog(`<strong>작은 목표 보상</strong> · ${objective.title} · 먹 +${reward.amount}`, "victory");
    }
    if (!receipt) return null;
    state.combatObjective = { ...state.combatObjective, rewardGranted: true, rewardReceipt: receipt };
    state.run.rewardHistory.push(`objective:${objective.id}:${receipt.kind}:${receipt.amount}`);
    renderCombatMission();
    return receipt;
  }

  async function nextWave() {
    const defeated = currentEnemy();
    persistActiveDebugEnemyMember();
    if (state.firstBattleOnboarding?.eligible && !state.firstBattleOnboarding.finished) {
      state.firstBattleOnboarding = advanceFirstBattleOnboarding(state.firstBattleOnboarding, {
        type: FIRST_BATTLE_ONBOARDING_EVENT.BATTLE_ENDED
      });
      renderFirstBattleCoach();
    }
    addLog(`<strong>${defeated.name}</strong>의 기운을 진정시켰습니다.`, "victory");
    if (isDebugMultiBattle()) {
      const group = state.debugEnemyGroup;
      const nextIndex = group.members.findIndex((member) => member.currentHp > 0);
      if (nextIndex >= 0) {
        await wait(260);
        loadDebugEnemyMember(nextIndex, { persist: false });
        updateAll();
        showBattleFeedback("player", "집중 대상 자동 변경", `${currentEnemy().name} · 남은 적 ${group.members.filter((member) => member.currentHp > 0).length}체`);
        addLog(`<strong>다수전</strong> · 살아 있는 ${currentEnemy().name}에게 집중 대상을 옮겼습니다.`, "start");
        return;
      }
      await wait(360);
      state.debugEnemyGroup = createDebugEnemyGroup();
      loadDebugEnemyMember(0, { persist: false });
      state.playerHp = Math.max(state.playerHp, Math.ceil(maxPlayerHp() * .65));
      clearEnemyBurn();
      state.enemyShield = 0;
      state.enemyElementBarrier = null;
      state.lockedTiles = new Map();
      state.gameOver = false;
      updateAll();
      showBattleFeedback("prepare", "다수전 시험 자동 복원", "3체 · 준비→합동 공격 2턴 주기 · 4개 이상 매치는 광역");
      addLog("<strong>다수전 시험실 복원</strong> · 같은 조건으로 집중·광역공격을 다시 확인할 수 있습니다.", "victory");
      return;
    }
    if (state.debugEnemyOverride) {
      await wait(360);
      state.enemyHp = defeated.hp;
      clearEnemyBurn();
      state.enemyShield = 0;
      state.enemyElementBarrier = createSoftElementBarrier({ hp: 48, preferredElement: "water", breakMultiplier: 2 });
      state.lockedTiles = new Map();
      state.activeSealVisual = "seal";
      resetEnemyPlan();
      updateAll();
      showBattleFeedback("prepare", "시험령 재소환", "같은 조건으로 연성막·봉인·문자 큐 제거를 다시 시험할 수 있습니다.");
      addLog("<strong>시험실 자동 복원</strong> · 수 속성 연성막 48 · 모든 속성 유효 · 수 파괴력 ×2", "water");
      return;
    }
    if (state.mode === "roguelike") {
      grantCombatObjectiveVictoryReward(defeated);
      if (state.rareEncounter?.status === "active") {
        state.rareEncounter = {
          ...state.rareEncounter,
          status: "defeated",
          enemyHp: 0,
          outcome: { kind: "defeated", success: true, rewardEligible: true, runContinues: true, runEnded: false }
        };
        state.run.rareEncountersDefeated = (state.run.rareEncountersDefeated || 0) + 1;
        state.run.rewardHistory.push(`rare-defeated:${defeated.jaryeongId || defeated.id}`);
      }
      state.run.combatsWon++;
      state.run.battleIndex = state.run.combatsWon;
      const talismanDropSource = defeated.kind === "boss" ? "boss" : defeated.kind === "elite" ? "elite" : defeated.rare ? "rare" : null;
      if (talismanDropSource) {
        const pieceResult = awardTalismanPieces(metaProgress.jaryeongMeta, { source: talismanDropSource });
        if (pieceResult.ok) {
          metaProgress.jaryeongMeta = pieceResult.state;
          saveMetaProgress();
          state.run.rewardHistory.push(`talisman-piece:${talismanDropSource}:${pieceResult.award.amount}`);
          const sourceLabel = talismanDropSource === "boss" ? "보스" : talismanDropSource === "elite" ? "정예" : "희귀";
          addLog(`<strong>${sourceLabel} 전리품</strong> · 부적 조각 +${pieceResult.award.amount} · 누적 ${pieceResult.award.totalPieces}`, "victory");
          showBattleFeedback("drop", `부적 조각 +${pieceResult.award.amount}`, `${sourceLabel} 자령 드랍 · 누적 ${pieceResult.award.totalPieces}/10 · 소환권으로 교환 가능`);
          await showBattleLootCeremony({
            kind: "talisman",
            kicker: `${sourceLabel} 전리품`,
            title: `부적 조각 +${pieceResult.award.amount}`,
            detail: `현재 ${pieceResult.award.totalPieces}개 · 10개를 모으면 소환권 1장으로 교환`
          });
        }
      }
      await wait(400);
      const tier = currentRouteTier();
      const node = tier?.choices.find((candidate) => candidate.id === state.run.currentNodeId);
      if (node?.type === "boss" && node.act === 3) {
        completeCurrentRunNode();
      } else {
        openRoguelikeReward();
      }
      return;
    }
    await wait(650);
    if (state.wave >= ENEMIES.length - 1) {
      finishGame(true); return;
    }
    state.wave++;
    state.enemyHp = ENEMIES[state.wave].hp;
    state.delayed = 0;
    clearEnemyBurn();
    state.enemyShield = 0;
    state.enemyElementBarrier = null;
    state.enemyVulnerableTurns = 0;
    state.enemyVulnerableRatio = 0;
    state.enemySilenced = 0;
    state.healReductionTurns = 0;
    state.healReductionRatio = 0;
    state.reflectNextEnemyAttack = null;
    state.nextEnemyDamageReduction = 0;
    state.lockedTiles = new Map();
    state.activeSealVisual = "seal";
    state.nextElementBoosts = {};
    if (state.mode === "puzzle") refreshRotatingIdioms({ force: true, announce: true });
    resetEnemyPlan();
    updateVitals();
    addLog(`<strong>${ENEMIES[state.wave].name}</strong> 등장 · 다음 진정을 준비하세요.`, "start");
  }

  async function handleDefeat() {
    if (state.phoenixRebirthReady > 0) {
      const counterDamage = state.phoenixRebirthReady;
      state.phoenixRebirthReady = 0;
      state.playerHp = Math.max(1, Math.ceil(maxPlayerHp() * .35));
      state.gameOver = false;
      const dealt = applyDamage(counterDamage, "봉염 귀환", { ignoreVulnerability: true, ignoreShield: true, element: "fire", feedbackKind: "player" });
      addLog(`<strong>봉염 귀환</strong> · 체력 ${state.playerHp}로 부활 · 반격 ${dealt}`, "fire");
      updateAll();
      if (state.enemyHp <= 0) await nextWave();
      return;
    }
    if (!state.reviveUsed) {
      state.gameOver = true;
      state.resolving = false;
      if (state.mode === "roguelike") finishRoguelikeRun(false, { canRevive: true });
      else finishGame(false, { canRevive: true });
    } else if (state.mode === "roguelike") finishRoguelikeRun(false);
    else finishGame(false);
  }

  function finishGame(won, options = {}) {
    const canRevive = Boolean(options.canRevive && !won && !state.reviveUsed);
    state.gameOver = true; state.resolving = false;
    $("#result-kicker").textContent = won ? "연성 완료" : "연성 중단";
    $("#result-title").textContent = won ? "봉인 안정화가 완료되었습니다" : "뜻의 불꽃이 사그라들었습니다";
    $("#result-copy").textContent = won
      ? "진정한 자령의 기운이 가라앉고 봉인이 안정되었습니다."
      : canRevive ? "한자 쓰기로 한 번 부활할 수 있습니다. 제출 버튼을 눌러 유사도를 확인하세요."
        : "색과 글자의 흐름을 바꾸어 다시 도전해 보세요.";
    $("#result-turns").textContent = state.turn;
    $("#result-combos").textContent = state.totalCombos;
    $("#result-idioms").textContent = state.totalIdioms;
    $("#revive-result-button").hidden = !canRevive;
    const resultCard = $("#result-modal .result-card");
    if (resultCard) resultCard.dataset.outcome = won ? "victory" : "defeat";
    $("#result-modal").classList.add("open");
  }

  function addLog(html, type = "") {
    const log = $("#battle-log");
    const entry = document.createElement("div");
    entry.className = `log-entry ${type}`;
    const glyphs = { start: "門", combo: "連", alchemy: "成", enemy: "敵", water: "水", fire: "火", victory: "勝", miss: "空" };
    entry.innerHTML = `<b>${glyphs[type] || "記"}</b><p>${html}</p>`;
    log.prepend(entry);
    while (log.children.length > 7) log.lastElementChild.remove();
    syncCombatHud();
  }

  const REVIVE_TRACE = { char: "字", reading: "글자 자", hun: "글자", eum: "자", width: 720, height: 460 };
  const trace = {
    drawing: false,
    tool: null,
    lastPoint: null,
    strokes: [],
    currentStroke: null,
    passed: false,
    submitted: false,
    lastProgressAt: 0,
    targetCanvas: null,
    paintCanvas: null,
    strokeCanvas: null,
    targetPixels: 0
  };

  function chooseReviveTraceCharacter() {
    const choice = randomOf(REVIVE_CHARACTER_POOL) || { char: "福", reading: "복 복", hun: "복", eum: "복" };
    REVIVE_TRACE.char = choice.char;
    REVIVE_TRACE.reading = choice.reading;
    REVIVE_TRACE.hun = choice.hun;
    REVIVE_TRACE.eum = choice.eum;
    $("#revive-title").textContent = `${choice.char}자를 따라 써 보세요`;
    $("#revive-study-char").textContent = choice.char;
    $("#revive-hun").textContent = choice.hun;
    $("#revive-eum").textContent = choice.eum;
    $("#revive-hun-eum").textContent = choice.reading;
    const studyLabel = `${choice.char}, 훈 ${choice.hun}, 음 ${choice.eum}, 훈음 ${choice.reading}`;
    $("#revive-reading-guide").setAttribute("aria-label", studyLabel);
    $("#revive-canvas").setAttribute("aria-label", `${studyLabel} 따라쓰기`);
    $("#trace-stage").setAttribute("aria-label", `반투명한 ${studyLabel} 글자를 따라 그리기`);
  }

  function traceFont() {
    return `700 ${Math.round(REVIVE_TRACE.height * .76)}px "Gowun Batang", serif`;
  }

  function drawTracePath(context, points, lineWidth, strokeStyle) {
    if (!points?.length) return;
    context.save();
    context.lineWidth = lineWidth;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.strokeStyle = strokeStyle;
    context.beginPath();
    context.moveTo(points[0].x, points[0].y);
    if (points.length === 1) {
      context.lineTo(points[0].x + .01, points[0].y + .01);
    } else {
      for (let i = 1; i < points.length; i++) context.lineTo(points[i].x, points[i].y);
    }
    context.stroke();
    context.restore();
  }

  function drawTraceTarget(context, muted = false) {
    context.save();
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.font = traceFont();
    context.fillStyle = muted ? "rgba(35,57,49,.1)" : "rgba(35,57,49,.16)";
    context.fillText(REVIVE_TRACE.char, REVIVE_TRACE.width / 2, REVIVE_TRACE.height / 2 + 8);
    context.lineWidth = 2;
    context.strokeStyle = "rgba(172,127,44,.2)";
    context.strokeText(REVIVE_TRACE.char, REVIVE_TRACE.width / 2, REVIVE_TRACE.height / 2 + 8);
    context.restore();
  }

  function ensureTraceCanvases() {
    const canvas = $("#revive-canvas");
    if (!canvas) return null;
    canvas.width = REVIVE_TRACE.width;
    canvas.height = REVIVE_TRACE.height;
    trace.targetCanvas = document.createElement("canvas");
    trace.targetCanvas.width = REVIVE_TRACE.width;
    trace.targetCanvas.height = REVIVE_TRACE.height;
    trace.paintCanvas = document.createElement("canvas");
    trace.paintCanvas.width = REVIVE_TRACE.width;
    trace.paintCanvas.height = REVIVE_TRACE.height;
    trace.strokeCanvas = document.createElement("canvas");
    trace.strokeCanvas.width = REVIVE_TRACE.width;
    trace.strokeCanvas.height = REVIVE_TRACE.height;
    const targetContext = trace.targetCanvas.getContext("2d", { willReadFrequently: true });
    targetContext.clearRect(0, 0, REVIVE_TRACE.width, REVIVE_TRACE.height);
    targetContext.textAlign = "center";
    targetContext.textBaseline = "middle";
    targetContext.font = traceFont();
    targetContext.fillStyle = "#fff";
    targetContext.fillText(REVIVE_TRACE.char, REVIVE_TRACE.width / 2, REVIVE_TRACE.height / 2 + 8);
    const pixels = targetContext.getImageData(0, 0, REVIVE_TRACE.width, REVIVE_TRACE.height).data;
    trace.targetPixels = 0;
    for (let y = 0; y < REVIVE_TRACE.height; y += 4) {
      for (let x = 0; x < REVIVE_TRACE.width; x += 4) {
        if (pixels[(y * REVIVE_TRACE.width + x) * 4 + 3] > 40) trace.targetPixels++;
      }
    }
    return canvas;
  }

  function renderTraceCanvas() {
    const canvas = $("#revive-canvas");
    if (!canvas || !trace.targetCanvas) return;
    const context = canvas.getContext("2d");
    context.clearRect(0, 0, REVIVE_TRACE.width, REVIVE_TRACE.height);
    drawTraceTarget(context);
    if (trace.paintCanvas) context.drawImage(trace.paintCanvas, 0, 0);
  }

  function resetTraceCanvas() {
    const canvas = ensureTraceCanvases();
    if (!canvas) return;
    trace.drawing = false;
    trace.tool = null;
    trace.lastPoint = null;
    trace.strokes = [];
    trace.currentStroke = null;
    trace.passed = false;
    trace.submitted = false;
    trace.lastProgressAt = 0;
    trace.paintCanvas.getContext("2d").clearRect(0, 0, REVIVE_TRACE.width, REVIVE_TRACE.height);
    trace.strokeCanvas.getContext("2d").clearRect(0, 0, REVIVE_TRACE.width, REVIVE_TRACE.height);
    canvas.classList.remove("passed", "erasing");
    $("#trace-reset").disabled = false;
    $("#trace-submit").disabled = false;
    renderTraceCanvas();
    updateTraceProgress(true);
  }

  function setupTrace() {
    resetTraceCanvas();
  }

  function tracePoint(event) {
    const canvas = $("#revive-canvas");
    const rect = canvas.getBoundingClientRect();
    return {
      x: clamp((event.clientX - rect.left) * REVIVE_TRACE.width / rect.width, 0, REVIVE_TRACE.width),
      y: clamp((event.clientY - rect.top) * REVIVE_TRACE.height / rect.height, 0, REVIVE_TRACE.height)
    };
  }

  function drawTraceSegment(from, to) {
    const visible = $("#revive-canvas").getContext("2d");
    drawTracePath(visible, [from, to], 24, "rgba(178,112,30,.78)");
    const paint = trace.paintCanvas.getContext("2d");
    drawTracePath(paint, [from, to], 24, "rgba(178,112,30,.78)");
    const mask = trace.strokeCanvas.getContext("2d");
    drawTracePath(mask, [from, to], 34, "rgba(255,255,255,1)");
  }

  function eraseTracePath(context, from, to, lineWidth) {
    context.save();
    context.globalCompositeOperation = "destination-out";
    drawTracePath(context, [from, to], lineWidth, "rgba(0,0,0,1)");
    context.restore();
  }

  function eraseTraceSegment(from, to) {
    eraseTracePath(trace.paintCanvas.getContext("2d"), from, to, 48);
    eraseTracePath(trace.strokeCanvas.getContext("2d"), from, to, 58);
    renderTraceCanvas();
  }

  function traceSimilarity() {
    if (!trace.targetCanvas || !trace.strokeCanvas || !trace.targetPixels) return { coverage: 0, precision: 0, score: 0, drawn: 0 };
    const target = trace.targetCanvas.getContext("2d").getImageData(0, 0, REVIVE_TRACE.width, REVIVE_TRACE.height).data;
    const drawn = trace.strokeCanvas.getContext("2d").getImageData(0, 0, REVIVE_TRACE.width, REVIVE_TRACE.height).data;
    let targetCount = 0, overlap = 0, drawnCount = 0;
    for (let y = 0; y < REVIVE_TRACE.height; y += 4) {
      for (let x = 0; x < REVIVE_TRACE.width; x += 4) {
        const index = (y * REVIVE_TRACE.width + x) * 4;
        const targetOn = target[index + 3] > 40;
        const drawnOn = drawn[index + 3] > 20;
        if (targetOn) targetCount++;
        if (drawnOn) drawnCount++;
        if (targetOn && drawnOn) overlap++;
      }
    }
    return scoreReviveTrace({ targetCount, overlap, drawnCount });
  }

  function updateTraceProgress(force = false) {
    const now = performance.now();
    if (!force && now - trace.lastProgressAt < 90) return;
    trace.lastProgressAt = now;
    const metrics = traceSimilarity();
    const score = Math.round(metrics.score * 100);
    const progress = $("#trace-progress");
    progress.classList.toggle("pass", trace.passed);
    progress.classList.toggle("fail", trace.submitted && !trace.passed);
    if (trace.passed) {
      progress.textContent = `통과 · 유사도 ${score}% · ${REVIVE_TRACE.char}, ${REVIVE_TRACE.reading} 자형이 이어졌습니다.`;
    } else if (trace.submitted) {
      progress.textContent = metrics.drawn
        ? `제출 결과 ${score}% · 획을 더 채운 뒤 다시 제출하세요.`
        : "제출 결과 0% · 아직 쓴 획이 없습니다. 글자를 따라 쓴 뒤 다시 제출하세요.";
    } else if (!metrics.drawn) {
      progress.textContent = "반투명 글자를 따라 써 주세요 · 모두 쓴 뒤 제출하세요.";
    } else {
      progress.textContent = `현재 ${score}% · 글자 획을 더 채운 뒤 제출하세요.`;
    }
  }

  function judgeTrace() {
    const metrics = traceSimilarity();
    const pass = passesReviveTrace(metrics);
    if (!pass) {
      updateTraceProgress(true);
      return false;
    }
    trace.passed = true;
    $("#revive-canvas").classList.add("passed");
    $("#trace-reset").disabled = true;
    $("#trace-submit").disabled = true;
    updateTraceProgress(true);
    return true;
  }

  function submitTrace() {
    if (!$("#revive-modal").classList.contains("open") || trace.passed) return;
    trace.submitted = true;
    if (judgeTrace()) completeRevive();
    else updateTraceProgress(true);
  }

  function beginTrace(event) {
    if ((state.mode !== "puzzle" && state.mode !== "roguelike") || !$("#revive-modal").classList.contains("open") || trace.passed) return;
    if (event.pointerType === "mouse" && event.button !== 0 && event.button !== 2) return;
    event.preventDefault();
    const point = tracePoint(event);
    const erasing = event.pointerType === "mouse" && event.button === 2;
    trace.drawing = true;
    trace.tool = erasing ? "erase" : "draw";
    trace.lastPoint = point;
    trace.currentStroke = erasing ? null : [point];
    if (trace.currentStroke) trace.strokes.push(trace.currentStroke);
    const canvas = $("#revive-canvas");
    canvas.classList.toggle("erasing", erasing);
    canvas.setPointerCapture?.(event.pointerId);
    if (erasing) eraseTraceSegment(point, point);
    else drawTraceSegment(point, point);
    updateTraceProgress(true);
  }

  function moveTrace(event) {
    if (!trace.drawing || trace.passed) return;
    event.preventDefault();
    const point = tracePoint(event);
    const previous = trace.lastPoint || trace.currentStroke?.at(-1);
    if (!previous || Math.hypot(point.x - previous.x, point.y - previous.y) < 1) return;
    if (trace.tool === "erase") eraseTraceSegment(previous, point);
    else {
      trace.currentStroke.push(point);
      drawTraceSegment(previous, point);
    }
    trace.lastPoint = point;
    updateTraceProgress();
  }

  function endTrace(event) {
    if (!trace.drawing) return;
    event?.preventDefault();
    trace.drawing = false;
    trace.tool = null;
    trace.lastPoint = null;
    const canvas = $("#revive-canvas");
    canvas.classList.remove("erasing");
    canvas.releasePointerCapture?.(event?.pointerId);
    updateTraceProgress(true);
    trace.currentStroke = null;
  }

  function completeRevive() {
    if (!trace.passed || !$("#revive-modal").classList.contains("open")) return;
    trace.drawing = false;
    $("#revive-modal").classList.remove("open");
    state.reviveUsed = true;
    state.gameOver = false;
    state.resolving = false;
    if (state.run) state.run.completed = false;
    state.playerHp = Math.max(30, Math.round(maxPlayerHp() * .3));
    state.shield = 0;
    gainShield(12);
    audioDirector.playSfx("revive-brush");
    addLog(`<strong>${escapeHtml(REVIVE_TRACE.char)} · ${escapeHtml(REVIVE_TRACE.reading)}</strong> · 생명력 ${state.playerHp}으로 다시 일어났습니다.`, "alchemy");
    updateAll();
  }

  function openReviveFromGameOver() {
    if (!state.gameOver || state.reviveUsed || state.playerHp > 0 || !debugCombatAllowed()) return;
    $("#result-modal").classList.remove("open");
    $("#roguelike-result-modal").classList.remove("open");
    chooseReviveTraceCharacter();
    setupTrace();
    $("#revive-modal").classList.add("open");
    $("#trace-submit").focus();
  }

  function closeGameOverlays() {
    document.querySelectorAll(".modal.open").forEach((modal) => modal.classList.remove("open"));
  }

  const dialogFocusReturn = new WeakMap();
  let previousOpenDialogs = new Set();

  function openDialogs() {
    return [...document.querySelectorAll('[role="dialog"]')].filter((dialog) => dialog.classList.contains("open"));
  }

  function focusableElements(dialog) {
    return [...dialog.querySelectorAll('button:not([disabled]):not([hidden]),input:not([disabled]):not([hidden]),select:not([disabled]):not([hidden]),[tabindex]:not([tabindex="-1"])')]
      .filter((element) => !element.closest('[hidden]') && element.getClientRects().length > 0);
  }

  function syncDialogAccessibility() {
    const dialogs = [...document.querySelectorAll('[role="dialog"]')];
    const opened = openDialogs();
    const openedSet = new Set(opened);
    const top = opened.at(-1) || null;
    dialogs.forEach((dialog) => {
      const active = dialog === top;
      dialog.setAttribute("aria-hidden", String(!active));
      dialog.inert = !active;
      if (active && !previousOpenDialogs.has(dialog)) dialogFocusReturn.set(dialog, document.activeElement);
    });
    const gameShell = $(".game-shell");
    if (gameShell) gameShell.inert = Boolean(top);
    if (top && !top.contains(document.activeElement)) {
      setTimeout(() => {
        if (top.classList.contains("open") && !top.contains(document.activeElement)) {
          focusableElements(top)[0]?.focus({ preventScroll: true });
        }
      }, 0);
    } else if (!top) {
      const closed = [...previousOpenDialogs].reverse().find((dialog) => !openedSet.has(dialog));
      const returnTarget = closed ? dialogFocusReturn.get(closed) : null;
      if (returnTarget?.isConnected && !returnTarget.closest('[aria-hidden="true"]')) {
        setTimeout(() => returnTarget.focus({ preventScroll: true }), 0);
      }
    }
    previousOpenDialogs = openedSet;
  }

  function handleDialogKeyboard(event) {
    const dialog = openDialogs().at(-1);
    if (!dialog) return false;
    if (event.key === "Tab") {
      const focusables = focusableElements(dialog);
      if (!focusables.length) { event.preventDefault(); return true; }
      const first = focusables[0];
      const last = focusables.at(-1);
      if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
      return true;
    }
    if (event.key !== "Escape") return false;
    const closers = {
      "settings-modal": closeSettings,
      "intro-modal": closeStoryHelp,
      "idiom-detail-modal": closeIdiomDetail,
      "glossary-modal": closeGlossary,
      "debug-modal": closeDebug,
      "codex-modal": closeCodex,
      "jaryeong-meta-modal": closeJaryeongMeta,
      "jaryeong-summon-result-modal": () => $("#jaryeong-summon-result-modal").classList.remove("open")
    };
    const close = dialog.id === "intro-modal" && !state.storySession ? null : closers[dialog.id];
    if (!close) return false;
    event.preventDefault();
    close();
    if (dialog.id !== "intro-modal") audioDirector.playSfx("ui-cancel");
    return true;
  }

  function initializeDialogAccessibility() {
    const observer = new MutationObserver(syncDialogAccessibility);
    document.querySelectorAll('[role="dialog"]').forEach((dialog) => observer.observe(dialog, { attributes: true, attributeFilter: ["class"] }));
    syncDialogAccessibility();
  }

  function enterPuzzleMode() {
    closeCombatHudPanels();
    closeGameOverlays();
    $("#main-menu").classList.remove("open");
    document.body.classList.remove("menu-mode", "pang-mode", "roguelike-mode");
    document.body.classList.add("puzzle-mode");
    state.mode = "puzzle";
    state.storySession = null;
    $("#mode-kicker").textContent = "STORY TUTORIAL";
    resetGame();
    selectedStoryChapterId = getDefaultStoryChapterId();
    selectStoryChapter(selectedStoryChapterId);
    $("#intro-modal").classList.remove("help-context");
    $("#story-help-return").hidden = true;
    $("#intro-modal").classList.add("open");
  }

  function beginStoryChapter(chapterId = selectedStoryChapterId) {
    if (!selectStoryChapter(chapterId)) return;
    const chapter = getStoryTrainingChapter(chapterId);
    const presentation = STORY_PRESENTATION[chapterId];
    state.storySession = createStoryTrainingSession(chapterId);
    if (chapter.objective.event === STORY_TRAINING_EVENT.JOURNEY_OPENED) {
      openStoryJourneyPreparation();
      return;
    }
    resetGame();
    prepareStoryIdiomLesson(chapterId);
    prepareStoryBoard(chapterId);
    const storyGuide = activeStoryPathGuide();
    if (storyGuide?.path?.length) state.keyboardFocus = { r: storyGuide.path[0][0], c: storyGuide.path[0][1] };
    $("#intro-modal").classList.remove("open", "help-context");
    $("#story-help-return").hidden = true;
    addLog(`<strong>제${chapter.number}장 · ${chapter.title}</strong> · ${presentation.startLog}`, "start");
    updateAll();
    $("#board .story-guide-start")?.focus({ preventScroll: true });
  }

  function openStoryJourneyPreparation() {
    if (state.mode !== "puzzle" || state.storySession?.status !== "active") return false;
    const chapter = getStoryTrainingChapter(state.storySession.chapterId);
    if (chapter?.objective.event !== STORY_TRAINING_EVENT.JOURNEY_OPENED) return false;
    state.storySession = applyStoryTrainingEvent(state.storySession, { type: STORY_TRAINING_EVENT.JOURNEY_OPENED, count: 1 });
    if (state.storySession.status !== "complete") return false;
    if (!storyProgress.completedChapterIds.includes(state.storySession.chapterId)) {
      storyProgress = completeStoryTrainingChapter(storyProgress, state.storySession);
      saveStoryProgress();
    }
    syncStoryMenuStatus();
    state.storySession = null;
    enterRoguelikeMode({ fromStoryGraduation: true });
    return true;
  }

  function finishStoryTrainingEvent(event, completionFeedback = null) {
    if (state.mode !== "puzzle" || state.storySession?.status !== "active") return false;
    const chapterId = state.storySession.chapterId;
    const chapter = getStoryTrainingChapter(chapterId);
    const presentation = STORY_PRESENTATION[chapterId];
    state.storySession = applyStoryTrainingEvent(state.storySession, event);
    if (state.storySession.status !== "complete") return false;
    storyProgress = completeStoryTrainingChapter(storyProgress, state.storySession);
    saveStoryProgress();
    syncStoryMenuStatus();
    state.gameOver = true;
    state.resolving = false;
    addLog(`<strong>제${chapter.number}장 완료</strong> · ${presentation.resultCopy}`, "alchemy");
    showBattleFeedback("player", `제${chapter.number}장 완료`, completionFeedback || `${presentation.resultTitle} · 적의 반격 없이 수련을 마칩니다`);
    updateAll();
    audioDirector.playSfx("reward");
    $("#story-result-kicker").textContent = `第${["壹", "貳", "參", "肆", "伍", "陸"][chapter.number - 1] || chapter.number}章 完 · 수련 완료`;
    $("#story-result-title").textContent = presentation.resultTitle;
    $("#story-result-copy").textContent = presentation.resultCopy;
    $("#story-lesson-recap").innerHTML = presentation.recap.map(([number, label]) => `<span><b>${number}</b>${label}</span>`).join("");
    $("#story-replay-button").textContent = `제${chapter.number}장 다시 하기`;
    const nextChapter = STORY_TRAINING_CHAPTERS.find((entry) => entry.number === chapter.number + 1 && IMPLEMENTED_STORY_CHAPTER_IDS.has(entry.id) && isStoryTrainingChapterUnlocked(storyProgress, entry.id));
    const journeyButton = $("#story-journey-button");
    journeyButton.dataset.nextChapter = nextChapter?.id || "";
    journeyButton.innerHTML = nextChapter ? `제${nextChapter.number}장 계속하기 <span>→</span>` : `연성행로 구경하기 <span>行</span>`;
    $("#story-result-modal").classList.add("open");
    return true;
  }

  function restartLongDragLessonIfNeeded(comboCount) {
    if (state.mode !== "puzzle" || state.storySession?.status !== "active" || state.storySession.chapterId !== "five-lights" || comboCount >= 2) return false;
    beginStoryChapter("five-lights");
    const detail = comboCount > 0
      ? `${comboCount}콤보까지 만들었습니다. 시작 타일을 놓지 말고 표시된 길 끝까지 이어가세요.`
      : "매치가 만들어지기 전에 놓았습니다. 시작 타일을 잡은 채 위 → 왼쪽 → 왼쪽까지 이어가세요.";
    addLog(`<strong>경로 수련 다시 보기</strong> · ${detail}`, "miss");
    showBattleFeedback("player", "손을 떼지 마세요", `${detail} 이 장에서는 실패해도 적이 반격하지 않습니다.`);
    updateAll();
    return true;
  }

  function finishStoryTrainingTurn(comboCount, removedTiles, activatedIdioms = []) {
    if (state.mode !== "puzzle" || state.storySession?.status !== "active") return false;
    const chapter = getStoryTrainingChapter(state.storySession.chapterId);
    const event = chapter.objective.event === STORY_TRAINING_EVENT.COMBO
      ? { type: STORY_TRAINING_EVENT.COMBO, value: comboCount }
      : chapter.objective.event === STORY_TRAINING_EVENT.QUEUE
        ? { type: STORY_TRAINING_EVENT.QUEUE, values: removedTiles.map((tile) => tile.char) }
        : chapter.objective.event === STORY_TRAINING_EVENT.IDIOM
          ? { type: STORY_TRAINING_EVENT.IDIOM, values: activatedIdioms.map((idiom) => idiom.id) }
          : { type: STORY_TRAINING_EVENT.MATCH, count: comboCount > 0 ? 1 : 0 };
    return finishStoryTrainingEvent(event);
  }

  function finishStoryTrainingGuardHit(intent, absorbed, hpDamage, event = null) {
    const lesson = getActiveStoryGuardLesson();
    if (!lesson) return false;
    const guardEvent = event || evaluateStoryTrainingGuardHit({
      chapterId: state.storySession?.chapterId,
      intentId: intent?.id,
      absorbed,
      hpDamage
    });
    if (!guardEvent.count) {
      addLog(`<strong>수련 판정</strong> · 보호막이 ${lesson.damage} 피해를 모두 막지 못했습니다. 토 매치로 다시 보호막을 만드세요.`, "miss");
      return false;
    }
    return finishStoryTrainingEvent(guardEvent, `보호막이 ${lesson.damage}을 모두 막음 · 체력 피해 없음`);
  }

  function replayStoryChapter() {
    $("#story-result-modal").classList.remove("open");
    beginStoryChapter(state.storySession?.chapterId || selectedStoryChapterId);
  }

  function advanceFromStoryResult() {
    const nextChapterId = $("#story-journey-button").dataset.nextChapter;
    $("#story-result-modal").classList.remove("open");
    if (!nextChapterId) {
      enterRoguelikeMode();
      return;
    }
    state.storySession = null;
    selectedStoryChapterId = nextChapterId;
    selectStoryChapter(nextChapterId);
    $("#intro-modal").classList.add("open");
  }

  function closeStoryHelp() {
    if (state.mode !== "puzzle" || !state.storySession) return;
    $("#intro-modal").classList.remove("open", "help-context");
    $("#story-help-return").hidden = true;
    $("#help-button")?.focus({ preventScroll: true });
    audioDirector.playSfx("ui-cancel");
  }

  function enterPangMode() {
    if (PRODUCTION_BUILD) return;
    closeCombatHudPanels();
    closeGameOverlays();
    $("#main-menu").classList.remove("open");
    document.body.classList.remove("menu-mode", "puzzle-mode", "roguelike-mode");
    document.body.classList.add("pang-mode");
    state.mode = "pang";
    $("#mode-kicker").textContent = "PANG MODE";
    $("#mode-title").textContent = "60초 연타전";
    preparePangMode();
    $("#pang-intro-modal").classList.add("open");
  }

  function setStoryGraduationBannerVisible(visible = false) {
    const banner = $("#story-graduation-banner");
    if (banner) banner.hidden = !visible;
    $("#roguelike-intro-modal")?.classList.toggle("story-graduation-context", Boolean(visible));
  }

  function getRoguelikeEntryOptions(options) {
    return {
      fromStoryGraduation: Boolean(options && typeof options === "object" && options.fromStoryGraduation === true)
    };
  }

  function enterRoguelikeMode(options) {
    const { fromStoryGraduation } = getRoguelikeEntryOptions(options);
    closeCombatHudPanels();
    closeGameOverlays();
    $("#main-menu").classList.remove("open");
    document.body.classList.remove("menu-mode", "puzzle-mode", "pang-mode");
    document.body.classList.add("roguelike-mode");
    state.mode = "roguelike";
    state.run = null;
    renderFirstBattleCoach();
    $("#mode-kicker").textContent = "ROGUELIKE MODE";
    $("#mode-title").textContent = "연성행로";
    renderVolumeOptions();
    syncRunSaveControls();
    const savedRun = readActiveRunSave();
    renderPreparedParty(savedRun?.run?.partyJaryeongIds || null);
    updateRoguelikeHud();
    $("#roguelike-intro-modal").classList.remove("help-context");
    $("#roguelike-help-return").hidden = true;
    setStoryGraduationBannerVisible(fromStoryGraduation);
    $("#roguelike-intro-modal").classList.add("open");
  }

  function returnToMenu() {
    closeCombatHudPanels();
    saveActiveRun({ allowGameOver: state.gameOver && !state.run?.completed });
    clearInterval(state.timerId); clearInterval(state.pangTimerId);
    state.timerId = null; state.pangTimerId = null;
    state.dragging = false; state.dragMoved = false; state.resolving = false; state.jaryeongSkillAnimating = false; state.pangRunning = false; state.gameOver = true;
    const cutin = $("#jaryeong-skill-cutin");
    if (cutin) { cutin.classList.remove("show"); cutin.hidden = true; }
    state.selected = null; state.mode = null; state.run = null; state.storySession = null;
    state.debugEnemyOverride = null;
    state.debugEnemyGroup = null;
    state.enemyElementBarrier = null;
    state.swapAnimationUntil = 0;
    renderFirstBattleCoach();
    setStoryGraduationBannerVisible(false);
    clearDragPreview();
    $("#cursor-timer").classList.remove("active", "danger");
    closeGameOverlays();
    document.body.classList.remove("puzzle-mode", "pang-mode", "roguelike-mode", "debug-trial-mode", "debug-multi-mode");
    document.body.classList.add("menu-mode");
    $("#main-menu").classList.add("open");
    renderPreparedParty();
    syncStoryMenuStatus();
    syncRunSaveControls();
    void audioDirector.playBgm("menu", { immediate: true });
  }

  function resetCurrentMode() {
    if (state.mode === "pang") {
      preparePangMode();
      $("#pang-intro-modal").classList.add("open");
    } else if (state.mode === "puzzle") beginStoryChapter(state.storySession?.chapterId || selectedStoryChapterId);
    else if (state.mode === "roguelike") {
      setStoryGraduationBannerVisible(false);
      clearActiveRunSave({ sync: false });
      prepareRoguelikeRun();
      syncRunSaveControls();
      $("#roguelike-intro-modal").classList.add("open");
    }
  }

  function bindEvents() {
    const board = $("#board");
    document.addEventListener("pointerdown", () => {
      audioDirector.unlock();
      void audioDirector.playBgm(state.mode === "roguelike" && state.run ? `act-${state.run.act || 1}` : "menu", { immediate: true });
    }, { once: true, capture: true });
    document.addEventListener("pointerover", (event) => {
      if (event.pointerType && event.pointerType !== "mouse") return;
      const button = event.target.closest?.("button:not(:disabled):not(.tile)");
      if (button && !button.contains(event.relatedTarget)) audioDirector.playSfx("ui-hover");
    });
    document.addEventListener("keydown", handleDialogKeyboard);
    board.addEventListener("pointerdown", beginDrag);
    board.addEventListener("pointermove", (event) => { if (state.mode === "pang") dragMove(event); });
    board.addEventListener("pointerup", (event) => { if (state.mode === "pang") endDrag(event); });
    board.addEventListener("pointercancel", (event) => { if (state.mode === "pang") endDrag(event); });
    board.addEventListener("lostpointercapture", finishDragAfterPointerLoss);
    board.addEventListener("keydown", handleBoardKeyboard);
    document.addEventListener("pointermove", (event) => { if (state.mode === "puzzle" || state.mode === "roguelike") dragMove(event); });
    document.addEventListener("pointerup", (event) => { if (state.mode === "puzzle" || state.mode === "roguelike") endDrag(event); });
    document.addEventListener("pointercancel", (event) => { if (state.mode === "puzzle" || state.mode === "roguelike") endDrag(event); });
    window.addEventListener("blur", finishDragAfterPointerLoss);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) finishDragAfterPointerLoss();
    });
    $("#puzzle-mode-button").addEventListener("click", enterPuzzleMode);
    $("#pang-mode-button").addEventListener("click", enterPangMode);
    $("#roguelike-mode-button").addEventListener("click", enterRoguelikeMode);
    $("#menu-button").addEventListener("click", returnToMenu);
    $("#puzzle-intro-menu").addEventListener("click", returnToMenu);
    $("#pang-intro-menu").addEventListener("click", returnToMenu);
    $("#roguelike-intro-menu").addEventListener("click", returnToMenu);
    $("#settings-button").addEventListener("click", openSettings);
    $("#menu-settings-button").addEventListener("click", openSettings);
    $("#settings-close").addEventListener("click", closeSettings);
    $("#glossary-button").addEventListener("click", openGlossary);
    $("#glossary-close").addEventListener("click", closeGlossary);
    $("#glossary-search").addEventListener("input", filterGlossary);
    $("#glossary-filters").addEventListener("click", (event) => {
      const filter = event.target.closest("[data-glossary-filter]");
      if (filter) setGlossaryFilter(filter.dataset.glossaryFilter);
    });
    $("#glossary-quick-grid").addEventListener("click", (event) => {
      const shortcut = event.target.closest("[data-glossary-jump]");
      if (shortcut) jumpToGlossaryTerm(shortcut);
    });
    $("#glossary-sections").addEventListener("click", (event) => {
      const entry = event.target.closest(".glossary-entry");
      if (entry) toggleGlossaryEntry(entry);
    });
    $("#glossary-sections").addEventListener("keydown", (event) => {
      if (!['Enter', ' '].includes(event.key)) return;
      const entry = event.target.closest(".glossary-entry");
      if (!entry) return;
      event.preventDefault();
      toggleGlossaryEntry(entry);
    });
    $("#hud-party-button")?.addEventListener("click", toggleCombatParty);
    document.querySelectorAll("[data-hud-drawer]").forEach((button) => button.addEventListener("click", () => setCombatHudDrawer(button.dataset.hudDrawer)));
    $("#hud-drawer-close")?.addEventListener("click", () => setCombatHudDrawer(null));
    $("#hud-help-dock-button")?.addEventListener("click", () => $("#help-button")?.click());
    $("#idiom-detail-close").addEventListener("click", closeIdiomDetail);
    const openIdiomFromCard = (event) => {
      const card = event.target.closest("[data-idiom-detail]");
      if (card) openIdiomDetail(card.dataset.idiomDetail);
    };
    $("#idiom-cards").addEventListener("click", openIdiomFromCard);
    $("#idiom-focus").addEventListener("click", (event) => {
      const selection = event.target.closest("[data-idiom-focus-select]");
      if (selection) {
        event.preventDefault();
        selectIdiomFocus(selection.dataset.idiomFocusSelect, { focus: true });
        return;
      }
      openIdiomFromCard(event);
    });
    $("#idiom-focus").addEventListener("keydown", handleIdiomFocusPickerKeydown);
    $("#roguelike-rotating-cards").addEventListener("click", openIdiomFromCard);
    const previewIdiomFromCard = (event) => {
      const card = event.target.closest("[data-idiom-detail]");
      if (!card || (event.type === "pointerover" && card.contains(event.relatedTarget))) return;
      const idiom = getCurrentIdioms().find((entry) => entry.id === card.dataset.idiomDetail);
      if (!idiom) return;
      state.focusedIdiomId = idiom.id;
      const entries = getIdiomFocusEntries();
      const focused = entries.find((entry) => entry.id === idiom.id);
      if (focused) renderIdiomFocus(focused.idiom, focused.kind, getIdiomActivationPreview().get(idiom.id), entries);
    };
    $("#idiom-cards").addEventListener("pointerover", previewIdiomFromCard);
    $("#idiom-cards").addEventListener("focusin", previewIdiomFromCard);
    setupEnemyAffinityTooltip();
    $("#debug-unlock-trigger").addEventListener("click", handleDebugUnlockPress);
    $("#debug-button").addEventListener("click", openDebug);
    $("#menu-debug-button").addEventListener("click", openDebug);
    $("#menu-debug-entry").addEventListener("click", openDebug);
    $("#debug-close").addEventListener("click", closeDebug);
    $("#debug-summon-pattern-trial").addEventListener("click", debugSummonPatternTrial);
    $("#debug-water-match").addEventListener("click", debugWaterMatch);
    $("#debug-summon-multi-trial").addEventListener("click", debugSummonMultiTrial);
    $("#debug-wide-match").addEventListener("click", debugWideMatch);
    $("#debug-grant-summon").addEventListener("click", debugGrantSummon);
    $("#debug-enemy-squad").addEventListener("click", (event) => {
      const target = event.target.closest("[data-debug-enemy-target]");
      if (target) selectDebugEnemyTarget(target.dataset.debugEnemyTarget);
    });
    $("#debug-defeat-button").addEventListener("click", debugForceDefeat);
    $("#debug-reset-revive").addEventListener("click", debugResetRevive);
    $("#debug-enemy-one").addEventListener("click", debugSetEnemyOne);
    $("#debug-player-heal").addEventListener("click", debugHealPlayer);
    $("#debug-shield").addEventListener("click", debugAddShield);
    $("#debug-enemy-shield").addEventListener("click", debugAddEnemyShield);
    $("#debug-enemy-burn").addEventListener("click", debugAddEnemyBurn);
    $("#debug-clear-queue").addEventListener("click", debugClearQueue);
    $("#debug-force-match").addEventListener("click", debugForceMatch);
    $("#debug-rotate-idioms").addEventListener("click", debugRotateIdioms);
    $("#debug-fill-party").addEventListener("click", debugFillParty);
    $("#debug-grant-relics").addEventListener("click", debugGrantRelics);
    $("#debug-reset-battle").addEventListener("click", debugResetBattle);
    $("#debug-copy-seed").addEventListener("click", debugCopySeed);
    $("#debug-next-node").addEventListener("click", debugNextNode);
    $("#debug-show-reward").addEventListener("click", debugShowReward);
    $("#debug-show-loot-layer").addEventListener("click", debugShowLootLayerTest);
    $("#debug-validate-data").addEventListener("click", debugValidateData);
    $("#debug-unlock-all-jaryeongs").addEventListener("click", debugUnlockAllJaryeongs);
    $("#debug-reset-all-data").addEventListener("click", debugResetAllData);
    document.querySelectorAll("[data-reading-mode]").forEach((button) => button.addEventListener("click", () => setReadingMode(button.dataset.readingMode)));
    document.querySelectorAll("[data-idiom-speed]").forEach((button) => button.addEventListener("click", () => setIdiomSpeed(button.dataset.idiomSpeed)));
    document.querySelectorAll("[data-battle-display]").forEach((button) => {
      button.addEventListener("click", () => setBattleDisplayMode(button.dataset.battleDisplay));
      button.addEventListener("keydown", handleBattleDisplayKeydown);
    });
    document.querySelectorAll("[data-idiom-display]").forEach((button) => {
      button.addEventListener("click", () => setIdiomDisplayMode(button.dataset.idiomDisplay));
      button.addEventListener("keydown", handleIdiomDisplayKeydown);
    });
    $("#result-menu").addEventListener("click", returnToMenu);
    $("#pang-result-menu").addEventListener("click", returnToMenu);
    $("#roguelike-result-menu").addEventListener("click", returnToMenu);
    $("#revive-result-button").addEventListener("click", openReviveFromGameOver);
    $("#roguelike-revive-result-button").addEventListener("click", openReviveFromGameOver);
    window.addEventListener("resize", () => { if (state.mode === "puzzle") requestAnimationFrame(renderStoryPathDemo); });
    $("#start-button").addEventListener("click", () => beginStoryChapter());
    $("#story-chapter-select").addEventListener("click", (event) => {
      const choice = event.target.closest("[data-story-chapter]");
      if (choice) selectStoryChapter(choice.dataset.storyChapter, { focus: true });
    });
    $("#pang-start-button").addEventListener("click", beginPangRun);
    $("#roguelike-start-button").addEventListener("click", beginRoguelikeRun);
    $("#roguelike-resume-button").addEventListener("click", resumeRoguelikeRun);
    $("#volume-options").addEventListener("click", (event) => {
      const choice = event.target.closest("[data-volume-index]");
      if (choice) chooseCharacterVolume(choice.dataset.volumeIndex);
    });
    $("#route-choices").addEventListener("click", (event) => {
      const choice = event.target.closest("[data-route-node]");
      if (choice) chooseRoguelikeNode(choice.dataset.routeNode);
    });
    $("#node-choices").addEventListener("click", (event) => {
      const choice = event.target.closest("[data-node-choice]");
      if (choice) void chooseRunNodeChoice(choice.dataset.nodeChoice);
    });
    $("#route-seed-button").addEventListener("click", debugCopySeed);
    $("#roguelike-reward-reroll").addEventListener("click", rerollRoguelikeRewards);
    $("#codex-button").addEventListener("click", openCodex);
    $("#codex-close").addEventListener("click", closeCodex);
    document.querySelectorAll("[data-codex-tab]").forEach((button) => button.addEventListener("click", () => selectCodexTab(button.dataset.codexTab)));
    $("#codex-search").addEventListener("input", renderCodex);
    $("#codex-volume").addEventListener("change", renderCodex);
    $("#jaryeong-meta-button").addEventListener("click", () => openJaryeongMeta("collection"));
    $("#prep-edit-party-button").addEventListener("click", () => openJaryeongMeta("party"));
    $("#jaryeong-meta-close").addEventListener("click", closeJaryeongMeta);
    document.querySelectorAll("[data-jaryeong-meta-view]").forEach((button) => button.addEventListener("click", () => setJaryeongMetaView(button.dataset.jaryeongMetaView)));
    $("#jaryeong-meta-modal .jaryeong-meta-tabs").addEventListener("keydown", (event) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      const tabs = [...document.querySelectorAll("[data-jaryeong-meta-view]")];
      const currentIndex = Math.max(0, tabs.indexOf(document.activeElement));
      const nextIndex = event.key === 'Home' ? 0
        : event.key === 'End' ? tabs.length - 1
          : (currentIndex + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
      event.preventDefault();
      setJaryeongMetaView(tabs[nextIndex].dataset.jaryeongMetaView);
      tabs[nextIndex].focus();
    });
    $("#jaryeong-element-filters").addEventListener("click", (event) => {
      const filter = event.target.closest("[data-meta-element]");
      if (!filter) return;
      jaryeongMetaElement = filter.dataset.metaElement;
      document.querySelectorAll("[data-meta-element]").forEach((button) => button.classList.toggle("active", button === filter));
      renderJaryeongCollection();
    });
    $("#jaryeong-meta-grid").addEventListener("click", (event) => {
      const choice = event.target.closest("[data-meta-jaryeong]");
      if (!choice) return;
      jaryeongMetaSelectedId = choice.dataset.metaJaryeong;
      renderJaryeongCollection();
      restoreMetaFocus(`[data-meta-jaryeong="${jaryeongMetaSelectedId}"]`);
    });
    $("#jaryeong-party-slots").addEventListener("click", (event) => {
      const slot = event.target.closest("[data-party-slot]");
      if (!slot) return;
      jaryeongPartySlot = Number(slot.dataset.partySlot) || 0;
      renderJaryeongParty();
      restoreMetaFocus(`[data-party-slot="${jaryeongPartySlot}"]`);
    });
    $("#jaryeong-party-pool").addEventListener("click", (event) => {
      const choice = event.target.closest("[data-party-jaryeong]");
      if (choice) choosePartyJaryeong(choice.dataset.partyJaryeong);
    });
    $("#jaryeong-party-save").addEventListener("click", saveJaryeongParty);
    $("#jaryeong-summon-ritual").addEventListener("click", (event) => {
      const exchange = event.target.closest("[data-exchange-summon-ticket]");
      const summon = event.target.closest("[data-summon-random]");
      if (exchange) exchangeSummonTicket();
      if (summon) summonRandomJaryeongFromTalisman();
    });
    $("#summon-result-close").addEventListener("click", () => $("#jaryeong-summon-result-modal").classList.remove("open"));
    $("#bgm-enabled").addEventListener("change", (event) => {
      audioDirector.setSettings({ bgmEnabled: event.target.checked });
      if (event.target.checked) void audioDirector.playBgm(state.mode === "roguelike" && state.run ? `act-${state.run.act || 1}` : "menu", { immediate: true });
    });
    $("#sfx-enabled").addEventListener("change", (event) => audioDirector.setSettings({ sfxEnabled: event.target.checked }));
    $("#bgm-volume").addEventListener("input", (event) => audioDirector.setSettings({ bgmVolume: Number(event.target.value) / 100 }));
    $("#sfx-volume").addEventListener("input", (event) => audioDirector.setSettings({ sfxVolume: Number(event.target.value) / 100 }));
    $("#roguelike-draft-cards").addEventListener("click", (event) => {
      const choice = event.target.closest("[data-roguelike-idiom]");
      if (choice) chooseRoguelikeIdiom(choice.dataset.roguelikeIdiom);
    });
    $("#roguelike-leader-cards").addEventListener("click", (event) => {
      const choice = event.target.closest("[data-roguelike-leader]");
      if (choice) chooseRoguelikeLeader(choice.dataset.roguelikeLeader);
    });
    $("#roguelike-reward-cards").addEventListener("click", (event) => {
      const choice = event.target.closest("[data-roguelike-reward]");
      if (choice) void chooseRoguelikeReward(choice.dataset.roguelikeReward);
    });
    $("#idiom-replacement-options").addEventListener("click", (event) => {
      const choice = event.target.closest("[data-idiom-replace-index]");
      if (choice) finishIdiomReplacement(choice.dataset.idiomReplaceIndex);
    });
    $("#idiom-replacement-keep").addEventListener("click", () => finishIdiomReplacement(null));
    $("#contract-party-options").addEventListener("click", (event) => {
      const choice = event.target.closest("[data-contract-replace-index]");
      if (choice) contractReplace(choice.dataset.contractReplaceIndex);
    });
    $("#contract-duplicate-button").addEventListener("click", contractDuplicate);
    $("#contract-abandon-button").addEventListener("click", contractAbandon);
    $("#jaryeong-party").addEventListener("click", (event) => {
      const trigger = event.target.closest("[data-jaryeong-inspector]");
      if (trigger) {
        event.stopPropagation();
        openJaryeongSkillInspector(trigger.dataset.jaryeongInspector, trigger);
      }
    });
    $("#jaryeong-skill-inspector-close")?.addEventListener("click", () => closeJaryeongSkillInspector());
    $("#jaryeong-skill-inspector-cast")?.addEventListener("click", () => { void castJaryeongInspectorSkill(); });
    $("#first-battle-coach-skill")?.addEventListener("click", (event) => {
      const skill = event.currentTarget;
      if (skill.disabled || !skill.dataset.jaryeongSkill) return;
      void useJaryeongSkill(skill.dataset.jaryeongSkill);
      renderFirstBattleCoach();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && closeJaryeongSkillInspector()) {
        event.preventDefault();
        return;
      }
      if (event.repeat || event.ctrlKey || event.altKey || event.metaKey) return;
      if (state.mode !== "roguelike" || !state.run?.currentEncounterId || state.resolving || state.jaryeongSkillAnimating || state.gameOver) return;
      if (document.querySelector(".modal.open")) return;
      if (event.target?.matches?.("input, textarea, select, [contenteditable='true']")) return;
      const index = Number(event.key) - 1;
      const id = state.run.partyJaryeongIds?.[index];
      if (!id || (state.run.skillCharges?.[id] || 0) < 5) return;
      event.preventDefault();
      if (state.jaryeongInspectorId) closeJaryeongSkillInspector({ restoreFocus: false, playSound: false });
      void useJaryeongSkill(id);
    });
    $("#revive-canvas").addEventListener("pointerdown", beginTrace);
    $("#revive-canvas").addEventListener("pointermove", moveTrace);
    $("#revive-canvas").addEventListener("pointerup", endTrace);
    $("#revive-canvas").addEventListener("pointercancel", endTrace);
    $("#revive-canvas").addEventListener("contextmenu", (event) => event.preventDefault());
    $("#trace-reset").addEventListener("click", setupTrace);
    $("#trace-submit").addEventListener("click", submitTrace);
    $("#help-button").addEventListener("click", () => {
      if (state.mode === "puzzle") {
        selectStoryChapter(state.storySession?.chapterId || selectedStoryChapterId);
        const inTraining = Boolean(state.storySession);
        $("#intro-modal").classList.toggle("help-context", inTraining);
        $("#story-help-return").hidden = !inTraining;
        $("#intro-modal").classList.add("open");
      }
      else if (state.mode === "roguelike") {
        setStoryGraduationBannerVisible(false);
        const modal = $("#roguelike-intro-modal");
        const inBattle = Boolean(state.run?.currentEncounterId);
        modal.classList.toggle("help-context", inBattle);
        $("#roguelike-help-return").hidden = !inBattle;
        modal.classList.add("open");
        (inBattle ? $("#roguelike-help-return") : $("#roguelike-start-button"))?.focus({ preventScroll: true });
      }
    });
    $("#roguelike-help-return").addEventListener("click", () => {
      const modal = $("#roguelike-intro-modal");
      modal.classList.remove("open", "help-context");
      $("#roguelike-help-return").hidden = true;
      $("#help-button")?.focus({ preventScroll: true });
      audioDirector.playSfx("ui-cancel");
    });
    $("#reset-button").addEventListener("click", resetCurrentMode);
    $("#story-help-return").addEventListener("click", closeStoryHelp);
    $("#replay-button").addEventListener("click", () => { $("#result-modal").classList.remove("open"); resetGame(); });
    $("#story-replay-button").addEventListener("click", replayStoryChapter);
    $("#story-journey-button").addEventListener("click", advanceFromStoryResult);
    $("#story-result-menu").addEventListener("click", returnToMenu);
    $("#pang-replay-button").addEventListener("click", () => { preparePangMode(); beginPangRun(); });
    $("#roguelike-replay-button").addEventListener("click", () => { $("#roguelike-result-modal").classList.remove("open"); beginRoguelikeRun(); });
    ["settings-close", "idiom-detail-close", "glossary-close", "debug-close", "codex-close", "jaryeong-meta-close", "summon-result-close", "puzzle-intro-menu", "pang-intro-menu", "roguelike-intro-menu"].forEach((id) => {
      $(`#${id}`)?.addEventListener("click", () => audioDirector.playSfx("ui-cancel"));
    });
    initializeDialogAccessibility();
    window.addEventListener("beforeunload", () => saveActiveRun({ allowGameOver: state.gameOver && !state.run?.completed }));
  }

  window.SajaGame = {
    state,
    resetGame,
    findMatches,
    resolveTurn,
    completeRevive,
    enterPuzzleMode,
    enterRoguelikeMode,
    beginRoguelikeRun,
    chooseRoguelikeLeader,
    chooseRoguelikeIdiom,
    chooseRoguelikeReward,
    useJaryeongSkill,
    createSoftElementBarrier,
    resolveElementBarrierHit,
    debugSummonPatternTrial
  };
  bindEvents();
  window.setInterval(tickIdleSprites, 720);
  loadReadingMode();
  loadIdiomSpeed();
  loadBattleDisplayMode();
  loadIdiomDisplayMode();
  syncAudioControls();
  syncRunSaveControls();
  renderVolumeOptions();
  renderMenuSpiritParade();
  renderPreparedParty();
  syncStoryMenuStatus();
  resetGame();
  returnToMenu();
})();
