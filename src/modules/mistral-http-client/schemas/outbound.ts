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

export function isBlobLike(val: unknown): val is Blob {
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

// --- Child schemas used by OCRRequest
export const TableFormat$outboundSchema = Schema.Enum({ Markdown: "markdown", Html: "html" } as const)

export const ImageDetail$outboundSchema = Schema.Enum({ Low: "low", Auto: "auto", High: "high" } as const)

export const JsonSchema$outboundSchema = Schema.Struct({
	name: Schema.String,
	description: Schema.optional(Schema.NullOr(Schema.String)),
	schemaDefinition: Schema.Record(Schema.String, Schema.Json),
	strict: Schema.optional(Schema.Boolean)
}).pipe(Schema.encodeKeys({ schemaDefinition: "schema" }))

export const ResponseFormats$outboundSchema = Schema.Enum(
	{ Text: "text", JsonObject: "json_object", JsonSchema: "json_schema" } as const
)

export const ResponseFormat$outboundSchema = Schema.Struct({
	type: Schema.optional(ResponseFormats$outboundSchema),
	jsonSchema: Schema.optional(Schema.NullOr(JsonSchema$outboundSchema))
}).pipe(Schema.encodeKeys({ jsonSchema: "json_schema" }))

export const FileChunk$outboundSchema = Schema.Struct({
	type: Schema.String.pipe(Schema.withDecodingDefault(() => "file")),
	fileId: Schema.String
}).pipe(Schema.encodeKeys({ fileId: "file_id" }))

export const DocumentURLChunk$outboundSchema = Schema.Struct({
	type: Schema.String.pipe(Schema.withDecodingDefault(() => "document_url")),
	documentUrl: Schema.String,
	documentName: Schema.optional(Schema.NullOr(Schema.String))
}).pipe(Schema.encodeKeys({ documentUrl: "document_url", documentName: "document_name" }))

export const ImageURL$outboundSchema = Schema.Struct({
	url: Schema.String,
	detail: Schema.optional(Schema.NullOr(ImageDetail$outboundSchema))
})

export const ImageURLChunk$outboundSchema = Schema.Struct({
	type: Schema.String.pipe(Schema.withDecodingDefault(() => "image_url")),
	imageUrl: Schema.Union([ImageURL$outboundSchema, Schema.String])
}).pipe(Schema.encodeKeys({ imageUrl: "image_url" }))

// --- OCRRequest outbound schema (effect-smol Schema)
export const OCRRequest$outboundSchema = Schema.Struct({
	model: Schema.NullOr(Schema.String),
	id: Schema.optional(Schema.String),
	document: Schema.Union([FileChunk$outboundSchema, DocumentURLChunk$outboundSchema, ImageURLChunk$outboundSchema]),
	pages: Schema.optional(Schema.NullOr(Schema.Array(Schema.Int))),
	includeImageBase64: Schema.optional(Schema.NullOr(Schema.Boolean)),
	imageLimit: Schema.optional(Schema.NullOr(Schema.Int)),
	imageMinSize: Schema.optional(Schema.NullOr(Schema.Int)),
	bboxAnnotationFormat: Schema.optional(Schema.NullOr(ResponseFormat$outboundSchema)),
	documentAnnotationFormat: Schema.optional(Schema.NullOr(ResponseFormat$outboundSchema)),
	documentAnnotationPrompt: Schema.optional(Schema.NullOr(Schema.String)),
	tableFormat: Schema.optional(Schema.NullOr(TableFormat$outboundSchema)),
	extractHeader: Schema.optional(Schema.Boolean),
	extractFooter: Schema.optional(Schema.Boolean)
}).pipe(Schema.encodeKeys({
	includeImageBase64: "include_image_base64",
	imageLimit: "image_limit",
	imageMinSize: "image_min_size",
	bboxAnnotationFormat: "bbox_annotation_format",
	documentAnnotationFormat: "document_annotation_format",
	documentAnnotationPrompt: "document_annotation_prompt",
	tableFormat: "table_format",
	extractHeader: "extract_header",
	extractFooter: "extract_footer"
}))
