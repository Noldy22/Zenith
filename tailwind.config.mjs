/** @type {import('tailwindcss').Config} */
const config = {
  darkMode: ["class"],
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    // We are using CSS variables defined in globals.css for the theme,
    // so we don't need to extend it here.
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;