export function dictionaryRoot(value: string): string {
	const root = value.trim().replace(/\/+$/, '');
	if (!root || root.startsWith('/') || root.includes('\\') || root.split('/').some(s => !s || s.startsWith('.') || /[\x00-\x1f:*?"<>|]/.test(s))) {
		throw new Error('Choose a vault-relative folder such as Dictionary; hidden folders and traversal are not allowed.');
	}
	return root;
}
export function safeFilename(value: string): string {
	let name = value.normalize('NFC').replace(/[\x00-\x1f\x7f/\\:*?"<>|]/g, '_').replace(/^\.+|[. ]+$/g, '').trim();
	// Bound UTF-8 bytes (including collision suffix) on common filesystems, without splitting Unicode.
	let result = '';
	for (const c of name) { if (new TextEncoder().encode(result + c).length > 180) break; result += c; }
	name = result || 'untitled';
	if (/^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i.test(name)) name = '_' + name;
	return name;
}
