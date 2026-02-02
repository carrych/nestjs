export interface UserMetadata {
  [key: string]: unknown;
}

export interface User {
  id: number;
  email: string;
  username: string;
  password: string;
  metadata: UserMetadata;
}

export type UserWithoutPassword = Omit<User, 'password'>;
