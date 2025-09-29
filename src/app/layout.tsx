import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/Navbar";
import { AlertProvider } from "@/context/AlertContext";
import AlertModal from "@/components/AlertModal";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Zenith",
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
        <AlertProvider>
          <Navbar />
          {children}
          <AlertModal />
        </AlertProvider>
      </body>
    </html>
  );
}