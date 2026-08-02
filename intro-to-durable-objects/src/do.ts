import { DurableObject } from 'cloudflare:workers';

export class DurablePotato extends DurableObject<Env> {

	fetch(request: Request) {
		const url = new URL(request.url);
		const nickname = url.searchParams.get('nickname') ?? 'anon';
		const webSocketPair = new WebSocketPair();

		const [client, server] = Object.values(webSocketPair);

		this.ctx.acceptWebSocket(server);

		server.serializeAttachment({ nickname });

		return new Response(null, { status: 101, webSocket: client });
	}

	broadcast(message: string, exclude?: WebSocket) {
		for (const socket of this.ctx.getWebSockets()) {
			if (socket !== exclude) {
				socket.send(message);
			}
		}
	}

	webSocketMessage(ws: WebSocket, message: string) {
		const { nickname } = ws.deserializeAttachment() as { nickname: string };
		this.broadcast(`${nickname} said: ${message}`, ws);
	}

	webSocketClose(ws: WebSocket) {
		const { nickname } = ws.deserializeAttachment() as { nickname: string };
		this.broadcast(`${nickname} has left the building.`);
	}

	/*
	sql: SqlStorage;
	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);

		this.sql = ctx.storage.sql;

		ctx.storage.sql.exec(`
			CREATE TABLE IF NOT EXISTS pongs (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				total INTEGER
			);
		`);

		ctx.storage.sql.exec(`
			INSERT OR IGNORE INTO pongs (id, total) VALUES (1, 0);
		`);
	}

	async increase() {
		const { total } = this.sql.exec('UPDATE pongs SET total = total + 1 WHERE id = 1 RETURNING total;').one() as { total: number };

		if (total >= 30) {
			const currentAlarm = await this.ctx.storage.getAlarm();
			console.log('alarm', currentAlarm);
			if (currentAlarm === null) {
				this.ctx.storage.setAlarm(Date.now() + 10_000);
			}
		}

		return `count is ${total}`;
	}

	alarm() {
		this.sql.exec('UPDATE pongs SET total = 0 WHERE id = 1');
		// search in your `alarms` table and find the next alarm
		// schedule the next alarm
	}
	*/
} 