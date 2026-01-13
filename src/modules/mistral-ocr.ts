import { Mistral } from "@mistralai/mistralai"
import type { OCRRequest } from "@mistralai/mistralai/models/components/ocrrequest.js"
import type { OCRResponse as MistralOcrResponse } from "@mistralai/mistralai/models/components/ocrresponse.js"
import type { UploadFileOut as MistralUploadedFile } from "@mistralai/mistralai/models/components/uploadfileout.js"
import type { FilesApiRoutesUploadFileMultiPartBodyParams as MistralUploadFileArgs } from "@mistralai/mistralai/models/operations/index.js"
import { Config, Data, Effect } from "effect"

const models = {
	OCR1: "mistral-ocr-2503",
	OCR2: "mistral-ocr-2505",
	OCR3: "mistral-ocr-2512"
}
export class MistralError extends Data.TaggedError("MistralError")<{
	readonly message: string
	readonly cause: unknown
}> {}

export class MistralOcrClient extends Effect.Service<MistralOcrClient>()("MistralOcrClient", {
	effect: Effect.gen(function*() {
		const apiKey = yield* Config.string("MISTRAL_API_KEY") || "your_api_key"
		const client = new Mistral({ apiKey })

		return {
			uploadFile: Effect.fn(function*(file: MistralUploadFileArgs) {
				return yield* Effect.async<MistralUploadedFile, MistralError>((resume) => {
					client.files
						.upload(file)
						.then((result) => {
							resume(Effect.succeed(result))
						})
						.catch(
							(err) => {
								resume(Effect.fail(
									new MistralError({
										message: "Failed to upload file",
										cause: err
									})
								))
							}
						)
				})
			}),
			processDocument: Effect.fn(
				function*(args: Omit<OCRRequest, "model">) {
					return yield* Effect.async<MistralOcrResponse, MistralError>((resume) => {
						client.ocr
							.process({
								...args,
								model: models.OCR2
							})
							.then((result) => resume(Effect.succeed(result)))
							.catch(
								(err) => {
									resume(Effect.fail(
										new MistralError({
											message: "Failed to process document",
											cause: err
										})
									))
								}
							)
					})
				}
			)
		}
	}),
	dependencies: []
}) {}
