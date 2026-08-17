import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Пожелания",
  description: "Отправьте своё пожелание",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}