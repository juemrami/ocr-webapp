import { Effect, Exit } from "effect"
import type { Component, JSX } from "solid-js"
import { createSignal, onCleanup } from "solid-js"
import { Eye, EyeOff } from "./components/icons.tsx"
import { Popover, PopoverAnchor, PopoverContent } from "./components/ui/popover.tsx"
import { parseFile } from "./index.ts"
import { decryptApiKey, encryptApiKey } from "./modules/encryption.ts"
import { MistralOcrClient } from "./modules/mistral-ocr.ts"
import { mistralApiKeyAtom, mistralEncryptedKeyAtom, useAtom } from "./modules/reactivity.ts"

const App: Component = () => {
	const [markdownText, setMarkdownText] = createSignal("")
	const [uploadedFile, setuploadedFile] = createSignal<File | null>(null)
	const [mistralApiKeyConfig, setMistralApiKeyConfig] = useAtom(mistralApiKeyAtom)
	const [mistralEncryptedKey, setMistralEncryptedKey] = useAtom(mistralEncryptedKeyAtom)

	const onFileChange: JSX.EventHandler<HTMLInputElement, Event> = async (e) => {
		const file = e.currentTarget.files?.[0]
		if (!file) return
		setuploadedFile(file)
	}

	const onDoOcr = async () => {
		const uploaded = uploadedFile()
		const keyConfig = mistralApiKeyConfig()
		const encryptedKey = mistralEncryptedKey()
		if (!uploaded || !keyConfig.value) return
		if (keyConfig.isEncrypted && !keyConfig.sessionPassphrase) {
			setPassphrasePopoverOpen(true)
			return
		}
		if (keyConfig.isEncrypted && encryptedKey === null) {
			alert("Encrypted API key is missing. Please enter your API key.")
			setMistralApiKeyConfig({
				value: null,
				isEncrypted: false,
				sessionPassphrase: null
			})
			return
		}
		const apiKey = keyConfig.isEncrypted
			? await decryptApiKey(keyConfig.sessionPassphrase!, encryptedKey!)
			: keyConfig.value
		if (!apiKey) {
			alert("Failed to decrypt the API key. Please check your passphrase and try again.")
			setMistralApiKeyConfig({ sessionPassphrase: null })
			return
		}
		const result = await Effect.runPromiseExit(
			parseFile({
				fileName: uploaded.name,
				content: uploaded
			}).pipe(
				Effect.provide(MistralOcrClient.Live({
					apiKey
				}))
			)
		)
		Exit.match(result, {
			onFailure: (cause) => {
				cause.reasons.map((r) => console.error(r))
			},
			onSuccess: (markdown) => setMarkdownText(markdown)
		})
	}

	const [showApiKey, setShowApiKey] = createSignal(false)
	const [rememberDialogPending, setRememberDialogPending] = createSignal(false)
	const [rememberPopoverOpen, setRememberPopoverOpen] = createSignal(false)
	const [passphrasePopoverOpen, setPassphrasePopoverOpen] = createSignal(false)
	const apiKeyInputSectionElementId = "api-key-area"
	const hideKeyListener = (e: MouseEvent) => {
		const target = e.target as Node | null
		if (!target) return
		const apiKeyInputSection = document.getElementById(apiKeyInputSectionElementId)
		if (apiKeyInputSection?.contains(target)) return
		setShowApiKey(false)
	}
	window.addEventListener("click", hideKeyListener)
	onCleanup(() => window.removeEventListener("click", hideKeyListener))

	const onApiKeyInputInput = (e: Event) => {
		const v = (e.currentTarget as HTMLInputElement).value
		setMistralApiKeyConfig({ value: v })
	}
	const onPassphraseInputInput = (e: Event) => {
		setMistralApiKeyConfig({ sessionPassphrase: (e.currentTarget as HTMLInputElement).value || null })
	}

	const handleRememberMeCheckbox = (checked: boolean) => {
		if (checked) {
			setRememberDialogPending(true)
			setRememberPopoverOpen(true)
			return
		}
		setRememberDialogPending(false)
		setRememberPopoverOpen(false)
		setMistralApiKeyConfig({ isEncrypted: false })
	}

	const handleRememberPopoverOpenChange = (open: boolean) => {
		setRememberPopoverOpen(open)
		if (!open && !mistralApiKeyConfig().isEncrypted) {
			setRememberDialogPending(false)
			setMistralApiKeyConfig({
				isEncrypted: false
			})
		}
	}

	const handlePassphrasePopoverOpenChange = (open: boolean) => {
		setPassphrasePopoverOpen(open)
	}

	const handlePassphraseCancel = () => {
		setPassphrasePopoverOpen(false)
		setMistralApiKeyConfig({ sessionPassphrase: null })
	}

	const handlePassphraseSubmit = async () => {
		setPassphrasePopoverOpen(false)
		await onDoOcr()
	}

	const handleSaveRememberMePhrase = async () => {
		const apiKeyConfig = mistralApiKeyConfig()
		if (!apiKeyConfig.value || !apiKeyConfig.sessionPassphrase) return
		const encrypted = await encryptApiKey(apiKeyConfig.sessionPassphrase, apiKeyConfig.value)
		setMistralEncryptedKey(encrypted)
		setMistralApiKeyConfig({ value: encrypted.data, isEncrypted: true })
		setRememberDialogPending(false)
		setRememberPopoverOpen(false)
	}

	const handleCancelRememberMeRegistration = () => {
		setRememberDialogPending(false)
		setRememberPopoverOpen(false)
		setMistralApiKeyConfig({
			sessionPassphrase: null,
			isEncrypted: false
		})
	}

	let fileInput: HTMLInputElement | undefined
	let rememberAnchorEl: HTMLElement | undefined
	let startButtonAnchorEl: HTMLElement | undefined

	return (
		<div class="app-container min-h-screen p-6 bg-slate-100 text-slate-900">
			<header class="app-header mb-8 text-center">
				<h1 class="text-3xl sm:text-4xl font-bold">Mistral OCR Webapp</h1>
				<p class="mt-2 text-sm text-slate-600">Upload a file and get plain markdown text.</p>
			</header>

			{/* <DebugMistralApiKeyConfig /> */}

			<div class="grid grid-cols-1 gap-6">
				<section class="markdown-area rounded-xl bg-white p-6 shadow-sm">
					<div class="flex items-end justify-between gap-4 mb-1">
						<h2 class="heading text-xl font-semibold">Output</h2>
						<div class="inline-flex flex-col items-end gap-1">
							<div class="w-full mb-2 flex items-center gap-2 justify-end">
								<label
									for={"api-key-input"}
									class="text-sm text-slate-600"
								>
									API Key
								</label>
								<div
									id={apiKeyInputSectionElementId}
									class="flex items-stretch border border-slate-300 rounded-md overflow-hidden"
								>
									<input
										id={"api-key-input"}
										type={!showApiKey() ? "password" : "text"}
										value={mistralApiKeyConfig().value || ""}
										onInput={onApiKeyInputInput}
										disabled={mistralApiKeyConfig().isEncrypted}
										class="px-2 py-1 text-sm outline-none border-none w-[30ch] disabled:bg-slate-100 disabled:text-slate-400 disabled:placeholder-slate-400"
									/>
									<button
										id={"api-key-show-toggle"}
										type="button"
										onClick={(event) => {
											event.stopPropagation()
											setShowApiKey((prev) => !prev)
										}}
										class="px-3 py-1 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 border-l border-slate-300"
									>
										{!showApiKey() ? <EyeOff class="size-5" /> : <Eye class="size-5" />}
									</button>
								</div>
							</div>
							<div class="w-full flex justify-end">
								<Popover
									open={rememberPopoverOpen()}
									onOpenChange={handleRememberPopoverOpenChange}
								>
									<PopoverAnchor ref={(el: HTMLElement | undefined) => (rememberAnchorEl = el)}>
										<label class="inline-flex items-center gap-2 text-sm text-slate-600 cursor-pointer select-none">
											<input
												type="checkbox"
												checked={mistralApiKeyConfig().isEncrypted || rememberDialogPending()}
												onInput={(e) => {
													handleRememberMeCheckbox((e.currentTarget as HTMLInputElement).checked)
												}}
												disabled={!mistralApiKeyConfig().value}
												class="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 disabled:text-slate-400 disabled:bg-slate-200 disabled:border-slate-300"
											/>
											Remember Key
										</label>
									</PopoverAnchor>
									<PopoverContent
										class="max-w-xs rounded-xl border border-slate-200 bg-white p-4 shadow-lg text-sm text-slate-700"
										excludedElements={[() => rememberAnchorEl]}
									>
										<p class="mb-2 text-xs text-slate-500">
											The API key will be saved encrypted to minimize the risk of XSS attacks.
										</p>
										<label class="mb-1 text-[10px] uppercase tracking-wide text-slate-500" for="remember-pin-input">
											Enter Phrase or Pin
										</label>
										<input
											id="remember-pin-input"
											type="password"
											placeholder="4+ characters"
											value={mistralApiKeyConfig().sessionPassphrase || ""}
											onInput={onPassphraseInputInput}
											class="w-full rounded-md border border-slate-300 px-2 py-1 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
										/>
										<div class="mt-3 flex justify-end gap-2">
											<button
												type="button"
												onClick={handleCancelRememberMeRegistration}
												class="text-xs font-semibold uppercase tracking-wide text-slate-500 hover:text-slate-700"
											>
												Cancel
											</button>
											<button
												type="button"
												onClick={handleSaveRememberMePhrase}
												class="rounded-md bg-indigo-600 px-3 py-1 text-xs font-semibold text-white transition-colors hover:bg-indigo-700 disabled:bg-slate-400 disabled:cursor-not-allowed"
												disabled={!mistralApiKeyConfig().sessionPassphrase
													|| mistralApiKeyConfig()!.sessionPassphrase!.length < 4
													|| !mistralApiKeyConfig().value}
											>
												Save PIN
											</button>
										</div>
									</PopoverContent>
								</Popover>
							</div>
							<div class="flex items-center gap-3">
								<button
									class="button-behavior px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors text-sm font-medium"
									onClick={() => fileInput?.click()}
								>
									Select Document
								</button>
								<input
									ref={(el) => (fileInput = el)}
									type="file"
									accept=".txt,.md,.pdf,.png,.jpg,.jpeg"
									onInput={onFileChange}
									class="hidden"
								/>
								<Popover open={passphrasePopoverOpen()} onOpenChange={handlePassphrasePopoverOpenChange}>
									<PopoverAnchor ref={(el: HTMLElement | undefined) => (startButtonAnchorEl = el)}>
										<button
											class="button-behavior px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-slate-400 disabled:cursor-not-allowed transition-colors text-sm font-medium"
											disabled={!uploadedFile() || !mistralApiKeyConfig()}
											onClick={() => onDoOcr()}
										>
											Start OCR
										</button>
									</PopoverAnchor>
									<PopoverContent
										class="max-w-xs rounded-xl border border-slate-200 bg-white p-4 shadow-lg text-sm text-slate-700"
										excludedElements={[() => startButtonAnchorEl]}
									>
										<p class="mb-2 text-xs text-slate-500">
											Enter your Passphrase or PIN to unlock your API key and start the OCR process.
										</p>
										<label class="mb-1 text-[10px] uppercase tracking-wide text-slate-500" for="start-passphrase-input">
											Enter Phrase or PIN
										</label>
										<input
											id="start-passphrase-input"
											type="password"
											placeholder="4+ characters"
											value={mistralApiKeyConfig().sessionPassphrase || ""}
											onInput={onPassphraseInputInput}
											class="w-full rounded-md border border-slate-300 px-2 py-1 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
										/>
										<div class="mt-3 flex justify-end gap-2">
											<button
												type="button"
												onClick={handlePassphraseCancel}
												class="text-xs font-semibold uppercase tracking-wide text-slate-500 hover:text-slate-700"
											>
												Cancel
											</button>
											<button
												type="button"
												onClick={handlePassphraseSubmit}
												class="rounded-md bg-indigo-600 px-3 py-1 text-xs font-semibold text-white transition-colors hover:bg-indigo-700 disabled:bg-slate-400 disabled:cursor-not-allowed"
												disabled={!mistralApiKeyConfig().sessionPassphrase ||
													mistralApiKeyConfig().sessionPassphrase!.length < 4}
											>
												Use Passphrase
											</button>
										</div>
									</PopoverContent>
								</Popover>
							</div>
							<div class="w-fit">
								<div class="text-gray-400">
									{uploadedFile()
										? `${uploadedFile()!.name} • ${((uploadedFile()!.size ?? 0) / (1024 * 1024)).toFixed(2)} MB`
										: "No document selected yet"}
								</div>
							</div>
						</div>
					</div>
					<div>
						<textarea
							rows={10}
							readOnly={true}
							value={markdownText()}
							placeholder="Markdown source text will appear here"
							class="textarea-output w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm"
							style={{ resize: "none" }}
						/>
						<div class="markdown-preview rounded-lg border border-slate-200 bg-slate-50 p-3 mt-4 max-h-48 overflow-auto">
							<pre class="whitespace-pre-wrap text-xs text-slate-800">{markdownText()}</pre>
						</div>
					</div>
				</section>
			</div>
		</div>
	)
}

export default App
