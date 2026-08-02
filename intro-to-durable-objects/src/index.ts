import { DurablePotato } from './do';

export { DurablePotato }; 

export default {
	async fetch(request, env, ctx): Promise<Response> {
		const { pathname, searchParams } = new URL(request.url);
		//const name = searchParams.get('name') ?? 'default';
		if (pathname === '/ws') {
			const roomId = searchParams.get('roomId') ?? 'public';
			const upgrade = request.headers.get('Upgrade');
			if (upgrade) {
				const dp = env.DP.getByName(roomId);
				return dp.fetch(request);
			}
		}
		return new Response(null, {
			status: 404,
		});
	},
} satisfies ExportedHandler<Env>;