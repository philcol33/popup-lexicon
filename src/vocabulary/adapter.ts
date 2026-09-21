import { htmlToMarkdown, sanitizeHTMLToDom } from 'obsidian';
import type { DictionaryResult, LangSection } from '../dictionary';
import type { PopupLexiconSettings } from '../settings';
import type { DictionaryEntry } from './types';

function markdown(html: string, edition: string): string {
	const fragment = sanitizeHTMLToDom(html);
	fragment.querySelectorAll('a').forEach(a => {
		const href = a.getAttribute('href') || '';
		if (href.startsWith('./')) a.setAttribute('href', `https://${edition}.wiktionary.org/wiki/${href.slice(2)}`);
		else if (href.startsWith('/')) a.setAttribute('href', `https://${edition}.wiktionary.org${href}`);
	});
	return htmlToMarkdown(fragment).trim();
}
export function fromWiktionary(result: DictionaryResult, language: LangSection): DictionaryEntry {
	return {
		word: result.word, languageCode: language.code, languageName: language.name,
		partsOfSpeech: language.entries.map(entry => ({
			type: entry.partOfSpeech || 'Definition',
			meanings: entry.definitions.map(def => ({
				definition: markdown(def.html, result.edition),
				examples: def.examples.map(ex => markdown(ex, result.edition))
			}))
		})),
		source: { provider: 'Wiktionary', url: result.url, license: 'CC BY-SA 4.0' }
	};
}
export function forSaving(entry: DictionaryEntry, settings: PopupLexiconSettings): DictionaryEntry {
	return {
		...entry,
		pronunciation: settings.savePronunciation ? entry.pronunciation : undefined,
		phonetics: settings.savePronunciation ? entry.phonetics : undefined,
		etymology: settings.saveEtymology ? entry.etymology : undefined,
		partsOfSpeech: entry.partsOfSpeech.map(part => ({ ...part,
			meanings: (settings.saveAllDefinitions ? part.meanings : part.meanings.slice(0, 1))
				.map(m => ({ ...m, examples: settings.saveExamples ? m.examples : undefined }))
		}))
	};
}
