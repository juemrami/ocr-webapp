import type { OCRRequest } from "@mistralai/mistralai/models/components"
import { Effect, Layer, ServiceMap } from "effect"
import { MistralBaseClient, type MistralClientConfig, OCR_MODELS } from "./open-api-client"

export class MistralOcrClient extends ServiceMap.Service<MistralOcrClient>()("MistralOcrClient", {
	make: Effect.gen(function*() {
		const client = yield* MistralBaseClient
		return {
			uploadFile: client.files.upload,
			processDocument: (args: Omit<OCRRequest, "model">) => client.ocr.process({ ...args, model: OCR_MODELS.OCR2 })
		}
	})
}) {
	static Base = Layer.effect(MistralOcrClient, this.make)
	static Default = Layer.provide(
		this.Base,
		MistralBaseClient.Default
	)
	static Live = (config: Effect.Success<typeof MistralClientConfig.make>) =>
		this.Default.pipe(
			Layer.provide(MistralBaseClient.Live(config))
		)
}
