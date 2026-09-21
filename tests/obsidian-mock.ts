import { parse, stringify } from 'yaml';
export const parseYaml = parse;
export const stringifyYaml = stringify;
export class TFile { extension = 'md'; stat = { mtime: Date.now(), size: 0 }; constructor(public path: string) {} }
export class TFolder { constructor(public path: string) {} }
export class Component {
 private cleanup: (() => void)[] = [];
 registerEvent(event: () => void) { this.cleanup.push(event); }
 register(callback: () => void) { this.cleanup.push(callback); }
 load() { (this as unknown as { onload?: () => void }).onload?.(); }
 unload() { (this as unknown as { onunload?: () => void }).onunload?.(); this.cleanup.splice(0).forEach(fn => fn()); }
}
export class Notice { constructor(public message: string) {} }
export class ItemView extends Component {
 app: unknown; contentEl = document.createElement('div');
 constructor(leaf: { app: unknown }) { super(); this.app = leaf.app; }
}
export const MarkdownRenderer = {
 async render(_app: unknown, value: string, root: HTMLElement) { const p = document.createElement('p'); p.textContent = value; root.append(p); }
};
export function sanitizeHTMLToDom(html: string): DocumentFragment {
 const template = document.createElement('template'); template.innerHTML = html;
 template.content.querySelectorAll('script, iframe, object').forEach(el => el.remove());
 template.content.querySelectorAll('*').forEach(el => { for (const attr of [...el.attributes]) if (attr.name.startsWith('on') || /^javascript:/i.test(attr.value)) el.removeAttribute(attr.name); });
 return template.content;
}
export function htmlToMarkdown(value: DocumentFragment): string { return value.textContent || ''; }
let handler: (args: { url: string }) => Promise<unknown> = async () => { throw new Error('Unexpected network call'); };
export function setRequestHandler(next: typeof handler) { handler = next; }
export const requestUrl = (args: { url: string }) => handler(args);
export class PluginSettingTab {}
export class Setting {}
