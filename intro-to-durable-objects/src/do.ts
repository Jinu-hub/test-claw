import { DurableObject } from 'cloudflare:workers';

export class DurablePotato extends DurableObject<Env> {
	count = 0;
	increase() {
		this.count++;
		return `count is ${this.count}`;
	}
} 