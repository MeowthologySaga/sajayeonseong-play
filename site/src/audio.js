export class AudioDirector {
  constructor(manifest, storageKey = "sajayeonseong-audio-v1") {
    this.manifest = manifest;
    this.storageKey = storageKey;
    this.unlocked = false;
    this.currentBgm = null;
    this.currentBgmId = null;
    this.currentBgmTrackKey = null;
    this.currentBgmPoolKey = null;
    this.bgmRotationCursor = new Map();
    this.lastBgmTrackByPool = new Map();
    this.lastPlayed = new Map();
    this.pool = new Map();
    this.missingAssets = new Set();
    this.audioContext = null;
    this.synthBus = null;
    this.fallbackBgm = null;
    this.settings = { bgmEnabled: true, sfxEnabled: true, bgmVolume: .7, sfxVolume: .8 };
    this.loadSettings();
  }

  loadSettings() {
    try { this.settings = { ...this.settings, ...JSON.parse(localStorage.getItem(this.storageKey) || "{}") }; } catch {}
  }

  saveSettings() {
    try { localStorage.setItem(this.storageKey, JSON.stringify(this.settings)); } catch {}
  }

  unlock() {
    if (this.unlocked) return;
    this.unlocked = true;
    const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (AudioContextClass) {
      this.audioContext = new AudioContextClass();
      this.synthBus = this.audioContext.createGain();
      this.synthBus.gain.value = .9;
      this.synthBus.connect(this.audioContext.destination);
      this.audioContext.resume().catch(() => {});
    }
    this.preloadSfx(["ui-confirm", "tile-swap", "tile-match", "enemy-hit"]);
  }

  preloadSfx(ids) {
    ids.forEach((id) => {
      const entry = this.manifest.sfx.find((candidate) => candidate.id === id);
      if (!entry || this.pool.has(id)) return;
      const audio = new Audio(entry.src);
      audio.preload = "auto";
      audio.addEventListener("error", () => this.missingAssets.add(entry.src), { once: true });
      this.pool.set(id, [audio]);
    });
  }

  setSettings(next) {
    const wasBgmEnabled = this.settings.bgmEnabled;
    this.settings = { ...this.settings, ...next };
    if (this.currentBgm) this.currentBgm.volume = this.bgmVolume();
    if (!this.settings.bgmEnabled) {
      if (this.currentBgm) this.currentBgm.pause();
      this.stopFallbackBgm();
    }
    if (!wasBgmEnabled && this.settings.bgmEnabled && this.currentBgm) this.currentBgm.play().catch(() => {});
    this.saveSettings();
  }

  bgmVolume(base = .55) { return this.settings.bgmEnabled ? base * this.settings.bgmVolume : 0; }
  sfxVolume(base = .5) { return this.settings.sfxEnabled ? base * this.settings.sfxVolume : 0; }

  playSfx(id) {
    if (!this.unlocked || !this.settings.sfxEnabled) return;
    const entry = this.manifest.sfx.find((candidate) => candidate.id === id);
    if (!entry) return;
    const now = performance.now();
    if (now - (this.lastPlayed.get(id) || 0) < (entry.cooldownMs || 0)) return;
    this.lastPlayed.set(id, now);
    if (this.missingAssets.has(entry.src)) {
      this.playSynthSfx(id, entry.volume);
      return;
    }
    const nodes = this.pool.get(id) || [];
    let audio = nodes.find((node) => node.paused || node.ended);
    if (!audio) {
      audio = new Audio(entry.src);
      audio.addEventListener("error", () => this.missingAssets.add(entry.src), { once: true });
      if (nodes.length < 5) nodes.push(audio);
    }
    this.pool.set(id, nodes);
    audio.currentTime = 0;
    audio.volume = this.sfxVolume(entry.volume);
    audio.play().catch(() => {
      this.missingAssets.add(entry.src);
      this.playSynthSfx(id, entry.volume);
    });
  }

  playSynthSfx(id, baseVolume = .5) {
    const context = this.audioContext;
    if (!context || !this.synthBus || !this.settings.sfxEnabled) return;
    context.resume().catch(() => {});
    const now = context.currentTime;
    const level = Math.max(.0001, this.sfxVolume(baseVolume) * .22);
    const tone = (frequency, duration, { type = "sine", delay = 0, endFrequency = frequency, gain = 1 } = {}) => {
      const oscillator = context.createOscillator();
      const envelope = context.createGain();
      const start = now + delay;
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(Math.max(30, frequency), start);
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(30, endFrequency), start + duration);
      envelope.gain.setValueAtTime(.0001, start);
      envelope.gain.exponentialRampToValueAtTime(Math.max(.0001, level * gain), start + Math.min(.018, duration * .22));
      envelope.gain.exponentialRampToValueAtTime(.0001, start + duration);
      oscillator.connect(envelope).connect(this.synthBus);
      oscillator.start(start);
      oscillator.stop(start + duration + .02);
    };
    const noise = (duration = .08, gain = .65, delay = 0) => {
      const frames = Math.max(1, Math.floor(context.sampleRate * duration));
      const buffer = context.createBuffer(1, frames, context.sampleRate);
      const data = buffer.getChannelData(0);
      for (let index = 0; index < frames; index++) {
        const phase = ((index * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
        data[index] = (phase * 2 - 1) * (1 - index / frames);
      }
      const source = context.createBufferSource();
      const filter = context.createBiquadFilter();
      const envelope = context.createGain();
      const start = now + delay;
      filter.type = "bandpass";
      filter.frequency.value = id.includes("brush") ? 1900 : 720;
      filter.Q.value = .8;
      envelope.gain.setValueAtTime(level * gain, start);
      envelope.gain.exponentialRampToValueAtTime(.0001, start + duration);
      source.buffer = buffer;
      source.connect(filter).connect(envelope).connect(this.synthBus);
      source.start(start);
    };

    const presets = {
      "ui-hover": () => tone(560, .045, { endFrequency: 650, gain: .45 }),
      "ui-confirm": () => { tone(523, .1, { endFrequency: 659 }); tone(784, .13, { delay: .045, gain: .7 }); },
      "ui-cancel": () => tone(440, .14, { endFrequency: 260, type: "triangle" }),
      "tile-pick": () => tone(390, .065, { endFrequency: 610, type: "triangle", gain: .65 }),
      "tile-swap": () => { tone(330, .07, { endFrequency: 430, gain: .55 }); tone(430, .07, { delay: .045, endFrequency: 330, gain: .5 }); },
      "tile-match": () => { tone(523, .13, { type: "triangle" }); tone(659, .15, { delay: .025, gain: .7 }); },
      "combo-low": () => [523, 659, 784].forEach((value, index) => tone(value, .13, { delay: index * .045, type: "triangle", gain: .8 })),
      "combo-high": () => [659, 784, 988, 1318].forEach((value, index) => tone(value, .18, { delay: index * .04, type: "triangle", gain: .85 })),
      "idiom-ready": () => [392, 523, 659].forEach((value, index) => tone(value, .34, { delay: index * .06, gain: .72 })),
      "idiom-cast": () => { noise(.18, .5); [196, 392, 587, 784].forEach((value, index) => tone(value, .52, { delay: index * .035, type: index ? "sine" : "triangle", gain: .85 })); },
      "hit-wood": () => { noise(.11, .55); tone(196, .18, { endFrequency: 262, type: "triangle" }); },
      "hit-fire": () => { noise(.16, .8); tone(330, .14, { endFrequency: 880, type: "sawtooth", gain: .55 }); },
      "hit-earth": () => { noise(.13, .8); tone(82, .25, { endFrequency: 55, type: "triangle" }); },
      "hit-metal": () => { tone(1245, .3, { endFrequency: 970, type: "square", gain: .55 }); tone(1865, .22, { gain: .35 }); },
      "hit-water": () => { tone(330, .24, { endFrequency: 660, type: "sine", gain: .65 }); tone(880, .2, { delay: .055, endFrequency: 520, gain: .4 }); },
      "shield": () => [220, 330, 440].forEach((value, index) => tone(value, .34, { delay: index * .025, type: "triangle", gain: .7 })),
      "heal": () => [392, 523, 659, 784].forEach((value, index) => tone(value, .24, { delay: index * .055, gain: .62 })),
      "debuff": () => { tone(330, .35, { endFrequency: 110, type: "sawtooth", gain: .45 }); noise(.15, .35); },
      "enemy-hit": () => { noise(.09, .85); tone(110, .15, { endFrequency: 72, type: "square", gain: .55 }); },
      "reward": () => [523, 659, 784, 1047].forEach((value, index) => tone(value, .42, { delay: index * .075, type: "triangle", gain: .65 })),
      "victory": () => [392, 523, 659, 784, 1047].forEach((value, index) => tone(value, .72, { delay: index * .095, type: "triangle", gain: .72 })),
      "defeat": () => [330, 277, 220, 165].forEach((value, index) => tone(value, .58, { delay: index * .11, type: "triangle", gain: .68 })),
      "revive-brush": () => { noise(.42, .7); [262, 392, 523].forEach((value, index) => tone(value, .48, { delay: .16 + index * .07, type: "triangle", gain: .55 })); }
    };
    (presets[id] || presets["ui-confirm"])();
  }

  bgmTrackKey(entry) {
    return entry?.src || entry?.id || "";
  }

  bgmCandidates(zone) {
    const entries = Array.isArray(this.manifest?.bgm) ? this.manifest.bgm : [];
    const matches = entries.filter((entry) => entry?.zone === zone || entry?.id === zone);
    const expanded = [];
    const seen = new Set();

    const add = (entry, parent, variantIndex = null) => {
      const variant = typeof entry === "string" ? { src: entry } : entry;
      if (!variant || typeof variant !== "object") return;
      const baseId = parent?.id || parent?.zone || zone;
      const candidate = {
        ...parent,
        ...variant,
        id: variant.id || (variantIndex === null ? baseId : `${baseId}-variant-${variantIndex + 1}`),
        zone: variant.zone || parent?.zone || zone
      };
      delete candidate.variants;
      if (!candidate.src) return;
      const key = this.bgmTrackKey(candidate);
      if (seen.has(key)) return;
      seen.add(key);
      expanded.push(candidate);
    };

    matches.forEach((entry) => {
      if (entry.src) add(entry, entry);
      if (Array.isArray(entry.variants)) {
        entry.variants.forEach((variant, index) => add(variant, entry, index));
      }
    });
    return expanded;
  }

  stableBgmIndex(value, length) {
    if (length <= 1) return 0;
    let hash = 2166136261;
    for (const character of String(value)) {
      hash ^= character.codePointAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0) % length;
  }

  orderedBgmCandidates(zone, candidates, { rotationKey, seed } = {}) {
    if (candidates.length <= 1) return candidates.slice();
    const poolKey = String(zone);
    const stableKey = rotationKey ?? seed;
    const start = stableKey === undefined
      ? (this.bgmRotationCursor.get(poolKey) || 0) % candidates.length
      : this.stableBgmIndex(`${poolKey}:${stableKey}`, candidates.length);
    const ordered = candidates.map((_, offset) => candidates[(start + offset) % candidates.length]);
    const lastKey = this.lastBgmTrackByPool.get(poolKey);
    if (this.bgmTrackKey(ordered[0]) === lastKey) ordered.push(ordered.shift());
    return ordered;
  }

  rememberBgmSelection(zone, entry, candidates) {
    const poolKey = String(zone);
    const trackKey = this.bgmTrackKey(entry);
    this.lastBgmTrackByPool.set(poolKey, trackKey);
    const index = candidates.findIndex((candidate) => this.bgmTrackKey(candidate) === trackKey);
    this.bgmRotationCursor.set(poolKey, index < 0 ? 0 : (index + 1) % candidates.length);
  }

  async playBgm(zone, { immediate = false, rotationKey, seed, forceRotate = false } = {}) {
    if (!this.unlocked || !this.settings.bgmEnabled) return;
    const candidates = this.bgmCandidates(zone);
    if (!candidates.length) return;
    if (!forceRotate && this.currentBgm && candidates.some((entry) => this.bgmTrackKey(entry) === this.currentBgmTrackKey)) {
      if (this.currentBgm?.paused) await this.currentBgm.play().catch(() => {});
      return;
    }
    if (!forceRotate && !this.currentBgm && this.fallbackBgm && this.currentBgmPoolKey === String(zone) && this.currentBgmId) return;

    const previous = this.currentBgm;
    const ordered = this.orderedBgmCandidates(zone, candidates, { rotationKey, seed });
    let entry = null;
    let next = null;
    for (const candidate of ordered) {
      if (this.missingAssets.has(candidate.src)) continue;
      const audio = new Audio(candidate.src);
      audio.loop = candidate.loop !== false;
      audio.preload = "auto";
      audio.volume = immediate ? this.bgmVolume(candidate.volume) : 0;
      audio.addEventListener?.("error", () => this.missingAssets.add(candidate.src), { once: true });
      try {
        await audio.play();
        entry = candidate;
        next = audio;
        break;
      } catch {
        this.missingAssets.add(candidate.src);
        try { audio.pause(); } catch {}
      }
    }
    if (!entry || !next) {
      previous?.pause();
      this.currentBgm = null;
      this.currentBgmId = ordered[0]?.id || null;
      this.currentBgmTrackKey = null;
      this.currentBgmPoolKey = String(zone);
      this.startFallbackBgm(ordered[0]?.zone || zone);
      return;
    }

    this.stopFallbackBgm();
    this.currentBgm = next;
    this.currentBgmId = entry.id;
    this.currentBgmTrackKey = this.bgmTrackKey(entry);
    this.currentBgmPoolKey = String(zone);
    this.rememberBgmSelection(zone, entry, candidates);
    if (immediate) { previous?.pause(); return; }
    const duration = 3000;
    const startedAt = performance.now();
    const tick = () => {
      const progress = Math.min(1, (performance.now() - startedAt) / duration);
      next.volume = this.bgmVolume(entry.volume) * progress;
      if (previous) previous.volume = Math.max(0, this.bgmVolume(.55) * (1 - progress));
      if (progress < 1) requestAnimationFrame(tick);
      else previous?.pause();
    };
    requestAnimationFrame(tick);
  }

  stopBgm() {
    this.currentBgm?.pause();
    this.stopFallbackBgm();
    this.currentBgm = null;
    this.currentBgmId = null;
    this.currentBgmTrackKey = null;
    this.currentBgmPoolKey = null;
  }

  startFallbackBgm(zone) {
    const context = this.audioContext;
    if (!context || !this.synthBus || !this.settings.bgmEnabled) return;
    this.stopFallbackBgm();
    const roots = { menu: 146.83, "act-1": 130.81, "act-2": 164.81, "act-3": 110, boss: 98, "final-boss": 82.41, victory: 196 };
    const root = roots[zone] || roots.menu;
    const gain = context.createGain();
    const filter = context.createBiquadFilter();
    gain.gain.value = Math.max(.0001, this.bgmVolume(.08));
    filter.type = "lowpass";
    filter.frequency.value = zone.includes("boss") ? 720 : 980;
    gain.connect(filter).connect(this.synthBus);
    const drones = [root, root * 1.5].map((frequency, index) => {
      const oscillator = context.createOscillator();
      oscillator.type = index ? "sine" : "triangle";
      oscillator.frequency.value = frequency;
      oscillator.detune.value = index ? -6 : 4;
      oscillator.connect(gain);
      oscillator.start();
      return oscillator;
    });
    let step = 0;
    const scale = zone === "act-2" || zone.includes("boss") ? [1, 1.2, 1.5, 1.8] : [1, 1.125, 1.5, 1.6875];
    const pulse = () => {
      if (!this.fallbackBgm || this.fallbackBgm.zone !== zone) return;
      const oscillator = context.createOscillator();
      const envelope = context.createGain();
      const start = context.currentTime;
      oscillator.type = "sine";
      oscillator.frequency.value = root * 2 * scale[step % scale.length];
      envelope.gain.setValueAtTime(.0001, start);
      envelope.gain.exponentialRampToValueAtTime(Math.max(.0001, this.bgmVolume(.055)), start + .03);
      envelope.gain.exponentialRampToValueAtTime(.0001, start + .8);
      oscillator.connect(envelope).connect(filter);
      oscillator.start(start);
      oscillator.stop(start + .82);
      step++;
    };
    const timer = globalThis.setInterval(pulse, zone.includes("boss") ? 950 : 1450);
    this.fallbackBgm = { zone, gain, filter, drones, timer };
    pulse();
  }

  stopFallbackBgm() {
    if (!this.fallbackBgm) return;
    globalThis.clearInterval(this.fallbackBgm.timer);
    this.fallbackBgm.drones.forEach((oscillator) => { try { oscillator.stop(); } catch {} });
    try { this.fallbackBgm.gain.disconnect(); } catch {}
    this.fallbackBgm = null;
  }
}
