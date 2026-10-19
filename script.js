(function () {
  'use strict';

  /* =========================================================
   * DOM
   * ======================================================= */
  const $ = id => document.getElementById(id);
  const textToggle = $('textToggle'), textEditorFields = $('textEditorFields');
  const dropzone = $('dropzone'), fileInput = $('fileInput'), editor = $('editor');
  const cropBox = $('cropBox'), workImg = $('workImg'), gridOverlay = $('gridOverlay'), textOverlayLayer = $('textOverlayLayer');
  const zoomSlider = $('zoomSlider'), zoomVal = $('zoomVal'), warnLine = $('warnLine'), currentLabel = $('currentLabel'), strip = $('strip');
  const downloadBtn = $('downloadBtn'), changeImgBtn = $('changeImgBtn'), undoBtn = $('undoBtn'), resetBtn = $('resetBtn');
  const customLabel = $('customLabel'), customW = $('customW'), customH = $('customH'), customLayout = $('customLayout');
  const sizeList = $('sizeList'), sizeSourceBadge = $('sizeSourceBadge');
  const formatSelect = $('formatSelect'), filenameInput = $('filenameInput');
  const textSelect = $('textSelect'), textContent = $('textContent'), textX = $('textX'), textY = $('textY');
  const fontFamily = $('fontFamily'), fontWeight = $('fontWeight'), fontSize = $('fontSize'), fontColor = $('fontColor'), textAlign = $('textAlign');

  /* =========================================================
   * 사이즈 프리셋
   *  - 팀 기본값: sizes.json (없거나 못 읽으면 아래 BUILTIN_SIZES)
   *  - 사용자 수정본: localStorage(STORAGE_KEY)에 자동 저장
   * ======================================================= */
  const STORAGE_KEY = 'dmaker.sizes.v1';
  const MIN_PX = 10, MAX_PX = 5000;
  const BUILTIN_SIZES = [
    { id: 'main', label: '메인 배너', w: 750, h: 750, textLayout: 'center' },
    { id: 'sub', label: '서브 배너', w: 750, h: 1000, textLayout: 'left' },
    { id: 'product', label: '상품 이미지', w: 1060, h: 1060, textLayout: 'none' },
    { id: 'wide', label: '가로 배너', w: 1200, h: 600, textLayout: 'none' },
    { id: 'coupon', label: '띠배너', w: 1200, h: 300, textLayout: 'none' }
  ];
  const LAYOUT_LABELS = { none: 'T 없음', center: 'T 가운데', left: 'T 왼쪽' };

  // 기본 텍스트 레이아웃: 기준 사이즈(bw×bh)에서 디자인된 값을 비율로 환산
  const TEXT_LAYOUTS = {
    center: { bw: 750, bh: 750, anchor: 'center', align: 'center',
      t1: { x: 375, y: 538, size: 58, weight: '500' }, t2: { x: 375, y: 628, size: 30, weight: '400' } },
    left: { bw: 750, bh: 1000, anchor: 'left', align: 'left',
      t1: { x: 56, y: 694, size: 58, weight: '500' }, t2: { x: 56, y: 863, size: 30, weight: '400' } }
  };

  let teamSizes = clonePresets(BUILTIN_SIZES); // sizes.json 로드 결과
  let presets = clonePresets(BUILTIN_SIZES);   // 현재 사용 중인 목록
  let isModified = false;                      // 팀 기본값과 다른지

  function clonePresets(list) { return list.map(p => ({ ...p })); }
  function clampPx(v) { const n = parseInt(v, 10); return Number.isFinite(n) ? n : NaN; }
  function validPx(n) { return Number.isFinite(n) && n >= MIN_PX && n <= MAX_PX; }
  function makeId() { return 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  function sanitizePresets(raw) {
    const list = Array.isArray(raw) ? raw : (raw && Array.isArray(raw.sizes) ? raw.sizes : null);
    if (!list) return null;
    const seen = new Set();
    const out = [];
    list.forEach(p => {
      if (!p) return;
      const w = clampPx(p.w), h = clampPx(p.h);
      if (!validPx(w) || !validPx(h)) return;
      let id = String(p.id || '').trim() || makeId();
      if (id === 'orig' || seen.has(id)) id = makeId();
      seen.add(id);
      out.push({
        id,
        label: String(p.label || '').trim().slice(0, 20) || `${w}×${h}`,
        w, h,
        textLayout: TEXT_LAYOUTS[p.textLayout] ? p.textLayout : 'none'
      });
    });
    return out;
  }

  function samePresets(a, b) {
    return JSON.stringify(a.map(p => [p.id, p.label, p.w, p.h, p.textLayout])) ===
      JSON.stringify(b.map(p => [p.id, p.label, p.w, p.h, p.textLayout]));
  }

  function savePresets() {
    isModified = !samePresets(presets, teamSizes);
    try {
      if (isModified) localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
      else localStorage.removeItem(STORAGE_KEY);
    } catch (e) { /* 저장 불가 환경은 무시 */ }
    updateBadge();
  }

  function updateBadge() {
    sizeSourceBadge.textContent = isModified ? '수정됨' : '팀 기본값';
    sizeSourceBadge.classList.toggle('modified', isModified);
  }

  async function loadTeamSizes() {
    try {
      const res = await fetch('sizes.json', { cache: 'no-store' });
      if (!res.ok) throw new Error(res.status);
      const list = sanitizePresets(await res.json());
      if (list && list.length) return list;
    } catch (e) { /* file:// 로 열었거나 파일 없음 → 내장 기본값 */ }
    return clonePresets(BUILTIN_SIZES);
  }

  function loadSavedPresets() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const list = sanitizePresets(JSON.parse(raw));
      return list && list.length ? list : null;
    } catch (e) { return null; }
  }

  /* =========================================================
   * 편집 상태
   * ======================================================= */
  const newItem = (p, extra) => Object.assign({ id: p.id, label: p.label, w: p.w, h: p.h, textLayout: p.textLayout || 'none', zoom: 100, nx: .5, ny: .5, texts: null }, extra || {});
  const origItem = newItem({ id: 'orig', label: '원본', w: 0, h: 0 }, { isOrig: true });
  let items = [origItem];
  let currentId = 'orig', selectedTextId = null, originalSrc = '', hasImage = false, history = [];
  let nw = 0, nh = 0, containerW = 480, containerH = 440, dispScale = 1;
  let dragging = false, dragStartX = 0, dragStartY = 0, startSx = 0, startSy = 0, textDragging = null;

  const cur = () => items.find(i => i.id === currentId) || items[0];
  const selectedText = () => cur().texts?.find(t => t.id === selectedTextId);
  const makeText = (id, label, x, y, opts = {}) => ({ id, label, text: '', x, y, font: 'Pretendard', weight: '500', size: 58, color: '#ffffff', align: 'left', ...opts });

  // 프리셋 목록 → 편집 아이템 동기화 (같은 id는 구도·텍스트 유지, 크기가 바뀌면 텍스트를 비율로 환산)
  function syncItemsFromPresets() {
    const prev = new Map(items.map(i => [i.id, i]));
    items = [origItem, ...presets.map(p => {
      const old = prev.get(p.id);
      if (!old) return newItem(p);
      if (old.texts && (old.w !== p.w || old.h !== p.h)) scaleTexts(old, p.w, p.h);
      if (old.textLayout !== p.textLayout) old.texts = null; // 레이아웃이 바뀌면 기본 텍스트 다시 생성
      Object.assign(old, { label: p.label, w: p.w, h: p.h, textLayout: p.textLayout });
      return old;
    })];
    if (!items.some(i => i.id === currentId)) { currentId = 'orig'; selectedTextId = null; }
  }

  function scaleTexts(it, w, h) {
    // 글자 크기는 면적 비율의 제곱근으로 환산 → 너비·높이를 나눠서 바꿔도 결과가 같음
    const sx = w / it.w, sy = h / it.h, ss = Math.sqrt(sx * sy);
    it.texts.forEach(t => {
      t.x = Math.round(t.x * sx);
      t.y = Math.round(t.y * sy);
      t.size = Math.max(1, Math.round(t.size * ss));
    });
  }

  function layoutDefaults(it, textId) {
    const L = TEXT_LAYOUTS[it.textLayout];
    if (!L || !L[textId]) return null;
    const d = L[textId], s = Math.min(it.w / L.bw, it.h / L.bh);
    return {
      x: Math.round(d.x / L.bw * it.w),
      y: Math.round(d.y / L.bh * it.h),
      anchor: L.anchor, align: L.align,
      font: 'Pretendard', weight: d.weight,
      size: Math.max(1, Math.round(d.size * s)),
      color: '#ffffff'
    };
  }

  function ensureTexts(it) {
    if (it.texts) return;
    if (it.isOrig || !TEXT_LAYOUTS[it.textLayout]) { it.texts = []; return; }
    it.texts = [
      makeText('t1', 'Title 1', 0, 0, layoutDefaults(it, 't1')),
      makeText('t2', 'Title 2', 0, 0, layoutDefaults(it, 't2'))
    ];
  }

  function getTextDefaults(it, t) {
    if (!t || !['t1', 't2'].includes(t.id)) return null;
    return layoutDefaults(it, t.id);
  }

  function resetCrops() { items.forEach(i => { i.zoom = 100; i.nx = .5; i.ny = .5; }); }

  function getRect(it) {
    const s0 = Math.max(it.w / nw, it.h / nh), s = s0 * it.zoom / 100, sw = it.w / s, sh = it.h / s;
    let sx = it.nx * nw - sw / 2, sy = it.ny * nh - sh / 2;
    sx = Math.max(0, Math.min(nw - sw, sx));
    sy = Math.max(0, Math.min(nh - sh, sy));
    it.nx = (sx + sw / 2) / nw;
    it.ny = (sy + sh / 2) / nh;
    return { sx, sy, sw, sh };
  }

  /* =========================================================
   * 사이즈 관리 패널
   * ======================================================= */
  function renderSizeList() {
    sizeList.innerHTML = '';
    presets.forEach((p, idx) => {
      const row = document.createElement('div');
      row.className = 'size-row' + (p.id === currentId ? ' active' : '');
      row.dataset.id = p.id;

      const line1 = document.createElement('div');
      line1.className = 'line';
      const label = document.createElement('input');
      label.type = 'text'; label.className = 's-label'; label.value = p.label; label.maxLength = 20; label.title = '사이즈 이름';
      label.addEventListener('input', () => {
        p.label = label.value.trim() || `${p.w}×${p.h}`;
        savePresets(); syncItemsFromPresets(); refreshViews({ keepList: true });
      });
      const up = iconBtn('↑', '위로', idx === 0, () => movePreset(idx, -1));
      const down = iconBtn('↓', '아래로', idx === presets.length - 1, () => movePreset(idx, 1));
      const del = iconBtn('✕', '이 사이즈 삭제', false, () => deletePreset(p.id));
      line1.append(label, up, down, del);

      const line2 = document.createElement('div');
      line2.className = 'line';
      const w = numInput(p.w, '너비'), h = numInput(p.h, '높이');
      const x = document.createElement('span'); x.className = 'x'; x.textContent = '×';
      const layout = document.createElement('select');
      layout.className = 's-layout'; layout.title = '기본 텍스트(Title 1·2) 배치';
      Object.entries(LAYOUT_LABELS).forEach(([v, t]) => { const o = document.createElement('option'); o.value = v; o.textContent = t; layout.appendChild(o); });
      layout.value = p.textLayout;
      const commitSize = () => {
        const nwv = clampPx(w.value), nhv = clampPx(h.value);
        if (!validPx(nwv) || !validPx(nhv)) {
          row.classList.add('invalid');
          warnLine.innerHTML = `<span class="warn">⚠ 너비/높이는 ${MIN_PX}~${MAX_PX}px 사이로 입력해주세요.</span>`;
          return;
        }
        row.classList.remove('invalid');
        warnLine.textContent = '';
        if (nwv === p.w && nhv === p.h) return;
        p.w = nwv; p.h = nhv;
        savePresets(); syncItemsFromPresets(); refreshViews();
      };
      [w, h].forEach(el => {
        el.addEventListener('change', commitSize);
        el.addEventListener('keydown', e => { if (e.key === 'Enter') el.blur(); });
      });
      layout.addEventListener('change', () => {
        p.textLayout = layout.value;
        savePresets(); syncItemsFromPresets(); refreshViews();
      });
      line2.append(w, x, h, layout);

      row.append(line1, line2);
      row.addEventListener('click', e => {
        if (!hasImage || e.target.closest('input,select,button')) return;
        selectItem(p.id);
      });
      sizeList.appendChild(row);
    });
  }

  function iconBtn(text, title, disabled, onClick) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'icon-btn'; b.textContent = text; b.title = title; b.disabled = disabled;
    b.addEventListener('click', e => { e.stopPropagation(); onClick(); });
    return b;
  }

  function numInput(value, title) {
    const el = document.createElement('input');
    el.type = 'number'; el.className = 's-num'; el.min = MIN_PX; el.max = MAX_PX; el.value = value; el.title = title + ' (px)';
    return el;
  }

  function movePreset(idx, dir) {
    const j = idx + dir;
    if (j < 0 || j >= presets.length) return;
    [presets[idx], presets[j]] = [presets[j], presets[idx]];
    savePresets(); syncItemsFromPresets(); refreshViews();
  }

  function deletePreset(id) {
    const p = presets.find(x => x.id === id);
    if (!p) return;
    if (presets.length <= 1) { alert('사이즈는 최소 1개 이상 있어야 합니다.'); return; }
    if (!confirm(`'${p.label} (${p.w}×${p.h})' 사이즈를 목록에서 삭제할까요?`)) return;
    presets = presets.filter(x => x.id !== id);
    savePresets(); syncItemsFromPresets(); refreshViews();
  }

  function addCustom() {
    const w = clampPx(customW.value), h = clampPx(customH.value);
    if (!validPx(w) || !validPx(h)) { alert(`너비/높이를 ${MIN_PX}~${MAX_PX}px 사이로 입력해주세요.`); return; }
    const p = { id: makeId(), label: customLabel.value.trim().slice(0, 20) || `${w}×${h}`, w, h, textLayout: customLayout.value };
    presets.push(p);
    customLabel.value = ''; customW.value = ''; customH.value = ''; customLayout.value = 'none';
    savePresets(); syncItemsFromPresets();
    if (hasImage) selectItem(p.id); else refreshViews();
  }

  function selectItem(id) {
    if (currentId === id) return;
    currentId = id;
    const it = cur();
    ensureTexts(it);
    selectedTextId = it.texts[0]?.id || null;
    refreshViews();
  }

  // 사이즈 목록/썸네일/편집 화면을 한 번에 갱신
  function refreshViews(opts = {}) {
    if (!opts.keepList) renderSizeList();
    else sizeList.querySelectorAll('.size-row').forEach(r => r.classList.toggle('active', r.dataset.id === currentId));
    if (!hasImage) return;
    renderStrip();
    layoutMain();
  }

  async function resetToTeamSizes() {
    if (!confirm('사이즈 목록을 팀 기본값(sizes.json)으로 되돌릴까요?\n직접 추가·수정한 사이즈는 사라집니다.')) return;
    teamSizes = await loadTeamSizes();
    presets = clonePresets(teamSizes);
    savePresets(); syncItemsFromPresets(); refreshViews();
  }

  function exportSizes() {
    const data = {
      version: 1,
      description: 'D-Maker 팀 공용 기본 사이즈. 이 파일을 수정해 배포하면 모든 사용자의 기본 사이즈가 바뀝니다. textLayout: center(가운데 정렬 타이틀) / left(왼쪽 정렬 타이틀) / none(기본 텍스트 없음)',
      sizes: presets.map(({ id, label, w, h, textLayout }) => ({ id, label, w, h, textLayout }))
    };
    const blob = new Blob([JSON.stringify(data, null, 2) + '\n'], { type: 'application/json' });
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = 'sizes.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function importSizes(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      let list = null;
      try { list = sanitizePresets(JSON.parse(reader.result)); } catch (e) { list = null; }
      if (!list || !list.length) { alert('사이즈 파일을 읽을 수 없어요. 내보내기로 만든 sizes.json 형식인지 확인해주세요.'); return; }
      if (!confirm(`${list.length}개 사이즈로 현재 목록을 교체할까요?`)) return;
      presets = list;
      savePresets(); syncItemsFromPresets(); refreshViews();
    };
    reader.readAsText(file);
  }

  /* =========================================================
   * 썸네일 · 편집 화면
   * ======================================================= */
  function thumbSize(it) {
    let th = 84, tw = th * it.w / it.h;
    if (tw > 130) { tw = 130; th = tw * it.h / it.w; }
    return { tw: Math.max(20, Math.round(tw)), th: Math.max(10, Math.round(th)) };
  }

  function drawThumb(it) {
    const canvas = strip.querySelector(`canvas[data-id="${it.id}"]`);
    if (!canvas || !hasImage) return;
    const r = getRect(it), ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(workImg, r.sx, r.sy, r.sw, r.sh, 0, 0, canvas.width, canvas.height);
  }

  function renderStrip() {
    strip.innerHTML = '';
    items.forEach(it => {
      const el = document.createElement('div');
      el.className = 'thumb' + (it.id === currentId ? ' active' : '');
      const { tw, th } = thumbSize(it), canvas = document.createElement('canvas');
      canvas.width = tw * 2; canvas.height = th * 2;
      canvas.style.width = tw + 'px'; canvas.style.height = th + 'px';
      canvas.dataset.id = it.id;
      el.appendChild(canvas);
      const label = document.createElement('div');
      label.className = 't-label'; label.textContent = it.label;
      el.appendChild(label);
      const dim = document.createElement('div');
      dim.className = 't-dim'; dim.textContent = `${it.w}×${it.h}`;
      el.appendChild(dim);
      if (!it.isOrig) {
        const del = document.createElement('button');
        del.className = 't-del'; del.textContent = '×'; del.title = '이 사이즈 삭제';
        del.addEventListener('click', e => { e.stopPropagation(); deletePreset(it.id); });
        el.appendChild(del);
      }
      el.addEventListener('click', () => selectItem(it.id));
      strip.appendChild(el);
    });
    items.forEach(drawThumb);
  }

  function layoutMain() {
    const it = cur();
    ensureTexts(it);
    const limW = Math.min(560, Math.max(280, $('workspace').clientWidth - 24)), limH = 440;
    if (it.w / it.h >= limW / limH) { containerW = limW; containerH = limW * it.h / it.w; }
    else { containerH = limH; containerW = limH * it.w / it.h; }
    cropBox.style.width = containerW + 'px';
    cropBox.style.height = containerH + 'px';
    currentLabel.innerHTML = '';
    currentLabel.append(document.createTextNode(it.label));
    const span = document.createElement('span'); span.textContent = `${it.w}×${it.h}px`;
    currentLabel.appendChild(span);
    renderMain();
    renderTextPanel();
  }

  function renderTextOverlays() {
    textOverlayLayer.innerHTML = '';
    if (!textToggle.checked) return;
    const it = cur();
    ensureTexts(it);
    it.texts.forEach(t => {
      const node = document.createElement('div');
      node.className = 'text-overlay' + (t.id === selectedTextId ? ' selected' : '') + (!t.text ? ' empty' : '');
      node.dataset.id = t.id;
      node.dataset.placeholder = t.label;
      node.textContent = t.text;
      node.style.left = (t.x / it.w * containerW) + 'px';
      node.style.top = (t.y / it.h * containerH) + 'px';
      node.style.transform = t.anchor === 'center' ? 'translate(-50%,0)' : t.anchor === 'right' ? 'translate(-100%,0)' : 'translate(0,0)';
      node.style.textAlign = t.align;
      node.style.fontFamily = `"${t.font}", sans-serif`;
      node.style.fontWeight = t.weight;
      node.style.fontSize = (t.size * containerW / it.w) + 'px';
      node.style.color = t.color;
      node.addEventListener('pointerdown', e => {
        e.preventDefault(); e.stopPropagation();
        selectedTextId = t.id;
        textDragging = { id: t.id, pointerId: e.pointerId, x: e.clientX, y: e.clientY, startX: t.x, startY: t.y };
        cropBox.setPointerCapture(e.pointerId);
        renderTextPanel();
        renderTextOverlays();
      });
      textOverlayLayer.appendChild(node);
    });
  }

  function renderTextPanel() {
    const it = cur();
    ensureTexts(it);
    textSelect.innerHTML = '';
    it.texts.forEach((t, i) => {
      const o = document.createElement('option');
      o.value = t.id; o.textContent = t.label || `텍스트 ${i + 1}`;
      textSelect.appendChild(o);
    });
    if (!it.texts.some(t => t.id === selectedTextId)) selectedTextId = it.texts[0]?.id || null;
    textSelect.value = selectedTextId || '';
    const t = selectedText();
    const controls = [textSelect, textContent, textX, textY, fontFamily, fontWeight, fontSize, fontColor, textAlign, $('centerPositionBtn'), $('deleteTextBtn'), ...document.querySelectorAll('.nudge')];
    controls.forEach(c => c.disabled = !hasImage || !t);
    $('restoreTextDefaultBtn').disabled = !hasImage || !getTextDefaults(it, t);
    $('addTextBtn').disabled = !hasImage;
    if (!t) { renderTextOverlays(); return; }
    textContent.value = t.text;
    textX.value = Math.round(t.x);
    textY.value = Math.round(t.y);
    fontFamily.value = t.font;
    fontWeight.value = t.weight;
    fontSize.value = t.size;
    fontColor.value = t.color;
    textAlign.value = t.align;
    renderTextOverlays();
  }

  function renderMain() {
    const it = cur(), r = getRect(it);
    dispScale = containerW / r.sw;
    workImg.style.width = (nw * dispScale) + 'px';
    workImg.style.height = (nh * dispScale) + 'px';
    workImg.style.transform = `translate(${-r.sx * dispScale}px, ${-r.sy * dispScale}px)`;
    zoomSlider.value = it.zoom;
    zoomVal.textContent = Math.round(it.zoom) + '%';
    const upscale = it.w / r.sw;
    warnLine.innerHTML = upscale > 1.05 ? `<span class="warn">⚠ 현재 구도로 저장하면 원본보다 확대되어(${Math.round(upscale * 100)}%) 화질이 흐려질 수 있어요.</span>` : '';
    drawThumb(it);
    renderTextOverlays();
  }

  /* =========================================================
   * 이미지 로드
   * ======================================================= */
  function setImageSrc(src, cb) {
    workImg.onload = () => {
      nw = workImg.naturalWidth; nh = workImg.naturalHeight;
      origItem.w = nw; origItem.h = nh;
      if (cb) cb();
    };
    workImg.src = src;
  }

  function loadFile(file) {
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = e => {
      originalSrc = e.target.result;
      items.forEach(i => i.texts = null);
      setImageSrc(originalSrc, () => {
        hasImage = true;
        dropzone.style.display = 'none';
        editor.style.display = 'flex';
        changeImgBtn.style.display = 'inline-block';
        downloadBtn.disabled = false;
        resetBtn.disabled = false;
        history = [];
        undoBtn.disabled = true;
        resetCrops();
        currentId = 'orig';
        ensureTexts(cur());
        selectedTextId = cur().texts[0]?.id || null;
        refreshViews();
      });
    };
    reader.readAsDataURL(file);
  }

  dropzone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', e => loadFile(e.target.files[0]));
  ['dragenter', 'dragover'].forEach(evt => dropzone.addEventListener(evt, e => { e.preventDefault(); dropzone.classList.add('dragover'); }));
  ['dragleave', 'drop'].forEach(evt => dropzone.addEventListener(evt, e => { e.preventDefault(); dropzone.classList.remove('dragover'); }));
  dropzone.addEventListener('drop', e => loadFile(e.dataTransfer.files[0]));
  document.addEventListener('paste', e => {
    const list = e.clipboardData && e.clipboardData.items;
    if (!list) return;
    for (const item of list) if (item.type.startsWith('image/')) { loadFile(item.getAsFile()); break; }
  });
  changeImgBtn.addEventListener('click', () => {
    editor.style.display = 'none';
    dropzone.style.display = 'flex';
    changeImgBtn.style.display = 'none';
    downloadBtn.disabled = true;
    resetBtn.disabled = true;
    hasImage = false;
    originalSrc = '';
    fileInput.value = '';
    history = [];
    undoBtn.disabled = true;
    warnLine.textContent = '';
    currentId = 'orig';
    renderSizeList();
  });

  /* =========================================================
   * 사이즈 관리 이벤트
   * ======================================================= */
  $('applyCustom').addEventListener('click', addCustom);
  [customLabel, customW, customH].forEach(el => el.addEventListener('keydown', e => { if (e.key === 'Enter') addCustom(); }));
  $('resetSizesBtn').addEventListener('click', resetToTeamSizes);
  $('exportSizesBtn').addEventListener('click', exportSizes);
  $('importSizesBtn').addEventListener('click', () => $('importSizesInput').click());
  $('importSizesInput').addEventListener('change', e => { importSizes(e.target.files[0]); e.target.value = ''; });

  /* =========================================================
   * 구도 조정 (확대 · 드래그)
   * ======================================================= */
  zoomSlider.addEventListener('input', () => { if (!hasImage) return; cur().zoom = parseFloat(zoomSlider.value); renderMain(); });
  cropBox.addEventListener('wheel', e => {
    if (!hasImage) return;
    e.preventDefault();
    const it = cur();
    it.zoom = Math.max(100, Math.min(400, it.zoom - e.deltaY * .2));
    renderMain();
  }, { passive: false });
  cropBox.addEventListener('pointerdown', e => {
    if (!hasImage || e.target.closest('.text-overlay')) return;
    dragging = true;
    cropBox.setPointerCapture(e.pointerId);
    dragStartX = e.clientX; dragStartY = e.clientY;
    const r = getRect(cur());
    startSx = r.sx; startSy = r.sy;
  });
  cropBox.addEventListener('pointermove', e => {
    if (textDragging && e.pointerId === textDragging.pointerId) {
      const it = cur(), t = it.texts?.find(x => x.id === textDragging.id);
      if (!t) return;
      t.x = Math.round(Math.max(0, Math.min(it.w, textDragging.startX + (e.clientX - textDragging.x) * it.w / containerW)));
      t.y = Math.round(Math.max(0, Math.min(it.h, textDragging.startY + (e.clientY - textDragging.y) * it.h / containerH)));
      renderTextPanel();
      return;
    }
    if (!dragging) return;
    const it = cur(), r0 = getRect(it);
    const sx = startSx - (e.clientX - dragStartX) / dispScale, sy = startSy - (e.clientY - dragStartY) / dispScale;
    it.nx = (sx + r0.sw / 2) / nw;
    it.ny = (sy + r0.sh / 2) / nh;
    renderMain();
  });
  ['pointerup', 'pointercancel'].forEach(evt => cropBox.addEventListener(evt, e => {
    if (textDragging && e.pointerId === textDragging.pointerId) textDragging = null;
    dragging = false;
  }));
  $('gridToggle').addEventListener('change', e => gridOverlay.classList.toggle('show', e.target.checked));

  /* =========================================================
   * 회전 · 반전 · 이전 · 리셋
   * ======================================================= */
  function bakeTransform(deg, flipH, flipV) {
    const swap = deg === 90 || deg === 270 || deg === -90, canvas = document.createElement('canvas');
    canvas.width = swap ? nh : nw;
    canvas.height = swap ? nw : nh;
    const ctx = canvas.getContext('2d');
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(deg * Math.PI / 180);
    ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
    ctx.drawImage(workImg, -nw / 2, -nh / 2, nw, nh);
    ctx.restore();
    return canvas.toDataURL('image/png');
  }
  function afterImageChange() { resetCrops(); refreshViews(); }
  function applyBaked(deg, fh, fv) {
    if (!hasImage) return;
    history.push(workImg.src);
    undoBtn.disabled = false;
    setImageSrc(bakeTransform(deg, fh, fv), afterImageChange);
  }
  $('rotateLeft').addEventListener('click', () => applyBaked(-90, false, false));
  $('rotateRight').addEventListener('click', () => applyBaked(90, false, false));
  $('flipH').addEventListener('click', () => applyBaked(0, true, false));
  $('flipV').addEventListener('click', () => applyBaked(0, false, true));
  undoBtn.addEventListener('click', () => {
    if (!history.length) return;
    const prev = history.pop();
    if (!history.length) undoBtn.disabled = true;
    setImageSrc(prev, afterImageChange);
  });
  resetBtn.addEventListener('click', () => {
    if (!hasImage || !originalSrc) return;
    if (!confirm('이미지와 텍스트 설정을 모두 처음 상태로 되돌릴까요?')) return;
    history = [];
    undoBtn.disabled = true;
    items.forEach(i => { i.texts = null; i.zoom = 100; i.nx = .5; i.ny = .5; });
    selectedTextId = null;
    setImageSrc(originalSrc, () => {
      currentId = 'orig';
      ensureTexts(cur());
      selectedTextId = cur().texts[0]?.id || null;
      refreshViews();
    });
  });

  /* =========================================================
   * 텍스트 편집
   * ======================================================= */
  textSelect.addEventListener('change', () => { selectedTextId = textSelect.value; renderTextPanel(); });
  $('restoreTextDefaultBtn').addEventListener('click', () => {
    const t = selectedText(), defaults = getTextDefaults(cur(), t);
    if (!t || !defaults) return;
    Object.assign(t, defaults);
    renderTextPanel();
  });
  textEditorFields.style.display = 'none';
  textToggle.addEventListener('change', () => {
    textEditorFields.style.display = textToggle.checked ? 'block' : 'none';
    if (textToggle.checked && hasImage) { ensureTexts(cur()); renderTextPanel(); }
    else renderTextOverlays();
  });
  $('centerPositionBtn').addEventListener('click', () => {
    const t = selectedText();
    if (!t) return;
    const it = cur(), lineCount = Math.max(1, (t.text || '').split('\n').length);
    t.anchor = 'center';
    t.x = it.w / 2;
    t.y = Math.max(0, Math.round((it.h - lineCount * t.size * 1.2) / 2));
    renderTextPanel();
  });
  $('addTextBtn').addEventListener('click', () => {
    const it = cur();
    ensureTexts(it);
    const id = 't' + Date.now();
    it.texts.push(makeText(id, `텍스트 ${it.texts.length + 1}`, it.w / 2, it.h / 2, { anchor: 'center', align: 'left' }));
    selectedTextId = id;
    renderTextPanel();
  });
  $('deleteTextBtn').addEventListener('click', () => {
    const it = cur();
    if (it.texts.length <= 1) { alert('배너에는 최소 한 개의 텍스트 설정이 필요합니다.'); return; }
    it.texts = it.texts.filter(t => t.id !== selectedTextId);
    selectedTextId = it.texts[0].id;
    renderTextPanel();
  });
  function bindTextInput(el, key, parse = v => v) {
    el.addEventListener('input', () => {
      const t = selectedText();
      if (!t) return;
      t[key] = parse(el.value);
      renderTextOverlays();
    });
  }
  bindTextInput(textContent, 'text');
  bindTextInput(textX, 'x', v => Math.max(0, Math.min(cur().w, parseInt(v, 10) || 0)));
  bindTextInput(textY, 'y', v => Math.max(0, Math.min(cur().h, parseInt(v, 10) || 0)));
  bindTextInput(fontFamily, 'font');
  bindTextInput(fontWeight, 'weight');
  bindTextInput(fontSize, 'size', v => Math.max(1, parseInt(v, 10) || 1));
  bindTextInput(fontColor, 'color');
  bindTextInput(textAlign, 'align');
  document.querySelectorAll('.nudge').forEach(btn => btn.addEventListener('click', () => {
    const t = selectedText();
    if (!t) return;
    t.x = Math.max(0, Math.min(cur().w, t.x + Number(btn.dataset.dx)));
    t.y = Math.max(0, Math.min(cur().h, t.y + Number(btn.dataset.dy)));
    renderTextPanel();
  }));

  /* =========================================================
   * 저장
   * ======================================================= */
  const canvasToBlob = (canvas, type, quality) => new Promise(resolve => canvas.toBlob(resolve, type, quality));

  function drawText(ctx, it) {
    ensureTexts(it);
    it.texts.forEach(t => {
      if (!t.text) return;
      ctx.save();
      ctx.font = `${t.weight} ${t.size}px "${t.font}", sans-serif`;
      ctx.fillStyle = t.color;
      ctx.textBaseline = 'top';
      const lines = t.text.split('\n');
      const boxW = Math.max(0, ...lines.map(line => ctx.measureText(line).width));
      const boxLeft = t.anchor === 'center' ? t.x - boxW / 2 : t.anchor === 'right' ? t.x - boxW : t.x;
      lines.forEach((line, i) => {
        let x = boxLeft;
        if (t.align === 'center') x += boxW / 2;
        else if (t.align === 'right') x += boxW;
        ctx.textAlign = t.align;
        ctx.fillText(line, x, t.y + i * t.size * 1.2);
      });
      ctx.restore();
    });
  }

  downloadBtn.addEventListener('click', async () => {
    if (!hasImage) return;
    downloadBtn.disabled = true;
    try {
      const it = cur(), r = getRect(it), canvas = document.createElement('canvas');
      canvas.width = it.w; canvas.height = it.h;
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      if (formatSelect.value === 'jpeg') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, it.w, it.h); }
      ctx.drawImage(workImg, r.sx, r.sy, r.sw, r.sh, 0, 0, it.w, it.h);
      drawText(ctx, it);
      const base = (filenameInput.value || 'edited-image').replace(/[\\/:*?"<>|]/g, '').trim() || 'edited-image';
      const name = `${base}_${it.w}x${it.h}`;
      let blob, ext;
      if (formatSelect.value === 'png') { blob = await canvasToBlob(canvas, 'image/png'); ext = 'png'; }
      else { blob = await canvasToBlob(canvas, 'image/jpeg', .92); ext = 'jpg'; }
      warnLine.innerHTML = `저장 완료: <b>${Math.round(blob.size / 1024)}KB</b>`;
      const url = URL.createObjectURL(blob), a = document.createElement('a');
      a.href = url; a.download = `${name}.${ext}`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } finally {
      downloadBtn.disabled = false;
    }
  });

  window.addEventListener('resize', () => { if (hasImage) layoutMain(); });

  /* =========================================================
   * 초기화
   * ======================================================= */
  (async function init() {
    renderSizeList(); // 내장 기본값으로 먼저 그림
    teamSizes = await loadTeamSizes();
    const saved = loadSavedPresets();
    presets = saved || clonePresets(teamSizes);
    isModified = !!saved && !samePresets(presets, teamSizes);
    if (saved && !isModified) { try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* noop */ } }
    updateBadge();
    syncItemsFromPresets();
    refreshViews();
  })();
})();
