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
      <head>
        <script
          async
          src="https://www.googletagmanager.com/gtag/js?id=G-XP7EET4WHR"
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());

              gtag('config', 'G-XP7EET4WHR');
            `,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
