export interface AspectRelation {
 kind: 'perfective' | 'imperfective';
 word: string;
 sourceUrl?: string;
 path?: string;
}
export const aspectLabel = (kind: AspectRelation['kind']): string => kind === 'perfective' ? 'aspekt dokonany od:' : 'aspekt niedokonany od:';
export function aspectMarkdown(relations: AspectRelation[]): string {
 return relations.map(relation => {
  const label = relation.word.replace(/[\\[\]]/g, '\\$&');
  const href = relation.path ? relation.path.split('/').map(encodeURIComponent).join('/') : relation.sourceUrl || `https://pl.wiktionary.org/wiki/${encodeURIComponent(relation.word)}`;
  return `*${aspectLabel(relation.kind)}* [${label}](${href})`;
 }).join('\n\n');
}
export function parseAspect(markdown: string): AspectRelation[] {
 const result: AspectRelation[] = [];
 const pattern = /\*aspekt (dokonany|niedokonany) od:\* \[((?:\\.|[^\]])+)\]\(([^)]+)\)/g;
 for (const match of markdown.matchAll(pattern)) {
  const relation: AspectRelation = { kind: match[1] === 'dokonany' ? 'perfective' : 'imperfective', word: match[2].replace(/\\([\\[\]])/g, '$1') };
  if (/^https?:\/\//i.test(match[3])) relation.sourceUrl = match[3];
  else { relation.sourceUrl = `https://pl.wiktionary.org/wiki/${encodeURIComponent(relation.word)}`; try { relation.path = decodeURIComponent(match[3]); } catch { relation.path = match[3]; } }
  result.push(relation);
 }
 return result;
}

/** Backward-compatible reading of source grammar already stored by earlier versions. */
export function aspectsFromGrammar(markdown: string, word: string): AspectRelation[] {
 const result: AspectRelation[] = [];
 for (const paragraph of markdown.split(/\n\s*\n/)) {
  if (!paragraph.includes('czasownik') || paragraph.includes('zwrotny') !== / się$/.test(word)) continue;
  const label = paragraph.replace(/[_*]/g, '');
  const kind = /\bniedokonany\b/.test(label) ? 'imperfective' : /\bdokonany\b/.test(label) ? 'perfective' : undefined;
  if (!kind) continue;
  const marker = kind === 'perfective' ? /\[ndk\.\]\([^)]+\)/ : /\[dk\.\]\([^)]+\)/;
  const match = marker.exec(paragraph); if (!match) continue;
  for (const link of paragraph.slice(match.index + match[0].length).matchAll(/\[([^\]]+)\]\((https:\/\/pl\.wiktionary\.org\/wiki\/[^\s)"#]+)/g)) {
   let partner: string; try { partner = decodeURIComponent(link[2].split('/wiki/')[1]).replace(/_/g, ' '); } catch { continue; }
   if (partner.includes(':') || partner === word || result.some(value => value.word === partner)) continue;
   result.push({ kind, word: partner, sourceUrl: link[2] });
  }
 }
 return result;
}
