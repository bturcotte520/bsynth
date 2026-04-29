import type {Config} from 'tailwindcss';
import plugin from 'tailwindcss/plugin';

export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    colors: {
      'gray-0': '#f5f0eb',
      'gray-1': '#ede6de',
      'gray-2': '#e5ddd3',
      'gray-3': '#d4c8b8',
      'gray-4': '#a89888',
      'gray-5': '#8a7a6a',
      'gray-6': '#6a5a4a',
      'gray-7': '#2a2018',
      green: '#c4652a',
      blue: '#09cae6',
      yellow: '#ffc907',
      red: '#b83a1a',
      white: '#ffffff',
      black: '#000000',
      transparent: 'transparent',
      current: 'currentColor',
      inherit: 'inherit',
    },
  },
  plugins: [
    plugin(({addUtilities}) => {
      addUtilities({
        '.webkit-tap-transparent': {
          '-webkit-tap-highlight-color': 'transparent',
        },
      });
    }),
  ],
} satisfies Config;
