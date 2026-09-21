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
