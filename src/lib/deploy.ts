import "server-only";

/**
 * How Home Hub is being run.
 * - "pc" (default): `npm run dev` on the PC the drive is plugged into, reachable only at localhost.
 * - "tailscale": the Docker/Portainer stack, reachable from your own devices over your private
 *   Tailscale network (HTTPS, never the public internet). Set by docker-compose.
 */
export const DEPLOY_MODE: "pc" | "tailscale" = process.env.HOME_HUB_MODE === "tailscale" ? "tailscale" : "pc";
export const onTailnet = DEPLOY_MODE === "tailscale";
