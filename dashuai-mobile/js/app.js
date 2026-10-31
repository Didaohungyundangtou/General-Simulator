/*
 * app.js — 移动端剧情引擎
 * 轻触推进 / 分支抉择 / 自动存档 / 结局图鉴 / 程序化音景
 */
(function () {
  'use strict';

  const DATA = window.DASHUAI;
  const Sound = window.Soundscape;
  const SAVE_KEY = 'dashuai.save.v1';
  const PROGRESS_KEY = 'dashuai.progress.v1';
  const SPEEDS = { slow: 58, normal: 34, fast: 16, instant: 0 };
  const STATION_LABELS = ['新民', '皇姑屯', '三洞桥', '奉天'];
  const DEFAULT_SETTINGS = {
    textSize: 'normal',
    speed: 'normal',
    sound: true,
    haptics: true,
    auto: false
  };

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const els = {
    app: $('#app'),
    screens: {
      home: $('#screen-home'),
      story: $('#screen-story'),
      ending: $('#screen-ending'),
      codex: $('#screen-codex')
    },
    homePrimary: $('#btn-start'),
    homePrimaryLabel: $('#home-primary-label'),
    homePrimarySub: $('#home-primary-sub'),
    homeRestart: $('#btn-restart'),
    homeEndingCount: $('#home-ending-count'),
    storyAct: $('#story-act'),
    storyTime: $('#story-time'),
    stageActName: $('#stage-act-name'),
    storyPlace: $('#story-place'),
    storyBranch: $('#story-branch'),
    routeWrap: $('#route-wrap'),
    routeStations: $$('#route-stations li'),
    artLayers: $$('.art-layer'),
    stage: $('#stage'),
    lineText: $('#line-text'),
    lineScroll: $('#line-scroll'),
    speakerTab: $('#speaker-tab'),
    speakerName: $('#speaker-name'),
    continueHint: $('#continue-hint'),
    continueLabel: $('#continue-hint span'),
    choices: $('#choices'),
    choicesPrompt: $('#choices-prompt'),
    choiceList: $('#choice-list'),
    storyScreen: $('#screen-story'),
    autoBadge: $('#auto-badge'),
    fxFlash: $('#fx-flash'),
    btnSound: $('#btn-sound'),
    endingScroll: $('#ending-scroll'),
    endingNumber: $('#ending-number'),
    endingLabel: $('#ending-label'),
    endingTitle: $('#ending-title'),
    endingSummary: $('#ending-summary'),
    endingBody: $('#ending-body'),
    endingPage: $('#ending-page'),
    endingNext: $('#ending-next'),
    endingShare: $('#ending-share'),
    endingFinal: $('#ending-final'),
    endingReplay: $('#ending-replay'),
    endingHome: $('#ending-home'),
    codexTitle: $('.codex-title h2'),
    codexCount: $('#codex-count'),
    codexTabs: $('.codex-tabs'),
    codexContent: $('#codex-content'),
    codexScroll: $('#codex-scroll'),
    overlay: $('#overlay'),
    sheet: $('#sheet'),
    sheetContent: $('#sheet-content'),
    opening: $('#opening'),
    toast: $('#toast'),
    srLive: $('#sr-live')
  };

  const progress = Object.assign(
    { seenEndings: [], seenIntro: false, settings: Object.assign({}, DEFAULT_SETTINGS) },
    readJSON(PROGRESS_KEY, {})
  );
  progress.settings = Object.assign({}, DEFAULT_SETTINGS, progress.settings || {});
  if (!Array.isArray(progress.seenEndings)) progress.seenEndings = [];
  progress.seenEndings = progress.seenEndings.filter((k) => Object.prototype.hasOwnProperty.call(DATA.endings, k));
  if (!['small', 'normal', 'large'].includes(progress.settings.textSize)) progress.settings.textSize = 'normal';
  if (!Object.prototype.hasOwnProperty.call(SPEEDS, progress.settings.speed)) progress.settings.speed = 'normal';
  progress.settings.sound = progress.settings.sound !== false;
  progress.settings.haptics = progress.settings.haptics !== false;
  progress.settings.auto = progress.settings.auto === true;

  const settings = progress.settings;

  const state = {
    screen: 'home',
    nodeId: null,
    node: null,
    lineIndex: 0,
    lines: [],
    typing: false,
    lineDone: false,
    typeTimer: null,
    typeToken: 0,
    fullText: '',
    speaker: '',
    choicesVisible: false,
    transitioning: false,
    history: [],
    currentScene: null,
    autoTimer: null,
    sheetOpen: false,
    sheetHideTimer: null,
    lastFocused: null,
    lastAct: null,
    codexTab: 'endings',
    codexFrom: 'home',
    codexScrollTop: 0,
    ending: null,
    endingKey: null,
    endingPage: 0,
    endingFrom: 'story',
    pageTurning: false,
    openingTimer: null,
    confirmCallback: null
  };

  const REDUCED_MOTION = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── 存储 ─────────────────────────────────────────────── */
  function readJSON(key, fallback) {
    try {
      const raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function writeJSON(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      /* 无痕模式 / file:// 下静默失败 */
    }
  }

  function saveProgress() {
    writeJSON(PROGRESS_KEY, {
      seenEndings: progress.seenEndings,
      seenIntro: progress.seenIntro,
      settings
    });
  }

  function getSave() {
    const save = readJSON(SAVE_KEY, null);
    if (!save || !save.nodeId || !DATA.nodes[save.nodeId]) return null;
    const node = DATA.nodes[save.nodeId];
    if (node.ending) return null;
    return save;
  }

  function persistStory() {
    if (!state.node || !state.nodeId) return;
    if (state.node.ending) return;
    writeJSON(SAVE_KEY, {
      nodeId: state.nodeId,
      lineIndex: state.lineIndex,
      history: state.history.slice(-50),
      updatedAt: Date.now()
    });
  }

  function removeSave() {
    try { window.localStorage.removeItem(SAVE_KEY); } catch (e) { /* noop */ }
  }

  /* ── 工具 ─────────────────────────────────────────────── */
  function escapeHTML(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatLine(text) {
    const safe = escapeHTML(text);
    return safe.replace(/（[^）]*）/g, (m) => `<span class="paren">${m}</span>`);
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function vibrate(pattern) {
    if (!settings.haptics) return;
    if (navigator.vibrate) {
      try { navigator.vibrate(pattern); } catch (e) { /* noop */ }
    }
  }

  let toastTimer = null;
  function showToast(message, duration = 2200) {
    window.clearTimeout(toastTimer);
    els.toast.textContent = message;
    els.toast.classList.add('is-visible');
    toastTimer = window.setTimeout(() => els.toast.classList.remove('is-visible'), duration);
  }

  function announce(message) {
    if (!els.srLive) return;
    els.srLive.textContent = '';
    window.setTimeout(() => { els.srLive.textContent = message; }, 30);
  }

  /* ── 屏幕切换 ─────────────────────────────────────────── */
  function setScreen(name, { instant = false } = {}) {
    state.screen = name;
    Object.entries(els.screens).forEach(([key, el]) => {
      const active = key === name;
      el.classList.toggle('is-active', active);
      el.setAttribute('aria-hidden', active ? 'false' : 'true');
      if ('inert' in el) el.inert = !active;
      if (active) {
        el.classList.remove('is-entering');
        if (!instant) {
          void el.offsetWidth;
          el.classList.add('is-entering');
        }
        if (key === 'home' || key === 'codex') el.scrollTop = 0;
      }
    });
    if (name === 'home') {
      updateHome();
      Sound.setScene(null);
    }
    if (name === 'ending' || name === 'codex') {
      Sound.setScene(null);
    }
  }

  /* ── 主菜单 ───────────────────────────────────────────── */
  function updateHome() {
    const save = getSave();
    if (save) {
      const node = DATA.nodes[save.nodeId];
      els.homePrimaryLabel.textContent = '继续旅程';
      els.homePrimarySub.textContent = `${node.time} · ${node.place}`;
      els.homePrimary.dataset.action = 'continue';
      els.homeRestart.hidden = false;
    } else {
      els.homePrimaryLabel.textContent = '启程';
      els.homePrimarySub.textContent = '06.04 · 04:55 · 京奉线';
      els.homePrimary.dataset.action = 'start';
      els.homeRestart.hidden = true;
    }
    els.homeEndingCount.textContent = `${progress.seenEndings.length}/4`;
    updateSoundButton();
  }

  function updateSoundButton() {
    document.body.classList.toggle('is-muted', !settings.sound);
    if (els.btnSound) {
      els.btnSound.setAttribute('aria-label', settings.sound ? '关闭声音' : '开启声音');
      els.btnSound.setAttribute('title', settings.sound ? '关闭声音' : '开启声音');
    }
  }

  function applySettings() {
    els.app.dataset.textsize = settings.textSize;
    updateSoundButton();
    if (settings.sound) {
      Sound.init();
      Sound.setEnabled(true);
      if (state.screen === 'story' && state.currentScene) Sound.setScene(state.currentScene);
      else Sound.setScene(null);
    } else {
      Sound.setEnabled(false);
    }
    if (state.screen === 'story') scheduleAutoIfNeeded();
  }

  /* ── 开场字幕 ─────────────────────────────────────────── */
  function showOpening() {
    if (!els.opening) return;
    window.clearTimeout(state.openingTimer);
    els.opening.hidden = false;
    els.opening.classList.remove('is-leaving');
    state.openingTimer = window.setTimeout(hideOpening, 2600);
  }

  function hideOpening() {
    if (!els.opening || els.opening.hidden) return;
    window.clearTimeout(state.openingTimer);
    els.opening.classList.add('is-leaving');
    window.setTimeout(() => {
      els.opening.hidden = true;
      els.opening.classList.remove('is-leaving');
    }, 700);
    scheduleAutoIfNeeded();
  }

  /* ── 场景 / 路线 ──────────────────────────────────────── */
  function defaultBranch(node) {
    if (node.branch) return node.branch;
    switch (node.scene) {
      case 'station': return '皇姑屯站 · 05:05';
      case 'road': return '绕行公路 · 大帅府';
      case 'bridge': return '京奉线 · 三洞桥';
      case 'blast': return '三洞桥 · 爆炸';
      default: return '京奉线 · 东行';
    }
  }

  function setArt(scene) {
    if (state.currentScene === scene) return;
    state.currentScene = scene;
    els.artLayers.forEach((layer) => {
      layer.classList.toggle('is-active', layer.dataset.scene === scene);
    });
  }

  function updateStoryMeta(node) {
    els.storyAct.textContent = node.act || '第一幕';
    els.storyTime.textContent = node.time || '--:--';
    els.stageActName.textContent = node.actName || '';
    els.storyPlace.textContent = node.place || '';
    els.storyBranch.textContent = defaultBranch(node);
    updateRoute(typeof node.route === 'number' ? node.route : 0);
    setArt(node.scene || 'train');
    Sound.setScene(node.scene || null);
    els.storyScreen.classList.toggle('is-choosing', false);
    els.autoBadge.hidden = true;
    if (state.lastAct && state.lastAct !== node.act) {
      els.storyAct.textContent = node.act;
    }
    state.lastAct = node.act;
  }

  function updateRoute(index) {
    const route = clamp(index, 0, 3);
    const pct = (route / 3) * 100;
    els.routeWrap.style.setProperty('--route-fill', `${pct}%`);
    els.routeStations.forEach((li, i) => {
      li.classList.toggle('is-passed', i < route);
      li.classList.toggle('is-current', i === route);
      if (i === route) li.setAttribute('aria-current', 'step');
      else li.removeAttribute('aria-current');
    });
  }

  function setArtForCurrentLine(node, index) {
    let art = node.scene;
    if (node.cue) {
      Object.keys(node.cue)
        .map(Number)
        .sort((a, b) => a - b)
        .forEach((cueIndex) => {
          if (cueIndex <= index && node.cue[cueIndex].scene) art = node.cue[cueIndex].scene;
        });
    }
    if (art) setArt(art);
  }

  function applyCue(index, { silent = false } = {}) {
    if (!state.node || !state.node.cue) return;
    const cue = state.node.cue[index];
    if (!cue) return;
    if (cue.scene) {
      setArt(cue.scene);
      Sound.setScene(cue.scene);
    }
    if (silent) return;
    if (cue.sound === 'explosion') Sound.explosion();
    else if (cue.sound === 'gunshot') Sound.gunshot();
    if (cue.fx === 'shake') shakeStage();
    if (cue.fx === 'flash') flashScreen();
  }

  function shakeStage() {
    if (REDUCED_MOTION) return;
    els.stage.classList.remove('is-shaking');
    void els.stage.offsetWidth;
    els.stage.classList.add('is-shaking');
    window.setTimeout(() => els.stage.classList.remove('is-shaking'), 780);
    vibrate([30, 35, 60]);
  }

  function flashScreen() {
    if (REDUCED_MOTION) return;
    els.fxFlash.classList.remove('is-active');
    void els.fxFlash.offsetWidth;
    els.fxFlash.classList.add('is-active');
    window.setTimeout(() => els.fxFlash.classList.remove('is-active'), 950);
    vibrate([18, 30, 45]);
  }

  /* ── 剧情节点 ─────────────────────────────────────────── */
  function loadNode(id, { lineIndex = 0, instant = false, record = true } = {}) {
    const node = DATA.nodes[id];
    if (!node) {
      showToast('剧情节点丢失');
      return;
    }
    window.clearTimeout(state.autoTimer);
    window.clearTimeout(state.typeTimer);
    state.typing = false;
    state.lineDone = false;
    state.choicesVisible = false;
    state.transitioning = false;
    state.nodeId = id;
    state.node = node;
    state.lines = node.lines || [];
    state.lineIndex = clamp(lineIndex, 0, Math.max(0, state.lines.length - 1));
    if (state.screen !== 'story') setScreen('story');
    els.choices.hidden = true;
    els.storyScreen.classList.remove('is-choosing');
    updateStoryMeta(node);
    setArtForCurrentLine(node, state.lineIndex);
    renderCurrentLine({ instant, record });
  }

  function startNew() {
    closeSheet(true);
    window.clearTimeout(state.autoTimer);
    window.clearTimeout(state.typeTimer);
    state.typing = false;
    state.lineDone = false;
    state.choicesVisible = false;
    state.history = [];
    state.lastAct = null;
    state.currentScene = null;
    state.nodeId = null;
    state.node = null;
    state.lineIndex = 0;
    removeSave();
    Sound.init();
    Sound.setEnabled(settings.sound);
    setScreen('story');
    const firstTime = !progress.seenIntro;
    loadNode(DATA.start, { instant: firstTime });
    if (firstTime) {
      progress.seenIntro = true;
      saveProgress();
      showOpening();
    }
    updateHome();
  }

  function continueGame() {
    const save = getSave();
    if (!save) {
      startNew();
      return;
    }
    closeSheet(true);
    window.clearTimeout(state.autoTimer);
    window.clearTimeout(state.typeTimer);
    state.history = Array.isArray(save.history) ? save.history.slice(-50) : [];
    state.lastAct = null;
    state.currentScene = null;
    Sound.init();
    Sound.setEnabled(settings.sound);
    setScreen('story');
    loadNode(save.nodeId, {
      lineIndex: Number(save.lineIndex) || 0,
      instant: true,
      record: false
    });
  }

  function rememberLine(line) {
    const item = {
      speaker: line.s || '',
      text: line.t,
      type: !line.s && /^【/.test(line.t) ? 'stage' : 'line'
    };
    const last = state.history[state.history.length - 1];
    if (last && last.text === item.text && last.speaker === item.speaker) return;
    state.history.push(item);
    if (state.history.length > 60) state.history.shift();
  }

  function rememberChoice(choice) {
    state.history.push({
      speaker: '抉择',
      text: `${choice.key} · ${choice.short}`,
      type: 'choice'
    });
    if (state.history.length > 60) state.history.shift();
  }

  function renderCurrentLine({ instant = false, record = true } = {}) {
    if (!state.node) return;
    const line = state.lines[state.lineIndex];
    if (!line) {
      finishNode();
      return;
    }

    state.typing = false;
    state.lineDone = false;
    state.choicesVisible = false;
    window.clearTimeout(state.typeTimer);
    state.typeToken += 1;
    const token = state.typeToken;
    state.fullText = line.t;
    state.speaker = line.s || '';

    const isStage = !line.s && /^【/.test(line.t);
    els.lineText.classList.remove('is-typing');
    els.lineText.classList.toggle('is-stage', isStage);
    els.lineText.innerHTML = '';
    els.lineScroll.scrollTop = 0;
    els.speakerTab.hidden = !line.s;
    els.speakerName.textContent = line.s || '';
    els.choices.hidden = true;
    els.storyScreen.classList.remove('is-choosing');
    els.continueHint.hidden = false;
    updateHint('typing');

    setArtForCurrentLine(state.node, state.lineIndex);
    applyCue(state.lineIndex, { silent: true });
    if (record) rememberLine(line);

    if (instant || settings.speed === 'instant' || REDUCED_MOTION) {
      finishLine(token, true);
    } else {
      startTypewriter(line.t, token);
    }
    persistStory();
  }

  function startTypewriter(text, token) {
    const chars = Array.from(text);
    state.typing = true;
    state.lineDone = false;
    els.lineText.classList.add('is-typing');
    let index = 0;
    const base = SPEEDS[settings.speed] || SPEEDS.normal;

    const tick = () => {
      if (token !== state.typeToken || !state.typing) return;
      index += 1;
      els.lineText.textContent = chars.slice(0, index).join('');
      if (els.lineScroll.scrollHeight > els.lineScroll.clientHeight + 4) {
        els.lineScroll.scrollTop = els.lineScroll.scrollHeight;
      }
      if (index >= chars.length) {
        finishLine(token, false);
        return;
      }
      const ch = chars[index - 1];
      let delay = base;
      if ('，、；：'.includes(ch)) delay += 100;
      else if ('。！？'.includes(ch)) delay += 220;
      else if (ch === '—') delay += 55;
      state.typeTimer = window.setTimeout(tick, delay);
    };

    state.typeTimer = window.setTimeout(tick, base);
  }

  function finishLine(token, skipSound = false) {
    if (token !== state.typeToken) return;
    window.clearTimeout(state.typeTimer);
    state.typing = false;
    state.lineDone = true;
    els.lineText.classList.remove('is-typing');
    els.lineText.innerHTML = formatLine(state.fullText);
    if (els.lineScroll.scrollHeight > els.lineScroll.clientHeight + 4) {
      els.lineScroll.scrollTop = els.lineScroll.scrollHeight;
    }
    const isLast = state.lineIndex >= state.lines.length - 1;
    updateHint(isLast ? 'last' : 'done');
    announce(state.speaker ? `${state.speaker}：${state.fullText}` : state.fullText);

    if (isLast && state.node && state.node.choices) {
      window.setTimeout(() => {
        if (token !== state.typeToken) return;
        if (state.lineIndex === state.lines.length - 1) showChoices();
      }, 260);
    } else {
      scheduleAutoIfNeeded();
    }
    if (!skipSound && state.node && state.node.cue && state.node.cue[state.lineIndex]) {
      applyCue(state.lineIndex, { silent: false });
    }
  }

  function updateHint(mode) {
    if (state.choicesVisible) {
      els.continueHint.hidden = true;
      return;
    }
    els.continueHint.hidden = false;
    let label = '轻触继续';
    if (mode === 'typing') label = '轻触显示全文';
    else if (state.node && state.lineIndex >= state.lines.length - 1 && state.node.ending) label = '轻触收束';
    else if (settings.auto) label = '自动播放中';
    els.continueLabel.textContent = label;
  }

  function showChoices() {
    if (!state.node || !state.node.choices || state.choicesVisible) return;
    window.clearTimeout(state.autoTimer);
    state.choicesVisible = true;
    els.continueHint.hidden = true;
    els.choicesPrompt.textContent = state.node.choicePrompt || '你要如何回应？';
    els.choiceList.innerHTML = state.node.choices.map((choice, index) => `
      <button class="choice-card" data-choice-index="${index}" type="button">
        <span class="choice-key">${escapeHTML(choice.key)}</span>
        <span class="choice-text">${escapeHTML(choice.text)}</span>
      </button>
    `).join('');
    els.choices.hidden = false;
    els.storyScreen.classList.add('is-choosing');
    els.lineScroll.scrollTop = els.lineScroll.scrollHeight;
    els.autoBadge.hidden = true;
    announce('请做出你的抉择');
  }

  function selectChoice(index) {
    if (!state.choicesVisible || state.transitioning || !state.node) return;
    const choice = state.node.choices[index];
    if (!choice) return;
    state.transitioning = true;
    Sound.choice();
    vibrate([8, 28, 10]);
    const buttons = $$('.choice-card', els.choiceList);
    buttons.forEach((btn, i) => btn.classList.toggle('is-selected', i === index));
    rememberChoice(choice);
    persistStory();
    window.setTimeout(() => {
      state.transitioning = false;
      state.choicesVisible = false;
      els.choices.hidden = true;
      els.storyScreen.classList.remove('is-choosing');
      loadNode(choice.next);
    }, 320);
  }

  function finishNode() {
    if (!state.node) return;
    if (state.node.ending) {
      openEnding(state.node.ending, { from: 'story' });
    } else if (state.node.next) {
      loadNode(state.node.next);
    }
  }

  function advance({ fromAuto = false } = {}) {
    if (state.transitioning) return;
    if (state.sheetOpen) return;
    if (state.choicesVisible) return;
    if (!state.node) return;
    window.clearTimeout(state.autoTimer);

    if (state.typing) {
      finishLine(state.typeToken, false);
      return;
    }
    if (!state.lineDone) return;

    const isLast = state.lineIndex >= state.lines.length - 1;
    if (!isLast) {
      state.lineIndex += 1;
      renderCurrentLine();
      return;
    }
    if (state.node.choices) {
      showChoices();
      return;
    }
    if (state.node.ending) {
      openEnding(state.node.ending, { from: 'story' });
      return;
    }
    if (state.node.next) {
      loadNode(state.node.next);
    }
  }

  /* ── 自动播放 ─────────────────────────────────────────── */
  function scheduleAutoIfNeeded() {
    window.clearTimeout(state.autoTimer);
    if (!settings.auto || state.screen !== 'story') return;
    if (state.sheetOpen || state.choicesVisible) return;
    if (els.opening && !els.opening.hidden) return;
    if (!state.lineDone) return;
    state.autoTimer = window.setTimeout(() => {
      if (!settings.auto || state.screen !== 'story') return;
      if (state.sheetOpen || state.choicesVisible) return;
      if (els.opening && !els.opening.hidden) return;
      advance({ fromAuto: true });
    }, 2600);
  }

  function updateAutoUI() {
    els.autoBadge.hidden = true;
    updateHint(state.typing ? 'typing' : 'done');
    if (settings.auto) scheduleAutoIfNeeded();
    else window.clearTimeout(state.autoTimer);
  }

  /* ── 结局 ─────────────────────────────────────────────── */
  function openEnding(key, { from = 'story' } = {}) {
    const ending = DATA.endings[key];
    if (!ending) return;
    closeSheet(true);
    window.clearTimeout(state.autoTimer);
    state.ending = ending;
    state.endingKey = key;
    state.endingPage = 0;
    state.endingFrom = from;
    state.pageTurning = false;
    const isNew = !progress.seenEndings.includes(key);
    if (isNew) {
      progress.seenEndings.push(key);
      saveProgress();
      updateHome();
    }
    if (from === 'story') removeSave();
    setScreen('ending');
    renderEndingPage();
    updateHint('done');
    if (settings.sound) {
      if (from === 'story' && (key === 'e3' || key === 'e4')) {
        window.setTimeout(() => Sound.explosion(), 180);
      } else if (isNew) {
        window.setTimeout(() => Sound.chime(), 480);
      }
    }
    if (isNew) {
      window.setTimeout(() => {
        if (state.screen === 'ending') showToast(`结局已收录 · ${progress.seenEndings.length}/4`);
      }, from === 'story' ? 1350 : 600);
      vibrate([15, 40, 15, 40, 55]);
    }
  }

  function renderEndingPage() {
    const ending = state.ending;
    if (!ending) return;
    const pages = ending.pages;
    const page = pages[state.endingPage];
    if (!page) return;
    els.endingNumber.textContent = `${ending.numeral} / 肆`;
    els.endingLabel.textContent = ending.label;
    els.endingTitle.textContent = ending.title;
    els.endingSummary.textContent = ending.summary || '';
    els.endingBody.classList.remove('is-turning');
    els.endingBody.innerHTML = page.body.map((paragraph) => {
      const isStage = /^【/.test(paragraph);
      const isSpeech = /^[^：]{1,8}：/.test(paragraph);
      const cls = isStage ? 'is-stage' : (isSpeech ? 'is-speech' : '');
      return `<p${cls ? ` class="${cls}"` : ''}>${escapeHTML(paragraph)}</p>`;
    }).join('');
    els.endingPage.textContent = `${String(state.endingPage + 1).padStart(2, '0')} / ${String(pages.length).padStart(2, '0')}`;
    const last = state.endingPage >= pages.length - 1;
    els.endingNext.hidden = last;
    els.endingFinal.hidden = !last;
    els.endingShare.hidden = false;
    els.endingScroll.scrollTop = 0;
  }

  function turnEndingPage() {
    if (!state.ending || state.pageTurning) return;
    if (state.endingPage >= state.ending.pages.length - 1) return;
    state.pageTurning = true;
    Sound.page();
    els.endingBody.classList.add('is-turning');
    window.setTimeout(() => {
      state.endingPage += 1;
      state.pageTurning = false;
      renderEndingPage();
    }, 160);
  }

  function exitEnding() {
    if (state.endingFrom === 'codex') {
      openCodex('endings');
      return;
    }
    setScreen('home');
    updateHome();
  }

  async function shareEnding() {
    if (!state.ending) return;
    const text = `我在《大帅：张作霖模拟器》中抵达了「${state.ending.title}」（${state.ending.label}）。${state.ending.summary || ''}`;
    const shareData = {
      title: '大帅：张作霖模拟器',
      text,
      url: window.location.href
    };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
        return;
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(`${text}\n${window.location.href}`);
        showToast('结局文案已复制');
        return;
      }
      throw new Error('no share');
    } catch (e) {
      if (e && e.name === 'AbortError') return;
      fallbackCopy(`${text}\n${window.location.href}`);
    }
  }

  function fallbackCopy(text) {
    try {
      const area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      document.execCommand('copy');
      document.body.removeChild(area);
      showToast('结局文案已复制');
    } catch (e) {
      showToast('分享失败，请截图保存');
    }
  }

  function replayEnding() {
    if (getSave()) {
      confirmSheet('再走一趟？', '你还有一段未完成的旅程。开始新游戏会覆盖当前进度，但结局图鉴会保留。', () => {
        closeSheet(true);
        startNew();
      });
    } else {
      startNew();
    }
  }

  /* ── 档案室 ───────────────────────────────────────────── */
  function openCodex(tab = 'endings', { from } = {}) {
    closeSheet(true);
    if (from) state.codexFrom = from;
    else if (state.screen === 'story') state.codexFrom = 'story';
    else if (state.screen === 'home') state.codexFrom = 'home';
    state.codexTab = tab;
    state.codexScrollTop = 0;
    setScreen('codex');
    renderCodex();
    updateCodexTabs();
  }

  function updateCodexTabs() {
    $$('button', els.codexTabs).forEach((btn) => {
      const selected = btn.dataset.tab === state.codexTab;
      btn.setAttribute('aria-selected', selected ? 'true' : 'false');
      btn.tabIndex = selected ? 0 : -1;
    });
    els.codexCount.textContent = `${progress.seenEndings.length}/4`;
  }

  function renderCodex() {
    const tab = state.codexTab;
    updateCodexTabs();
    if (tab === 'people') renderCodexPeople();
    else if (tab === 'background') renderCodexBackground();
    else renderCodexEndings();
    els.codexScroll.scrollTop = 0;
    els.codexContent.classList.remove('codex-anim');
    void els.codexContent.offsetWidth;
    els.codexContent.classList.add('codex-anim');
  }

  function renderCodexPeople() {
    const cards = DATA.characters.map((person) => `
      <article class="person-card">
        <div class="person-avatar" aria-hidden="true">
          <b>${escapeHTML(person.surname)}</b>
          <i>奉系档案</i>
        </div>
        <div class="person-main">
          <div class="person-name-row">
            <h4 class="person-name">${escapeHTML(person.name)}</h4>
            <span class="person-role">${escapeHTML(person.role)}</span>
          </div>
          <div class="person-bio">${person.bio.map((p) => `<p>${escapeHTML(p)}</p>`).join('')}</div>
          <blockquote class="person-quote">${escapeHTML(person.quote)}</blockquote>
        </div>
      </article>
    `).join('');
    els.codexContent.innerHTML = `
      <div class="codex-section-head">
        <h3>车上的人</h3>
        <span>DRAMATIS PERSONAE</span>
      </div>
      <p class="codex-intro">一九二八年六月四日，凌晨四时五十五分。京奉铁路上，这一节蓝钢车厢里坐着的人，将一同驶入历史。</p>
      <div class="person-list">${cards}</div>
    `;
  }

  function renderCodexBackground() {
    const paragraphs = DATA.background.paragraphs
      .map((p) => `<p>${escapeHTML(p)}</p>`).join('');
    const timeline = DATA.background.timeline.map((item) => `
      <div class="timeline-item">
        <span class="timeline-date">${escapeHTML(item.date)}</span>
        <span class="timeline-text">${escapeHTML(item.text)}</span>
      </div>
    `).join('');
    els.codexContent.innerHTML = `
      <div class="background-hero">
        <span class="background-kicker">${escapeHTML(DATA.background.kicker)}</span>
        <h3>${escapeHTML(DATA.background.title)}</h3>
      </div>
      <div class="codex-copy">${paragraphs}</div>
      <div class="codex-section-head">
        <h3>时间线</h3>
        <span>JUNE 1928</span>
      </div>
      <div class="codex-timeline">${timeline}</div>
      <div class="codex-note">${escapeHTML(DATA.background.note)}</div>
      <div class="codex-end-mark">END OF FILE</div>
    `;
  }

  function renderCodexEndings() {
    const seen = progress.seenEndings;
    const keys = Object.keys(DATA.endings).sort((a, b) => DATA.endings[a].order - DATA.endings[b].order);
    const tiles = keys.map((key) => {
      const ending = DATA.endings[key];
      const unlocked = seen.includes(key);
      const base = `
        <div class="ending-tile__num">${ending.numeral}</div>
        <div class="ending-tile__status">${unlocked ? '已抵达 · COLLECTED' : '未抵达 · UNKNOWN'}</div>
        <div class="ending-tile__title">${unlocked ? escapeHTML(ending.title) : '未解锁结局'}</div>
        <div class="ending-tile__label">${unlocked ? escapeHTML(ending.label) : '另有一条路'}</div>
        <div class="ending-tile__summary">${unlocked ? escapeHTML(ending.summary) : '尚未走到这条路的尽头。'}</div>
      `;
      if (!unlocked) {
        return `<div class="ending-tile is-locked" aria-label="未解锁结局">
          ${base}
          <svg class="ending-tile__lock icon" viewBox="0 0 24 24" aria-hidden="true"><use href="#icon-lock"/></svg>
        </div>`;
      }
      return `<button class="ending-tile is-unlocked" data-ending-open="${key}" type="button" aria-label="重读结局：${escapeHTML(ending.title)}">
        ${base}
        <span class="ending-tile__arrow" aria-hidden="true"></span>
      </button>`;
    }).join('');

    const seals = keys.map((key) => {
      const ending = DATA.endings[key];
      return `<i class="${seen.includes(key) ? 'is-unlocked' : ''}">${ending.numeral}</i>`;
    }).join('');

    const complete = seen.length === keys.length ? `
      <div class="collection-complete">
        <b>四局已收</b>
        四条路，都走到了尽头。历史只有一个答案。
      </div>
    ` : '';

    els.codexContent.innerHTML = `
      <div class="codex-section-head">
        <h3>结局图鉴</h3>
        <span>FOUR FATES</span>
      </div>
      <div class="ending-collection">
        <span class="collection-label">已收录 <b>${seen.length} / ${keys.length}</b></span>
        <div class="collection-seals" aria-hidden="true">${seals}</div>
      </div>
      <div class="ending-grid">${tiles}</div>
      ${complete}
      <div class="codex-end-mark">MUKDEN · 1928</div>
    `;
  }

  function closeCodex() {
    if (state.codexFrom === 'story' && state.node) {
      setScreen('story');
      if (settings.sound) Sound.setScene(state.currentScene);
      scheduleAutoIfNeeded();
    } else {
      setScreen('home');
      updateHome();
    }
  }

  /* ── 抽屉 / 设置 / 回顾 ───────────────────────────────── */
  function openSheet(html, { label = '菜单' } = {}) {
    window.clearTimeout(state.sheetHideTimer);
    const wasOpen = state.sheetOpen;
    if (!wasOpen) state.lastFocused = document.activeElement;
    els.sheetContent.innerHTML = html;
    els.sheet.setAttribute('aria-label', label);
    els.overlay.hidden = false;
    state.sheetOpen = true;
    window.requestAnimationFrame(() => els.overlay.classList.add('is-open'));
    if (!wasOpen) {
      window.setTimeout(() => {
        const focusable = els.sheetContent.querySelector('button, [href], input, select, textarea');
        if (focusable) focusable.focus({ preventScroll: true });
      }, 80);
    }
  }

  function closeSheet(instant = false) {
    if (!state.sheetOpen && els.overlay.hidden) return;
    state.sheetOpen = false;
    state.confirmCallback = null;
    els.overlay.classList.remove('is-open');
    window.clearTimeout(state.sheetHideTimer);
    const finish = () => {
      els.overlay.hidden = true;
      if (state.lastFocused && typeof state.lastFocused.focus === 'function') {
        try { state.lastFocused.focus({ preventScroll: true }); } catch (e) { /* noop */ }
      }
      scheduleAutoIfNeeded();
    };
    if (instant) finish();
    else state.sheetHideTimer = window.setTimeout(finish, 340);
  }

  function sheetHead(kicker, title) {
    return `
      <div class="sheet-head">
        <div>
          <span class="sheet-head__kicker">${escapeHTML(kicker)}</span>
          <h3>${escapeHTML(title)}</h3>
        </div>
        <button class="sheet-close" type="button" data-sheet-action="close" aria-label="关闭">
          <svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><use href="#icon-close"/></svg>
        </button>
      </div>
    `;
  }

  function openMenu() {
    if (state.screen !== 'story') return;
    window.clearTimeout(state.autoTimer);
    const node = state.node;
    const meta = node ? `${node.time} · ${node.place}` : '';
    openSheet(`
      ${sheetHead('ON BOARD', '途中')}
      <div class="sheet-menu">
        <button class="sheet-menu__item" type="button" data-sheet-action="resume">
          <span class="sheet-menu__no">01</span>
          <span class="sheet-menu__label">回到剧情</span>
          <span class="sheet-menu__meta">${escapeHTML(meta)}</span>
        </button>
        <button class="sheet-menu__item" type="button" data-sheet-action="backlog">
          <span class="sheet-menu__no">02</span>
          <span class="sheet-menu__label">剧情回顾</span>
        </button>
        <button class="sheet-menu__item" type="button" data-sheet-action="auto">
          <span class="sheet-menu__no">03</span>
          <span class="sheet-menu__label">自动播放</span>
          <span class="sheet-menu__meta">${settings.auto ? '开' : '关'}</span>
        </button>
        <button class="sheet-menu__item" type="button" data-sheet-action="codex">
          <span class="sheet-menu__no">04</span>
          <span class="sheet-menu__label">结局图鉴</span>
          <span class="sheet-menu__meta">${progress.seenEndings.length} / 4</span>
        </button>
        <button class="sheet-menu__item" type="button" data-sheet-action="settings">
          <span class="sheet-menu__no">05</span>
          <span class="sheet-menu__label">设置</span>
        </button>
        <button class="sheet-menu__item is-danger" type="button" data-sheet-action="restart">
          <span class="sheet-menu__no">06</span>
          <span class="sheet-menu__label">重新开始</span>
        </button>
        <button class="sheet-menu__item is-danger" type="button" data-sheet-action="home">
          <span class="sheet-menu__no">07</span>
          <span class="sheet-menu__label">返回标题</span>
        </button>
      </div>
      <p class="sheet-note">进度会自动保存在本机 · 结局图鉴不会随重新开始而清空</p>
    `, { label: '途中菜单' });
  }

  function segment(label, key, values) {
    const buttons = values.map(([value, text]) => `
      <button type="button" aria-pressed="${settings[key] === value ? 'true' : 'false'}" data-sheet-action="set-${key}" data-value="${value}">${text}</button>
    `).join('');
    return `
      <div class="setting-group">
        <div class="setting-label"><b>${label}</b><span>${key === 'textSize' ? 'TEXT' : 'SPEED'}</span></div>
        <div class="segmented">${buttons}</div>
      </div>
    `;
  }

  function toggleRow(label, desc, key) {
    const on = settings[key];
    return `
      <div class="setting-group">
        <div class="setting-row">
          <div class="setting-row__text"><b>${label}</b><span>${desc}</span></div>
          <button class="switch" type="button" role="switch" aria-checked="${on ? 'true' : 'false'}" aria-label="${label}" data-sheet-action="toggle-${key}"></button>
        </div>
      </div>
    `;
  }

  function openSettingsSheet() {
    openSheet(`
      ${sheetHead('PREFERENCES', '设置')}
      ${segment('字号', 'textSize', [['small', '小'], ['normal', '标准'], ['large', '大']])}
      <div class="setting-group">
        <div class="setting-label"><b>文字速度</b><span>SPEED</span></div>
        <div class="segmented">
          <button type="button" aria-pressed="${settings.speed === 'slow' ? 'true' : 'false'}" data-sheet-action="set-speed" data-value="slow">慢</button>
          <button type="button" aria-pressed="${settings.speed === 'normal' ? 'true' : 'false'}" data-sheet-action="set-speed" data-value="normal">标准</button>
          <button type="button" aria-pressed="${settings.speed === 'fast' ? 'true' : 'false'}" data-sheet-action="set-speed" data-value="fast">快</button>
          <button type="button" aria-pressed="${settings.speed === 'instant' ? 'true' : 'false'}" data-sheet-action="set-speed" data-value="instant">直显</button>
        </div>
      </div>
      ${toggleRow('声音', '火车、爆炸与环境声', 'sound')}
      ${toggleRow('触感', '抉择与爆炸时的振动', 'haptics')}
      <div class="setting-group">
        <div class="setting-row">
          <div class="setting-row__text"><b>自动播放</b><span>每句停留约 2.6 秒</span></div>
          <button class="switch" type="button" role="switch" aria-checked="${settings.auto ? 'true' : 'false'}" aria-label="自动播放" data-sheet-action="toggle-auto"></button>
        </div>
      </div>
      <button class="btn btn-outline" type="button" data-sheet-action="clear-records" style="margin-top:12px">清除全部游戏记录</button>
      <p class="sheet-note">所有记录仅保存在本机浏览器，不会上传。</p>
    `, { label: '设置' });
  }

  function openBacklog() {
    const items = state.history.length
      ? state.history.map((item) => {
        const cls = item.type === 'choice' ? 'backlog-item--choice' : (item.type === 'stage' ? 'backlog-item--stage' : '');
        const speaker = item.speaker ? `<span class="backlog-item__speaker">${escapeHTML(item.speaker)}</span>` : '';
        return `<div class="backlog-item ${cls}">${speaker}<p>${escapeHTML(item.text)}</p></div>`;
      }).join('')
      : '<p class="backlog-empty">还没有留下脚印。</p>';
    openSheet(`
      ${sheetHead('RECOLLECTION', '剧情回顾')}
      <div class="backlog-list">${items}</div>
    `, { label: '剧情回顾' });
    window.setTimeout(() => {
      const content = $('.sheet-content');
      if (content) content.scrollTop = content.scrollHeight;
    }, 80);
  }

  function confirmSheet(title, message, callback) {
    state.confirmCallback = callback;
    openSheet(`
      ${sheetHead('PLEASE CONFIRM', title)}
      <p class="confirm-copy">${escapeHTML(message)}</p>
      <div class="confirm-actions">
        <button class="btn btn-outline" type="button" data-sheet-action="confirm-no">取消</button>
        <button class="btn btn-primary" type="button" data-sheet-action="confirm-yes"><span class="btn-main" style="font-size:16px">确定</span></button>
      </div>
    `, { label: title });
  }

  function handleSheetAction(action, value) {
    switch (action) {
      case 'close':
        closeSheet();
        break;
      case 'resume':
        closeSheet();
        break;
      case 'backlog':
        openBacklog();
        break;
      case 'auto':
        settings.auto = !settings.auto;
        saveProgress();
        updateAutoUI();
        openMenu();
        showToast(settings.auto ? '自动播放已开启' : '自动播放已关闭');
        break;
      case 'codex':
        closeSheet(true);
        openCodex('endings', { from: 'story' });
        break;
      case 'settings':
        openSettingsSheet();
        break;
      case 'restart':
        confirmSheet('重新开始？', '当前进度会被覆盖，结局图鉴会保留。这一列车将再次从新民站出发。', () => {
          closeSheet(true);
          startNew();
        });
        break;
      case 'home':
        confirmSheet('返回标题？', '当前进度已自动保存。回到标题后，可以从“继续旅程”接着走。', () => {
          closeSheet(true);
          setScreen('home');
          updateHome();
        });
        break;
      case 'set-textSize':
        settings.textSize = value;
        saveProgress();
        applySettings();
        openSettingsSheet();
        break;
      case 'set-speed':
        settings.speed = value;
        saveProgress();
        applySettings();
        openSettingsSheet();
        break;
      case 'toggle-sound':
        settings.sound = !settings.sound;
        saveProgress();
        applySettings();
        openSettingsSheet();
        showToast(settings.sound ? '声音已开启' : '声音已关闭');
        break;
      case 'toggle-haptics':
        settings.haptics = !settings.haptics;
        saveProgress();
        applySettings();
        openSettingsSheet();
        if (settings.haptics) vibrate(12);
        break;
      case 'toggle-auto':
        settings.auto = !settings.auto;
        saveProgress();
        updateAutoUI();
        openSettingsSheet();
        break;
      case 'clear-records':
        confirmSheet('清除全部记录？', '存档、已解锁结局与开场记录都会被清除，设置会保留。这个操作无法撤销。', () => {
          removeSave();
          progress.seenEndings = [];
          progress.seenIntro = false;
          saveProgress();
          closeSheet(true);
          setScreen('home');
          updateHome();
          showToast('记录已清除');
        });
        break;
      case 'confirm-yes': {
        const callback = state.confirmCallback;
        state.confirmCallback = null;
        closeSheet(true);
        if (callback) window.setTimeout(callback, 40);
        break;
      }
      case 'confirm-no':
        state.confirmCallback = null;
        closeSheet();
        break;
      default:
        break;
    }
  }

  /* ── 全局交互 ─────────────────────────────────────────── */
  function onDocumentClick(event) {
    const closeTrigger = event.target.closest('[data-close-sheet]');
    if (closeTrigger) {
      closeSheet();
      return;
    }
    const actionEl = event.target.closest('[data-action]');
    if (actionEl) {
      const action = actionEl.dataset.action;
      switch (action) {
        case 'start':
          startNew();
          break;
        case 'continue':
          continueGame();
          break;
        case 'restart-home':
          confirmSheet('重新开始？', '当前进度会被覆盖，结局图鉴会保留。这一列车将再次从新民站出发。', () => {
            closeSheet(true);
            startNew();
          });
          break;
        case 'settings':
          openSettingsSheet();
          break;
        case 'open-menu':
          openMenu();
          break;
        case 'backlog':
          openBacklog();
          break;
        case 'toggle-sound':
          settings.sound = !settings.sound;
          saveProgress();
          applySettings();
          showToast(settings.sound ? '声音已开启' : '声音已关闭');
          break;
        case 'codex-back':
          closeCodex();
          break;
        case 'ending-exit':
          exitEnding();
          break;
        default:
          break;
      }
      return;
    }
    const codexBtn = event.target.closest('[data-codex]');
    if (codexBtn) {
      openCodex(codexBtn.dataset.codex, { from: 'home' });
      return;
    }
  }

  function onStoryClick(event) {
    if (state.screen !== 'story') return;
    if (state.sheetOpen) return;
    if (event.target.closest('button, a, .overlay, .opening')) return;
    if (!event.target.closest('.stage, .dialogue-panel')) return;
    if (state.choicesVisible) return;
    advance();
  }

  function onChoiceClick(event) {
    const btn = event.target.closest('[data-choice-index]');
    if (!btn) return;
    selectChoice(Number(btn.dataset.choiceIndex));
  }

  function onCodexTabClick(event) {
    const btn = event.target.closest('button[data-tab]');
    if (!btn) return;
    state.codexTab = btn.dataset.tab;
    renderCodex();
  }

  function onCodexContentClick(event) {
    const btn = event.target.closest('[data-ending-open]');
    if (!btn) return;
    openEnding(btn.dataset.endingOpen, { from: 'codex' });
  }

  function onKeyDown(event) {
    if (state.sheetOpen) {
      if (event.key === 'Escape') closeSheet();
      return;
    }
    if (state.screen === 'story') {
      if (event.key === 'Escape') {
        openMenu();
        return;
      }
      if (state.choicesVisible && /^[1-4a-dA-D]$/.test(event.key)) {
        const raw = event.key.toUpperCase();
        const index = /^[1-4]$/.test(raw) ? Number(raw) - 1 : raw.charCodeAt(0) - 65;
        selectChoice(index);
        event.preventDefault();
        return;
      }
      if (event.key === ' ' || event.key === 'Enter') {
        event.preventDefault();
        advance();
      }
    } else if (state.screen === 'ending' && state.endingFrom === 'codex' && event.key === 'Escape') {
      exitEnding();
    } else if (state.screen === 'codex' && event.key === 'Escape') {
      closeCodex();
    }
  }

  function bindEvents() {
    document.addEventListener('click', onDocumentClick);
    els.storyScreen.addEventListener('click', onStoryClick);
    els.choiceList.addEventListener('click', onChoiceClick);
    els.codexTabs.addEventListener('click', onCodexTabClick);
    els.codexContent.addEventListener('click', onCodexContentClick);
    els.endingNext.addEventListener('click', turnEndingPage);
    els.endingShare.addEventListener('click', shareEnding);
    els.endingReplay.addEventListener('click', replayEnding);
    els.endingHome.addEventListener('click', () => setScreen('home'));
    document.addEventListener('keydown', onKeyDown);

    if (els.opening) {
      els.opening.addEventListener('click', hideOpening);
    }

    // 抽屉内的按钮统一由这里处理
    els.sheetContent.addEventListener('click', (event) => {
      const btn = event.target.closest('[data-sheet-action]');
      if (!btn) return;
      handleSheetAction(btn.dataset.sheetAction, btn.dataset.value);
    });

    // 首次触摸解锁 Web Audio
    document.addEventListener('pointerdown', () => {
      if (settings.sound) {
        Sound.init();
        Sound.setEnabled(true);
      }
    }, { once: true });

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && settings.sound) Sound.init();
    });

    window.addEventListener('beforeunload', persistStory);
    window.addEventListener('pagehide', persistStory);
  }

  /* ── 启动 ─────────────────────────────────────────────── */
  function init() {
    els.app.dataset.textsize = settings.textSize;
    updateHome();
    updateSoundButton();
    bindEvents();
    setScreen('home', { instant: true });
    els.autoBadge.hidden = true;
    if ('serviceWorker' in navigator && /^https?:$/.test(window.location.protocol)) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch(() => {});
      });
    }
    // 调试接口：便于浏览器自动化与验收
    window.__DASHUAI_APP = {
      state,
      settings,
      progress,
      startNew,
      continueGame,
      loadNode,
      openEnding,
      openCodex,
      setScreen,
      updateHome,
      closeSheet
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
