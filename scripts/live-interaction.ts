/** Development-only integration checks against a real MarkdownView and DOM. */
import { MarkdownView, TFile } from 'obsidian';
export async function runInteractionSmoke(app: any): Promise<string> {
 if (app.vault.getName() !== 'Popup Lexicon Test') throw Error('Run only in the isolated test vault.');
 const plugin = app.plugins.plugins['popup-lexicon'];
 const checks: string[] = [];
 const check = (condition: unknown, message: string) => { if (!condition) throw Error(message); checks.push(message); };
 const path = 'Popup Lexicon Reading Example.md';
 let file = app.vault.getAbstractFileByPath(path);
 if (!file) file = await app.vault.create(path, '# Reading example\n\nA perspicacious reader notices an equivocal answer.\n');
 if (!(file instanceof TFile)) throw Error('Test note path is occupied.');
 const leaf = app.workspace.getLeaf('tab'); await leaf.openFile(file);
 const view = leaf.view as MarkdownView;
 if (!(view instanceof MarkdownView)) throw Error('MarkdownView did not open.');
 const line = view.editor.getValue().split('\n').findIndex(text => text.includes('perspicacious'));
 if (line < 0) throw Error('Test note was edited; preserving it.');
 const offset = view.editor.getLine(line).indexOf('perspicacious');
 view.editor.setSelection({ line, ch: offset }, { line, ch: offset + 'perspicacious'.length });
 plugin.lookupSelection(true);
 await plugin.dict.lookup('perspicacious');
 await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
 check(document.querySelector('.popup-lexicon-word')?.textContent === 'perspicacious', 'Selected-word command renders the correct popup');
 const save = [...document.querySelectorAll<HTMLButtonElement>('.popup-lexicon .lexicon-actions button')].find(button => button.textContent === '+ Add to Dictionary');
 if (save) {
  await save.onclick!(new MouseEvent('click'));
  const saved = (await plugin.store.list()).find((saved: any) => saved.entry.word === 'perspicacious' && saved.entry.languageCode === 'en');
  check(saved?.entry.encounters?.some((encounter: any) => encounter.sourcePath === path), 'Popup save captures the selected note context');
 } else {
  const append = [...document.querySelectorAll<HTMLButtonElement>('.popup-lexicon .lexicon-actions button')].find(button => button.textContent === 'Add encounter');
  check(!!append, 'Saved popup exposes Add encounter');
  await append!.onclick!(new MouseEvent('click'));
 }
 plugin.popup.hide();
 check(plugin.modifierMatches({ ctrlKey: true }) && plugin.modifierMatches({ metaKey: true }) && !plugin.modifierMatches({}), 'Default Ctrl/Cmd modifier behavior is preserved');
 // Place a temporary word inside the actual note view so caret-based hover and context both run.
 const fixture = view.containerEl.createEl('p', { text: 'An equivocal answer.' });
 fixture.style.cssText = 'position:fixed;left:400px;top:180px;z-index:9999;padding:20px;background:var(--background-primary);font-size:20px;';
 try {
  const range = document.createRange(); range.setStart(fixture.firstChild!, 3); range.setEnd(fixture.firstChild!, 12);
  const rect = range.getBoundingClientRect();
  plugin.handleHover(rect.left + rect.width / 2, rect.top + rect.height / 2);
  await plugin.dict.lookup('equivocal');
  await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
  check(document.querySelector('.popup-lexicon-word')?.textContent === 'equivocal', 'Caret-based hover detection renders the word under the pointer');
  check(plugin.currentEncounter?.sourcePath === path, 'Hover context resolves the actual source note');
 } finally { fixture.remove(); plugin.popup.hide(); }
 await plugin.openDictionary();
 return JSON.stringify(checks);
}
