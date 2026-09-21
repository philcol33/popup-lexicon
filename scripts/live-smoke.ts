/** Development-only smoke test, evaluated through Obsidian's developer CLI. */
import { TFile, htmlToMarkdown } from 'obsidian';
import { fromWiktionary } from '../src/vocabulary/adapter';
import { parseMarkdown } from '../src/vocabulary/markdown';

export async function runLiveSmoke(app: any): Promise<string> {
 if (app.vault.getName() !== 'Popup Lexicon Test') throw Error('Run only in the isolated Popup Lexicon Test vault.');
 const plugin = app.plugins.plugins['popup-lexicon'];
 if (!plugin) throw Error('Popup Lexicon is not enabled.');
 const checks: string[] = [];
 const check = (condition: unknown, message: string) => { if (!condition) throw Error(message); checks.push(message); };
 const result = await plugin.dict.lookup('démarche');
 const french = result.langs.find((lang: any) => lang.code === 'fr');
 const entry = fromWiktionary(result, french);
 check(entry.word === 'démarche' && entry.partsOfSpeech.length > 0 && entry.definitionLanguage === 'fr', 'Live French definitions retain French content and identity');
 check(typeof htmlToMarkdown === 'function', 'Actual Obsidian HTML-to-Markdown API is available');
 const root = `Lexicon QA ${Date.now()}`;
 const previousRoot = plugin.settings.dictionaryRoot;
 try {
  plugin.settings.dictionaryRoot = root;
  const first = await plugin.store.save(entry);
  const second = await plugin.store.save(entry);
  check(first.created && !second.created && first.saved.path === second.saved.path, 'Actual Vault API creates once and detects duplicate');
  const file = app.vault.getAbstractFileByPath(first.saved.path);
  check(file instanceof TFile, 'Unicode Markdown filename created');
  await plugin.store.appendEncounter(file.path, { sourcePath: 'Welcome.md', context: 'This démarche is a development test.', date: '2026-09-21' });
  await app.vault.process(file, (content: string) => content + '\n## Personal note\n\nKeep my exact manual note.\n');
  await plugin.store.appendEncounter(file.path, { sourcePath: 'Welcome.md', context: 'Another encounter.', date: '2026-09-22' });
  const body = await app.vault.read(file);
  check(body.includes('Keep my exact manual note.'), 'Appending preserves user Markdown');
  check(parseMarkdown(body)?.encounters?.length === 2, 'Two source-note encounters round-trip');
  await plugin.index.refresh(true);
  check(plugin.index.search('dem').length === 1, 'Accent-insensitive index search works');
  const folder = app.vault.getAbstractFileByPath(`${root}/French`);
  await app.vault.rename(folder, `${root}/Français`);
  await plugin.index.refresh();
  check(plugin.index.all()[0].path.includes('Français/'), 'Index follows language-folder rename');
  const renamed = app.vault.getAbstractFileByPath(plugin.index.all()[0].path);
  await app.vault.trash(renamed, false);
  await plugin.index.refresh();
  check(plugin.index.all().length === 0, 'Index removes deleted vocabulary');
 } finally {
  plugin.settings.dictionaryRoot = previousRoot;
  const folder = app.vault.getAbstractFileByPath(root);
  if (folder) await app.vault.trash(folder, false);
  await plugin.index.refresh(true);
 }
 // Leave genuine, attributed examples in the dedicated test vault for manual exploration.
 const examples = [entry];
 for (const [word, code] of [['equivocal', 'en'], ['nachvollziehbar', 'de'], ['dom', 'pl']]) {
  const filter = plugin.settings.filterLanguages;
  try {
   plugin.settings.filterLanguages = code;
   const result = await plugin.dict.lookup(word);
   let language = result?.langs.find((lang: any) => lang.code === code);
   if (language?.needsLookup) language = await plugin.dict.lookupLanguage(word, language);
   check(language && !language.unavailable, `Live ${code} lookup is available`);
   examples.push(fromWiktionary(result, language));
  } finally { plugin.settings.filterLanguages = filter; }
 }
 for (const example of examples) {
  await plugin.store.save(example);
 }
 await plugin.index.refresh(true);
 check(plugin.index.all().some((s: any) => s.entry.languageCode === 'de' && s.entry.definitionLanguage === 'de'), 'German definitions are saved in German');
 check(plugin.index.all().some((s: any) => s.entry.languageCode === 'pl' && s.entry.definitionLanguage === 'de' && s.entry.contentKind === 'translation'), 'Polish entries save German translations');
 check(plugin.index.languages().length >= 4, 'Four real language collections are ready in the test vault');
 return JSON.stringify({ checks, entries: plugin.index.all().map((saved: any) => saved.path) });
}
