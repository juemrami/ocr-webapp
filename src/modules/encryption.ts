import { pipe } from "effect"
import { decodeBase64, encodeBase64 } from "effect/Encoding"
import { getOrNull } from "effect/Result"

// Todo: add effect for error handling instead of return empty array or null
const safeDecodeBase64 = (input: string): Uint8Array<ArrayBuffer> =>
	pipe(
		decodeBase64(input),
		getOrNull,
		(result) => result as Uint8Array<ArrayBuffer> ?? new Uint8Array()
	)

async function deriveKey(passphrase: BufferSource, salt: BufferSource) {
	const keyMaterial = await crypto.subtle.importKey(
		"raw",
		passphrase,
		"PBKDF2",
		false,
		["deriveKey"]
	)
	return crypto.subtle.deriveKey(
		{ name: "PBKDF2", salt, iterations: 200_000, hash: "SHA-256" },
		keyMaterial,
		{ name: "AES-GCM", length: 256 },
		false,
		["encrypt", "decrypt"]
	)
}

export type EncryptedKeyStruct = {
	salt: string
	iv: string
	data: string
}
export async function encryptApiKey(passphrase: string, apiKey: string) {
	const textEncoder = new TextEncoder()
	const salt = crypto.getRandomValues(new Uint8Array(16))
	const iv = crypto.getRandomValues(new Uint8Array(12))
	const key = await deriveKey(textEncoder.encode(passphrase), salt)

	const ciphertext = await crypto.subtle.encrypt(
		{ name: "AES-GCM", iv },
		key,
		textEncoder.encode(apiKey)
	)

	return {
		salt: encodeBase64(salt),
		iv: encodeBase64(iv),
		data: encodeBase64(new Uint8Array(ciphertext))
	} satisfies EncryptedKeyStruct
}

export async function decryptApiKey(passphrase: string, stored: EncryptedKeyStruct) {
	const textEncoder = new TextEncoder()
	const salt = safeDecodeBase64(stored.salt)
	const iv = safeDecodeBase64(stored.iv)
	const data = safeDecodeBase64(stored.data)
	const key = await deriveKey(textEncoder.encode(passphrase), salt)

	try {
		const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data)
		return new TextDecoder().decode(decrypted)
	} catch {
		return null // Wrong passphrase — AES-GCM auth tag will fail
	}
}
