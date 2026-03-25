import type * as HttpBody from "effect/unstable/http/HttpBody"
import { formData } from "effect/unstable/http/HttpBody"

/** `{[key]: {value: FormDataCoercible, fileName?: string}}` */
type FormDataInput = Record<string, {
	value: HttpBody.FormDataCoercible | ReadonlyArray<HttpBody.FormDataCoercible>
	fileName?: string | undefined
}>
export const appendFormDataValue = (
	formData: HttpBody.FormData,
	key: string,
	value: HttpBody.FormDataCoercible,
	fileName?: string | undefined
): void => {
	if (value == null) {
		return
	}
	if (Array.isArray(value)) {
		for (const item of value) {
			appendFormDataValue(formData, key, item, fileName)
		}
		return
	}
	if (typeof value === "object") {
		return formData.formData.append(key, value, fileName)
	}
	return formData.formData.append(key, String(value))
}

export const formDataRecordWithFileNames = (entries: FormDataInput): HttpBody.FormData => {
	const data = formData(new globalThis.FormData())
	for (const [key, { value, fileName }] of Object.entries(entries)) {
		if (Array.isArray(value)) {
			for (const item of value) {
				appendFormDataValue(data, key, item, fileName)
			}
		} else {
			appendFormDataValue(data, key, value as HttpBody.FormDataCoercible, fileName)
		}
	}
	return data
}
