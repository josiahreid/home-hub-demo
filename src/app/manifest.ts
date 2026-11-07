import type { MetadataRoute } from "next";

// Lets phones and iPads add Home Hub to the Home Screen as an app that opens full screen, not in the browser –
// iPhones also only allow notifications for web apps added this way. The Apple icon is app/apple-icon.png.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Home Hub",
    short_name: "Home Hub",
    description: "Budget, meals, calendar, car, house and projects in one place",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#151514",
    theme_color: "#2f6f5e",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
  };
}
