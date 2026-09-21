import { Component, ItemView, type WorkspaceLeaf } from 'obsidian';
import type PopupLexiconPlugin from '../main';
import { fromWiktionary } from '../vocabulary/adapter';
import { renderEntryActions } from '../vocabulary/actions';
import { normalizeWord, type SavedEntry } from '../vocabulary/types';
import { renderDefinition } from './DefinitionView';
import { WordList } from './WordList';

export const DICTIONARY_VIEW = 'popup-lexicon-dictionary';
type DisplayEntry = Omit<SavedEntry, 'path'> & { path?: string };

export class DictionaryView extends ItemView {
	private query = '';
	private language = '';
	private current?: DisplayEntry;
	private searchInput!: HTMLInputElement;
	private tabs!: HTMLElement;
	private list!: WordList;
	private count!: HTMLElement;
	private pane!: HTMLElement;
	private generation = 0;
	private rendered = new Component();
	private unsubscribe?: () => void;
	constructor(leaf: WorkspaceLeaf, private plugin: PopupLexiconPlugin) { super(leaf); }
	getViewType(): string { return DICTIONARY_VIEW; }
	getDisplayText(): string { return 'Dictionary'; }
	getIcon(): string { return 'book-open'; }
	async onOpen(): Promise<void> {
		this.contentEl.empty(); this.contentEl.addClass('lexicon-view');
		this.rendered.load();
		const toolbar = this.contentEl.createDiv({ cls: 'lexicon-toolbar' });
		toolbar.createDiv({ cls: 'lexicon-app-title', text: 'Dictionary' });
		const form = toolbar.createEl('form', { cls: 'lexicon-search-form' });
		this.searchInput = form.createEl('input', { type: 'search', placeholder: 'Search words', attr: { 'aria-label': 'Search saved words' } });
		this.searchInput.oninput = () => { this.query = this.searchInput.value; this.refreshList(true); };
		const online = form.createEl('button', { type: 'submit', text: 'Wiktionary ↗', attr: { 'aria-label': 'Search Wiktionary' } });
		online.title = 'Look up this word online';
		form.onsubmit = event => { event.preventDefault(); void this.lookup(this.query); };
		this.tabs = this.contentEl.createDiv({ cls: 'lexicon-language-tabs', attr: { 'aria-label': 'Filter by language' } });
		const split = this.contentEl.createDiv({ cls: 'lexicon-split' });
		const sidebar = split.createDiv({ cls: 'lexicon-sidebar' });
		this.count = sidebar.createDiv({ cls: 'lexicon-count', attr: { 'aria-live': 'polite' } });
		this.list = new WordList(sidebar.createDiv(), saved => { void this.show(saved); });
		this.pane = split.createDiv({ cls: 'lexicon-pane' });
		this.unsubscribe = this.plugin.index.subscribe(() => { void this.indexChanged(); });
		await this.plugin.index.ready;
		this.refreshList();
		const first = this.plugin.index.all()[0];
		if (first) await this.show(first); else this.emptyState();
	}
	async onClose(): Promise<void> { this.generation++; this.unsubscribe?.(); this.rendered.unload(); }
	private async indexChanged(): Promise<void> {
		this.refreshList();
		if (this.current) {
			const saved = this.plugin.index.find(this.current.entry);
			if (saved) await this.show(saved);
			else if (this.current.path) { this.current = undefined; this.emptyState('This entry was deleted or moved outside the dictionary folder.'); }
		}
	}
	private refreshList(reset = false): void {
		const languages = this.plugin.index.languages(this.plugin.settings.preferredLanguages);
		if (this.language && !languages.some(lang => lang.code === this.language)) this.language = '';
		this.tabs.empty();
		for (const language of [{ code: '', name: 'All' }, ...languages]) {
			const button = this.tabs.createEl('button', { text: language.name, attr: { 'aria-pressed': String(this.language === language.code) } });
			button.toggleClass('is-active', this.language === language.code);
			button.onclick = () => { this.language = language.code; this.refreshList(true); };
		}
		const matches = this.plugin.index.search(this.query, this.language);
		this.count.textContent = `${matches.length} ${matches.length === 1 ? 'word' : 'words'}`;
		this.list.update(matches, this.current?.path, reset);
		let fallback = this.contentEl.querySelector('.lexicon-local-empty');
		fallback?.remove();
		if (!matches.length) {
			const box = this.count.parentElement!.createDiv({ cls: 'lexicon-local-empty' });
			box.createEl('p', { text: this.query ? 'No saved entry.' : 'Your collection starts here.' });
			if (this.query.trim()) box.createEl('button', { text: `Search Wiktionary for “${this.query}”` }).onclick = () => { void this.lookup(this.query); };
		}
	}
	private emptyState(message = 'A world of words, made yours.'): void {
		this.pane.empty();
		const empty = this.pane.createDiv({ cls: 'lexicon-empty' });
		empty.createDiv({ cls: 'lexicon-empty-mark', text: 'Aa' });
		empty.createEl('h2', { text: message });
		empty.createEl('p', { text: this.plugin.index.error || 'Search Wiktionary above, or save a word while reading. Your collection stays in readable Markdown, ready offline.' });
		const button = empty.createEl('button', { text: 'Find your first word', cls: 'mod-cta' });
		button.onclick = () => this.searchInput.focus();
	}
	private async show(value: DisplayEntry): Promise<void> {
		const generation = ++this.generation;
		this.current = value;
		this.rendered.unload(); this.rendered = new Component(); this.rendered.load();
		this.pane.empty();
		const article = this.pane.createEl('article');
		this.refreshList();
		await renderDefinition(this.app, article, value.entry, this.rendered, value.path || '');
		if (generation !== this.generation) return;
		renderEntryActions(article.createDiv({ cls: 'lexicon-actions' }), this.plugin, value.entry);
	}
	async lookup(word: string): Promise<void> {
		word = word.trim(); if (!word) return;
		const local = this.plugin.index.search(word, this.language).find(saved => normalizeWord(saved.entry.word) === normalizeWord(word) || saved.entry.aliases?.some(alias => normalizeWord(alias) === normalizeWord(word)));
		if (local) { await this.show(local); return; }
		const generation = ++this.generation;
		this.pane.empty(); this.pane.createDiv({ cls: 'lexicon-status', text: `Looking up “${word}”…` });
		try {
			const result = await this.plugin.dict.lookup(word);
			if (generation !== this.generation) return;
			if (!result) { this.emptyState(`No definition found for “${word}”.`); return; }
			const preferred = this.plugin.settings.preferredLanguages.split(/[,\s]+/);
			const first = result.langs.find(lang => lang.code === this.language) || result.langs.find(lang => preferred.includes(lang.code)) || result.langs[0];
			await this.show({ entry: fromWiktionary(result, first) });
			const choices = this.pane.createDiv({ cls: 'lexicon-result-languages' });
			this.pane.prepend(choices);
			for (const lang of result.langs) choices.createEl('button', { text: lang.name }).onclick = () => {
				void this.show({ entry: fromWiktionary(result, lang) }).then(() => this.pane.prepend(choices));
			};
		} catch (e) { if (generation === this.generation) this.emptyState(e instanceof Error ? e.message : 'Lookup failed.'); }
	}
}
