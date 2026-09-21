import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeMarkdown, parseMarkdown } from '../src/vocabulary/markdown';
import { dictionaryRoot, safeFilename } from '../src/vocabulary/paths';
import { VocabularyStore } from '../src/vocabulary/vocabularyStore';
import { TFile, TFolder } from 'obsidian';
import type { DictionaryEntry } from '../src/vocabulary/types';

const entry: DictionaryEntry = {
 word: 'démarche', languageCode: 'fr', languageName: 'French',
 pronunciation: 'də.maʁʃ', aliases: ['approche'],
 partsOfSpeech: [{ type: 'noun', meanings: [{ definition: 'An **approach** or way of proceeding.', examples: ['Cette démarche est utile.', 'Another example.'], synonyms: ['approach'] }, { definition: 'A step.' }] }],
 etymology: 'From French.', source: { provider: 'Wiktionary', url: 'https://en.wiktionary.org/wiki/d%C3%A9marche', license: 'CC BY-SA 4.0' },
 encounters: [{ sourcePath: 'Reading/Notes [test].md', context: 'Cette démarche est utile.', date: '2026-09-21' }]
};
class MemoryVault {
 on() { return () => {}; }
 files = new Map<string, TFile | TFolder>(); contents = new Map<string, string>();
 getAbstractFileByPath(path: string) { return this.files.get(path) || null; }
 getMarkdownFiles() { return [...this.files.values()].filter(f => f instanceof TFile); }
 async cachedRead(file: TFile) { return this.contents.get(file.path)!; }
 async createFolder(path: string) { if (this.files.has(path)) throw Error('Exists'); const folder = new TFolder(path); this.files.set(path, folder); return folder; }
 async create(path: string, data: string) { if (this.files.has(path)) throw Error('Exists'); const file = new TFile(path); this.files.set(path, file); this.contents.set(path, data); return file; }
 async process(file: TFile, fn: (data: string) => string) { const data = fn(this.contents.get(file.path)!); this.contents.set(file.path, data); return data; }
}
const setup = () => { const vault = new MemoryVault(); return { vault, store: new VocabularyStore(vault as never, () => 'Dictionary') }; };

test('portable Markdown round-trips all available fields, examples and Unicode', () => {
 const parsed = parseMarkdown(writeMarkdown(entry))!;
 assert.deepEqual(parsed.partsOfSpeech, entry.partsOfSpeech);
 assert.deepEqual(parsed.encounters, entry.encounters);
 assert.equal(parsed.pronunciation, entry.pronunciation);
 assert.equal(parsed.etymology, entry.etymology);
 assert.equal(parsed.source?.url, entry.source?.url);
 assert.ok(!writeMarkdown(entry).includes('partsOfSpeech:'));
});
test('manual body edits are authoritative and missing optional fields work', () => {
 const parsed = parseMarkdown(writeMarkdown(entry).replace('A step.', 'An edited action.'))!;
 assert.equal(parsed.partsOfSpeech[0].meanings[1].definition, 'An edited action.');
 const minimal = parseMarkdown('---\nword: 猫\nlanguage: ja\n---\n# 猫\n\n## noun\n\n1. A cat.\n')!;
 assert.equal(minimal.word, '猫'); assert.equal(minimal.pronunciation, undefined);
 assert.equal(parseMarkdown('---\nword: [broken\n---\n'), null);
});
test('Unicode, apostrophes, hyphens and filename safety', () => {
 for (const word of ['démarche', "l'esprit", 'well-being', '日本語', 'Lëtzebuergesch']) assert.equal(safeFilename(word), word);
 assert.equal(safeFilename('de\u0301marche'), 'démarche');
 assert.equal(safeFilename('../../bad:*?'), '_.._bad___');
 assert.ok(new TextEncoder().encode(safeFilename('猫'.repeat(150))).length <= 180);
 for (const root of ['../main', '/tmp', '.obsidian', 'Dictionary/../main', 'A//B', 'A\\B']) assert.throws(() => dictionaryRoot(root));
 assert.equal(dictionaryRoot('Vocabulary/Words/'), 'Vocabulary/Words');
});
test('concurrent duplicate saves never overwrite; language identity remains separate', async () => {
 const { vault, store } = setup();
 const results = await Promise.all([store.save(entry), store.save({ ...entry, word: 'de\u0301marche' })]);
 assert.equal(results.filter(r => r.created).length, 1);
 const original = vault.contents.get(results[0].saved.path);
 await store.save({ ...entry, partsOfSpeech: [] });
 assert.equal(vault.contents.get(results[0].saved.path), original);
 await store.save({ ...entry, languageCode: 'en', languageName: 'English' });
 assert.equal((await store.list()).length, 2);
});
test('unrelated files and sanitized filename collisions are preserved', async () => {
 const { vault, store } = setup();
 await vault.create('Dictionary/French/démarche.md', 'My personal note');
 const saved = await store.save(entry);
 assert.equal(saved.saved.path, 'Dictionary/French/démarche (2).md');
 assert.equal(vault.contents.get('Dictionary/French/démarche.md'), 'My personal note');
 await store.save({ ...entry, word: 'a/b' });
 await store.save({ ...entry, word: 'a:b' });
 assert.equal((await store.list()).length, 3);
});
test('offline enumeration follows manual changes, deletion and language folder rename', async () => {
 const { vault, store } = setup();
 assert.deepEqual(await store.list(), []);
 const { saved } = await store.save(entry);
 const body = vault.contents.get(saved.path)!;
 vault.files.delete(saved.path); vault.contents.delete(saved.path);
 await vault.create('Dictionary/Français/renamed.md', body.replace('word: démarche', 'word: néanmoins'));
 assert.equal((await store.list())[0].entry.word, 'néanmoins');
 assert.equal((await store.list())[0].path, 'Dictionary/Français/renamed.md');
 vault.files.clear(); assert.deepEqual(await store.list(), []);
});
test('encounters append atomically without replacing manual notes or repeating context', async () => {
 const { vault, store } = setup();
 const { saved } = await store.save(entry);
 vault.contents.set(saved.path, vault.contents.get(saved.path)! + '\n## My notes\n\nKeep this exact text.\n');
 const encounter = { sourcePath: 'Another note.md', context: 'A second démarche.', date: '2026-09-22' };
 assert.equal(await store.appendEncounter(saved.path, encounter), true);
 assert.equal(await store.appendEncounter(saved.path, encounter), false);
 assert.equal((await store.read(saved.path))!.entry.encounters?.length, 2);
 assert.ok(vault.contents.get(saved.path)!.endsWith('## My notes\n\nKeep this exact text.\n'));
});

import { NavigationHistory } from '../src/dictionary-view/history';
import { searchKey } from '../src/vocabulary/vocabularyIndex';
test('history goes back/forward, replaces repeated entries and truncates a branched future', () => {
 const history = new NavigationHistory<string>(value => value, 3);
 history.push('a'); history.push('a'); assert.equal(history.canBack, false);
 history.push('b'); history.push('c'); assert.equal(history.back(), 'b');
 assert.equal(history.back(), 'a'); assert.equal(history.back(), undefined);
 assert.equal(history.forward(), 'b'); history.push('d'); assert.equal(history.canForward, false);
 assert.equal(history.back(), 'b');
});
test('instant local search folds accents while preserving multilingual text', () => {
 assert.equal(searchKey('DÉMARCHE'), 'demarche'); assert.equal(searchKey('de\u0301marche'), 'demarche');
 assert.equal(searchKey('日本語'), '日本語');
});

import { VocabularyIndex } from '../src/vocabulary/vocabularyIndex';
import { DictionaryClient } from '../src/dictionary';
import { setRequestHandler } from './obsidian-mock';
test('index rebuilds from files, filters arbitrary languages/aliases, and follows root changes', async () => {
 const { vault, store } = setup();
 await store.save(entry);
 await store.save({ ...entry, word: 'nachvollziehbar', languageCode: 'de', languageName: 'German' });
 const index = new VocabularyIndex(store);
 await index.refresh();
 assert.equal(index.search('dem')[0].entry.word, 'démarche');
 assert.equal(index.search('approche', 'fr').length, 1);
 assert.deepEqual(index.languages('de, fr').map(l => l.code), ['de', 'fr']);
 const original = [...vault.files.keys()].find(path => path.endsWith('démarche.md'))!;
 vault.files.delete(original);
 await index.refresh(); assert.equal(index.search('', 'fr').length, 0);
 assert.equal(index.all().length, 1);
 let root = 'Dictionary';
 const dynamic = new VocabularyIndex(new VocabularyStore(vault as never, () => root));
 await dynamic.refresh(); assert.equal(dynamic.all().length, 1);
 root = 'Other'; await dynamic.refresh(); assert.equal(dynamic.all().length, 0);
});
test('upstream lookup coalesces requests, retains multilingual senses and retries lowercase', async () => {
 let requests = 0;
 setRequestHandler(async ({ url }) => { requests++; return url.endsWith('/Equivocal') ? { status: 404 } : { status: 200, json: {
  en: [{ language: 'English', partOfSpeech: 'adjective', definitions: [{ definition: 'Having more than one reading.', parsedExamples: [{ example: 'An equivocal answer.' }] }] }],
  fr: [{ language: 'French', partOfSpeech: 'noun', definitions: [{ definition: 'A synthetic test definition.', examples: ['Un exemple.'] }] }]
 } }; });
 const client = new DictionaryClient(() => 'en');
 const [a, b] = await Promise.all([client.lookup('Equivocal'), client.lookup('Equivocal')]);
 assert.strictEqual(a, b); assert.equal(requests, 2); assert.equal(a!.langs.length, 2);
 assert.equal(a!.langs[0].entries[0].definitions[0].examples[0], 'An equivocal answer.');
 await client.lookup('Equivocal'); assert.equal(requests, 2);
 setRequestHandler(async () => ({ status: 501 }));
 await assert.rejects(new DictionaryClient(() => 'fr').lookup('test'), /only supports the English edition/);
 setRequestHandler(async () => { throw Error('Offline'); });
 await assert.rejects(new DictionaryClient(() => 'en').lookup('test'), /offline/);
});
