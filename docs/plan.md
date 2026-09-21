# Popup Lexicon specification and milestones

Build a fast lookup popup and a separate Apple Dictionary-inspired Obsidian ItemView. Preserve upstream lookup, language filtering, modifier behavior and settings. Markdown files are the canonical database; removing the plugin leaves readable vocabulary. Never touch the main vault or overwrite unrelated files.

- [x] 0: Fork, clone, remotes, isolated vault, baseline build/load, rename, architecture
- [x] 1: Language-specific popup save action
- [x] 2: Markdown store, safe Unicode paths, duplicate detection
- [x] 3: Rich portable entries and round-trip parser
- [x] 4: Source-note encounters; append without replacing user content
- [ ] 5: Manual search reusing DictionaryClient
- [ ] 6: Rebuildable local index, live edits/deletes/renames
- [ ] 7: ItemView, dynamic languages, local search, shared definition renderer
- [ ] 8: Back/forward, local-first exploration

## Data and behavior

One DictionaryEntry per headword/language. Language names come from Wiktionary, never spelling guesses. Optional pronunciation/etymology are supported without fabricated data. Frontmatter holds identity and provenance; body holds definitions, examples, etymology and encounters. Saving uses Vault API, collision-safe filenames, no silent replacement. Index rebuilds entirely from Markdown and never requires internet.

Settings: root folder, save examples/all senses/pronunciation/etymology/context, auto-open, language ordering and popup save-button visibility, plus upstream controls.

Browser: system typography, themed colors, alphabetical sidebar, dynamic language tabs, accent-insensitive headword/alias filtering, external lookup fallback, open Markdown entry, history. Definition exploration should preserve ordinary selection.

## Validation

At each implementation stage run typecheck/build and available tests. Add storage/parser/history tests for Unicode, accents, apostrophes, hyphens, multiple languages, missing data, collisions, edits, deleted entries, folder renames and empty/offline dictionary. Use only synthetic test-vault content. Track actual live checks separately from automated coverage.

## Deferred

Favorites UI, spaced repetition, audio/TTS, translation, import/export, integrations and mobile-specific polish. No Apple assets/fonts. Hot Reload optional, not required.
