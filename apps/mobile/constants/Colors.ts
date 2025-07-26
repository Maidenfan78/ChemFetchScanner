// Brand colors for the app. These are used throughout the UI via the
// `useThemeColor` helper in `components/Themed.tsx`.
const tintColorLight = '#3498db';
const tintColorDark = '#1abc9c';

export default {
  light: {
    text: '#222',
    background: '#fefefe',
    tint: tintColorLight,
    tabIconDefault: '#888',
    tabIconSelected: tintColorLight,
  },
  dark: {
    text: '#f0f0f0',
    background: '#000',
    tint: tintColorDark,
    tabIconDefault: '#888',
    tabIconSelected: tintColorDark,
  },
};
