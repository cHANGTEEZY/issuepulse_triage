import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyGithubSignature(
  rawBody: string,
  signature: string | undefined,
  secret: string,
) {
  if (!secret || !signature?.startsWith("sha256=")) return false;

  const digest = createHmac("sha256", secret).update(rawBody).digest("hex");
  const expected = Buffer.from(`sha256=${digest}`);
  const received = Buffer.from(signature);

  if (expected.length !== received.length) return false;
  return timingSafeEqual(expected, received);
}
