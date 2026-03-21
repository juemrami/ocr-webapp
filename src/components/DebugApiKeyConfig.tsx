import type { Component } from "solid-js"
import { mistralApiKeyAtom, useAtom } from "../modules/reactivity.ts"

const DebugMistralApiKeyConfig: Component = () => {
	const [mistralApiKeyConfig] = useAtom(mistralApiKeyAtom)

	return (
		<div class="debug-panel mt-4 p-3 rounded-md border border-dashed border-slate-300 bg-white text-xs text-slate-700">
			<div class="font-semibold text-sm mb-2">Debug — mistralApiKeyConfig</div>
			<pre class="whitespace-pre-wrap overflow-auto max-h-48">{JSON.stringify(mistralApiKeyConfig(), null, 2)}</pre>
		</div>
	)
}

export default DebugMistralApiKeyConfig
