import { requestUrl, sanitizeHTMLToDom } from 'obsidian';
import type { Definition, Entry, LangSection } from '../dictionary';

interface ParsedPage { text: string; title: string }
const fold = (value: string): string => value.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase().trim();
export function languageLabel(code: string, locale = code): string {
	try {
		const DisplayNames = (Intl as unknown as { DisplayNames: new (locales: string[], options: { type: string }) => { of(code: string): string } }).DisplayNames;
		return new DisplayNames([locale], { type: 'language' }).of(code);
	} catch { return code; }
}
function clean(element: Element): HTMLElement {
	const clone = element.cloneNode(true) as HTMLElement;
	clone.querySelectorAll('script, style, link, img, audio, video, iframe, .mw-editsection, .reference, .mw-cite-backlink, .noprint').forEach(el => el.remove());
	return clone;
}
function html(element: Element): string { return clean(element).innerHTML.trim(); }
function heading(element: Element): HTMLElement | null {
	return (/^H[2-6]$/.test(element.tagName) ? element : element.querySelector(':scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6')) as HTMLElement | null;
}

/** Require a positively identified language section; never use another language's content. */
export function languageSection(pageHtml: string, code: string, name: string): HTMLElement | null {
	const root = document.createElement('div'); root.append(sanitizeHTMLToDom(pageHtml));
	const names = [languageLabel(code), name].map(fold);
	const candidates = [...root.querySelectorAll('h2')];
	const start = candidates.find(h => {
		const text = fold(clean(h).textContent || '');
		return [...h.querySelectorAll('[id], [lang]')].some(el => el.id === code || el.getAttribute('lang') === code) ||
			names.some(name => text === name || text.endsWith(`(${name})`));
	});
	if (!start) return null;
	const next = candidates[candidates.indexOf(start) + 1];
	const range = document.createRange();
	range.setStartAfter(start.closest('.mw-heading') || start);
	if (next) range.setEndBefore(next.closest('.mw-heading') || next); else range.setEndAfter(root.lastChild!);
	const section = document.createElement('div'); section.append(range.cloneContents());
	// A range ending at the page boundary may retain the parser-output wrapper.
	for (const wrapper of [...section.querySelectorAll(':scope > .mw-parser-output')]) wrapper.replaceWith(...wrapper.childNodes);
	section.querySelectorAll('script, style, link, img, audio, video, iframe, .mw-editsection, .reference, .mw-references-wrap, .references').forEach(el => el.remove());
	return section;
}
function pronunciation(section: HTMLElement): string | undefined {
	const value = section.querySelector('.IPA, .ipa, .API')?.textContent?.trim();
	return value?.replace(/^[\\/\[]+|[\\/\]]+$/g, '') || undefined;
}
function orderedDefinitions(list: Element): Definition[] {
	return [...list.children].filter(el => el.tagName === 'LI').map(li => {
		const examples = [...li.querySelectorAll(':scope > ul > li, :scope > dl > dd')].map(html).filter(Boolean);
		const copy = clean(li); copy.querySelectorAll(':scope > ul, :scope > dl').forEach(el => el.remove());
		return { html: copy.innerHTML.trim(), examples };
	}).filter(def => !!def.html);
}
const NON_DEFINITION = /^(etym|etim|pronon|pronun|aussprache|herkunft|synonym|antonym|anagram|referen|référen|references|quellen|tradu|übersetz|iwwersetz|vocabulaire|dériv|deriv|locuc|refran|informaci|véase|see also|related|further|熟語|発音|語源|字源|翻訳)/i;

/** Handles ordered senses and numbered definition lists; edition-specific labels are structural adapters, not a supported-language allow-list. */
export function parseNativePage(page: ParsedPage, language: LangSection): LangSection | null {
	const section = languageSection(page.text, language.code, language.name);
	if (!section) return null;
	const entries: Entry[] = [];
	let current: Entry | undefined, mode = '', etymology = '';
	const children = [...section.children];
	for (const element of children) {
		const h = heading(element);
		if (h) {
			const label = h.textContent?.trim() || '';
			mode = /^(étymologie|etymologie|etimología|etimologia|etymology|語源|字源)/i.test(label) ? 'etymology' : NON_DEFINITION.test(label) ? 'ignore' : 'definitions';
			current = mode === 'definitions' ? { partOfSpeech: label, definitions: [] } : undefined;
			if (current) entries.push(current);
			continue;
		}
		const label = (element.textContent || '').trim();
		// German Wiktionary uses bold paragraph labels instead of subsection headings.
		if (element.tagName === 'P' && /^(Bedeutungen|Beispiele|Herkunft|Synonyme|Gegenwörter|Oberbegriffe|Unterbegriffe|Wortbildungen|Referenzen|Worttrennung|Aussprache):/.test(label)) {
			mode = label.startsWith('Bedeutungen:') ? 'definitions' : label.startsWith('Beispiele:') ? 'examples' : label.startsWith('Herkunft:') ? 'etymology' : 'ignore';
			continue;
		}
		if (mode === 'etymology' && /^(P|DL)$/.test(element.tagName)) {
			if (!/manquante|incomplète|unbekannt/i.test(label)) etymology += (etymology ? '<br>' : '') + html(element);
			continue;
		}
		if (mode === 'examples' && current && element.tagName === 'DL') {
			for (const dd of [...element.children].filter(el => el.tagName === 'DD')) {
				const match = dd.textContent?.match(/^\[(\d+)\]/);
				const sense = match ? current.definitions[Number(match[1]) - 1] : undefined;
				if (sense) sense.examples.push(html(dd).replace(/^\[\d+\]\s*/, ''));
			}
		}
		if (mode !== 'definitions' || !current) continue;
		if (element.tagName === 'OL') current.definitions.push(...orderedDefinitions(element));
		if (element.tagName === 'DL') {
			const numberedTerm = /^\d+(?:\s|$)/.test(element.querySelector(':scope > dt')?.textContent || '');
			for (const dd of [...element.children].filter(el => el.tagName === 'DD')) {
				if (!numberedTerm && !/^\[\d+\]/.test(dd.textContent || '')) continue;
				const copy = clean(dd); copy.querySelectorAll('ul, dl').forEach(el => el.remove());
				current.definitions.push({ html: copy.innerHTML.trim().replace(/^\[\d+\]\s*/, ''), examples: [] });
			}
		}
	}
	const nonempty = entries.filter(entry => entry.definitions.length);
	if (!nonempty.length) return null;
	return {
		code: language.code, name: language.name, entries: nonempty,
		edition: language.code, sourceUrl: `https://${language.code}.wiktionary.org/wiki/${encodeURIComponent(page.title)}`,
		pronunciation: pronunciation(section), etymology: etymology || undefined,
		definitionLanguage: language.code, contentKind: 'definition'
	};
}

/** Polish is the deliberate exception: read the German translation list on Polish Wiktionary. */
export function parsePolishTranslations(page: ParsedPage, target: string): LangSection | null {
	const section = languageSection(page.text, 'pl', 'Polish');
	if (!section) return null;
	const marker = section.querySelector('[data-field="tlumaczenia"]');
	let block = marker?.closest('dl')?.nextElementSibling;
	const targetName = fold(languageLabel(target, 'pl'));
	const definitions: Definition[] = [];
	while (block && !block.querySelector('[data-field]') && !heading(block)) {
		for (const li of [...block.querySelectorAll('li')]) {
			const label = (li.textContent || '').split(':')[0];
			if (fold(label) !== targetName) continue;
			const value = html(li).replace(/^[^:]*:\s*/, '');
			if (value) definitions.push({ html: value, examples: [] });
		}
		block = block.nextElementSibling;
	}
	if (!definitions.length) return null;
	return { code: 'pl', name: 'Polish', entries: [{ partOfSpeech: `Translations → ${languageLabel(target, 'en')}`, definitions }],
		edition: 'pl', sourceUrl: `https://pl.wiktionary.org/wiki/${encodeURIComponent(page.title)}`,
		pronunciation: pronunciation(section), definitionLanguage: target, contentKind: 'translation' };
}

export async function fetchNativeSection(word: string, language: LangSection, polishTarget = 'de'): Promise<LangSection> {
	const unavailable = (reason: string): LangSection => ({ ...language, entries: [], edition: language.code,
		sourceUrl: `https://${language.code}.wiktionary.org/wiki/${encodeURIComponent(word)}`,
		definitionLanguage: language.code === 'pl' ? polishTarget : language.code,
		contentKind: language.code === 'pl' ? 'translation' : 'definition', unavailable: reason });
	if (!/^[a-z]{2,3}(?:-[a-z]{2,8})?$/.test(language.code)) return unavailable('No matching native Wiktionary edition is available.');
	try {
		const params = new URLSearchParams({ action: 'parse', page: word, prop: 'text', format: 'json', formatversion: '2', redirects: '1', disableeditsection: '1' });
		const response = await requestUrl({ url: `https://${language.code}.wiktionary.org/w/api.php?${params}`, throw: false });
		if (response.status === 429) return unavailable('Wiktionary has rate-limited this request. Please retry after 30 seconds.');
		if (response.status !== 200) return unavailable(`Native Wiktionary returned HTTP ${response.status}.`);
		const data = response.json;
		if (!data?.parse?.text) return unavailable('No native entry was found on this Wiktionary edition.');
		const page = data.parse as ParsedPage;
		const result = language.code === 'pl' ? parsePolishTranslations(page, polishTarget) : parseNativePage(page, language);
		return result || unavailable(language.code === 'pl' ? `No ${languageLabel(polishTarget, 'en')} translations were found.` : 'No native definitions could be read from this page. Open the source to check it.');
	} catch { return unavailable('Could not load the native Wiktionary entry. Check your connection and try again.'); }
}
