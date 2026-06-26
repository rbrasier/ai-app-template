export interface Permission {
  readonly id: string;
  readonly key: string;
  readonly description: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}
