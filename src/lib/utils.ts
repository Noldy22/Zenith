export const getBackendUrl = (): string => {
    // Priority 1: Use the environment variable (for production, staging, or local override)
    // NEXT_PUBLIC_ variables are exposed to the browser by Next.js.
    const envUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
    if (envUrl) {
        return envUrl;
    }

    // Priority 2: Use dynamic hostname (for local network testing)
    // This check ensures 'window' is defined, so it only runs in the browser.
    if (typeof window !== 'undefined') {
        return `http://${window.location.hostname}:5000`;
    }

    // Priority 3: Fallback for server-side rendering or other non-browser environments
    return 'http://127.0.0.1:5000';
};