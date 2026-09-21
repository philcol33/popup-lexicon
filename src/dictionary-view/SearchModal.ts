import { Component, Modal } from 'obsidian';
import type PopupLexiconPlugin from '../main';
import { fromWiktionary } from '../vocabulary/adapter';
import { renderEntryActions } from '../vocabulary/actions';
import { renderDefinition } from './DefinitionView';

export class DictionarySearchModal extends Modal {
	private generation = 0;
	private rendered = new Component();
	constructor(private plugin: PopupLexiconPlugin, private initial = '') { super(plugin.app); }
	onOpen(): void {
		this.setTitle('Search Dictionary');
		this.modalEl.addClass('lexicon-search-modal');
		this.rendered.load();
		const form = this.contentEl.createEl('form', { cls: 'lexicon-search-form' });
		const input = form.createEl('input', { type: 'search', placeholder: 'Look up a word in Wiktionary…', attr: { 'aria-label': 'Word to look up' } });
		input.value = this.initial;
		form.createEl('button', { text: 'Search', type: 'submit', cls: 'mod-cta' });
		const results = this.contentEl.createDiv({ cls: 'lexicon-search-results' });
		form.onsubmit = e => { e.preventDefault(); void this.search(input.value, results); };
		input.focus();
		if (this.initial) void this.search(this.initial, results);
	}
	private async search(word: string, root: HTMLElement): Promise<void> {
		word = word.trim();
		if (!word) return;
		const generation = ++this.generation;
		this.rendered.unload(); this.rendered = new Component(); this.rendered.load();
		root.empty(); root.createDiv({ cls: 'lexicon-status', text: 'Looking up…' });
		try {
			const result = await this.plugin.dict.lookup(word);
			if (generation !== this.generation) return;
			root.empty();
			if (!result) { root.createDiv({ cls: 'lexicon-status', text: `No definition found for “${word}”.` }); return; }
			const filter = this.plugin.settings.filterLanguages.toLowerCase().split(/[,\s]+/).filter(Boolean);
			const filtered = result.langs.filter(lang => filter.includes(lang.code.toLowerCase()));
			for (const lang of filtered.length ? filtered : result.langs) {
				const entry = fromWiktionary(result, lang);
				const section = root.createEl('section');
				await renderDefinition(this.app, section, entry, this.rendered);
				if (generation !== this.generation) return;
				renderEntryActions(section.createDiv({ cls: 'lexicon-actions' }), this.plugin, entry);
			}
		} catch (e) {
			if (generation === this.generation) { root.empty(); root.createDiv({ cls: 'lexicon-status', text: e instanceof Error ? e.message : 'Lookup failed.' }); }
		}
	}
	onClose(): void { this.generation++; this.rendered.unload(); this.contentEl.empty(); }
}
