// apps/mobile/src/constants/Colors.ts

// Brand colors for the app. These are used throughout the UI via the
// `useThemeColor` helper in `components/Themed.tsx`.

const tintColorLight = '#3A3D98'; // Deep Indigo
const tintColorDark = '#FFA552';  // Soft Orange for contrast in dark mode

export default {
  light: {
    text: '#1F2933',            // Charcoal
    background: '#F5F7FA',      // Off-white
    tint: tintColorLight,
    tabIconDefault: '#CBD2D9',  // Slate Gray (neutral)
    tabIconSelected: tintColorLight,
  },
  dark: {
    text: '#F2F2F2',            // Light Gray
    background: '#1C1C1E',      // Rich Charcoal
    tint: tintColorDark,
    tabIconDefault: '#888888',  // Retained neutral for consistency
    tabIconSelected: tintColorDark,
  },
};
