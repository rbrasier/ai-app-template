// `pending` users have registered but await admin approval; `rejected` users
// were declined. Only `active` users may hold a session.
export type UserStatus = "active" | "pending" | "rejected";

export interface User {
  readonly id: string;
  readonly email: string;
  readonly name: string | null;
  readonly isAdmin: boolean;
  readonly status: UserStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface NewUser {
  readonly email: string;
  readonly name?: string | null;
  readonly isAdmin?: boolean;
  readonly status?: UserStatus;
}

export interface UserUpdate {
  readonly email?: string;
  readonly name?: string | null;
  readonly isAdmin?: boolean;
  readonly status?: UserStatus;
}
