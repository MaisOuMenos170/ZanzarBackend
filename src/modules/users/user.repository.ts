import { UserModel, User } from "../../models/user.model";
import { CreateUserInput } from "./schema/createUserSchema";
import { hashPassword } from "../../utils/bcrypt";


export const userRepository = {
    async findById(id: string): Promise<User | null> {
        return UserModel.findById(id).lean<User>();
    },

    async findByEmail(email: string): Promise<User | null> {
        return UserModel.findOne({ email }).lean<User>();
    },

    async findActiveItineraryIncompletePlaceIds(userId: string): Promise<string[]> {
        const user = await UserModel.findById(userId).select("activeItinerary").lean<User>();
        if (!user?.activeItinerary) {
            return [];
        }

        return user.activeItinerary.places
            .filter((place) => !place.isCompleted)
            .map((place) => place.placeId);
    },

    async create(data: CreateUserInput): Promise<User> {
        const { password, ...rest } = data;
        const passwordHash = await hashPassword(password);

        const model = await UserModel.create({
            passwordHash: passwordHash,
            ...rest
        });
        return model.toObject() as User;
    },
};