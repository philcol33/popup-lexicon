import { NavigationHistory } from "./history";
import { getWordAtPoint } from "../wordDetection";
import { Component, ItemView, type WorkspaceLeaf } from 'obsidian';
import type PopupLexiconPlugin from '../main';
import { fromWiktionary } from '../vocabulary/adapter';
import { renderEntryActions } from '../vocabulary/actions';
import { entryKey, normalizeWord, type SavedEntry, type DictionaryEntry } from '../vocabulary/types';
import { renderDefinition } from './DefinitionView';
import { WordList } from './WordList';

export const DICTIONARY_VIEW = 'popup-lexicon-dictionary';
type DisplayEntry = Omit<SavedEntry, 'path'> & { path?: string; alternatives?: DictionaryEntry[] };

export class DictionaryView extends ItemView {
	private history = new NavigationHistory<DisplayEntry>(value => entryKey(value.entry));
	private backButton!: HTMLButtonElement;
	private forwardButton!: HTMLButtonElement;
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
		const navigation = toolbar.createDiv({ cls: 'lexicon-navigation' });
		this.backButton = navigation.createEl('button', { text: '←', attr: { 'aria-label': 'Back', title: 'Back' } });
		this.forwardButton = navigation.createEl('button', { text: '→', attr: { 'aria-label': 'Forward', title: 'Forward' } });
		this.backButton.onclick = () => { void this.navigate(this.history.back()); };
		this.forwardButton.onclick = () => { void this.navigate(this.history.forward()); };
		this.updateNavigation();
		toolbar.createDiv({ cls: 'lexicon-app-title' , text: 'Dictionary' });
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
		this.pane.title = 'Option/Alt-click a word in a definition to look it up';
		this.pane.addEventListener('click', event => {
			if (!event.altKey || event.metaKey || event.ctrlKey || event.shiftKey) return;
			const target = event.target as Element;
			if (!target.closest('.lexicon-meanings')) return;
			event.preventDefault();
			const hit = getWordAtPoint(this.pane.ownerDocument, event.clientX, event.clientY);
			if (hit) void this.lookup(hit.word);
		}, true);
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
			if (saved) await this.show({ ...saved, alternatives: this.current.alternatives }, false);
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
	private updateNavigation(): void {
		this.backButton.disabled = !this.history.canBack;
		this.forwardButton.disabled = !this.history.canForward;
	}
	private async navigate(value?: DisplayEntry): Promise<void> {
		this.updateNavigation();
		if (!value) return;
		const saved = this.plugin.index.find(value.entry);
		if (value.path && !saved) {
			this.generation++; this.current = undefined;
			this.emptyState('This history entry was deleted or moved outside the dictionary.'); return;
		}
		await this.show(saved || value, false);
	}
	private async show(value: DisplayEntry, record = true): Promise<void> {
		if (record) this.history.push(value);
		this.updateNavigation();
		const generation = ++this.generation;
		this.current = value;
		this.rendered.unload(); this.rendered = new Component(); this.rendered.load();
		this.pane.empty();
		const article = this.pane.createEl('article');
		this.refreshList();
		try { await renderDefinition(this.app, article, value.entry, this.rendered, value.path || ''); }
		catch (e) { if (generation === this.generation) this.emptyState(e instanceof Error ? e.message : 'Could not display entry.'); return; }
		if (generation !== this.generation) return;
		renderEntryActions(article.createDiv({ cls: 'lexicon-actions' }), this.plugin, value.entry);
		if (value.alternatives && value.alternatives.length > 1) {
			const choices = this.pane.createDiv({ cls: 'lexicon-result-languages' }); this.pane.prepend(choices);
			for (const entry of value.alternatives) {
				const button = choices.createEl('button', { text: entry.languageName, attr: { 'aria-pressed': String(entry.languageCode === value.entry.languageCode) } });
				button.onclick = () => { void this.show({ ...(this.plugin.index.find(entry) || { entry }), alternatives: value.alternatives }); };
			}
		}
	}
	async lookup(word: string): Promise<void> {
		word = word.trim(); if (!word) return;
		const local = this.plugin.index.search(word, this.language).find(saved => normalizeWord(saved.entry.word) === normalizeWord(word) || saved.entry.aliases?.some(alias => normalizeWord(alias) === normalizeWord(word)));
		if (local) { await this.show(local); return; }
		const generation = ++this.generation;
		this.current = undefined;
		this.pane.empty(); this.pane.createDiv({ cls: 'lexicon-status', text: `Looking up “${word}”…` });
		try {
			const result = await this.plugin.dict.lookup(word);
			if (generation !== this.generation) return;
			if (!result) { this.emptyState(`No definition found for “${word}”.`); return; }
			const preferred = this.plugin.settings.preferredLanguages.split(/[,\s]+/);
			const allow = this.plugin.settings.filterLanguages.toLowerCase().split(/[,\s]+/).filter(Boolean);
			const filtered = result.langs.filter(lang => allow.includes(lang.code.toLowerCase()));
			const languages = filtered.length ? filtered : result.langs;
			const first = languages.find(lang => lang.code === this.language) || languages.find(lang => preferred.includes(lang.code)) || languages[0];
			await this.show({ entry: fromWiktionary(result, first), alternatives: languages.map(lang => fromWiktionary(result, lang)) });
		} catch (e) { if (generation === this.generation) this.emptyState(e instanceof Error ? e.message : 'Lookup failed.'); }
	}
}
