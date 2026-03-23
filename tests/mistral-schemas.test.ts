import { Schema } from "effect"
import { describe, expect, it } from "vitest"
import { CreateFileResponse$inboundSchema } from "../src/modules/mistral-http-client/schemas"

describe("mistral schemas", () => {
	it("decode and encode correctly", () => {
		const sampleResponse = {
			"id": "ddf6acfe-82fa-47a6-a182-c4cc1ecf0602",
			"object": "file",
			"bytes": 355000,
			"created_at": 1773989962,
			"filename": "screen-shot.png",
			"purpose": "ocr",
			"sample_type": "ocr_input",
			"num_lines": 0,
			"mimetype": "image/png",
			"source": "upload",
			"signature": "d9b71f12e6c66ebad96849a8ed310ec8",
			"expires_at": null,
			"visibility": "workspace"
		}
		const value = Schema.decodeUnknownSync(CreateFileResponse$inboundSchema)(sampleResponse)
		expect(value.createdAt).toBe(sampleResponse.created_at)
		const outValue = Schema.encodeSync(CreateFileResponse$inboundSchema)(value)
		expect(outValue.created_at).toBe(sampleResponse.created_at)
	})
})
