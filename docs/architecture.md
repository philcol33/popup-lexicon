# Architecture

## Upstream baseline (0.3.1)

Popup Lexicon forks [Popup Dictionary by Nikitas Tsiris](https://github.com/ntsiris/obsidian-popup-dictionary), MIT.

`src/main.ts` owns plugin lifecycle, DOM listeners, selection command, modifier matching, debounce, hover/leave timers and asynchronous lookup orchestration. `wordDetection.ts` uses caret ranges and Intl.Segmenter with a Unicode regex fallback; selected text is bounded to 80 characters. These algorithms are retained.

Lookup flow: pointer/selection → WordHit → main.run → DictionaryClient.lookup → cached/in-flight Wiktionary request → DictionaryResult with language sections → DefinitionPopup.showResult.

`dictionary.ts` calls the English Wiktionary REST definition endpoint, caches up to 200 results, coalesces requests and retries lowercase titles. Each language has parts of speech, HTML definitions and examples. The current endpoint/parser does **not** expose pronunciation or etymology. No second API is introduced.

`popup.ts` sanitizes HTML using Obsidian, applies language and definition limits, normalizes links, positions the popup and preserves pin/dismiss behavior. `settings.ts` owns settings/defaults and the PluginSettingTab; `styles.css` uses theme variables.

Build: npm install; npm run build (TypeScript noEmit, then esbuild CommonJS bundle). npm run dev watches changes. Upstream has no tests.

## Environment and baseline

macOS arm64; Git 2.50.1; Node 25.9.0; npm 11.12.1; gh authenticated as philcol33. Obsidian 1.13.7 installed. VS Code CLI not on PATH; initial /Applications scan did not find the app, but later desktop inventory reported a VS Code installation. Cursor is installed. Isolated test vault is the workspace sibling above this plugin, never the registered main vault. The unchanged baseline built successfully and loaded its command/settings in Obsidian. Automated selection through the command palette did not retain a valid DOM selection; the final fork adds an editor-selection fallback and subsequently passed live hover/selection checks (see testing.md).

Origin: philcol33/popup-lexicon. Upstream: ntsiris/obsidian-popup-dictionary. CSS classes and plugin ID are renamed to avoid collisions.

## Popup Lexicon additions

- `vocabulary/types.ts`: common Markdown-friendly DictionaryEntry; language identity is separate from definition/translation language.
- `vocabulary/adapter.ts`: sanitized Wiktionary HTML → portable Markdown, preserving links and source edition.
- `vocabulary/markdown.ts`: frontmatter writer/parser; senses live in the body, not a hidden database. Reserved sections parse examples, etymology and encounters.
- `vocabulary/vocabularyStore.ts`: Vault-only creation, duplicate checks, collision handling, atomic narrow updates and encounter append. Saves are serialized.
- `vocabulary/vocabularyIndex.ts`: rebuildable memory cache by path/mtime/size, sorted headwords, aliases, language filters, dirty-file invalidation and vault-event refresh.
- `vocabulary/context.ts`: resolves the MarkdownView containing the hit and captures nearby text. Selected-word commands additionally use the editor selection when the command palette clears the DOM selection.
- `vocabulary/actions.ts`: save/open/append/lazy-load actions shared across surfaces.
- `dictionary-view/DefinitionView.ts`: shared local/external Markdown rendering with component lifecycle and stale-result checks.
- `dictionary-view/SearchModal.ts`: manual search through the same DictionaryClient.
- `dictionary-view/DictionaryView.ts`: ItemView, local-first lookup, dynamic filters, navigation and Option/Alt-click exploration.
- `dictionary-view/WordList.ts`: fixed-height windowed rows, so thousands of entries do not create thousands of DOM elements.
- `dictionary-view/history.ts`: bounded history, deduplicated visits and forward-branch truncation.

## Native-language policy (user clarification)

The original endpoint provides English glosses. The requested final policy is English → English definitions; every other language → native definitions; **Polish → German translations**. This required extending the shared client, rather than leaving the upstream endpoint as the only source.

`lookup/nativeWiktionary.ts` uses the documented [MediaWiki parse API](https://www.mediawiki.org/wiki/API:Parsing_wikitext) on the matching Wiktionary edition. It positively identifies the target language section using codes and localized language names, parses ordered/numbered senses or German paragraph labels, and extracts pronunciation/etymology where present. Polish uses its explicit German translation list. Failure never falls back to the discovery gloss. Native loading is bounded (two automatic editions), cached and coalesced; additional languages load on demand. The source is recorded per language section.

Final flow: upstream word detection → shared cached discovery → native section / Polish translations → popup or DictionaryEntry adapter → shared browser renderer → Vault Markdown → rebuildable index → offline browser.

Native page formats vary. Lack of native definitions, unsupported page structure, unavailable editions or rate limits produce an explicit unavailable result with a source link. Such results cannot be saved as vocabulary. The English REST parser and word-boundary algorithms remain intact apart from a maximum input length guard.

## Polish grammar details

`lookup/polishGrammar.ts` extracts field-marked source sections and builds six-person cards from the attested present/simple-future rows. Group classification uses ja/ty, never infinitive suffixes. Ambiguous forms are not guessed. The shared result/entry models carry grammar, conjugation, inflection, example sentences and usage notes (HTML at the source boundary; Markdown after adaptation). `vocabulary/htmlTables.ts` expands merged cells and separates nested tables for portable Markdown. The Markdown body is authoritative for every added field.

Explicit enrichment uses Vault.process to append only missing learning sections. It validates word/language identity and leaves even deliberately empty existing sections unchanged. Normal duplicate saves still never overwrite.
