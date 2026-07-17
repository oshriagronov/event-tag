---
name: Botanical Precision (Dark Edition)
colors:
  surface: '#131411'
  surface-dim: '#131411'
  surface-bright: '#3a3936'
  surface-container-lowest: '#0e0e0c'
  surface-container-low: '#1c1c19'
  surface-container: '#20201d'
  surface-container-high: '#2a2a27'
  surface-container-highest: '#353532'
  on-surface: '#e5e2dd'
  on-surface-variant: '#c2c8c5'
  inverse-surface: '#e5e2dd'
  inverse-on-surface: '#31302d'
  outline: '#8c9290'
  outline-variant: '#424846'
  surface-tint: '#b4ccc5'
  primary: '#b4ccc5'
  on-primary: '#1f3430'
  primary-container: '#1a2f2b'
  on-primary-container: '#809792'
  inverse-primary: '#4d635e'
  secondary: '#ffb77b'
  on-secondary: '#4d2700'
  secondary-container: '#7a4100'
  on-secondary-container: '#ffb270'
  tertiary: '#b2ccc4'
  on-tertiary: '#1d352f'
  tertiary-container: '#172f29'
  on-tertiary-container: '#7e9890'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#d0e8e1'
  primary-fixed-dim: '#b4ccc5'
  on-primary-fixed: '#091f1b'
  on-primary-fixed-variant: '#364b46'
  secondary-fixed: '#ffdcc2'
  secondary-fixed-dim: '#ffb77b'
  on-secondary-fixed: '#2e1500'
  on-secondary-fixed-variant: '#6d3a00'
  tertiary-fixed: '#cde8df'
  tertiary-fixed-dim: '#b2ccc4'
  on-tertiary-fixed: '#07201a'
  on-tertiary-fixed-variant: '#334b45'
  background: '#131411'
  on-background: '#e5e2dd'
  surface-variant: '#353532'
typography:
  display:
    fontFamily: EB Garamond
    fontSize: 48px
    fontWeight: '500'
    lineHeight: '1.1'
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: EB Garamond
    fontSize: 32px
    fontWeight: '500'
    lineHeight: '1.2'
  headline-lg-mobile:
    fontFamily: EB Garamond
    fontSize: 28px
    fontWeight: '500'
    lineHeight: '1.2'
  headline-md:
    fontFamily: EB Garamond
    fontSize: 24px
    fontWeight: '400'
    lineHeight: '1.3'
  body-lg:
    fontFamily: Hanken Grotesk
    fontSize: 18px
    fontWeight: '400'
    lineHeight: '1.6'
  body-md:
    fontFamily: Hanken Grotesk
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.6'
  label-md:
    fontFamily: Hanken Grotesk
    fontSize: 14px
    fontWeight: '600'
    lineHeight: '1.4'
    letterSpacing: 0.05em
  caption:
    fontFamily: Hanken Grotesk
    fontSize: 12px
    fontWeight: '400'
    lineHeight: '1.4'
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  base: 8px
  xs: 4px
  sm: 12px
  md: 24px
  lg: 48px
  xl: 80px
  container-max: 1200px
  gutter: 24px
---

## Brand & Style

The design system is an exercise in "Natural Luxury" and "Digital Craft." It targets an audience that values slow living, artisanal quality, and scientific precision in the botanical and wellness space. The UI should evoke a sense of calm, nocturnal serenity, and premium exclusivity.

The design style is a sophisticated blend of **Minimalism** and **Tactile Glassmorphism**. By using a deep, organic base and sharp, classical typography, the system achieves an editorial feel that mimics high-end apothecary packaging. The interface moves away from the clinical feel of traditional SaaS, opting instead for a warm, immersive environment that feels quiet and intentional.

## Colors

The palette is anchored by **Deep Forest Green** (#1a2f2b), which serves as the primary canvas. This choice reduces eye strain and creates a sense of depth. **Copper** (#b87333) is reserved strictly for high-impact interactions, call-to-actions, and essential highlights, acting as a "living" metallic element against the matte background.

Typography and iconography utilize **Warm Cream** (#f5f2ed) for primary content to maintain soft contrast, while **Sage Muted** (#a3b5b0) is used for secondary information and metadata to establish a clear visual hierarchy without the harshness of pure white or grey.

## Typography

This design system employs a classic serif/sans-serif pairing to balance tradition with modernity. 

**EB Garamond** is used for all headlines and display text. It should be typeset with tight tracking in display sizes to emphasize its elegant, historical letterforms. 

**Hanken Grotesk** provides a clean, highly legible counterpoint for body copy and UI labels. Its contemporary geometry ensures that technical information remains accessible. Labels should utilize increased letter-spacing and uppercase styling to evoke the precision of scientific labeling.

## Layout & Spacing

The layout philosophy follows a **Fixed Grid** approach for desktop to maintain editorial control, transitioning to a **Fluid Grid** for mobile devices. 

A 12-column grid is used for desktop (1200px max-width) with generous 24px gutters. The "breathability" of the design is paramount; use the `lg` (48px) and `xl` (80px) spacing tokens to create distinct thematic sections. On mobile, margins should be set to 20px, and vertical rhythm should be tightened slightly to account for smaller viewport heights.

## Elevation & Depth

Depth in this design system is achieved through **Tonal Layering** rather than heavy shadows. 

1. **Base:** The Deep Forest Green background.
2. **Surface:** A slightly lighter green (#243d38) used for cards and containers to suggest they are "floating" just above the base.
3. **Overlays:** Subtle 1px inner borders in a low-opacity Sage color to define edges without adding visual bulk.

Shadows, when necessary, should be "Ambient Shadows"—extremely diffused, using a dark green tint (#0d1a18) instead of black, to maintain the organic warmth of the palette.

## Shapes

The shape language is **Soft** and restrained. A 0.25rem (4px) corner radius is the standard for most components, providing just enough softness to feel approachable while maintaining the structural integrity of a precision instrument. Larger containers or imagery may use `rounded-lg` (8px) to feel more like framed art. High-action elements like buttons remain rectangular or minimally rounded to preserve a professional, "apothecary label" aesthetic.

## Components

### Buttons
- **Primary:** Solid Copper (#b87333) background with Cream text. Sharp or slightly rounded corners.
- **Secondary:** Transparent background with a 1px Copper border. 
- **Ghost:** Warm Cream text with no background, used for low-priority navigation.

### Input Fields
Inputs should feature a subtle "Surface" background (#243d38) and a bottom-only border in Sage Muted. Upon focus, the bottom border transitions to Copper.

### Cards
Cards use the "Surface" elevation color with a very fine 1px stroke (#2e4a44). Avoid heavy dropshadows; use internal padding (md: 24px) to let content breathe.

### Chips & Tags
Small, low-contrast pills using the Sage color at 10% opacity with Sage text. These should feel like small botanical markers.

### Lists
Lists should be separated by thin, low-opacity horizontal rules (#2e4a44). Use EB Garamond for list headers to maintain the editorial feel.