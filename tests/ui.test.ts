import { matchesEntryForm } from '../src/vocabulary/forms';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { DictionaryView } from '../src/dictionary-view/DictionaryView';
import { DEFAULT_SETTINGS } from '../src/settings';
import { fromWiktionary } from '../src/vocabulary/adapter';
import { renderDefinition } from '../src/dictionary-view/DefinitionView';
import { Component } from './obsidian-mock';

const dom = new JSDOM('<!doctype html><body></body>');
Object.assign(globalThis, { window: dom.window, document: dom.window.document, Node: dom.window.Node });
const prototype = dom.window.HTMLElement.prototype as any;
prototype.createEl = function(tag: string, options: any = {}) {
 const el = document.createElement(tag);
 if (options.cls) el.className = options.cls;
 if (options.text) el.textContent = options.text;
 for (const key of ['type', 'href', 'placeholder']) if (options[key]) el.setAttribute(key, options[key]);
 for (const [key, value] of Object.entries(options.attr || {})) el.setAttribute(key, String(value));
 this.append(el); return el;
};
prototype.createDiv = function(options: any) { return this.createEl('div', options); };
prototype.createSpan = function(options: any) { return this.createEl('span', options); };
prototype.empty = function() { this.replaceChildren(); };
prototype.addClass = function(value: string) { this.classList.add(value); };
prototype.toggleClass = function(value: string, enabled: boolean) { this.classList.toggle(value, enabled); };

const local = { path: 'Dictionary/French/démarche.md', entry: { word: 'démarche', languageCode: 'fr', languageName: 'French', partsOfSpeech: [{ type: 'noun', meanings: [{ definition: 'A way of proceeding.', examples: ['Une démarche utile.'] }] }] } };
function makeView(saved = [local]) {
 let subscriber: () => void = () => {};
 let network = 0;
 const app = { workspace: { openLinkText: async () => {} } };
 const plugin: any = {
  app, settings: { ...DEFAULT_SETTINGS },
  index: { ready: Promise.resolve(), all: () => saved, find: (entry: any) => saved.find(s => s.entry.word === entry.word),
   resolve: (query: string, language: string) => saved.filter(s => (!language || s.entry.languageCode === language) && matchesEntryForm(s.entry, query)),
   search: (query: string, language: string) => saved.filter(s => (!language || s.entry.languageCode === language) && s.entry.word.normalize('NFD').replace(/\p{M}/gu, '').includes(query.normalize('NFD').replace(/\p{M}/gu, ''))),
   languages: () => saved.length ? [{ code: 'fr', name: 'French' }] : [],
   subscribe: (fn: () => void) => { subscriber = fn; return () => { subscriber = () => {}; }; } },
  dict: { lookup: async () => { network++; throw Error('Offline'); } }, store: { find: async () => local }
 };
 const view = new DictionaryView({ app } as never, plugin);
 return { view, plugin, network: () => network, changed: () => subscriber() };
}
test('dictionary pane browses local words offline and shows a useful external error', async () => {
 const { view, network } = makeView(); await view.onOpen();
 const root = view.contentEl;
 assert.match(root.textContent!, /démarche/); assert.match(root.textContent!, /Une démarche utile/);
 assert.equal(root.querySelectorAll('[role=option]').length, 1);
 await view.lookup('démarche'); assert.equal(network(), 0);
 await view.lookup('missing'); assert.equal(network(), 1); assert.match(root.textContent!, /Offline/);
 await view.onClose();
});
test('empty collection renders without requiring external lookup', async () => {
 const { view, network } = makeView([]); await view.onOpen();
 assert.match(view.contentEl.textContent!, /A world of words/); assert.equal(network(), 0);
 await view.onClose();
});
test('shared renderer handles optional phonetics/etymology and preserves source attribution', async () => {
 const root = document.createElement('article');
 await renderDefinition({} as never, root, { ...local.entry, pronunciation: 'də.maʁʃ', etymology: 'A test origin.', source: { provider: 'Wiktionary', url: 'https://en.wiktionary.org/wiki/démarche', license: 'CC BY-SA 4.0' } }, new Component() as never);
 assert.match(root.textContent!, /də.maʁʃ/); assert.match(root.textContent!, /A test origin/);
 assert.equal(root.querySelector('a')?.getAttribute('rel'), 'noopener noreferrer');
});
test('adapter keeps language identity, parts of speech and examples without a network call', () => {
 const language = { code: 'lb', name: 'Luxembourgish', entries: [{ partOfSpeech: 'noun', definitions: [{ html: '<b>Wuert</b>', examples: ['<i>Beispill</i>'] }] }] };
 const value = fromWiktionary({ word: 'Wuert', edition: 'en', langs: [language], url: 'https://en.wiktionary.org/wiki/Wuert' }, language);
 assert.equal(value.languageCode, 'lb'); assert.equal(value.partsOfSpeech[0].meanings[0].examples![0], 'Beispill');
 assert.equal(value.pronunciation, undefined);
});

import { parseNativePage, parsePolishTranslations, fetchNativeSection } from '../src/lookup/nativeWiktionary';
import { DictionaryClient } from '../src/dictionary';
import { setRequestHandler } from './obsidian-mock';
const frenchPage = { title: 'essai', text: '<div class="mw-parser-output"><div class="mw-heading"><h2><span id="fr">Français</span></h2></div><div class="mw-heading"><h3>Étymologie</h3></div><dl><dd>Une origine française.</dd></dl><div class="mw-heading"><h3>Nom commun</h3></div><p><span class="API">\\ɛ.sɛ\\</span></p><ol><li>Une définition en français.<ul><li>Un exemple français.</li></ul></li></ol><div class="mw-heading"><h3>Traductions</h3></div><ol><li>NOT A DEFINITION</li></ol><div class="mw-heading"><h2><span id="en">Anglais</span></h2></div><h3>Nom commun</h3><ol><li>NOT THE FRENCH ENTRY</li></ol></div>' };
const germanPage = { title: 'Test', text: '<div class="mw-parser-output"><h2>Test (Deutsch)</h2><h3>Substantiv</h3><p>Aussprache:</p><dl><dd><span class="ipa">tɛst</span></dd></dl><p>Bedeutungen:</p><dl><dd>[1] Eine deutsche Definition.</dd></dl><p>Herkunft:</p><dl><dd>Eine Herkunft.</dd></dl><p>Synonyme:</p><dl><dd>[1] Prüfung</dd></dl><p>Beispiele:</p><dl><dd>[1] Ein deutscher Beispielsatz.</dd></dl><h4>Übersetzungen</h4><ol><li>IGNORE</li></ol></div>' };
const polishPage = { title: 'dom', text: '<h2>dom (<span id="pl">język polski</span>)</h2><dl><dt><span data-field="znaczenia">znaczenia:</span></dt><dd>POLISH DEFINITION MUST NOT BE RETURNED</dd></dl><dl><dt><span data-field="tlumaczenia">tłumaczenia:</span></dt></dl><ul><li>angielski: house</li><li>niemiecki: (1.1) <a href="/wiki/Haus">Haus</a>; (1.2) Zuhause</li></ul><dl><dt><span data-field="zrodla">źródła:</span></dt></dl><h2>dom (another language)</h2>' };
test('French parser selects French native senses, examples, phonetics and etymology only', () => {
 const value = parseNativePage(frenchPage, { code: 'fr', name: 'French', entries: [] })!;
 assert.equal(value.entries.length, 1); assert.equal(value.entries[0].definitions[0].html, 'Une définition en français.');
 assert.deepEqual(value.entries[0].definitions[0].examples, ['Un exemple français.']);
 assert.equal(value.pronunciation, 'ɛ.sɛ'); assert.match(value.etymology!, /origine française/);
 assert.equal(value.definitionLanguage, 'fr'); assert.match(value.sourceUrl!, /^https:\/\/fr\./);
});
test('German paragraph labels preserve German definitions and attach sense examples', () => {
 const value = parseNativePage(germanPage, { code: 'de', name: 'German', entries: [] })!;
 assert.equal(value.entries.length, 1); assert.equal(value.entries[0].definitions[0].html, 'Eine deutsche Definition.');
 assert.deepEqual(value.entries[0].definitions[0].examples, ['Ein deutscher Beispielsatz.']);
 assert.equal(value.pronunciation, 'tɛst');
});
test('Polish returns German translations instead of Polish or English definitions', () => {
 const value = parsePolishTranslations(polishPage, 'de')!;
 assert.equal(value.definitionLanguage, 'de'); assert.equal(value.contentKind, 'translation');
 assert.match(value.entries[0].definitions[0].html, /Haus/); assert.doesNotMatch(value.entries[0].definitions[0].html, /house|POLISH DEFINITION/);
 assert.equal(parsePolishTranslations(polishPage, 'ja'), null);
});
test('unsupported native page structures never silently fall back to English glosses', async () => {
 setRequestHandler(async () => ({ status: 200, json: { parse: { title: 'word', text: '<h2>Other language</h2><ol><li>wrong</li></ol>' } } }));
 const result = await fetchNativeSection('word', { code: 'lb', name: 'Luxembourgish', entries: [{ partOfSpeech: 'noun', definitions: [{ html: 'English translation', examples: [] }] }] });
 assert.equal(result.entries.length, 0); assert.ok(result.unavailable);
});
test('shared client applies native policy and Polish-to-German routing', async () => {
 let requests = 0;
 setRequestHandler(async ({ url }) => {
  requests++;
  if (url.includes('fr.wiktionary')) return { status: 200, json: { parse: frenchPage } };
  if (url.includes('pl.wiktionary')) return { status: 200, json: { parse: polishPage } };
  return { status: 200, json: { fr: [{ language: 'French', partOfSpeech: 'noun', definitions: [{ definition: 'Wrong English gloss' }] }], pl: [{ language: 'Polish', partOfSpeech: 'noun', definitions: [{ definition: 'Wrong English translation' }] }] } };
 });
 const client = new DictionaryClient(() => 'en', () => ({ filterLanguages: '', polishTranslationLanguage: 'de' }));
 const result = await client.lookup('test');
 assert.equal(result!.langs[0].definitionLanguage, 'fr'); assert.equal(result!.langs[1].definitionLanguage, 'de');
 assert.doesNotMatch(JSON.stringify(result), /Wrong English/);
 await client.lookup('test'); assert.equal(requests, 3);
 await assert.rejects(client.lookup('x'.repeat(81)), /80 characters/);
});
test('ambiguous words load at most two native editions automatically and expose the rest on demand', async () => {
 const calls: string[] = [];
 setRequestHandler(async ({ url }) => {
  calls.push(url);
  if (url.includes('/w/api.php')) return { status: 200, json: { parse: frenchPage } };
  return { status: 200, json: Object.fromEntries(['fr', 'de', 'pl', 'ja', 'es'].map(code => [code, [{ language: code, partOfSpeech: 'noun', definitions: [{ definition: 'Discovery gloss' }] }]])) };
 });
 const client = new DictionaryClient(() => 'en', () => ({ filterLanguages: '', polishTranslationLanguage: 'de', preferredLanguages: 'fr, de, pl' }));
 const result = await client.lookup('test');
 assert.equal(calls.length, 3); assert.equal(result!.langs.filter(lang => lang.needsLookup).length, 3);
 const deferred = result!.langs.find(lang => lang.code === 'pl')!;
 await Promise.all([client.lookupLanguage('test', deferred), client.lookupLanguage('test', deferred)]);
 assert.equal(calls.length, 4);
});

import { readFileSync } from 'node:fs';
import { conjugationGroup } from '../src/lookup/polishGrammar';
import { parseMarkdown, writeMarkdown } from '../src/vocabulary/markdown';
import { forSaving } from '../src/vocabulary/adapter';
function polishFixture(word: string) { return JSON.parse(readFileSync(`tests/fixtures/polish/${word}.json`, 'utf8')); }
test('learner groups use attested ja/ty forms, including reflexives and suffix exceptions', () => {
 for (const [ja, ty, group] of [['czytam','czytasz','-m, -sz'],['rozumiem','rozumiesz','-m, -sz'],['wiem','wiesz','-m, -sz'],['robię','robisz','-ę, -isz'],['uczę się','uczysz się','-ę, -ysz'],['pracuję','pracujesz','-ę, -esz'],['biję','bijesz','-ę, -esz']]) assert.equal(conjugationGroup(ja,ty),group);
 assert.equal(conjugationGroup('jestem','jesteś'),undefined);
 assert.equal(conjugationGroup('formę / inną','formisz'),undefined);
});
test('real Polish pages retain translations, aspect, examples and source conjugations', () => {
 for(const [word, group, form] of [['pracować','-ę, -esz','pracują'], ['robić','-ę, -isz','robią'], ['bić','-ę, -esz','biją'], ['wiedzieć','-m, -sz','wiedzą'], ['uczyć się','-ę, -ysz','uczą się']]) {
  const result = parsePolishTranslations(polishFixture(word), 'de')!;
  assert.ok(result, word); assert.match(result.grammar!, /czasownik/);
  assert.ok(result.conjugation!.includes(group),word); assert.ok(result.conjugation!.includes(form),word);
  assert.ok(result.usageExamples!.length,word); assert.ok(result.inflection!.includes('czas przeszły'),word);
  assert.doesNotMatch(result.inflection!, /<style|display:|<script/);
 }
 const irregular = parsePolishTranslations(polishFixture('być'),'de')!;
 assert.match(irregular.conjugation!, /nieregularna/); assert.match(irregular.conjugation!, /są/);
 const wiedziec = parsePolishTranslations(polishFixture('wiedzieć'),'de')!;
 assert.match(wiedziec.conjugation!, /Besonderheit.*wiedzą/);
 const perfective = parsePolishTranslations(polishFixture('zrobić'),'de')!;
 assert.match(perfective.conjugation!, /Czas przyszły prosty/); assert.doesNotMatch(perfective.conjugation!, /Präsens/);
 const noun = parsePolishTranslations(polishFixture('dom'),'de')!;
 assert.equal(noun.conjugation,undefined); assert.match(noun.inflection!, /domami/);
});
test('conjugation and merged inflection tables survive Markdown and offline rendering', async () => {
 const language = parsePolishTranslations(polishFixture('pracować'),'de')!;
 const entry = fromWiktionary({word:'pracować',edition:'pl',url:language.sourceUrl!,langs:[language]},language);
 assert.match(entry.conjugation!, /\| ja \| pracuję \|/);
 assert.match(entry.inflection!, /\| czas przeszły \| m \| pracowałem/);
 assert.match(entry.inflection!, /\| czas przeszły \| ż \| pracowałam/);
 assert.match(entry.inflection!, /będziemy/); assert.match(entry.inflection!, /forma potencjalna/);
 const saved = parseMarkdown(writeMarkdown(entry))!;
 for(const key of ['grammar','conjugation','inflection','usageExamples','usageNotes'] as const) assert.deepEqual(saved[key],entry[key]);
 const modified = parseMarkdown(writeMarkdown(entry).replace('pracuję','MOJA FORMA'))!;
 assert.match(modified.conjugation!,/MOJA FORMA/);
 assert.equal(forSaving(entry,{...DEFAULT_SETTINGS,saveExamples:false}).usageExamples,undefined);
 const root=document.createElement('div'); await renderDefinition({} as never,root,saved,new Component() as never);
 assert.match(root.textContent!, /Conjugation/); assert.match(root.textContent!, /pracuję/); assert.match(root.textContent!,/Rolnik/);
});

import { inflectionLemma } from '../src/lookup/wordForms';
import { entryForms } from '../src/vocabulary/forms';
const formFixture = (word: string) => JSON.parse(readFileSync(`tests/fixtures/forms/${word}.json`, 'utf8'));
function formRequests() {
 const calls: string[] = [];
 setRequestHandler(async ({url}) => {
  calls.push(url);
  if(url.includes('/w/api.php')) {const page=new URL(url).searchParams.get('page')!;return {status:200,json:formFixture('native-'+page)};}
  const word=decodeURIComponent(url.split('/').pop()!);
  if(word.toLowerCase()==='des hauses')return {status:404,json:{}};
  return {status:200,json:formFixture(word)};
 });
 return calls;
}
test('inflected Polish/German queries resolve per-language canonical identities and native content',async()=>{
 formRequests();
 const client=new DictionaryClient(()=> 'en',()=>({filterLanguages:'pl,de',polishTranslationLanguage:'de'}));
 const pl=await client.lookup('lubisz');const language=pl!.langs.find(l=>l.code==='pl')!;
 assert.equal(language.headword,'lubić');assert.equal(language.lookupForm,'lubisz');assert.match(language.conjugation!,/lubisz/);
 const entry=fromWiktionary(pl!,language);assert.equal(entry.word,'lubić');assert.deepEqual(entry.aliases,['lubisz']);
 assert.match(entry.source!.url!,/lubi%C4%87/);assert.match(entry.partsOfSpeech[0].meanings[0].definition,/mögen/);
 const phrase=await client.lookup('des Hauses');assert.equal(phrase!.langs.length,1);
 const german=phrase!.langs[0];assert.equal(german.code,'de');assert.equal(german.headword,'Haus');assert.equal(german.lookupForm,'des Hauses');
 const haus=fromWiktionary(phrase!,german);assert.ok(matchesEntryForm(haus,'Hauses'));assert.ok(matchesEntryForm(haus,'des Hauses'));assert.ok(matchesEntryForm(haus,'Häusern'));
 assert.equal((await client.lookup('Hauses'))!.langs.find(l=>l.code==='de')!.lookupForm,'Hauses');
 const parsed=parseMarkdown(writeMarkdown(entry))!;assert.equal(parsed.word,'lubić');assert.ok(entryForms(parsed).includes('lubisz'));
});
test('synonyms, mixed senses and competing lemmas are not silently merged',()=>{
 const section=(definitions:string[])=>({code:'pl',name:'Polish',entries:[{partOfSpeech:'Verb',definitions:definitions.map(html=>({html,examples:[]}))}]});
 const form=(prefix:string,word:string)=>`<span class="form-of-definition">${prefix} of <span class="form-of-definition-link"><i lang="pl"><a href="/wiki/${word}#Polish">${word}</a></i></span></span>`;
 assert.equal(inflectionLemma(section([form('synonym','kochać')])),undefined);
 assert.equal(inflectionLemma(section([form('second-person singular present','lubić'),'An independent meaning.'])),undefined);
 assert.equal(inflectionLemma(section([form('plural','dom'),form('plural','duma')])),undefined);
 assert.equal(inflectionLemma(section([form('second-person singular present','lubić')])),'lubić');
});
test('saved conjugations open the base word offline and translation heading appears only once',async()=>{
 const entry={word:'lubić',languageCode:'pl',languageName:'Polish',contentKind:'translation' as const,definitionLanguage:'de',partsOfSpeech:[{type:'Translations → German',meanings:[{definition:'mögen'}]}],conjugation:'| Osoba | Forma |\n| --- | --- |\n| ja | lubię |\n| ty | lubisz |'};
 const {view,network}=makeView([{path:'Dictionary/Polish/lubić.md',entry}] as any);await view.onOpen();await view.lookup('lubisz');
 assert.equal(network(),0);assert.match(view.contentEl.textContent!,/lubisz → lubić/);
 assert.equal((view.contentEl.textContent!.match(/Translations → German/g)||[]).length,1);await view.onClose();
});
test('lemma resolution cycles fail safely without creating a saveable inflected entry',async()=>{
 setRequestHandler(async()=>({status:200,json:{pl:[{language:'Polish',partOfSpeech:'Verb',definitions:[{definition:'<span class="form-of-definition">plural of <span class="form-of-definition-link"><i lang="pl"><a href="/wiki/loop">loop</a></i></span></span>'}]}]}}));
 const client=new DictionaryClient(()=> 'en',()=>({filterLanguages:'pl',polishTranslationLanguage:'de'}));
 const value=await client.lookup('loop');assert.ok(value!.langs[0].unavailable);assert.equal(value!.langs[0].entries.length,0);
});

test('English/French inflections preserve native definitions and expose ambiguous base-word choices',async()=>{
 formRequests();
 const client=new DictionaryClient(()=> 'en',()=>({filterLanguages:'en,fr',polishTranslationLanguage:'de'}));
 for(const [query,code,lemma] of [['houses','en','house'],['chevaux','fr','cheval'],['mangeaient','fr','manger']]) {
  const result=await client.lookup(query);const language=result!.langs.find(l=>l.code===code)!;
  assert.equal(language.headword,lemma);assert.equal(language.definitionLanguage,code);
  const value=fromWiktionary(result!,language);assert.equal(value.word,lemma);assert.deepEqual(value.aliases,[query]);assert.ok(value.partsOfSpeech.length);
  if(code==='fr'){assert.match(value.source!.url!,/^https:\/\/fr.wiktionary/);assert.doesNotMatch(value.partsOfSpeech[0].meanings[0].definition,/^horse$|^to eat$/);}
 }
 const went=await client.lookup('went');const ambiguous=went!.langs.find(l=>l.code==='en')!;
 assert.equal(ambiguous.lemma,undefined);assert.deepEqual(ambiguous.lemmaChoices,['go','wend']);
 const selected=await client.lookupLanguage('went',{...ambiguous,lemma:'go'});
 assert.equal(selected.headword,'go');assert.equal(selected.lookupForm,'went');assert.equal(fromWiktionary(went!,selected).word,'go');
});

import { aspectsFromGrammar } from '../src/vocabulary/aspect';
test('Polish aspect partners are explicit, distinct headwords and shown above meanings',async()=>{
 const language=parsePolishTranslations(polishFixture('zrobić'),'de')!;
 assert.deepEqual(language.aspects?.map(value=>[value.kind,value.word]),[['perfective','robić']]);
 const value=fromWiktionary({word:'zrobić',edition:'pl',url:language.sourceUrl!,langs:[language]},language);
 const root=document.createElement('div');await renderDefinition({} as never,root,value,new Component() as never);
 assert.match(root.textContent!,/aspekt dokonany od: robić/);
 assert.ok(root.textContent!.indexOf('aspekt dokonany')<root.textContent!.indexOf('Grammar'));
 const parsed=parseMarkdown(writeMarkdown(value))!;assert.deepEqual(parsed.aspects,value.aspects);
 assert.equal(aspectsFromGrammar('_czasownik przechodni dokonany_ ([ndk.](https://pl.wiktionary.org/wiki/Aneks:X) [robić](https://pl.wiktionary.org/wiki/robi%C4%87))','zrobić')[0]?.word,'robić');
});
test('etymology precedes meanings for English/French/German while Polish keeps its existing order',async()=>{
 for(const languageCode of ['en','fr','de','pl']) {
  const value={...local.entry,languageCode,etymology:'ETYMOLOGY MARKER',partsOfSpeech:[{type:'Noun',meanings:[{definition:'MEANING MARKER'}]}]};
  const root=document.createElement('div');await renderDefinition({} as never,root,value,new Component() as never);
  const text=root.textContent!;assert.equal(text.indexOf('ETYMOLOGY MARKER')<text.indexOf('MEANING MARKER'),languageCode!=='pl');
  const md=writeMarkdown(value);assert.equal(md.indexOf('## Etymology')<md.indexOf('## Noun'),languageCode!=='pl');
 }
});


test('Ästhetik source etymology is extracted and retained before its German meaning',async()=>{
 const language=parseNativePage(formFixture('native-Ästhetik').parse,{code:'de',name:'German',entries:[]})!;
 assert.ok(language);assert.match(language.etymology!,/griech|Griech/);
 const entry=fromWiktionary({word:'Ästhetik',edition:'de',url:language.sourceUrl!,langs:[language]},language);
 const root=document.createElement('div');await renderDefinition({} as never,root,entry,new Component() as never);
 assert.ok(root.querySelector('.lexicon-section-label')!.compareDocumentPosition(root.querySelector('.lexicon-pos')!) & Node.DOCUMENT_POSITION_FOLLOWING);
 assert.match(parseMarkdown(writeMarkdown(entry))!.etymology!,/griech|Griech/);
});

test('English lookups supplement REST meanings with native etymology',async()=>{
 setRequestHandler(async({url})=>({status:200,json:url.includes('/w/api.php')?{parse:{title:'example',text:'<h2>English</h2><h3>Etymology</h3><p>From Latin exemplum.</p><h3>Noun</h3><ol><li>A representative instance.</li></ol>'}}:{en:[{language:'English',partOfSpeech:'Noun',definitions:[{definition:'A representative instance.'}]}]}}));
 const client=new DictionaryClient(()=> 'en',()=>({filterLanguages:'en',polishTranslationLanguage:'de'}));
 const result=await client.lookup('example');assert.match(result!.langs[0].etymology!,/exemplum/);
 assert.equal(result!.langs[0].entries[0].definitions[0].html,'A representative instance.');
});
