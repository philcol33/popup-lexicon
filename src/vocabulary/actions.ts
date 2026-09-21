import { Notice } from 'obsidian';
import type PopupLexiconPlugin from '../main';
import { forSaving, fromWiktionary } from './adapter';
import type { DictionaryEntry, Encounter, SavedEntry } from './types';

/** The same small action row is used by popup, modal and browser. */
export function renderEntryActions(container: HTMLElement, plugin: PopupLexiconPlugin, entry: DictionaryEntry, encounter?: Encounter, onResolved?: (entry: DictionaryEntry) => void | Promise<void>): void {
	if (entry.needsLookup || entry.unavailable) {
		if (onResolved) {
			const load = container.createEl('button', { text: entry.needsLookup ? (entry.contentKind === 'translation' ? 'Load translations' : 'Load native definition') : 'Retry lookup' });
			load.onclick = async () => {
				load.disabled = true; load.textContent = 'Loading…';
				try {
					const language = await plugin.dict.lookupLanguage(entry.word, { code: entry.languageCode, name: entry.languageName, entries: [] });
					await onResolved(fromWiktionary({ word: entry.word, edition: language.edition || entry.languageCode, url: language.sourceUrl || '', langs: [language] }, language));
				} catch (e) { new Notice(String(e)); load.textContent = 'Retry lookup'; load.disabled = false; }
			};
		}
		return;
	}
	if (!entry.partsOfSpeech.length) return;
	const save = container.createEl('button', { text: '+ Add to Dictionary' });
	let saved: SavedEntry | undefined;
	let append: HTMLButtonElement | undefined;
	const refresh = () => {
		save.textContent = saved ? '✓ Saved · Open entry' : '+ Add to Dictionary';
		if (saved && encounter && !append) {
			append = container.createEl('button', { text: 'Add encounter' });
			append.onclick = async () => {
				append!.disabled = true;
				try {
					const added = await plugin.store.appendEncounter(saved!.path, encounter);
					new Notice(added ? 'Encounter added.' : 'This encounter is already saved.');
				} catch (e) { new Notice(String(e)); }
				finally { append!.disabled = false; }
			};
		}
	};
	void plugin.index.ready.then(() => { saved = plugin.index.find(entry); refresh(); }).catch(e => new Notice(String(e)));
	save.onclick = async () => {
		save.disabled = true;
		try {
			// Revalidate so a manually deleted/renamed entry never leaves a stale action.
			const existing = await plugin.store.find(entry);
			if (existing) { saved = existing; await plugin.app.workspace.openLinkText(existing.path, '', true); }
			else {
				const value = forSaving(entry, plugin.settings);
				if (encounter) value.encounters = [encounter];
				const result = await plugin.store.save(value);
				saved = result.saved;
				if (plugin.settings.openAfterSaving) await plugin.app.workspace.openLinkText(saved.path, '', true);
				new Notice(result.created ? `Saved ${entry.word} to ${entry.languageName}.` : 'Already saved.');
			}
			refresh();
		} catch (e) { new Notice(e instanceof Error ? e.message : 'Could not save entry.'); }
		finally { save.disabled = false; }
	};
}
