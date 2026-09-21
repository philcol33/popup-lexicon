import { VocabularyIndex } from "./vocabulary/vocabularyIndex";
import { DictionarySearchModal } from "./dictionary-view/SearchModal";
import { renderEntryActions } from "./vocabulary/actions";
import { captureEncounter } from "./vocabulary/context";
import type { Encounter } from "./vocabulary/types";
import { VocabularyStore } from "./vocabulary/vocabularyStore";
import { fromWiktionary } from "./vocabulary/adapter";
import { Notice, Plugin } from "obsidian";
import {
	DEFAULT_SETTINGS,
	PopupLexiconSettingTab,
	type PopupLexiconSettings,
} from "./settings";
import { DictionaryClient } from "./dictionary";
import { DefinitionPopup, type Anchor } from "./popup";
import { getSelectedWord, getWordAtPoint } from "./wordDetection";

const SELECTION_DEBOUNCE_MS = 250;
const LEAVE_GRACE_MS = 200;

export default class PopupLexiconPlugin extends Plugin {
	settings: PopupLexiconSettings;

	dict: DictionaryClient;
	store: VocabularyStore;
	index: VocabularyIndex;
	private popup: DefinitionPopup;
	private currentEncounter?: Encounter;

	// hover state
	private hoverTimer: number | null = null;
	private hoverWord: string | null = null;
	private leaveTimer: number | null = null;
	private selectionTimer: number | null = null;

	async onload(): Promise<void> {
		await this.loadSettings();

		this.dict = new DictionaryClient(() => this.settings.wiktionaryEdition);
		this.store = new VocabularyStore(this.app.vault, () => this.settings.dictionaryRoot);
		this.index = this.addChild(new VocabularyIndex(this.store));
		this.popup = new DefinitionPopup(() => this.settings, (container, result, language) => {
			if (!this.settings.showAddButton) return;
			renderEntryActions(container, this, fromWiktionary(result, language), this.currentEncounter);
		});
		this.popup.setHoverHandlers(
			() => this.cancelLeave(),
			() => this.scheduleLeave()
		);

		this.addSettingTab(new PopupLexiconSettingTab(this.app, this));

		this.addCommand({
			id: "lookup-selection",
			name: "Look up selected word",
			callback: () => this.lookupSelection(true),
		});

		this.addCommand({ id: 'search-dictionary', name: 'Search Dictionary', callback: () => new DictionarySearchModal(this).open() });

		// Automatic lookup when a word is selected (if enabled).
		this.registerDomEvent(activeDocument, "selectionchange", () => {
			if (this.settings.triggerOnSelection !== "auto") return;
			this.debouncedSelection();
		});

		// Hover lookup.
		this.registerDomEvent(activeDocument, "mousemove", (evt: MouseEvent) =>
			this.onMouseMove(evt)
		);

		// Dismissers.
		this.registerDomEvent(activeDocument, "keydown", (evt: KeyboardEvent) => {
			if (evt.key === "Escape" && this.popup.isVisible()) {
				this.popup.hide();
				this.hoverWord = null;
			}
		});
		this.registerDomEvent(
			activeDocument,
			"mousedown",
			(evt: MouseEvent) => {
				if (
					this.popup.isVisible() &&
					!this.popup.contains(evt.target as Node)
				) {
					this.popup.hide();
					this.hoverWord = null;
				}
			},
			true
		);
		this.registerDomEvent(
			activeDocument,
			"scroll",
			(evt: Event) => {
				if (!this.popup.isVisible()) return;
				if (this.popup.contains(evt.target as Node)) return; // scrolling inside popup
				if (this.popup.isPinned()) return;
				this.popup.hide();
				this.hoverWord = null;
			},
			true
		);
	}

	onunload(): void {
		this.clearHoverTimer();
		this.cancelLeave();
		if (this.selectionTimer !== null) window.clearTimeout(this.selectionTimer);
		this.popup?.hide();
	}

	async loadSettings(): Promise<void> {
		const stored = (await this.loadData()) as Partial<PopupLexiconSettings>;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, stored);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
		await this.index?.refresh();
	}

	// ---- Selection ----------------------------------------------------------

	private debouncedSelection(): void {
		if (this.selectionTimer !== null) window.clearTimeout(this.selectionTimer);
		this.selectionTimer = window.setTimeout(() => {
			this.selectionTimer = null;
			this.lookupSelection(false);
		}, SELECTION_DEBOUNCE_MS);
	}

	private lookupSelection(notifyIfEmpty: boolean): void {
		const hit = getSelectedWord(window);
		if (!hit) {
			if (notifyIfEmpty) {
				new Notice("Select a word first.");
			}
			return;
		}
		void this.run(hit.word, hit.rect, window.getSelection()?.anchorNode || null);
	}

	// ---- Hover --------------------------------------------------------------

	private onMouseMove(evt: MouseEvent): void {
		if (!this.settings.hoverEnabled) return;

		if (!this.modifierMatches(evt)) {
			this.clearHoverTimer();
			return;
		}
		// Don't re-trigger while the pointer is over the popup itself.
		if (this.popup.isVisible() && this.popup.contains(evt.target as Node)) {
			return;
		}

		const x = evt.clientX;
		const y = evt.clientY;
		this.clearHoverTimer();
		this.hoverTimer = window.setTimeout(() => {
			this.hoverTimer = null;
			this.handleHover(x, y);
		}, Math.max(0, this.settings.hoverDelayMs));
	}

	private handleHover(x: number, y: number): void {
		if (this.popup.isPinned()) return;
		const hit = getWordAtPoint(activeDocument, x, y);
		if (!hit) return;
		if (hit.word === this.hoverWord && this.popup.isVisible()) return;
		this.hoverWord = hit.word;
		this.cancelLeave();
		void this.run(hit.word, hit.range.getBoundingClientRect(), hit.range.startContainer);
	}

	private modifierMatches(evt: MouseEvent): boolean {
		switch (this.settings.hoverModifier) {
			case "ctrl":
				return evt.ctrlKey || evt.metaKey;
			case "alt":
				return evt.altKey;
			case "shift":
				return evt.shiftKey;
			case "none":
				return true;
			default:
				return false;
		}
	}

	private scheduleLeave(): void {
		this.cancelLeave();
		this.leaveTimer = window.setTimeout(() => {
			this.leaveTimer = null;
			if (!this.popup.isPinned()) {
				this.popup.hide();
				this.hoverWord = null;
			}
		}, LEAVE_GRACE_MS);
	}

	private cancelLeave(): void {
		if (this.leaveTimer !== null) {
			window.clearTimeout(this.leaveTimer);
			this.leaveTimer = null;
		}
	}

	private clearHoverTimer(): void {
		if (this.hoverTimer !== null) {
			window.clearTimeout(this.hoverTimer);
			this.hoverTimer = null;
		}
	}

	// ---- Shared lookup + render --------------------------------------------

	private async run(word: string, anchor: Anchor, node: Node | null = null): Promise<void> {
		this.currentEncounter = this.settings.saveContext ? captureEncounter(this.app, node, word) : undefined;
		this.popup.showLoading(anchor, word);
		try {
			const result = await this.dict.lookup(word);
			if (this.popup.word !== word) return; // superseded or dismissed
			if (!result) {
				this.popup.showNotFound(anchor, word);
			} else {
				this.popup.showResult(anchor, result);
			}
		} catch (e) {
			if (this.popup.word !== word) return;
			this.popup.showError(anchor, word, errorMessage(e));
		}
	}
}

function errorMessage(e: unknown): string {
	return e instanceof Error ? e.message : "Lookup failed.";
}
