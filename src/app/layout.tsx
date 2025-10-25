// src/app/layout.tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/Navbar";
import { AlertProvider } from "@/context/AlertContext";
import AlertModal from "@/components/AlertModal";
import { AuthProvider } from "@/context/AuthContext"; // Import the new AuthProvider

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
    <html lang="en" className="bg-background text-foreground">
      <body className={inter.className}>
        {/* Wrap everything inside AuthProvider and AlertProvider */}
        <AuthProvider>
          <AlertProvider>
            <Navbar />
            {children}
            <AlertModal />
          </AlertProvider>
        </AuthProvider>
      </body>
    </html>
  );
}