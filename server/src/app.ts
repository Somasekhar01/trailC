import express, { type ErrorRequestHandler } from "express";
import cors from "cors";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import Stripe from "stripe";
import { createHash, timingSafeEqual } from "node:crypto";
import { config } from "./config.js";
import { CommunityPost, MenuItemModel, OrderModel, Reservation, ReservationSlot, User } from "./models.js";
import { createToken, requireAuth, requireRoles, type AuthRequest } from "./auth.js";
import { priceCart, reserveInventory } from "./orders.js";

export const app = express();
app.disable("x-powered-by");
app.use(helmet());
app.use(cors({ origin: config.CLIENT_ORIGIN, credentials: true }));
app.use(rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: "draft-7", legacyHeaders: false }));
app.use(express.json({
  limit: "1mb",
  verify: (req, _res, body) => { (req as express.Request & { rawBody?: Buffer }).rawBody = body; }
}));

const asyncRoute = (handler: express.RequestHandler): express.RequestHandler => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);
const objectId = z.string().regex(/^[a-f\d]{24}$/i);
const email = z.string().email().max(254).transform((value) => value.toLowerCase());
const trackingTokenSchema = z.string().regex(/^[a-f\d]{64}$/i);
function trackingTokenMatches(storedHash: string | undefined, token: unknown): boolean {
  if (typeof token !== "string" || !trackingTokenSchema.safeParse(token).success || !storedHash) return false;
  const suppliedHash = createHash("sha256").update(token).digest();
  const expectedHash = Buffer.from(storedHash, "hex");
  return suppliedHash.length === expectedHash.length && timingSafeEqual(suppliedHash, expectedHash);
}

app.get("/api/v1/health", (_req, res) => res.json({ data: { status: "ok" } }));
app.get("/api/v1/ready", asyncRoute(async (_req, res) => {
  const readyState = (await import("mongoose")).default.connection.readyState;
  if (readyState !== 1) {
    res.status(503).json({ error: { code: "NOT_READY", message: "Database is not connected." } });
    return;
  }
  res.json({ data: { status: "ready" } });
}));

const stripe = config.STRIPE_SECRET_KEY ? new Stripe(config.STRIPE_SECRET_KEY) : undefined;

app.post("/api/v1/auth/register", asyncRoute(async (req, res) => {
  const body = z.object({
    name: z.string().trim().min(1).max(100),
    email,
    phone: z.string().trim().min(7).max(32),
    password: z.string().min(10).max(128)
  }).strict().parse(req.body);
  if (await User.exists({ email: body.email })) {
    res.status(409).json({ error: { code: "EMAIL_IN_USE", message: "An account with that email already exists." } });
    return;
  }
  const user = new User({ name: body.name, email: body.email, phone: body.phone });
  await user.setPassword(body.password);
  await user.save();
  res.status(201).json({ data: { token: createToken({ id: String(user._id), role: user.role }), user: { id: user.id, name: user.name, email: user.email, role: user.role } } });
}));

app.post("/api/v1/auth/login", asyncRoute(async (req, res) => {
  const body = z.object({ email, password: z.string().min(1).max(128) }).strict().parse(req.body);
  const user = await User.findOne({ email: body.email }).select("+passwordHash");
  if (!user || !(await user.verifyPassword(body.password))) {
    res.status(401).json({ error: { code: "INVALID_CREDENTIALS", message: "Email or password is incorrect." } });
    return;
  }
  res.json({ data: { token: createToken({ id: String(user._id), role: user.role }), user: { id: user.id, name: user.name, email: user.email, role: user.role } } });
}));

app.get("/api/v1/auth/me", requireAuth, asyncRoute(async (req: AuthRequest, res) => {
  const user = await User.findById(req.auth!.userId).select("name email phone role");
  if (!user) {
    res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Account no longer exists." } });
    return;
  }
  res.json({ data: user });
}));

app.get("/api/v1/menu", asyncRoute(async (req, res) => {
  const query = z.object({
    category: z.string().trim().max(50).optional(),
    search: z.string().trim().max(100).optional(),
    featured: z.enum(["true", "false"]).optional()
  }).parse(req.query);
  const filter: Record<string, unknown> = { available: true };
  if (query.category && query.category !== "all") filter.category = query.category;
  if (query.featured === "true") filter.featured = true;
  if (query.search) filter.$text = { $search: query.search };
  const items = await MenuItemModel.find(filter).sort({ featured: -1, category: 1, name: 1 }).lean();
  res.json({ data: items });
}));

app.get("/api/v1/menu/categories", asyncRoute(async (_req, res) => {
  const categories = await MenuItemModel.distinct("category", { available: true });
  res.json({ data: categories });
}));

app.post("/api/v1/orders", asyncRoute(async (req, res) => {
  const key = req.header("Idempotency-Key");
  if (!key || key.length < 12 || key.length > 100) {
    res.status(400).json({ error: { code: "IDEMPOTENCY_KEY_REQUIRED", message: "Provide a unique Idempotency-Key header." } });
    return;
  }
  const body = z.object({
    customerName: z.string().trim().min(1).max(100),
    email,
    phone: z.string().trim().min(7).max(32),
    fulfillment: z.enum(["pickup", "delivery"]),
    address: z.string().trim().max(300).optional(),
    trackingToken: z.string().regex(/^[a-f\d]{64}$/i),
    tip: z.number().min(0).max(100).default(0),
    lines: z.array(z.object({
      itemId: objectId,
      quantity: z.number().int().min(1).max(25),
      size: z.string().max(40).optional(),
      addOns: z.array(z.string().max(50)).max(10).optional(),
      instructions: z.string().max(250).optional()
    }).strict()).min(1).max(30)
  }).strict().superRefine((value, ctx) => {
    if (value.fulfillment === "delivery" && !value.address) ctx.addIssue({ code: "custom", message: "Delivery address is required.", path: ["address"] });
  }).parse(req.body);
  const existing = await OrderModel.findOne({ idempotencyKey: key });
  if (existing) {
    const existingWithHash = await OrderModel.findById(existing._id).select("+trackingTokenHash");
    if (!trackingTokenMatches(existingWithHash?.trackingTokenHash, body.trackingToken)) {
      res.status(409).json({ error: { code: "IDEMPOTENCY_KEY_REUSED", message: "This idempotency key belongs to another order request." } });
      return;
    }
    res.status(200).json({
      data: { id: existing.id, status: existing.status, total: existing.total },
      trackingToken: body.trackingToken,
      idempotentReplay: true
    });
    return;
  }

  const priced = await priceCart(body.lines, body.fulfillment, body.tip);
  await reserveInventory(priced.lines);
  try {
    const order = await OrderModel.create({
      idempotencyKey: key,
      trackingTokenHash: createHash("sha256").update(body.trackingToken).digest("hex"),
      customerName: body.customerName,
      email: body.email,
      phone: body.phone,
      fulfillment: body.fulfillment,
      address: body.address,
      ...priced
    });
    res.status(201).json({
      data: { id: order.id, status: order.status, total: order.total },
      trackingToken: body.trackingToken,
      payment: { available: Boolean(stripe), message: stripe ? "Card checkout is available after payment session setup." : "Online card payment is not configured. Contact the café to arrange payment." }
    });
  } catch (error) {
    await Promise.all(priced.lines.map((line) =>
      MenuItemModel.updateOne({ _id: line.item }, { $inc: { stock: line.quantity } })
    ));
    if ((error as { code?: number }).code === 11000) {
      const replay = await OrderModel.findOne({ idempotencyKey: key }).select("+trackingTokenHash");
      if (replay && trackingTokenMatches(replay.trackingTokenHash, body.trackingToken)) {
        res.status(200).json({
          data: { id: replay.id, status: replay.status, total: replay.total },
          trackingToken: body.trackingToken,
          idempotentReplay: true
        });
        return;
      }
    }
    throw error;
  }
}));

app.post("/api/v1/orders/:id/checkout", asyncRoute(async (req, res) => {
  if (!stripe || !config.STRIPE_SUCCESS_URL || !config.STRIPE_CANCEL_URL) {
    res.status(503).json({ error: { code: "PAYMENTS_NOT_CONFIGURED", message: "Card payments are not configured for this café." } });
    return;
  }
  const id = objectId.parse(req.params.id);
  const order = await OrderModel.findById(id);
  if (!order) {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "Order not found." } });
    return;
  }
  const trackingToken = req.header("x-order-tracking-token");
  const securedOrder = await OrderModel.findById(id).select("+trackingTokenHash");
  if (!securedOrder || !trackingTokenMatches(securedOrder.trackingTokenHash, trackingToken)) {
    res.status(403).json({ error: { code: "FORBIDDEN", message: "A valid order tracking token is required." } });
    return;
  }
  if (order.paymentStatus !== "unpaid") {
    res.status(409).json({ error: { code: "PAYMENT_STATE_INVALID", message: "This order cannot start a new payment." } });
    return;
  }
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: order.email,
    line_items: [{
      quantity: 1,
      price_data: {
        currency: config.BRAND_CURRENCY.toLowerCase(),
        unit_amount: Math.round(order.total * 100),
        product_data: { name: `${config.BRAND_NAME} order` }
      }
    }],
    metadata: { orderId: String(order._id) },
    success_url: config.STRIPE_SUCCESS_URL,
    cancel_url: config.STRIPE_CANCEL_URL
  }, { idempotencyKey: `checkout-${order._id}` });
  order.stripeSessionId = session.id;
  order.paymentStatus = "pending";
  await order.save();
  res.json({ data: { checkoutUrl: session.url } });
}));

app.post("/api/v1/payments/stripe/webhook", asyncRoute(async (req, res) => {
  if (!stripe || !config.STRIPE_WEBHOOK_SECRET) {
    res.status(503).json({ error: { code: "PAYMENTS_NOT_CONFIGURED", message: "Payment webhook is not configured." } });
    return;
  }
  const signature = req.header("stripe-signature");
  if (!signature) {
    res.status(400).json({ error: { code: "SIGNATURE_REQUIRED", message: "Stripe signature header is required." } });
    return;
  }
  const rawBody = (req as express.Request & { rawBody?: Buffer }).rawBody;
  if (!rawBody) {
    res.status(400).json({ error: { code: "RAW_BODY_REQUIRED", message: "Raw payment event body is required." } });
    return;
  }
  const event = stripe.webhooks.constructEvent(rawBody, signature, config.STRIPE_WEBHOOK_SECRET);
  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    if (session.payment_status === "paid" && session.metadata?.orderId) {
      await OrderModel.updateOne(
        { _id: session.metadata.orderId, stripeSessionId: session.id, paymentStatus: "pending" },
        { $set: { paymentStatus: "paid" } }
      );
    }
  }
  if (event.type === "checkout.session.expired") {
    const session = event.data.object;
    await OrderModel.updateOne(
      { stripeSessionId: session.id, paymentStatus: "pending" },
      { $set: { paymentStatus: "unpaid" } }
    );
  }
  res.json({ received: true });
}));

app.get("/api/v1/orders/:id", asyncRoute(async (req, res) => {
  const id = objectId.parse(req.params.id);
  const trackingToken = trackingTokenSchema.parse(req.query.token);
  const order = await OrderModel.findById(id).select("+trackingTokenHash");
  if (!order) {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "Order not found." } });
    return;
  }
  if (!trackingTokenMatches(order.trackingTokenHash, trackingToken)) {
    res.status(403).json({ error: { code: "FORBIDDEN", message: "A valid order tracking token is required." } });
    return;
  }
  res.json({ data: {
    id: order.id,
    status: order.status,
    paymentStatus: order.paymentStatus,
    fulfillment: order.fulfillment,
    createdAt: order.createdAt,
    total: order.total,
    lines: order.lines.map((line: { name: string; quantity: number; size: string }) => ({ name: line.name, quantity: line.quantity, size: line.size }))
  } });
}));

app.post("/api/v1/reservations", asyncRoute(async (req, res) => {
  const body = z.object({
    name: z.string().trim().min(1).max(100),
    email,
    phone: z.string().trim().min(7).max(32),
    date: z.coerce.date(),
    time: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
    partySize: z.number().int().min(1).max(12),
    occasion: z.string().trim().max(80).optional(),
    requests: z.string().trim().max(500).optional()
  }).strict().parse(req.body);
  if (body.date.getTime() < Date.now() - 60_000) {
    res.status(400).json({ error: { code: "PAST_DATE", message: "Choose a future reservation date." } });
    return;
  }
  const slotKey = `${body.date.toISOString().slice(0, 10)}:${body.time}`;
  try {
    await ReservationSlot.updateOne({ _id: slotKey }, { $setOnInsert: { capacity: config.RESERVATION_SLOT_CAPACITY, booked: 0 } }, { upsert: true });
  } catch (error) {
    if ((error as { code?: number }).code !== 11000) throw error;
  }
  const slot = await ReservationSlot.findOneAndUpdate(
    { _id: slotKey, $expr: { $lte: [{ $add: ["$booked", body.partySize] }, "$capacity"] } },
    { $inc: { booked: body.partySize } },
    { new: true }
  );
  if (!slot) {
    res.status(409).json({ error: { code: "TIME_UNAVAILABLE", message: "That time is full. Please choose another time." } });
    return;
  }
  try {
    const reservation = await Reservation.create({ ...body, slotKey });
    res.status(201).json({ data: reservation, message: "Request received. The café will confirm your reservation." });
  } catch (error) {
    await ReservationSlot.updateOne({ _id: slotKey }, { $inc: { booked: -body.partySize } });
    throw error;
  }
}));

app.post("/api/v1/community", asyncRoute(async (req, res) => {
  const body = z.object({
    name: z.string().trim().min(1).max(80),
    email,
    kind: z.enum(["photo", "video", "review", "feedback"]),
    mediaUrl: z.string().url().max(1000).optional(),
    rating: z.number().int().min(1).max(5).optional(),
    message: z.string().trim().min(1).max(1200),
    consent: z.literal(true)
  }).strict().parse(req.body);
  if (["photo", "video"].includes(body.kind) && !body.mediaUrl) {
    res.status(400).json({ error: { code: "MEDIA_REQUIRED", message: "A media URL is required for photo or video posts." } });
    return;
  }
  const post = await CommunityPost.create(body);
  res.status(201).json({ data: { id: post.id, status: post.status }, message: "Thanks for sharing. Your post will be reviewed before publication." });
}));

app.get("/api/v1/community", asyncRoute(async (_req, res) => {
  const posts = await CommunityPost.find({ status: "approved", featured: true }).sort({ createdAt: -1 }).limit(12).select("-email");
  res.json({ data: posts });
}));

app.get("/api/v1/staff/orders", requireAuth, requireRoles("owner", "manager", "cashier", "kitchen"), asyncRoute(async (req, res) => {
  const status = req.query.status ? z.enum(["new", "accepted", "preparing", "ready", "out_for_delivery", "completed", "cancelled", "refunded"]).parse(req.query.status) : undefined;
  const orders = await OrderModel.find(status ? { status } : {}).sort({ createdAt: -1 }).limit(100);
  res.json({ data: orders });
}));

app.patch("/api/v1/staff/orders/:id/status", requireAuth, requireRoles("owner", "manager", "cashier", "kitchen"), asyncRoute(async (req: AuthRequest, res) => {
  const id = objectId.parse(req.params.id);
  const { status } = z.object({ status: z.enum(["accepted", "preparing", "ready", "out_for_delivery", "completed", "cancelled", "refunded"]) }).strict().parse(req.body);
  const order = await OrderModel.findById(id);
  if (!order) {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "Order not found." } });
    return;
  }
  if (order.status === "completed" || order.status === "refunded") {
    res.status(409).json({ error: { code: "INVALID_TRANSITION", message: "Completed or refunded orders cannot be changed." } });
    return;
  }
  order.status = status;
  await order.save();
  res.json({ data: order });
}));

app.get("/api/v1/staff/community", requireAuth, requireRoles("owner", "manager", "moderator"), asyncRoute(async (_req, res) => {
  res.json({ data: await CommunityPost.find({ status: "pending" }).sort({ createdAt: 1 }) });
}));

app.patch("/api/v1/staff/community/:id", requireAuth, requireRoles("owner", "manager", "moderator"), asyncRoute(async (req: AuthRequest, res) => {
  const id = objectId.parse(req.params.id);
  const update = z.object({ status: z.enum(["approved", "rejected", "removed"]), featured: z.boolean().optional() }).strict().parse(req.body);
  const post = await CommunityPost.findByIdAndUpdate(id, { $set: update }, { new: true, runValidators: true });
  if (!post) {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "Community post not found." } });
    return;
  }
  res.json({ data: post });
}));

app.get("/api/v1/staff/reservations", requireAuth, requireRoles("owner", "manager", "cashier"), asyncRoute(async (_req, res) => {
  const reservations = await Reservation.find({ status: { $in: ["pending", "confirmed"] } }).sort({ date: 1, time: 1 }).limit(200);
  res.json({ data: reservations });
}));

app.patch("/api/v1/staff/reservations/:id", requireAuth, requireRoles("owner", "manager", "cashier"), asyncRoute(async (req, res) => {
  const id = objectId.parse(req.params.id);
  const { status } = z.object({ status: z.enum(["confirmed", "cancelled"]) }).strict().parse(req.body);
  const reservation = await Reservation.findOneAndUpdate(
    { _id: id, status: { $in: ["pending", "confirmed"] } },
    { $set: { status } },
    { new: true, runValidators: true }
  );
  if (!reservation) {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "Reservation not found." } });
    return;
  }
  if (status === "cancelled") {
    await ReservationSlot.updateOne({ _id: reservation.slotKey }, { $inc: { booked: -reservation.partySize } });
  }
  res.json({ data: reservation });
}));

const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof z.ZodError) {
    res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Please check the submitted fields.", fields: error.issues.map((issue) => ({ field: issue.path.join("."), message: issue.message })) } });
    return;
  }
  const status = typeof error.status === "number" ? error.status : 500;
  if (status >= 500) console.error(JSON.stringify({ level: "error", message: error.message, name: error.name }));
  res.status(status).json({ error: { code: status === 500 ? "INTERNAL_ERROR" : "REQUEST_ERROR", message: status === 500 ? "Something went wrong. Please try again." : error.message } });
};
app.use(errorHandler);
