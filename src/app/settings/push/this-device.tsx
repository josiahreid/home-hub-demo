"use client";

import { useEffect, useState, useTransition } from "react";
import { BellOff, BellRing, Send, Smartphone, Monitor } from "lucide-react";
import { btn } from "@/components/ui";
import { forgetEndpoint, subscribeDevice, testDevice, type PushState } from "./actions";

type Status = "checking" | "unsupported" | "ios-needs-home-screen" | "insecure" | "blocked" | "off" | "on";

const b64ToBytes = (s: string) => {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const raw = atob((s + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

/** Phones and tablets – these get notifications. Computers only if "phones only" is switched off. */
function isMobile() {
  const nav = navigator as Navigator & { userAgentData?: { mobile?: boolean } };
  if (nav.userAgentData?.mobile) return true;
  const ua = navigator.userAgent;
  // iPads say they're Macs, but have a touch screen
  return /iPhone|iPad|iPod|Android|Mobile/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

function deviceLabel() {
  const ua = navigator.userAgent;
  const device = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) ? "iPad"
    : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows PC" : /Macintosh/.test(ua) ? "Mac" : "Device";
  const browser = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /CriOS|Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "browser";
  return `${device} · ${browser}`;
}

/** Turning notifications on and off for the device this page is open on. */
export function ThisDevice({ me, publicKey, phonesOnly }: { me: string; publicKey: string; phonesOnly: boolean }) {
  const [status, setStatus] = useState<Status>("checking");
  const [mobile, setMobile] = useState(true);
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [deviceId, setDeviceId] = useState<number | null>(null);
  const [result, setResult] = useState<PushState>({});
  const [busy, start] = useTransition();

  useEffect(() => {
    (async () => {
      setMobile(isMobile());
      const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
      const standalone = matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone;
      if (!window.isSecureContext) return setStatus("insecure");
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        return setStatus(ios && !standalone ? "ios-needs-home-screen" : "unsupported");
      }
      if (Notification.permission === "denied") return setStatus("blocked");
      const reg = await navigator.serviceWorker.register("/sw.js");
      const sub = await reg.pushManager.getSubscription();
      setEndpoint(sub?.endpoint ?? null);
      setStatus(sub ? "on" : "off");
    })().catch(() => setStatus("unsupported"));
  }, []);

  function turnOn() {
    setResult({});
    start(async () => {
      try {
        const perm = await Notification.requestPermission();
        if (perm !== "granted") {
          setStatus(perm === "denied" ? "blocked" : "off");
          return;
        }
        const reg = await navigator.serviceWorker.register("/sw.js");
        await navigator.serviceWorker.ready;
        const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(publicKey) }));
        const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
        const r = await subscribeDevice(json, isMobile(), deviceLabel());
        setResult(r);
        if (r.id) setDeviceId(r.id);
        setEndpoint(sub.endpoint);
        setStatus("on");
      } catch (e) {
        setResult({ error: `This browser couldn't turn notifications on (${(e as Error).message}).` });
      }
    });
  }

  function turnOff() {
    start(async () => {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await forgetEndpoint(sub.endpoint);
        await sub.unsubscribe();
      }
      setEndpoint(null);
      setStatus("off");
      setResult({ message: "Notifications are off on this device." });
    });
  }

  function test() {
    start(async () => {
      // the device's id comes back when it's turned on; otherwise saving again finds it
      let id = deviceId;
      if (!id) {
        const reg = await navigator.serviceWorker.getRegistration("/sw.js");
        const sub = await reg?.pushManager.getSubscription();
        if (sub) id = (await subscribeDevice(sub.toJSON() as never, isMobile(), deviceLabel())).id ?? null;
      }
      setResult(id ? await testDevice(id) : { error: "Turn notifications on first." });
    });
  }

  const Icon = mobile ? Smartphone : Monitor;
  return (
    <div className="space-y-3 text-sm">
      {status !== "checking" && <p className="flex items-center gap-2">
        <Icon size={18} className="text-accent" />
        <span>This is a <strong>{mobile ? "phone / tablet" : "computer"}</strong>, set up for <strong>{me}</strong>.</span>
      </p>}

      {status === "checking" && <p className="text-muted">Checking…</p>}
      {status === "insecure" && (
        <p className="rounded-lg bg-warn-soft p-2 text-warn">
          Notifications need a secure (https) address. On your phone, open Home Hub at its <strong>https://…ts.net</strong> address – turn on HTTPS Certificates in Tailscale first.
        </p>
      )}
      {status === "ios-needs-home-screen" && (
        <ol className="list-decimal space-y-1 rounded-lg bg-surface-2 p-3 pl-7">
          <li>On iPhone, notifications only work for apps on the Home Screen: tap <strong>Share</strong> → <strong>Add to Home Screen</strong>.</li>
          <li>Open Home Hub from the new icon, come back to <strong>Settings → Push notifications</strong>, and turn them on here.</li>
        </ol>
      )}
      {status === "unsupported" && <p className="text-muted">This browser can&apos;t do push notifications.</p>}
      {status === "blocked" && (
        <p className="rounded-lg bg-warn-soft p-2 text-warn">Notifications are blocked for Home Hub in this browser&apos;s settings. Allow them there, then reload.</p>
      )}

      {!mobile && phonesOnly && (status === "off" || status === "on") && (
        <p className="text-xs text-muted">Notifications only go to phones, so this computer won&apos;t get the scheduled ones. You can still turn it on to try a test.</p>
      )}

      {status === "off" && (
        <button onClick={turnOn} disabled={busy} className={btn.primary}><BellRing size={16} /> {busy ? "Asking…" : `Turn on notifications for ${me}`}</button>
      )}
      {status === "on" && (
        <div className="flex flex-wrap gap-2">
          <button onClick={test} disabled={busy} className={btn.primary}><Send size={14} /> {busy ? "Sending…" : "Send a test"}</button>
          <button onClick={turnOff} disabled={busy} className={btn.secondary}><BellOff size={14} /> Turn off on this device</button>
        </div>
      )}
      {endpoint && status === "on" && <p className="text-xs text-muted">On ✓ – notifications for {me} come to this {mobile ? "phone" : "computer"}.</p>}
      {result.error && <p className="rounded-lg bg-danger-soft p-2 text-danger">{result.error}</p>}
      {result.message && <p className="rounded-lg bg-accent-soft p-2 text-accent">{result.message}</p>}
    </div>
  );
}
