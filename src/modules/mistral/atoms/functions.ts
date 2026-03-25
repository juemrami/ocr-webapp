import type { FileT } from "@mistralai/mistralai/models/components"
import type { OCRPageObject } from "@mistralai/mistralai/models/components/ocrpageobject.js"
import { Effect, Layer, pipe } from "effect"
import { FetchHttpClient } from "effect/unstable/http"
import { TracerPropagationEnabled } from "effect/unstable/http/HttpClient"
import { AsyncResult, Atom } from "effect/unstable/reactivity"
import { decryptApiKey } from "../../encryption"
import { MistralOcrClient } from "../app-client"
import { MistralClientConfig } from "../open-api-client"
import { mistralApiKeyAtom, mistralEncryptedKeyAtom } from "./credentials"

/**
 * Replaces image references in markdown with base64 data URIs
 */
function replaceImagesInMarkdown(markdownStr: string, imagesDict: Record<string, string>): string {
	let result = markdownStr
	for (const [imgName, base64Str] of Object.entries(imagesDict)) {
		result = result.replace(
			`![${imgName}](${imgName})`,
			`![${imgName}](${base64Str})`
		)
	}
	return result
}

/**
 * Combines markdown from all pages with embedded base64 images
 */
function getCombinedMarkdown(pages: OCRPageObject[]): string {
	const markdowns: string[] = []

	for (const page of pages) {
		const imageData: Record<string, string> = {}

		// Build image data dictionary
		if (page.images) {
			for (const img of page.images) {
				if (img.id && img.imageBase64) {
					imageData[img.id] = img.imageBase64
				}
			}
		}

		// Replace images in markdown and add to collection
		if (page.markdown) {
			markdowns.push(replaceImagesInMarkdown(page.markdown, imageData))
		}
	}

	return markdowns.join("\n\n")
}

type MistralClientConfigT = typeof MistralClientConfig.Service
const AuthorizedMistralOcrClientRuntime = Atom.runtime((get) => {
	const encryptedKey = get(mistralEncryptedKeyAtom)
	const keyConfig = get(mistralApiKeyAtom)
	let configLayer = MistralClientConfig.Empty
	if (keyConfig.isEncrypted && encryptedKey && keyConfig.sessionPassphrase) {
		configLayer = Layer.effect(
			MistralClientConfig,
			Effect.sync(function() {
				const apiKey = pipe(
					Effect.promise(() => decryptApiKey(keyConfig.sessionPassphrase!, encryptedKey!)),
					Effect.map((d) => d === null ? "" : d)
				)
				return { apiKey } as MistralClientConfigT
			})
		)
	}

	return Layer.provide(
		MistralOcrClient.Default,
		configLayer
	).pipe(
		Layer.merge(
			Layer.provide(FetchHttpClient.layer, Layer.succeed(TracerPropagationEnabled, false))
		) // cors issue with `traceparent` header, disable for now
	)
})

type FileProcessingState =
	| { phase: "idle" }
	| { phase: "uploading" }
	| { phase: "ocr-processing"; fileId: string }
	| { phase: "post-processing"; fileId: string }
	| { phase: "complete"; markdown: string; fileId: string }
export const makeParseFileAtom = AuthorizedMistralOcrClientRuntime.fn((file: FileT, ctx) => {
	const setSelfEffect = (result: FileProcessingState) =>
		Effect.sync(() => ctx.setSelf(AsyncResult.success(result)) ?? result)
	const fn = Effect.gen(function*() {
		const ocrClient = yield* MistralOcrClient
		const [, uploadedFile] = yield* Effect.all(
			[
				setSelfEffect({ phase: "uploading" }),
				ocrClient.uploadFile({
					file,
					purpose: "ocr"
				})
			]
		)
		const [, ocrResult] = yield* Effect.all([
			setSelfEffect({ phase: "ocr-processing", fileId: uploadedFile.id }),
			ocrClient.processDocument({
				document: {
					fileId: uploadedFile.id
				},
				includeImageBase64: true
			})
		])
		yield* setSelfEffect(
			{ phase: "post-processing", fileId: uploadedFile.id }
		)
		// Get combined markdown with embedded images
		const combinedMarkdown = getCombinedMarkdown(ocrResult.pages)
		return yield* setSelfEffect({
			phase: "complete",
			markdown: combinedMarkdown,
			fileId: uploadedFile.id
		})
	})
	return fn
}, { initialValue: { phase: "idle" } })
