export class NavigationHistory<T> {
	private items: T[] = [];
	private position = -1;
	constructor(private key: (value: T) => string, private limit = 100) {}
	get canBack(): boolean { return this.position > 0; }
	get canForward(): boolean { return this.position < this.items.length - 1; }
	push(value: T): void {
		if (this.position >= 0 && this.key(this.items[this.position]) === this.key(value)) { this.items[this.position] = value; return; }
		this.items = this.items.slice(0, this.position + 1);
		this.items.push(value);
		if (this.items.length > this.limit) this.items.shift();
		this.position = this.items.length - 1;
	}
	back(): T | undefined { return this.canBack ? this.items[--this.position] : undefined; }
	forward(): T | undefined { return this.canForward ? this.items[++this.position] : undefined; }
}
