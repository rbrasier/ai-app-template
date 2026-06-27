import { type IUserRepository, type Result, type User } from "@rbrasier/domain";

export class ListPendingUsers {
  constructor(private readonly users: IUserRepository) {}

  async execute(): Promise<Result<User[]>> {
    const all = await this.users.list({ limit: 200 });
    if (all.error) return all;
    return { data: all.data.filter((user) => user.status === "pending") };
  }
}
