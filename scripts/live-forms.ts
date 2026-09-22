import { type App, TFile } from 'obsidian';
import { fromWiktionary } from '../src/vocabulary/adapter';
/** Isolated live check: canonical saves, duplicate prevention, offline lookup and visible labels. */
export async function runFormSmoke(app: App) {
 if (app.vault.getName() !== 'Popup Lexicon Test') throw Error('Test vault only');
 const plugin=(app as any).plugins.plugins['popup-lexicon'];const checks:string[]=[];
 for(const [query,code,lemma] of [['lubisz','pl','lubić'],['des Hauses','de','Haus'],['houses','en','house'],['chevaux','fr','cheval'],['mangeaient','fr','manger']]) {
  const result=await plugin.dict.lookup(query);const language=result?.langs.find((lang:any)=>lang.code===code);
  if(language?.headword!==lemma)throw Error(`${query}: wrong headword ${language?.headword} ${language?.unavailable||''}`);
  const entry=fromWiktionary(result,language);const saved=(await plugin.store.save(entry)).saved;
  const file=app.vault.getAbstractFileByPath(saved.path);if(!(file instanceof TFile))throw Error('Missing base file');
  const before=await app.vault.read(file);const count=(await plugin.store.list()).length;
  const duplicate=await plugin.store.save(entry);
  if(duplicate.created || (await plugin.store.list()).length!==count || await app.vault.read(file)!==before)throw Error('Duplicate save changed vocabulary');
  await plugin.index.refresh(true);
  if(!plugin.index.resolve(query,code).some((value:any)=>value.path===saved.path))throw Error('Missing offline form');
  checks.push(`${query} → ${lemma}: native lookup, canonical save, duplicate guard, offline form index`);
 }
 const ambiguous = await plugin.dict.lookup('went');
 const english = ambiguous.langs.find((lang:any)=>lang.code==='en');
 if (!english.lemmaChoices?.includes('go')) throw Error('Missing ambiguous English choice');
 const selected = await plugin.dict.lookupLanguage('went', {...english,lemma:'go'});
 if(selected.headword!=='go')throw Error('Irregular English choice did not resolve');
 plugin.popup.showResult({x:200,y:160},ambiguous);
 const choose=[...document.querySelectorAll<HTMLButtonElement>('.popup-lexicon .lexicon-actions button')].find(button=>button.textContent==='go');
 if(!choose?.onclick)throw Error('Missing popup base-choice button');
 await choose.onclick.call(choose,new MouseEvent('click'));
 if(plugin.popup.currentResult.langs.find((lang:any)=>lang.code==='en').headword!=='go')throw Error('Popup choice did not change the entry');
 plugin.popup.hide();
 checks.push('went exposes base choices; clicking go updates the popup to the canonical entry');
 await plugin.openDictionary();const view=app.workspace.getLeavesOfType('popup-lexicon-dictionary')[0].view as any;
 const original=plugin.dict.lookup;
 plugin.dict.lookup=async()=>{throw Error('Network must not be needed');};
 try {await view.lookup('lubisz');if(!view.contentEl.textContent.includes('lubisz → lubić'))throw Error('Local view did not show base');
  if((view.contentEl.textContent.match(/Translations → German/g)||[]).length!==1)throw Error('Duplicate translation label');
  await view.lookup('des Hauses');if(!view.contentEl.textContent.includes('des Hauses → Haus'))throw Error('Local German view did not show base');
  for(const query of ['houses','chevaux','mangeaient']) {await view.lookup(query);if(!view.contentEl.textContent.includes(query+' → '))throw Error('Missing offline '+query);}
  await view.lookup('lubisz');
 } finally {plugin.dict.lookup=original;}
 checks.push('Dictionary view resolves all five examples with network disabled and shows one translation heading');
 return checks;
}
