export class UserService {
	private users = [
		{ id: 1, name: "Lucas" },
		{ id: 2, name: "Lithia" },
	];

	async getAll() {
		return this.users;
	}

	async getById(id: number) {
		return this.users.find((u) => u.id === id);
	}
}

export const UserServiceToken = Symbol("UserService");
