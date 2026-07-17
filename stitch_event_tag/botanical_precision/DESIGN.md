---
name: Botanical Precision
colors:
  surface: '#fbf9f4'
  surface-dim: '#dbdad5'
  surface-bright: '#fbf9f4'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f5f3ee'
  surface-container: '#f0eee9'
  surface-container-high: '#eae8e3'
  surface-container-highest: '#e4e2dd'
  on-surface: '#1b1c19'
  on-surface-variant: '#424846'
  inverse-surface: '#30312e'
  inverse-on-surface: '#f2f1ec'
  outline: '#727876'
  outline-variant: '#c2c8c5'
  surface-tint: '#4d635e'
  primary: '#051a17'
  on-primary: '#ffffff'
  primary-container: '#1a2f2b'
  on-primary-container: '#809792'
  inverse-primary: '#b4ccc5'
  secondary: '#4c6358'
  on-secondary: '#ffffff'
  secondary-container: '#cee9da'
  on-secondary-container: '#52695e'
  tertiary: '#201500'
  on-tertiary: '#ffffff'
  tertiary-container: '#3a2800'
  on-tertiary-container: '#b08d48'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#d0e8e1'
  primary-fixed-dim: '#b4ccc5'
  on-primary-fixed: '#091f1b'
  on-primary-fixed-variant: '#364b46'
  secondary-fixed: '#cee9da'
  secondary-fixed-dim: '#b3ccbf'
  on-secondary-fixed: '#092017'
  on-secondary-fixed-variant: '#354c41'
  tertiary-fixed: '#ffdea5'
  tertiary-fixed-dim: '#e9c176'
  on-tertiary-fixed: '#261900'
  on-tertiary-fixed-variant: '#5d4201'
  background: '#fbf9f4'
  on-background: '#1b1c19'
  surface-variant: '#e4e2dd'
  deep-forest: '#1A2F2B'
  sage-muted: '#8FA89B'
  warm-cream: '#F9F7F2'
  muted-gold: '#C5A059'
  copper-accent: '#B87333'
  surface-border: '#E5E1D8'
typography:
  display-lg:
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
  title-md:
    fontFamily: Hanken Grotesk
    fontSize: 20px
    fontWeight: '600'
    lineHeight: '1.4'
    letterSpacing: 0.01em
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
  label-sm:
    fontFamily: Hanken Grotesk
    fontSize: 12px
    fontWeight: '700'
    lineHeight: '1'
    letterSpacing: 0.08em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 8px
  container-max: 1280px
  gutter: 24px
  margin-mobile: 16px
  margin-desktop: 40px
---

## Brand & Style

The design system is centered on a "High-End Botanical" aesthetic that bridges the gap between traditional luxury photography and cutting-edge browser-based AI. It prioritizes a sense of calm, privacy, and curated elegance to reassure users that their biometric data is handled with artisan-level care.

The visual style is a blend of **Minimalism** and **Modern Corporate**, utilizing expansive whitespace (breathability), thin line-art inspired by the botanical logo, and a sophisticated, low-contrast color approach. The interface should feel more like a gallery or a boutique invitation than a technical dashboard.

Key brand attributes:
- **Trustworthy & Private:** Soft colors and clear typography reduce technical anxiety.
- **Premium:** Intentional use of "gold" accents and serif headings.
- **Organic Tech:** Geometric precision softened by botanical shapes and rounded UI containers.

## Colors

The palette is anchored by **Deep Forest Green** for primary actions and text, establishing an immediate sense of grounded authority. The background uses a **Warm Cream** instead of pure white to evoke the texture of premium stationery or archival paper.

- **Primary (#1A2F2B):** Used for heavy headings, primary buttons, and the botanical logo stroke.
- **Secondary (#8FA89B):** A muted sage used for secondary UI elements, iconography, and soft dividers.
- **Tertiary (#C5A059):** A muted gold reserved for highlights, specialized labels (like "AI Verified"), or premium call-to-actions.
- **Neutral (#F9F7F2):** The base canvas. High-end photography thrives on this warm, off-white background.

Color mode is **Light** by default to emphasize the botanical cleanliness, though a "Midnight" dark mode variant should use `#0D1614` as the base.

## Typography

This design system employs a classic "Serif for Headlines, Sans for Utility" pairing.

**EB Garamond** provides the literary, editorial feel required for a high-end photography service. It should be used for large titles, event names, and welcoming messages. Its natural elegance communicates the "sophisticated" requirement.

**Hanken Grotesk** serves as the functional workhorse. It is a sharp, contemporary sans-serif that remains legible even at small sizes in dense photo-scanning dashboards. 

Use `label-sm` with increased letter spacing and uppercase styling for "Technical Status" indicators (e.g., "SCANNING IN PROGRESS") to create a distinct visual separation between content and metadata.

## Layout & Spacing

The layout philosophy follows a **Fixed Grid** on desktop to maintain the "editorial" feel, centered within the viewport. 

- **Grid:** 12-column system with 24px gutters.
- **Rhythm:** An 8px base unit drives all padding and margins. 
- **Spaciousness:** Large vertical margins (64px+) between sections are encouraged to prevent the interface from feeling "crowded" or "app-heavy."

On mobile, the layout transitions to a single-column fluid flow with 16px side margins. Photos in galleries should use a masonry-style or justified grid to honor different aspect ratios, reflecting a professional gallery rather than a rigid social media square grid.

## Elevation & Depth

To maintain a minimalist and tactile aesthetic, this design system avoids heavy drop shadows. Instead, it uses:

- **Tonal Layers:** Using slight variations of the Neutral palette to define cards. For example, a card might be `#FFFFFF` (Pure White) sitting on the `#F9F7F2` (Warm Cream) background.
- **Low-Contrast Outlines:** Surfaces are defined by 1px borders in `sage-muted` at 20% opacity.
- **Glassmorphism (Subtle):** Modal overlays and the "Privacy Banner" should use a light backdrop blur (8px) with a semi-transparent cream tint to keep the user connected to the background content.
- **Soft Ambient Shadows:** Only used on primary action buttons or active cards, utilizing a very diffused forest-green tint (e.g., `rgba(26, 47, 43, 0.08)`).

## Shapes

The shape language is "Softly Geometric." We avoid sharp 90-degree angles to remain approachable, but avoid "bubble-like" pill shapes to maintain professional maturity.

- **Standard Radius:** 0.5rem (8px) for cards, input fields, and buttons.
- **Large Radius:** 1rem (16px) for main event containers or featured image previews.
- **Line Art:** Incorporate thin (1pt) botanical line art as background motifs or as dividers to echo the logo's aesthetic. Use dashed lines (inspired by the "face recognition" box in the logo) for technical UI containers like "Drop Zones."

## Components

### Buttons
- **Primary:** Solid `deep-forest` with `warm-cream` text. Rectangular with 8px radius.
- **Secondary:** Outlined `sage-muted` with `deep-forest` text.
- **Ghost:** No border, `deep-forest` text, subtle `sage` background on hover.

### Cards (Event & Photo)
Cards should have no visible border until hovered. Use the `warm-cream` surface for the background and a very subtle 1px border for definition. Photo thumbnails should have slightly rounded corners (4px).

### Input Fields
Minimalist styling with a 1px bottom border only by default. On focus, transition to a full 1px border in `sage-muted` with a 4px corner radius.

### Privacy Banner
A signature component. It should use a thin border and the `copper-accent` for the icon to draw "safe" attention. Background should be a blurred "Glassmorphism" effect.

### Progress & Scanning
The "ETA" and "Scanning" indicators should use the `muted-gold` color for the progress bar to feel "valuable" rather than "anxious." Use thin, animated dashed lines to represent the "Active AI" scanning state, matching the facial landmark lines in the logo.