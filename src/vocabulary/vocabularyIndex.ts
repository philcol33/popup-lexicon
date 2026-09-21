import { Component } from 'obsidian';
import { entryKey, normalizeWord, type DictionaryEntry, type SavedEntry } from './types';
import type { VocabularyStore } from './vocabularyStore';

export const searchKey = (value: string): string => normalizeWord(value).normalize('NFD').replace(/\p{M}/gu, '');

/** Rebuildable in-memory index. Only changed files are read again. */
export class VocabularyIndex extends Component {
	private cache = new Map<string, { signature: string; saved: SavedEntry | null }>();
	private listeners = new Set<() => void>();
	private timer: ReturnType<typeof setTimeout> | undefined;
	private tail: Promise<void> = Promise.resolve();
	private root = '';
	private disposed = false;
	private ordered: SavedEntry[] = [];
	private identities = new Map<string, SavedEntry>();
	ready: Promise<void> = Promise.resolve();
	error: string | undefined;
	constructor(private store: VocabularyStore) { super(); }
	onload(): void {
		this.disposed = false;
		for (const event of ['create', 'modify', 'delete', 'rename'] as const) {
			this.registerEvent(this.store.vault.on(event as 'create', file => { this.cache.delete(file.path); this.schedule(); }));
		}
		this.ready = this.refresh();
	}
	onunload(): void { this.disposed = true; clearTimeout(this.timer); this.listeners.clear(); }
	subscribe(listener: () => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
	private schedule(): void { clearTimeout(this.timer); this.timer = setTimeout(() => { void this.refresh(); }, 120); }
	refresh(force = false): Promise<void> {
		this.tail = this.tail.then(async () => {
			if (this.disposed) return;
			try {
				if (this.root !== this.store.root || force) { this.cache.clear(); this.root = this.store.root; }
				const alive = new Set<string>();
				for (const file of this.store.vault.getMarkdownFiles()) {
					if (!this.store.contains(file.path)) continue;
					const path = file.path;
					alive.add(path);
					const signature = `${file.stat.mtime}:${file.stat.size}`;
					if (this.cache.get(path)?.signature === signature) continue;
					try { this.cache.set(path, { signature, saved: await this.store.read(path) }); }
					catch { this.cache.delete(path); }
				}
				for (const path of this.cache.keys()) if (!alive.has(path)) this.cache.delete(path);
				this.ordered = [...this.cache.values()].flatMap(value => value.saved ? [value.saved] : [])
					.sort((a, b) => a.entry.word.localeCompare(b.entry.word) || a.entry.languageName.localeCompare(b.entry.languageName));
				this.identities.clear();
				for (const saved of this.ordered) this.identities.set(entryKey(saved.entry), saved);
				this.error = undefined;
			} catch (error) { this.error = error instanceof Error ? error.message : 'Could not index dictionary.'; }
			if (!this.disposed) for (const listener of this.listeners) { try { listener(); } catch (error) { console.error("Popup Lexicon index listener", error); } }
		});
		return this.tail;
	}
	all(): SavedEntry[] { return this.ordered; }
	find(entry: DictionaryEntry): SavedEntry | undefined { return this.identities.get(entryKey(entry)); }
	search(query = '', language = ''): SavedEntry[] {
		const key = searchKey(query);
		return this.ordered.filter(({ entry }) => (!language || entry.languageCode === language) &&
			[entry.word, ...(entry.aliases || [])].some(value => searchKey(value).includes(key)));
	}
	languages(preferred = ''): { code: string; name: string }[] {
		const languages = new Map<string, string>();
		for (const { entry } of this.ordered) languages.set(entry.languageCode, entry.languageName);
		const order = preferred.toLowerCase().split(/[,\s]+/).filter(Boolean);
		const rank = (code: string) => { const index = order.indexOf(code.toLowerCase()); return index < 0 ? Number.MAX_SAFE_INTEGER : index; };
		return [...languages].map(([code, name]) => ({ code, name })).sort((a, b) => rank(a.code) - rank(b.code) || a.name.localeCompare(b.name));
	}
}
