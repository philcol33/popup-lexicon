import { aspectLabel } from '../vocabulary/aspect';
import { Component, MarkdownRenderer, type App } from 'obsidian';
import type { DictionaryEntry } from '../vocabulary/types';

/** Shared rendering of both Markdown entries and adapted Wiktionary results. */
export async function renderDefinition(app: App, root: HTMLElement, entry: DictionaryEntry, owner: Component, sourcePath = '', isCurrent = () => true, openEntry?: (word: string, language: string) => void | Promise<void>): Promise<void> {
	root.addClass('lexicon-definition');
	root.createDiv({ cls: 'lexicon-language-label', text: entry.languageName });
	root.createEl('h1', { text: entry.word });
	for (const relation of entry.aspects || []) {
		const row = root.createDiv({ cls: 'lexicon-aspect' }); row.createEl('em', { text: aspectLabel(relation.kind) + ' ' });
		const a = row.createEl('a', { text: relation.word, href: relation.path || relation.sourceUrl || '#' });
		a.onclick = event => { if (openEntry || relation.path) { event.preventDefault(); if (openEntry) void openEntry(relation.word, entry.languageCode); else void app.workspace.openLinkText(relation.path!, '', true); } };
	}
	if (entry.lookupForm && entry.lookupForm !== entry.word) root.createDiv({ cls: 'lexicon-status', text: `${entry.lookupForm} → ${entry.word}` });
	if (entry.contentKind === 'translation' && !entry.partsOfSpeech.length && entry.grammar) root.createDiv({ cls: 'lexicon-status', text: 'No translation listed on this source page. Grammar and examples are available below.' });
	if (entry.unavailable) root.createDiv({ cls: 'lexicon-status', text: entry.unavailable });
	const phonetics = [entry.pronunciation, ...(entry.phonetics || [])].filter(Boolean).join(' · ');
	if (phonetics) root.createDiv({ cls: 'lexicon-phonetics', text: phonetics });
	const markdown = async (value: string, element: HTMLElement) => MarkdownRenderer.render(app, value, element, sourcePath, owner);
	if (entry.etymology && entry.languageCode !== 'pl') {
		root.createEl('h2', { cls: 'lexicon-section-label', text: 'Etymology' });
		await markdown(entry.etymology, root.createDiv());
	}
	for (const part of entry.partsOfSpeech) {
		if (!isCurrent()) return;
		root.createEl('h2', { cls: 'lexicon-pos', text: part.type });
		const list = root.createEl('ol', { cls: 'lexicon-meanings' });
		for (const meaning of part.meanings) {
			if (!isCurrent()) return;
			const li = list.createEl('li');
			await markdown(meaning.definition, li.createDiv());
			for (const example of meaning.examples || []) await markdown(example, li.createDiv({ cls: 'lexicon-example' }));
			if (meaning.synonyms?.length) li.createDiv({ cls: 'lexicon-related', text: `Synonyms: ${meaning.synonyms.join(', ')}` });
			if (meaning.antonyms?.length) li.createDiv({ cls: 'lexicon-related', text: `Antonyms: ${meaning.antonyms.join(', ')}` });
		}
	}
	if (!isCurrent()) return;
	for (const [label, value] of [['Grammar', entry.grammar], ['Conjugation', entry.conjugation]]) {
		if (value) { root.createEl('h2', { cls: 'lexicon-section-label', text: label }); await markdown(value, root.createDiv({ cls: 'lexicon-grammar' })); }
	}
	if (entry.usageExamples?.length) {
		root.createEl('h2', { cls: 'lexicon-section-label', text: 'Example sentences' });
		for (const example of entry.usageExamples) await markdown(example, root.createDiv({ cls: 'lexicon-example' }));
	}
	for (const [label, value] of [['Full inflection', entry.inflection], ['Usage notes', entry.usageNotes]]) {
		if (value) { const details = root.createEl('details', { cls: 'lexicon-grammar' }); details.createEl('summary', { text: label }); await markdown(value, details.createDiv()); }
	}
	if (entry.etymology && entry.languageCode === 'pl') {
		root.createEl('h2', { cls: 'lexicon-section-label', text: 'Etymology' });
		await markdown(entry.etymology, root.createDiv());
	}
	if (entry.encounters?.length) {
		root.createEl('h2', { cls: 'lexicon-section-label', text: 'Encounters' });
		for (const encounter of entry.encounters) {
			root.createEl('blockquote', { text: encounter.context });
			const link = root.createEl('a', { text: encounter.sourcePath.replace(/\.md$/i, ''), href: '#' });
			link.onclick = event => { event.preventDefault(); void app.workspace.openLinkText(encounter.sourcePath, '', true); };
		}
	}
	if (entry.source) {
		const footer = root.createDiv({ cls: 'lexicon-attribution' });
		if (entry.source.url && /^https?:\/\//i.test(entry.source.url)) footer.createEl('a', { text: `${entry.source.provider} ↗`, href: entry.source.url, attr: { target: '_blank', rel: 'noopener noreferrer' } });
		else footer.createSpan({ text: entry.source.provider });
		if (entry.source.license) footer.createSpan({ text: ` · © contributors · ${entry.source.license}` });
	}
}
