import type { Request, Response, NextFunction } from "express";
import { eq, and } from "drizzle-orm";
import { db } from "./db";
import { products, productMembers, organisationMembers } from "@shared/schema";

// ──────────────────────────────────────────────────────────────────────────────
// Authorization middleware (audit S1)
//
// `requireAuth` only proves the caller is logged in. These middlewares prove the
// caller is actually a member of the org/product they are addressing, closing
// the IDOR hole where any authenticated user could read or mutate any tenant.
// ──────────────────────────────────────────────────────────────────────────────

async function userInOrg(userId: string, orgId: number): Promise<boolean> {
  const [row] = await db
    .select({ id: organisationMembers.id })
    .from(organisationMembers)
    .where(and(eq(organisationMembers.org_id, orgId), eq(organisationMembers.user_id, userId)))
    .limit(1);
  return !!row;
}

/** Caller must be a member of :orgId. */
export async function requireOrgAccess(req: Request, res: Response, next: NextFunction) {
  try {
    const orgId = parseInt(req.params.orgId as string);
    if (isNaN(orgId)) return res.status(400).json({ error: "Invalid org ID" });
    const userId = req.user!.id;
    if (!(await userInOrg(userId, orgId))) {
      return res.status(403).json({ error: "You do not have access to this organisation" });
    }
    next();
  } catch (err) {
    console.error("requireOrgAccess error:", err);
    res.status(500).json({ error: "Authorization check failed" });
  }
}

/**
 * Caller must be a member of :productId, OR a member of the product's org
 * (org members can see all products in their org). Attaches the loaded product
 * to req.locals for downstream handlers to reuse (avoids a duplicate query).
 */
export async function requireProductAccess(req: Request, res: Response, next: NextFunction) {
  try {
    const productId = parseInt(req.params.productId as string);
    if (isNaN(productId)) return res.status(400).json({ error: "Invalid product ID" });
    const userId = req.user!.id;

    const [product] = await db
      .select({ id: products.id, org_id: products.org_id, owner_id: products.owner_id, product_type: products.product_type, name: products.name })
      .from(products)
      .where(eq(products.id, productId))
      .limit(1);
    if (!product) return res.status(404).json({ error: "Product not found" });

    const [member] = await db
      .select({ id: productMembers.id })
      .from(productMembers)
      .where(and(eq(productMembers.product_id, productId), eq(productMembers.user_id, userId)))
      .limit(1);

    const allowed = !!member || (await userInOrg(userId, product.org_id));
    if (!allowed) {
      return res.status(403).json({ error: "You do not have access to this product" });
    }

    (req as any).product = product;
    next();
  } catch (err) {
    console.error("requireProductAccess error:", err);
    res.status(500).json({ error: "Authorization check failed" });
  }
}
