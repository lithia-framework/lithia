import { Lithia } from "@lithiajs/core";
import { UserService } from "../services/user-service";

export default async function server(app: Lithia) {
	// Register dependencies manually
	app.provide(UserService, new UserService());
}
