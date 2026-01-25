import { defineConfig } from "@lithiajs/core";
import { resolve } from "node:path";

export default defineConfig({
	http: {
		port: 3001,
		host: "localhost",
		maxBodySize: 10 * 1024 * 1024, // 10MB para teste de upload
		cors: {
			origin: ["*"],
			methods: ["GET", "POST", "OPTIONS"],
			allowedHeaders: ["Content-Type"],
		},
		mimeTypes: {
			".custom": "text/x-custom-lithia",
		},
	},
	static: {
		root: resolve(__dirname, "public"),
		prefix: "/assets", // Arquivos acessíveis em /assets/nome-do-arquivo
	},
});
