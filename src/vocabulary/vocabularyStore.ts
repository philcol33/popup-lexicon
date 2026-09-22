import { aspectMarkdown, type AspectRelation } from './aspect';
import { TFile, TFolder, type Vault } from 'obsidian';
import { parseMarkdown, writeMarkdown, writeEncounter } from './markdown';
import { dictionaryRoot, safeFilename } from './paths';
import { entryKey, type DictionaryEntry, type SavedEntry, type Encounter } from './types';

/** All persisted vocabulary is normal vault Markdown. No filesystem APIs. */
export class VocabularyStore {
	private queue: Promise<unknown> = Promise.resolve();
	constructor(readonly vault: Vault, private getRoot: () => string) {}
	get root(): string { return dictionaryRoot(this.getRoot()); }
	contains(path: string): boolean { return path.startsWith(this.root + '/') && path.endsWith('.md'); }
	async read(path: string): Promise<SavedEntry | null> {
		const file = this.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile) || !this.contains(path)) return null;
		const entry = parseMarkdown(await this.vault.cachedRead(file));
		return entry ? { path, entry } : null;
	}
	async list(): Promise<SavedEntry[]> {
		const entries: SavedEntry[] = [];
		for (const file of this.vault.getMarkdownFiles()) {
			if (!this.contains(file.path)) continue;
			const saved = await this.read(file.path);
			if (saved) entries.push(saved);
		}
		return entries.sort((a, b) => a.entry.word.localeCompare(b.entry.word));
	}
	async find(entry: DictionaryEntry): Promise<SavedEntry | undefined> {
		return (await this.list()).find(saved => entryKey(saved.entry) === entryKey(entry));
	}
	/** Atomic, narrow updates preserve the user's Markdown and unrelated sections. */
	async update(path: string, transform: (markdown: string) => string): Promise<void> {
		const file = this.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile) || !this.contains(path)) throw new Error('Saved entry no longer exists.');
		await this.vault.process(file, markdown => {
			if (!parseMarkdown(markdown)) throw new Error('This file is no longer a dictionary entry.');
			return transform(markdown);
		});
	}
	async appendEncounter(path: string, encounter: Encounter): Promise<boolean> {
		let added = false;
		await this.update(path, markdown => {
			const entry = parseMarkdown(markdown)!;
			if (entry.encounters?.some(e => e.sourcePath === encounter.sourcePath && e.context === encounter.context)) return markdown;
			const section = /^## Encounters[ \t]*\r?$/m.exec(markdown);
			const addition = writeEncounter(encounter);
			added = true;
			if (!section) return markdown.trimEnd() + '\n\n## Encounters\n\n' + addition;
			const start = section.index + section[0].length;
			const next = /^## /m.exec(markdown.slice(start));
			const end = next ? start + next.index : markdown.length;
			return markdown.slice(0, end).trimEnd() + '\n\n' + addition + '\n' + markdown.slice(end);
		});
		return added;
	}

	/** Insert aspect links near the headword; update only source URLs in an existing Aspect section. */
	async linkAspects(path: string, relations: AspectRelation[]): Promise<void> {
		await this.update(path, markdown => {
			const section = /^## Aspect[ \t]*\r?$/mi.exec(markdown);
			if (!section) {
				const first = /^## /m.exec(markdown);
				const position = first?.index ?? markdown.length;
				return markdown.slice(0, position).trimEnd() + '\n\n## Aspect\n\n' + aspectMarkdown(relations) + '\n\n' + markdown.slice(position);
			}
			const start = section.index + section[0].length, next = /^## /m.exec(markdown.slice(start));
			const end = next ? start + next.index : markdown.length;
			let body = markdown.slice(start, end);
			for (const relation of relations) {
				if (!relation.path) continue;
				const target = relation.path.split('/').map(encodeURIComponent).join('/');
				body = body.replace(/\[([^\]]+)\]\((https:\/\/pl\.wiktionary\.org\/wiki\/[^)]+)\)/g, (link, label: string, url: string) => {
					let word: string; try { word = decodeURIComponent(url.split('/wiki/')[1].split('#')[0]).replace(/_/g, ' '); } catch { return link; }
					return word === relation.word ? `[${label}](${target})` : link;
				});
			}
			return markdown.slice(0, start) + body + markdown.slice(end);
		});
	}

	/** Add missing learning sections only; never rewrite existing user content. */
	async appendLearningDetails(path: string, incoming: DictionaryEntry): Promise<boolean> {
		let added = false;
		await this.update(path, markdown => {
			const current = parseMarkdown(markdown)!;
			if (entryKey(current) !== entryKey(incoming)) throw new Error('The saved entry has changed.');
			const additions: string[] = [];
			for (const [heading, key] of [['Etymology','etymology'], ['Grammar','grammar'], ['Conjugation','conjugation'], ['Inflection','inflection'], ['Usage notes','usageNotes'], ['Example sentences','usageExamples']] as const) {
				// An empty existing section may be intentional; leave it untouched as well.
				if (new RegExp(`^## ${heading}[ \t]*$`, 'mi').test(markdown.replace(/\r/g, ''))) continue;
				const value = incoming[key]; if (!value?.length) continue;
				const body = Array.isArray(value) ? value.map(ex => ex.split('\n').map(line => `> ${line}`).join('\n')).join('\n\n') : value;
				if (heading === 'Etymology' && current.languageCode !== 'pl') {
					const position = /^## /m.exec(markdown)?.index ?? markdown.length;
					markdown = markdown.slice(0, position).trimEnd() + '\n\n## Etymology\n\n' + body + '\n\n' + markdown.slice(position);
					added = true;
				} else additions.push(`## ${heading}\n\n${body}`);
			}
			if (!additions.length) return markdown;
			added = true;
			return markdown.trimEnd() + '\n\n' + additions.join('\n\n') + '\n';
		});
		return added;
	}

	private async ensureFolder(path: string): Promise<void> {
		let current = '';
		for (const part of path.split('/')) {
			current = current ? `${current}/${part}` : part;
			const existing = this.vault.getAbstractFileByPath(current);
			if (existing && !(existing instanceof TFolder)) throw new Error(`A file occupies the folder ${current}.`);
			if (!existing) {
				try { await this.vault.createFolder(current); }
				catch (e) { if (!(this.vault.getAbstractFileByPath(current) instanceof TFolder)) throw e; }
			}
		}
	}
	/** Serialize saves so double-clicks and simultaneous views cannot create duplicates. */
	save(entry: DictionaryEntry): Promise<{ saved: SavedEntry; created: boolean }> {
		const task = this.queue.then(async () => {
			if (entry.unavailable) throw new Error("Cannot save an unavailable definition.");
			const duplicate = await this.find(entry);
			if (duplicate) return { saved: duplicate, created: false };
			const folder = `${this.root}/${safeFilename(entry.languageName)}`;
			await this.ensureFolder(folder);
			const stem = `${folder}/${safeFilename(entry.word)}`;
			let path = `${stem}.md`, suffix = 2;
			while (this.vault.getAbstractFileByPath(path)) path = `${stem} (${suffix++}).md`;
			// Vault.create fails if a concurrent user action occupies this path. It never replaces it.
			await this.vault.create(path, writeMarkdown(entry));
			return { saved: { path, entry }, created: true };
		});
		this.queue = task.catch(() => {});
		return task;
	}
}
