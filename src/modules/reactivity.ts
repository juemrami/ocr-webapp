import { Atom, AtomRegistry } from "effect/unstable/reactivity"
import { createSignal, onCleanup, type Setter } from "solid-js"

const appRegistry = AtomRegistry.make({
	defaultIdleTTL: Infinity // default to keepalive
})
export const mistralApiKeyAtom = Atom.make<string | null>(null)

export const useAtom = <T>(atom: Atom.Writable<T>) => {
	const [value, setValueInternal] = createSignal<T>(appRegistry.get(atom))
	onCleanup(appRegistry.subscribe(atom, setValueInternal as any))
	const setValue = (arg: Parameters<typeof setValueInternal>[0]) =>
		appRegistry.set(
			atom,
			typeof arg === "function"
				? (arg as (p: T) => T)(appRegistry.get(atom))
				: arg
		)

	return [value, setValue as Setter<T>] as const
}
