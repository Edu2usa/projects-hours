import type { Metadata, Viewport } from "next";
import "./styles.css";

export const metadata: Metadata = {
  title: "Special Project Hours",
  description: "Preferred Maintenance special-project hour capture",
  manifest: "/manifest.webmanifest"
};

export const viewport: Viewport = {
  themeColor: "#1f4f46",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
