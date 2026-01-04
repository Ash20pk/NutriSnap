// Font configuration for NutriSnap - Fitness/Nutrition themed typography

export const Fonts = {
  // Font families (using system fonts for consistency)
  primary: 'System' as const, // iOS: San Francisco, Android: Roboto
  secondary: 'System' as const,
  
  // Font sizes - Fitness app hierarchy
  sizes: {
    // Headers
    h1: 32, // Main page titles
    h2: 24, // Section headers
    h3: 20, // Card titles
    h4: 18, // Sub-section titles
    
    // Body text
    body: 16, // Regular content
    bodySmall: 15, // Secondary text
    caption: 13, // Labels and hints
    micro: 11, // Small details
    
    // Specialized
    stat: 36, // Large numbers/stats
    statSmall: 24, // Medium stats
  },
  
  // Font weights - Modern fitness app style
  weights: {
    light: '300' as const,
    normal: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
    black: '900' as const,
  },
  
  // Letter spacing for better readability
  spacing: {
    tight: -0.5,
    normal: 0,
    wide: 0.5,
  },
  
  // Line heights for optimal readability
  lineHeight: {
    tight: 1.2,
    normal: 1.4,
    relaxed: 1.6,
  },
};

// Helper functions for consistent styling
export const fontStyles = {
  // Header styles
  h1: {
    fontSize: Fonts.sizes.h1,
    fontWeight: Fonts.weights.bold,
    letterSpacing: Fonts.spacing.tight,
    lineHeight: Fonts.sizes.h1 * Fonts.lineHeight.tight,
  },
  
  h2: {
    fontSize: Fonts.sizes.h2,
    fontWeight: Fonts.weights.semibold,
    letterSpacing: Fonts.spacing.tight,
    lineHeight: Fonts.sizes.h2 * Fonts.lineHeight.tight,
  },
  
  h3: {
    fontSize: Fonts.sizes.h3,
    fontWeight: Fonts.weights.semibold,
    letterSpacing: Fonts.spacing.normal,
    lineHeight: Fonts.sizes.h3 * Fonts.lineHeight.normal,
  },
  
  h4: {
    fontSize: Fonts.sizes.h4,
    fontWeight: Fonts.weights.medium,
    letterSpacing: Fonts.spacing.normal,
    lineHeight: Fonts.sizes.h4 * Fonts.lineHeight.normal,
  },
  
  // Body styles
  body: {
    fontSize: Fonts.sizes.body,
    fontWeight: Fonts.weights.normal,
    letterSpacing: Fonts.spacing.normal,
    lineHeight: Fonts.sizes.body * Fonts.lineHeight.normal,
  },
  
  bodySmall: {
    fontSize: Fonts.sizes.bodySmall,
    fontWeight: Fonts.weights.medium,
    letterSpacing: Fonts.spacing.normal,
    lineHeight: Fonts.sizes.bodySmall * Fonts.lineHeight.normal,
  },
  
  caption: {
    fontSize: Fonts.sizes.caption,
    fontWeight: Fonts.weights.medium,
    letterSpacing: Fonts.spacing.normal,
    lineHeight: Fonts.sizes.caption * Fonts.lineHeight.normal,
  },
  
  micro: {
    fontSize: Fonts.sizes.micro,
    fontWeight: Fonts.weights.normal,
    letterSpacing: Fonts.spacing.normal,
    lineHeight: Fonts.sizes.micro * Fonts.lineHeight.tight,
  },
  
  // Stat styles
  stat: {
    fontSize: Fonts.sizes.stat,
    fontWeight: Fonts.weights.bold,
    letterSpacing: Fonts.spacing.tight,
    lineHeight: Fonts.sizes.stat * Fonts.lineHeight.tight,
  },
  
  statSmall: {
    fontSize: Fonts.sizes.statSmall,
    fontWeight: Fonts.weights.semibold,
    letterSpacing: Fonts.spacing.tight,
    lineHeight: Fonts.sizes.statSmall * Fonts.lineHeight.tight,
  },
  
  // Button styles
  button: {
    fontSize: Fonts.sizes.body,
    fontWeight: Fonts.weights.semibold,
    letterSpacing: Fonts.spacing.wide,
    lineHeight: Fonts.sizes.body * Fonts.lineHeight.normal,
  },
  
  buttonSmall: {
    fontSize: Fonts.sizes.bodySmall,
    fontWeight: Fonts.weights.medium,
    letterSpacing: Fonts.spacing.wide,
    lineHeight: Fonts.sizes.bodySmall * Fonts.lineHeight.normal,
  },
};
