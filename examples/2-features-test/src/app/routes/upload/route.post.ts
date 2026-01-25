import type { LithiaRequest, LithiaResponse } from "@lithiajs/core";

// POST /upload
export default async function handler(req: LithiaRequest, res: LithiaResponse) {
	// Test multipart parsing
	const files = await req.files();
	const body = await req.body();

	res.json({
		message: "Upload received successfully",
		files: files.map((f: any) => ({
			fieldname: f.fieldname,
			filename: f.filename,
			mimeType: f.mimeType,
			size: f.buffer.length, // Check buffer size
		})),
		// Body should contain normal fields from the form
		fields: body,
	});
}
