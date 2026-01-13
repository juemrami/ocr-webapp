import { FileSystem } from "@effect/platform"
import { NodeContext } from "@effect/platform-node"
import type { OCRPageObject } from "@mistralai/mistralai/models/components/ocrpageobject.js"
import { Console, Effect, Layer, pipe } from "effect"
import { MistralOcrClient } from "./modules/mistral-ocr.ts"

const demoDir = "./demos"
const demoOutput = `${demoDir}/output.md`
const demoFileName = "petri-7s-repair-manual-demo.pdf"
const demoInput = `${demoDir}/${demoFileName}`

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

Effect.runPromise(pipe(
	Effect.gen(function*() {
		yield* Console.log("Starting Mistral OCR demo...")
		const ocrClient = yield* MistralOcrClient
		const fs = yield* FileSystem.FileSystem
		const demoInputBytes = yield* fs.readFile(demoInput)
		yield* Console.log(`Read ${demoInputBytes.length} bytes from disk: ${demoInput}`)
		yield* Console.log("Uploading file to Mistral OCR...")
		const uploadedFile = yield* ocrClient.uploadFile({
			file: {
				fileName: demoFileName,
				content: demoInputBytes
			},
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
		yield* Console.log("Combined Markdown:")
		yield* Console.log(combinedMarkdown)

		yield* fs.writeFileString(demoOutput, combinedMarkdown)
	}),
	Effect.provide(
		Layer.mergeAll(MistralOcrClient.Default, NodeContext.layer)
	)
))
