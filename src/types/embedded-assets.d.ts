declare module '*.worker.txt' {
	const source: string;
	export default source;
}

declare module '*.wasm.bin' {
	const base64: string;
	export default base64;
}
