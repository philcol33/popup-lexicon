# Validation

## Automated

`npm test` runs Node's test runner against bundled TypeScript with an in-memory Vault mock and jsdom. Tests cover Markdown round trips, Unicode filenames, collisions, concurrent duplicates, atomic encounter append, manual body edits, deletes/renames, index rebuilding, aliases/accent search, history, offline view rendering, missing optional fields, preserved upstream request coalescing/lowercase fallback, native French/German extraction, Polish → German translations, absent native definitions, and bounded lazy loading.

`npm run build` includes the TypeScript check and production esbuild bundle. Test DOM rendering mocks Obsidian's Markdown renderer, so it complements live checks rather than replacing them.

## Live Obsidian 1.13.7 — isolated Popup Lexicon Test vault

- Unchanged upstream baseline built and registered its command/settings before feature implementation.
- Renamed Popup Lexicon loads in the isolated vault.
- Dictionary pane visually inspected in the actual dark theme.
- Saved French entry, local accent-insensitive search, back navigation, and external lookup inspected through the UI.
- “ubiquitous” saved using the actual Add button; saved-state and local list updated.
- Manual search modal rendered separate language entries for “bonjour”.
- Live Vault API checks passed: Unicode create, duplicate prevention, append preservation, encounter round trip, index search, folder rename, and deletion.
- Native French definitions, German definitions, and Polish → German translations fetched and saved through the running plugin. Existing generated English-gloss French/German demos were archived to the test vault's local trash before replacement.
- Real native page parsing additionally checked against Spanish and Japanese page structures. A Luxembourgish page without native senses correctly reports unavailable.
- Selected-word command, caret-based hover detection, default Cmd/Ctrl modifier matching, popup save and source-note encounter capture all passed in a real MarkdownView.
- No captured developer-console errors after storage/native/interaction checks.

The temporary runtime harness is separate from the production plugin and is disabled/removed after checking. `scripts/live-smoke.ts` and `scripts/live-interaction.ts` contain the development-only checks; their vault-name guard prevents accidental execution in another vault. Temporary content is confined to the test vault, and no personal vault data is committed.

## Further release QA

Check light theme, split panes, slow/offline transitions and keyboard navigation in a normal interactive session when changing UI behavior. Mobile-specific polish and detached pop-out windows are outside the first implementation; upstream listeners remain attached to the main window. Native template coverage is intentionally conservative: source pages that cannot be parsed never fall back to another language.

## Polish grammar (0.5.0)

Offline fixtures cover pracować, robić, bić, być, zrobić, wiedzieć, uczyć się and dom. Checks cover learner groups based on attested forms, -ić exceptions, irregular/reflexive forms, perfective future labelling, source examples, merged/nested tables, editable Markdown round trips and missing-section enrichment without overwrites. Fixtures have source/licence attribution.

`scripts/live-polish.ts` runs only in `Popup Lexicon Test`. Five live entries passed native-source lookup, six-person table rendering, popup rendering, save/read and actual Obsidian Markdown rendering. These sample entries remain available in the test vault. The temporary QA plugin is disabled and removed after verification.

## Inflected forms (0.6.0)

Regression fixtures cover Polish lubisz/lubić, German Hauses/Haus, English houses/house and went/go, and French chevaux/cheval and mangeaient/manger. Tests verify per-language identities, native definitions, canonical source links, phrase fallback, duplicate prevention, editable offline form keys, ambiguous choices, synonym exclusion, cycle detection and the single translation heading.

`scripts/live-forms.ts` checks all five unambiguous examples in the isolated test vault: native source lookup, canonical save, repeated save without a duplicate or changed note, and dictionary lookup with network calls disabled. It also checks the explicit went → go choice. Generated sample base entries remain in the test vault.

## Aspect partners and etymology (0.6.0)

The automated suite includes 38 checks. New coverage verifies explicit Polish source relations, legacy italic grammar labels, automatic one-time partner creation, reciprocal local links, partial failures, preservation of personal notes, English etymology supplementation, real German Ästhetik source extraction, and etymology-first rendering/storage for non-Polish languages.

`scripts/live-relations.ts` uses recorded Wiktionary pages with real Obsidian Vault/Markdown/UI APIs. It verifies partner creation, repeat saves, manual-text preservation, links in both directions, actual table rendering, Ästhetik etymology order and navigation from zrobić to the local robić entry. Temporary test entries are trashed after the check; useful examples are retained in the test dictionary.
