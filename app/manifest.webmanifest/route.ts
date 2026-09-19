export function GET() {
  return Response.json({
    name: "FINN — Financial Investment Agent",
    short_name: "FINN",
    description:
      "Triages NSE corporate filings by materiality and researches any ticker from primary sources only.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f7f8fb",
    theme_color: "#f7f8fb",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon-maskable.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
  });
}
