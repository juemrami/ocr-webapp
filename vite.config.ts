/// <reference types="vitest/config" />
/// <reference types="vite/client" />
import tailwindcss from "@tailwindcss/vite"
import devtools from "solid-devtools/vite"
import { defineConfig } from "vite"
import { analyzer } from "vite-bundle-analyzer"
import solidPlugin from "vite-plugin-solid"

export default defineConfig({
	plugins: [
		analyzer({
			analyzerPort: 7272
		}),
		devtools(),
		solidPlugin(),
		tailwindcss()
	],
	server: {
		watch: {
			ignored: ["**/.jj/**"]
		},
		port: 3000
	},
	build: {
		target: "esnext"
	},
	test: {
		setupFiles: "./tests/setup.ts",
		include: ["tests/**/*.{test,spec}.{ts,tsx}"]
	}
})
