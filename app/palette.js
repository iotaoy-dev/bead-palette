'use strict';

// 所有品牌共享 HEX 色库，品牌只决定色号的解释和显示。
const BRANDS = ['MARD', 'COCO', '漫漫', '盼盼', '咪小窝'];
const HEX_MAP = new Map(BEAD_DATA.map(color => [color.hex, color]));

function normalizeCode(code) {
  return String(code).trim().toUpperCase().replace(/^([A-Z]{0,2})0+(?=\d+$)/, '$1');
}

function displayCode(code) {
  return code && code !== '-' ? normalizeCode(code) : '—';
}

const CODE_INDEX = new Map(BRANDS.map(brand => {
  const codes = new Map();
  for (const color of BEAD_DATA) {
    const raw = color[brand];
    if (!raw || raw === '-') continue;
    const key = normalizeCode(raw);
    if (!codes.has(key)) codes.set(key, []);
    codes.get(key).push(color);
  }
  return [brand, codes];
}));

function codeMatches(brand, code) {
  return CODE_INDEX.get(brand)?.get(normalizeCode(code)) || [];
}

function resolveCode(brand, input) {
  const code = normalizeCode(input);
  const matches = codeMatches(brand, code);
  if (matches.length === 1) return { code, hex: matches[0].hex };
  if (matches.length > 1) return { code, ambiguous: true };
  return { code };
}

function readPaletteState(readItem) {
  const read = key => {
    try { return readItem(key); }
    catch { return null; }
  };
  const storedBrand = read('beadpal.brand');
  let storedPalette;
  try { storedPalette = JSON.parse(read('beadpal.palette')); }
  catch { storedPalette = null; }
  return {
    brand: BRANDS.includes(storedBrand) ? storedBrand : BRANDS[0],
    palette: new Set(Array.isArray(storedPalette) ? storedPalette.filter(hex => HEX_MAP.has(hex)) : []),
  };
}

function hexToHsl(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255, g = parseInt(hex.slice(3, 5), 16) / 255, b = parseInt(hex.slice(5, 7), 16) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn, s = l > .5 ? d / (2 - mx - mn) : d / (mx + mn);
  const h = mx === r ? ((g - b) / d + (g < b ? 6 : 0)) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

// ── 系列分组 ──
// 字母品牌按字母系列（A/B/…/IC/DH）；纯数字品牌按数量级（1-99/100+/200+）
function seriesKey(code) {
  if (!code || code === '-') return null;
  if (/^\d+$/.test(code)) {
    if (code.length <= 2) return '1-99';
    return code[0] + '00+';
  }
  return (code.match(/^[A-Z]+/) || ['?'])[0];
}
// 色号排序键：系列前缀 + 数字值（缺失排最后）
function codeSortKey(code) {
  if (!code || code === '-') return ['\uffff', 0];
  if (/^\d+$/.test(code)) return ['', parseInt(code, 10)];
  const m = code.match(/^([A-Z]+)(\d+)$/);
  return m ? [m[1], parseInt(m[2], 10)] : ['\ufffe', 0];
}

function orderedColors(brand, view) {
  const colors = [...BEAD_DATA];
  if (view === 'hue') {
    colors.sort((a, b) => {
      const [h1, s1, l1] = hexToHsl(a.hex), [h2, s2, l2] = hexToHsl(b.hex);
      return (s1 < .12 ? h1 + 9999 : h1) - (s2 < .12 ? h2 + 9999 : h2) || l1 - l2;
    });
  } else {
    colors.sort((a, b) => {
      const ka = codeSortKey(a[brand]), kb = codeSortKey(b[brand]);
      return ka[0].localeCompare(kb[0]) || ka[1] - kb[1];
    });
  }
  return colors;
}
function groupBySeries(colors, brand) {
  const groups = new Map();
  for (const color of colors) {
    const key = seriesKey(color[brand]);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(color);
  }
  return groups;
}

function paletteForExport(brand, view, palette) {
  return { brand, colors: orderedColors(brand, view).filter(color => palette.has(color.hex)) };
}

// ── 模糊建议 ──
const CONFUSE = { O: '0', Q: '0', D: '0', I: '1', L: '1', T: '7', B: '8', S: '5', Z: '2', G: '6', A: '4' };
function variants(token) {
  const out = new Set([token]);
  for (let i = 0; i < token.length; i++) {
    const alt = CONFUSE[token[i]];
    if (alt) for (const v of [...out]) out.add(v.slice(0, i) + alt + v.slice(i + 1));
  }
  return [...out];
}
function lev1Neighbors(token, codes) {
  const near = [];
  for (const c of codes) {
    if (Math.abs(c.length - token.length) > 1) continue;
    let d = 0, i = 0, j = 0;
    while (i < c.length && j < token.length && d <= 1) {
      if (c[i] === token[j]) { i++; j++; } else { d++; j++; if (i < c.length && c[i] === token[j]) i++; }
    }
    d += (c.length - i) + (token.length - j);
    if (d <= 1) near.push(c);
  }
  return near;
}
function suggest(token, brand) {
  const codes = new Set();
  for (const matches of CODE_INDEX.get(brand).values()) {
    if (matches.length === 1) codes.add(matches[0][brand]);
  }
  const found = new Set();
  for (const v of variants(token)) if (codes.has(v)) found.add(v);
  if (found.size < 3) for (const n of lev1Neighbors(token, codes)) found.add(n);
  return [...found].slice(0, 3);
}


// 普通文本允许当前品牌标签，发现外部品牌标签时拒绝整次导入。
const BRAND_LABEL = /\b(?:MARD|COCO)(?=\b|[A-Z]{0,2}\d)|漫漫|盼盼|咪小窝/gi;

function checkImportBrand(label, brand) {
  const declared = String(label).trim().toUpperCase();
  if (declared && declared !== brand) {
    throw new Error(`当前为 ${brand}，粘贴内容标注了 ${declared}。请核对品牌后再导入。`);
  }
}

function parsePaste(text, brand) {
  let json;
  try { json = JSON.parse(text); }
  catch { json = text; }
  checkImportBrand(json?.brand ?? json?.品牌 ?? '', brand);
  const entries = Array.isArray(json) ? json : json?.colors ?? json?.codes ?? [json];
  if (!Array.isArray(entries)) throw new Error('请粘贴色号列表');
  const found = [];
  for (const entry of entries) {
    if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
      checkImportBrand(entry.brand ?? entry.品牌 ?? '', brand);
    }
    const value = typeof entry === 'object' ? entry?.code ?? entry?.色号 : entry;
    if (typeof value !== 'string' && typeof value !== 'number') continue;
    const content = String(value).replace(BRAND_LABEL, label => {
      checkImportBrand(label, brand);
      return ' ';
    });
    for (const raw of content.split(/[\s,，、;；:：\[\]{}"'“”]+/).filter(Boolean)) {
      const token = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (token.length <= 5 && /\d/.test(token)) found.push(resolveCode(brand, token));
      else found.push({ code: raw, unparsed: true });
    }
  }
  return found;
}

// GPL 以 RGB 对照色库，色号名称由当前品牌决定。
function parseGpl(text, brand) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  if (lines.shift()?.trim() !== 'GIMP Palette') throw new Error('文件不是有效的 GPL 色板：缺少 GIMP Palette 标识');
  const found = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith('#') || /^(Name|Columns):/i.test(line)) continue;
    const m = line.match(/^(\d+)\s+(\d+)\s+(\d+)(?:\s+.*)?$/);
    if (!m || m.slice(1).some(x => Number(x) > 255)) {
      found.push({ code: `第 ${i + 2} 行`, unparsed: true, issue: '无法解析 RGB，请检查文件' });
      continue;
    }
    const hex = '#' + m.slice(1).map(x => Number(x).toString(16).padStart(2, '0')).join('').toUpperCase();
    const color = HEX_MAP.get(hex);
    if (!color) {
      found.push({ code: hex, unparsed: true, issue: '此颜色不在色库中' });
    } else {
      found.push({ code: displayCode(color[brand]), hex });
    }
  }
  if (!found.length) throw new Error('GPL 文件中没有颜色');
  return found;
}
