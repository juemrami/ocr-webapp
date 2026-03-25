import { Option, pipe } from "effect"
import { Atom } from "effect/unstable/reactivity"
import { decryptApiKey, type EncryptedKeyStruct } from "../../encryption"

type SessionApiKey = {
	value: string | null
	isEncrypted: boolean
	sessionPassphrase: string | null
}

export const makeEncryptedKeyAtom = (keyIdentifier: string) =>
	Atom.writable(() => {
		const stored = localStorage.getItem(`encrypted:${keyIdentifier}`)
		try {
			return stored ? JSON.parse(stored) as EncryptedKeyStruct : null
		} catch {
			console.warn(`Failed to parse stored encrypted key for ${keyIdentifier}. Clearing it.`)
			localStorage.removeItem(`encrypted:${keyIdentifier}`)
			return null
		}
	}, (ctx, update: EncryptedKeyStruct | null) => {
		if (update) {
			localStorage.setItem(`encrypted:${keyIdentifier}`, JSON.stringify(update))
			ctx.refreshSelf()
		} else {
			localStorage.removeItem(`encrypted:${keyIdentifier}`)
			ctx.refreshSelf()
		}
	})
export const mistralEncryptedKeyAtom = makeEncryptedKeyAtom("mistral_api_key")

export const mistralApiKeyAtom = Atom.writable((ctx) => {
	const storedEncryptedKey = ctx.get(mistralEncryptedKeyAtom)
	const encryptedValue = storedEncryptedKey?.data || null
	const selfOrDefault = Option.getOrElse(
		ctx.self<SessionApiKey>(),
		() => ({ value: encryptedValue, isEncrypted: !!encryptedValue, sessionPassphrase: null })
	)
	return encryptedValue
		? { sessionPassphrase: selfOrDefault.sessionPassphrase, value: encryptedValue, isEncrypted: true }
		: selfOrDefault
}, (ctx, update: Partial<SessionApiKey>) => {
	const current = ctx.get(mistralApiKeyAtom)
	const next: SessionApiKey = { ...current, ...update }
	const encryptedKey = ctx.get(mistralEncryptedKeyAtom)
	const setEmptyDefaults = () =>
		pipe(
			ctx.set(mistralEncryptedKeyAtom, null),
			() => ctx.setSelf({ value: null, sessionPassphrase: null, isEncrypted: false })
		)
	// if the API key value is changed while an encrypted key exists, clear the stored key to prevent mismatch.
	if (update.value !== undefined && encryptedKey && next.isEncrypted === false) {
		console.log("API key changed. Clearing stored encrypted key to prevent mismatch.", { current, update, next })
		ctx.set(mistralEncryptedKeyAtom, null)
		return ctx.setSelf({ value: next.value, sessionPassphrase: null, isEncrypted: false })
	}
	// if toggling encryption off while an encrypted key exists, clear the stored key to prevent mismatch.
	if (
		current.isEncrypted === true && update.isEncrypted === false
		&& encryptedKey !== null && next.sessionPassphrase
	) {
		console.log(
			"API key is being decrypted or changed while an encrypted key exists. Clearing stored encrypted key to prevent mismatch on next load.",
			{ current, update, next }
		)
		// this logic could get moved elsewhere. like closer to the ui action.
		return decryptApiKey(next.sessionPassphrase, encryptedKey).then((decrypted) => {
			if (decrypted === null) {
				console.warn(
					"Failed to decrypt API key with provided passphrase. Clearing stored encrypted key to prevent mismatch."
				)
				setEmptyDefaults()
			} else {
				console.log("Successfully decrypted API key. Updating state with decrypted value.")
				ctx.set(mistralEncryptedKeyAtom, null)
				ctx.setSelf({ value: decrypted, sessionPassphrase: null, isEncrypted: false })
			}
		})
		// If trying to toggle encryption off but no passphrase is provided, warn the user and revert the toggle to prevent mismatch.
	} else if (update.isEncrypted === false && (next.sessionPassphrase === null || next.sessionPassphrase === "")) {
		if (confirm("No passphrase found, stored API key will be cleared. Continue?")) {
			setEmptyDefaults()
		} else {
			ctx.setSelf({ value: next.value, sessionPassphrase: null, isEncrypted: true })
		}
	} else {
		console.log("Updating API key state. No side effects", { current, update, next })
		ctx.setSelf(next)
	}
})
