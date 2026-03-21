import { describe, expect, it } from "vitest"
import { decryptApiKey, encryptApiKey } from "../src/modules/encryption"

describe("encryption pipeline", () => {
	it("should encrypt and decrypt an API key with passphrase", async () => {
		const passphrase = "my-secret-passphrase"
		const apiKey = "sk-test-0123456789abcdef"

		const stored = await encryptApiKey(passphrase, apiKey)
		expect(stored).toHaveProperty("salt")
		expect(stored).toHaveProperty("iv")
		expect(stored).toHaveProperty("data")

		const decrypted = await decryptApiKey(passphrase, stored)
		expect(decrypted).toBe(apiKey)
	})
})
