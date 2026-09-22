import { Component, type App, TFile } from 'obsidian';
import { fromWiktionary } from '../src/vocabulary/adapter';
import { renderDefinition } from '../src/dictionary-view/DefinitionView';
import { parseMarkdown } from '../src/vocabulary/markdown';

/** Development smoke check, confined to the isolated vault. Creates useful sample entries. */
export async function runPolishSmoke(app: App) {
 if (app.vault.getName() !== 'Popup Lexicon Test') throw new Error('Test vault only');
 const plugin = (app as any).plugins.plugins['popup-lexicon'];
 const checks: string[] = [];
 for (const [word, expected] of [['pracować','-ę, -esz'], ['robić','-ę, -isz'], ['wiedzieć','wiedzą'], ['być','nieregularna'], ['zrobić','Czas przyszły prosty']]) {
  const language = await plugin.dict.lookupLanguage(word,{code:'pl',name:'Polish',entries:[]});
  if (!language.conjugation?.includes(expected)) throw Error(`${word}: missing ${expected}: ${language.unavailable || ''}`);
  const result = {word,edition:'pl',url:language.sourceUrl,langs:[language]};
  const entry = fromWiktionary(result,language);
  if (!entry.usageExamples?.length || !entry.inflection?.includes('|')) throw Error(`${word}: missing examples/table`);
  const saved = (await plugin.store.save(entry)).saved;
  const file = app.vault.getAbstractFileByPath(saved.path);
  if (!(file instanceof TFile)) throw Error('Missing file');
  const reread = parseMarkdown(await app.vault.read(file))!;
  if (reread.conjugation !== saved.entry.conjugation) throw Error(`${word}: Markdown roundtrip`);
  const component = new Component(); component.load(); const root = document.createElement('div');
  try {
   await renderDefinition(app,root,reread,component,saved.path);
   if (root.querySelectorAll('table')[0]?.querySelectorAll('tbody tr').length !== 6) throw Error(`${word}: six-person rendered table`);
  } finally { component.unload(); root.remove(); }
  plugin.popup.showResult({x:200,y:160},result);
  if (!document.querySelector('.popup-lexicon .lexicon-grammar table')) throw Error(`${word}: popup table`);
  plugin.popup.hide(); checks.push(`${word}: live source, six-person table, save/read, Markdown rendering, popup`);
 }
 await plugin.openDictionary();
 const view = app.workspace.getLeavesOfType('popup-lexicon-dictionary')[0]?.view as any;
 if(view?.lookup) await view.lookup('pracować');
 return checks;
}
