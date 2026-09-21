import { fetchNativeSection } from "./lookup/nativeWiktionary";
import { requestUrl, type RequestUrlResponse } from "obsidian";

// Upstream REST lookup discovers words/languages and supplies English definitions.
// The shared client then resolves native definitions (or Polish translations)
// through the per-edition MediaWiki adapter, with caching and lazy loading.

export interface Definition {
	/** Definition text as an HTML fragment (contains <a>, <b>, <i>, ...). */
	html: string;
	/** Example sentences as HTML fragments. */
	examples: string[];
}

export interface Entry {
	partOfSpeech: string;
	definitions: Definition[];
}

export interface LangSection {
	edition?: string;
	sourceUrl?: string;
	pronunciation?: string;
	etymology?: string;
	definitionLanguage?: string;
	contentKind?: 'definition' | 'translation';
	unavailable?: string;
	needsLookup?: boolean;
	code: string;
	name: string;
	entries: Entry[];
}

export interface DictionaryResult {
	word: string;
	edition: string;
	/** Link to the human-readable Wiktionary page. */
	url: string;
	langs: LangSection[];
}

// Raw shape of the REST response (object keyed by language code).
interface RawDefinition {
	definition?: string;
	examples?: string[];
	parsedExamples?: { example?: string }[];
}
interface RawEntry {
	partOfSpeech?: string;
	language?: string;
	definitions?: RawDefinition[];
}
type RawResponse = Record<string, RawEntry[]>;

const CACHE_LIMIT = 200;
const EDITION_RE = /^[a-z]{2,3}(-[a-z]{2,4})?$/;

export class DictionaryClient {
	private cache = new Map<string, DictionaryResult | null>();
	private inflight = new Map<string, Promise<DictionaryResult | null>>();
	private nativeCache = new Map<string, { value: LangSection; expires: number }>();
	private nativeInflight = new Map<string, Promise<LangSection>>();

	constructor(private getEdition: () => string,
		private getLanguagePolicy?: () => { filterLanguages: string; polishTranslationLanguage: string; preferredLanguages?: string }) {}

	private normalizeEdition(): string {
		const e = (this.getEdition() || "en").trim().toLowerCase();
		return EDITION_RE.test(e) ? e : "en";
	}

	wiktionaryPageUrl(word: string): string {
		return `https://${this.normalizeEdition()}.wiktionary.org/wiki/${encodeURIComponent(
			word
		)}`;
	}

	/**
	 * Look up a word. Resolves to a result, or `null` when the word has no entry.
	 * Rejects only on network / unexpected server errors.
	 */
	async lookup(rawWord: string): Promise<DictionaryResult | null> {
		const word = rawWord.trim();
		if (!word) return null;
		if (word.length > 80) throw new Error("Enter a word or short phrase (up to 80 characters).");
		const edition = this.normalizeEdition();
		const policy = this.getLanguagePolicy?.();
		const key = `${edition}:${JSON.stringify(policy)}:${word}`;

		if (this.cache.has(key)) return this.cache.get(key) ?? null;
		const pending = this.inflight.get(key);
		if (pending) return pending;

		const promise = this.fetchAndParse(word, edition)
			.then(async result => {
				if (!result || !policy) return result;
				const filter = policy.filterLanguages.toLowerCase().split(/[,\s]+/).filter(Boolean);
				const filtered = result.langs.filter(lang => filter.includes(lang.code.toLowerCase()));
				const order = (policy.preferredLanguages || '').toLowerCase().split(/[,\s]+/).filter(Boolean);
				const rank = (code: string) => { const index = order.indexOf(code); return index < 0 ? Number.MAX_SAFE_INTEGER : index; };
				const languages = [...(filtered.length ? filtered : result.langs)].sort((a, b) => rank(a.code) - rank(b.code));
				// At most two automatic native requests. Remaining languages are available on demand.
				let nativeCount = 0;
				const resolved = await Promise.all(languages.map(async language => {
					if (language.code === 'en') return { ...language, definitionLanguage: 'en', contentKind: 'definition' as const };
					if (++nativeCount <= 2) return this.lookupLanguage(result.word, language);
					return { ...language, entries: [], needsLookup: true, edition: language.code,
						sourceUrl: `https://${language.code}.wiktionary.org/wiki/${encodeURIComponent(result.word)}`,
						definitionLanguage: language.code === 'pl' ? policy.polishTranslationLanguage : language.code,
						contentKind: language.code === 'pl' ? 'translation' as const : 'definition' as const };
				}));
				return { ...result, langs: resolved };
			})
			.then((result) => {
				// Failed native lookups are retryable instead of cached for the whole session.
				if (!result?.langs.some(lang => lang.unavailable)) this.put(key, result);
				return result;
			})
			.finally(() => {
				this.inflight.delete(key);
			});
		this.inflight.set(key, promise);
		return promise;
	}

	/** Shared lazy loader: each native edition request is cached/coalesced across all interfaces. */
	lookupLanguage(word: string, language: LangSection): Promise<LangSection> {
		const target = this.getLanguagePolicy?.().polishTranslationLanguage || 'de';
		const key = `${language.code}:${target}:${word}`;
		const cached = this.nativeCache.get(key);
		if (cached && cached.expires > Date.now()) return Promise.resolve(cached.value);
		const pending = this.nativeInflight.get(key); if (pending) return pending;
		const request = fetchNativeSection(word, language, target).then(value => {
			this.nativeCache.set(key, { value, expires: value.unavailable ? Date.now() + 30000 : Infinity });
			if (this.nativeCache.size > CACHE_LIMIT) this.nativeCache.delete(this.nativeCache.keys().next().value!);
			return value;
		}).finally(() => this.nativeInflight.delete(key));
		this.nativeInflight.set(key, request); return request;
	}

	private put(key: string, value: DictionaryResult | null): void {
		this.cache.set(key, value);
		if (this.cache.size > CACHE_LIMIT) {
			const [oldest] = this.cache.keys();
			this.cache.delete(oldest);
		}
	}

	private async fetchAndParse(
		word: string,
		edition: string
	): Promise<DictionaryResult | null> {
		const direct = await this.fetchOne(word, edition);
		if (direct) return direct;
		// Wiktionary titles are case-sensitive; retry a lower-cased variant.
		const lower = word.toLocaleLowerCase();
		if (lower !== word) {
			const alt = await this.fetchOne(lower, edition);
			if (alt) return alt;
		}
		return null;
	}

	private async fetchOne(
		word: string,
		edition: string
	): Promise<DictionaryResult | null> {
		const url = `https://${edition}.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(
			word
		)}`;

		let resp: RequestUrlResponse;
		try {
			resp = await requestUrl({ url, method: "GET", throw: false });
		} catch {
			throw new Error("Could not reach Wiktionary (offline?).");
		}

		if (resp.status === 404) return null;
		// Wiktionary's definition REST endpoint is implemented only for the
		// English edition; every other edition answers 501 Not Implemented.
		// Popup Lexicon uses en here for discovery, then resolves native pages
		// separately through the same shared client.
		if (resp.status === 501) {
			throw new Error(
				`Wiktionary's definition API only supports the English edition, ` +
					`but the edition is set to "${edition}". Set the Wiktionary edition ` +
					`back to "en" — it still defines words from thousands of languages.`
			);
		}
		if (resp.status < 200 || resp.status >= 300) {
			throw new Error(`Wiktionary returned HTTP ${resp.status}.`);
		}

		let data: unknown;
		try {
			data = resp.json;
		} catch {
			throw new Error("Could not read the Wiktionary response.");
		}
		if (!data || typeof data !== "object") return null;
		return this.parse(word, edition, data as RawResponse);
	}

	private parse(
		word: string,
		edition: string,
		data: RawResponse
	): DictionaryResult | null {
		const langs: LangSection[] = [];

		for (const code of Object.keys(data)) {
			const rawEntries = data[code];
			if (!Array.isArray(rawEntries) || rawEntries.length === 0) continue;

			const entries: Entry[] = [];
			let name = code;

			for (const re of rawEntries) {
				if (re.language) name = re.language;
				const defs: Definition[] = [];

				for (const rd of re.definitions ?? []) {
					const html = (rd.definition ?? "").trim();
					if (!html) continue;

					const examples: string[] = [];
					if (Array.isArray(rd.parsedExamples)) {
						for (const ex of rd.parsedExamples) {
							if (ex && ex.example) examples.push(ex.example);
						}
					}
					if (examples.length === 0 && Array.isArray(rd.examples)) {
						for (const ex of rd.examples) if (ex) examples.push(ex);
					}

					defs.push({ html, examples });
				}

				if (defs.length > 0) {
					entries.push({
						partOfSpeech: re.partOfSpeech ?? "",
						definitions: defs,
					});
				}
			}

			if (entries.length > 0) langs.push({ code, name, entries });
		}

		if (langs.length === 0) return null;
		return {
			word,
			edition,
			url: this.wiktionaryPageUrl(word),
			langs,
		};
	}
}
