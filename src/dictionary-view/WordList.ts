import type { SavedEntry } from '../vocabulary/types';

const ROW_HEIGHT = 48;
/** Windowed DOM keeps large collections responsive; search still covers every entry. */
export class WordList {
	private items: SavedEntry[] = [];
	private selected = '';
	constructor(private root: HTMLElement, private select: (saved: SavedEntry) => void) {
		root.addClass('lexicon-word-list'); root.tabIndex = 0;
		root.setAttribute('role', 'listbox'); root.setAttribute('aria-label', 'Saved words');
		root.addEventListener('scroll', () => this.paint());
		root.addEventListener('keydown', event => {
			if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
			event.preventDefault();
			const current = this.items.findIndex(item => item.path === this.selected);
			const next = Math.max(0, Math.min(this.items.length - 1, current + (event.key === 'ArrowDown' ? 1 : -1)));
			if (!this.items[next]) return;
			this.root.scrollTop = Math.max(0, next * ROW_HEIGHT - this.root.clientHeight / 2);
			this.select(this.items[next]);
		});
	}
	update(items: SavedEntry[], selected = '', resetScroll = false): void {
		this.items = items; this.selected = selected;
		if (resetScroll) this.root.scrollTop = 0;
		this.paint();
	}
	private paint(): void {
		const start = Math.min(Math.max(0, this.items.length - 1), Math.max(0, Math.floor(this.root.scrollTop / ROW_HEIGHT) - 5));
		const end = Math.min(this.items.length, start + Math.ceil((this.root.clientHeight || 600) / ROW_HEIGHT) + 12);
		this.root.empty();
		this.root.createDiv().style.height = `${start * ROW_HEIGHT}px`;
		this.items.slice(start, end).forEach((saved, offset) => {
			const row = this.root.createDiv({ cls: 'lexicon-word-row', attr: { role: 'option', 'aria-selected': String(saved.path === this.selected), 'aria-posinset': String(start + offset + 1), 'aria-setsize': String(this.items.length) } });
			row.toggleClass('is-selected', saved.path === this.selected);
			row.createDiv({ cls: 'lexicon-word-title', text: saved.entry.word });
			row.createDiv({ cls: 'lexicon-word-language', text: saved.entry.languageName });
			row.onclick = () => { this.root.focus(); this.select(saved); };
		});
		this.root.createDiv().style.height = `${Math.max(0, this.items.length - end) * ROW_HEIGHT}px`;
	}
}
