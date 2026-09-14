import { BadRequestException } from "@nestjs/common";
import { z, type ZodTypeAny } from "zod";

/** ISO instant; a "+" in an offset arrives as a space when the client forgets to URL-encode it. */
export const IsoInstant = z
  .string()
  .transform((v) => v.replace(/ (\d{2}:?\d{2})$/, "+$1"))
  .refine((v) => !Number.isNaN(Date.parse(v)), "Invalid date-time");

export const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

export const RangeQuerySchema = z.object({ from: IsoInstant.optional(), to: IsoInstant.optional() });

export function parseQuery<S extends ZodTypeAny>(schema: S, query: unknown): z.output<S> {
  const r = schema.safeParse(query ?? {});
  if (!r.success) {
    throw new BadRequestException({ message: "Invalid query", issues: r.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) });
  }
  return r.data;
}

/** Validate at the HTTP boundary with zod; internal code trusts the parsed result. */
export function parseBody<S extends ZodTypeAny>(schema: S, body: unknown): z.output<S> {
  const r = schema.safeParse(body ?? {});
  if (!r.success) {
    throw new BadRequestException({ message: "Validation failed", issues: r.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) });
  }
  return r.data;
}
