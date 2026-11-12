/* 拼豆色板工坊 — 原型
 * 数据：data.js（BEAD_DATA，291 色 × 5 品牌）
 * 品牌：MARD / COCO / 漫漫 / 盼盼 / 咪小窝，用户选择确认
 */
'use strict';

const state = {
  ...readPaletteState(key => localStorage.getItem(key)),
  view: 'lib',
  onlySel: false,
  search: '',
};

function saveItem(key, value) {
  try { localStorage.setItem(key, value); }
  catch { /* 浏览器可能限制本地存储，会话内仍可使用 */ }
}

// ── 工具 ──
const $ = s => document.querySelector(s);
const attribution = $('#attribution');
const el = (tag, cls, html) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
};
const codeOf = color => displayCode(color[state.brand]);
const esc = s => s.replace(/[&<>"]/g, m => ({'&':'&','<':'<','>':'>','"':'"'}[m]));

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 2200);
}

// 一次用户操作只保存一次，色板始终以 HEX 表示。
function updatePalette(hexes, selected) {
  let changed = 0;
  for (const hex of hexes) {
    if (!HEX_MAP.has(hex) || state.palette.has(hex) === selected) continue;
    if (selected) state.palette.add(hex);
    else state.palette.delete(hex);
    changed++;
  }
  if (changed) saveItem('beadpal.palette', JSON.stringify([...state.palette]));
  return changed;
}

let lastClickKey = null; // Shift 连选锚点
function searchTokens() {
  return state.search.trim().toUpperCase().split(/[\s,，]+/).filter(Boolean);
}
function matchesSearch(c, token) {
  if (token.startsWith('#')) return c.hex.toUpperCase().includes(token);
  const displayed = codeOf(c).toUpperCase();
  const raw = (c[state.brand] || '').toUpperCase();
  const query = normalizeCode(token);
  return displayed.includes(query) || raw.includes(token);
}
function exactSearchResults() {
  const matches = new Set();
  const unmatched = [];
  for (const token of searchTokens()) {
    if (token.startsWith('#')) {
      const color = /^#[0-9A-F]{6}$/.test(token) ? HEX_MAP.get(token) : null;
      if (color) matches.add(color.hex); else unmatched.push(token);
      continue;
    }
    const { hex } = resolveCode(state.brand, token);
    if (hex) matches.add(hex); else unmatched.push(token);
  }
  return { matches: [...matches].filter(hex => !state.onlySel || state.palette.has(hex)), unmatched };
}
function addExactSearch() {
  const { matches, unmatched } = exactSearchResults();
  const added = updatePalette(matches, true);
  const returnFocus = document.activeElement.classList.contains('search-add');
  renderLibrary();
  if (returnFocus) $('#search').focus();
  updateCount();
  const result = added ? `已加入 ${added} 色` : matches.length ? '匹配色号已在色板中' : '没有完整匹配的色号';
  toast(unmatched.length ? `${result}；未匹配或有歧义：${unmatched.join('、')}` : result);
}
function updateRail() {
  const lib = $('#library');
  const heads = [...lib.querySelectorAll('.group-head')];
  if (!heads.length) return;
  const top = lib.getBoundingClientRect().top;
  let current = heads[0];
  for (const head of heads) {
    if (head.getBoundingClientRect().top <= top + 18) current = head;
  }
  for (const button of $('#rail').querySelectorAll('button')) {
    const active = button.dataset.group === current.id;
    button.classList.toggle('active', active);
    if (active) button.setAttribute('aria-current', 'location');
    else button.removeAttribute('aria-current');
  }
}
function renderLibrary() {
  const lib = $('#library');
  lib.innerHTML = '';
  const rail = $('#rail');
  rail.innerHTML = '';
  let colors = orderedColors(state.brand, state.view);
  if (state.onlySel) colors = colors.filter(c => state.palette.has(c.hex));
  const tokens = searchTokens();
  if (tokens.length) colors = colors.filter(c => tokens.some(t => matchesSearch(c, t)));
  if (tokens.length) {
    const { matches, unmatched } = exactSearchResults();
    const bar = el('div', 'search-results');
    const description = el('span', '', `找到 ${colors.length} 色 · 当前视图完整匹配 ${matches.length} 色${unmatched.length ? ` · 未匹配或有歧义：${esc(unmatched.join('、'))}` : ''}`);
    const add = el('button', 'search-add', `加入完整匹配（${matches.length}）`);
    add.disabled = !matches.length;
    add.addEventListener('click', addExactSearch);
    bar.append(description, add);
    lib.appendChild(bar);
  }

  if (!colors.length) {
    const msg = state.onlySel && !state.palette.size
      ? '色板还是空的。关掉"只看已选"回到全库，点击豆子加入，或用批量导入。'
      : '没有匹配的颜色';
    lib.appendChild(el('div', 'lib-empty', msg));
    lib.appendChild(attribution);
    rail.classList.add('hidden');
    return;
  }

  const groups = state.view === 'lib'
    ? groupBySeries(colors, state.brand)
    : new Map([[null, colors]]);

  const frag = document.createDocumentFragment();
  for (const [key, items] of groups) {
    let updateSelBtn = null;
    if (key) {
      const head = el('div', 'group-head');
      head.id = 'grp-' + key;
      head.appendChild(el('span', '', `${esc(key)} <small>${items.length} 色</small>`));
      const selBtn = el('button', 'grp-sel');
      let allIn = false;
      updateSelBtn = () => {
        const an = items.filter(c => state.palette.has(c.hex)).length;
        allIn = an === items.length;
        selBtn.textContent = allIn ? (tokens.length ? '移出结果' : '移出全部') : (an ? `补全 (${items.length - an})` : (tokens.length ? '全选结果' : '全选'));
        selBtn.title = allIn ? '移出当前显示的颜色' : '加入当前显示的颜色';
        selBtn.setAttribute('aria-label', `${key} 系列：${selBtn.textContent}当前显示的颜色`);
      };
      updateSelBtn();
      selBtn.addEventListener('click', () => {
        if (allIn) {
          updatePalette(items.map(c => c.hex), false);
          toast(`已移出 ${key} 系列当前显示的 ${items.length} 色`);
        } else {
          const n = updatePalette(items.map(c => c.hex), true);
          toast(n ? `${key} 系列已加入 ${n} 色` : `${key} 系列都已加入色板`);
        }
        renderLibrary();
        updateCount();
        document.getElementById('grp-' + key)?.querySelector('.grp-sel')?.focus();
      });
      head.appendChild(selBtn);
      frag.appendChild(head);
      const rb = el('button', '', esc(key));
      rb.title = '跳到 ' + key;
      rb.dataset.group = head.id;
      rb.addEventListener('click', () => $('#grp-' + CSS.escape(key))?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
      rail.appendChild(rb);
    }
    for (const c of items) {
      const code = codeOf(c);
      const conflicts = codeMatches(state.brand, code);
      const amb = conflicts.length > 1;
      const tile = el('button', 'tile' + (state.palette.has(c.hex) ? ' added' : ''));
      tile.type = 'button';
      tile.tabIndex = frag.querySelector('.tile') ? -1 : 0;
      tile.setAttribute('aria-pressed', String(state.palette.has(c.hex)));
      tile.setAttribute('aria-describedby', 'keyboard-hint');
      tile.setAttribute('aria-label', `${state.brand} ${code}${amb ? '，色号存在歧义' : ''}，${c.hex}`);
      if (code === '—') tile.classList.add('empty-note');
      tile.innerHTML = `
        <div class="bead" style="background:${c.hex}"></div>
        <div class="tile-code">${esc(code)}${amb ? '?' : ''}</div>`;
      if (amb) tile.title = `注意：数据源中 ${code} 对应多个颜色（${conflicts.map(color => color.hex).join(' / ')}），请以实物核对\n点击加入/移出 · Shift+点击连选`;
      else tile.title = `${state.brand} ${code} · ${c.hex}\n点击加入/移出 · Shift+点击连选`;
      tile.addEventListener('click', e => {
        if (e.shiftKey && lastClickKey) {
          // 连选：把锚点与当前块之间的所有颜色加入色板
          const keys = [...lib.querySelectorAll('.tile')].map(t => t.dataset.key);
          const i1 = keys.indexOf(lastClickKey), i2 = keys.indexOf(c.hex);
          if (i1 >= 0 && i2 >= 0) {
            const range = keys.slice(Math.min(i1, i2), Math.max(i1, i2) + 1);
            const n = updatePalette(range, true);
            toast(n ? `已加入 ${n} 个颜色` : '所选颜色都已在色板中');
            lastClickKey = c.hex;
            renderLibrary();
            updateCount();
            lib.querySelector(`[data-key="${c.hex}"]`)?.focus();
            return;
          }
        }
        lastClickKey = c.hex;
        const added = !state.palette.has(c.hex);
        updatePalette([c.hex], added);
        if (state.onlySel) {
          const index = [...lib.querySelectorAll('.tile')].indexOf(tile);
          renderLibrary(); // 只看已选：移出的色块要从视图消失
          const remaining = [...lib.querySelectorAll('.tile')];
          (remaining[Math.min(index, remaining.length - 1)] || $('#only-sel')).focus();
        } else {
          tile.classList.toggle('added', added);
          tile.setAttribute('aria-pressed', String(added));
          if (added) { tile.classList.remove('pop'); void tile.offsetWidth; tile.classList.add('pop'); }
          updateSelBtn?.(); // 同步所在组的全选按钮状态
        }
        updateCount();
      });
      tile.addEventListener('keydown', e => {
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) return;
        e.preventDefault();
        const tiles = [...lib.querySelectorAll('.tile')];
        const i = tiles.indexOf(tile);
        const cols = getComputedStyle(lib).gridTemplateColumns.split(' ').length;
        const next = e.key === 'Home' ? 0 : e.key === 'End' ? tiles.length - 1 :
          Math.max(0, Math.min(tiles.length - 1, i + ({ ArrowLeft: -1, ArrowRight: 1, ArrowUp: -cols, ArrowDown: cols }[e.key] || 0)));
        tile.tabIndex = -1; tiles[next].tabIndex = 0; tiles[next].focus();
      });
      tile.addEventListener('focus', () => {
        for (const other of lib.querySelectorAll('.tile[tabindex="0"]')) other.tabIndex = -1;
        tile.tabIndex = 0;
      });
      tile.dataset.key = c.hex;
      frag.appendChild(tile);
    }
  }
  lib.appendChild(frag);
  lib.appendChild(attribution);
  rail.classList.toggle('hidden', state.view !== 'lib' || groups.size <= 1);
  updateRail();
}

// ── 顶栏计数 ──
function updateCount() {
  $('#sel-count').textContent = state.palette.size;
  $('#open-export').disabled = !state.palette.size;
  $('#deselect-all').disabled = !state.palette.size;
  $('#select-all').disabled = state.palette.size === BEAD_DATA.length;
}

// 文件生成使用点击时的品牌、排序和已选颜色。
function downloadPalette(content, type, filename, count) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = el('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast(`已导出 ${count} 色`);
}

// ── 候选 → 核对列表 ──
let candidates = []; // 有效条目直接携带 HEX，核对期间使用当前品牌。
function buildReview() {
  const seen = new Set();
  candidates = candidates.filter(c => {
    const k = c.hex ? `hex:${c.hex}` : `issue:${c.code}:${c.issue || ''}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const list = $('#review-list');
  const previousScroll = list.scrollTop;
  list.innerHTML = '';
  const validItems = candidates.filter(c => c.hex);
  const invalidItems = candidates.filter(c => !c.hex);

  function removeButton(c) {
    const rm = el('button', 'rv-remove', '✕');
    rm.type = 'button';
    rm.title = '移除这条';
    rm.setAttribute('aria-label', `移除 ${c.code}`);
    rm.addEventListener('click', () => {
      candidates = candidates.filter(x => x !== c);
      buildReview();
      $('#review-list').focus();
    });
    return rm;
  }

  if (invalidItems.length) {
    const section = el('section', 'review-section review-issues');
    section.appendChild(el('h4', 'review-section-title', `需要处理 <span>${invalidItems.length}</span>`));
    for (const c of invalidItems) {
      const row = el('div', 'rv-row invalid');
      const ambNote = c.issue || (c.ambiguous ? '色号对应多个颜色，请在全库核对' : c.unparsed ? '未解析，请返回修改' : '色号不存在');
      row.innerHTML = `<div class="rv-code">${esc(c.code)}${c.ambiguous ? '?' : ''}</div><div class="rv-status">${esc(ambNote)}</div>`;
      if (!c.ambiguous && !c.unparsed) {
        const sugs = el('div', 'rv-sugs');
        for (const suggestion of suggest(c.code, state.brand)) {
          const { hex: shex, code } = resolveCode(state.brand, suggestion);
          const chip = el('button', 'rv-sug', `<i class="mini-swatch" style="background:${shex}"></i>${esc(code)}`);
          chip.title = `替换为 ${code}（${shex}）`;
          chip.addEventListener('click', () => {
            c.code = code;
            c.hex = shex;
            buildReview();
            $('#review-list').focus();
          });
          sugs.appendChild(chip);
        }
        row.appendChild(sugs);
      }
      row.appendChild(removeButton(c));
      section.appendChild(row);
    }
    list.appendChild(section);
  }

  if (validItems.length) {
    const section = el('section', 'review-section');
    section.appendChild(el('h4', 'review-section-title', `有效色 <span>${validItems.length}</span>`));
    const grid = el('div', 'review-grid');
    for (const c of validItems) {
      const hex = c.hex;
      const inPal = state.palette.has(hex);
      const card = el('div', 'review-tile' + (inPal ? ' in-palette' : ''));
      card.innerHTML = `<span class="rv-swatch" style="background:${hex}" aria-hidden="true"></span><span class="review-code">${esc(c.code)}</span>${inPal ? '<span class="review-existing">已加入</span>' : ''}`;
      card.title = `${c.code} · ${hex}${inPal ? ' · 已在色板中' : ''}`;
      card.appendChild(removeButton(c));
      grid.appendChild(card);
    }
    section.appendChild(grid);
    list.appendChild(section);
  }
  if (!candidates.length) list.appendChild(el('p', 'review-empty', '没有待加入的颜色，请返回修改。'));
  list.scrollTop = previousScroll;
  $('#review-stat').innerHTML = `有效 <b class="ok">${validItems.length}</b> / 待处理 <b class="bad">${invalidItems.length}</b>`;
  const newCount = validItems.filter(c => !state.palette.has(c.hex)).length;
  $('#review-add').textContent = `${invalidItems.length ? '仅加入有效色' : '加入色板'}（${newCount}）`;
  $('#review-add').disabled = newCount === 0;
  $('#review').classList.remove('hidden');
  $('#tab-import').classList.add('hidden');
  $('#modal').classList.add('reviewing');
}

// ── 给 Agent 的提示词 ──
// 只要求返回色号（品牌由用户在工具中确认；要求越简单，AI 遵循度越高）；
// 保留标签排版（矩阵按行列换行），方便用户对照原图逐位核对
function agentPrompt() {
  return [
    '请识别这些拼豆色卡标签照片中的所有色号。',
    '注意：标签可能是旋转的，请先转正再识别；只认印在彩色六边形色块里的色号，忽略其他文字。',
    '色号按标签原样输出（数字前不补 0，如 C2 而非 C02）。',
    '输出时保留标签上的排版：如果色号是矩阵/行列排列，每行对应标签上的一行，行内色号用逗号分隔；不要附加任何其他文字。',
  ].join('\n');
}

// ── 事件绑定 ──
function bind() {
  // 品牌选择（下拉，低频设置）
  const sel = $('#brand-sel');
  for (const b of BRANDS) {
    const opt = el('option', '', esc(b));
    opt.value = b;
    sel.appendChild(opt);
  }
  sel.value = state.brand;
  sel.addEventListener('change', () => {
    state.brand = sel.value;
    lastClickKey = null;
    searchBox.value = '';
    state.search = '';
    searchWrap.classList.remove('open');
    if (!modal.classList.contains('hidden')) closeModal();
    $('#paste-brand').textContent = state.brand;
    saveItem('beadpal.brand', state.brand);
    renderLibrary();
    updateCount();
    toast(state.palette.size ? `已切换到 ${state.brand}，保留 ${state.palette.size} 个已选颜色` : `已切换到 ${state.brand}`);
  });
  // 视图排序（下拉）
  $('#view-sel').value = state.view;
  $('#view-sel').addEventListener('change', e => {
    state.view = e.target.value;
    lastClickKey = null;
    renderLibrary();
  });
  // 只看已选（底部 dock）
  $('#only-sel').addEventListener('click', () => {
    state.onlySel = !state.onlySel;
    $('#only-sel').classList.toggle('on', state.onlySel);
    $('#only-sel').setAttribute('aria-pressed', String(state.onlySel));
    renderLibrary();
  });
  // 搜索：图标原地展开为输入框，失焦/Esc 收起还原
  const searchBox = $('#search');
  const searchWrap = $('#search-wrap');
  const closeSearch = () => {
    searchBox.value = '';
    state.search = '';
    searchWrap.classList.remove('open');
    renderLibrary();
  };
  $('#search-toggle').addEventListener('click', () => {
    searchWrap.classList.add('open');
    searchBox.focus();
  });
  searchBox.addEventListener('blur', () => {
    if (!searchBox.value.trim()) searchWrap.classList.remove('open');
  });
  searchBox.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeSearch(); searchBox.blur(); }
  });
  searchBox.addEventListener('input', e => {
    state.search = e.target.value;
    renderLibrary();
  });
  searchBox.addEventListener('keydown', e => {
    if (e.key === 'Enter' && searchTokens().length) {
      e.preventDefault();
      addExactSearch();
    }
  });
  $('#library').addEventListener('scroll', updateRail, { passive: true });
  // 导出 / 清空
  const exportControl = $('#export-control');
  const exportMenu = $('#export-menu');
  const exportButton = $('#open-export');
  const closeExport = (restoreFocus = false) => {
    exportMenu.classList.add('hidden');
    exportButton.setAttribute('aria-expanded', 'false');
    if (restoreFocus) exportButton.focus();
  };
  exportButton.addEventListener('click', () => {
    if (!exportMenu.classList.contains('hidden')) { closeExport(); return; }
    exportMenu.classList.remove('hidden');
    exportButton.setAttribute('aria-expanded', 'true');
    $('#export-gpl').focus();
  });
  document.addEventListener('click', e => { if (!exportControl.contains(e.target)) closeExport(); });
  document.addEventListener('focusin', e => { if (!exportControl.contains(e.target)) closeExport(); });
  exportControl.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !exportMenu.classList.contains('hidden')) {
      e.preventDefault(); closeExport(true);
    }
  });
  $('#export-gpl').addEventListener('click', () => {
    closeExport(true);
    try {
      const snapshot = paletteForExport(state.brand, state.view, state.palette);
      const count = snapshot.colors.length;
      downloadPalette(makeGpl(snapshot), 'text/plain', `${snapshot.brand}-${count}.gpl`, count);
    } catch (error) { console.error(error); toast('导出失败，请重试'); }
  });
  $('#export-xlsx').addEventListener('click', async () => {
    const button = $('#export-xlsx');
    button.disabled = true;
    closeExport(true);
    try {
      const snapshot = paletteForExport(state.brand, state.view, state.palette);
      const count = snapshot.colors.length;
      const bytes = await makeExcel(snapshot, ExcelJS).xlsx.writeBuffer();
      downloadPalette(bytes, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', `${snapshot.brand}-${count}.xlsx`, count);
    }
    catch (error) { console.error(error); toast('Excel 导出失败，请重试'); }
    finally { button.disabled = false; }
  });
  // 全选 / 全不选始终作用于整个色库，不受搜索和视图过滤影响。
  $('#select-all').addEventListener('click', () => {
    const added = updatePalette(HEX_MAP.keys(), true);
    updateCount();
    renderLibrary();
    toast(`已将全库加入色板，新增 ${added} 色`);
  });
  $('#deselect-all').addEventListener('click', () => {
    const removed = updatePalette(state.palette, false);
    lastClickKey = null;
    updateCount();
    renderLibrary();
    toast(`已移出全部 ${removed} 色`);
  });
  // 弹窗
  const modal = $('#modal');
  let importRequest = 0;
  let reviewSource = 'paste';
  const showImport = () => {
    importRequest++;
    candidates = [];
    $('#review').classList.add('hidden');
    $('#tab-import').classList.remove('hidden');
    modal.classList.remove('reviewing');
  };
  const closeModal = () => {
    modal.classList.add('hidden');
    showImport();
    $('#open-import').focus();
  };
  $('#open-import').addEventListener('click', () => {
    modal.classList.remove('hidden');
    showImport();
    $('#modal-close').focus();
  });
  $('#modal-close').addEventListener('click', closeModal);
  modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
  modal.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.preventDefault(); closeModal(); return; }
    if (e.key !== 'Tab') return;
    const focusable = [...modal.querySelectorAll('button:not(:disabled), textarea, summary, input, select, [tabindex]:not([tabindex="-1"])')]
      .filter(node => node.getClientRects().length);
    if (!focusable.length) return;
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
  $('#review-cancel').addEventListener('click', () => { showImport(); (reviewSource === 'gpl' ? $('#choose-gpl') : $('#paste-area')).focus(); });
  // 提示词复制
  $('#copy-prompt').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(agentPrompt());
      toast('提示词已复制，粘贴给 AI 助手即可');
    } catch (e) {
      // file:// 下可能被拒绝，退化为选中文本
      $('.prompt-details').open = true;
      const r = document.createRange();
      r.selectNodeContents($('#agent-prompt'));
      const sel = getSelection();
      sel.removeAllRanges(); sel.addRange(r);
      toast('已选中提示词，请手动复制');
    }
  });
  const showReview = (items, source) => {
    candidates = items;
    reviewSource = source;
    const label = source === 'gpl' ? '校验 GPL 色板' : '校验识别结果';
    $('#review-heading').textContent = `${label} · ${state.brand}`;
    buildReview();
    $('#review-cancel').focus();
  };
  $('#choose-gpl').addEventListener('click', () => $('#gpl-file').click());
  $('#gpl-file').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';
    const request = ++importRequest;
    const brand = state.brand;
    try {
      const content = await file.text();
      if (request !== importRequest) return;
      showReview(parseGpl(content, brand), 'gpl');
    } catch (error) {
      if (request === importRequest) toast(error.message || '读取 GPL 文件失败，请重试');
    }
  });
  $('#parse-paste').addEventListener('click', () => {
    importRequest++;
    const text = $('#paste-area').value.trim();
    if (!text) return toast('请先粘贴内容');
    try {
      const items = parsePaste(text, state.brand);
      if (!items.length) return toast('没有解析出色号');
      showReview(items, 'paste');
    } catch (error) {
      toast(error.message || '解析失败，请检查粘贴内容');
    }
  });
  $('#review-add').addEventListener('click', () => {
    const n = updatePalette(candidates.map(c => c.hex), true);
    closeModal();
    updateCount();
    renderLibrary();
    toast(n ? `已加入 ${n} 个颜色` : '所选颜色都已在色板中');
  });
}

bind();
$('#agent-prompt').textContent = agentPrompt();
$('#paste-brand').textContent = state.brand;
renderLibrary();
updateCount();
