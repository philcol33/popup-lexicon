# Popup Lexicon

A multilingual dictionary and personal vocabulary manager inside Obsidian, with a quick lookup popup and a full dictionary browser inspired by Apple Dictionary.

Forked from [Popup Dictionary](https://github.com/ntsiris/obsidian-popup-dictionary) by **Nikitas Tsiris**. The original hover detection, modifier handling, Wiktionary discovery, request cache, selection lookup and popup behavior are retained. Original MIT attribution is preserved in [LICENSE](LICENSE).

## What it does

- **Cmd/Ctrl-hover** a word, or select text and run **Look up selected word**.
- Save the displayed language entry with **+ Add to Dictionary**, without another lookup.
- Save definitions, examples, available phonetics/etymology, provenance, and source-note encounters as ordinary Markdown.
- Detect duplicates by normalized headword + language. Open an existing note or append another encounter without replacing your writing.
- Run **Popup Lexicon: Search Dictionary** for manual online lookup.
- Run **Popup Lexicon: Open Dictionary**, or use the book ribbon icon, to browse your collection offline.
- Filter by dynamically discovered languages, search headwords/aliases without accents, navigate the word list with arrow keys, and use back/forward history.
- **Option/Alt-click a word in a definition** for local-first lookup. Ordinary text selection remains available.

## Definition languages

English words have English definitions. Other words use definitions from their **own language's Wiktionary edition**. **Polish is the exception: Polish → German translations**, taken from Polish Wiktionary's translation section. The Polish target language is configurable. Polish entries also include grammatical information, example sentences, usage notes and full inflections when the source provides them.

The upstream English endpoint still discovers language identities. Its non-English glosses are **never substituted** when native definitions are unavailable. French and German native layouts, generic ordered senses (including Japanese), and numbered definition lists (including Spanish) are supported. There is no supported-language allow-list: any discovered language may be requested, but availability depends on an active edition, an identifiable native section, and a supported page layout. Some pages, including some Luxembourgish entries, contain only examples/translations and no native definition; the plugin explains that and links to the source.

To keep lookup quick and avoid rate limits, at most two native editions load automatically. Additional languages have **Load native definition** / **Load translations** buttons. Native requests are cached and coalesced. Preferred ordering defaults to `en, de, fr, lb, pl`; this is ordering, not a restriction. The language filter reduces automatic lookups. Rate-limited failures can be retried after 30 seconds.

## Markdown is the database

```text
Dictionary/
  English/equivocal.md
  French/démarche.md
  German/nachvollziehbar.md
  Polish/dom.md
```

YAML frontmatter contains identity, timestamps, source, definition language, and whether the entry is a definition or translation. The readable body contains senses, examples, grammar, conjugation/inflection tables, usage notes, etymology and encounters. There is no hidden duplicate of the definitions in plugin data. Delete the plugin and the Markdown remains useful.

Open a saved entry to edit its Markdown. Preserve `word` and `language` in frontmatter and level-two headings for the parts of speech. Use numbered senses and indented blockquotes for examples. `## Etymology`, `## Source`, and `## Encounters` are reserved sections. Optional `aliases`, `pronunciation`, and `phonetics` are recognized. The in-memory index rebuilds from files and follows edits, renames and deletions.

Filenames preserve Unicode and remove filesystem-invalid characters. Existing unrelated files get a numbered filename suffix; they are never replaced. Encounters use atomic Vault updates and retain all other content. Source-note links are normal Obsidian-resolvable Markdown links.

## Settings

The dictionary root, save examples/all senses/pronunciation/etymology/context, automatic opening after save, preferred language ordering, Polish translation language, and popup save-button visibility are configurable. All original hover/selection/language-filter/example/definition-limit settings remain. The old single “Wiktionary edition” setting is superseded by automatic per-language routing.

Changing the root selects another collection; it does not move or rewrite existing files. Existing saved entries remain unchanged when lookup settings change.

## Development

Requires Node **22.13+** (24+ recommended) and Obsidian **1.7.2+**. Runtime has no additional third-party dependencies. Test utilities are development-only.

```sh
npm ci
npm test
npm run build
npm run dev  # watch and rebuild main.js
```

Use a separate test vault. Put the clone in `.obsidian/plugins/popup-lexicon/`, enable Popup Lexicon, and reload it after builds. Do not use your important vault for development. Optional community **Hot Reload** can automate reloading; it is not required.

When Obsidian's CLI is enabled:

```sh
obsidian vault="Popup Lexicon Test" plugin:reload id=popup-lexicon
obsidian vault="Popup Lexicon Test" dev:errors
```

Only `main.js`, `manifest.json`, and `styles.css` are needed for a manual installation. `main.js` is generated and ignored by Git. The distinct `popup-lexicon` ID and CSS classes permit coexistence with Popup Dictionary; disable one plugin's hover trigger if you do not want two popups.

See [architecture](docs/architecture.md), [implementation plan](docs/plan.md), and [validation](docs/testing.md).

## Privacy and licenses

Saved vocabulary, encountered note paths and context remain in the vault. Only the searched word is sent over HTTPS to Wiktionary: English Wiktionary for discovery and the selected native editions for definitions (Polish Wiktionary for Polish translations). There is no telemetry, translation service, account, API key or proprietary database. Normal Obsidian synchronization/backups apply to your Markdown.

Offline browsing uses local files only. Online lookup requires Wiktionary availability. Definitions and examples are © Wiktionary contributors under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/); entries retain their source URL and attribution. Code is MIT. The interface uses CSS and system fonts, with no Apple graphics or bundled font files.

## Polish learning details

Verb cards use **-m, -sz**, **-ę, -isz**, **-ę, -ysz**, and **-ę, -esz**, based on the attested *ja* and *ty* forms, with all six persons. Infinitive endings alone do not determine the group. Irregular forms and stem changes come from the source; forms are never generated from suffix rules. Perfective forms are labelled simple future.

Cards retain aspect/partner information, Polish example sentences, syntax, collocations and full inflections (including noun declensions) where available. Missing German translations do not discard available grammar. No example translations are invented. Wiktionary's Roman-numbered classes remain in the full inflection section, separate from learner groups.

For existing notes, use **Load Polish details**, then **Add missing grammar & examples**. Only absent sections are appended; existing content and manual edits are preserved. New entries save learning details automatically as editable Markdown, ready offline. The save-examples setting also controls the new example section.

Grammar reference: [University of Silesia conjugation chart](https://www.sjikp.us.edu.pl/wp-content/uploads/2020/11/koniugacje-4.pdf). Actual forms come from each entry's linked Polish Wiktionary source.
