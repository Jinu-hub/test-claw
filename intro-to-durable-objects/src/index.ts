import { DurablePotato } from './do';

export { DurablePotato }; 

export default {
	async fetch(request, env, ctx): Promise<Response> {
		const { pathname, searchParams } = new URL(request.url);
		const name = searchParams.get('name') ?? 'default';
		if (pathname === '/') {
			const dp = env.DP.getByName(name) as DurableObjectStub<DurablePotato>;
			return new Response(await dp.increase());
		}
		return new Response(null, {
			status: 404,
		});
	},
} satisfies ExportedHandler<Env>;