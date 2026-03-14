/**
 * Theme aligned with OpenCode (github.com/anomalyco/opencode) default dark palette.
 * Uses opencode.json dark defs: near-black bg, warm primary, purple accent, gray steps.
 */

export const theme = {
  // Background steps (darkStep1–3)
  bg: "#0a0a0a",
  bgElevated: "#141414",
  bgMuted: "#1e1e1e",
  // Border (darkStep6–8)
  border: "#484848",
  borderSubtle: "#3c3c3c",
  borderFocus: "#606060",
  // Text (darkStep11–12)
  text: "#eeeeee",
  textMuted: "#808080",
  // Primary = blue — logo / key UI
  primary: "#93c5fd",
  // Secondary (blue variant)
  secondary: "#93c5fd",
  // Accent = blue — highlights, links, badges
  accent: "#93c5fd",
  accentMuted: "#6ba3d6",
  // Semantic
  success: "#7fd88f",
  warning: "#f5a742",
  error: "#e06c75",
} as const;

