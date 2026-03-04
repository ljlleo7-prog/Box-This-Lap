/** @type {import('tailwindcss').Config} */

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    container: {
      center: true,
    },
    extend: {
      colors: {
        f1: {
          red: '#E10600',
          dark: '#15151E',
          light: '#E5E5E5',
          carbon: '#1F1F1F',
          silver: '#A0A0A3',
        }
      },
      fontFamily: {
        rajdhani: ['Rajdhani', 'sans-serif'],
        orbitron: ['Orbitron', 'sans-serif'],
      }
    },
  },
  plugins: [],
};
