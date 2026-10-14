import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function createInvitationToken() {
  return randomBytes(32).toString("hex");
}

export function hashInvitationToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function invitationExpiresAt() {
  return new Date(Date.now() + INVITATION_TTL_MS);
}

export async function findInvitation(token: string) {
  return prisma.invitation.findUnique({
    where: { token: hashInvitationToken(token) },
    include: { workspace: { select: { id: true, name: true } } },
  });
}
