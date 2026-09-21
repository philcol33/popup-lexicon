import { parseYaml, stringifyYaml } from 'obsidian';
import type { DictionaryEntry, Encounter, Meaning } from './types';

const text = (value: unknown): string | undefined => typeof value === 'string' ? value : undefined;
const strings = (value: unknown): string[] | undefined => Array.isArray(value) ? value.filter(v => typeof v === 'string') : undefined;
const inline = (value: string): string => value.replace(/[\r\n]+/g, ' ');

export function writeEncounter(encounter: Encounter): string {
	// Markdown links remain valid even for paths containing brackets or pipes.
	const path = encounter.sourcePath.split('/').map(encodeURIComponent).join('/');
	const label = encounter.sourcePath.replace(/\.md$/i, '').replace(/[\\[\]]/g, '\\$&');
	return `${encounter.context.split('\n').map(line => `> ${line}`).join('\n')}\n\nSource: [${label}](${path}) · ${inline(encounter.date)}\n`;
}
export function writeMarkdown(entry: DictionaryEntry): string {
	const metadata: Record<string, unknown> = {
		lexicon: 1, word: entry.word, language: entry.languageCode,
		language_name: entry.languageName, created: entry.created || new Date().toISOString(),
	};
	if (entry.definitionLanguage) metadata.definition_language = entry.definitionLanguage;
	if (entry.contentKind) metadata.content_kind = entry.contentKind;
	if (entry.aliases?.length) metadata.aliases = entry.aliases;
	if (entry.pronunciation) metadata.pronunciation = entry.pronunciation;
	if (entry.phonetics?.length) metadata.phonetics = entry.phonetics;
	if (entry.source) {
		metadata.source = entry.source.provider;
		if (entry.source.url) metadata.source_url = entry.source.url;
		if (entry.source.license) metadata.source_license = entry.source.license;
	}
	const lines = ['---', stringifyYaml(metadata).trimEnd(), '---', '', `# ${inline(entry.word)}`, ''];
	if (entry.pronunciation) lines.push(`/${inline(entry.pronunciation)}/`, '');
	for (const part of entry.partsOfSpeech) {
		lines.push(`## ${inline(part.type)}`, '');
		part.meanings.forEach((meaning, i) => {
			lines.push(`${i + 1}. ${meaning.definition.replace(/\n/g, '\n   ')}`, '');
			for (const example of meaning.examples || []) lines.push(...example.split('\n').map(line => `   > ${line}`), '');
			if (meaning.synonyms?.length) lines.push(`   Synonyms: ${meaning.synonyms.join(', ')}`, '');
			if (meaning.antonyms?.length) lines.push(`   Antonyms: ${meaning.antonyms.join(', ')}`, '');
		});
	}
	if (entry.etymology) lines.push('## Etymology', '', entry.etymology, '');
	if (entry.source) {
		lines.push('## Source', '', entry.source.url ? `[${entry.source.provider}](${entry.source.url})` : entry.source.provider);
		if (entry.source.license) lines.push(`Definitions © ${entry.source.provider} contributors, ${entry.source.license}.`);
		lines.push('');
	}
	lines.push('## Encounters', '');
	for (const encounter of entry.encounters || []) lines.push(writeEncounter(encounter), '');
	return lines.join('\n').trimEnd() + '\n';
}

/** Body text is authoritative; editing a definition changes the parsed entry. */
export function parseMarkdown(markdown: string): DictionaryEntry | null {
	const match = markdown.replace(/\r\n/g, '\n').match(/^\uFEFF?---\n([\s\S]*?)\n---(?:\n|$)([\s\S]*)$/);
	if (!match) return null;
	let meta: Record<string, unknown>;
	try { meta = parseYaml(match[1]); } catch { return null; }
	if (!meta || typeof meta !== 'object') return null;
	const word = text(meta.word), code = text(meta.language);
	if (!word || !code) return null;
	const entry: DictionaryEntry = {
		word, definitionLanguage: text(meta.definition_language), contentKind: meta.content_kind === 'translation' ? 'translation' : meta.content_kind === 'definition' ? 'definition' : undefined,
		languageCode: code, languageName: text(meta.language_name) || code,
		aliases: strings(meta.aliases) || (text(meta.aliases) ? [meta.aliases as string] : undefined),
		pronunciation: text(meta.pronunciation), phonetics: strings(meta.phonetics),
		created: text(meta.created), partsOfSpeech: [], encounters: [],
	};
	if (text(meta.source)) entry.source = { provider: meta.source as string, url: text(meta.source_url), license: text(meta.source_license) };
	const sections = match[2].split(/^## /m).slice(1);
	for (const section of sections) {
		const split = section.indexOf('\n');
		const heading = (split < 0 ? section : section.slice(0, split)).trim();
		const body = split < 0 ? '' : section.slice(split + 1).trim();
		if (/^etymology$/i.test(heading)) { entry.etymology = body; continue; }
		if (/^source$/i.test(heading)) continue;
		if (/^encounters$/i.test(heading)) {
			const pattern = /((?:^>.*\n?)+)\s*Source: (?:\[((?:\\.|[^\]])*)\]\(([^\n]*)\)|\[\[([^\]]+)\]\])(?: · ([^\n]+))?/gm;
			let m: RegExpExecArray | null;
			while ((m = pattern.exec(body))) {
				let path = m[3] || m[4] || '';
				try { path = decodeURIComponent(path); } catch { /* retain user text */ }
				entry.encounters!.push({ sourcePath: path, context: m[1].trimEnd().replace(/^> ?/gm, ''), date: m[5] || '' });
			}
			continue;
		}
		const meanings: Meaning[] = [];
		let current: Meaning | undefined;
		let example: string[] = [];
		const flushExample = () => { if (example.length && current) { (current.examples ||= []).push(example.join('\n')); example = []; } };
		for (const line of body.split('\n')) {
			const definition = line.match(/^\d+[.)]\s+(.*)/);
			if (definition) { flushExample(); current = { definition: definition[1] }; meanings.push(current); continue; }
			const ex = line.match(/^\s+> ?(.*)/) || line.match(/^\s{2,}\*(.+)\*\s*$/);
			if (ex && current) { example.push(ex[1]); continue; }
			flushExample();
			const relation = line.match(/^\s+(Synonyms|Antonyms):\s*(.*)/);
			if (relation && current) { current[relation[1] === 'Synonyms' ? 'synonyms' : 'antonyms'] = relation[2].split(',').map(s => s.trim()); continue; }
			if (line.trim() && current) current.definition += '\n' + line.replace(/^ {1,3}/, '');
		}
		flushExample();
		// Also support a manually written, unnumbered definition section.
		if (!meanings.length && body) meanings.push({ definition: body });
		if (meanings.length) entry.partsOfSpeech.push({ type: heading, meanings });
	}
	return entry;
}
