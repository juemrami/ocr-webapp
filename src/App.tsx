import type { Component, JSX } from "solid-js"
import { createSignal } from "solid-js"

const App: Component = () => {
	const [markdownText, _setMarkdownText] = createSignal("")
	const [uploadedFile, setuploadedFile] = createSignal<File | null>(null)

	const onFileChange: JSX.EventHandler<HTMLInputElement, Event> = async (e) => {
		const file = e.currentTarget.files?.[0]
		if (!file) return
		setuploadedFile(file)
	}

	let fileInput: HTMLInputElement | undefined

	return (
		<div class="app-container min-h-screen p-6 bg-slate-100 text-slate-900">
			<header class="app-header mb-8 text-center">
				<h1 class="text-3xl sm:text-4xl font-bold">OCR Webapp</h1>
				<p class="mt-2 text-sm text-slate-600">Upload a file and get plain markdown text.</p>
			</header>

			<div class="grid grid-cols-1 gap-6">
				<section class="markdown-area rounded-xl bg-white p-6 shadow-sm">
					<div class="flex items-end justify-between gap-4 mb-1">
						<h2 class="heading text-xl font-semibold">Output</h2>
						<div class="inline-flex flex-col items-end gap-1">
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
								<button
									class="button-behavior px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-slate-400 disabled:cursor-not-allowed transition-colors text-sm font-medium"
									disabled={!uploadedFile()}
									onClick={() => console.log("Start OCR triggered")}
								>
									Start OCR
								</button>
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
