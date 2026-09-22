import type { AspectRelation } from './aspect';
export interface Meaning {
	/** Portable Markdown, not raw external HTML. */
	definition: string;
	examples?: string[];
	synonyms?: string[];
	antonyms?: string[];
}
export interface Encounter { sourcePath: string; context: string; date: string }
export interface DictionaryEntry {
	aspects?: AspectRelation[];
	/** Display-only query; identity is always word + languageCode. */
	lookupForm?: string;
	lookupLemma?: string;
	lemmaChoices?: string[];
	word: string;
	definitionLanguage?: string;
	contentKind?: 'definition' | 'translation';
	unavailable?: string;
	needsLookup?: boolean;
	languageCode: string;
	languageName: string;
	aliases?: string[];
	pronunciation?: string;
	phonetics?: string[];
	partsOfSpeech: { type: string; meanings: Meaning[] }[];
	/** HTML in lookup results; portable Markdown in saved entries. */
	grammar?: string;
	conjugation?: string;
	inflection?: string;
	usageExamples?: string[];
	usageNotes?: string;
	etymology?: string;
	source?: { provider: string; url?: string; license?: string };
	created?: string;
	encounters?: Encounter[];
}
export interface SavedEntry { path: string; entry: DictionaryEntry }
export const normalizeWord = (word: string): string => word.normalize('NFC').trim().toLocaleLowerCase();
export const entryKey = (entry: Pick<DictionaryEntry, 'word' | 'languageCode'>): string =>
	JSON.stringify([entry.languageCode.toLowerCase(), normalizeWord(entry.word)]);
