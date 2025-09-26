import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/Navbar"; // <-- 1. IMPORT THE NAVBAR

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Zenith", // We can also update the page title here
  description: "The future of AI trading.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <Navbar /> {/* <-- 2. ADD THE NAVBAR COMPONENT */}
        {children}
      </body>
    </html>
  );
}