import path from "node:path";
import { mkdir, rename, stat } from "node:fs/promises";

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

const CONTENT_TYPE: Record<ImageFormat, string> = {
  webp: "image/webp",
  png: "image/png",
  jpeg: "image/jpeg",
  avif: "image/avif",
};

/**
 * Can this machine ENCODE the format? webp/png/jpeg ship as static codecs
 * (every platform). avif/heic need the OS encoder (macOS/Windows, system
 * backend) — on Linux/WSL they reject, so we transparently fall back to webp.
 */
function canEncode(format: ImageFormat): boolean {
  if (format === "webp" || format === "png" || format === "jpeg") return true;
  if (Bun.Image.backend === "bun") return false;
  return process.platform === "darwin" || process.platform === "win32";
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
  const srcAbs = path.resolve(SOURCE_DIR, src);
  if (srcAbs !== SOURCE_DIR && !srcAbs.startsWith(SOURCE_DIR + path.sep)) {
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
  const format = canEncode(requested) ? requested : "webp"; // transparent fallback

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

/**
 * Encode the variant to the cache if it isn't there yet. Idempotent and safe to
 * call concurrently — writes go to a temp file and `rename` in atomically, so a
 * reader never sees a half-written image.
 */
export async function ensureCached(plan: ImagePlan): Promise<void> {
  if (await Bun.file(plan.cachePath).exists()) return;

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
}
