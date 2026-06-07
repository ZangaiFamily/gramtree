import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "gramtree",
  description: "Input an English sentence and inspect its syntax tree.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
