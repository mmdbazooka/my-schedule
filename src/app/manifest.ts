import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "برنامه ریز",
    short_name: "برنامه ریز",
    lang: "fa",
    dir: "rtl",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f7f7fc",
    theme_color: "#6944d4",
    icons: [
      { src: "/planner-192.png", sizes: "192x192", type: "image/png" },
      { src: "/planner-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
