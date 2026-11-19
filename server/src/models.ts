import mongoose, { Schema, type InferSchemaType } from "mongoose";
import bcrypt from "bcryptjs";

export const roles = ["customer", "owner", "manager", "cashier", "kitchen", "moderator"] as const;

type UserRole = typeof roles[number];
interface UserAttributes {
  name: string;
  email: string;
  phone?: string;
  passwordHash: string;
  role: UserRole;
}
interface UserMethods {
  setPassword(password: string): Promise<void>;
  verifyPassword(password: string): Promise<boolean>;
}
type UserModelType = mongoose.Model<UserAttributes, {}, UserMethods>;

const userSchema = new Schema<UserAttributes, UserModelType, UserMethods>({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  phone: { type: String, trim: true, maxlength: 32 },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, enum: roles, default: "customer", index: true }
}, { timestamps: true });

userSchema.methods.setPassword = async function (password: string): Promise<void> {
  this.passwordHash = await bcrypt.hash(password, 12);
};
userSchema.methods.verifyPassword = function (password: string): Promise<boolean> {
  return bcrypt.compare(password, this.passwordHash);
};

const menuItemSchema = new Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
  category: { type: String, required: true, index: true },
  description: { type: String, required: true, maxlength: 500 },
  price: { type: Number, required: true, min: 0 },
  imageUrl: { type: String, default: "" },
  dietary: [{ type: String, enum: ["vegan", "vegetarian", "gluten-free", "dairy-free", "contains-nuts"] }],
  allergens: [{ type: String }],
  sizes: [{ name: String, price: { type: Number, min: 0 } }],
  addOns: [{ name: String, price: { type: Number, min: 0 } }],
  stock: { type: Number, default: 0, min: 0 },
  available: { type: Boolean, default: true, index: true },
  featured: { type: Boolean, default: false }
}, { timestamps: true });
menuItemSchema.index({ category: 1, available: 1 });
menuItemSchema.index({ name: "text", description: "text", category: "text" });

const orderLineSchema = new Schema({
  item: { type: Schema.Types.ObjectId, ref: "MenuItem", required: true },
  name: { type: String, required: true },
  quantity: { type: Number, required: true, min: 1, max: 25 },
  unitPrice: { type: Number, required: true, min: 0 },
  size: { type: String, default: "" },
  addOns: [{ name: String, price: Number }],
  instructions: { type: String, maxlength: 250, default: "" }
}, { _id: false });

const orderSchema = new Schema({
  idempotencyKey: { type: String, required: true, unique: true },
  customer: { type: Schema.Types.ObjectId, ref: "User" },
  customerName: { type: String, required: true, maxlength: 100 },
  email: { type: String, required: true, lowercase: true, trim: true },
  phone: { type: String, required: true, maxlength: 32 },
  fulfillment: { type: String, enum: ["pickup", "delivery"], required: true },
  address: { type: String, maxlength: 300 },
  lines: { type: [orderLineSchema], required: true },
  subtotal: { type: Number, required: true },
  tax: { type: Number, required: true },
  deliveryFee: { type: Number, required: true },
  tip: { type: Number, required: true, default: 0 },
  total: { type: Number, required: true },
  status: { type: String, enum: ["new", "accepted", "preparing", "ready", "out_for_delivery", "completed", "cancelled", "refunded"], default: "new", index: true },
  paymentStatus: { type: String, enum: ["unpaid", "pending", "paid", "refunded"], default: "unpaid" },
  stripeSessionId: { type: String, sparse: true, unique: true },
  trackingTokenHash: { type: String, required: true, select: false },
  notes: { type: String, maxlength: 500 }
}, { timestamps: true });
orderSchema.index({ status: 1, createdAt: -1 });

const reservationSchema = new Schema({
  name: { type: String, required: true, maxlength: 100 },
  email: { type: String, required: true, lowercase: true, trim: true },
  phone: { type: String, required: true, maxlength: 32 },
  date: { type: Date, required: true, index: true },
  slotKey: { type: String, required: true },
  time: { type: String, required: true },
  partySize: { type: Number, required: true, min: 1, max: 12 },
  occasion: { type: String, maxlength: 80 },
  requests: { type: String, maxlength: 500 },
  status: { type: String, enum: ["pending", "confirmed", "cancelled"], default: "pending", index: true }
}, { timestamps: true });
reservationSchema.index({ date: 1, time: 1, status: 1 });

const reservationSlotSchema = new Schema({
  _id: { type: String, required: true },
  capacity: { type: Number, required: true, default: 8 },
  booked: { type: Number, required: true, default: 0 }
}, { versionKey: false });

const communityPostSchema = new Schema({
  name: { type: String, required: true, maxlength: 80 },
  email: { type: String, required: true, lowercase: true, trim: true },
  kind: { type: String, enum: ["photo", "video", "review", "feedback"], required: true },
  mediaUrl: { type: String, maxlength: 1000 },
  rating: { type: Number, min: 1, max: 5 },
  message: { type: String, required: true, maxlength: 1200 },
  consent: { type: Boolean, required: true, validate: (value: boolean) => value },
  status: { type: String, enum: ["pending", "approved", "rejected", "removed"], default: "pending", index: true },
  featured: { type: Boolean, default: false }
}, { timestamps: true });

export type MenuItem = InferSchemaType<typeof menuItemSchema>;
export type Order = InferSchemaType<typeof orderSchema>;
export const User = (mongoose.models.User as UserModelType | undefined) ?? mongoose.model<UserAttributes, UserModelType>("User", userSchema);
export const MenuItemModel = mongoose.models.MenuItem || mongoose.model("MenuItem", menuItemSchema);
export const OrderModel = mongoose.models.Order || mongoose.model("Order", orderSchema);
export const Reservation = mongoose.models.Reservation || mongoose.model("Reservation", reservationSchema);
export const ReservationSlot = mongoose.models.ReservationSlot || mongoose.model("ReservationSlot", reservationSlotSchema);
export const CommunityPost = mongoose.models.CommunityPost || mongoose.model("CommunityPost", communityPostSchema);
