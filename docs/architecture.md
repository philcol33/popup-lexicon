# Architecture

## Upstream baseline (0.3.1)

Popup Lexicon forks [Popup Dictionary by Nikitas Tsiris](https://github.com/ntsiris/obsidian-popup-dictionary), MIT.

`src/main.ts` owns plugin lifecycle, DOM listeners, selection command, modifier matching, debounce, hover/leave timers and asynchronous lookup orchestration. `wordDetection.ts` uses caret ranges and Intl.Segmenter with a Unicode regex fallback; selected text is bounded to 80 characters. These algorithms are retained.

Lookup flow: pointer/selection → WordHit → main.run → DictionaryClient.lookup → cached/in-flight Wiktionary request → DictionaryResult with language sections → DefinitionPopup.showResult.

`dictionary.ts` calls the English Wiktionary REST definition endpoint, caches up to 200 results, coalesces requests and retries lowercase titles. Each language has parts of speech, HTML definitions and examples. The current endpoint/parser does **not** expose pronunciation or etymology. No second API is introduced.

`popup.ts` sanitizes HTML using Obsidian, applies language and definition limits, normalizes links, positions the popup and preserves pin/dismiss behavior. `settings.ts` owns settings/defaults and the PluginSettingTab; `styles.css` uses theme variables.

Build: npm install; npm run build (TypeScript noEmit, then esbuild CommonJS bundle). npm run dev watches changes. Upstream has no tests.

## Environment and baseline

macOS arm64; Git 2.50.1; Node 25.9.0; npm 11.12.1; gh authenticated as philcol33. Obsidian 1.13.7 installed. VS Code app/CLI not found; Cursor installed. Isolated test vault is the workspace sibling above this plugin, never the registered main vault. The unchanged baseline built successfully and loaded its command/settings in Obsidian. Automated selection through the command palette did not retain a valid DOM selection; live hover/selection verification remains on the QA checklist.

Origin: philcol33/popup-lexicon. Upstream: ntsiris/obsidian-popup-dictionary. CSS classes and plugin ID are renamed to avoid collisions.
