# Popup Lexicon

A multilingual dictionary and personal vocabulary manager for Obsidian. Forked from [Popup Dictionary](https://github.com/ntsiris/obsidian-popup-dictionary) by Nikitas Tsiris. Original MIT license preserved.

## Development

`npm install` then `npm run build`. `npm run dev` rebuilds on edits. Develop only in an isolated vault with the repository at `.obsidian/plugins/popup-lexicon`. Enable Popup Lexicon under Community plugins. After building, toggle the plugin off/on; the community Hot Reload plugin is optional.

Cmd/Ctrl-hover a word, or bind “Look up selected word” to a hotkey. Existing lookup settings are preserved. See [architecture](docs/architecture.md) and [plan](docs/plan.md).

## Privacy and licensing

External lookups send the queried word to Wiktionary over HTTPS. The upstream endpoint returns English glosses for many source languages. Definitions are © Wiktionary contributors, CC BY-SA; saved entries retain attribution and source links. Code is MIT.
