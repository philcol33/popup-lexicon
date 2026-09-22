import { aspectLabel } from './vocabulary/aspect';
import { sanitizeHTMLToDom } from "obsidian";
import type { DictionaryResult, LangSection } from "./dictionary";
import type { PopupLexiconSettings } from "./settings";

// A single floating popup that renders dictionary results. Positioned with
// `position: fixed`, so anchor coordinates are viewport coordinates.

export type Anchor = DOMRect | { x: number; y: number };

interface SimpleRect {
	left: number;
	top: number;
	right: number;
	bottom: number;
}

const GAP = 6;
const MAX_W = 420;
const MAX_H = 360;
const MAX_EXAMPLES = 3;

export class DefinitionPopup {
	private el: HTMLElement | null = null;
	private lastAnchor?: Anchor;
	private currentResult?: DictionaryResult;
	private pinned = false;
	private currentWord: string | null = null;
	private onEnter?: () => void;
	private onLeave?: () => void;

	constructor(
		private getSettings: () => PopupLexiconSettings,
		private renderActions?: (container: HTMLElement, result: DictionaryResult, language: LangSection) => void,
		private openEntry?: (word: string, language: string) => void | Promise<void>
	) {}

	get word(): string | null {
		return this.currentWord;
	}

	isVisible(): boolean {
		return this.el !== null;
	}

	isPinned(): boolean {
		return this.pinned;
	}

	contains(node: Node | null): boolean {
		return !!node && !!this.el && this.el.contains(node);
	}

	/** Hook hover enter/leave so the host can keep the popup alive while pointed at. */
	setHoverHandlers(onEnter: () => void, onLeave: () => void): void {
		this.onEnter = onEnter;
		this.onLeave = onLeave;
	}

	showLoading(anchor: Anchor, word: string): void {
		this.currentWord = word;
		const el = this.reset();
		this.renderHeaderWord(el, word);
		el.createDiv({ cls: "popup-lexicon-status", text: "Looking up…" });
		this.position(anchor);
	}

	showNotFound(anchor: Anchor, word: string): void {
		this.currentWord = word;
		const el = this.reset();
		this.renderHeaderWord(el, word);
		el.createDiv({
			cls: "popup-lexicon-status",
			text: "No definition found.",
		});
		this.position(anchor);
	}

	showError(anchor: Anchor, word: string, message: string): void {
		this.currentWord = word;
		const el = this.reset();
		this.renderHeaderWord(el, word);
		el.createDiv({
			cls: "popup-lexicon-status mod-error",
			text: message,
		});
		this.position(anchor);
	}

	showResult(anchor: Anchor, result: DictionaryResult): void {
		this.lastAnchor = anchor; this.currentResult = result;
		this.currentWord = result.word;
		const settings = this.getSettings();
		const el = this.reset();

		const header = el.createDiv({ cls: "popup-lexicon-header" });
		header.createSpan({ cls: "popup-lexicon-word", text: result.word });
		header.createSpan({
			cls: "popup-lexicon-edition",
			text: result.edition,
		});
		const link = header.createEl("a", {
			cls: "popup-lexicon-source",
			text: "Wiktionary ↗",
			href: result.url,
		});
		link.setAttr("target", "_blank");
		link.setAttr("rel", "noopener");

		const body = el.createDiv({ cls: "popup-lexicon-body" });

		const filter = parseFilter(settings.filterLanguages);
		const filtered = filter
			? result.langs.filter((l) => filter.has(l.code.toLowerCase()))
			: result.langs;
		const sections = filtered.length > 0 ? filtered : result.langs;

		for (const lang of sections) {
			const sec = body.createDiv({ cls: "popup-lexicon-lang" });
			sec.createDiv({
				cls: "popup-lexicon-lang-name",
				text: lang.name,
			});

			for (const relation of lang.aspects || []) {
				const row = sec.createDiv({ cls: 'lexicon-aspect' });
				row.createEl('em', { text: aspectLabel(relation.kind) + ' ' });
				const link = row.createEl('a', { text: relation.word, href: relation.sourceUrl });
				if (this.openEntry) link.onclick = event => { event.preventDefault(); void this.openEntry!(relation.word, lang.code); };
			}
			if (lang.etymology && lang.code !== 'pl') { sec.createDiv({ cls: 'popup-lexicon-pos', text: 'Etymology' }); sec.createDiv().append(sanitizeHTMLToDom(lang.etymology)); }
			if (lang.headword && lang.headword !== result.word) sec.createDiv({ cls: 'lexicon-status', text: `${lang.lookupForm || result.word} → ${lang.headword}` });
			if (lang.pronunciation) sec.createDiv({ cls: 'lexicon-phonetics', text: lang.pronunciation });
			if (lang.unavailable) sec.createDiv({ cls: 'popup-lexicon-status', text: lang.unavailable });
			if (lang.sourceUrl) sec.createEl('a', { cls: 'popup-lexicon-source', text: 'Source ↗', href: lang.sourceUrl, attr: { target: '_blank', rel: 'noopener' } });
			for (const entry of lang.entries) {
				if (entry.partOfSpeech) {
					sec.createDiv({
						cls: "popup-lexicon-pos",
						text: entry.partOfSpeech,
					});
				}
				const ol = sec.createEl("ol", { cls: "popup-lexicon-defs" });
				const defs = entry.definitions.slice(
					0,
					Math.max(1, settings.maxDefinitionsPerEntry)
				);
				for (const def of defs) {
					const li = ol.createEl("li");
					li.appendChild(sanitizeHTMLToDom(def.html));
					if (settings.showExamples && def.examples.length > 0) {
						const exWrap = li.createDiv({
							cls: "popup-lexicon-examples",
						});
						for (const ex of def.examples.slice(0, MAX_EXAMPLES)) {
							exWrap
								.createDiv({ cls: "popup-lexicon-example" })
								.appendChild(sanitizeHTMLToDom(ex));
						}
					}
				}
			}
			if (lang.contentKind === 'translation' && !lang.entries.length && lang.grammar) sec.createDiv({ cls: 'popup-lexicon-status', text: 'No translation listed on this source page. Grammar and examples follow.' });
			if (lang.grammar) sec.createDiv({ cls: 'lexicon-grammar' }).append(sanitizeHTMLToDom(lang.grammar));
			if (settings.showExamples) for (const example of (lang.usageExamples || []).slice(0, MAX_EXAMPLES)) sec.createDiv({ cls: 'popup-lexicon-example' }).append(sanitizeHTMLToDom(example));
			for (const [label, value] of [['Conjugation', lang.conjugation], ['Full inflection', lang.inflection], ['Usage notes', lang.usageNotes]]) {
				if (value) { const details = sec.createEl('details', { cls: 'lexicon-grammar' }); details.createEl('summary', { text: label }); details.createDiv().append(sanitizeHTMLToDom(value)); }
			}
			if (lang.etymology && lang.code === 'pl') {
				const details = sec.createEl('details'); details.createEl('summary', { text: 'Etymology' });
				details.createDiv().appendChild(sanitizeHTMLToDom(lang.etymology));
			}
			this.absolutizeLinks(sec, lang.edition || result.edition, lang.headword || result.word);
			this.renderActions?.(sec.createDiv({ cls: "lexicon-actions" }), result, lang);
		}

		this.position(anchor);
	}

	replaceLanguage(word: string, language: LangSection): void {
		if (this.word !== word || !this.currentResult || !this.lastAnchor) return;
		this.showResult(this.lastAnchor, { ...this.currentResult, langs: this.currentResult.langs.map(lang => lang.code === language.code ? language : lang) });
	}

	hide(): void {
		if (this.el) {
			this.el.remove();
			this.el = null;
		}
		this.pinned = false;
		this.currentWord = null;
	}

	private renderHeaderWord(el: HTMLElement, word: string): void {
		const header = el.createDiv({ cls: "popup-lexicon-header" });
		header.createSpan({ cls: "popup-lexicon-word", text: word });
	}

	private ensureEl(): HTMLElement {
		if (this.el) return this.el;
		const el = activeDocument.body.createDiv({ cls: "popup-lexicon" });
		el.addEventListener("mousedown", () => {
			this.pinned = true;
		});
		el.addEventListener("mouseenter", () => this.onEnter?.());
		el.addEventListener("mouseleave", () => this.onLeave?.());
		this.el = el;
		return el;
	}

	private reset(): HTMLElement {
		const el = this.ensureEl();
		el.empty();
		this.pinned = false;
		return el;
	}

	// Wiktionary definitions use root-relative links ("/wiki/...") and "./word"
	// links. Rewrite them to absolute URLs that open in the system browser.
	private absolutizeLinks(root: HTMLElement, edition: string, headword: string): void {
		const base = `https://${edition}.wiktionary.org`;
		root.findAll("a").forEach((a) => {
			const href = a.getAttribute("href") || "";
			if (href.startsWith("//")) {
				a.setAttribute("href", `https:${href}`);
			} else if (href.startsWith("#")) {
				a.setAttribute("href", `${base}/wiki/${encodeURIComponent(headword)}${href}`);
			} else if (href.startsWith("./")) {
				a.setAttribute("href", `${base}/wiki/${href.slice(2)}`);
			} else if (href.startsWith("/")) {
				a.setAttribute("href", `${base}${href}`);
			}
			a.setAttribute("target", "_blank");
			a.setAttribute("rel", "noopener");
		});
	}

	private position(anchor: Anchor): void {
		const el = this.el;
		if (!el) return;

		const rect = toRect(anchor);
		const vw = window.innerWidth;
		const vh = window.innerHeight;
		const w = Math.min(el.offsetWidth, MAX_W);
		const h = Math.min(el.offsetHeight, MAX_H);

		let left = rect.left;
		let top = rect.bottom + GAP;

		if (left + w > vw - GAP) left = vw - w - GAP;
		if (left < GAP) left = GAP;

		if (top + h > vh - GAP) {
			// Not enough room below: flip above the anchor.
			const above = rect.top - GAP - h;
			top = above >= GAP ? above : Math.max(GAP, vh - h - GAP);
		}

		el.style.left = `${Math.round(left)}px`;
		el.style.top = `${Math.round(top)}px`;
	}
}

function toRect(anchor: Anchor): SimpleRect {
	if ("bottom" in anchor) {
		return {
			left: anchor.left,
			top: anchor.top,
			right: anchor.right,
			bottom: anchor.bottom,
		};
	}
	return { left: anchor.x, top: anchor.y, right: anchor.x, bottom: anchor.y };
}

function parseFilter(value: string): Set<string> | null {
	const codes = value
		.split(/[,\s]+/)
		.map((c) => c.trim().toLowerCase())
		.filter(Boolean);
	return codes.length > 0 ? new Set(codes) : null;
}
