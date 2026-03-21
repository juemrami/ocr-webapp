/// <reference types="vitest/config" />
import tailwindcss from "@tailwindcss/vite"
import devtools from "solid-devtools/vite"
import { defineConfig } from "vite"
import solidPlugin from "vite-plugin-solid"

export default defineConfig({
	plugins: [devtools(), solidPlugin(), tailwindcss()],
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
		include: ["tests/**/*.{test,spec}.{ts,tsx}"]
	}
})
