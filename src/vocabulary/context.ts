import { MarkdownView, type App } from 'obsidian';
import type { Encounter } from './types';

/** Resolve the actual note pane containing the hit, rather than whichever tab is active later. */
export function captureEncounter(app: App, node: Node | null, word: string): Encounter | undefined {
	if (!node) return;
	const view = app.workspace.getLeavesOfType('markdown').map(leaf => leaf.view)
		.find(view => view instanceof MarkdownView && view.containerEl.contains(node)) as MarkdownView | undefined;
	if (!view?.file) return;
	const element = node.nodeType === Node.ELEMENT_NODE ? node as Element : node.parentElement;
	const block = element?.closest('p, li, .cm-line, blockquote, h1, h2, h3');
	const text = (block?.textContent || node.textContent || word).replace(/\s+/g, ' ').trim();
	const offset = Math.max(0, text.toLocaleLowerCase().indexOf(word.toLocaleLowerCase()));
	const start = Math.max(0, offset - 180), end = Math.min(text.length, offset + word.length + 180);
	return { sourcePath: view.file.path, context: (start ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : ''), date: new Date().toISOString() };
}
