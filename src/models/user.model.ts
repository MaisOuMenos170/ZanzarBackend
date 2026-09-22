import { Schema, model, InferSchemaType, Types } from "mongoose";

const userSchema = new Schema(
    {
        email: { type: String, required: true, unique: true, lowercase: true },
        name: { type: String, required: true },
        role: { type: String, enum: ["admin", "user", "guest"], default: "user" },
    },
    { timestamps: true },
);

export type User = InferSchemaType<typeof userSchema> & { _id: Types.ObjectId };
export const UserModel = model("User", userSchema);