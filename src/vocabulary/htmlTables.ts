/** Flatten merged source cells into readable, portable Markdown tables. */
export function tableMarkdown(table: HTMLTableElement): string {
 const rows = [...table.rows].filter(row => row.closest('table') === table && !row.querySelector('table'));
 if (!rows.length) return '';
 const headerRows = rows.filter(row => [...row.cells].every(cell => cell.tagName === 'TH'));
 const width = Math.min(16, Math.max(...rows.map(row => row.cells.length), ...headerRows.map(row => [...row.cells].reduce((n, cell) => n + Math.min(16, cell.colSpan), 0))));
 const grid: string[][] = [];
 rows.forEach((row, y) => {
  grid[y] ||= []; let x = 0;
  for (const cell of [...row.cells]) {
   while (grid[y][x] !== undefined) x++;
   const copy = cell.cloneNode(true) as HTMLElement;
   copy.querySelectorAll('br').forEach(br => br.replaceWith(document.createTextNode(' / ')));
   const text = (copy.textContent || '').replace(/\s+/g, ' ').trim().replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/([*_`<>])/g, '\\$1');
   for (let yy = y; yy < Math.min(rows.length, y + cell.rowSpan); yy++) {
    grid[yy] ||= [];
    for (let xx = x; xx < Math.min(width, x + cell.colSpan); xx++) grid[yy][xx] = text;
   }
   x += cell.colSpan;
  }
 });
 let count = 0;
 while (count < rows.length && [...rows[count].cells].every(cell => cell.tagName === 'TH') && rows[count].cells.length > 1) count++;
 const header = count ? Array.from({length: width}, (_, col) => [...new Set(grid.slice(0, count).map(row => row[col]).filter(Boolean))].join(' · ')) : width === 8 ? ['Forma','Rodzaj','ja','ty','on / ona / ono','my','wy','oni / one'] : Array.from({length: width}, (_, i) => i ? `Forma ${i}` : 'Forma');
 const line = (cells: string[]) => '| ' + Array.from({length: width}, (_, i) => cells[i] || '').join(' | ') + ' |';
 return [line(header), line(header.map(() => '---')), ...grid.slice(count).map(line)].join('\n');
}
