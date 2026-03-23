import { NodeFileSystem, NodeHttpClient } from "@effect/platform-node"
import { describe, expect, it } from "@effect/vitest"
import { isBlobLike } from "@mistralai/mistralai/types"
import { isReadableStream } from "@mistralai/mistralai/types/streams.js"
import { Effect, FileSystem, Layer, pipe } from "effect"
import { TracerPropagationEnabled } from "effect/unstable/http/HttpClient"
import { httpBodyFromMultiPartBodyParams, MistralOcrClient } from "../src/modules/mistral-ocr"

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

	describe("typeguards", () => {
		it("recognizes native Blob as blob-like", () => {
			const b = new Blob([new Uint8Array([1, 2, 3])], { type: "application/octet-stream" })
			expect(isBlobLike(b)).toBe(true)
		})

		describe("httpBodyFromMultiPartBodyParams behavior", () => {
			it.effect("uploads plain Blob (unnamed)", () =>
				Effect.gen(function*() {
					const blob = new Blob([new Uint8Array([1, 2, 3])], { type: "application/octet-stream" })
					const body = yield* httpBodyFromMultiPartBodyParams({ file: blob } as any)
					const entry: any = body.formData.get("file")
					expect(entry).toBeDefined()
					expect(entry instanceof Blob || Object.prototype.toString.call(entry) === "[object Blob]").toBe(true)
				}))

			it.effect("uploads {fileName, content: Blob}", () =>
				Effect.gen(function*() {
					const blob = new Blob([new Uint8Array([4, 5, 6])], { type: "image/png" })
					const body = yield* httpBodyFromMultiPartBodyParams(
						{ file: { fileName: "bloblike.png", content: blob } } as any
					)
					const entry: any = body.formData.get("file")
					expect(entry).toBeDefined()
				}))

			it.effect("uploads ReadableStream content", () =>
				Effect.gen(function*() {
					const rs = new ReadableStream({
						start(controller) {
							controller.enqueue(new Uint8Array([7, 8, 9]))
							controller.close()
						}
					})
					const body = yield* httpBodyFromMultiPartBodyParams({ file: { fileName: "stream.png", content: rs } } as any)
					const entry: any = body.formData.get("file")
					expect(entry).toBeDefined()
				}))

			it.effect("uploads Uint8Array content with filename", () =>
				Effect.gen(function*() {
					const u8 = new Uint8Array([10, 11, 12])
					const body = yield* httpBodyFromMultiPartBodyParams({ file: { fileName: "data.bin", content: u8 } } as any)
					const entry: any = body.formData.get("file")
					expect(entry).toBeDefined()
				}))

			it.effect("uploads ArrayBuffer content with filename", () =>
				Effect.gen(function*() {
					const ab = new Uint8Array([13, 14, 15]).buffer
					const body = yield* httpBodyFromMultiPartBodyParams({ file: { fileName: "buffer.bin", content: ab } } as any)
					const entry: any = body.formData.get("file")
					expect(entry).toBeDefined()
				}))

			it.effect("appends primitive fields like expiry as strings", () =>
				Effect.gen(function*() {
					const blob = new Blob([new Uint8Array([1])], { type: "application/octet-stream" })
					const body = yield* httpBodyFromMultiPartBodyParams({ file: blob, expiry: 12345 } as any)
					const entry = body.formData.get("expiry")
					expect(entry).toBe("12345")
				}))
		})

		it("recognizes cross-realm blob-like objects with Symbol.toStringTag and stream", () => {
			const blobLike = {
				[Symbol.toStringTag]: "File",
				stream: () => ({})
			}
			expect(isBlobLike(blobLike)).toBe(true)
		})

		it("rejects objects with toStringTag but missing stream", () => {
			const bad = { [Symbol.toStringTag]: "Blob" }
			expect(isBlobLike(bad)).toBe(false)
		})

		it("recognizes ReadableStream-like objects", () => {
			const streamLike = {
				getReader: () => ({}),
				cancel: () => ({}),
				tee: () => ({})
			}
			expect(isReadableStream(streamLike)).toBe(true)
		})

		it("does not consider Uint8Array a ReadableStream", () => {
			expect(isReadableStream(new Uint8Array())).toBe(false)
		})
	})

	it.effect(
		"uploads and parses screen-shot.png",
		() =>
			Effect.gen(function*() {
				const fs = yield* FileSystem.FileSystem
				const buffer = yield* fs.readFile(demoPngUrl)
				const client = yield* MistralOcrClient
				const uploaded = yield* pipe(
					client.uploadFile({
						file: {
							fileName: "screen-shot.png",
							content: buffer
						},
						purpose: "ocr"
					})
					// Effect.andThen(identity)
				)
				const processed = yield* client.processDocument({
					document: { fileId: uploaded.id },
					includeImageBase64: true
				})

				expect(processed).toHaveProperty("pages")
				expect(Array.isArray(processed.pages)).toBe(true)
			}).pipe(
				Effect.tapErrorTag("HttpClientError", (error) =>
					Effect.gen(function*() {
						if (error.response) {
							const text = yield* error.response.text
							try {
								const parsed = JSON.parse(text)
								console.error("HTTP Client Error Response JSON:", JSON.stringify(parsed, null, 2))
								// eslint-disable-next-line @typescript-eslint/no-unused-vars
							} catch (_) {
								console.error("HTTP Client Error Response Text:", text)
							}
						}
						return yield* Effect.void
					}).pipe(Effect.orDie)),
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
