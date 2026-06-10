import path from "node:path";
import { mkdir, readdir, realpath, rename, stat, unlink } from "node:fs/promises";

/**
 * On-the-fly image transform + disk cache, built on `Bun.Image`.
 *
 * Flow: `planTransform()` validates input and derives a content-addressed cache
 * key (cheap — `stat` only, no decode). `ensureCached()` runs the decode →
 * resize → encode pipeline once per key and writes the result to disk. The route
 * serves the cached file and lets HTTP `ETag`/`Cache-Control` do the rest.
 */

export type ImageFormat = "webp" | "png" | "jpeg" | "avif";
// No "cover": Bun.Image 1.3.14 resize has no crop, so cover (fill-then-crop)
// can't be done without a manual raw-pixel path. Intentionally omitted.
export type ImageFit = "contain" | "fill";

export interface TransformParams {
  /** Path relative to the source directory. Sandboxed — no traversal. */
  src: string;
  width?: number;
  height?: number;
  /** Output format. Default `"webp"`. */
  format?: ImageFormat;
  /** Encoder quality 1–100 (ignored for PNG). Default 80. */
  quality?: number;
  /** `"contain"` keeps aspect ratio; `"fill"` stretches to exact w×h. Default `"contain"`. */
  fit?: ImageFit;
}

/** Thrown for client-fixable problems; `status` maps straight to an HTTP code. */
export class ImageError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ImageError";
  }
}

// Config (override via env; Bun auto-loads `.env`).
const SOURCE_DIR = path.resolve(process.env.IMAGE_SOURCE_DIR ?? "public/images");
const CACHE_DIR = path.resolve(process.env.IMAGE_CACHE_DIR ?? ".cache/images");
const MAX_DIM = 4096; // output dimension bound
const MAX_PIXELS = 268402689; // decode-bomb guard (Sharp default: 0x3FFF²)
const DEFAULT_QUALITY = 80;
// Cache bound: every distinct w/h/q/format combination is a new cache file and
// the params are caller-controlled, so without a cap the cache grows forever.
const MAX_CACHE_BYTES = Number(process.env.IMAGE_CACHE_MAX_BYTES ?? 256 * 1024 * 1024);

const CONTENT_TYPE: Record<ImageFormat, string> = {
  webp: "image/webp",
  png: "image/png",
  jpeg: "image/jpeg",
  avif: "image/avif",
};

// 1×1 transparent PNG used to probe encoder capability.
const PROBE_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

let avifProbe: Promise<boolean> | null = null;

/**
 * Can this machine ENCODE the format? webp/png/jpeg ship as static codecs
 * (every platform). avif needs an OS encoder whose presence varies even within
 * a platform, so we probe with a real 1×1 encode (once, cached) instead of
 * guessing from `process.platform` — a wrong guess turns the documented
 * transparent-webp fallback into a 415.
 */
async function canEncode(format: ImageFormat): Promise<boolean> {
  if (format === "webp" || format === "png" || format === "jpeg") return true;
  avifProbe ??= new Bun.Image(PROBE_PNG)
    .avif({ quality: 50 })
    .bytes()
    .then(
      () => true,
      () => false,
    );
  return avifProbe;
}

interface NormalizedOps {
  width?: number;
  height?: number;
  fit: ImageFit;
  quality: number;
}

export interface ImagePlan {
  srcAbs: string;
  /** Effective format after capability fallback (may differ from requested). */
  format: ImageFormat;
  contentType: string;
  cachePath: string;
  etag: string;
  ops: NormalizedOps;
}

function normDim(value: number | undefined, name: string): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isFinite(value) || value < 1 || value > MAX_DIM) {
    throw new ImageError(400, `${name} must be between 1 and ${MAX_DIM}`);
  }
  return Math.floor(value);
}

function normQuality(value: number | undefined): number {
  if (value === undefined) return DEFAULT_QUALITY;
  if (!Number.isFinite(value) || value < 1 || value > 100) {
    throw new ImageError(400, "q must be between 1 and 100");
  }
  return Math.floor(value);
}

/**
 * Validate params, sandbox the source path, and compute a content-addressed
 * cache key. The key folds in the source file's mtime+size, so editing the
 * original automatically busts the cache. Does NOT decode the image.
 */
export async function planTransform(params: TransformParams): Promise<ImagePlan> {
  const src = params.src ?? "";

  // Sandbox: src is user-controlled — a bare path would be arbitrary-file-read.
  if (!src || src.includes("\0") || src.includes("..") || path.isAbsolute(src)) {
    throw new ImageError(400, "Invalid src");
  }
  const lexical = path.resolve(SOURCE_DIR, src);
  if (lexical !== SOURCE_DIR && !lexical.startsWith(SOURCE_DIR + path.sep)) {
    throw new ImageError(400, "src escapes the source directory");
  }

  // The lexical check above doesn't see symlinks, but stat/decode FOLLOW them —
  // a link inside the source dir could point anywhere. Contain the real path.
  let srcAbs: string;
  let rootReal: string;
  try {
    [srcAbs, rootReal] = await Promise.all([realpath(lexical), realpath(SOURCE_DIR)]);
  } catch {
    throw new ImageError(404, "Source image not found");
  }
  if (srcAbs !== rootReal && !srcAbs.startsWith(rootReal + path.sep)) {
    throw new ImageError(400, "src escapes the source directory");
  }

  let info;
  try {
    info = await stat(srcAbs);
  } catch {
    throw new ImageError(404, "Source image not found");
  }
  if (!info.isFile()) throw new ImageError(404, "Source image not found");

  const width = normDim(params.width, "w");
  const height = normDim(params.height, "h");
  const fit: ImageFit = params.fit ?? "contain";
  if (fit !== "contain" && fit !== "fill") {
    throw new ImageError(400, "fit must be 'contain' or 'fill'");
  }
  if (fit === "fill" && (width === undefined || height === undefined)) {
    throw new ImageError(400, "fit=fill requires both w and h");
  }
  const quality = normQuality(params.quality);

  const requested: ImageFormat = params.format ?? "webp";
  if (!(requested in CONTENT_TYPE)) throw new ImageError(400, "Unsupported format");
  const format = (await canEncode(requested)) ? requested : "webp"; // transparent fallback

  const keySource = JSON.stringify({
    src,
    width,
    height,
    format,
    quality,
    fit,
    mtime: info.mtimeMs,
    size: info.size,
  });
  const hash = new Bun.CryptoHasher("sha256").update(keySource).digest("hex").slice(0, 32);

  return {
    srcAbs,
    format,
    contentType: CONTENT_TYPE[format],
    cachePath: path.join(CACHE_DIR, `${hash}.${format}`),
    etag: `"${hash}"`,
    ops: { width, height, fit, quality },
  };
}

const inflight = new Map<string, Promise<void>>();

/**
 * Encode the variant to the cache if it isn't there yet. Idempotent and safe to
 * call concurrently — concurrent requests for the same variant share one encode
 * (N identical requests must cost one decode+encode, not N), and writes go to a
 * temp file and `rename` in atomically, so a reader never sees a half-written
 * image. After a write the cache is bounded via best-effort LRU eviction.
 */
export async function ensureCached(plan: ImagePlan): Promise<void> {
  if (await Bun.file(plan.cachePath).exists()) return;

  let job = inflight.get(plan.cachePath);
  if (!job) {
    job = encodeToCache(plan).finally(() => inflight.delete(plan.cachePath));
    inflight.set(plan.cachePath, job);
  }
  return job;
}

async function encodeToCache(plan: ImagePlan): Promise<void> {
  const { width, height, fit, quality } = plan.ops;
  let img = new Bun.Image(Bun.file(plan.srcAbs), { maxPixels: MAX_PIXELS });

  if (width !== undefined || height !== undefined) {
    if (fit === "fill") {
      img = img.resize(width!, height!, { fit: "fill" });
    } else {
      // contain: a missing dimension gets a large bound so the present one binds.
      img = img.resize(width ?? MAX_DIM, height ?? MAX_DIM, {
        fit: "inside",
        withoutEnlargement: true,
      });
    }
  }

  switch (plan.format) {
    case "webp":
      img = img.webp({ quality });
      break;
    case "jpeg":
      img = img.jpeg({ quality });
      break;
    case "png":
      img = img.png();
      break;
    case "avif":
      img = img.avif({ quality });
      break;
  }

  let bytes: Uint8Array;
  try {
    bytes = await img.bytes();
  } catch (error) {
    const code = (error as { code?: string } | undefined)?.code;
    if (code === "ERR_IMAGE_DECODE_FAILED" || code === "ERR_IMAGE_UNKNOWN_FORMAT") {
      throw new ImageError(422, "Could not decode source image");
    }
    if (code === "ERR_IMAGE_TOO_MANY_PIXELS") {
      throw new ImageError(413, "Source image exceeds the pixel limit");
    }
    if (code === "ERR_IMAGE_FORMAT_UNSUPPORTED") {
      throw new ImageError(415, `Format ${plan.format} is not supported on this server`);
    }
    throw error;
  }

  await mkdir(CACHE_DIR, { recursive: true });
  const tmp = path.join(CACHE_DIR, `.${crypto.randomUUID()}.tmp`);
  await Bun.write(tmp, bytes);
  await rename(tmp, plan.cachePath);

  void evictIfOver().catch(() => {});
}

let evicting = false;

/**
 * Keep the cache directory under `MAX_CACHE_BYTES` by deleting oldest-mtime
 * files first. Best-effort and off the request path — losing a cached variant
 * only costs a re-encode on the next request.
 */
async function evictIfOver(): Promise<void> {
  if (evicting) return;
  evicting = true;
  try {
    const files: { p: string; size: number; mtime: number }[] = [];
    let total = 0;
    for (const name of await readdir(CACHE_DIR)) {
      const p = path.join(CACHE_DIR, name);
      try {
        const s = await stat(p);
        if (!s.isFile()) continue;
        files.push({ p, size: s.size, mtime: s.mtimeMs });
        total += s.size;
      } catch {
        // raced with a concurrent delete — skip
      }
    }
    if (total <= MAX_CACHE_BYTES) return;
    files.sort((a, b) => a.mtime - b.mtime);
    for (const f of files) {
      if (total <= MAX_CACHE_BYTES) break;
      try {
        await unlink(f.p);
        total -= f.size;
      } catch {
        // already gone — fine
      }
    }
  } finally {
    evicting = false;
  }
}
