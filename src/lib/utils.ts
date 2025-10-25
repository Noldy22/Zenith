// src/lib/utils.ts
import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const getBackendUrl = (): string => {
    // --- START MODIFICATION ---
    // Use 127.0.0.1 for local development to ensure cookie consistency
    const localDevUrl = 'http://127.0.0.1:5000';
    const envUrl = process.env.NEXT_PUBLIC_BACKEND_URL; // Check for production override

    if (envUrl) {
        console.log(`[getBackendUrl] Using environment variable URL: ${envUrl}`);
        return envUrl;
    }

    if (typeof window !== 'undefined') {
        const hostname = window.location.hostname;
        console.log(`[getBackendUrl] Current window hostname: ${hostname}`);
        // If accessed via localhost or 127.0.0.1, always use the consistent local URL
        if (hostname === 'localhost' || hostname === '127.0.0.1') {
           console.log("[getBackendUrl] Using local development URL:", localDevUrl);
           return localDevUrl;
        }
        // If accessed via local network IP (e.g., 192.168.1.5), construct URL using that IP
        // Ensure CORS is configured correctly on the backend for this
        console.log(`[getBackendUrl] Using detected hostname URL: http://${hostname}:5000`);
        return `http://${hostname}:5000`;
    }

    // Fallback for server-side rendering or other non-browser environments
    console.log("[getBackendUrl] Using fallback local development URL for SSR/unknown environment:", localDevUrl);
    return localDevUrl;
    // --- END MODIFICATION ---
};