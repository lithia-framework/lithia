import { CreateUserInput, UpdateUserInput } from "./schema";
import { User } from "./types";

const db = new Map<string, User>();

export class UserService {
  public async listUsers(): Promise<User[]> {
    return Array.from(db.values()) || [];
  }
  
  public async createUser(user: CreateUserInput): Promise<User> {
    const id = crypto.randomUUID();
    const newUser = { id, ...user };
    
    db.set(id, newUser);
  
    return newUser;
  }
  
  public async getUser(id: string): Promise<User | null> {
    return db.get(id) || null;
  }
  
  public async deleteUser(id: string): Promise<boolean> {
    return db.delete(id);
  }
  
  public async updateUser(id: string, updates: UpdateUserInput): Promise<User | null> {
    const existingUser = db.get(id);
    
    if (!existingUser) {
      return null;
    }
  
    const updatedUser = { ...existingUser, ...updates };
    db.set(id, updatedUser);
    
    return updatedUser;
  }
}
