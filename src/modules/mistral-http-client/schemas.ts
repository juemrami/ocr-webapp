import { Schema } from "effect"

const SampleType$inboundSchema = Schema.Enum(
	{
		Pretrain: "pretrain",
		Instruct: "instruct",
		BatchRequest: "batch_request",
		BatchResult: "batch_result",
		BatchError: "batch_error"
		// OcrInput: "ocr_input"
	} as const
)
const FilePurpose$inboundSchema = Schema.Enum(
	{
		FineTune: "fine-tune",
		Batch: "batch",
		Ocr: "ocr"
	} as const
)
const Source$inboundSchema = Schema.Enum(
	{
		Upload: "upload",
		Repository: "repository",
		Mistral: "mistral"
	} as const
)
const FileVisibility$inboundSchema = Schema.Enum(
	{
		Workspace: "workspace",
		User: "user"
	} as const
)
export const CreateFileResponse$inboundSchema = Schema.Struct({
	id: Schema.String,
	object: Schema.String,
	sizeBytes: Schema.Int,
	createdAt: Schema.Int,
	filename: Schema.String,
	purpose: FilePurpose$inboundSchema,
	sampleType: SampleType$inboundSchema,
	numLines: Schema.optional(Schema.NullOr(Schema.Int)),
	mimetype: Schema.optional(Schema.NullOr(Schema.String)),
	source: Source$inboundSchema,
	signature: Schema.optional(Schema.NullOr(Schema.String)),
	expiresAt: Schema.optional(Schema.NullOr(Schema.Int)),
	visibility: Schema.optional(Schema.NullOr(FileVisibility$inboundSchema))
}).pipe(
	Schema.encodeKeys({
		sizeBytes: "bytes",
		createdAt: "created_at",
		sampleType: "sample_type",
		numLines: "num_lines",
		expiresAt: "expires_at"
	})
)

const OCRPageDimensions$inboundSchema = Schema.Struct({
	dpi: Schema.Int,
	height: Schema.Int,
	width: Schema.Int
})
const Format$inboundSchema = Schema.Enum(
	{
		Markdown: "markdown",
		Html: "html"
	} as const
)
const OCRTableObject$inboundSchema = Schema.Struct({
	id: Schema.String,
	content: Schema.String,
	format: Format$inboundSchema
})

const OCRImageObject$inboundSchema = Schema.Struct({
	id: Schema.String,
	topLeftX: Schema.NullOr(Schema.Int),
	topLeftY: Schema.NullOr(Schema.Int),
	bottomRightX: Schema.NullOr(Schema.Int),
	bottomRightY: Schema.NullOr(Schema.Int),
	imageBase64: Schema.optional(Schema.NullOr(Schema.String)),
	imageAnnotation: Schema.optional(Schema.NullOr(Schema.String))
}).pipe(
	Schema.encodeKeys({
		topLeftX: "top_left_x",
		topLeftY: "top_left_y",
		bottomRightX: "bottom_right_x",
		bottomRightY: "bottom_right_y",
		imageBase64: "image_base64",
		imageAnnotation: "image_annotation"
	})
)

const OCRPageObject$inboundSchema = Schema.Struct({
	index: Schema.Int,
	markdown: Schema.String,
	images: Schema.Array(OCRImageObject$inboundSchema),
	tables: Schema.optional(Schema.Array(OCRTableObject$inboundSchema)),
	hyperlinks: Schema.optional(Schema.Array(Schema.String)),
	header: Schema.optional(Schema.NullOr(Schema.String)),
	footer: Schema.optional(Schema.NullOr(Schema.String)),
	dimensions: Schema.NullOr(OCRPageDimensions$inboundSchema)
})

const OCRUsageInfo$inboundSchema = Schema.Struct({
	pagesProcessed: Schema.Int,
	docSizeBytes: Schema.optional(Schema.NullOr(Schema.Int))
}).pipe(
	Schema.encodeKeys({
		pagesProcessed: "pages_processed",
		docSizeBytes: "doc_size_bytes"
	})
)

export const OCRResponse$inboundSchema = Schema.Struct({
	pages: Schema.Array(OCRPageObject$inboundSchema),
	model: Schema.String,
	documentAnnotation: Schema.optional(Schema.NullOr(Schema.String)),
	usageInfo: OCRUsageInfo$inboundSchema
}).pipe(
	Schema.encodeKeys({
		documentAnnotation: "document_annotation",
		usageInfo: "usage_info"
	})
)
export type CreateFileResponse = typeof CreateFileResponse$inboundSchema.Type
export type OCRResponse = typeof OCRResponse$inboundSchema.Type
