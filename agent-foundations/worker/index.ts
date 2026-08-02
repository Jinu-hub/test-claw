import { Agent, routeAgentRequest } from 'agents';

export type PingPongState = {
	count: number;
}

export class ChattingRoomAgent extends Agent<Env, PingPongState> {
	initialState = {
		count : 0,
	};

	increment() {
		this.state.count++;
	}

	decrement() {
		this.state.count--;
	}
}

export default {
	async fetch(request, env) {
		//console.log('fetch', request.url);
		const agentResponse = await routeAgentRequest(request, env);
		if (agentResponse) return agentResponse;
		return new Response(null, { status: 404 });
	},
} satisfies ExportedHandler<Env>;
