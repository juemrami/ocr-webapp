import { Console, Effect } from "effect"

const _unused = Effect.runPromise(
	Console.log(
		"Hello, World!"
	)
)
