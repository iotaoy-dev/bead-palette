const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');
const ExcelJS = require('../app/vendor/exceljs.min.js');

const browserScripts = ['data.js', 'palette.js', 'palette-export.js']
  .map(name => readFileSync(join(__dirname, '../app', name), 'utf8'))
  .join('\n');
const context = vm.createContext();
vm.runInContext(browserScripts, context);
const run = source => vm.runInContext(source, context);

test('旧存档保留有效 HEX，错误品牌和坏数据回退到默认值', () => {
  const load = (brand, palette) => run('readPaletteState')(key =>
    key === 'beadpal.brand' ? brand : palette);
  const restored = load('COCO', '["#FAF4C8","#FAF4C8","#123456",null]');
  assert.equal(restored.brand, 'COCO');
  assert.deepEqual([...restored.palette], ['#FAF4C8']);
  for (const corrupt of ['[', 'null', '{}']) {
    const state = load('OLD', corrupt);
    assert.equal(state.brand, 'MARD');
    assert.equal(state.palette.size, 0);
  }
  assert.equal(run('readPaletteState(() => { throw new Error("unavailable"); })').palette.size, 0);
});

test('色号按当前品牌解释，支持补零、纯数字与歧义', () => {
  const resolve = run('resolveCode');
  assert.equal(resolve('MARD', ' a01 ').hex, '#FAF4C8');
  assert.equal(resolve('COCO', 'E1').hex, '#FFFFD5');
  assert.equal(resolve('盼盼', '65').hex, '#FAF4C8');
  assert.equal(resolve('漫漫', 'S04').ambiguous, true);
  assert.equal(resolve('漫漫', 'S04').hex, undefined);
});

test('粘贴接受当前品牌标签，拒绝带其他品牌的整个批次', () => {
  const parse = run('parsePaste');
  assert.deepEqual(Array.from(parse('mard A1，A02', 'MARD'), row => row.hex), ['#FAF4C8', '#FFFFD5']);
  assert.equal(parse('[{"品牌":"盼盼","色号":65}]', '盼盼')[0].hex, '#FAF4C8');
  assert.equal(parse('["S04"]', '漫漫')[0].ambiguous, true);
  for (const input of ['MARD A1, COCO E1', 'COCOE1', 'COCO\nE1', '{"brand":"COCO","codes":["E1"]}', '[{"brand":"COCO","code":"E1"}]']) {
    assert.throws(() => parse(input, 'MARD'), /当前为 MARD.*COCO/);
  }
});

test('切换品牌保留已选 HEX，两种导出采用新品牌色号', async () => {
  const snapshot = run('paletteForExport');
  const gpl = run('makeGpl');
  const parse = run('parseGpl');
  const makeExcel = run('makeExcel');
  const selection = new Set(['#FAF4C8', '#FFFFD5']);
  for (const [brand, expected] of [
    ['MARD', ['A1', 'A2']],
    ['COCO', ['E1', 'E2']],
    ['盼盼', ['2', '65']],
  ]) {
    const data = snapshot(brand, 'lib', selection);
    const text = gpl(data);
    assert.match(text, new RegExp(`Name: ${brand} 2色`));
    assert.deepEqual(Array.from(parse(text, brand), row => row.code), expected);
    assert.deepEqual(new Set(Array.from(parse(text, brand), row => row.hex)), selection);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await makeExcel(data, ExcelJS).xlsx.writeBuffer());
    assert.deepEqual(workbook.worksheets.map(sheet => sheet.name), ['预览表', '详细数据表']);
    const [preview, detail] = workbook.worksheets;
    assert.deepEqual(detail.getRow(1).values.slice(1), ['色样', '色系', '色号', 'HEX', '备注']);
    assert.deepEqual([detail.getCell('C2').value, detail.getCell('C3').value], expected);
    assert.equal(preview.getCell('A2').value, expected[0]);
    assert.equal(preview.getCell('A2').fill.fgColor.argb, 'FF' + detail.getCell('D2').value.slice(1));
    assert.equal(preview.columnCount, 1);
    assert.equal(preview.getColumn('A').hidden, false);
    assert.equal(preview.getColumn('B').hidden, true);
    assert.equal(preview.getColumn('XFD').hidden, true);
    assert.equal(detail.getColumn('E').hidden, false);
  }
});

test('晚返回的 GPL 文件不覆盖新粘贴结果或已关闭的核对', async () => {
  const nodes = new Map();
  const node = selector => {
    if (!nodes.has(selector)) {
      nodes.set(selector, {
        handlers: new Map(),
        classList: new Set(['hidden']),
        addEventListener(event, callback) { this.handlers.set(event, callback); },
        appendChild() {},
        focus() {},
      });
      const classes = nodes.get(selector).classList;
      classes.remove = classes.delete.bind(classes);
      classes.contains = classes.has.bind(classes);
    }
    return nodes.get(selector);
  };
  const ui = vm.createContext({
    localStorage: { getItem: () => null },
    document: { querySelector: node, createElement: () => ({}), addEventListener() {} },
  });
  vm.runInContext(browserScripts, ui);
  const app = readFileSync(join(__dirname, '../app/app.js'), 'utf8');
  vm.runInContext(app.slice(0, app.lastIndexOf('\nbind();')) + '\nbuildReview = () => {}; bind();', ui);
  const trigger = (selector, event, data) => node(selector).handlers.get(event)(data);
  const pendingFile = () => {
    let finish;
    const read = new Promise(resolve => { finish = resolve; });
    const loading = trigger('#gpl-file', 'change', { target: { files: [{ text: () => read }] } });
    return async () => {
      finish('GIMP Palette\n255 255 213\tA2\n');
      await loading;
    };
  };

  trigger('#open-import', 'click');
  const finishFirst = pendingFile();
  node('#paste-area').value = 'A1';
  trigger('#parse-paste', 'click');
  await finishFirst();
  assert.equal(vm.runInContext('candidates[0].hex', ui), '#FAF4C8');

  const finishSecond = pendingFile();
  trigger('#modal-close', 'click');
  await finishSecond();
  assert.equal(vm.runInContext('candidates.length', ui), 0);
});
