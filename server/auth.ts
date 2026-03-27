import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { db } from "./db";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";
import type { Request, Response, NextFunction } from "express";

// ── Type augmentation ────────────────────────────────────────────────────────
// Extends Express.User so req.user is typed throughout the app.
declare global {
  namespace Express {
    interface User {
      id: string;
      email: string | null;
      display_name: string | null;
      google_id: string | null;
    }
  }
}

// ── Serialize / deserialize ──────────────────────────────────────────────────
passport.serializeUser((user, done) => {
  done(null, (user as Express.User).id);
});

passport.deserializeUser(async (id: string, done) => {
  try {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    done(null, user ?? null);
  } catch (err) {
    done(err as Error);
  }
});

// ── Google OAuth strategy ────────────────────────────────────────────────────
// APP_URL must be set in production so the callback URL matches exactly what
// is registered in Google Cloud Console. If unset (or left as the example
// placeholder), falls back to localhost for local development.
const rawAppUrl = process.env.APP_URL;
const appUrl =
  rawAppUrl && !rawAppUrl.includes("your-production-domain")
    ? rawAppUrl
    : `http://localhost:${process.env.PORT || 5000}`;
const callbackURL = `${appUrl}/auth/google/callback`;

console.log(`[auth] Google OAuth callback URL: ${callbackURL}`);

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      callbackURL,
    },
    async (_accessToken, _refreshToken, profile, done) => {
      try {
        const googleId = profile.id;
        const email = profile.emails?.[0]?.value ?? null;
        const displayName = profile.displayName ?? null;

        // Look up by google_id — if not found, create the user
        let [user] = await db
          .select()
          .from(users)
          .where(eq(users.google_id, googleId))
          .limit(1);

        if (!user) {
          [user] = await db
            .insert(users)
            .values({ google_id: googleId, email, display_name: displayName })
            .returning();
        }

        done(null, user);
      } catch (err) {
        done(err as Error);
      }
    }
  )
);

export { passport };

// ── Auth middleware ──────────────────────────────────────────────────────────
// Apply to all protected /api/* routes.
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ error: "Unauthorized" });
}
