import { Elysia, t } from "elysia";
import { ensureCached, ImageError, planTransform } from "../../images/transform";

const format = t.Union([
  t.Literal("webp"),
  t.Literal("png"),
  t.Literal("jpeg"),
  t.Literal("avif"),
]);
const fit = t.Union([t.Literal("contain"), t.Literal("fill")]);

/**
 * On-the-fly image variants: `GET /api/image?src=sample.png&w=200&format=webp`.
 *
 * `src` is resolved inside the source dir (sandboxed). The response is the
 * encoded image with a content-addressed `ETag` and a long `immutable`
 * `Cache-Control`, so browsers and CDNs cache aggressively and revalidate for
 * free via `If-None-Match`.
 */
export const imageRoutes = new Elysia({ prefix: "/image" }).get(
  "/",
  async ({ query, request }) => {
    try {
      const plan = await planTransform({
        src: query.src,
        width: query.w,
        height: query.h,
        format: query.format,
        quality: query.q,
        fit: query.fit,
      });

      const headers: Record<string, string> = {
        ETag: plan.etag,
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Image-Format": plan.format,
      };

      // Content-addressed key → if the ETag matches, the bytes are unchanged.
      if (request.headers.get("if-none-match") === plan.etag) {
        return new Response(null, { status: 304, headers });
      }

      const hit = await Bun.file(plan.cachePath).exists();
      await ensureCached(plan);

      headers["X-Cache"] = hit ? "HIT" : "MISS";
      headers["Content-Type"] = plan.contentType;
      return new Response(Bun.file(plan.cachePath), { headers });
    } catch (error) {
      if (error instanceof ImageError) {
        return new Response(error.message, { status: error.status });
      }
      throw error;
    }
  },
  {
    query: t.Object({
      src: t.String({ minLength: 1 }),
      w: t.Optional(t.Numeric()),
      h: t.Optional(t.Numeric()),
      format: t.Optional(format),
      q: t.Optional(t.Numeric()),
      fit: t.Optional(fit),
    }),
  },
);
