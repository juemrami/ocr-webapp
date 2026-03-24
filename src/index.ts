import type { FileT } from "@mistralai/mistralai/models/components"
import type { OCRPageObject } from "@mistralai/mistralai/models/components/ocrpageobject.js"
import { Console, Effect, Layer } from "effect"
import { FetchHttpClient } from "effect/unstable/http"
import { TracerPropagationEnabled } from "effect/unstable/http/HttpClient"
import { MistralOcrClient } from "./modules/mistral"

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

export const parseFile = (file: FileT) =>
	Effect.gen(function*() {
		yield* Console.log("Starting Mistral OCR demo...")
		const ocrClient = yield* MistralOcrClient
		const fileSize = "byteLength" in file.content
			? file.content.byteLength
			: "length" in file.content
			? file.content.length
			: "size" in file.content
			? file.content.size
			: undefined

		yield* Console.log(`Read ${fileSize ?? "unknown"} bytes from disk: ${file.fileName}`)
		yield* Console.log("Uploading file to Mistral OCR...")
		const uploadedFile = yield* ocrClient.uploadFile({
			file,
			purpose: "ocr"
		})
		yield* Console.log(`File uploaded with ID: ${uploadedFile.id}`)
		yield* Console.log("Processing document with Mistral OCR...")
		const processed = yield* ocrClient.processDocument({
			document: {
				fileId: uploadedFile.id
			},
			includeImageBase64: true
		})
		yield* Console.log("Document processed. Extracting markdown with embedded images...")
		// Get combined markdown with embedded images
		const combinedMarkdown = getCombinedMarkdown(processed.pages)

		// Log the result
		return combinedMarkdown
	}).pipe(
		Effect.provide(Layer.provide(
			FetchHttpClient.layer,
			Layer.succeed(TracerPropagationEnabled, false) // cors issue with `traceparent` header, disable for now
		))
	)
