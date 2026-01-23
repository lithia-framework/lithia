import type { LithiaRequest, LithiaResponse } from "lithia";

export default async (_: LithiaRequest, res: LithiaResponse) => {
	res.send("Hello, from Lithia! 🚀");
};
