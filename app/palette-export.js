'use strict';

function makeGpl({ brand, colors }) {
  const lines = ['GIMP Palette', `Name: ${brand} ${colors.length}色`, 'Columns: 8', '#'];
  for (const color of colors) {
    const hex = color.hex;
    const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    const code = displayCode(color[brand]);
    lines.push(`${String(r).padStart(3)} ${String(g).padStart(3)} ${String(b).padStart(3)}\t${code === '—' ? hex : code}`);
  }
  return lines.join('\n') + '\n';
}

function makeExcel({ brand, colors }, excel) {
  const workbook = new excel.Workbook();
  const preview = workbook.addWorksheet('预览表', { views: [{ state: 'frozen', ySplit: 1, showGridLines: false }] });
  const groups = groupBySeries(colors, brand);
  let column = 1;
  for (const [series, items] of groups) {
    preview.getColumn(column).width = 12;
    const header = preview.getCell(1, column);
    header.value = series ?? '—';
    header.font = { bold: true, color: { argb: 'FF333333' } };
    header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F0F0' } };
    header.alignment = { horizontal: 'center', vertical: 'middle' };
    items.forEach((color, index) => {
      const cell = preview.getCell(index + 2, column);
      const channels = [1, 3, 5].map(i => parseInt(color.hex.slice(i, i + 2), 16) / 255)
        .map(c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
      const luminance = .2126 * channels[0] + .7152 * channels[1] + .0722 * channels[2];
      cell.value = displayCode(color[brand]);
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + color.hex.slice(1) } };
      cell.font = { color: { argb: luminance > .179 ? 'FF000000' : 'FFFFFFFF' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = { top: { style: 'thin', color: { argb: 'FFD6D6D6' } }, left: { style: 'thin', color: { argb: 'FFD6D6D6' } }, bottom: { style: 'thin', color: { argb: 'FFD6D6D6' } }, right: { style: 'thin', color: { argb: 'FFD6D6D6' } } };
      preview.getRow(index + 2).height = 28;
    });
    column++;
  }
  preview.getRow(1).height = 24;
  // 隐藏色卡右侧的工作表空列。ExcelJS 会将相邻的隐藏列合并成一个范围。
  const excelColumnLimit = 16_384;
  for (; column <= excelColumnLimit; column++) {
    const unused = preview.getColumn(column);
    unused.width = 12;
    unused.hidden = true;
  }

  const sheet = workbook.addWorksheet('详细数据表', { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.columns = [
    { header: '色样', key: 'swatch', width: 9 },
    { header: '色系', key: 'series', width: 12 },
    { header: '色号', key: 'code', width: 12 },
    { header: 'HEX', key: 'hex', width: 14 },
    { header: '备注', key: 'notes', width: 32 },
  ];
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).height = 24;
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.columns.length } };
  for (const color of colors) {
    const code = color[brand];
    const notes = !code || code === '-' ? '无色号' : codeMatches(brand, code).length > 1 ? '色号有歧义，请核对' : '';
    const row = sheet.addRow({
      swatch: '', series: seriesKey(code) || '—', code: displayCode(color[brand]), hex: color.hex, notes,
    });
    row.height = 21;
    row.getCell('swatch').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + color.hex.slice(1) } };
    row.getCell('notes').alignment = { wrapText: true, vertical: 'middle' };
  }
  return workbook;
}
