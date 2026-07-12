import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "北极星选品｜美国站室内家具",
  description: "面向亚马逊美国站室内家具开发的本地选品工作台。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
