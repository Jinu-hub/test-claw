import { DurablePotato } from './do';

export { DurablePotato }; 

export default {
	async fetch(request, env, ctx): Promise<Response> {
		const { pathname } = new URL(request.url);
		if (pathname === '/') {
			const dp = env.DP.getByName('default') as DurableObjectStub<DurablePotato>;
			return new Response(await dp.increase());
		}
		return new Response(null, {
			status: 404,
		});
	},
} satisfies ExportedHandler<Env>;