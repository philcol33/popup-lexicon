import { dictionaryRoot } from "./vocabulary/paths";
import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import type PopupLexiconPlugin from "./main";

export type SelectionTrigger = "command" | "auto";
export type HoverModifier = "ctrl" | "alt" | "shift" | "none";

export interface PopupLexiconSettings {
 dictionaryRoot: string;
 polishTranslationLanguage: string;
 saveExamples: boolean;
 saveAllDefinitions: boolean;
 savePronunciation: boolean;
 saveEtymology: boolean;
 saveContext: boolean;
 openAfterSaving: boolean;
 preferredLanguages: string;
 showAddButton: boolean;
	/** Wiktionary edition to query; also the language the glosses are written in. */
	wiktionaryEdition: string;
	/** Comma-separated language codes to show; empty = show all. */
	filterLanguages: string;
	/** How a selected word is looked up. */
	triggerOnSelection: SelectionTrigger;
	hoverEnabled: boolean;
	hoverModifier: HoverModifier;
	hoverDelayMs: number;
	showExamples: boolean;
	maxDefinitionsPerEntry: number;
}

export const DEFAULT_SETTINGS: PopupLexiconSettings = {
 dictionaryRoot: 'Dictionary', polishTranslationLanguage: 'de', saveExamples: true, saveAllDefinitions: true,
 savePronunciation: true, saveEtymology: true, saveContext: true,
 openAfterSaving: false, preferredLanguages: 'en, de, fr, lb, pl', showAddButton: true,
	wiktionaryEdition: "en",
	filterLanguages: "",
	triggerOnSelection: "command",
	hoverEnabled: true,
	hoverModifier: "ctrl",
	hoverDelayMs: 300,
	showExamples: true,
	maxDefinitionsPerEntry: 5,
};

export class PopupLexiconSettingTab extends PluginSettingTab {
	private plugin: PopupLexiconPlugin;

	constructor(app: App, plugin: PopupLexiconPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		new Setting(containerEl).setName('Personal dictionary').setHeading();
		new Setting(containerEl).setName('Dictionary root folder').setDesc('Vault-relative folder. Changing this selects another collection; existing files are never moved.').addText(t => {
			t.setValue(this.plugin.settings.dictionaryRoot).setPlaceholder('Dictionary');
			t.inputEl.addEventListener('change', () => {
				try { this.plugin.settings.dictionaryRoot = dictionaryRoot(t.getValue()); void this.plugin.saveSettings(); }
				catch (e) { new Notice(String(e)); t.setValue(this.plugin.settings.dictionaryRoot); }
			});
		});
		const toggles: [keyof Pick<PopupLexiconSettings, 'saveExamples' | 'saveAllDefinitions' | 'savePronunciation' | 'saveEtymology' | 'saveContext' | 'openAfterSaving' | 'showAddButton'>, string, string][] = [
			['saveExamples', 'Save example sentences', 'Include every available example.'],
			['saveAllDefinitions', 'Save all definitions', 'When disabled, save the first sense of each part of speech.'],
			['savePronunciation', 'Save pronunciation', 'Save phonetics when the native Wiktionary page supplies them.'],
			['saveEtymology', 'Save etymology', 'When available; also supported in manually edited entries.'],
			['saveContext', 'Save source-note context', 'Capture nearby text and a link to the note locally.'],
			['openAfterSaving', 'Open entry after saving', 'Open the saved Markdown note in another tab.'],
			['showAddButton', 'Show Add button in popup', 'Manual search and dictionary view always offer saving.'],
		];
		for (const [key, name, description] of toggles) new Setting(containerEl).setName(name).setDesc(description).addToggle(t => t.setValue(this.plugin.settings[key]).onChange(async value => { this.plugin.settings[key] = value; await this.plugin.saveSettings(); }));
		new Setting(containerEl).setName('Preferred language ordering').setDesc('Comma-separated language codes, for example fr, de, en. Other languages remain available.').addText(t => t.setValue(this.plugin.settings.preferredLanguages).onChange(async value => { this.plugin.settings.preferredLanguages = value; await this.plugin.saveSettings(); }));
		new Setting(containerEl).setName('Instant lookup').setHeading();


		new Setting(containerEl).setName('Definition language').setDesc('English words use English definitions. Other languages use definitions from their native Wiktionary edition. Polish words use translations. No English-gloss fallback is used for native definitions.');
		new Setting(containerEl).setName('Polish translation language').setDesc('Language code for translations from Polish. Default: de (German).').addText(t => t.setValue(this.plugin.settings.polishTranslationLanguage).onChange(async value => {
			if (/^[a-z]{2,3}(?:-[a-z]{2,8})?$/.test(value.trim())) { this.plugin.settings.polishTranslationLanguage = value.trim(); await this.plugin.saveSettings(); }
		}));

		new Setting(containerEl)
			.setName("Show only these languages")
			.setDesc(
				'Comma-separated language codes to display (e.g. "en, el, ja"). ' +
					"Leave empty to show every language Wiktionary returns for the word."
			)
			.addText((t) =>
				t
					.setPlaceholder("(all languages)")
					.setValue(this.plugin.settings.filterLanguages)
					.onChange(async (v) => {
						this.plugin.settings.filterLanguages = v;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Selection trigger")
			.setDesc(
				'How looking up a selected word works. "Command / hotkey" runs only when ' +
					'you invoke the command; "Automatic" pops up whenever you select a word.'
			)
			.addDropdown((d) =>
				d
					.addOption("command", "Command / hotkey")
					.addOption("auto", "Automatic on selection")
					.setValue(this.plugin.settings.triggerOnSelection)
					.onChange(async (v) => {
						this.plugin.settings.triggerOnSelection =
							v as SelectionTrigger;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Enable hover lookup")
			.setDesc("Show definitions when hovering a word (desktop only).")
			.addToggle((t) =>
				t
					.setValue(this.plugin.settings.hoverEnabled)
					.onChange(async (v) => {
						this.plugin.settings.hoverEnabled = v;
						await this.plugin.saveSettings();
						this.display();
					})
			);

		if (this.plugin.settings.hoverEnabled) {
			new Setting(containerEl)
				.setName("Hover modifier key")
				.setDesc(
					"Hold this key while hovering to trigger a lookup. " +
						'"None" triggers on hover alone, which can be distracting.'
				)
				.addDropdown((d) =>
					d
						.addOption("ctrl", "Ctrl / Cmd")
						.addOption("alt", "Alt / Option")
						.addOption("shift", "Shift")
						.addOption("none", "None (hover only)")
						.setValue(this.plugin.settings.hoverModifier)
						.onChange(async (v) => {
							this.plugin.settings.hoverModifier =
								v as HoverModifier;
							await this.plugin.saveSettings();
						})
				);

			new Setting(containerEl)
				.setName("Hover delay")
				.setDesc(
					"How long (ms) the pointer must rest on a word before the lookup fires."
				)
				.addSlider((s) =>
					s
						.setLimits(0, 1000, 50)
						.setValue(this.plugin.settings.hoverDelayMs)
						.onChange(async (v) => {
							this.plugin.settings.hoverDelayMs = v;
							await this.plugin.saveSettings();
						})
				);
		}

		new Setting(containerEl)
			.setName("Show examples")
			.setDesc("Include example sentences with definitions when available.")
			.addToggle((t) =>
				t
					.setValue(this.plugin.settings.showExamples)
					.onChange(async (v) => {
						this.plugin.settings.showExamples = v;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Max definitions per part of speech")
			.setDesc("Limit how many senses are shown for each part of speech.")
			.addSlider((s) =>
				s
					.setLimits(1, 20, 1)
					.setValue(this.plugin.settings.maxDefinitionsPerEntry)
					.onChange(async (v) => {
						this.plugin.settings.maxDefinitionsPerEntry = v;
						await this.plugin.saveSettings();
					})
			);
	}
}
