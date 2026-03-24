import { encodeForm, encodeJSON } from "@mistralai/mistralai/lib/encodings.js"
import { getContentTypeFromFileName, readableStreamToArrayBuffer } from "@mistralai/mistralai/lib/files.js"
import type { BackoffStrategy, RetryConfig } from "@mistralai/mistralai/lib/retries.js"
import type { RequestOptions } from "@mistralai/mistralai/lib/sdks.js"
import { resolveGlobalSecurity, type SecurityState } from "@mistralai/mistralai/lib/security.js"
import { pathToFunc } from "@mistralai/mistralai/lib/url.js"
import {
	CreateFileResponse$inboundSchema,
	type FileT,
	type OCRRequest,
	OCRRequest$outboundSchema,
	OCRResponse$inboundSchema
} from "@mistralai/mistralai/models/components"
import { SDKValidationError } from "@mistralai/mistralai/models/errors"
import { type MultiPartBodyParams, MultiPartBodyParams$outboundSchema } from "@mistralai/mistralai/models/operations"
import { isBlobLike } from "@mistralai/mistralai/types"
import { isReadableStream } from "@mistralai/mistralai/types/streams.js"
import type { Schema } from "effect"
import { Data, Duration, Effect, identity, Layer, Match, pipe, Schedule, ServiceMap } from "effect"
import { isEffect } from "effect/Effect"
import { encodeBase64 } from "effect/Encoding"
import { getOrElse } from "effect/Option"
import { Headers, HttpBody, HttpClient, HttpClientRequest } from "effect/unstable/http"
import type { HttpMethod } from "effect/unstable/http/HttpMethod"
import type * as z from "zod/v4"
import { appendFormDataValue } from "./http-utils"

export const OCR_MODELS = {
	OCR1: "mistral-ocr-2503",
	OCR2: "mistral-ocr-2505",
	OCR3: "mistral-ocr-2512"
} as const

const gt: unknown = typeof globalThis === "undefined" ? null : globalThis
const webWorkerLike = typeof gt === "object"
	&& gt != null
	&& "importScripts" in gt
	&& typeof gt["importScripts"] === "function"
const isBrowserLike = webWorkerLike
	|| (typeof navigator !== "undefined" && "serviceWorker" in navigator)
	|| (typeof window === "object" && typeof window.document !== "undefined")
const MISTRAL_SDK_METADATA = {
	language: "typescript",
	openapiDocVersion: "1.0.0",
	sdkVersion: "2.1.1",
	genVersion: "2.859.0",
	userAgent: "speakeasy-sdk/typescript 2.1.1 2.859.0 1.0.0 @mistralai/mistralai"
} as const

type StatusCode = number | `${1 | 2 | 3 | 4 | 5}XX`
export class MistralError extends Data.TaggedError("MistralError")<{
	readonly message: string
	readonly cause: unknown
}> {}

class InvalidMistralApiPathUrl extends Data.TaggedError("InvalidMistralApiFunctionPath")<{
	readonly message: string
	readonly cause: unknown
}> {}
class InvalidMistralBaseUrl extends Data.TaggedError("InvalidMistralBaseUrl")<{
	readonly message: string
	readonly cause: unknown
}> {}
export class MistralOpenApiSpecMissMatchError extends Data.TaggedError("MistralOpenApiSpecMissMatchError")<{
	readonly message: string
	readonly cause: Schema.SchemaError
	readonly input?: unknown
}> {}

export class InvalidReadableStreamInFileContent extends Data.TaggedError("InvalidReadableStreamFileContent")<{
	readonly message: string
	/** https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/TypeError */
	readonly cause: TypeError
}> {}
export class MistralOpenApiSpecValidationError extends Data.TaggedError("MistralOpenApiSpecValidationError")<{
	readonly message: string
	readonly cause: typeof SDKValidationError
}> {}

const matchStatus = <R>(status: number, cases: {
	readonly [status: number]: (status: number) => R
	readonly "2xx"?: (status: number) => R
	readonly "3xx"?: (status: number) => R
	readonly "4xx"?: (status: number) => R
	readonly "5xx"?: (status: number) => R
	readonly orElse: (status: number) => R
}): R => {
	if (cases[status]) {
		return cases[status](status)
	} else if (status >= 200 && status < 300 && cases["2xx"]) {
		return cases["2xx"](status)
	} else if (status >= 300 && status < 400 && cases["3xx"]) {
		return cases["3xx"](status)
	} else if (status >= 400 && status < 500 && cases["4xx"]) {
		return cases["4xx"](status)
	} else if (status >= 500 && status < 600 && cases["5xx"]) {
		return cases["5xx"](status)
	}
	return cases.orElse(status)
}

const backoffStrategyToSchedule = (backoff: BackoffStrategy) =>
	Schedule.either(
		Schedule.exponential(Duration.millis(backoff.initialInterval), backoff.exponent),
		Schedule.spaced(Duration.millis(backoff.maxInterval))
	).pipe(
		Schedule.both(
			Schedule.during(Duration.millis(backoff.maxElapsedTime))
		)
	)
const defaultBackoffSchedule = backoffStrategyToSchedule({
	initialInterval: 500,
	maxInterval: 60000,
	exponent: 1.5,
	maxElapsedTime: 3600000
})
const remapRetryConfigFromOptions = (options?: RequestOptions) => {
	if (!options || !options.retries) return undefined
	Match.value(options.retries.strategy).pipe(
		Match.when("backoff", () => ({
			codes: (options?.retryCodes as StatusCode[]) || transientErrorStatusCodes,
			schedule: (options.retries as any).backoff
				? backoffStrategyToSchedule((options.retries as any).backoff) :
				defaultBackoffSchedule
		})),
		Match.when("none", () => undefined),
		Match.exhaustive
	)
}

export interface ApiRequestOptions extends RequestOptions {
	headers?: Headers.Headers
	errorCodes?: Array<StatusCode>
}
export type MistralClientConfig = {
	apiKey?: string | Effect.Effect<string> | undefined
	serverURL?: string | undefined
	userAgent?: string | undefined
	retryConfig?: RetryConfig | undefined
}
class ClientCore extends ServiceMap.Service<ClientCore>()("ClientCore", {
	make: Effect.fn(function*(args: MistralClientConfig) {
		const baseUrl = args.serverURL !== undefined ? args.serverURL : "https://api.mistral.ai"
		const validBaseUrl = yield* Effect.try({
			try: () => pathToFunc(baseUrl)({}),
			catch: (err) =>
				new InvalidMistralBaseUrl({
					message: `Provided server URL \`${baseUrl}\` is invalid or cannot be resolved`,
					cause: err
				})
		}).pipe(
			Effect.andThen((path) =>
				Effect.try({
					try: () => new URL(path),
					catch: (err) =>
						new InvalidMistralBaseUrl({
							message: `Provided server URL \`${baseUrl}\` is invalid or cannot be resolved`,
							cause: err
						})
				})
			),
			Effect.andThen((url) =>
				Effect.sync(() => {
					url.pathname = url.pathname.replace(/\/+$/, "") // Remove trailing slashes from base URL path
					return url
				})
			),
			Effect.orDie // Program should be considered broken if the base URL cannot be resolved to a valid URL object)
		)

		return {
			baseUrl: validBaseUrl,
			apiKey: (typeof args.apiKey === "string" || args.apiKey === undefined) ? args.apiKey : yield* args.apiKey,
			buildRequest: Effect.fn(function*(args: {
				config: {
					method: HttpMethod
					path: string
					baseURL?: string | URL | undefined
					query?: string
					body?: HttpBody.HttpBody
					headers?: Headers.Headers | undefined
					security?: SecurityState | null
					uaHeader?: string
					userAgent?: string | undefined
					timeoutMs?: number
				}
				options: ApiRequestOptions | undefined
			}) {
				let baseUrl = args.config.baseURL ?? validBaseUrl
				if (typeof baseUrl === "string") {
					baseUrl = yield* Effect.try({
						try: () => new URL(baseUrl),
						catch: (err) =>
							new InvalidMistralBaseUrl({
								message: `Provided server URL \`${baseUrl}\` is invalid or cannot be resolved`,
								cause: err
							})
					})
				}
				const combinedUrl = yield* Effect.try({
					try: () => new URL(args.config.path, baseUrl),
					catch: (error) =>
						new InvalidMistralApiPathUrl({
							message: `Could'nt construct api path url from  \`${args.config.path}\` and base url \`${baseUrl.href}\``,
							cause: error
						})
				})
				const finalUrl = new URL(baseUrl.href) // Create a copy of the base URL to avoid mutating it
				if (args.config.path !== "") {
					finalUrl.pathname += finalUrl.pathname.endsWith("/") ? "" : "/"
					finalUrl.pathname += combinedUrl.pathname.replace(/^\/+/, "")
				}
				let finalQuery = args.config.query ?? ""
				const secQuery: string[] = []
				for (const [k, v] of Object.entries(args.config.security?.queryParams || {})) {
					const q = encodeForm(k, v, { charEncoding: "percent" })
					if (typeof q !== "undefined") {
						secQuery.push(q)
					}
				}
				if (secQuery.length) {
					finalQuery += `&${secQuery.join("&")}`
				}

				if (finalQuery) {
					const q = finalQuery.startsWith("&") ? finalQuery.slice(1) : finalQuery
					finalUrl.search = `?${q}`
				}
				const finalHeaders = yield* pipe(
					Effect.succeed(args.config.headers ?? Headers.empty), // add operation specific headers
					Effect.map((headers) => { // add name/pass security headers if provided
						const username = args.config.security?.basic.username
						const password = args.config.security?.basic.password
						if (username !== null || password !== null) {
							const encoded = encodeBase64(`${username ?? ""}:${password ?? ""}`)
							return Headers.set(headers, "Authorization", `Basic ${encoded}`)
						} else {
							return headers
						}
					}),
					Effect.map((headers) => { // add api key security headers if provided
						const securityHeaders = Headers.fromRecordUnsafe(args.config.security?.headers || {})
						return Headers.merge(headers, securityHeaders)
					}),
					Effect.map((headers) => { // add cookie security headers if provided
						// todo: use "effect/http/Cookies" modules
						let cookieStr = Headers.get(headers, "cookie").pipe(
							getOrElse(() => "")
						)
						for (const [k, v] of Object.entries(args.config.security?.cookies || {})) {
							cookieStr += `; ${k}=${v}`
						}
						cookieStr = cookieStr.startsWith("; ") ? cookieStr.slice(2) : cookieStr
						return Headers.set(headers, "cookie", cookieStr)
					}),
					Effect.map((headers) => { // add user consumer defined headers
						if (args.options?.headers !== undefined) {
							return Headers.merge(headers, args.options.headers)
						}
						return headers
					}),
					Effect.map((headers) => {
						// Only set user agent header in non-browser-like environments since CORS
						// policy disallows setting it in browsers e.g. Chrome throws an error.
						if (!isBrowserLike) {
							return Headers.set(
								headers,
								args.config.uaHeader ?? "user-agent",
								args.config.userAgent ?? MISTRAL_SDK_METADATA.userAgent
							)
						}
						return headers
					})
				)
				const finalOptions = yield* pipe(
					Effect.succeed(args.options || {}),
					Effect.map((fetchOpts) => { // add abort signal if timeout specificed
						if (!fetchOpts.signal && args.config.timeoutMs && args.config.timeoutMs > 0) {
							fetchOpts.signal = AbortSignal.timeout(args.config.timeoutMs)
						}
						if (args.config.body instanceof ReadableStream) {
							Object.assign(fetchOpts, { duplex: "half" })
						}
						return fetchOpts
					}),
					Effect.map((fetchOpts) => ({
						...fetchOpts,
						body: args.config.body,
						headers: finalHeaders
					} satisfies HttpClientRequest.Options.NoUrl))
				)
				return HttpClientRequest.make(args.config.method)(finalUrl, finalOptions)
			}),
			sendRequest: Effect.fn(function*(request: HttpClientRequest.HttpClientRequest, options: {
				errorCodes: Array<StatusCode>
				retryConfig: {
					codes: Array<StatusCode>
					schedule: Schedule.Schedule<any, any>
					retryConnectionErrors?: boolean
				} | undefined
			}) {
				const httpClient = pipe(
					yield* HttpClient.HttpClient,
					HttpClient.filterStatus((statusCode) => {
						const optionsDefinedErrors = options.errorCodes.reduce((acc, e) => {
							acc[e] = true
							return acc
						}, {} as Record<StatusCode, boolean>)
						return matchStatus(statusCode, {
							"2xx": () => !(optionsDefinedErrors[statusCode] || optionsDefinedErrors["2XX"]),
							"3xx": () => !(optionsDefinedErrors[statusCode] || optionsDefinedErrors["3XX"]),
							"4xx": () => !(optionsDefinedErrors[statusCode] || optionsDefinedErrors["4XX"]),
							"5xx": () => !(optionsDefinedErrors[statusCode] || optionsDefinedErrors["5XX"]),
							orElse: () => true
						})
					}),
					options.retryConfig === undefined
						? identity // noop
						: HttpClient.retryTransient({
							retryOn: "errors-and-responses",
							schedule: options.retryConfig.schedule,
							while: (clientError) => {
								if (!clientError.response) return false
								const optionsDefinedRetryCodes = options.retryConfig!.codes.reduce((acc, code) => {
									acc[code] = true
									return acc
								}, {} as Record<StatusCode, boolean>)
								return matchStatus(clientError.response.status, {
									"2xx": () =>
										!!optionsDefinedRetryCodes[clientError.response!.status] || !!optionsDefinedRetryCodes["2XX"],
									"3xx": () =>
										!!optionsDefinedRetryCodes[clientError.response!.status] || !!optionsDefinedRetryCodes["3XX"],
									"4xx": () =>
										!!optionsDefinedRetryCodes[clientError.response!.status] || !!optionsDefinedRetryCodes["4XX"],
									"5xx": () =>
										!!optionsDefinedRetryCodes[clientError.response!.status] || !!optionsDefinedRetryCodes["5XX"],
									orElse: () => false
								})
							}
						})
				)
				return yield* httpClient.execute(request)
			})
		}
	})
}) {}
const pathToFuncOrDie = (path: string) =>
	Effect.try({
		try: () => pathToFunc(path)(),
		catch: (err) => {
			throw new InvalidMistralApiPathUrl({
				message: `Path to api function \`${path}\` is invalid or cannot be resolved`,
				cause: err
			})
		}
	})
const transientErrorStatusCodes: StatusCode[] = [429, 500, 502, 503, 504]
export const logFile = (file: File | Blob) => {
	try {
		const entry = file
		console.log("--- File entry diagnostics ---")
		console.log("typeof:", typeof entry)
		console.log("instanceof Blob:", entry instanceof Blob)
		console.log(
			"constructor name:",
			entry && (entry as any).constructor ? (entry as any).constructor.name : undefined
		)
		console.log("toString:", Object.prototype.toString.call(entry))
		if (entry && typeof (entry as any).name !== "undefined") {
			console.log("entry.name:", (entry as any).name)
		}
		if (entry && typeof (entry as any).size !== "undefined") {
			console.log("entry.size:", (entry as any).size)
		}
		if (entry && typeof (entry as any).type !== "undefined") {
			console.log("entry.type:", (entry as any).type)
		}
		if (entry && typeof (entry as any).arrayBuffer === "function") {
			console.log("has arrayBuffer()")
			console.log("array buffer contents", (entry as any).arrayBuffer())
		}
		if (entry && typeof (entry as any).stream === "function") {
			console.log("has stream()")
		}
		console.log("--- end diagnostics ---")
	} catch (err) {
		console.log("Error while inspecting FormData file entry:", err)
	}
}

const fileParamIsFileT = (u: MultiPartBodyParams["file"]): u is FileT => "fileName" in u || "content" in u
export const isNodeBuffer = (u: unknown): u is Uint8Array<ArrayBuffer> =>
	// @ts-ignore
	typeof Buffer !== "undefined" && Buffer.isBuffer(u) && "buffer" in u && "byteLength" in u && "byteOffset" in u
export const httpBodyFromMultiPartBodyParams = Effect.fn(
	function*(
		request: z.infer<typeof MultiPartBodyParams$outboundSchema>
	) {
		const body = HttpBody.formData(new FormData())
		if (fileParamIsFileT(request.file)) {
			const filename = request.file.fileName
			const contentType = getContentTypeFromFileName(filename)
				|| "application/octet-stream"
			const content = yield* pipe(
				request.file.content,
				Match.type<typeof request.file.content>().pipe(
					Match.when(
						isReadableStream,
						(stream) =>
							pipe(
								Effect.tryPromise(() => readableStreamToArrayBuffer(stream)),
								Effect.catchTag("UnknownError", (err: TypeError) =>
									Effect.fail(
										new InvalidReadableStreamInFileContent({
											message: "Failed to read content from provided ReadableStream",
											cause: err
										})
									)),
								Effect.map((buffer) => new Blob([buffer], { type: contentType }))
							)
					),
					Match.when(
						// Node Buffer instances are subclasses of Uint8Array. https://github.com/mistralai/client-ts/issues/180
						isNodeBuffer,
						(buf) => {
							const bytes = new Uint8Array(buf.byteLength)
							for (let i = 0; i < buf.byteLength; i++) bytes[i] = buf[i + buf.byteOffset]
							return new Blob([bytes], { type: contentType })
						}
					),
					Match.when(
						(u): u is Uint8Array => u instanceof Uint8Array || ArrayBuffer.isView(u),
						(u8) => new Blob([new Uint8Array(u8)], { type: contentType })
					),
					Match.when(
						(u): u is ArrayBuffer => u instanceof ArrayBuffer,
						(ab) => new Blob([new Uint8Array(ab)], { type: contentType })
					),
					Match.when(
						(u): u is Blob => isBlobLike(u),
						(blob) => blob instanceof Blob ? blob : new Blob([blob], { type: contentType })
					),
					Match.exhaustive
				),
				(result) => isEffect(result) ? result : Effect.succeed(result)
			)
			appendFormDataValue(body, "file", content, filename)
		} else {
			appendFormDataValue(body, "file", request.file)
		}
		if (request.expiry !== undefined) {
			appendFormDataValue(body, "expiry", request.expiry)
		}
		if (request.purpose !== undefined) {
			appendFormDataValue(body, "purpose", request.purpose)
		}
		if (request.visibility !== undefined) {
			appendFormDataValue(body, "visibility", request.visibility)
		}
		return body
	}
)
const zDecode = <Out, In>(
	schema: z.ZodType<
		Out,
		In
	>,
	value: In
): Effect.Effect<Out, MistralOpenApiSpecValidationError> =>
	Effect.tryPromise({
		try: () => schema.parseAsync(value),
		catch: (err: unknown) => {
			if (err instanceof SDKValidationError) {
				return new MistralOpenApiSpecValidationError({
					message: "Request object did not match expected schema:\n",
					cause: err as any
				})
			} else throw err
		}
	})
class FilesService extends ServiceMap.Service<FilesService>()("FilesService", {
	make: Effect.gen(function*() {
		const client = yield* ClientCore
		return {
			upload: Effect.fn(function*(request: MultiPartBodyParams, options?: ApiRequestOptions | undefined) {
				const body = yield* pipe(
					zDecode(MultiPartBodyParams$outboundSchema, request),
					Effect.andThen(httpBodyFromMultiPartBodyParams)
				)
				const path = yield* pathToFuncOrDie("/v1/files")
				const headers = Headers.fromInput({ Accept: "application/json" })
				const requestSecurity = resolveGlobalSecurity({ apiKey: client.apiKey })
				const httpRequest = yield* client.buildRequest({
					config: {
						security: requestSecurity,
						method: "POST",
						baseURL: options?.serverURL,
						path,
						headers,
						body
					},
					options
				})
				const response = yield* client.sendRequest(httpRequest, {
					errorCodes: ["4XX", "5XX"],
					retryConfig: options?.retries?.strategy === "backoff" ?
						{
							codes: (options?.retryCodes as StatusCode[]) || transientErrorStatusCodes,
							schedule: options.retries.backoff
								? backoffStrategyToSchedule(options.retries.backoff) :
								defaultBackoffSchedule
						} :
						undefined
				})
				return yield* pipe(
					response.json,
					Effect.andThen((json) => zDecode(CreateFileResponse$inboundSchema, json))
				)
			})
		}
	})
}) {
	static Default = Layer.effect(FilesService, this.make)
}
class OcrService extends ServiceMap.Service<OcrService>()("OcrService", {
	make: Effect.gen(function*() {
		const client = yield* ClientCore
		return {
			process: Effect.fn(function*(request: OCRRequest, options?: ApiRequestOptions | undefined) {
				const body = encodeJSON("body", yield* zDecode(OCRRequest$outboundSchema, request), { explode: true })
				const path = yield* pathToFuncOrDie("/v1/ocr")
				const headers = Headers.fromInput({ "Content-Type": "application/json", Accept: "application/json" })
				const requestSecurity = resolveGlobalSecurity({ apiKey: client.apiKey })
				const httpRequest = yield* client.buildRequest({
					config: {
						security: requestSecurity,
						method: "POST",
						baseURL: options?.serverURL,
						path,
						headers,
						body: HttpBody.raw(body ?? "")
					},
					options
				})
				const response = yield* client.sendRequest(httpRequest, {
					errorCodes: [422, "4XX", "5XX"],
					retryConfig: remapRetryConfigFromOptions(options)
				})
				return yield* response.json.pipe(
					Effect.andThen((json) => zDecode(OCRResponse$inboundSchema, json))
				)
			})
		}
	})
}) {
	static Default = Layer.effect(OcrService, this.make)
}

export class MistralBaseClient extends ServiceMap.Service<MistralBaseClient>()("MistralBaseClient", {
	make: Effect.gen(function*() {
		return {
			files: yield* FilesService,
			ocr: yield* OcrService
		}
	})
}) {
	static Default = Layer.effect(MistralBaseClient, this.make)
	static Live = (config: MistralClientConfig) =>
		this.Default.pipe(
			Layer.provide(
				Layer.mergeAll(FilesService.Default, OcrService.Default)
			),
			Layer.provide(Layer.effect(ClientCore, ClientCore.make(config)))
		)
}
