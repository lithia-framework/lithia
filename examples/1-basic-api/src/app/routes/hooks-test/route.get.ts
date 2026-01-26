import { inject, useHeaders, useQuery, useRequest, useResponse } from "@lithiajs/core";
import { UserService } from "@/services/user-service";

export default async function hookTest() {
	const req = useRequest();
	const res = useResponse();
	const query = useQuery<{ name: string }>();
	const headers = useHeaders();
	const userService = inject(UserService);

	res.json({
		message: "Hooks are working!",
		reqMethod: req.method,
		queryName: query.name,
		userAgent: headers["user-agent"],
		users: await userService.getAll()
	});
}
