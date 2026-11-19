import "dotenv/config";
import { z } from "zod";

const configSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  CLIENT_ORIGIN: z.string().url().default("http://localhost:5173"),
  MONGODB_URI: z.string().min(1).default("mongodb://127.0.0.1:27017/morrow-cafe"),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters").default("local-development-secret-do-not-deploy"),
  JWT_EXPIRES_IN: z.string().default("2h"),
  BRAND_NAME: z.string().default("Morrow & Moss"),
  BRAND_CURRENCY: z.string().length(3).default("USD"),
  TAX_RATE: z.coerce.number().min(0).max(1).default(0.0825),
  DELIVERY_FEE: z.coerce.number().min(0).default(4.5),
  RESERVATION_SLOT_CAPACITY: z.coerce.number().int().min(1).max(100).default(8),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_SUCCESS_URL: z.string().url().optional(),
  STRIPE_CANCEL_URL: z.string().url().optional()
});

export const config = configSchema.parse(process.env);

if (config.NODE_ENV === "production" && !process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET must be explicitly configured in production.");
}
