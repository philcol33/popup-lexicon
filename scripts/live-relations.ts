import { Component, type App, TFile } from 'obsidian';
import { fromWiktionary } from '../src/vocabulary/adapter';
import { parseNativePage, parsePolishTranslations } from '../src/lookup/nativeWiktionary';
import { renderDefinition } from '../src/dictionary-view/DefinitionView';
import { VocabularyStore } from '../src/vocabulary/vocabularyStore';
import { saveWithAspectPartners } from '../src/vocabulary/saveRelated';
import perfectivePage from '../tests/fixtures/polish/zrobić.json';
import imperfectivePage from '../tests/fixtures/polish/robić.json';
import aestheticsPage from '../tests/fixtures/forms/native-Ästhetik.json';

/** Real Vault/Markdown/UI APIs with recorded source pages; no network dependency. */
export async function runRelationSmoke(app: App) {
 if (app.vault.getName() !== 'Popup Lexicon Test') throw Error('Test vault only');
 const plugin = (app as any).plugins.plugins['popup-lexicon'];
 const root = `Lexicon Relation QA ${Date.now()}`;
 const store = new VocabularyStore(app.vault, () => root);
 const owner = new Component(); owner.load();
 const checks: string[] = [];
 const adapt = (page: typeof perfectivePage) => {
  const language = parsePolishTranslations(page,'de')!;
  return fromWiktionary({word:page.title,edition:'pl',url:language.sourceUrl!,langs:[language]},language);
 };
 const perfective = adapt(perfectivePage), imperfective = adapt(imperfectivePage);
 try {
  let requests = 0;
  const lookup = async (word: string) => { if (word !== 'robić') throw Error('Unexpected recursive lookup'); requests++; return imperfective; };
  const saved = await saveWithAspectPartners(store,perfective,lookup);
  const partner = await store.find(imperfective);
  if (requests !== 1 || (await store.list()).length !== 2 || saved.warnings.length) throw Error('Partner creation');
  if (saved.saved.entry.aspects?.[0].path !== partner?.path || partner?.entry.aspects?.find(r=>r.word==='zrobić')?.path !== saved.saved.path) throw Error('Reciprocal links');
  const file = app.vault.getAbstractFileByPath(partner.path) as TFile;
  await app.vault.process(file,text => text + '\n## Personal note\n\nPreserve me.\n');
  const before = await app.vault.read(file);
  await saveWithAspectPartners(store,perfective,lookup);
  if (requests !== 1 || before !== await app.vault.read(file)) throw Error('Duplicate or manual edit changed');
  checks.push('zrobić creates robić once, reciprocal local links, repeat save preserves personal text');
  const element = document.createElement('div'); let opened = '';
  await renderDefinition(app,element,saved.saved.entry,owner,saved.saved.path,()=>true,word=>{opened=word;});
  element.querySelector<HTMLAnchorElement>('.lexicon-aspect a')!.click();
  if (opened !== 'robić' || !element.querySelector('.lexicon-aspect')?.textContent?.includes('aspekt dokonany od:')) throw Error('Aspect banner/navigation');
  if (!element.querySelector('table')) throw Error('Actual Obsidian table rendering');
  checks.push('Aspect banner and local navigation render above grammar with Obsidian Markdown tables');
  const language = parseNativePage(aestheticsPage.parse,{code:'de',name:'German',entries:[]})!;
  const aesthetics = fromWiktionary({word:'Ästhetik',edition:'de',url:language.sourceUrl!,langs:[language]},language);
  const rendered = document.createElement('div'); await renderDefinition(app,rendered,aesthetics,owner);
  const etymology=rendered.querySelector('.lexicon-section-label')!, meaning=rendered.querySelector('.lexicon-pos')!;
  if (!aesthetics.etymology?.match(/griech|Griech/) || !(etymology.compareDocumentPosition(meaning)&Node.DOCUMENT_POSITION_FOLLOWING)) throw Error('Ästhetik etymology ordering');
  checks.push('Real Ästhetik source etymology precedes German meanings');
  // Keep useful examples in the test dictionary; preserve existing definitions.
  await saveWithAspectPartners(plugin.store,perfective,async()=>imperfective);
  const aestheticSaved = await plugin.store.save(aesthetics);
  await plugin.store.appendLearningDetails(aestheticSaved.saved.path,aesthetics);
  await plugin.index.refresh(true);
  await plugin.openDictionary();
  const view = app.workspace.getLeavesOfType('popup-lexicon-dictionary')[0]?.view as any;
  await view.openWord('zrobić','pl');
  const link=view.contentEl.querySelector('.lexicon-aspect a');
  if(!link)throw Error('Dictionary aspect link missing');
  link.click();
  await new Promise(resolve=>setTimeout(resolve,150));
  if(view.contentEl.querySelector('h1')?.textContent!=='robić')throw Error('Dictionary partner navigation');
  await view.openWord('zrobić','pl');
  checks.push('Installed Dictionary view opens saved robić directly from zrobić');
  return checks;
 } finally {
  owner.unload();
  const folder=app.vault.getAbstractFileByPath(root); if(folder)await app.vault.trash(folder,true);
 }
}
