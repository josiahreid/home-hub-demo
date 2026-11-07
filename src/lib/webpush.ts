import { createECDH, createPrivateKey, createPublicKey, generateKeyPairSync, hkdfSync, randomBytes, sign, createCipheriv, type JsonWebKey } from "node:crypto";

/**
 * Web Push without a library: VAPID (RFC 8292) to say who's sending, and aes128gcm (RFC 8291) to encrypt the
 * message so only the phone it's for can read it. The push service (Apple, Google, Mozilla) just passes it on.
 */

const b64u = (b: Buffer) => b.toString("base64url");
const fromB64u = (s: string) => Buffer.from(s, "base64url");

export type VapidKeys = { publicKey: string; privateJwk: JsonWebKey };

/** A new key pair identifying this Home Hub to the push services. */
export function generateVapidKeys(): VapidKeys {
  const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const jwk = publicKey.export({ format: "jwk" });
  const raw = Buffer.concat([Buffer.from([4]), fromB64u(jwk.x!), fromB64u(jwk.y!)]);
  return { publicKey: b64u(raw), privateJwk: privateKey.export({ format: "jwk" }) };
}

/** The Authorization header: a short-lived signed token for the push service the endpoint belongs to. */
export function vapidHeader(endpoint: string, keys: VapidKeys, subject: string) {
  const header = b64u(Buffer.from(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = b64u(Buffer.from(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject })));
  const key = createPrivateKey({ key: keys.privateJwk, format: "jwk" });
  const sig = sign("sha256", Buffer.from(`${header}.${claims}`), { key, dsaEncoding: "ieee-p1363" });
  return `vapid t=${header}.${claims}.${b64u(sig)}, k=${keys.publicKey}`;
}

/**
 * Encrypts a message for one subscription (RFC 8291, "aes128gcm"). `asPrivate` and `salt` are only passed in tests,
 * to reproduce the RFC's worked example; normally both are fresh and random for every message.
 */
export function encryptPayload(plain: Buffer, p256dh: string, auth: string, test?: { asPrivate: string; salt: string }) {
  const uaPublic = fromB64u(p256dh);
  const authSecret = fromB64u(auth);
  const ecdh = createECDH("prime256v1");
  if (test) ecdh.setPrivateKey(fromB64u(test.asPrivate));
  else ecdh.generateKeys();
  const asPublic = ecdh.getPublicKey();
  const shared = ecdh.computeSecret(uaPublic);
  const salt = test ? fromB64u(test.salt) : randomBytes(16);

  const keyInfo = Buffer.concat([Buffer.from("WebPush: info\0"), uaPublic, asPublic]);
  const ikm = Buffer.from(hkdfSync("sha256", shared, authSecret, keyInfo, 32));
  const cek = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: aes128gcm\0"), 16));
  const nonce = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: nonce\0"), 12));

  const cipher = createCipheriv("aes-128-gcm", cek, nonce);
  // one record: the message, then 0x02 to mark it as the last
  const body = Buffer.concat([cipher.update(Buffer.concat([plain, Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);
  const rs = Buffer.alloc(4);
  rs.writeUInt32BE(4096);
  return Buffer.concat([salt, rs, Buffer.from([asPublic.length]), asPublic, body]);
}

export type PushTarget = { endpoint: string; p256dh: string; auth: string };

/** Sends one message. Returns the push service's status: 201 = delivered to it, 404/410 = that subscription is gone. */
export async function sendPush(target: PushTarget, payload: object, keys: VapidKeys, subject: string, ttlSeconds = 24 * 3600) {
  const body = encryptPayload(Buffer.from(JSON.stringify(payload)), target.p256dh, target.auth);
  const res = await fetch(target.endpoint, {
    method: "POST",
    headers: {
      Authorization: vapidHeader(target.endpoint, keys, subject),
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: String(ttlSeconds),
      Urgency: "normal",
    },
    body,
    signal: AbortSignal.timeout(15_000),
  });
  return { status: res.status, text: res.ok ? "" : (await res.text().catch(() => "")).slice(0, 200) };
}

/** Checks a public key is a real P-256 point (guards against a bad subscription breaking a send run). */
export function validP256(p256dh: string) {
  try {
    const raw = fromB64u(p256dh);
    if (raw.length !== 65 || raw[0] !== 4) return false;
    createPublicKey({ key: { kty: "EC", crv: "P-256", x: b64u(raw.subarray(1, 33)), y: b64u(raw.subarray(33)) }, format: "jwk" });
    return true;
  } catch {
    return false;
  }
}
