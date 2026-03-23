import { Schema } from "effect"

const FileVisibility$outboundSchema = Schema.Enum(
	{ Workspace: "workspace", User: "user" } as const
)

const FilePurpose$outboundSchema = Schema.Enum(
	{
		FineTune: "fine-tune",
		Batch: "batch",
		Ocr: "ocr"
	} as const
)

const FileT$outboundSchema = Schema.Struct({
	fileName: Schema.String,
	content: Schema.Union([
		Schema.declare((u): u is ReadableStream<Uint8Array> => u instanceof ReadableStream, {
			identifier: "ReadableStream<Uint8Array>",
			message: "expected a ReadableStream of Uint8Array"
		}),
		Schema.declare((u): u is Blob => u instanceof Blob, {
			identifier: "Blob",
			message: "expected a Blob"
		}),
		Schema.declare((u): u is ArrayBuffer => u instanceof ArrayBuffer, {
			identifier: "ArrayBuffer",
			message: "expected an ArrayBuffer"
		}),
		Schema.declare((u): u is Uint8Array => u instanceof Uint8Array, {
			identifier: "Uint8Array",
			message: "expected a Uint8Array"
		})
	])
})

function isBlobLike(val: unknown): val is Blob {
	if (val instanceof Blob) {
		return true
	}

	if (typeof val !== "object" || val == null || !(Symbol.toStringTag in val)) {
		return false
	}

	const name = val[Symbol.toStringTag]
	if (typeof name !== "string") {
		return false
	}
	if (name !== "Blob" && name !== "File") {
		return false
	}

	return "stream" in val && typeof val.stream === "function"
}
const BlobLikeSchema = Schema.declare((u): u is Blob => isBlobLike(u), {
	identifier: "BlobLike",
	message: "expected a Blob, File or Blob-like object"
})

export const MultiPartBodyParams$outboundSchema = Schema.Struct({
	expiry: Schema.optional(Schema.NullOr(Schema.Number)),
	visibility: FileVisibility$outboundSchema.pipe(Schema.withDecodingDefault(() => "workspace")),
	purpose: Schema.optional(FilePurpose$outboundSchema),
	file: Schema.Union([FileT$outboundSchema, BlobLikeSchema])
})
