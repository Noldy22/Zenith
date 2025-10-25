import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const getBackendUrl = (): string => {
    // --- TEMPORARY FIX ---
    // Replace '192.168.1.5' with your PC's actual local IP address
    const explicitIp = 'http://192.168.1.5:5000';
    console.log(`[getBackendUrl] Explicit IP set to: ${explicitIp}`); // Log the hardcoded IP

    if (typeof window !== 'undefined') {
        console.log(`[getBackendUrl] Current window hostname: ${window.location.hostname}`); // Log hostname
        // Use explicit IP if accessed from a non-localhost IP (like your phone)
        if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
             console.log("[getBackendUrl] Using explicit IP for non-localhost access.");
            return explicitIp;
        }
    }
    // --- END TEMPORARY FIX ---

    // Original logic (keep for localhost development and potential environment variable override)
    const envUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
    if (envUrl) {
         console.log(`[getBackendUrl] Using environment variable URL: ${envUrl}`);
        return envUrl;
    }
    if (typeof window !== 'undefined') {
        // Use localhost if accessing via localhost
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
           console.log("[getBackendUrl] Using localhost URL.");
           return 'http://127.0.0.1:5000';
        }
        // Fallback to hostname (might not be reliable, explicit IP takes precedence)
        // console.log(`[getBackendUrl] Attempting to use dynamic hostname URL: http://${window.location.hostname}:5000`);
        // return `http://${window.location.hostname}:5000`;
    }
    // Fallback for server-side rendering or other non-browser environments
    console.log("[getBackendUrl] Using fallback localhost URL for SSR or unknown environment.");
    return 'http://127.0.0.1:5000';
};