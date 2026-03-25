import { Cause, Effect, Exit } from "effect"
import type { AsyncResult, Atom } from "effect/unstable/reactivity"
import { AtomRegistry } from "effect/unstable/reactivity"
import { createSignal, onCleanup, type Setter } from "solid-js"

const appRegistry = AtomRegistry.make({
	defaultIdleTTL: Infinity // default to keepalive
})

const flattenExit = <A, E>(exit: Exit.Exit<A, E>): A => {
	if (Exit.isSuccess(exit)) return exit.value
	throw Cause.squash(exit.cause)
}

export const useAtomSet = <R, W, Mode extends "value" | "promise" | "promiseExit" = never>(
	atom: Atom.Writable<R, W>,
	options?: {
		readonly mode?: ([R] extends [AsyncResult.AsyncResult<any, any>] ? Mode : "value") | undefined
	}
): "promise" extends Mode ? (
		(value: W) => Promise<AsyncResult.AsyncResult.Success<R>>
	) :
	"promiseExit" extends Mode ? (
			(value: W) => Promise<Exit.Exit<AsyncResult.AsyncResult.Success<R>, AsyncResult.AsyncResult.Failure<R>>>
		) :
	((value: W | ((value: R) => W)) => void) =>
{
	onCleanup(appRegistry.mount(atom))
	if (options?.mode === "promise" || options?.mode === "promiseExit") {
		return ((value: W) => {
			appRegistry.set(atom, value)
			const promise = Effect.runPromiseExit(
				AtomRegistry.getResult(appRegistry, atom as Atom.Atom<AsyncResult.AsyncResult<any, any>>, {
					suspendOnWaiting: true
				})
			)
			return options!.mode === "promise" ? promise.then(flattenExit) : promise
		}) as any
	}
	return ((value: W | ((value: R) => W)) => {
		appRegistry.set(atom, typeof value === "function" ? (value as any)(appRegistry.get(atom)) : value)
	}) as any
}

export const useAtom = <R, W = R>(atom: Atom.Writable<R, W>) => {
	const value = useAtomValue(atom)
	appRegistry.mount(atom)
	const setValue = (arg: W | ((prev: R) => W)) => {
		const next = typeof arg === "function"
			? (arg as (p: R) => W)(appRegistry.get(atom))
			: arg
		appRegistry.set(atom, next)
		return next
	}
	return [value, setValue as Setter<W>] as const
}

export const useAtomValue = <R>(atom: Atom.Atom<R>) => {
	const [value, setValueInternal] = createSignal<R>(appRegistry.get(atom))
	onCleanup(appRegistry.subscribe(atom, setValueInternal as any))
	return value
}
