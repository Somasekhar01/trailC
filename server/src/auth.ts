import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { config } from "./config.js";
import { roles, User } from "./models.js";

export type Role = typeof roles[number];
export interface AuthRequest extends Request {
  auth?: { userId: string; role: Role };
}

export function createToken(user: { id: string; role: Role }): string {
  return jwt.sign({ sub: user.id, role: user.role }, config.JWT_SECRET, { expiresIn: config.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"] });
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction): void {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (!token) {
    res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Sign in to continue." } });
    return;
  }
  try {
    const payload = jwt.verify(token, config.JWT_SECRET) as jwt.JwtPayload & { role?: Role };
    if (typeof payload.sub !== "string" || !roles.includes(payload.role as Role)) throw new Error("Invalid token claims");
    req.auth = { userId: payload.sub, role: payload.role as Role };
    next();
  } catch {
    res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Your session is invalid or expired." } });
  }
}

export function requireRoles(...allowed: Role[]) {
  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    if (!req.auth) {
      res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Sign in to continue." } });
      return;
    }
    const account = await User.findById(req.auth.userId).select("role");
    if (!account || !allowed.includes(account.role as Role)) {
      res.status(403).json({ error: { code: "FORBIDDEN", message: "You do not have permission to do that." } });
      return;
    }
    next();
  };
}
