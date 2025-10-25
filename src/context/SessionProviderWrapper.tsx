// src/context/SessionProviderWrapper.tsx
"use client";

import { SessionProvider } from "next-auth/react";
import React from "react";

interface Props {
  children: React.ReactNode;
}

// Separate client component to wrap SessionProvider
export default function SessionProviderWrapper({ children }: Props) {
  return <SessionProvider>{children}</SessionProvider>;
}