/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        ukwi: {
          50: "#eef4fb",
          100: "#d3e2f3",
          500: "#1f4e79",
          600: "#194067",
          700: "#13314e",
        },
      },
    },
  },
  plugins: [],
};
