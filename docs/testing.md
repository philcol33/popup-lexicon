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
