/** Polish source fields and learner conjugations. Forms always come from Wikisłownik. */
export function polishField(section: HTMLElement, name: string): HTMLElement {
 const result = document.createElement('div');
 const marker = section.querySelector(`[data-field="${name}"]`);
 const block = marker?.closest('dl');
 if (!block) return result;
 for (const child of [...block.children]) if (child.tagName === 'DD') result.append(child.cloneNode(true));
 let next = block.nextElementSibling;
 while (next && !next.querySelector('[data-field]') && !/^H[2-6]$/.test(next.tagName) && !next.querySelector('h2,h3')) {
  result.append(next.cloneNode(true)); next = next.nextElementSibling;
 }
 result.querySelectorAll('script,style,link,.reference,.noprint,.NavHead').forEach(el => el.remove());
 return result;
}
const plain = (el: Element | undefined): string => (el?.textContent || '').replace(/\s+/g, ' ').trim();
const core = (form: string): string => form.replace(/\s+się$/u, '').trim();
/** Classify attested ja/ty forms, never the infinitive suffix. Ambiguous variants remain unclassified. */
export function conjugationGroup(ja: string, ty: string): string | undefined {
 const a = core(ja), b = core(ty);
 if (!/^[\p{L}]+$/u.test(a) || !/^[\p{L}]+$/u.test(b)) return undefined;
 if (a.endsWith('m') && b.endsWith('sz')) return '-m, -sz';
 if (a.endsWith('ę') && b.endsWith('isz')) return '-ę, -isz';
 if (a.endsWith('ę') && b.endsWith('ysz')) return '-ę, -ysz';
 if (a.endsWith('ę') && b.endsWith('esz')) return '-ę, -esz';
 return undefined;
}
function paragraph(root: HTMLElement, text: string): void { const p = document.createElement('p'); p.textContent = text; root.append(p); }
const persons = ['ja', 'ty', 'on / ona / ono · pan / pani', 'my', 'wy', 'oni / one · państwo'];
export function polishConjugation(inflection: HTMLElement): string | undefined {
 const root = document.createElement('div');
 for (const table of [...inflection.querySelectorAll('table')]) {
  // The source embeds an additional table for future, conditional and participles.
  const rows = [...table.querySelectorAll('tr')].filter(row => row.closest('table') === table);
  const row = rows.find(row => /^(czas teraźniejszy|czas przyszły prosty)$/.test(plain(row.children[0])));
  if (!row || row.children.length !== 7) continue;
  const forms = [...row.children].slice(1).map(plain);
  const infinitive = rows.find(row => plain(row.children[0]) === 'bezokolicznik');
  const lemma = infinitive ? plain(infinitive.children[1]) : '';
  const group = conjugationGroup(forms[0], forms[1]);
  const h = document.createElement('h3'); h.textContent = `${lemma ? lemma + ' · ' : ''}Koniugacja: ${group || 'nieregularna / inny wzorzec'}`; root.append(h);
  paragraph(root, plain(row.children[0]) === 'czas przyszły prosty' ? 'Czas przyszły prosty · vollendet: Diese Formen bezeichnen die Zukunft, nicht die Gegenwart.' : 'Czas teraźniejszy · Präsens');
  const result = document.createElement('table');
  const header = result.createTHead().insertRow();
  for (const text of ['Osoba · Person', 'Forma · Form']) { const th = document.createElement('th'); th.textContent = text; header.append(th); }
  const body = result.createTBody();
  forms.forEach((form, index) => { const tr = body.insertRow(); tr.insertCell().textContent = persons[index]; tr.insertCell().textContent = form; });
  root.append(result);
  if (/ować(?: się)?$/.test(lemma) && /uję$/.test(core(forms[0])) && /ujesz$/.test(core(forms[1]))) paragraph(root, `Muster -ować → -uję, -ujesz: ${lemma} → ${forms[0]}, ${forms[1]}.`);
  if (group === '-m, -sz') {
   const stem = core(forms[1]).slice(0, -2);
   if (core(forms[5]) !== stem + 'ją') paragraph(root, `Besonderheit in der 3. Person Plural: ${forms[5]} (ja ${forms[0]}, ty ${forms[1]}).`);
  } else if (group) {
   const stem = core(forms[1]).slice(0, -3);
   const variants = group === '-ę, -isz' ? [stem, stem + 'i'] : [stem];
   const changes = !variants.some(base => core(forms[0]) === base + 'ę') || !variants.some(base => core(forms[5]) === base + 'ą');
   paragraph(root, `${changes ? 'Stammwechsel / Besonderheit' : 'Stammformen zum Vergleichen'}: ja ${forms[0]} · ty ${forms[1]} · oni / one ${forms[5]}.`);
  } else paragraph(root, 'Unregelmäßige oder mehrdeutige Formen: Die belegten Formen einzeln lernen.');
 }
 return root.innerHTML || undefined;
}

/** Remove site presentation but retain grammatical qualifiers, including rare/potential forms. */
export function portablePolishHtml(root: HTMLElement): string | undefined {
 const clone = root.cloneNode(true) as HTMLElement;
 clone.querySelectorAll('.potential-form').forEach(el => {
  el.append(document.createTextNode(' [forma potencjalna]'));
 });
 clone.querySelectorAll('*').forEach(el => {
  for (const attr of [...el.attributes]) if (!['href','rowspan','colspan','title'].includes(attr.name)) el.removeAttribute(attr.name);
 });
 return plain(clone) ? clone.innerHTML : undefined;
}

/** Read explicitly linked aspect partners; never infer them by stripping a prefix. */
export function polishAspects(grammar: HTMLElement, word: string): import('../vocabulary/aspect').AspectRelation[] {
 const result: import('../vocabulary/aspect').AspectRelation[] = [];
 for (const p of [...grammar.querySelectorAll('p')]) {
  const label = p.querySelector('i')?.textContent || '';
  if (!label.includes('czasownik') || label.includes('zwrotny') !== / się$/.test(word)) continue;
  const kind = /\bniedokonany\b/.test(label) ? 'imperfective' : /\bdokonany\b/.test(label) ? 'perfective' : undefined;
  if (!kind) continue;
  const marker = [...p.querySelectorAll('a,span')].find(el => el.textContent?.trim() === (kind === 'perfective' ? 'ndk.' : 'dk.'));
  if (!marker) continue;
  for (const a of [...p.querySelectorAll('a[href]')]) {
   if (!(marker.compareDocumentPosition(a) & Node.DOCUMENT_POSITION_FOLLOWING)) continue;
   const path = a.getAttribute('href')?.match(/^\/wiki\/([^#?]+)/)?.[1];
   if (!path) continue;
   let partner: string; try { partner = decodeURIComponent(path).replace(/_/g, ' '); } catch { continue; }
   if (partner.includes(':') || partner === word || result.some(value => value.word === partner)) continue;
   result.push({ kind, word: partner, sourceUrl: `https://pl.wiktionary.org/wiki/${encodeURIComponent(partner)}` });
  }
 }
 return result;
}
