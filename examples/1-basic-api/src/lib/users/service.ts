import { CreateUserInput, UpdateUserInput } from "./schema";
import { User } from "./types";

const db = new Map<string, User>();

export async function listUsers(): Promise<User[]> {
  return Array.from(db.values()) || [];
}

export async function createUser(user: CreateUserInput): Promise<User> {
  const id = crypto.randomUUID();
  const newUser = { id, ...user };
  
  db.set(id, newUser);

  return newUser;
}

export async function getUser(id: string): Promise<User | null> {
  return db.get(id) || null;
}

export async function deleteUser(id: string): Promise<boolean> {
  return db.delete(id);
}

export async function updateUser(id: string, updates: UpdateUserInput): Promise<User | null> {
  const existingUser = db.get(id);
  
  if (!existingUser) {
    return null;
  }

  const updatedUser = { ...existingUser, ...updates };
  db.set(id, updatedUser);
  
  return updatedUser;
}