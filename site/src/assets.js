import { TALISMAN_ANCHORS } from "./talisman-anchors.js";

const JARYEONG_IDS = [
  "wood-mok", "wood-tree", "wood-life", "wood-bamboo", "wood-orchid", "wood-forest", "fire-hwa", "fire-light", "fire-sun", "fire-lantern", "fire-fox", "fire-phoenix",
  "earth-to", "earth-stone", "earth-mountain", "earth-pottery", "earth-tortoise", "earth-valley", "metal-gold", "metal-sword", "metal-jade", "metal-bell", "metal-mirror", "metal-chain",
  "water-sui", "water-rain", "water-sea", "water-abyss", "water-ice", "water-mist"
];

const JARYEONG_ART_SOURCE = Object.freeze({
  "wood-mok": "wood-mok", "wood-tree": "wood-tree", "wood-life": "wood-life",
  "wood-bamboo": "wood-bamboo",
  "wood-orchid": "wood-orchid",
  "wood-forest": "wood-forest",
  "fire-hwa": "fire-hwa", "fire-light": "fire-light", "fire-sun": "fire-sun",
  "fire-lantern": "fire-lantern",
  "fire-fox": "fire-fox",
  "fire-phoenix": "fire-phoenix",
  "earth-to": "earth-to", "earth-stone": "earth-stone", "earth-mountain": "earth-mountain",
  "earth-pottery": "earth-pottery",
  "earth-tortoise": "earth-tortoise",
  "earth-valley": "earth-valley",
  "metal-gold": "metal-gold", "metal-sword": "metal-sword", "metal-jade": "metal-jade",
  "metal-bell": "metal-bell",
  "metal-mirror": "metal-mirror",
  "metal-chain": "metal-chain",
  "water-sui": "water-sui", "water-rain": "water-rain", "water-sea": "water-sea", "water-abyss": "water-abyss", "water-ice": "water-ice", "water-mist": "water-mist"
});

function jaryeongAsset(id) {
  const source = JARYEONG_ART_SOURCE[id] || id;
  const root = `assets/sprites/wild/jaryeongs/${source}`;
  return {
    idle: `${root}/combat-1.png`,
    idleAlt: `${root}/combat-2.png`,
    attack: `${root}/combat-3.png`,
    hurt: `${root}/combat-4.png`,
    sheet: `${root}/sheet-transparent.png`,
    talisman: `assets/ui/talismans/${id}.png`,
    talismanAnchors: TALISMAN_ANCHORS[id],
    frames: 4,
    columns: 2,
    rows: 2,
    fps: 6,
    anchor: "bottom"
  };
}

export const ASSET_MANIFEST = Object.freeze({
  jaryeongs: Object.fromEntries(JARYEONG_IDS.map((id) => [id, jaryeongAsset(id)])),
  bosses: Object.fromEntries(["forest-boss", "crimson-boss", "moon-boss"].map((id) => {
    const root = `assets/sprites/wild/bosses/${id}`;
    return [id, {
      idle: `${root}/cast-1.png`, idleAlt: `${root}/cast-2.png`, telegraph: `${root}/cast-3.png`,
      windup: `${root}/cast-4.png`, attack: `${root}/cast-5.png`, hurt: `${root}/cast-6.png`,
      sheet: `${root}/sheet-transparent.png`, frames: 6, columns: 3, rows: 2, fps: 7, anchor: "bottom"
    }];
  })),
  backgrounds: {
    menu: "assets/backgrounds/menu-sanctuary.png",
    act1: "assets/backgrounds/act1-mistwood.png",
    act2: "assets/backgrounds/act2-emberstone.png",
    act3: "assets/backgrounds/act3-moonmetal.png",
    victory: "assets/backgrounds/victory-scroll.png",
    defeat: "assets/backgrounds/defeat-broken-seal.png"
  },
  backgroundPools: {
    fallback: "assets/backgrounds/act1-mistwood.png",
    act1: [
      "assets/backgrounds/act1-mistwood.png",
      "assets/backgrounds/act1-mistwood-bridge.png"
    ],
    act1Boss: ["assets/backgrounds/act1-mistwood-boss-grove.png"],
    act2: [
      "assets/backgrounds/act2-emberstone.png",
      "assets/backgrounds/act2-emberstone-quarry.png",
      "assets/backgrounds/act2-emberstone-foundry.png"
    ],
    act2Boss: ["assets/backgrounds/act2-emberstone-boss-altar.png"],
    act3: [
      "assets/backgrounds/act3-moonmetal.png",
      "assets/backgrounds/act3-moonmetal-mirror-lake.png",
      "assets/backgrounds/act3-moonmetal-observatory.png"
    ],
    act3Boss: ["assets/backgrounds/act3-moonmetal-boss-gate.png"]
  },
  ui: {
    talisman: "assets/ui/taming-talisman/clean.png",
    panel: "assets/ui/ink-panel.webp",
    button: "assets/ui/seal-button.webp",
    cursor: "assets/ui/brush-cursor.webp"
  }
});

export function assetExistsHint(path) {
  return path;
}
