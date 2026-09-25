import { UserModel, User } from "../models/user.model";
import { CreateUserInput } from "../schema/createUserSchema";
import { hashPassword } from "../utils/bcrypt";


export const userRepository = {
    async findById(id: string): Promise<User | null> {
        return UserModel.findById(id).lean<User>();
    },

    async findByEmail(email: string): Promise<User | null> {
        return UserModel.findOne({ email }).lean<User>();
    },

    async create(data: CreateUserInput): Promise<User> {
        const passwordHash = await hashPassword(data.password)
        const model = await UserModel.create({
            passwordHash: passwordHash,
            ...data
        });
        return model.toObject() as User;
    },
};