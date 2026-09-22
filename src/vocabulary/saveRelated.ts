import { entryKey, type DictionaryEntry, type SavedEntry } from './types';
import type { VocabularyStore } from './vocabularyStore';
import type { AspectRelation } from './aspect';

/** Save only directly documented partners; no recursive dictionary expansion. */
export async function saveWithAspectPartners(store: VocabularyStore, entry: DictionaryEntry, lookup: (word: string) => Promise<DictionaryEntry>): Promise<{saved: SavedEntry; created: boolean; warnings: string[]}> {
 const result = await store.save(entry);
 const relations = entry.aspects || result.saved.entry.aspects || [];
 const warnings: string[] = [];
 const linked: AspectRelation[] = [];
 for (const relation of relations) {
  if (relation.word === entry.word || entry.languageCode !== 'pl') continue;
  try {
   let partner = await store.find({ ...entry, word: relation.word });
   if (!partner) {
    const loaded = await lookup(relation.word);
    if (loaded.unavailable || loaded.needsLookup || loaded.languageCode !== 'pl' || entryKey(loaded) === entryKey(entry)) throw Error(loaded.unavailable || 'Partner entry could not be loaded.');
    partner = (await store.save(loaded)).saved;
   }
   await store.linkAspects(partner.path, [{kind:relation.kind === 'perfective' ? 'imperfective' : 'perfective',word:entry.word,sourceUrl:entry.source?.url,path:result.saved.path}]);
   linked.push({ ...relation, path: partner.path });
  } catch (error) { warnings.push(`${relation.word}: ${error instanceof Error ? error.message : 'Could not save partner.'}`); linked.push(relation); }
 }
 if (linked.length) await store.linkAspects(result.saved.path, linked);
 return {...result,saved:await store.read(result.saved.path) || result.saved,warnings};
}
