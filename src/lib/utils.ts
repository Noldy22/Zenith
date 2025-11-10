// src/lib/utils.ts
import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const getBackendUrl = (): string => {
    // --- START MODIFICATION ---
    // IMPORTANT: Use the SAME hostname as the frontend to ensure cookies work correctly
    // localhost and 127.0.0.1 are treated as different domains by browsers
    const envUrl = process.env.NEXT_PUBLIC_BACKEND_URL; // Check for production override

    if (envUrl) {
        console.log(`[getBackendUrl] Using environment variable URL: ${envUrl}`);
        return envUrl;
    }

    if (typeof window !== 'undefined') {
        const hostname = window.location.hostname;
        console.log(`[getBackendUrl] Current window hostname: ${hostname}`);
        // Use the SAME hostname as the frontend (critical for cookies!)
        const backendUrl = `http://${hostname}:5000`;
        console.log("[getBackendUrl] Using backend URL:", backendUrl);
        return backendUrl;
    }

    // Fallback for server-side rendering or other non-browser environments
    // Default to localhost for SSR
    const fallbackUrl = 'http://localhost:5000';
    console.log("[getBackendUrl] Using fallback URL for SSR/unknown environment:", fallbackUrl);
    return fallbackUrl;
    // --- END MODIFICATION ---
};