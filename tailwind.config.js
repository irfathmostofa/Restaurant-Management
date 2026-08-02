/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#fef7ee',
          100: '#fdeed7',
          200: '#fad9ae',
          300: '#f7be7b',
          400: '#f39b46',
          500: '#f0821f',
          600: '#e16914',
          700: '#ba4f12',
          800: '#944016',
          900: '#783515',
          950: '#401a09'
        }
      }
    }
  },
  plugins: []
}
