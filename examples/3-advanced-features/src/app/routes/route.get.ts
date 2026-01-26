import { useRequest, useResponse, useRoute } from "@lithiajs/core";

export default async function () {
	const req = useRequest();
  const res = useResponse();
  const route = useRoute();
  
  res.json({
    message: "Advanced Features Route GET",
    method: req.method,
    url: req.url(),
    routePath: route ? route.path : null,
  })
}
