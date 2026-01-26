import { UserService } from "@/lib/users/service";
import { Lithia } from "@lithia-js/core";

export default async function server(app: Lithia) {
  app.provide(UserService, new UserService());
}