import { sanitizeHTMLToDom } from 'obsidian';
import type { LangSection } from '../dictionary';

/** Only grammatical form-of senses establish identity. Synonyms/alternative spellings do not. */
export function inflectionLemma(language: LangSection): string | undefined {
 const lemmas = new Set<string>();
 for (const entry of language.entries) for (const definition of entry.definitions) {
  const root = sanitizeHTMLToDom(definition.html);
  const form = root.querySelector('.form-of-definition');
  const link = form?.querySelector('.form-of-definition-link');
  if (!form || !link) return;
  const prefix = (form.textContent || '').split(link.textContent || '\0')[0].trim();
  if (!/\bof$/i.test(prefix) || !/\b(plural|singular|person|genitive|dative|accusative|nominative|instrumental|locative|vocative|present|past|participle|inflection|imperative|subjunctive|indicative|conditional|comparative|superlative|feminine|masculine|neuter)\b/i.test(prefix)) return;
  if (/synonym|alternative|variant|spelling|misspelling|diminutive|archaic form/i.test(prefix)) return;
  const mentions = [...link.querySelectorAll('[lang]')].filter(el => el.getAttribute('lang') === language.code);
  if (link.querySelector('[lang]') && !mentions.length) return;
  const anchors = mentions.length ? mentions.flatMap(el => [...el.querySelectorAll('a[href]')]) : [...link.querySelectorAll('a[href]')];
  const targets = new Set(anchors.map(a => {
   const href = a.getAttribute('href') || '';
   const path = href.match(/^(?:https:\/\/en\.wiktionary\.org)?\/wiki\/([^#?]+)/)?.[1] || href.match(/^\.\/([^#?]+)/)?.[1];
   if (!path) return '';
   try { return decodeURIComponent(path).replace(/_/g, ' '); } catch { return ''; }
  }).filter(word => word && !word.includes(':') && word.length <= 80));
  if (targets.size !== 1) return;
  lemmas.add([...targets][0]);
 }
 return lemmas.size === 1 ? [...lemmas][0] : undefined;
}

/** Narrow phrase fallback: German article + one noun, only after the full phrase has no entry. */
export function germanNounPhrase(query: string): string | undefined {
 const match = query.trim().match(/^(?:der|die|das|des|dem|den|ein|eine|einer|eines|einem|einen)\s+([\p{L}\p{M}-]+)$/iu);
 if (!match) return;
 return match[1][0].toLocaleUpperCase('de') + match[1].slice(1);
}

/** Keep alternative lemmas available when a spelling also has independent senses. */
export function inflectionChoices(language: LangSection): string[] {
 const words = new Set<string>();
 for (const entry of language.entries) for (const definition of entry.definitions) {
  const lemma = inflectionLemma({ ...language, entries: [{ ...entry, definitions: [definition] }] });
  if (lemma) words.add(lemma);
 }
 return [...words];
}
