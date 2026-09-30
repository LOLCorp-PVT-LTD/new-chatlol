---
name: Sunset Citrus
colors:
  surface: '#fff8f5'
  surface-dim: '#edd6c8'
  surface-bright: '#fff8f5'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#fff1ea'
  surface-container: '#ffeade'
  surface-container-high: '#fbe4d6'
  surface-container-highest: '#f5ded1'
  on-surface: '#251911'
  on-surface-variant: '#5b4137'
  inverse-surface: '#3b2e25'
  inverse-on-surface: '#ffede4'
  outline: '#8f7065'
  outline-variant: '#e4bfb1'
  surface-tint: '#a63b00'
  primary: '#a63b00'
  on-primary: '#ffffff'
  primary-container: '#ff5e00'
  on-primary-container: '#531900'
  inverse-primary: '#ffb599'
  secondary: '#8a5100'
  on-secondary: '#ffffff'
  secondary-container: '#fe9800'
  on-secondary-container: '#643900'
  tertiary: '#bd0042'
  on-tertiary: '#ffffff'
  tertiary-container: '#ff5676'
  on-tertiary-container: '#5f001d'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#ffdbce'
  primary-fixed-dim: '#ffb599'
  on-primary-fixed: '#370e00'
  on-primary-fixed-variant: '#7f2b00'
  secondary-fixed: '#ffdcbd'
  secondary-fixed-dim: '#ffb86f'
  on-secondary-fixed: '#2c1600'
  on-secondary-fixed-variant: '#693c00'
  tertiary-fixed: '#ffd9dc'
  tertiary-fixed-dim: '#ffb2ba'
  on-tertiary-fixed: '#400011'
  on-tertiary-fixed-variant: '#910030'
  background: '#fff8f5'
  on-background: '#251911'
  surface-variant: '#f5ded1'
typography:
  display-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 48px
    fontWeight: '800'
    lineHeight: 56px
    letterSpacing: -0.03em
  display-lg-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 36px
    fontWeight: '800'
    lineHeight: 42px
    letterSpacing: -0.025em
  headline-xl:
    fontFamily: Plus Jakarta Sans
    fontSize: 32px
    fontWeight: '800'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
    letterSpacing: -0.015em
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 20px
    fontWeight: '700'
    lineHeight: 28px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 18px
    fontWeight: '700'
    lineHeight: 24px
    letterSpacing: 0em
  body-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '500'
    lineHeight: 24px
    letterSpacing: -0.005em
  body-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
    letterSpacing: 0em
  body-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.01em
  label-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '700'
    lineHeight: 18px
    letterSpacing: 0.01em
  label-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 12px
    fontWeight: '700'
    lineHeight: 16px
    letterSpacing: 0.02em
  label-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 11px
    fontWeight: '700'
    lineHeight: 14px
    letterSpacing: 0.04em
rounded:
  sm: 0.5rem
  DEFAULT: 1rem
  md: 1.5rem
  lg: 2rem
  xl: 3rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-desktop: 1.5rem
  margin: 1rem
  margin-tablet: 1.5rem
  margin-desktop: 2.5rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2.25rem
  space-2xl: 3.5rem
---

## Brand & Style

This design system channels an unapologetic, high-octane social atmosphere engineered for Gen-Z and young adult digital natives. Built for visual immediacy, spontaneous interaction, and communal warmth, the visual language rejects sterile minimalism in favor of a tactile, kinetic, and radiant presence. 

The aesthetic fuses **Tactile Neo-Pop** with luminous **Sunset Citrus gradients**. Interfaces feel lively, physical, and buoyant—avoiding flat corporate sterility by using warm-cream canvas layers, juicy saturated fills, soft colored halos, and rounded, thumb-friendly touch targets. The experience should feel like a late summer rooftop hangout at golden hour: energetic, inviting, spontaneous, and intensely social.

## Colors

The color palette centers on radiant heat balanced by welcoming, digestible neutrals:

- **Primary (`#ff5e00`)**: Neon Flame Orange. Drives primary interactions, live pulses, notifications, and key interactive focal points.
- **Secondary (`#ff9900`)**: Golden Tangerine. Provides balance through luminous sunset gradients, active badges, and warm progress metrics.
- **Tertiary (`#ff3366`)**: Electric Coral. Serves as an expressive accent reserved for reactions, vibe stars, like triggers, and highlight moments.
- **Neutral (`#261a12`)**: Deep Roasted Umber. Replaces harsh synthetic blacks for all body copy and primary iconography, maintaining soft contrast on warm backgrounds.

### Canvas & Surface Architecture
- **Canvas Base**: `#fffbf7` (Warm Cream). A sunlit backdrop that prevents eye fatigue while keeping visual contrast energetic.
- **Surface Container (Card Base)**: `#ffffff` (Pure White) with an optional secondary container of `#fff4ea` (Sunlit Tint) for stacked modules or quote-cards.
- **Surface Accent**: Linear gradients transitioning strictly from `#ff9900` to `#ff5e00` at a 135-degree angle for hero buttons, live avatar rings, and floating action triggers.
- **Subtle Linework & Dividers**: `#f3e7dc` (Soft Sandstone) to ground sections without rigid visual interruption.

## Typography

Typography relies entirely on **Plus Jakarta Sans** to maintain geometric energy, friendly curves, and clear legibility at high viewing speeds. 

- **Display & Headlines**: Driven by weights `700` and `800` with subtle negative tracking. Headlines must feel plump and punchy, capturing the visual cadence of stickers, posters, and conversational badges.
- **Body Text**: Rendered strictly at weight `500` rather than `400` regular. This provides structural substance against cream backgrounds and prevents thin pixelation on mobile screens.
- **Labels & Microcopy**: Rendered at `700` weight with slight positive tracking to ensure rapid identification in dense UI elements like stream ratings, vibe chips, and live counts.

## Layout & Spacing

The system runs on an 8pt spatial cadence with an emphasis on fluid horizontal momentum and thumb-accessible vertical modules:

- **Mobile (< 768px)**: 4-column fluid layout with `1rem` margins and `1rem` gutters. Feeds and media streams expand edge-to-edge with inset content padding. Bottom utility bars are prioritized for single-hand reachability.
- **Tablet (768px - 1024px)**: 8-column layout with `1.5rem` margins. Introduces dual split-views (e.g., Lounge roster on the left, active chat stream on the right).
- **Desktop (> 1024px)**: 12-column layout maxing out at `1280px` centered canvas, bounded by `2.5rem` outer margins and `1.5rem` gutters. Content splits into a fixed 3-column architecture: navigation anchor (left), central media feed (center 6 columns), and interactive hangout lounges/trending vibes (right 3-4 columns).

## Elevation & Depth

Visual hierarchy uses **Warm Ambient Halos** rather than neutral grays, ensuring depth feels lit by the vibrant sunset palette.

- **Level 0 (Flat Canvas)**: `#fffbf7`. The ground plane on which content cards and lounges sit.
- **Level 1 (Feed Cards & Modules)**: Pure white `#ffffff` surface paired with a warm diffused drop: `0px 4px 20px -2px rgba(184, 82, 0, 0.06), 0px 1px 3px 0px rgba(71, 32, 0, 0.04)`. Outlines are avoided in favor of crisp tonal separation.
- **Level 2 (Popovers, Vibe Selectors, Hover States)**: `0px 12px 28px -4px rgba(255, 94, 0, 0.14), 0px 4px 10px -1px rgba(71, 32, 0, 0.05)`.
- **Level 3 (Action Floats & Modals)**: `0px 20px 40px -8px rgba(255, 94, 0, 0.28)`. Used for primary CTA buttons, floating camera triggers, and modal dialogs.
- **Glow Accentuation**: Active live indicators and high-vibe scores use a focused neon bloom: `box-shadow: 0 0 16px rgba(255, 94, 0, 0.45)`.

## Shapes

The design uses a **Level 3 (Pill-shaped)** geometry. The round silhouette emphasizes playfulness, safety, and physical touch.

- **Buttons, Badges, & Chips**: Completely pill-shaped (`9999px` border-radius).
- **Cards & Visual Containers**: `2rem` (32px) corner radii for post cards, chat bubbles, and lounge panes.
- **Inner Nested Media & Avatars**: Post media uses `1.5rem` (24px) radius. Avatars maintain perfect circular geometry (`50%`), bordered by concentric warm-gradient rings during active broadcasts.

## Components

### Buttons
- **Primary Action**: Pill-shaped, gradient-filled (`linear-gradient(135deg, #ff9900 0%, #ff5e00 100%)`), white bold text, elevated by a matching warm glow shadow. On tap, scales smoothly to `0.97` with elevated brightness.
- **Secondary Action**: Solid `#fff4ea` (sunlit tint) with `#ff5e00` text. Hover shifts to `#ffe6d1`.
- **Tertiary / Utility**: Ghost pill with clear background, `#261a12` text, and quick-response background highlight on hover (`rgba(255, 94, 0, 0.08)`).

### Vibe Chips & Rating Tags
- **Vibe Stars (1-10 Slider / Star Chips)**: Pill enclosures featuring `#ff3366` coral highlights for high scores and `#ff9900` for mid ratings. Backgrounds use `rgba(255, 94, 0, 0.1)` with active states snapping to solid coral fills with pure white bold typography.
- **Topic & Filter Chips**: Horizontal scrolling pills. Default state: white background with subtle sandstone border (`#f3e7dc`). Selected state: solid `#261a12` with pure white text, or gradient-filled when filtering active live rooms.

### Cards & Media Feeds
- **Post Cards**: Crisp white background, `2rem` rounded corners, warm ambient drop shadow. Header houses creator avatar, bold handle, and quick-action menu. Photo/video embeds fill the inner horizontal width with `1.5rem` radius. Bottom interactive shelf groups reactions, comments, and direct shares into a single pill cluster.
- **Hangout Lounge Cards**: Distinctive background tint (`#fff4ea`), showing active room member avatars clustered with overlapping pill tags, current music/audio vibe indicator, and a gradient "Jump In" pill button.

### Form Inputs & Search
- **Input Fields**: Tall pill-form (`52px` height) with `#ffffff` fill, inset padding of `1.5rem`, and deep umber typography. Inactive state features a low-contrast sand border (`#f3e7dc`); focused state transitions to a 2px `#ff5e00` border with a subtle orange focus ring (`0 0 0 4px rgba(255, 94, 0, 0.15)`).
- **Search Bar**: Pill-shaped with a magnifying glass icon tinted in `#ff5e00` and clear placeholder copy (`"Find friends, lounges, vibes..."`).

### Checkboxes, Radios, & Switches
- **Switches (Toggles)**: Pill track (`32px` height, `54px` width). Off state is `#f3e7dc`; on state animates to `#ff5e00`. The thumb is an elevated pure white circle with a tactile pop effect on toggle.
- **Checkboxes & Radios**: Fully circular check tokens. Checked state displays `#ff5e00` fill with a crisp white checkmark.

### Live Floating Indicators & Alerts
- Dynamic floating badge pinned to active navigation items: gradient fill, white micro-copy, animated pulse effect expanding outward with `rgba(255, 94, 0, 0.4)`.