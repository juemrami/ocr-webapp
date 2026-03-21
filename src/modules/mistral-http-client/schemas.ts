import { Schema } from "effect"

const SampleType$inboundSchema = Schema.Enum(
	{
		Pretrain: "pretrain",
		Instruct: "instruct",
		BatchRequest: "batch_request",
		BatchResult: "batch_result",
		BatchError: "batch_error"
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

export type CreateFileResponse = typeof CreateFileResponse$inboundSchema.Type
