import { Schema, model } from "mongoose";

const UserSchema = new Schema({
  username: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  checkInCount: { type: Number, default: 0 },
  tokenVersion: { type: Number, default: 0 },
  
});

const User = model("User", UserSchema);

export default User;