import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ডেঙ্গুওয়াচ বিডি — DengueWatch BD",
    short_name: "ডেঙ্গুওয়াচ",
    description: "এডিস মশার প্রজননস্থল জানান। Report Aedes breeding sites.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f9fafb",
    theme_color: "#065f46",
    lang: "bn",
    categories: ["health", "utilities"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [{ name: "রিপোর্ট / Report", url: "/report" }],
  };
}
