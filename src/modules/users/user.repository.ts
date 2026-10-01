import { UserModel, User } from "../../models/user.model";
import { CreateUserInput } from "./schema/createUserSchema";
import { hashPassword } from "../../utils/bcrypt";
import { logger } from "../../utils/logger";

const log = logger.child({ module: "users", layer: "repository" });

// Emails are PII, so lookups by email are logged without the address.
export const userRepository = {
    async findById(id: string): Promise<User | null> {
        log.debug({ userId: id }, "Fetching user by id");
        try {
            const user = await UserModel.findById(id).lean<User>();
            log.debug({ userId: id, found: !!user }, "Fetched user by id");
            return user;
        } catch (err) {
            log.error({ err, userId: id }, "Failed to fetch user by id");
            throw err;
        }
    },

    async findByEmail(email: string): Promise<User | null> {
        log.debug("Fetching user by email");
        try {
            const user = await UserModel.findOne({ email }).lean<User>();
            log.debug({ found: !!user }, "Fetched user by email");
            return user;
        } catch (err) {
            log.error({ err }, "Failed to fetch user by email");
            throw err;
        }
    },

    async create(data: CreateUserInput): Promise<User> {
        log.debug("Creating user");
        try {
            const { password, ...rest } = data;
            const passwordHash = await hashPassword(password);

            const model = await UserModel.create({
                passwordHash: passwordHash,
                ...rest
            });
            log.debug({ userId: model._id }, "Created user");
            return model.toObject() as User;
        } catch (err) {
            log.error({ err }, "Failed to create user");
            throw err;
        }
    },
};
