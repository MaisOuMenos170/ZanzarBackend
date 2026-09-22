import { UserModel, User } from "../models/user.model";
import { CreateUserInput } from "../schema/createUserSchema";


export const userRepository = {
    async findById(id: string): Promise<User | null> {
        return UserModel.findById(id).lean<User>();
    },

    async findByEmail(email: string): Promise<User | null> {
        return UserModel.findOne({ email }).lean<User>();
    },

    async create(data: CreateUserInput): Promise<User> {
        const doc = await UserModel.create(data);
        return doc.toObject() as User;
    },
};