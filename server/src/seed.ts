import mongoose from "mongoose";
import { config } from "./config.js";
import { CommunityPost, MenuItemModel, User } from "./models.js";

const ownerEmail = process.env.SEED_OWNER_EMAIL?.toLowerCase();
const ownerPassword = process.env.SEED_OWNER_PASSWORD;
if (!ownerEmail || !ownerPassword || ownerPassword.length < 12) {
  throw new Error("Set SEED_OWNER_EMAIL and a SEED_OWNER_PASSWORD of at least 12 characters before seeding.");
}

await mongoose.connect(config.MONGODB_URI);
const menu = [
  { name: "Mossy Matcha", slug: "mossy-matcha", category: "Tea", description: "Ceremonial matcha, oat milk, and a little honey.", price: 5.5, imageUrl: "https://images.unsplash.com/photo-1515823064-d6e0c04616a7?auto=format&fit=crop&w=900&q=80", dietary: ["vegetarian"], allergens: ["oat"], sizes: [{ name: "Regular", price: 5.5 }, { name: "Large", price: 6.5 }], addOns: [{ name: "Vanilla", price: 0.5 }, { name: "Extra shot", price: 1 }], stock: 40, available: true, featured: true },
  { name: "Maple Oat Latte", slug: "maple-oat-latte", category: "Coffee", description: "Double espresso, steamed oat milk, maple, cinnamon.", price: 5.25, imageUrl: "https://images.unsplash.com/photo-1461023058943-07fcbe16d735?auto=format&fit=crop&w=900&q=80", dietary: ["vegan", "dairy-free"], allergens: ["oat"], sizes: [{ name: "Regular", price: 5.25 }, { name: "Large", price: 6.25 }], addOns: [{ name: "Extra shot", price: 1 }, { name: "Vanilla", price: 0.5 }], stock: 60, available: true, featured: true },
  { name: "Rosemary Egg Toast", slug: "rosemary-egg-toast", category: "Breakfast", description: "Soft eggs, whipped ricotta, herbs, sourdough.", price: 11.5, imageUrl: "https://images.unsplash.com/photo-1525351484163-7529414344d8?auto=format&fit=crop&w=900&q=80", dietary: ["vegetarian"], allergens: ["egg", "milk", "wheat"], sizes: [], addOns: [], stock: 24, available: true, featured: true },
  { name: "Brown Butter Cookie", slug: "brown-butter-cookie", category: "Desserts", description: "Chewy center, dark chocolate, flaky sea salt.", price: 4, imageUrl: "https://images.unsplash.com/photo-1499636136210-6f4ee915583e?auto=format&fit=crop&w=900&q=80", dietary: ["vegetarian"], allergens: ["wheat", "milk", "egg"], sizes: [], addOns: [], stock: 30, available: true, featured: false },
  { name: "Citrus Cloud", slug: "citrus-cloud", category: "Mocktails", description: "Fresh orange, lemon, sparkling water, rosemary.", price: 6, imageUrl: "https://images.unsplash.com/photo-1513558161293-cdaf765edfd7?auto=format&fit=crop&w=900&q=80", dietary: ["vegan", "gluten-free"], allergens: [], sizes: [], addOns: [], stock: 20, available: true, featured: false }
];
for (const item of menu) await MenuItemModel.updateOne({ slug: item.slug }, { $set: item }, { upsert: true });
let owner = await User.findOne({ email: ownerEmail });
if (!owner) {
  owner = new User({ name: "Café Owner", email: ownerEmail, role: "owner" });
  await owner.setPassword(ownerPassword);
  await owner.save();
}
await CommunityPost.updateOne(
  { message: "The quietest corner and the loveliest matcha." },
  { $setOnInsert: { name: "Jamie", email: "jamie@example.com", kind: "review", rating: 5, message: "The quietest corner and the loveliest matcha.", consent: true, status: "approved", featured: true } },
  { upsert: true }
);
console.log("Seeded menu, owner account, and one moderated community review.");
await mongoose.disconnect();
