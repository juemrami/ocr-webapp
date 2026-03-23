import { NodeFileSystem, NodeHttpClient } from "@effect/platform-node"
import { describe, expect, it } from "@effect/vitest"
import { Console, Effect, FileSystem, Layer } from "effect"
import { TracerPropagationEnabled } from "effect/unstable/http/HttpClient"
import { MistralOcrClient } from "../src/modules/mistral-ocr"

const httpClientLayer = NodeHttpClient.layerFetch.pipe(
	Layer.provide(Layer.succeed(TracerPropagationEnabled, false))
)

describe("mistral ocr integration (optional)", () => {
	const apiKey = import.meta.env.VITE_MISTRAL_API_KEY
	const demoPngUrl = __dirname + "/../demos/screen-shot.png"
	if (!apiKey) {
		console.log("VITE_MISTRAL_API_KEY not set, skipping OCR integration test")
		return
	}
	it.effect(
		"uploads and parses screen-shot.png",
		() =>
			Effect.gen(function*() {
				const fs = yield* FileSystem.FileSystem
				const buffer = yield* fs.readFile(demoPngUrl)
				const client = yield* MistralOcrClient
				const uploaded = yield* client.uploadFile({
					file: {
						fileName: "screen-shot.png",
						content: buffer
					},
					purpose: "ocr"
				})
				const processed = yield* client.processDocument({
					document: { fileId: uploaded.id },
					includeImageBase64: true
				})

				expect(processed).toHaveProperty("pages")
				expect(Array.isArray(processed.pages)).toBe(true)
			}).pipe(
				Effect.tapError(Console.log),
				Effect.provide(
					Layer.mergeAll(
						NodeFileSystem.layer,
						httpClientLayer,
						MistralOcrClient.Live({ apiKey: apiKey! })
					)
				)
			),
		60_000
	)
})
