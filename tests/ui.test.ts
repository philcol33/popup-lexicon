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
