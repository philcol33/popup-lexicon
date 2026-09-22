import { tableMarkdown } from './htmlTables';
import { htmlToMarkdown, sanitizeHTMLToDom } from 'obsidian';
import type { DictionaryResult, LangSection } from '../dictionary';
import type { PopupLexiconSettings } from '../settings';
import type { DictionaryEntry } from './types';

function markdown(html: string, edition: string, word: string): string {
	const fragment = sanitizeHTMLToDom(html);
	fragment.querySelectorAll('a').forEach(a => {
		const href = a.getAttribute('href') || '';
		if (href.startsWith('//')) a.setAttribute('href', `https:${href}`);
		else if (href.startsWith('#')) a.setAttribute('href', `https://${edition}.wiktionary.org/wiki/${encodeURIComponent(word)}${href}`);
		else if (href.startsWith('./')) a.setAttribute('href', `https://${edition}.wiktionary.org/wiki/${href.slice(2)}`);
		else if (href.startsWith('/')) a.setAttribute('href', `https://${edition}.wiktionary.org${href}`);
	});
	const tables: string[] = [];
	for (const table of [...fragment.querySelectorAll('table')].filter(table => !table.parentElement?.closest('table'))) {
		const value = [table, ...table.querySelectorAll('table')].map(tableMarkdown).filter(Boolean).join('\n\n');
		const token = `LEXICONTABLEPLACEHOLDER${tables.length}END`;
		tables.push(value); const p = document.createElement('p'); p.textContent = token; table.replaceWith(p);
	}
	return htmlToMarkdown(fragment).trim().replace(/LEXICONTABLEPLACEHOLDER(\d+)END/g, (_, index) => '\n\n' + tables[Number(index)] + '\n\n').replace(/\n{3,}/g, '\n\n').trim();
}
export function fromWiktionary(result: DictionaryResult, language: LangSection): DictionaryEntry {
	const convert = (value?: string) => value ? markdown(value, language.edition || result.edition, result.word) : undefined;
	return {
		grammar: convert(language.grammar), conjugation: convert(language.conjugation), inflection: convert(language.inflection),
		usageNotes: convert(language.usageNotes), usageExamples: language.usageExamples?.map(value => convert(value)!),
		word: result.word, pronunciation: language.pronunciation,
		etymology: language.etymology ? markdown(language.etymology, language.edition || result.edition, result.word) : undefined,
		definitionLanguage: language.definitionLanguage, contentKind: language.contentKind, unavailable: language.unavailable, needsLookup: language.needsLookup,
		languageCode: language.code, languageName: language.name,
		partsOfSpeech: language.entries.map(entry => ({
			type: entry.partOfSpeech || 'Definition',
			meanings: entry.definitions.map(def => ({
				definition: markdown(def.html, language.edition || result.edition, result.word),
				examples: def.examples.map(ex => markdown(ex, language.edition || result.edition, result.word))
			}))
		})),
		source: { provider: 'Wiktionary', url: language.sourceUrl || result.url, license: 'CC BY-SA 4.0' }
	};
}
export function forSaving(entry: DictionaryEntry, settings: PopupLexiconSettings): DictionaryEntry {
	return {
		...entry,
		usageExamples: settings.saveExamples ? entry.usageExamples : undefined,
		pronunciation: settings.savePronunciation ? entry.pronunciation : undefined,
		phonetics: settings.savePronunciation ? entry.phonetics : undefined,
		etymology: settings.saveEtymology ? entry.etymology : undefined,
		partsOfSpeech: entry.partsOfSpeech.map(part => ({ ...part,
			meanings: (settings.saveAllDefinitions ? part.meanings : part.meanings.slice(0, 1))
				.map(m => ({ ...m, examples: settings.saveExamples ? m.examples : undefined }))
		}))
	};
}
