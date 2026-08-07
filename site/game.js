import { AUDIO_MANIFEST, buildIdiomSpecs, ENCOUNTER_CATALOG, EVENT_CATALOG, RELIC_CATALOG, RUN_CONTENT } from "./src/content.js";
import { ASSET_MANIFEST } from "./src/assets.js";
import { AudioDirector } from "./src/audio.js";
import { buildCharacterVolumes, buildRunCharacterPool, chooseRotatingRecipes, createRunRoute, createSeededRng, pickWithRng, randomFrom, RUN_LIMITS, shuffleWithRng, validateGameCatalog } from "./src/run-engine.js?v=20260807-recipes-1";
import { decodeRunSave, describeRunSaveStage, encodeRunSave, RUN_SAVE_KEY } from "./src/save.js?v=20260807-save-2";
import { buildReviveCharacterPool, passesReviveTrace, scoreReviveTrace } from "./src/revive.js?v=20260807-revive-2";
import { chooseEmergencyIdiom, claimRunTrigger, findRunRelicEffect, RUNTIME_RELIC_EFFECT_TYPES } from "./src/relics.js?v=20260807-relics-1";

(function () {
  "use strict";

  let ROWS = 5;
  let COLS = 6;
  const MOVE_SECONDS = 4;
  const PANG_SECONDS = 60;
  const PANG_MAX_TIME = 75;
  const PANG_QUEUE_MAX = 12;
  const MAX_QUEUE = RUN_LIMITS.baseQueueMax;
  const IDIOM_RECIPE_COUNT = 3;
  const IDIOM_RECIPE_MIN_TURNS = 3;
  const IDIOM_RECIPE_MAX_TURNS = 7;
  const INITIAL_IDIOM_DRAFT_COUNT = 3;
  const READING_MODE_KEY = "sajayeonseong-reading-mode";
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
    wood: { damage: 8, label: "목", effect: "회복" },
    fire: { damage: 12, label: "화", effect: "화상" },
    earth: { damage: 7, label: "토", effect: "보호막" },
    metal: { damage: 9, label: "금", effect: "관통" },
    water: { damage: 7, label: "수", effect: "지연" }
  });
  const ELEMENT_SYNERGIES = Object.freeze([
    { from: "water", to: "wood", label: "水→木", text: "다음 목 회복·성장 증가", buff: "wood" },
    { from: "wood", to: "fire", label: "木→火", text: "다음 화상 강화", buff: "fire" },
    { from: "fire", to: "earth", label: "火→土", text: "화 피해 일부를 보호막으로 전환", buff: "earth" },
    { from: "earth", to: "metal", label: "土→金", text: "다음 금 공격 관통 강화", buff: "metal" },
    { from: "metal", to: "water", label: "金→水", text: "다음 수 지연 강화", buff: "water" }
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
    { id: "wood-mok", hanja: "木", reading: "나무 목", meaning: "성장", element: "wood", attack: 8, skillName: "덩굴 자람", skillDesc: "체력 12 회복 · 다음 목 회복 강화", leaderSkill: "목 회복량 +25%", bodyType: "semi-humanoid", personality: "느긋하고 다정한 숲의 수호자" },
    { id: "wood-tree", hanja: "樹", reading: "나무 수", meaning: "숲과 생명", element: "wood", attack: 7, skillName: "생명의 그늘", skillDesc: "보호막 10 획득 · 체력 8 회복", leaderSkill: "목 매치마다 보호막 +1", bodyType: "semi-humanoid", personality: "작은 생명을 돌보는 나무 정령" },
    { id: "wood-life", hanja: "生", reading: "날 생", meaning: "생명", element: "wood", attack: 9, skillName: "새싹 회복", skillDesc: "체력 18 회복", leaderSkill: "회복 효과 +20%", bodyType: "plant-spirit", personality: "끝까지 다시 피어나는 새싹" },
    { id: "fire-hwa", hanja: "火", reading: "불 화", meaning: "불꽃", element: "fire", attack: 12, skillName: "불씨 폭발", skillDesc: "적에게 22 피해 · 화상 2", leaderSkill: "화 피해 +15%", bodyType: "floating", personality: "성급하지만 정의감이 강한 불꽃" },
    { id: "fire-light", hanja: "光", reading: "빛 광", meaning: "빛", element: "fire", attack: 10, skillName: "섬광", skillDesc: "적에게 18 피해 · 다음 화상 강화", leaderSkill: "화상 피해 +1", bodyType: "floating", personality: "어둠을 밀어내는 장난꾸러기" },
    { id: "fire-sun", hanja: "日", reading: "날 일", meaning: "태양", element: "fire", attack: 11, skillName: "정오의 일격", skillDesc: "적에게 28 피해", leaderSkill: "첫 화 공격 강화", bodyType: "sun-spirit", personality: "한낮처럼 당당한 작은 태양" },
    { id: "earth-to", hanja: "土", reading: "흙 토", meaning: "대지", element: "earth", attack: 7, skillName: "대지의 품", skillDesc: "보호막 20 획득", leaderSkill: "보호막 획득량 +25%", bodyType: "stone-guardian", personality: "말이 적고 믿음직한 수호령" },
    { id: "earth-stone", hanja: "石", reading: "돌 석", meaning: "바위", element: "earth", attack: 8, skillName: "돌벽", skillDesc: "보호막 14 · 다음 피해 10% 감소", leaderSkill: "토 매치마다 보호막 +1", bodyType: "stone-guardian", personality: "작지만 무너지지 않는 돌" },
    { id: "earth-mountain", hanja: "山", reading: "메 산", meaning: "산", element: "earth", attack: 9, skillName: "산울림", skillDesc: "적에게 16 피해 · 보호막 8", leaderSkill: "최대 보호막 +12", bodyType: "mountain-spirit", personality: "느리지만 누구보다 오래 버틴다" },
    { id: "metal-gold", hanja: "金", reading: "쇠 금", meaning: "금속", element: "metal", attack: 9, skillName: "금빛 관통", skillDesc: "적에게 24 피해 · 다음 금 확정 관통", leaderSkill: "금 피해 +15%", bodyType: "armored", personality: "규칙을 중시하는 소형 호위무사" },
    { id: "metal-sword", hanja: "劍", reading: "칼 검", meaning: "검", element: "metal", attack: 11, skillName: "일섬", skillDesc: "적에게 30 피해", leaderSkill: "금 치명타 확률 증가", bodyType: "armored", personality: "한 번의 칼끝에 집중하는 전사" },
    { id: "metal-jade", hanja: "玉", reading: "구슬 옥", meaning: "옥", element: "metal", attack: 8, skillName: "옥갑", skillDesc: "보호막 12 · 금 게이지 +1", leaderSkill: "관통 피해 +10%", bodyType: "relic-spirit", personality: "차갑지만 빛나는 보석 정령" },
    { id: "water-sui", hanja: "水", reading: "물 수", meaning: "물", element: "water", attack: 7, skillName: "물결 지연", skillDesc: "적 행동 1턴 지연 · 수 타일 2개 생성", leaderSkill: "수 지연량 증가", bodyType: "fluid", personality: "상황에 맞춰 흐르는 물방울" },
    { id: "water-rain", hanja: "雨", reading: "비 우", meaning: "비", element: "water", attack: 7, skillName: "비의 장막", skillDesc: "보호막 8 · 적 행동 1턴 지연", leaderSkill: "첫 수 매치가 지연 부여", bodyType: "fluid", personality: "조용히 전장을 적시는 비" },
    { id: "water-sea", hanja: "海", reading: "바다 해", meaning: "바다", element: "water", attack: 8, skillName: "깊은 파도", skillDesc: "적에게 18 피해 · 행동 지연", leaderSkill: "수 피해 +15%", bodyType: "fluid", personality: "깊이를 숨긴 느긋한 바다 요괴" }
  ].map((jaryeong) => ({
    ...jaryeong,
    asset: ASSET_MANIFEST.jaryeongs[jaryeong.id],
    name: ({
      "wood-mok": "목령", "wood-tree": "수령", "wood-life": "생령",
      "fire-hwa": "화령", "fire-light": "광령", "fire-sun": "일령",
      "earth-to": "토령", "earth-stone": "석령", "earth-mountain": "산령",
      "metal-gold": "금령", "metal-sword": "검령", "metal-jade": "옥령",
      "water-sui": "수령", "water-rain": "우령", "water-sea": "해령"
    })[jaryeong.id] || `${jaryeong.hanja}령`,
    skillId: `${jaryeong.id}-skill`,
    leaderEffectId: `${jaryeong.id}-leader`,
    wildBehaviorId: ({
      "wood-mok": "wild-growth", "wood-tree": "wild-canopy", "wood-life": "wild-regrowth",
      "fire-hwa": "wild-ember", "fire-light": "wild-flash", "fire-sun": "wild-sun",
      "earth-to": "wild-earth-wall", "earth-stone": "wild-stone-guard", "earth-mountain": "wild-landslide",
      "metal-gold": "wild-pierce", "metal-sword": "wild-sword", "metal-jade": "wild-reflect",
      "water-sui": "wild-tide", "water-rain": "wild-rain", "water-sea": "wild-sea"
    })[jaryeong.id] || "wild-growth"
  })));
  const JARYEONG_SKILL_EFFECTS = Object.freeze({
    "wood-mok-skill": [{ type: "healPlayer", amount: 12 }, { type: "increaseNextElement", element: "wood", amount: 1 }],
    "wood-tree-skill": [{ type: "gainShield", amount: 10 }, { type: "healPlayer", amount: 8 }],
    "wood-life-skill": [{ type: "healPlayer", amount: 18 }, { type: "healPlayerIfLow", threshold: 35, amount: 8 }],
    "fire-hwa-skill": [{ type: "dealDamage", amount: 22 }, { type: "applyBurn", amount: 2 }],
    "fire-light-skill": [{ type: "dealDamage", amount: 18 }, { type: "increaseNextElement", element: "fire", amount: 1 }],
    "fire-sun-skill": [{ type: "dealDamage", amount: 28 }],
    "earth-to-skill": [{ type: "gainShield", amount: 20 }],
    "earth-stone-skill": [{ type: "gainShield", amount: 14 }, { type: "reduceNextEnemyDamage", ratio: .1 }],
    "earth-mountain-skill": [{ type: "dealDamage", amount: 16 }, { type: "gainShield", amount: 8 }],
    "metal-gold-skill": [{ type: "dealDamage", amount: 24 }, { type: "pierceNextElement", element: "metal" }],
    "metal-sword-skill": [{ type: "dealDamage", amount: 30 }],
    "metal-jade-skill": [{ type: "gainShield", amount: 12 }, { type: "gainPartyCharge", element: "metal", amount: 1 }],
    "water-sui-skill": [{ type: "delayEnemy", turns: 1 }, { type: "convertTiles", element: "water", count: 2 }],
    "water-rain-skill": [{ type: "gainShield", amount: 8 }, { type: "delayEnemy", turns: 1 }],
    "water-sea-skill": [{ type: "dealDamage", amount: 18 }, { type: "delayEnemy", turns: 1 }]
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
    type: jaryeong.element === "wood" ? "healMultiplier" : jaryeong.element === "earth" ? "shieldMultiplier" : jaryeong.element === "water" ? "delayOnce" : "elementDamageMultiplier",
    value: jaryeong.element === "wood" || jaryeong.element === "earth" ? 1.25 : jaryeong.element === "water" ? 1 : 1.15,
    description: jaryeong.leaderSkill
  }])));
  const BASE_ENEMIES = [
    {
      id: "mist-dokkaebi",
      name: "먹구름 도깨비",
      glyph: "禍",
      hp: 105,
      weakElement: "water",
      resistElement: "fire",
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
      weakElement: "metal",
      resistElement: "earth",
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
      weakElement: "wood",
      resistElement: "water",
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
      label: "덩굴 봉인",
      phases: [{
        id: "wild-growth",
        label: "덩굴 봉인",
        minHpRatio: 0,
        sequence: [{
          id: "wild-growth-strike",
          kind: "attack",
          name: "덩굴 휘감기",
          icon: "⚔",
          damage: 12,
          effect: { type: "lockTiles", count: 2, turns: 1, healAmount: 6 },
          effectText: "12 피해 · 타일 2개 봉인 · 기운 6 회복",
          threat: "medium",
          threatLabel: "보통",
          responseHint: "보호막 권장"
        }]
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
      phases: [{ id: "wild-canopy", label: "수관 보호", minHpRatio: 0, sequence: [{ id: "wild-canopy-guard", kind: "attack", name: "수관 보호", icon: "🛡", damage: 10, effect: { type: "gainEnemyShield", amount: 18 }, effectText: "10 피해 · 야생 보호막 18", threat: "medium", threatLabel: "주의", responseHint: "보호막을 먼저 걷어내세요" }] }]
    },
    "wild-regrowth": {
      label: "새싹 재생",
      phases: [{ id: "wild-regrowth", label: "새싹 재생", minHpRatio: 0, sequence: [{ id: "wild-regrowth-heal", kind: "attack", name: "새싹 재생", icon: "✦", damage: 10, effect: { type: "healEnemy", amount: 10 }, effectText: "10 피해 · 기운 10 회복", threat: "medium", threatLabel: "주의", responseHint: "화상으로 재생을 끊으세요" }] }]
    },
    "wild-flash": {
      label: "눈부신 섬광",
      phases: [{ id: "wild-flash", label: "눈부신 섬광", minHpRatio: 0, sequence: [{ id: "wild-flash-strike", kind: "attack", name: "눈부신 섬광", icon: "☀", damage: 10, effect: { type: "reduceMoveTime", seconds: .7 }, effectText: "10 피해 · 다음 이동시간 -0.7초", threat: "medium", threatLabel: "주의", responseHint: "다음 이동을 빠르게 준비하세요" }] }]
    },
    "wild-sun": {
      label: "태양 충전",
      phases: [{ id: "wild-sun", label: "태양 충전", minHpRatio: 0, sequence: [{ id: "wild-sun-strike", kind: "attack", name: "태양 충전", icon: "☀", damage: 24, effectText: "24 피해 · 강한 단일 공격", threat: "high", threatLabel: "위험", responseHint: "보호막을 준비하세요" }] }]
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
      phases: [{ id: "wild-landslide", label: "산사태", minHpRatio: 0, sequence: [{ id: "wild-landslide-strike", kind: "attack", name: "산사태", icon: "⛰", damage: 18, effect: { type: "lockTiles", count: 2, turns: 1 }, effectText: "18 피해 · 타일 2개 1턴 봉인", threat: "high", threatLabel: "위험", responseHint: "봉인 전 경로를 확보하세요" }] }]
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
    "wild-rain": {
      label: "비의 장막",
      phases: [{ id: "wild-rain", label: "비의 장막", minHpRatio: 0, sequence: [{ id: "wild-rain-strike", kind: "attack", name: "비의 장막", icon: "☂", damage: 10, effect: { type: "reduceMoveTime", seconds: .5 }, effectText: "10 피해 · 다음 이동시간 -0.5초", threat: "medium", threatLabel: "주의", responseHint: "수 매치로 흐름을 되찾으세요" }] }]
    },
    "wild-sea": {
      label: "깊은 파도",
      phases: [{ id: "wild-sea", label: "깊은 파도", minHpRatio: 0, sequence: [{ id: "wild-sea-strike", kind: "attack", name: "깊은 파도", icon: "≈", damage: 16, effect: { type: "decayQueue", turns: 1 }, effectText: "16 피해 · 오래된 문자 수명 감소", threat: "high", threatLabel: "위험", responseHint: "큐를 비우거나 성어를 완성하세요" }] }]
    }
  });

  const ENCOUNTER_LIBRARY = Object.freeze([
    {
      id: "forest-01",
      stage: 1,
      rewardPoolId: "forest-basic",
      weakElement: "water",
      resistElement: "fire",
      enemies: [{ jaryeongId: "wood-mok", level: 1, maxHp: 105, behaviorId: "wild-growth" }]
    },
    {
      id: "ember-02",
      stage: 2,
      rewardPoolId: "ember-basic",
      weakElement: "metal",
      resistElement: "earth",
      enemies: [{ jaryeongId: "fire-hwa", level: 1, maxHp: 155, behaviorId: "wild-ember" }]
    },
    {
      id: "tide-03",
      stage: 3,
      rewardPoolId: "tide-boss",
      weakElement: "wood",
      resistElement: "water",
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

  function createEnemyPlan() {
    return { phaseIndex: 0, cursor: 0, queue: [], pendingPhaseIndex: null, lastAnnouncedKey: "" };
  }

  const $ = (selector) => document.querySelector(selector);
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const state = {
    board: [], queue: [], turn: 1, wave: 0, enemyHp: 0,
    playerHp: 100, shield: 0, delayed: 0, weakened: false, prepared: false,
    enemyBurn: 0, nextElementBoosts: {},
    reviveUsed: false, totalCombos: 0, totalIdioms: 0,
    dragging: false, dragMoved: false, resolving: false, selected: null, timerId: null, moveStartedAt: 0, currentMoveLimit: MOVE_SECONDS,
    freshQueueIds: new Set(), gameOver: false, pointerX: 0, pointerY: 0,
    mode: null, pangRunning: false, pangScore: 0, pangBestCombo: 0,
    pangMoves: 0, pangTimeLeft: PANG_SECONDS, pangTimerId: null,
    pangLastTick: 0, pangOrigin: null, pangTarget: null, pangMoved: false,
    pangEndPending: false, dragPreview: null, readingMode: "compact", swapAnimationUntil: 0, audioContext: null,
    enemyPlan: createEnemyPlan(), stageIdiomIds: [], usedStageIdiomIds: new Set(), rotatingIdiomIds: [], usedRotatingIdiomIds: new Set(), readyIdiomIds: new Set(), run: null,
    nextIdiomRecipeTurn: 0, idiomRecipeInterval: 0, recipeSupplyUntilTurn: 0, idiomDetailId: null, focusedIdiomId: null,
    nextMoveBonus: 0, enemyMovePenalty: 0, currentChargeBonus: 0, nextChargeBonus: 0, nextPlayerDamageBonus: 0, nextWeaknessDamageBonus: 0,
    enemyVulnerableTurns: 0, enemyVulnerableRatio: 0, enemySilenced: 0, healReductionTurns: 0, healReductionRatio: 0,
    reflectNextEnemyAttack: null, nextEnemyDamageReduction: 0, enemyDamageMultiplier: 1, enemyShield: 0,
    idiomGrowthStacks: 0, turnsSinceIdiom: 0, lastActivatedIdiomId: null,
    lastTurnElementDamage: {}, lastMatchGroupSizes: [], turnTotals: { damage: 0, heal: 0, shield: 0, burn: 0, delay: 0, elementDamage: {} },
    lockedTiles: new Map(),
    sessionRng: createSeededRng(`session-${Date.now()}`)
  };

  const audioDirector = new AudioDirector(AUDIO_MANIFEST);
  const META_KEY = "sajayeonseong-meta-v1";
  const RUN_SAVE_FIELDS = [
    "board", "queue", "turn", "wave", "enemyHp", "playerHp", "shield", "delayed", "weakened", "prepared",
    "enemyBurn", "nextElementBoosts", "reviveUsed", "totalCombos", "totalIdioms", "stageIdiomIds", "rotatingIdiomIds",
    "nextIdiomRecipeTurn", "idiomRecipeInterval", "recipeSupplyUntilTurn", "nextMoveBonus", "enemyMovePenalty",
    "currentChargeBonus", "nextChargeBonus", "nextPlayerDamageBonus", "nextWeaknessDamageBonus", "enemyVulnerableTurns",
    "enemyVulnerableRatio", "enemySilenced", "healReductionTurns", "healReductionRatio", "reflectNextEnemyAttack",
    "nextEnemyDamageReduction", "enemyDamageMultiplier", "enemyShield", "idiomGrowthStacks", "turnsSinceIdiom", "lastActivatedIdiomId",
    "lastTurnElementDamage", "lastMatchGroupSizes", "turnTotals", "enemyPlan", "gameOver"
  ];
  let runSaveTimer = null;

  function loadMetaProgress() {
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
      seenJaryeongs: [],
      completedRuns: 0,
      bestTimeMs: null
    };
    try { return { ...defaults, ...JSON.parse(localStorage.getItem(META_KEY) || "{}") }; } catch { return defaults; }
  }

  const metaProgress = loadMetaProgress();

  function saveMetaProgress() {
    try { localStorage.setItem(META_KEY, JSON.stringify(metaProgress)); } catch {}
  }

  function cloneSaveValue(value) {
    if (value == null) return value;
    try { return structuredClone(value); } catch { return JSON.parse(JSON.stringify(value)); }
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
    startButton.innerHTML = saved ? `새 런으로 덮어쓰기 <span>↻</span>` : `런 시작 · 리더 고르기 <span>→</span>`;
    startButton.classList.toggle("has-save", Boolean(saved));
    if (!saved) return;
    const stage = describeRunSaveStage(saved);
    $("#roguelike-save-seed").textContent = saved.run.seed;
    $("#roguelike-save-summary").textContent = `${stage.label} · 제${saved.run.act || 1}막 ${Math.min(15, (saved.run.routeIndex || 0) + 1)}/15 · ${formatRunSaveElapsed(saved.elapsedMs)}`;
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
    state.freshQueueIds = new Set(battle.freshQueueIds || []);
    state.usedStageIdiomIds = new Set(battle.usedStageIdiomIds || []);
    state.usedRotatingIdiomIds = new Set(battle.usedRotatingIdiomIds || []);
    state.readyIdiomIds = new Set(battle.readyIdiomIds || []);
    state.lockedTiles = new Map(battle.lockedTiles || []);
    state.dragging = false;
    state.dragMoved = false;
    state.selected = null;
    state.timerId = null;
    state.resolving = false;
    state.swapAnimationUntil = 0;
    clearDragPreview();
    if ($("#battle-log")) $("#battle-log").innerHTML = battle.battleLogHtml || "";
  }

  function resumeRoguelikeRun() {
    const saved = readActiveRunSave();
    if (!saved) {
      syncRunSaveControls();
      return;
    }
    closeGameOverlays();
    $("#main-menu").classList.remove("open");
    document.body.classList.remove("menu-mode", "puzzle-mode", "pang-mode");
    document.body.classList.add("roguelike-mode");
    state.mode = "roguelike";
    state.run = cloneSaveValue(saved.run);
    state.run.startedAt = Date.now() - saved.elapsedMs;
    restoreRunBattleState(saved.battle);
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
    void audioDirector.playBgm(`act-${state.run.act || 1}`, { immediate: true });
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
    if (state.mode === "roguelike" && state.run?.activeIdiomIds?.length) return idiomsFromIds(state.run.activeIdiomIds);
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

  function getRunRelicEffect(type) {
    if (state.mode !== "roguelike" || !state.run) return null;
    return findRunRelicEffect(RELIC_CATALOG, state.run.relicIds, type);
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
  function maxPlayerHp() { return state.mode === "roguelike" && state.run ? state.run.maxHp : 100; }
  function maxPlayerShield() { return Math.round(maxPlayerHp() * RUN_LIMITS.maxShieldRatio); }

  function resetTurnTotals() {
    state.turnTotals = { damage: 0, heal: 0, shield: 0, burn: 0, delay: 0, elementDamage: {} };
  }

  function recordTurnTotal(type, amount, element = null) {
    if (!state.turnTotals) resetTurnTotals();
    if (type in state.turnTotals && type !== "elementDamage") state.turnTotals[type] += amount;
    if (element) state.turnTotals.elementDamage[element] = (state.turnTotals.elementDamage[element] || 0) + amount;
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

  function lockRandomTiles(count = 2, turns = 1) {
    if (state.mode !== "puzzle" && state.mode !== "roguelike") return 0;
    if (!(state.lockedTiles instanceof Map)) state.lockedTiles = new Map();
    const cells = [];
    for (let row = 0; row < ROWS; row++) for (let col = 0; col < COLS; col++) cells.push([row, col]);
    shuffled(cells).slice(0, Math.min(count, cells.length)).forEach(([row, col]) => state.lockedTiles.set(tileKey(row, col), turns));
    renderBoard();
    return Math.min(count, cells.length);
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
  }

  function cleansePlayerStatuses() {
    let removed = 0;
    if (state.weakened) { state.weakened = false; removed++; }
    if (state.healReductionTurns > 0) { state.healReductionTurns = 0; state.healReductionRatio = 0; removed++; }
    if (state.lockedTiles instanceof Map && state.lockedTiles.size) {
      removed += state.lockedTiles.size;
      state.lockedTiles.clear();
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

  function resetQueueAges() {
    state.queue.forEach((entry) => { entry.born = state.turn; });
  }

  function partyChargeAll(amount = 1) {
    getPartyJaryeongs().forEach((jaryeong) => chargeJaryeong(jaryeong.id, amount));
  }

  function getJaryeongLevel(id) {
    return state.run?.jaryeongLevels?.[id] || 1;
  }

  function currentEnemy() {
    if (state.mode === "roguelike" && state.run?.currentEncounterId) {
      return ROGUELIKE_ENEMY_BY_ID.get(state.run.currentEncounterId) || ROGUELIKE_ENEMIES[0];
    }
    return ENEMIES[state.wave] || ENEMIES[0];
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
  }

  function getEnemyForecast() {
    return ensureEnemyPlan();
  }

  function currentEnemyIntent() {
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

  function advanceEnemyPlan() {
    const enemy = currentEnemy();
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
    const wrap = $("#enemy-status");
    if (!wrap) return;
    const entries = [];
    if (state.enemyBurn) entries.push({ className: "status-burn", text: `🔥 화상 ${state.enemyBurn}` });
    if (state.delayed) entries.push({ className: "status-delay", text: `⌛ 행동 지연 ${state.delayed}턴` });
    if (state.weakened) entries.push({ className: "status-weakened", text: "☄ 기력 약화 · 내 피해 -25%" });
    if (state.healReductionTurns) entries.push({ className: "status-weakened", text: `☄ 회복 약화 ${state.healReductionTurns}턴 · 회복 -${Math.round((state.healReductionRatio || 0) * 100)}%` });
    if (state.enemyVulnerableTurns) entries.push({ className: "status-weakened", text: `◌ 취약 ${state.enemyVulnerableTurns}턴 · 피해 +${Math.round((state.enemyVulnerableRatio || 0) * 100)}%` });
    if (state.enemySilenced) entries.push({ className: "status-delay", text: `🔇 침묵 ${state.enemySilenced}턴` });
    if (state.enemyShield) entries.push({ className: "status-shield", text: `◇ 야생 보호막 ${state.enemyShield}` });
    if (state.prepared) entries.push({ className: "status-prepared", text: "◈ 지피지기 대비 활성" });
    if (state.shield) entries.push({ className: "status-shield", text: `🛡 보호막 ${state.shield}` });
    if (!entries.length) {
      const empty = document.createElement("span");
      empty.className = "status-pill muted";
      empty.textContent = "상태 없음";
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

  function renderJaryeongPanel() {
    const panel = $("#jaryeong-panel");
    const wrap = $("#jaryeong-party");
    if (!panel || !wrap) return;
    const active = state.mode === "roguelike";
    panel.classList.toggle("is-active", active);
    if (!active) {
      wrap.replaceChildren();
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
      const charge = run.skillCharges?.[jaryeong.id] || 0;
      slot.innerHTML = `<span class="jaryeong-avatar ${jaryeong.element}">${tamedSpriteMarkup(jaryeong)}</span><span class="jaryeong-slot-copy"><b>${jaryeong.name} <small>Lv.${level}</small></b><em>${jaryeong.reading}</em></span><button type="button" class="jaryeong-skill-button" data-jaryeong-skill="${jaryeong.id}" ${charge < 5 || state.resolving || state.gameOver ? "disabled" : ""} aria-label="${jaryeong.skillName} ${charge}/5">${charge}/5</button>`;
      slot.title = `${jaryeong.skillName} · ${jaryeong.skillDesc}`;
      fragment.appendChild(slot);
    }
    wrap.replaceChildren(fragment);
    const label = $("#jaryeong-party-label");
    if (label) label.textContent = `${partyIds.length}/5 편성 · 리더 ${getLeaderJaryeong()?.hanja || "-"}`;
    renderJaryeongStage();
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
    const forecast = getEnemyForecast();
    const intent = forecast[0] || currentEnemyIntent();
    const phase = getEnemyPhase(enemy);
    const pendingPhase = state.enemyPlan.pendingPhaseIndex != null ? enemy.phases?.[state.enemyPlan.pendingPhaseIndex] : null;
    const card = $("#enemy-intent");
    const key = `${state.wave}:${phase.id}:${state.enemyPlan.cursor}`;
    const previousKey = state.enemyPlan.lastAnnouncedKey;
    if (card) {
      card.className = `enemy-intent-card threat-${intent.threat || "medium"}${state.delayed ? " is-delayed" : ""}`;
      $("#enemy-intent-icon").textContent = state.delayed ? "⌛" : (intent.icon || "⚔");
      $("#enemy-intent-kind").textContent = state.delayed ? "행동 지연" : intentKindLabel(intent);
      $("#enemy-intent-timing").textContent = state.delayed ? `${state.delayed}턴 후 실행` : "다음 적 턴";
      const threat = $("#enemy-intent-threat");
      threat.textContent = intentThreatLabel(intent);
      threat.className = `intent-threat threat-${intent.threat || "medium"}`;
      $("#enemy-intent-name").textContent = intent.name;
      $("#enemy-intent-value").textContent = intent.effectText || `${intent.damage || 0} 피해`;
      $("#enemy-intent-response").textContent = `권장 대응: ${intent.responseHint || "보드 흐름을 이어가세요"}`;
    }
    const phaseLabel = $("#enemy-phase-label");
    if (phaseLabel) phaseLabel.textContent = `${state.enemyPlan.phaseIndex + 1}단계 · ${phase.label}${pendingPhase ? ` · 다음부터 ${pendingPhase.label}` : ""}`;
    const cycle = $("#enemy-pattern-cycle");
    if (cycle) cycle.textContent = (phase.sequence?.length || 1) === 1 ? "고정 패턴" : `${phase.sequence.length}턴 순환`;
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
    let saved = "compact";
    try { saved = localStorage.getItem(READING_MODE_KEY) || "compact"; } catch {}
    setReadingMode(saved, false);
  }

  function openSettings() {
    updateReadingModeButtons();
    syncAudioControls();
    const modal = $("#settings-modal");
    modal.inert = false;
    modal.classList.add("open");
    $("#settings-close").focus({ preventScroll: true });
  }

  function closeSettings() {
    $("#settings-modal").classList.remove("open");
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
    const copy = $("#debug-copy");
    if (modeValue) modeValue.textContent = debugModeLabel();
    if (hpValue) hpValue.textContent = allowed ? `${Math.max(0, Math.ceil(state.playerHp))} / ${maxPlayerHp()}` : "-";
    if (reviveValue) reviveValue.textContent = allowed ? (state.reviveUsed ? "사용함" : "가능") : "-";
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
    state.run.skillCharges = Object.fromEntries(ids.map((id) => [id, state.run.skillCharges?.[id] || 0]));
    rebuildRunCharacterPool();
    updateAll();
    debugMessage("자령 팀을 5명으로 채웠습니다. 다음 신규 계약 후보에서 교체·중복 강화·포기를 확인할 수 있습니다.");
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
    openRoguelikeReward();
    debugMessage("현재 전투의 보상 화면을 열었습니다.");
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
      board: freshBoard, queue: [], turn: 1, wave: 0, enemyHp: ENEMIES[0].hp,
      playerHp: 100, shield: 0, delayed: 0, weakened: false, prepared: false,
      enemyBurn: 0, nextElementBoosts: {}, enemyShield: 0,
      totalCombos: 0, totalIdioms: 0,
      reviveUsed: false, dragging: false, dragMoved: false,
      resolving: false, selected: null, timerId: null, currentMoveLimit: MOVE_SECONDS, freshQueueIds: new Set(), gameOver: false,
      pointerX: 0, pointerY: 0, pangRunning: false, pangEndPending: false, dragPreview: null,
      swapAnimationUntil: 0, enemyPlan: createEnemyPlan(), stageIdiomIds: state.stageIdiomIds, usedStageIdiomIds: state.usedStageIdiomIds,
      rotatingIdiomIds: state.rotatingIdiomIds, usedRotatingIdiomIds: state.usedRotatingIdiomIds,
      readyIdiomIds: new Set(),
      nextIdiomRecipeTurn: state.nextIdiomRecipeTurn, idiomRecipeInterval: state.idiomRecipeInterval, recipeSupplyUntilTurn: state.recipeSupplyUntilTurn,
      nextMoveBonus: 0, enemyMovePenalty: 0, currentChargeBonus: 0, nextChargeBonus: 0, nextPlayerDamageBonus: 0, nextWeaknessDamageBonus: 0,
      enemyVulnerableTurns: 0, enemyVulnerableRatio: 0, enemySilenced: 0, healReductionTurns: 0, healReductionRatio: 0,
      reflectNextEnemyAttack: null, nextEnemyDamageReduction: 0, idiomGrowthStacks: 0, turnsSinceIdiom: 0, lastActivatedIdiomId: null,
      lastTurnElementDamage: {}, lastMatchGroupSizes: [], turnTotals: { damage: 0, heal: 0, shield: 0, burn: 0, delay: 0, elementDamage: {} },
      lockedTiles: new Map()
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
    button.className = `tile ${tile.element}`;
    if (falling && changed) button.classList.add("falling");
    if (isTileLocked(row, col)) button.classList.add("locked");
    button.dataset.row = row;
    button.dataset.col = col;
    button.dataset.id = tile.id;
    button.dataset.symbol = tile.symbol;
    button.setAttribute("role", "gridcell");
    button.setAttribute("aria-selected", String(Boolean(state.selected?.r === row && state.selected?.c === col)));
    button.setAttribute("aria-label", `${ELEMENTS.find((e) => e.id === tile.element).label} 속성, ${tile.char}, ${HANJA_READINGS[tile.char]}${isTileLocked(row, col) ? ", 1턴 봉인" : ""}`);
    button.title = `${tile.char} · ${HANJA_READINGS[tile.char]}`;
    if (changed) button.innerHTML = `<span class="hanja">${tile.char}</span><small class="tile-reading">${HANJA_READINGS[tile.char]}</small>`;
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
    wrap.style.setProperty("--queue-size", queueMax);
    for (let i = 0; i < queueMax; i++) {
      const entry = state.queue[i];
      const slot = document.createElement("span");
      slot.className = `queue-slot${entry ? " filled" : ""}${entry && state.freshQueueIds.has(entry.id) ? " new" : ""}`;
      if (entry) {
        const queueLife = getQueueLife();
        const remaining = Math.max(0, queueLife - (state.turn - entry.born));
        slot.innerHTML = `${entry.char}<span class="queue-life">${Array.from({ length: queueLife }, (_, n) => `<i class="${n < remaining ? "on" : ""}"></i>`).join("")}</span>`;
        slot.title = `${entry.char} · ${HANJA_READINGS[entry.char]} · ${remaining}턴 남음`;
        slot.setAttribute("aria-label", `${entry.char}, ${HANJA_READINGS[entry.char]}, ${remaining}턴 남음`);
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
    const labels = {
      dealDamage: (op) => `적에게 ${op.amount || 0} 피해`,
      gainShield: (op) => `보호막 ${op.amount || 0}`,
      heal: (op) => `체력 ${op.amount || 0} 회복`,
      delay: (op) => `적 행동 ${op.turns || 1}턴 지연`,
      returnQueueChar: (op) => `사용 문자 ${op.count || 1}개 회수`,
      chargeParty: (op) => `모든 자령 기력 +${op.amount || 1}`,
      draw: (op) => `필요 문자 ${op.count || 1}개 공급`,
      gainInk: (op) => `먹 ${op.amount || 0} 획득`,
      convertDrops: (op) => `드롭 ${op.count || 1}개 변환`,
      cleanse: () => "약화 효과 해제",
      duplicateLast: () => "직전 성어 효과 1회 복제"
    };
    const parts = (idiom.effectSpec?.ops || []).map((op) => labels[op.type]?.(op)).filter(Boolean);
    return parts.length ? parts.join(" · ") : "성어 공명으로 추가 피해";
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
    const meaningText = idiomMeaningText(idiom);
    const missingChars = idiom.chars.filter((char, index) => !availability[index]);
    const requirementText = ready ? "발동 준비" : `필요 ${missingChars.join("·")}`;
    const tooltip = `${idiom.sourceHanja} · ${idiom.pronunciation || idiom.name}\n뜻: ${meaningText}\n효과: ${effectText}`;
    return `<button type="button" class="idiom-card ${setKind} ${ready ? "ready" : ""}" data-idiom-detail="${escapeHtml(idiom.id)}" title="${escapeHtml(tooltip)}" aria-label="${escapeHtml(`${idiom.name}. ${requirementText}. 효과: ${effectText}. 눌러서 뜻 보기`)}">
      <div class="idiom-title"><strong>${escapeHtml(idiom.name)}</strong><em class="idiom-requirement">${escapeHtml(requirementText)}</em></div>
      <div class="idiom-slots">${idiom.chars.map((char, i) => `<span class="idiom-slot ${availability[i] ? "collected" : ""}" title="${escapeHtml(`${char} · ${HANJA_READINGS[char]}`)}"><b>${char}</b><small>${escapeHtml(HANJA_READINGS[char])}</small></span>`).join("")}</div>
      <p class="idiom-effect"><b>효과</b> ${escapeHtml(effectText)}</p>
    </button>`;
  }

  function renderIdiomFocus(idiom, setKind, preview) {
    const wrap = $("#idiom-focus");
    if (!wrap || !idiom) {
      if (wrap) wrap.innerHTML = "";
      return;
    }
    const availability = preview?.availability || idiomAvailability(idiom);
    const collected = availability.filter(Boolean).length;
    const ready = preview?.ready ?? collected === idiom.chars.length;
    const effectText = idiomEffectText(idiom);
    const meaningText = idiomMeaningText(idiom);
    wrap.innerHTML = `<button type="button" class="idiom-focus-card ${setKind} ${ready ? "ready" : ""}" data-idiom-detail="${escapeHtml(idiom.id)}" title="${escapeHtml(`뜻: ${meaningText}`)}" aria-label="${escapeHtml(`${idiom.name}, ${collected}글자 수집. 효과: ${effectText}. 눌러서 뜻 보기`)}">
      <span class="idiom-focus-heading"><em>${setKind === "rotating" ? "순환 학습" : "고정 학습"}</em><strong>${escapeHtml(idiom.name)}</strong><b>${ready ? "연성 가능" : `${collected}/4`}</b></span>
      <span class="idiom-focus-glyphs">${idiom.chars.map((char, index) => `<span class="${availability[index] ? "collected" : ""}"><b>${escapeHtml(char)}</b><small>${escapeHtml(HANJA_READINGS[char])}</small></span>`).join("")}</span>
      <span class="idiom-focus-effect"><b>효과</b>${escapeHtml(effectText)}</span>
    </button>`;
  }

  function chooseIdiomFocus(fixed, rotating, activationPreview) {
    const candidates = [...fixed.map((idiom) => ({ idiom, kind: "fixed" })), ...rotating.map((idiom) => ({ idiom, kind: "rotating" }))];
    return candidates.sort((left, right) => {
      const leftPreview = activationPreview.get(left.idiom.id);
      const rightPreview = activationPreview.get(right.idiom.id);
      const leftCount = (leftPreview?.availability || idiomAvailability(left.idiom)).filter(Boolean).length;
      const rightCount = (rightPreview?.availability || idiomAvailability(right.idiom)).filter(Boolean).length;
      const leftReady = leftPreview?.ready ?? leftCount === 4;
      const rightReady = rightPreview?.ready ?? rightCount === 4;
      return Number(rightReady) - Number(leftReady) || rightCount - leftCount || (left.kind === right.kind ? 0 : left.kind === "fixed" ? -1 : 1);
    })[0] || null;
  }

  function renderIdioms() {
    const wrap = $("#idiom-cards");
    const fixed = getFixedIdioms();
    const rotating = getRotatingIdioms();
    const activationPreview = getIdiomActivationPreview();
    const readyIds = new Set([...fixed, ...rotating]
      .filter((idiom) => activationPreview.get(idiom.id)?.ready ?? idiomAvailability(idiom).every(Boolean))
      .map((idiom) => idiom.id));
    const newlyReady = [...readyIds].filter((id) => !state.readyIdiomIds.has(id));
    const remaining = Math.max(0, state.nextIdiomRecipeTurn - state.turn) || 1;
    wrap.innerHTML = `<section class="idiom-set fixed-set" aria-label="고정 연성식">
      <div class="idiom-set-heading"><b>고정</b><span>내가 고른 성어 · 전투 내내 유지</span></div>
      <div class="idiom-card-grid">${fixed.map((idiom) => renderIdiomCard(idiom, "fixed", activationPreview.get(idiom.id))).join("")}</div>
    </section>
    <section class="idiom-set rotating-set" aria-label="순환 연성식">
      <div class="idiom-set-heading"><b>순환</b><span>${remaining}턴 후 무작위 3개 교체</span></div>
      <div class="idiom-card-grid">${rotating.map((idiom) => renderIdiomCard(idiom, "rotating", activationPreview.get(idiom.id))).join("")}</div>
    </section>`;
    const rogueRotatingWrap = $("#roguelike-rotating-cards");
    if (rogueRotatingWrap) {
      rogueRotatingWrap.innerHTML = rotating.map((idiom) => renderIdiomCard(idiom, "rotating", activationPreview.get(idiom.id))).join("");
    }
    const rogueRotatingStatus = $("#roguelike-rotating-status");
    if (rogueRotatingStatus) rogueRotatingStatus.textContent = `${remaining}턴 후 3개 교체`;
    const focused = chooseIdiomFocus(fixed, rotating, activationPreview);
    if (focused) {
      state.focusedIdiomId = focused.idiom.id;
      renderIdiomFocus(focused.idiom, focused.kind, activationPreview.get(focused.idiom.id));
    } else renderIdiomFocus(null);
    const cycle = $("#idiom-cycle-status");
    if (cycle && state.mode !== "pang") {
      cycle.textContent = `고정 ${fixed.length} + 순환 ${rotating.length} · 클릭하면 뜻 보기`;
    }
    state.readyIdiomIds = readyIds;
    if (newlyReady.length) audioDirector.playSfx("idiom-ready");
  }

  function updateVitals() {
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
      enemyKind.title = `${studyHanja} · ${studyReading} · ${studyMeaning}`;
      enemyKind.setAttribute("aria-label", `${enemy.wildLabel || "야생 자령"}, ${studyHanja}, ${studyReading}, 뜻 ${studyMeaning}. 야생 상태라 부적은 없습니다.`);
    }
    $("#enemy-hp-text").textContent = `${Math.max(0, Math.ceil(state.enemyHp))} / ${enemy.hp}`;
    const hpPercent = clamp(state.enemyHp / enemy.hp * 100, 0, 100);
    $("#enemy-hp-bar").style.width = `${hpPercent}%`;
    $("#enemy-hp-percent").textContent = `${Math.round(hpPercent)}%`;
    const playerMaxHp = state.run?.maxHp || 100;
    $("#player-hp-text").textContent = `${Math.max(0, Math.ceil(state.playerHp))} / ${playerMaxHp}`;
    $("#player-hp-bar").style.width = `${clamp(state.playerHp / playerMaxHp * 100, 0, 100)}%`;
    $("#shield-badge b").textContent = state.shield;
    $("#wave-label").textContent = state.mode === "roguelike" ? `제${state.run?.act || 1}막 · ${Math.min(11, (state.run?.combatsWon || 0) + 1)}전` : `제${["일", "이", "삼"][state.wave]}파`;
    $("#turn-label").textContent = `${state.turn}번째 연성`;
    renderEnemyIntent();
    const sprite = $("#enemy-sprite");
    sprite.className = `enemy-sprite ${enemy.className}`;
    sprite.setAttribute("aria-label", enemy.name);
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
    renderEnemyStatuses();
    renderEnemyAffinity();
    $("#total-combos").textContent = state.totalCombos;
    $("#total-idioms").textContent = state.totalIdioms;
    $("#revive-status").textContent = state.reviveUsed ? "사용함" : "가능";
    renderJaryeongPanel();
  }

  function updateAll() {
    renderBoard(); renderQueue(); renderIdioms(); updateVitals(); updateRoguelikeHud();
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
    audioDirector.playSfx(step > 1 ? "combo-low" : "tile-swap");
  }

  function beginDrag(event) {
    const secondaryPointer = event.button === 2 || (event.button > 0 && event.buttons && event.buttons !== 1);
    if (state.dragging || state.resolving || state.gameOver || secondaryPointer) return;
    if (state.mode === "pang" && !state.pangRunning) return;
    const tile = event.target.closest(".tile");
    if (!tile) return;
    if (isTileLocked(+tile.dataset.row, +tile.dataset.col)) return;
    event.preventDefault();
    state.dragging = true;
    audioDirector.unlock();
    audioDirector.playSfx("tile-pick");
    state.selected = { r: +tile.dataset.row, c: +tile.dataset.col };
    state.pangOrigin = { ...state.selected };
    state.pangTarget = null;
    state.pangMoved = false;
    if (event.pointerId != null) $("#board").setPointerCapture?.(event.pointerId);
    if (state.mode === "pang") {
      tile.classList.add("selected");
      return;
    }
    state.dragMoved = false;
    state.dragPreview = { ...state.board[state.selected.r][state.selected.c] };
    state.moveStartedAt = performance.now();
    state.pointerX = event.clientX; state.pointerY = event.clientY;
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
    swapCells(current, next);
    state.dragMoved = true;
    state.selected = next;
    renderBoard({ animateSwap: true });
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

  function handleBoardKeyboard(event) {
    if (state.mode !== "puzzle" && state.mode !== "roguelike") return;
    const tile = event.target.closest?.(".tile");
    if (!tile) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (state.dragging) void endDrag();
      else beginKeyboardDrag(tile);
      return;
    }
    if (!state.dragging) return;
    const directions = {
      ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1],
      Home: [-1, -1], PageUp: [-1, 1], End: [1, -1], PageDown: [1, 1]
    };
    const direction = directions[event.key];
    if (!direction) return;
    event.preventDefault();
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

  function dragMove(event) {
    if (!state.dragging || state.resolving) return;
    if (state.mode === "puzzle" || state.mode === "roguelike") {
      state.pointerX = event.clientX; state.pointerY = event.clientY;
      const limit = state.currentMoveLimit || getMoveSeconds();
      updateCursorTimer(Math.max(0, limit - (performance.now() - state.moveStartedAt) / 1000));
      const ghost = $("#drag-ghost");
      if (ghost) { ghost.style.left = `${state.pointerX}px`; ghost.style.top = `${state.pointerY}px`; }
    }
    const hovered = document.elementFromPoint(event.clientX, event.clientY)?.closest(".tile");
    if (!hovered) return;
    const next = { r: +hovered.dataset.row, c: +hovered.dataset.col };
    if (isTileLocked(next.r, next.c)) return;
    const current = state.selected;
    const rowDistance = Math.abs(next.r - current.r);
    const colDistance = Math.abs(next.c - current.c);
    const validStep = state.mode === "puzzle" || state.mode === "roguelike"
      ? Math.max(rowDistance, colDistance) === 1
      : rowDistance + colDistance === 1;
    if (!validStep) return;
    if (state.mode === "pang") {
      if (state.pangMoved) return;
      swapCells(current, next);
      state.pangTarget = { ...next };
      state.pangMoved = true;
      state.selected = next;
      renderBoard();
      return;
    }
    swapCells(current, next);
    state.dragMoved = true;
    state.selected = next;
    renderBoard({ animateSwap: true });
    playSwapSound(Math.max(rowDistance, colDistance));
  }

  async function endDrag() {
    if (!state.dragging) return;
    if (state.mode === "pang") {
      state.dragging = false;
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
    state.dragging = false;
    clearInterval(state.timerId);
    state.timerId = null;
    clearDragPreview();
    state.dragPreview = null;
    state.dragMoved = false;
    state.selected = null;
    $("#move-timer").classList.remove("active");
    $("#cursor-timer").classList.remove("active", "danger");
    $("#move-timer strong").textContent = getMoveSeconds().toFixed(1);
    $("#move-timer i").style.transform = "scaleX(1)";
    renderBoard();
    if (moved && settleMs) await wait(settleMs);
    state.swapAnimationUntil = 0;
    await resolveTurn();
  }

  function findMatches() {
    const matched = new Set();
    const groups = [];
    for (let r = 0; r < ROWS; r++) {
      let start = 0;
      for (let c = 1; c <= COLS; c++) {
        if (c === COLS || state.board[r][c].element !== state.board[r][start].element) {
          if (c - start >= 3) {
            const group = [];
            for (let x = start; x < c; x++) { matched.add(`${r},${x}`); group.push([r, x]); }
            groups.push(group);
          }
          start = c;
        }
      }
    }
    for (let c = 0; c < COLS; c++) {
      let start = 0;
      for (let r = 1; r <= ROWS; r++) {
        if (r === ROWS || state.board[r][c].element !== state.board[start][c].element) {
          if (r - start >= 3) {
            const newCells = [];
            for (let y = start; y < r; y++) { matched.add(`${y},${c}`); newCells.push([y, c]); }
            groups.push(newCells);
          }
          start = r;
        }
      }
    }
    return { matched, groups };
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

  function floatDamage(amount, label = "", kind = "player") {
    const el = $("#damage-float");
    el.textContent = `${label}${Math.round(amount)}`;
    el.classList.toggle("from-player", kind === "player");
    el.classList.toggle("from-effect", kind !== "player");
    el.classList.remove("show"); void el.offsetWidth; el.classList.add("show");
    const sprite = $("#enemy-sprite");
    sprite.classList.remove("enemy-hit"); void sprite.offsetWidth; sprite.classList.add("enemy-hit");
    const bar = document.querySelector(".enemy-bar");
    bar?.classList.remove("damage-pulse");
    if (bar) { void bar.offsetWidth; bar.classList.add("damage-pulse"); }
  }

  let battleFeedbackTimer = null;

  function showBattleFeedback(kind, title, detail) {
    const feedback = $("#battle-feedback");
    if (!feedback) return;
    window.clearTimeout(battleFeedbackTimer);
    $("#battle-feedback-kicker").textContent = kind === "enemy" ? "적 공격" : "내 공격";
    $("#battle-feedback-title").textContent = title;
    $("#battle-feedback-detail").textContent = detail;
    feedback.classList.remove("player", "enemy", "show");
    void feedback.offsetWidth;
    feedback.classList.add(kind === "enemy" ? "enemy" : "player", "show");
    battleFeedbackTimer = window.setTimeout(() => feedback.classList.remove("show"), 1500);
  }

  function showPlayerHitFeedback(damage, absorbed = 0) {
    const value = $("#player-damage-float");
    const panel = $("#puzzle-panel");
    if (value) {
      value.textContent = damage > 0 ? `−${Math.round(damage)} HP` : `보호막 ${Math.round(absorbed)} 방어`;
      value.classList.toggle("blocked", damage <= 0);
      value.classList.remove("show");
      void value.offsetWidth;
      value.classList.add("show");
    }
    panel?.classList.remove("player-hit");
    if (panel) { void panel.offsetWidth; panel.classList.add("player-hit"); }
    const bar = document.querySelector(".player-bar");
    bar?.classList.remove("damage-pulse");
    if (bar) { void bar.offsetWidth; bar.classList.add("damage-pulse"); }
    audioDirector.playSfx(damage > 0 ? "debuff" : "shield");
  }

  let enemyArtRestoreTimer = null;
  let idleSpriteAlt = false;

  function setEnemyArtFrame(frameKey, restoreMs = 0) {
    const enemy = currentEnemy();
    const art = $("#enemy-sprite-art");
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

  function animateSquadElement(element) {
    const member = document.querySelector(`.squad-jaryeong.${element}`);
    const jaryeong = getJaryeong(member?.dataset.squadJaryeong);
    const img = member?.querySelector(".sprite-body");
    if (!member || !img || !jaryeong?.asset?.attack) return;
    img.src = jaryeong.asset.attack;
    setTalismanFrame(member, jaryeong, "attack");
    member.classList.remove("attacking");
    void member.offsetWidth;
    member.classList.add("attacking");
    window.setTimeout(() => {
      member.classList.remove("attacking");
      img.src = jaryeong.asset.idle;
      setTalismanFrame(member, jaryeong, "idle");
    }, 420);
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
      reflectNextEnemyAttack: null, nextEnemyDamageReduction: 0, enemyShield: 0, idiomGrowthStacks: 0, turnsSinceIdiom: 0,
      lastActivatedIdiomId: null, lastTurnElementDamage: {}, lastMatchGroupSizes: [],
      turnTotals: { damage: 0, heal: 0, shield: 0, burn: 0, delay: 0, elementDamage: {} },
      lockedTiles: new Map()
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
    if (element === "metal" && pierce) return 1;
    if (enemy.weakElement === element) return 1.3;
    if (enemy.resistElement === element) return .8;
    return 1;
  }

  function applyElementMatchEffects(elementCounts, comboScale) {
    const activeElements = Object.entries(elementCounts).filter(([, count]) => count > 0).map(([element]) => element);
    const activeSet = new Set(activeElements);
    const leader = getLeaderJaryeong();
    const total = { damage: 0, heal: 0, shield: 0, burn: 0, delay: 0, logs: [], byElement: {} };
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
      const attackBase = party.length ? party.reduce((sum, jaryeong) => sum + jaryeong.attack * (1 + ((state.run?.jaryeongLevels?.[jaryeong.id] || 1) - 1) * .15), 0) : ELEMENT_RULES[element].damage;
      const playerDamageBonus = state.nextPlayerDamageBonus || 0;
      const weaknessBonus = currentEnemy().weakElement === element ? (state.nextWeaknessDamageBonus || 0) : 0;
      const affinityStacks = state.run?.elementAffinity?.[element] || 0;
      const focusStacks = state.run?.focusBuildElement === element ? state.run?.focusBuildStacks || 0 : 0;
      const buildMultiplier = Math.min(RUN_LIMITS.maxDamageMultiplier, 1 + affinityStacks * .08 + focusStacks * .05);
      const damage = Math.round(attackBase * units * comboScale * leaderDamageBonus * buildMultiplier * (1 + synergyBonus * .18) * elementMultiplier(element, element === "metal" && synergyBonus > 0) * (1 + weaknessBonus) * (state.weakened ? .75 : 1) * (1 + playerDamageBonus) * (1 + (state.idiomGrowthStacks || 0) * .04));
      total.damage += damage;
      total.byElement[element] = (total.byElement[element] || 0) + damage;
      chargePartyByElement(element, count);
      if (element === "wood") total.heal += Math.round(units * 2 * leaderHealBonus * (1 + synergyBonus * .4));
      if (element === "fire") {
        total.burn += Math.max(1, Math.round(units * (1 + synergyBonus)));
        state.enemyBurn += total.burn;
      }
      if (element === "earth") total.shield += Math.round(units * 4 * leaderShieldBonus * (1 + synergyBonus));
      if (element === "water") {
        total.delay = Math.max(total.delay, Math.max(1, Math.round(units + synergyBonus)));
        const firstWater = getRunRelicEffect("firstWaterDelay");
        if (firstWater && claimRunTrigger(state.run, encounterRelicKey("firstWaterDelay"))) {
          total.delay += firstWater.turns || 1;
          addLog(`<strong>${firstWater.relicName}</strong> · 첫 수 매치의 행동 지연 +${firstWater.turns || 1}`, "water");
        }
        if (leader?.element === "water" && !state.run?.leaderDelayUsed && count >= 6) {
          total.delay += 1;
          if (state.run) state.run.leaderDelayUsed = true;
        }
      }
      if (element === "metal" && count >= 4) {
        const metalPierce = getRunRelicEffect("metalPierce");
        if (metalPierce && state.enemyShield > 0) {
          const pierced = Math.min(state.enemyShield, metalPierce.amount || 0);
          state.enemyShield -= pierced;
          if (pierced) addLog(`<strong>${metalPierce.relicName}</strong> · 야생 보호막 ${pierced} 관통`, "metal");
        }
      }
      total.logs.push(`${ELEMENT_RULES[element].label} ${damage}피해`);
      animateSquadElement(element);
      audioDirector.playSfx(`hit-${element}`);
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
    if (total.damage) applyDamage(total.damage, "내 공격 −", { feedbackKind: "player" });
    if (total.heal) healPlayer(total.heal);
    if (total.shield) gainShield(total.shield);
    if (total.delay) {
      const beforeDelay = state.delayed;
      state.delayed = Math.min(RUN_LIMITS.maxDelay, Math.max(state.delayed, total.delay));
      recordTurnTotal("delay", Math.max(0, state.delayed - beforeDelay));
    }
    if (total.burn) recordTurnTotal("burn", total.burn);
    state.lastTurnElementDamage = { ...total.byElement };
    if (activeElements.length) state.nextWeaknessDamageBonus = 0;
    state.nextPlayerDamageBonus = 0;
    return total;
  }

  function useJaryeongSkill(id) {
    if (state.mode !== "roguelike" || !state.run || state.resolving || state.gameOver) return;
    const jaryeong = getJaryeong(id);
    if (!jaryeong || !state.run.partyJaryeongIds.includes(id) || (state.run.skillCharges?.[id] || 0) < 5) return;
    const skill = JARYEONG_SKILL_LIBRARY[jaryeong.skillId] || { name: jaryeong.skillName, description: jaryeong.skillDesc };
    const level = getJaryeongLevel(id);
    const awakened = level >= 5;
    state.run.skillCharges[id] = 0;
    switch (jaryeong.element) {
      case "wood":
        if (jaryeong.id === "wood-life") healPlayer(state.playerHp <= 35 ? 26 : 18);
        else if (jaryeong.id === "wood-tree") { gainShield(10); healPlayer(8); }
        else { healPlayer(12); if (awakened) gainShield(6); }
        state.nextElementBoosts.wood = (state.nextElementBoosts.wood || 0) + 1;
        break;
      case "fire":
        applyDamage(jaryeong.id === "fire-sun" ? 28 : jaryeong.id === "fire-light" ? 18 : 22, "스킬 −");
        state.enemyBurn += jaryeong.id === "fire-hwa" ? 2 : 1;
        if (awakened && state.enemyBurn >= 5) { applyTrueDamage(state.enemyBurn, "각성 화상 −"); state.enemyBurn = 0; }
        state.nextElementBoosts.fire = (state.nextElementBoosts.fire || 0) + 1;
        break;
      case "earth":
        gainShield(jaryeong.id === "earth-to" ? 20 : jaryeong.id === "earth-mountain" ? 8 : 14);
        if (awakened && state.shield > 30) applyTrueDamage(Math.round((state.shield - 30) * .25), "각성 반동 −");
        break;
      case "metal":
        applyDamage(jaryeong.id === "metal-sword" ? 30 : 24, "스킬 −", { ignoreShield: true });
        state.nextElementBoosts.metal = (state.nextElementBoosts.metal || 0) + 1;
        break;
      case "water":
        state.delayed = Math.max(state.delayed, 1);
        state.nextElementBoosts.water = (state.nextElementBoosts.water || 0) + 1;
        if (jaryeong.id === "water-sui") addBoardElementTiles("water", awakened ? 4 : 2);
        if (jaryeong.id === "water-sea") applyDamage(18, "스킬 −");
        if (jaryeong.id === "water-rain") gainShield(awakened ? 12 : 8);
        break;
    }
    addLog(`<strong>${jaryeong.hanja}령 · ${skill.name}</strong> · ${skill.description}`, "alchemy");
    updateAll();
  }

  async function resolveTurn() {
    state.resolving = true;
    state.freshQueueIds.clear();
    state.currentChargeBonus = state.nextChargeBonus || 0;
    state.nextChargeBonus = 0;
    resetTurnTotals();
    state.lastMatchGroupSizes = [];
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
      matches.groups.forEach((group) => state.lastMatchGroupSizes.push(group.length));
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
      const elemental = applyElementMatchEffects(elementCounts, comboScale);
      const outcome = [`총 ${elemental.damage} 피해`];
      if (elemental.heal) outcome.push(`체력 +${elemental.heal}`);
      if (elemental.shield) outcome.push(`보호막 +${elemental.shield}`);
      if (elemental.delay) outcome.push(`적 ${elemental.delay}턴 지연`);
      if (elemental.burn) outcome.push(`화상 ${elemental.burn}`);
      showBattleFeedback("player", `${comboCount}콤보 · ${removedTiles.length}드롭`, outcome.join(" · "));
      addLog(`<strong>${comboCount}콤보</strong> · ${removedTiles.length}개 제거 · 피해 ${elemental.damage}${elemental.heal ? ` · 회복 ${elemental.heal}` : ""}${elemental.shield ? ` · 보호 ${elemental.shield}` : ""}${elemental.delay ? ` · 행동 지연 ${elemental.delay}턴` : ""}${elemental.burn ? ` · 화상 ${elemental.burn}` : ""}`, "combo");
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
    const activated = await activateIdioms(elementCounts, comboCount);
    cleanQueue(activated.usedIds);
    state.turnsSinceIdiom = activated.activated.length ? 0 : (state.turnsSinceIdiom || 0) + 1;
    renderQueue(); renderIdioms(); updateVitals();

    if (state.enemyHp <= 0) {
      await nextWave();
    } else {
      const hourglass = getRunRelicEffect("turnSevenDelay");
      if (hourglass && state.turn === 7 && claimRunTrigger(state.run, encounterRelicKey("turnSevenDelay"))) {
        state.delayed = Math.min(RUN_LIMITS.maxDelay, state.delayed + (hourglass.turns || 1));
        addLog(`<strong>${hourglass.relicName}</strong> · 7턴째의 적 행동을 ${hourglass.turns || 1}턴 지연`, "water");
      }
      await enemyTurn();
    }
    if (!state.gameOver) {
      if (state.enemyVulnerableTurns > 0) state.enemyVulnerableTurns--;
      if (state.enemySilenced > 0) state.enemySilenced--;
      if (state.healReductionTurns > 0) {
        state.healReductionTurns--;
        if (!state.healReductionTurns) state.healReductionRatio = 0;
      }
      reduceTileLocks();
      state.currentChargeBonus = 0;
      state.turn++;
      state.queue = state.queue.filter((entry) => state.turn - entry.born < getQueueLife());
      if (state.queue.length > getQueueMax()) state.queue = state.queue.slice(-getQueueMax());
      state.freshQueueIds.clear();
      refreshRotatingIdioms({ announce: true });
      updateAll();
      state.resolving = false;
    }
  }

  function applyDamage(amount, label = "−", options = {}) {
    const raw = Math.max(0, Number(amount) || 0);
    if (!raw) return 0;
    const vulnerableBonus = options.ignoreVulnerability ? 0 : (state.enemyVulnerableTurns > 0 ? state.enemyVulnerableRatio || 0 : 0);
    let dealt = raw * (1 + vulnerableBonus);
    if (!options.ignoreShield && state.enemyShield > 0) {
      const absorbed = Math.min(state.enemyShield, dealt);
      state.enemyShield -= absorbed;
      dealt -= absorbed;
    }
    if (dealt > 0) state.enemyHp -= dealt;
    recordTurnTotal("damage", dealt);
    if (dealt > 0) audioDirector.playSfx("enemy-hit");
    floatDamage(dealt, label, options.feedbackKind || "effect");
    updateVitals();
    if (dealt > 0) setEnemyArtFrame("hurt", 320);
    return dealt;
  }

  function applyTrueDamage(amount, label = "−") {
    return applyDamage(amount, label, { ignoreVulnerability: true, ignoreShield: true });
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
    $("#alchemy-glyphs").innerHTML = idiom.chars.map((char, i) => `<span style="animation-delay:${i * 80}ms">${char}</span>`).join("");
    $("#alchemy-name").textContent = idiom.name;
    $("#alchemy-reading").textContent = `${idiom.sourceHanja} · ${idiom.pronunciation || idiom.name}`;
    $("#alchemy-effect").textContent = idiomEffectText(idiom);
    overlay.classList.remove("show"); void overlay.offsetWidth; overlay.classList.add("show");
    await wait(state.mode === "roguelike" ? 620 : 900);
    overlay.classList.remove("show");
  }

  function applyJaryeongResonance(idiom) {
    if (state.mode !== "roguelike" || !state.run) return 0;
    const participants = getPartyJaryeongs().filter((jaryeong) => idiom.chars.includes(jaryeong.hanja));
    if (!participants.length) return 0;
    participants.forEach((jaryeong) => chargeJaryeong(jaryeong.id, participants.length >= 4 ? 2 : 1));
    const complete = participants.length >= 4;
    const bonusDamage = complete ? 36 : participants.length * 9;
    applyDamage(bonusDamage, "공명 −");
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
      applyDamage(Math.round(amount * ratio), "집중 −");
      getPartyJaryeongs().filter((jaryeong) => jaryeong.element === element).forEach((jaryeong) => chargeJaryeong(jaryeong.id, 1));
      return;
    }
    if (id === "twoBirds") {
      const snapshot = { ...state.turnTotals };
      applyDamage(Math.round((snapshot.damage || 0) * .5), "메아리 −");
      healPlayer(Math.round((snapshot.heal || 0) * .5));
      gainShield(Math.round((snapshot.shield || 0) * .5));
      if (snapshot.burn) { state.enemyBurn += Math.max(1, Math.round(snapshot.burn * .5)); recordTurnTotal("burn", Math.round(snapshot.burn * .5)); }
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
      if (state.weakened) state.weakened = false;
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
    const upgrade = state.run?.idiomUpgrades?.[idiom.id] || 0;
    const multiplier = Math.min(RUN_LIMITS.maxDamageMultiplier, 1 + upgrade * .15);
    const ops = idiom.effectSpec?.ops || [{ type: "dealDamage", amount: idiom.tier === "희귀" ? 30 : idiom.tier === "중급" ? 22 : 16 }];
    ops.forEach((op) => {
      const amount = Math.round((op.amount || 0) * multiplier);
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

  function applyEnemyIntentEffect(intent, silenced = false) {
    const effect = intent?.effect;
    if (!effect) return silenced ? " · 부가효과 봉인" : "";
    if (silenced) return " · 부가효과 봉인";
    switch (effect.type) {
      case "weaken":
        audioDirector.playSfx("debuff");
        state.weakened = true;
        if (effect.healReduction) {
          state.healReductionTurns = Math.max(state.healReductionTurns, effect.turns || 1);
          state.healReductionRatio = Math.max(state.healReductionRatio || 0, effect.healReduction);
        }
        return effect.healReduction ? " · 회복 약화" : " · 기력 약화";
      case "lockTiles":
        lockRandomTiles(effect.count || 2, effect.turns || 1);
        if (effect.healAmount) state.enemyHp = Math.min(currentEnemy().hp, state.enemyHp + effect.healAmount);
        return ` · 타일 ${effect.count || 2}개 봉인`;
      case "healEnemy":
        state.enemyHp = Math.min(currentEnemy().hp, state.enemyHp + (effect.amount || 0));
        return ` · 기운 ${effect.amount || 0} 회복`;
      case "gainEnemyShield":
        state.enemyShield += effect.amount || 0;
        return ` · 보호막 ${effect.amount || 0}`;
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

  async function enemyTurn() {
    if (state.enemyBurn > 0) {
      const burn = state.enemyBurn;
      state.enemyBurn = 0;
      applyDamage(burn, "화상 −");
      const burnEcho = getRunRelicEffect("burnEcho");
      const echoDamage = burnEcho ? applyTrueDamage(burnEcho.amount || 0, "불씨 −") : 0;
      addLog(`자령에게 남은 <strong>화상 ${burn}</strong>이 터졌습니다.${echoDamage ? ` · ${burnEcho.relicName} 추가 피해 ${echoDamage}` : ""}`, "fire");
      updateVitals();
      if (state.enemyHp <= 0) {
        await nextWave();
        return;
      }
    }
    if (state.delayed > 0) {
      state.delayed--;
      addLog("수의 기운이 자령 행동을 <strong>한 턴 늦췄습니다.</strong>", "water");
      updateVitals();
      return;
    }
    const enemy = currentEnemy();
    const intent = currentEnemyIntent();
    setEnemyArtFrame(enemy.asset?.telegraph ? "telegraph" : "windup", 0);
    await wait(210);
    setEnemyArtFrame("attack", 360);
    await wait(120);
    const silenced = state.enemySilenced > 0;
    const rawDamage = Math.round((intent.damage || 0) * (state.enemyDamageMultiplier || 1));
    let damage = rawDamage;
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
    const reflect = state.reflectNextEnemyAttack;
    state.reflectNextEnemyAttack = null;
    if (reflect?.damageReduction) damage = Math.floor(damage * (1 - reflect.damageReduction));
    const piercesShield = intent.effect?.type === "pierce" && !silenced;
    const absorbed = piercesShield ? 0 : Math.min(state.shield, damage);
    state.shield -= absorbed;
    damage -= absorbed;
    state.playerHp -= damage;
    const effectSuffix = applyEnemyIntentEffect(intent, silenced);
    showPlayerHitFeedback(damage, absorbed);
    const enemyOutcome = [];
    if (absorbed) enemyOutcome.push(`보호막이 ${absorbed} 막음`);
    enemyOutcome.push(damage > 0 ? `체력 ${damage} 감소` : "체력 피해 없음");
    const secondaryEffect = !silenced ? intent.effectText?.split(" · ").slice(1).join(" · ") : "부가효과 봉인";
    if (secondaryEffect) enemyOutcome.push(secondaryEffect);
    showBattleFeedback("enemy", intent.name, enemyOutcome.join(" · "));
    if (reflect) {
      const reflectedDamage = Math.round(rawDamage * (reflect.ratio || 1));
      applyTrueDamage(reflectedDamage, "반사 −");
      addLog(`<strong>${reflect.label || "자업자득"}</strong> · 적 공격 ${reflectedDamage}를 반사했습니다.`, "alchemy");
    }
    addLog(`${enemy.name}의 ${intent.name} · ${absorbed ? `보호막 ${absorbed} 흡수 · ` : ""}<strong>${damage} 피해</strong>${effectSuffix}`, "enemy");
    advanceEnemyPlan();
    updateVitals();
    await wait(220);
    if (state.enemyHp <= 0) {
      await nextWave();
      return;
    }
    if (state.playerHp <= 0) await handleDefeat();
  }

  function createRoguelikeRun() {
    const seed = `SAJA-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${Math.floor(randomFrom(state.sessionRng) * 0xffffff).toString(36).toUpperCase().padStart(5, "0")}`;
    const rng = createSeededRng(seed);
    const volumeIndex = clamp(Number(metaProgress.selectedVolumeIndex) || 0, 0, CHARACTER_VOLUMES.length - 1);
    const volume = CHARACTER_VOLUMES[volumeIndex] || CHARACTER_VOLUMES[0];
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
      leaderJaryeongId: null,
      partyJaryeongIds: [],
      jaryeongLevels: {},
      skillCharges: {},
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
      encounteredJaryeongIds: [],
      contractFragments: [],
      rewardHistory: [],
      rewardRerolls: Math.min(1, Number(metaProgress.rewardRerolls) || 0),
      maxHp: 100 + Math.min(5, Number(metaProgress.maxHpBonus) || 0),
      pendingFlags: {},
      completedNodeIds: []
    };
    run.characterPool = buildRunCharacterPool({ volume, rng, targetSize: 125 });
    return run;
  }

  function updateRoguelikeHud() {
    const progress = $("#roguelike-progress");
    const build = $("#roguelike-build");
    if (!progress || !build) return;
    const run = state.run;
    const sceneAct = clamp(run?.act || 1, 1, 3);
    document.body.style.setProperty("--rogue-scene", `url("${ASSET_MANIFEST.backgrounds[`act${sceneAct}`]}")`);
    document.body.dataset.rogueAct = String(sceneAct);
    const node = run ? clamp((run.routeIndex || 0) + 1, 1, 15) : 1;
    progress.textContent = `제${run?.act || 1}막 · 노드 ${node} / 15`;
    if (!run) {
      build.textContent = "문자권과 성어를 고르고 3막의 행로를 완주하세요";
      renderJaryeongPanel();
      return;
    }
    const idioms = run.idiomBookIds.length;
    const relics = run.relicIds.length;
    const fragments = run.contractFragments?.length || 0;
    const party = run.partyJaryeongIds?.length || 0;
    const leader = getLeaderJaryeong();
    const stoneBreaks = run.consumables?.["stone-break"] || 0;
    const focusLabel = run.focusBuildStacks ? ` · 집중 ${ELEMENT_RULES[run.focusBuildElement]?.label || "목"}+${run.focusBuildStacks}` : "";
    build.textContent = `리더 ${leader?.name || "-"} · 자령 ${party}/5 · 성어 ${idioms}/${RUN_LIMITS.idiomBookMax} · 유물 ${relics} · 먹 ${run.ink || 0}${fragments ? ` · 조각 ${fragments}` : ""}${stoneBreaks ? ` · 석파 ${stoneBreaks}` : ""}${focusLabel}`;
    renderJaryeongPanel();
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
    clearActiveRunSave({ sync: false });
    $("#roguelike-intro-modal").classList.remove("open");
    $("#roguelike-result-modal").classList.remove("open");
    prepareRoguelikeRun();
    openRoguelikeLeaderPicker();
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
    $("#codex-stats").textContent = `자령 15종 · 발견 ${metaProgress.seenJaryeongs.length}`;
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

  function roguelikeDraftPool() {
    return ACTIVE_IDIOMS.filter((idiom) => !state.run?.idiomBookIds.includes(idiom.id));
  }

  function renderRoguelikeDraft() {
    const run = state.run;
    if (!run) return;
    const choices = run.draftChoices || [];
    $("#roguelike-draft-title").textContent = `${run.draftStep + 1}번째 고정 성어를 고르세요`;
    $("#roguelike-draft-copy").textContent = "직접 고른 세 성어는 전투 내내 유지됩니다. 전투에서는 별도의 순환 성어 세 개가 추가됩니다.";
    $("#roguelike-draft-progress").textContent = `${run.idiomBookIds.length} / ${INITIAL_IDIOM_DRAFT_COUNT} 고정 성어 선택 · 순환 성어 3개 별도`;
    $("#roguelike-draft-cards").innerHTML = choices.map((idiom) => `<button type="button" class="roguelike-choice" data-roguelike-idiom="${idiom.id}">
      <span class="roguelike-choice-glyphs">${idiom.chars.map((char) => `<b title="${char} · ${HANJA_READINGS[char]}">${char}</b>`).join("")}</span>
      <span class="roguelike-choice-meta"><em>${idiom.tier || "성어"} · ${idiom.category || "연성"} · ${idiom.role || "전투 효과"}</em><strong>${idiom.name}</strong><small>${idiom.reading}</small></span>
      <span class="roguelike-choice-desc">${idiom.desc}</span>
    </button>`).join("");
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
    const tier = currentRouteTier();
    if (tier) void audioDirector.playBgm(`act-${tier.act}`);
    saveActiveRun();
  }

  function chooseRoguelikeNode(id) {
    const run = state.run;
    const tier = currentRouteTier();
    const node = tier?.choices.find((candidate) => candidate.id === id);
    if (!run || !node) return;
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
    state.prepared = false;
    state.enemyBurn = 0;
    state.enemyShield = 0;
    state.enemyVulnerableTurns = 0;
    state.enemyVulnerableRatio = 0;
    state.enemySilenced = 0;
    state.healReductionTurns = 0;
    state.healReductionRatio = 0;
    state.reflectNextEnemyAttack = null;
    state.nextEnemyDamageReduction = pending.nextBattleReduction || 0;
    state.enemyDamageMultiplier = 1;
    state.lockedTiles = new Map();
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
    resetTurnTotals();
    state.turn = 1;
    state.queue = [];
    state.freshQueueIds.clear();
    if (state.run) {
      state.run.pendingFlags = remainingPending;
      state.run.leaderDelayUsed = false;
    }
  }

  function startRoguelikeBattle() {
    if (!state.run) return;
    state.wave = state.run.combatsWon;
    state.run.battleIndex = state.run.combatsWon;
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
    resetEncounterState();
    state.enemyDamageMultiplier = 1 + eliteDanger;
    if (isElite && state.run.pendingFlags?.eliteDanger) delete state.run.pendingFlags.eliteDanger;
    refreshRotatingIdioms({ force: true });
    state.board = createBoard();
    state.shield = Math.min(Math.round(state.run.maxHp * RUN_LIMITS.maxShieldRatio), state.shield + (state.run.startShield || 0));
    resetEnemyPlan();
    addLog(`<strong>고정</strong> ${getFixedIdioms().map((idiom) => idiom.name).join(" · ")} / <strong>순환</strong> ${getRotatingIdioms().map((idiom) => idiom.name).join(" · ")} · 순환식은 ${state.idiomRecipeInterval}턴 후 교체`, "start");
    if (openingDamage) addLog(`<strong>선제 부적</strong> · 전투 시작 피해 ${openingDamage}`, "alchemy");
    if (eliteDanger) addLog(`<strong>봉인된 우물의 대가</strong> · 이번 정예의 공격 피해 +${Math.round(eliteDanger * 100)}%`, "enemy");
    if (currentRouteTier()?.choices.find((node) => node.id === state.run.currentNodeId)?.type === "boss") {
      void audioDirector.playBgm(state.run.act === 3 ? "final-boss" : "boss");
    }
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
      rng: run.rng,
      targetSize: 125
    });
    return run.characterPool;
  }

  function applyRunEffects(effects = []) {
    const run = state.run;
    if (!run) return;
    effects.forEach((effect) => {
      switch (effect.type) {
        case "heal": state.playerHp = clamp(state.playerHp + (effect.amount || 0), 0, run.maxHp); break;
        case "loseHp": state.playerHp = Math.max(1, state.playerHp - (effect.amount || 0)); break;
        case "shield": state.shield = Math.min(Math.round(run.maxHp * RUN_LIMITS.maxShieldRatio), state.shield + (effect.amount || 0)); break;
        case "maxHp": run.maxHp = Math.max(70, run.maxHp + (effect.amount || 0)); state.playerHp = Math.min(run.maxHp, state.playerHp + Math.max(0, effect.amount || 0)); break;
        case "moveSeconds": run.moveSeconds = clamp(run.moveSeconds + (effect.amount || 0), 3, 6); break;
        case "nextMoveSeconds": run.pendingFlags.nextMoveSeconds = (run.pendingFlags.nextMoveSeconds || 0) + (effect.amount || 0); break;
        case "queueMax": run.queueMax = clamp(run.queueMax + (effect.amount || 0), 10, 18); break;
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
          const target = randomOf(run.idiomBookIds);
          if (target) run.idiomUpgrades[target] = Math.min(2, (run.idiomUpgrades[target] || 0) + 1);
          break;
        }
        case "removeIdiom": {
          if (run.idiomBookIds.length > 3) {
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
          if (selected) gainRunRelic(null, selected.id);
          else gainRunRelic("uncommon");
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
      const disabled = choice.cost && state.run.ink < choice.cost;
      return `<button type="button" data-node-choice="${choice.id}" ${disabled ? "disabled" : ""}><span>${choice.label}</span>${choice.cost ? `<b>먹 ${choice.cost}${disabled ? " · 부족" : ""}</b>` : "<b>선택 →</b>"}</button>`;
    }).join("");
    $("#roguelike-node-modal").classList.add("open");
    saveActiveRun();
  }

  function completeCurrentRunNode() {
    const run = state.run;
    if (!run?.currentNodeId) return;
    run.completedNodeIds.push(run.currentNodeId);
    const tier = currentRouteTier();
    tier?.choices.forEach((node) => { if (node.id === run.currentNodeId) node.completed = true; });
    run.routeIndex++;
    run.currentNodeId = null;
    run.currentEventId = null;
    run.currentEncounterId = null;
    if (run.routeIndex >= run.route.length) finishRoguelikeRun(true);
    else openRoguelikeRoute();
  }

  function chooseRunNodeChoice(id) {
    const tier = currentRouteTier();
    const node = tier?.choices.find((candidate) => candidate.id === state.run?.currentNodeId);
    if (!node) return;
    const choice = nodeChoices(node).find((candidate) => candidate.id === id);
    if (!choice || (choice.cost && state.run.ink < choice.cost)) return;
    applyRunEffects(choice.effects || []);
    state.run.rewardHistory.push(`${node.type}:${choice.id}`);
    $("#roguelike-node-modal").classList.remove("open");
    audioDirector.playSfx("reward");
    completeCurrentRunNode();
  }

  function drawRoguelikeRewards() {
    const enemy = currentEnemy();
    const enemyJaryeong = getJaryeong(enemy?.jaryeongId);
    const run = state.run;
    const jaryeongReward = { type: "jaryeong", ...enemyJaryeong };
    const idiomPool = ALL_IDIOMS.filter((idiom) => !run.idiomBookIds.includes(idiom.id));
    const idiom = randomOf(idiomPool);
    const idiomReward = idiom ? { type: "idiom", ...idiom } : {
      id: `upgrade-${randomOf(run.idiomBookIds)}`,
      type: "idiom-upgrade",
      targetId: randomOf(run.idiomBookIds),
      name: "성어 심화",
      desc: "보유 성어 하나의 위력을 15% 높입니다.",
      chars: ["鍊","成","深","化"]
    };
    const relicPool = RELIC_CATALOG.filter((relic) => !run.relicIds.includes(relic.id));
    let utility = randomOf(relicPool);
    if (state.playerHp / run.maxHp < .35 && randomValue() < .55) utility = { id: "warm-ink-recovery", type: "heal", name: "따뜻한 먹", glyph: "墨", rarity: "회복", desc: "체력 28 회복 · 보호막 8", effects: [{ type: "heal", amount: 28 }, { type: "shield", amount: 8 }] };
    else if (utility) utility = { ...utility, type: "relic" };
    else utility = { id: "quiet-ink-recovery", type: "heal", name: "고요한 먹", glyph: "墨", rarity: "회복", desc: "체력 20 회복 · 먹 4", effects: [{ type: "heal", amount: 20 }, { type: "gainInk", amount: 4 }] };
    const rewards = [jaryeongReward, idiomReward, utility].filter(Boolean);
    const preview = getRunRelicEffect("rewardPreview");
    if (preview) {
      const extraPool = relicPool.filter((relic) => !rewards.some((reward) => reward.id === relic.id));
      const extra = randomOf(extraPool);
      if (extra) rewards.push({ ...extra, type: "relic", preview: true });
      else rewards.push({ id: "scholar-insight", type: "heal", name: "등불의 여백", glyph: "學", rarity: "등불", desc: "체력 16 회복 · 먹 6", effects: [{ type: "heal", amount: 16 }, { type: "gainInk", amount: 6 }], preview: true });
    }
    return rewards;
  }

  function renderRoguelikeRewards() {
    const run = state.run;
    if (!run) return;
    const enemy = currentEnemy();
    $("#roguelike-reward-copy").textContent = `${run.combatsWon}번째 전투 보상 · ${enemy?.name || "야생 자령"} 계약, 성어, 유물·회복 중 하나를 선택하세요.`;
    const rewardCards = $("#roguelike-reward-cards");
    rewardCards.classList.toggle("has-four", run.rewardChoices.length >= 4);
    rewardCards.innerHTML = run.rewardChoices.map((reward) => {
      if (reward.type === "jaryeong") {
        const owned = run.partyJaryeongIds.includes(reward.id);
        const level = run.jaryeongLevels[reward.id] || 0;
        return `<button type="button" class="roguelike-choice reward-choice jaryeong-reward-choice" data-roguelike-reward="${reward.id}">
          <span class="jaryeong-choice-glyph sprite-choice ${reward.element}"><img class="sprite-body" src="${reward.asset?.idle || ""}" alt="${reward.name} · 아직 부적 없는 야생 자령" /></span>
          <span class="roguelike-choice-meta"><em>${ELEMENT_RULES[reward.element].label} · ${owned ? `중복 강화 Lv.${level + 1}` : "부적 계약 후보"}</em><strong>${reward.name}</strong><small>${reward.hanja} · ${reward.reading} · 공격 ${reward.attack}</small></span>
          <span class="roguelike-choice-desc"><b>${reward.skillName}</b><br />${reward.skillDesc}<br /><small>${reward.personality}</small></span>
        </button>`;
      }
      if (reward.type === "idiom" || reward.type === "idiom-upgrade") {
        const effectText = reward.type === "idiom" ? idiomEffectText(reward) : reward.desc;
        const meaningText = reward.type === "idiom" ? idiomMeaningText(reward) : "";
        const roleText = reward.type === "idiom" ? (reward.role || "전투 효과") : "보유 성어 위력 강화";
        const tooltip = reward.type === "idiom"
          ? `${reward.name}\n효과: ${effectText}\n뜻: ${meaningText}`
          : `${reward.name}\n효과: ${effectText}`;
        return `<button type="button" class="roguelike-choice reward-choice idiom-reward-choice" data-roguelike-reward="${escapeHtml(reward.id)}" title="${escapeHtml(tooltip)}" aria-label="${escapeHtml(`${reward.name} 보상. 효과: ${effectText}${meaningText ? `. 뜻: ${meaningText}` : ""}`)}">
          <span class="roguelike-choice-glyphs">${(reward.chars || []).map((char) => `<b>${char}</b>`).join("")}</span>
          <span class="roguelike-choice-meta"><em>${escapeHtml(reward.type === "idiom" ? `${reward.tier || "성어"} · ${reward.category || "연성"}` : "성어 강화")}</em><strong>${escapeHtml(reward.name)}</strong><small>${escapeHtml(roleText)}</small></span>
          <span class="roguelike-choice-desc reward-idiom-copy"><b class="reward-effect-label">효과</b><span class="reward-idiom-effect">${escapeHtml(effectText)}</span>${meaningText ? `<small class="reward-idiom-meaning"><b>뜻</b> ${escapeHtml(meaningText)}</small>` : ""}</span>
        </button>`;
      }
      const typeLabel = reward.preview ? "등불 미리보기" : reward.type === "heal" ? "회복 보상" : "유물 보상";
      return `<button type="button" class="roguelike-choice reward-choice" data-roguelike-reward="${reward.id}">
        <span class="reward-glyph">${reward.glyph || "◇"}</span>
        <span class="roguelike-choice-meta"><em>${typeLabel} · ${reward.rarity || "보상"}</em><strong>${reward.name}</strong><small>${reward.desc}</small></span>
        <span class="roguelike-choice-desc">다음 전투 전에 즉시 적용됩니다.</span>
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
    $("#contract-title").textContent = `${candidate.name} 부적 계약`;
    $("#contract-copy").textContent = "팀이 가득 차 새 자령을 바로 편성할 수 없습니다. 기존 자령과 교체하거나, 중복 강화·부적 조각으로 바꾸세요.";
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
    run.skillCharges[candidate.id] = 0;
    run.rewardHistory.push(`contract-replace:${candidate.id}:${replacedId}`);
    rebuildRunCharacterPool();
    addLog(`<strong>${candidate.name} 부적 계약</strong> · ${getJaryeong(replacedId)?.name || "기존 자령"}과 교체했습니다.`, "victory");
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
    addLog(`<strong>${candidate.name} 계약을 공명으로 전환</strong> · ${getJaryeong(targetId)?.name || "기존 자령"} Lv.${run.jaryeongLevels[targetId]}`, "victory");
    advanceAfterRoguelikeReward();
  }

  function contractAbandon() {
    const run = state.run;
    const candidate = getJaryeong(run?.pendingContractJaryeongId);
    if (!run || !candidate) return;
    const fragmentId = `fragment:${candidate.id}`;
    run.contractFragments = run.contractFragments || [];
    run.contractFragments.push(fragmentId);
    run.rewardHistory.push(fragmentId);
    rebuildRunCharacterPool();
    addLog(`<strong>${candidate.name} 영입을 포기했습니다.</strong> · 부적 조각 1개 획득`, "victory");
    advanceAfterRoguelikeReward();
  }

  function chooseRoguelikeReward(id) {
    if (state.mode !== "roguelike" || !state.run?.pendingReward) return;
    const reward = state.run.rewardChoices.find((candidate) => candidate.id === id);
    if (!reward) return;
    if (reward.type === "jaryeong") {
      const existingIndex = state.run.partyJaryeongIds.indexOf(id);
      if (existingIndex >= 0) {
        state.run.jaryeongLevels[id] = (state.run.jaryeongLevels[id] || 1) + 1;
        addLog(`<strong>${reward.hanja}령 중복 획득</strong> · 이번 런 공격력이 강화되었습니다.`, "victory");
      } else if (state.run.partyJaryeongIds.length < 5) {
        state.run.partyJaryeongIds.push(id);
        state.run.jaryeongLevels[id] = 1;
        state.run.skillCharges[id] = 0;
        rememberMeta("seenJaryeongs", id);
        addLog(`<strong>${reward.name} 부적 계약</strong> · ${reward.hanja} · ${reward.skillName}`, "victory");
      } else {
        state.run.pendingContractJaryeongId = reward.id;
        renderJaryeongContract();
        $("#roguelike-reward-modal").classList.remove("open");
        $("#jaryeong-contract-modal").classList.add("open");
        $("#contract-duplicate-button").focus();
        saveActiveRun();
        return;
      }
      state.run.rewardHistory.push(`jaryeong:${reward.id}`);
    } else if (reward.type === "idiom") {
      if (state.run.idiomBookIds.length < RUN_LIMITS.idiomBookMax) {
        state.run.idiomBookIds.push(reward.id);
        if (state.run.activeIdiomIds.length < RUN_LIMITS.activeIdiomMax) state.run.activeIdiomIds.push(reward.id);
        rememberMeta("seenIdioms", reward.id);
        addLog(`<strong>${reward.name}</strong> 성어 획득 · ${reward.desc}`, "alchemy");
      } else {
        const target = randomOf(state.run.idiomBookIds);
        state.run.idiomUpgrades[target] = Math.min(2, (state.run.idiomUpgrades[target] || 0) + 1);
        addLog("성어첩이 가득 차 무작위 성어를 강화했습니다.", "alchemy");
      }
      state.run.rewardHistory.push(`idiom:${reward.id}`);
    } else if (reward.type === "idiom-upgrade") {
      const target = reward.targetId || randomOf(state.run.idiomBookIds);
      if (target) state.run.idiomUpgrades[target] = Math.min(2, (state.run.idiomUpgrades[target] || 0) + 1);
      state.run.rewardHistory.push(`idiom-upgrade:${target}`);
      addLog(`<strong>${ALL_IDIOMS.find((idiom) => idiom.id === target)?.name || "성어"}</strong> 심화`, "alchemy");
    } else {
      if (reward.type === "relic" && !state.run.relicIds.includes(reward.id)) state.run.relicIds.push(reward.id);
      applyRunEffects(reward.effects || []);
      state.run.rewardHistory.push(reward.id);
      addLog(`<strong>${reward.name}</strong> 획득 · ${reward.desc}`, "victory");
    }
    rebuildRunCharacterPool();
    audioDirector.playSfx("ui-confirm");
    advanceAfterRoguelikeReward();
  }

  function finishRoguelikeRun(won, options = {}) {
    const canRevive = Boolean(options.canRevive && !won && !state.reviveUsed);
    state.gameOver = true;
    state.resolving = false;
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
    $("#roguelike-result-build").textContent = state.run ? `리더 ${getLeaderJaryeong()?.name || "-"} · ${getPartyJaryeongs().map((jaryeong) => jaryeong.name).join(" · ")} · 계약 ${state.run.rewardHistory.filter((entry) => entry.startsWith("jaryeong:") || entry.startsWith("contract-")).length}회 · 성어 ${state.run.idiomBookIds.map((id) => ALL_IDIOMS.find((idiom) => idiom.id === id)?.name).filter(Boolean).join(" · ")}` : "-";
    $("#roguelike-revive-result-button").hidden = !canRevive;
    const resultCard = $("#roguelike-result-modal .roguelike-result-card");
    if (resultCard) resultCard.style.setProperty("--result-scene", `url("${won ? ASSET_MANIFEST.backgrounds.victory : ASSET_MANIFEST.backgrounds.defeat}")`);
    $("#roguelike-result-modal").classList.add("open");
    audioDirector.playSfx(won ? "victory" : "defeat");
    if (won) void audioDirector.playBgm("victory");
    if (won || !canRevive) clearActiveRunSave();
    else saveActiveRun({ allowGameOver: true });
  }

  async function nextWave() {
    const defeated = currentEnemy();
    addLog(`<strong>${defeated.name}</strong>의 기운을 진정시켰습니다.`, "victory");
    if (state.mode === "roguelike") {
      state.run.combatsWon++;
      state.run.battleIndex = state.run.combatsWon;
      await wait(400);
      const tier = currentRouteTier();
      const node = tier?.choices.find((candidate) => candidate.id === state.run.currentNodeId);
      if (node?.type === "boss" && node.act === 3) {
        state.run.completedNodeIds.push(node.id);
        state.run.routeIndex = state.run.route.length;
        state.run.currentEncounterId = null;
        finishRoguelikeRun(true);
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
    state.enemyBurn = 0;
    state.enemyShield = 0;
    state.enemyVulnerableTurns = 0;
    state.enemyVulnerableRatio = 0;
    state.enemySilenced = 0;
    state.healReductionTurns = 0;
    state.healReductionRatio = 0;
    state.reflectNextEnemyAttack = null;
    state.nextEnemyDamageReduction = 0;
    state.lockedTiles = new Map();
    state.nextElementBoosts = {};
    if (state.mode === "puzzle") refreshRotatingIdioms({ force: true, announce: true });
    resetEnemyPlan();
    updateVitals();
    addLog(`<strong>${ENEMIES[state.wave].name}</strong> 등장 · 다음 진정을 준비하세요.`, "start");
  }

  async function handleDefeat() {
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
  }

  const REVIVE_TRACE = { char: "字", reading: "글자 자", width: 720, height: 460 };
  const trace = {
    drawing: false,
    strokes: [],
    currentStroke: null,
    passed: false,
    submitted: false,
    lastProgressAt: 0,
    targetCanvas: null,
    strokeCanvas: null,
    targetPixels: 0
  };

  function chooseReviveTraceCharacter() {
    const choice = randomOf(REVIVE_CHARACTER_POOL) || { char: "福", reading: "복 복" };
    REVIVE_TRACE.char = choice.char;
    REVIVE_TRACE.reading = choice.reading;
    $("#revive-title").textContent = `${choice.char} 자를 따라 다시 빚으세요`;
    $("#revive-canvas").setAttribute("aria-label", `${choice.char}, ${choice.reading} 따라쓰기`);
    $("#trace-stage").setAttribute("aria-label", `반투명한 ${choice.char}, ${choice.reading} 자를 따라 그리기`);
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
    trace.strokes.forEach((stroke) => drawTracePath(context, stroke, 24, "rgba(178,112,30,.78)"));
  }

  function resetTraceCanvas() {
    const canvas = ensureTraceCanvases();
    if (!canvas) return;
    trace.drawing = false;
    trace.strokes = [];
    trace.currentStroke = null;
    trace.passed = false;
    trace.submitted = false;
    trace.lastProgressAt = 0;
    trace.strokeCanvas.getContext("2d").clearRect(0, 0, REVIVE_TRACE.width, REVIVE_TRACE.height);
    canvas.classList.remove("passed");
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
    const mask = trace.strokeCanvas.getContext("2d");
    drawTracePath(mask, [from, to], 34, "rgba(255,255,255,1)");
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
    event.preventDefault();
    const point = tracePoint(event);
    trace.drawing = true;
    trace.currentStroke = [point];
    trace.strokes.push(trace.currentStroke);
    $("#revive-canvas").setPointerCapture?.(event.pointerId);
    drawTraceSegment(point, point);
    updateTraceProgress(true);
  }

  function moveTrace(event) {
    if (!trace.drawing || trace.passed) return;
    event.preventDefault();
    const point = tracePoint(event);
    const previous = trace.currentStroke?.at(-1);
    if (!previous || Math.hypot(point.x - previous.x, point.y - previous.y) < 1) return;
    trace.currentStroke.push(point);
    drawTraceSegment(previous, point);
    updateTraceProgress();
  }

  function endTrace(event) {
    if (!trace.drawing) return;
    event?.preventDefault();
    trace.drawing = false;
    $("#revive-canvas").releasePointerCapture?.(event?.pointerId);
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
      "idiom-detail-modal": closeIdiomDetail,
      "debug-modal": closeDebug,
      "codex-modal": closeCodex
    };
    const close = closers[dialog.id];
    if (!close) return false;
    event.preventDefault();
    close();
    audioDirector.playSfx("ui-cancel");
    return true;
  }

  function initializeDialogAccessibility() {
    const observer = new MutationObserver(syncDialogAccessibility);
    document.querySelectorAll('[role="dialog"]').forEach((dialog) => observer.observe(dialog, { attributes: true, attributeFilter: ["class"] }));
    syncDialogAccessibility();
  }

  function enterPuzzleMode() {
    closeGameOverlays();
    $("#main-menu").classList.remove("open");
    document.body.classList.remove("menu-mode", "pang-mode", "roguelike-mode");
    document.body.classList.add("puzzle-mode");
    state.mode = "puzzle";
    $("#mode-kicker").textContent = "PUZZLE MODE";
    $("#mode-title").textContent = "재앙의 문";
    resetGame();
    $("#intro-modal").classList.add("open");
  }

  function enterPangMode() {
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

  function enterRoguelikeMode() {
    closeGameOverlays();
    $("#main-menu").classList.remove("open");
    document.body.classList.remove("menu-mode", "puzzle-mode", "pang-mode");
    document.body.classList.add("roguelike-mode");
    state.mode = "roguelike";
    state.run = null;
    $("#mode-kicker").textContent = "ROGUELIKE MODE";
    $("#mode-title").textContent = "연성행로";
    renderVolumeOptions();
    syncRunSaveControls();
    updateRoguelikeHud();
    $("#roguelike-intro-modal").classList.add("open");
  }

  function returnToMenu() {
    saveActiveRun({ allowGameOver: state.gameOver && !state.run?.completed });
    clearInterval(state.timerId); clearInterval(state.pangTimerId);
    state.timerId = null; state.pangTimerId = null;
    state.dragging = false; state.dragMoved = false; state.resolving = false; state.pangRunning = false; state.gameOver = true;
    state.selected = null; state.mode = null; state.run = null;
    state.swapAnimationUntil = 0;
    clearDragPreview();
    $("#cursor-timer").classList.remove("active", "danger");
    closeGameOverlays();
    document.body.classList.remove("puzzle-mode", "pang-mode", "roguelike-mode");
    document.body.classList.add("menu-mode");
    $("#main-menu").classList.add("open");
    void audioDirector.playBgm("menu", { immediate: true });
  }

  function resetCurrentMode() {
    if (state.mode === "pang") {
      preparePangMode();
      $("#pang-intro-modal").classList.add("open");
    } else if (state.mode === "puzzle") resetGame();
    else if (state.mode === "roguelike") {
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
      const button = event.target.closest?.("button:not(:disabled)");
      if (button && !button.contains(event.relatedTarget)) audioDirector.playSfx("ui-hover");
    });
    document.addEventListener("keydown", handleDialogKeyboard);
    board.addEventListener("pointerdown", beginDrag);
    board.addEventListener("pointermove", (event) => { if (state.mode === "pang") dragMove(event); });
    board.addEventListener("pointerup", (event) => { if (state.mode === "pang") endDrag(event); });
    board.addEventListener("pointercancel", (event) => { if (state.mode === "pang") endDrag(event); });
    board.addEventListener("keydown", handleBoardKeyboard);
    document.addEventListener("pointermove", (event) => { if (state.mode === "puzzle" || state.mode === "roguelike") dragMove(event); });
    document.addEventListener("pointerup", (event) => { if (state.mode === "puzzle" || state.mode === "roguelike") endDrag(event); });
    document.addEventListener("pointercancel", (event) => { if (state.mode === "puzzle" || state.mode === "roguelike") endDrag(event); });
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
    $("#idiom-detail-close").addEventListener("click", closeIdiomDetail);
    const openIdiomFromCard = (event) => {
      const card = event.target.closest("[data-idiom-detail]");
      if (card) openIdiomDetail(card.dataset.idiomDetail);
    };
    $("#idiom-cards").addEventListener("click", openIdiomFromCard);
    $("#idiom-focus").addEventListener("click", openIdiomFromCard);
    $("#roguelike-rotating-cards").addEventListener("click", openIdiomFromCard);
    const previewIdiomFromCard = (event) => {
      const card = event.target.closest("[data-idiom-detail]");
      if (!card || (event.type === "pointerover" && card.contains(event.relatedTarget))) return;
      const idiom = getCurrentIdioms().find((entry) => entry.id === card.dataset.idiomDetail);
      if (!idiom) return;
      state.focusedIdiomId = idiom.id;
      const preview = getIdiomActivationPreview().get(idiom.id);
      renderIdiomFocus(idiom, card.classList.contains("rotating") ? "rotating" : "fixed", preview);
    };
    $("#idiom-cards").addEventListener("pointerover", previewIdiomFromCard);
    $("#idiom-cards").addEventListener("focusin", previewIdiomFromCard);
    $("#debug-button").addEventListener("click", openDebug);
    $("#debug-close").addEventListener("click", closeDebug);
    $("#debug-defeat-button").addEventListener("click", debugForceDefeat);
    $("#debug-reset-revive").addEventListener("click", debugResetRevive);
    $("#debug-enemy-one").addEventListener("click", debugSetEnemyOne);
    $("#debug-player-heal").addEventListener("click", debugHealPlayer);
    $("#debug-shield").addEventListener("click", debugAddShield);
    $("#debug-clear-queue").addEventListener("click", debugClearQueue);
    $("#debug-force-match").addEventListener("click", debugForceMatch);
    $("#debug-rotate-idioms").addEventListener("click", debugRotateIdioms);
    $("#debug-fill-party").addEventListener("click", debugFillParty);
    $("#debug-grant-relics").addEventListener("click", debugGrantRelics);
    $("#debug-reset-battle").addEventListener("click", debugResetBattle);
    $("#debug-copy-seed").addEventListener("click", debugCopySeed);
    $("#debug-next-node").addEventListener("click", debugNextNode);
    $("#debug-show-reward").addEventListener("click", debugShowReward);
    $("#debug-validate-data").addEventListener("click", debugValidateData);
    document.querySelectorAll("[data-reading-mode]").forEach((button) => button.addEventListener("click", () => setReadingMode(button.dataset.readingMode)));
    $("#result-menu").addEventListener("click", returnToMenu);
    $("#pang-result-menu").addEventListener("click", returnToMenu);
    $("#roguelike-result-menu").addEventListener("click", returnToMenu);
    $("#revive-result-button").addEventListener("click", openReviveFromGameOver);
    $("#roguelike-revive-result-button").addEventListener("click", openReviveFromGameOver);
    $("#start-button").addEventListener("click", () => $("#intro-modal").classList.remove("open"));
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
      if (choice) chooseRunNodeChoice(choice.dataset.nodeChoice);
    });
    $("#route-seed-button").addEventListener("click", debugCopySeed);
    $("#roguelike-reward-reroll").addEventListener("click", rerollRoguelikeRewards);
    $("#codex-button").addEventListener("click", openCodex);
    $("#codex-close").addEventListener("click", closeCodex);
    document.querySelectorAll("[data-codex-tab]").forEach((button) => button.addEventListener("click", () => selectCodexTab(button.dataset.codexTab)));
    $("#codex-search").addEventListener("input", renderCodex);
    $("#codex-volume").addEventListener("change", renderCodex);
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
      if (choice) chooseRoguelikeReward(choice.dataset.roguelikeReward);
    });
    $("#contract-party-options").addEventListener("click", (event) => {
      const choice = event.target.closest("[data-contract-replace-index]");
      if (choice) contractReplace(choice.dataset.contractReplaceIndex);
    });
    $("#contract-duplicate-button").addEventListener("click", contractDuplicate);
    $("#contract-abandon-button").addEventListener("click", contractAbandon);
    $("#jaryeong-party").addEventListener("click", (event) => {
      const skill = event.target.closest("[data-jaryeong-skill]");
      if (skill) {
        event.stopPropagation();
        useJaryeongSkill(skill.dataset.jaryeongSkill);
      }
    });
    $("#revive-canvas").addEventListener("pointerdown", beginTrace);
    $("#revive-canvas").addEventListener("pointermove", moveTrace);
    $("#revive-canvas").addEventListener("pointerup", endTrace);
    $("#revive-canvas").addEventListener("pointercancel", endTrace);
    $("#trace-reset").addEventListener("click", setupTrace);
    $("#trace-submit").addEventListener("click", submitTrace);
    $("#help-button").addEventListener("click", () => {
      if (state.mode === "puzzle") $("#intro-modal").classList.add("open");
      else if (state.mode === "roguelike") $("#roguelike-intro-modal").classList.add("open");
    });
    $("#reset-button").addEventListener("click", resetCurrentMode);
    $("#replay-button").addEventListener("click", () => { $("#result-modal").classList.remove("open"); resetGame(); });
    $("#pang-replay-button").addEventListener("click", () => { preparePangMode(); beginPangRun(); });
    $("#roguelike-replay-button").addEventListener("click", () => { $("#roguelike-result-modal").classList.remove("open"); beginRoguelikeRun(); });
    ["settings-close", "idiom-detail-close", "debug-close", "codex-close", "puzzle-intro-menu", "pang-intro-menu", "roguelike-intro-menu"].forEach((id) => {
      $(`#${id}`)?.addEventListener("click", () => audioDirector.playSfx("ui-cancel"));
    });
    initializeDialogAccessibility();
    window.addEventListener("beforeunload", () => saveActiveRun({ allowGameOver: state.gameOver && !state.run?.completed }));
  }

  window.SajaGame = { state, resetGame, findMatches, resolveTurn, completeRevive, enterPuzzleMode, enterPangMode, enterRoguelikeMode, beginPangRun, beginRoguelikeRun, chooseRoguelikeLeader, chooseRoguelikeIdiom, chooseRoguelikeReward, useJaryeongSkill };
  bindEvents();
  window.setInterval(tickIdleSprites, 720);
  loadReadingMode();
  syncAudioControls();
  syncRunSaveControls();
  renderVolumeOptions();
  renderMenuSpiritParade();
  resetGame();
  returnToMenu();
})();
