import { Mistral } from "@mistralai/mistralai"
import type { CreateFileResponse, OCRRequest, OCRResponse } from "@mistralai/mistralai/models/components"
import type { MultiPartBodyParams } from "@mistralai/mistralai/models/operations"
import { Data, Effect, Layer, ServiceMap } from "effect"

const models = {
	OCR1: "mistral-ocr-2503",
	OCR2: "mistral-ocr-2505",
	OCR3: "mistral-ocr-2512"
}
export class MistralError extends Data.TaggedError("MistralError")<{
	readonly message: string
	readonly cause: unknown
}> {}

export class MistralClientConfig extends ServiceMap.Service<MistralClientConfig, {
	apiKey: string
}>()("ClientConfig") {
	static Live = (cfg: Parameters<OmitThisParameter<typeof this.of>>[0]) =>
		Layer.effect(MistralClientConfig, Effect.succeed(cfg))
}

export class MistralOcrClient extends ServiceMap.Service<MistralOcrClient>()("MistralOcrClient", {
	make: Effect.gen(function*() {
		const clientConfig = yield* MistralClientConfig
		const client = new Mistral({ apiKey: clientConfig.apiKey })

		return {
			uploadFile: Effect.fn(function*(file: MultiPartBodyParams) {
				return yield* Effect.tryPromise<CreateFileResponse, MistralError>({
					try: () => client.files.upload(file),
					catch: (err) =>
						new MistralError({
							message: "Failed to upload file",
							cause: err
						})
				})
			}),
			processDocument: Effect.fn(
				function*(args: Omit<OCRRequest, "model">) {
					return yield* Effect.tryPromise<OCRResponse, MistralError>({
						try: () =>
							client.ocr.process({
								...args,
								model: models.OCR2
							}),
						catch: (err) =>
							new MistralError({
								message: "Failed to process document",
								cause: err
							})
					})
				}
			)
		}
	})
}) {
	static Default = Layer.effect(MistralOcrClient, this.make)
}
