import type { DictionaryEntry } from './types';
import { normalizeWord } from './types';
import { germanNounPhrase } from '../lookup/wordForms';

const plain = (value: string): string => value.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/<[^>]+>/g, ' ').replace(/[*_`]/g, '').replace(/\s+/g, ' ').trim();
/** Rebuild form keys from the authoritative Markdown tables, never examples or prose. */
export function entryForms(entry: DictionaryEntry): string[] {
 const forms = new Set<string>(entry.aliases || []);
 for (const markdown of [entry.conjugation, entry.inflection]) {
  if (!markdown) continue;
  let columns = 0, verb = false;
  for (const line of markdown.split('\n')) {
   if (!line.trim().startsWith('|')) { columns = 0; continue; }
   const cells = line.trim().slice(1).replace(/\|$/, '').split(/(?<!\\)\|/).map(plain);
   if (!columns) { columns = cells.length; verb = columns === 8; continue; }
   if (cells.every(cell => /^:?-+:?$/.test(cell)) || new Set(cells).size === 1) continue;
   const firstForm = verb ? 2 : 1;
   for (const cell of cells.slice(firstForm)) for (let form of cell.split(/\s*[,/;]\s*/)) {
    form = form.replace(/\s*\[[^\]]*\]/g, '').trim();
    if (!form || !/^[\p{L}\p{M}\s'-]+$/u.test(form) || form.length > 80) continue;
    forms.add(form);
    if (entry.languageCode === 'de') { const bare = germanNounPhrase(form); if (bare) forms.add(bare); }
   }
  }
 }
 return [...forms];
}
export function matchesEntryForm(entry: DictionaryEntry, query: string): boolean {
 const key = normalizeWord(query);
 const bare = entry.languageCode === 'de' ? germanNounPhrase(query) : undefined;
 return [entry.word, ...entryForms(entry)].some(form => normalizeWord(form) === key || (bare && normalizeWord(form) === normalizeWord(bare)));
}
