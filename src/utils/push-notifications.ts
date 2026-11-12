import { readFileSync } from "fs";
import { createPrivateKey, sign } from "crypto";
import * as http2 from "http2";
import type { ClientHttp2Stream, IncomingHttpHeaders } from "http2";
import { logger } from "./logger";

const log = logger.child({ module: "push", layer: "service" });

const APNS_DEVELOPMENT = "https://api.development.push.apple.com";
const APNS_PRODUCTION = "https://api.push.apple.com";

interface APNsConfig {
  keyId: string;
  teamId: string;
  bundleId: string;
  privateKey: string;
  isProduction: boolean;
}

/** Result of attempting to send a push notification. */
export type PushResult = { sent: boolean; error?: string };

interface APNsResponse {
  statusCode: number;
  apnsId: string;
  body: string;
}

let config: APNsConfig | null = null;
let jwtCache: { token: string; expiresAt: number } | null = null;

function loadConfig(): APNsConfig | null {
  const keyId = process.env.APNS_KEY_ID;
  const teamId = process.env.APNS_TEAM_ID;
  const bundleId = process.env.APNS_BUNDLE_ID;
  const keyPath = process.env.APNS_AUTH_KEY_PATH;
  const privateKeyEnv = process.env.APNS_AUTH_KEY;

  if (!keyId || !teamId || !bundleId) {
    return null;
  }

  let privateKey: string | undefined;

  // Prefer the raw key content from the env var (works on Railway without a file).
  if (privateKeyEnv) {
    privateKey = privateKeyEnv;
  } else if (keyPath) {
    try {
      privateKey = readFileSync(keyPath, "utf8");
    } catch (err) {
      log.error({ err, keyPath }, "Failed to read APNs private key");
      return null;
    }
  } else {
    return null;
  }

  return {
    keyId,
    teamId,
    bundleId,
    privateKey,
    isProduction: process.env.NODE_ENV === "production",
  };
}

function getConfig(): APNsConfig | null {
  if (!config) {
    config = loadConfig();
  }
  return config;
}

function base64Url(obj: object): string {
  return Buffer.from(JSON.stringify(obj))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function generateJWT(cfg: APNsConfig): string {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "ES256", kid: cfg.keyId, typ: "JWT" };
  const payload = { iss: cfg.teamId, iat: now };

  const signingInput = `${base64Url(header)}.${base64Url(payload)}`;
  const key = createPrivateKey(cfg.privateKey);
  // ES256: ECDSA using P-256 and SHA-256. Passing `null` as algorithm lets Node use
  // the key's default algorithm (SHA-256 for P-256 keys).
  const signature = sign(null, Buffer.from(signingInput), key);

  const signatureB64 = signature
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  return `${signingInput}.${signatureB64}`;
}

async function getJWT(cfg: APNsConfig): Promise<string> {
  const now = Date.now();
  if (jwtCache && now < jwtCache.expiresAt) {
    return jwtCache.token;
  }

  const token = generateJWT(cfg);
  // JWTs are valid for 1 hour; cache for 50 minutes to leave a safety margin.
  jwtCache = { token, expiresAt: now + 50 * 60 * 1000 };
  return token;
}

function buildAPNsPayload(
  title: string,
  body: string,
  placeID?: string,
  sound?: string,
): string {
  const aps: Record<string, unknown> = {
    alert: { title, body },
  };
  if (sound) aps.sound = sound;
  aps["mutable-content"] = 1;

  const payload: Record<string, unknown> = { aps };
  if (placeID) payload.placeID = placeID;

  return JSON.stringify(payload);
}

async function sendToAPNs(
  cfg: APNsConfig,
  deviceToken: string,
  payload: string,
): Promise<APNsResponse> {
  const token = await getJWT(cfg);
  const baseURL = cfg.isProduction ? APNS_PRODUCTION : APNS_DEVELOPMENT;

  return new Promise<APNsResponse>((resolve, reject) => {
    const client = http2.connect(baseURL);

    const req: ClientHttp2Stream = client.request({
      ":method": "POST",
      ":path": `/3/device/${deviceToken}`,
      authorization: `bearer ${token}`,
      "apns-topic": cfg.bundleId,
      "apns-push-type": "alert",
      "apns-priority": "10",
      "content-type": "application/json",
    });

    let data = "";
    let statusCode = 0;
    let apnsId = "";

    req.on("response", (headers: IncomingHttpHeaders) => {
      statusCode = Number(headers[":status"]) || 0;
      apnsId = (headers["apns-id"] as string) || "";
    });

    req.on("data", (chunk: Buffer) => {
      data += chunk.toString();
    });

    req.on("end", () => {
      client.close();
      resolve({
        statusCode,
        apnsId,
        body: data,
      });
    });

    req.on("error", (err: Error) => {
      client.close();
      reject(err);
    });

    req.write(payload);
    req.end();
  });
}

/**
 * Sends a push notification via APNs using HTTP/2 + JWT authentication.
 *
 * Requires these environment variables:
 *   APNS_AUTH_KEY      the raw contents of the .p8 file (recommended for Railway)
 *   APNS_AUTH_KEY_PATH OR path to the .p8 key file from Apple Developer (alternative)
 *   APNS_KEY_ID        the 10-character key ID from Apple Developer
 *   APNS_TEAM_ID       your 10-character Apple Team ID
 *   APNS_BUNDLE_ID     the app's bundle identifier
 *
 * In development (NODE_ENV != production), routes to the Apple Sandbox gateway.
 * In production, set NODE_ENV=production for the production gateway.
 */
export class PushService {
    private readonly configured: boolean;

    constructor() {
        this.configured = Boolean(getConfig());
    }

    async sendToDevice(
        deviceToken: string,
        payload: { title: string; body: string; placeID?: string; sound?: string },
    ): Promise<PushResult> {
        const cfg = getConfig();
        if (!cfg) {
            log.info(
                { deviceToken: deviceToken.slice(0, 8), ...payload },
                "APNs not configured: push not sent",
            );
            return { sent: false, error: "APNs not configured" };
        }

        const body = buildAPNsPayload(
            payload.title,
            payload.body,
            payload.placeID,
            payload.sound,
        );

        try {
            const res = await sendToAPNs(cfg, deviceToken, body);

            // 200 = delivered to APNs (Apple will deliver to the device)
            if (res.statusCode === 200) {
                log.info(
                    { deviceToken: deviceToken.slice(0, 8), apnsId: res.apnsId },
                    "APNs push delivered",
                );
                return { sent: true };
            }

            // 410 = device token is no longer valid; the app should unregister it.
            if (res.statusCode === 410) {
                log.warn(
                    { deviceToken: deviceToken.slice(0, 8) },
                    "APNs device token no longer valid (410)",
                );
                return { sent: false, error: "device_token_invalid" };
            }

            log.warn(
                {
                    deviceToken: deviceToken.slice(0, 8),
                    statusCode: res.statusCode,
                    apnsId: res.apnsId,
                    body: res.body,
                },
                "APNs push rejected",
            );
            return { sent: false, error: `APNs status ${res.statusCode}` };
        } catch (err) {
            log.error({ err, deviceToken: deviceToken.slice(0, 8) }, "Failed to send APNs push");
            return { sent: false, error: String(err) };
        }
    }
}

export const pushService = new PushService();
