import { useAgent } from 'agents/react';
import type { ChattingRoomAgent, PingPongState } from '../worker/index';
import { useState } from 'react';

function App() {
	const [isConnected, setIsConnected] = useState(false);
	//const [pingPons, setPingPons] = useState<number>(0);
	const agent = useAgent<ChattingRoomAgent, PingPongState>(
		{
			agent: 'ChattingRoomAgent',
			onOpen: () => setIsConnected(true),
			//onStateUpdate: (state) => setPingPons(state.count),
		}
	);
	if (!isConnected) {
		return <div>Connecting...</div>;
	}
	return (
		<div>
			<h1>Ping Pong Agent</h1>
			<p>Count: {agent.state?.count}</p>
			<hr />
			<button onClick={() => agent.stub.increment()}>Increment</button>
			<button onClick={() => agent.stub.decrement()}>Decrement</button>
		</div>
	);
}

export default App;
