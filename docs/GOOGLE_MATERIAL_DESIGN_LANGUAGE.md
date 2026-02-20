# Google Material Design Language

## Overview

Material Design is Google's open-source design language, originally announced on June 25, 2014, at Google I/O. It synthesizes the classic principles of good design with the innovation and possibility of technology and science. Material Design provides a unified system of visual, motion, and interaction design across platforms and devices, backed by open-source code.

The official documentation lives at [m3.material.io](https://m3.material.io/).

---

## Evolution Timeline

### Material Design 1 (2014)

The original design language introduced the concept of "material" as a metaphor — digital surfaces that behave like physical materials. Key ideas:

- **Material as metaphor**: UI elements are informed by tactile reality, inspired by paper and ink but leveraging the flexibility of digital technology.
- **Bold, graphic, intentional**: Typography, grids, space, scale, color, and imagery guide visual treatments in a way that immerses the user.
- **Motion provides meaning**: Motion respects and reinforces the user as the prime mover. Transitions are meaningful and appropriate.
- Expanding on the "cards" UI first seen in Google Now.
- Grid-based layouts, responsive animations, depth effects using lighting and shadows.

### Material Design 2 (2018)

An updated set of principles and guidelines introduced at Google I/O 2018. Redesigned for Android Pie with:

- Greater emphasis on white space and rounded shapes.
- Bottom navigation and bottom app bars as primary patterns.
- Refined elevation and shadow model.
- Google Sans as the primary typeface.

### Material You / Material Design 3 (2021)

Announced at Google I/O in May 2021 for Android 12. The most significant overhaul:

- **Dynamic Color**: Automatically generates color themes from the user's wallpaper.
- **Personalization at scale**: Interfaces adapt to each user's preferences.
- Larger buttons, increased animation, accessibility-first approach.
- Adaptive components that respond to screen sizes and interaction modes.

### Material 3 Expressive (2025 — Current)

Announced at The Android Show: I/O Edition in May 2025 for Android 16 and Wear OS 6. Built on research from **46 global studies** with **18,000+ participants**:

- A shift from minimalism to emotionally engaging, colorful interfaces.
- Research found that users have an appetite for "wild and way-too-playful" interfaces.
- Expressive visuals enhance usability, especially for younger generations and older users.

---

## Core Design Principles

### 1. Material as Metaphor

Material is grounded in tactile reality. Surfaces, edges, seams, and shadows establish a spatial model that is consistent and intuitive to the user. Light, surfaces, and movement convey how objects interact and exist in physical space.

### 2. Bold, Graphic, Intentional

The foundational elements of print-based design — typography, grids, space, scale, color, and use of imagery — guide visual treatments. These create hierarchy, meaning, and focus.

### 3. Motion Provides Meaning

Motion occurs within a single environment. Objects are presented without breaking the continuity of experience even as they reshape and reorganize. Motion should be meaningful and appropriate, serving to focus attention and maintain continuity.

---

## Style Foundations

### Color System

The M3 color system is built around **five key colors**, each relating to a tonal palette of 13 tones:

| Role       | Purpose                                                         |
| ---------- | --------------------------------------------------------------- |
| Primary    | Main components: prominent buttons, active states, FABs         |
| Secondary  | Less prominent components: filter chips, secondary actions      |
| Tertiary   | Contrasting accents that balance primary and secondary colors   |
| Error      | Error states, destructive actions, validation failures          |
| Neutral    | Surfaces, backgrounds, text, outlines                           |

#### Dynamic Color

Material 3's standout feature. The system:

- Extracts key colors from user wallpapers or brand sources.
- Generates a full palette of harmonious colors using tonal mapping.
- Ensures accessibility by maintaining contrast ratios automatically.
- Adapts across light and dark themes.

#### M3 Expressive Color Updates

- Color serves as a **communication tool**, not just an aesthetic element.
- Bright and bold tones draw attention to primary actions.
- Subtle shades support less urgent interface areas.
- Richer, more nuanced palettes improve visual hierarchy.
- Clearer separation between primary, secondary, and tertiary tones.

### Typography

M3 defines a **type scale** with five categories, each available in three sizes:

| Category | Sizes              | Usage                                            |
| -------- | ------------------ | ------------------------------------------------ |
| Display  | Large, Medium, Small | Hero text, prominent numbers                   |
| Headline | Large, Medium, Small | Section headers, prominent content labels      |
| Title    | Large, Medium, Small | Subsections, card titles, dialog titles        |
| Body     | Large, Medium, Small | Paragraph text, descriptions, long-form content |
| Label    | Large, Medium, Small | Buttons, tabs, chips, captions                 |

- Default typeface: **Google Sans** (Display, Headline) and **Google Sans Text** (Body, Label).
- Scalable type systems adapt seamlessly across phones, tablets, and desktops.
- Type styles are defined as design tokens for consistent theming.

#### M3 Expressive Typography Updates

- Headlines and key actions use **larger sizes and heavier weights**.
- Improved hierarchy makes critical interactions (recording, message counts) feel more immediate and noticeable.

### Shape

Shapes in M3 express brand identity and provide visual variety. The shape system defines **five roundedness levels**:

| Level        | Corner Radius | Usage Examples                       |
| ------------ | ------------- | ------------------------------------ |
| Extra Small  | 4dp           | Small components, chips              |
| Small        | 8dp           | Buttons, text fields                 |
| Medium       | 12dp          | Cards, dialogs                       |
| Large        | 16dp          | Large cards, navigation drawers      |
| Extra Large  | 28dp          | Bottom sheets, FABs                  |

- Full (fully round) and None (no rounding) are also available.

#### M3 Expressive Shape Updates

- **35 new shapes** added to the Material Shapes Library.
- **Shape morphing**: Components dynamically change shape in response to user input.
- Buttons transform shape and size for springy animation effects.
- More visual contrast between states (e.g., "play" vs. "pause").

### Elevation

Elevation establishes visual hierarchy and depth along the z-axis:

| Level | Shadow Depth | Usage                                  |
| ----- | ------------ | -------------------------------------- |
| 0     | 0dp          | Base surface level                     |
| 1     | 1dp          | Cards, app bars at rest                |
| 2     | 3dp          | Raised buttons, snackbars              |
| 3     | 6dp          | FABs, bottom app bar                   |
| 4     | 8dp          | Bottom sheets, navigation drawers      |
| 5     | 12dp         | Dialogs, modals                        |

- M3 uses **tonal elevation** in addition to shadows — surfaces change tone rather than adding shadows to indicate elevation.
- Tonal surfaces are more accessible and work better in dark themes.

### Motion

M3's motion system is built around **meaningful movement** — every animation should serve clarity and character.

**Core motion principles:**

- **Informative**: Motion helps orient users within the interface.
- **Focused**: Motion draws attention to what matters.
- **Expressive**: Motion celebrates user moments and reflects brand personality.

**Transition patterns:**

- Container transforms — shared element transitions.
- Fade through — for elements without shared spatial relationship.
- Shared axis — for navigation through a consistent spatial model.

#### M3 Expressive Motion Updates

- **Spring-based motion physics** for fluid, natural-feeling interactions.
- Smooth detach effects with haptic feedback on dismissals.
- Surrounding elements subtly react to user actions.
- Springy transitions on app close, volume adjustment, and notification shade interactions.

### Iconography

Material Design uses a consistent icon system:

- **Material Symbols**: A unified icon font with variable font features.
- Over 2,500+ icons available in multiple styles.
- Three styles: Outlined, Rounded, and Sharp.
- Icons support variable weight, fill, grade, and optical size.
- Available as a font (Google Symbols) or individual SVGs.

---

## Component Library

Material Design provides a comprehensive set of reusable UI components:

### Actions

- Buttons (filled, outlined, text, elevated, tonal)
- FABs (Floating Action Buttons)
- Icon buttons
- Segmented buttons

### Communication

- Badges
- Progress indicators (linear, circular)
- Snackbars
- Tooltips

### Containment

- Bottom sheets
- Cards (filled, outlined, elevated)
- Carousel
- Dialogs
- Dividers
- Side sheets

### Navigation

- Bottom app bar
- Navigation bar
- Navigation drawer
- Navigation rail
- Tabs
- Top app bar

### Selection

- Checkboxes
- Chips (assist, filter, input, suggestion)
- Date pickers
- Menus
- Radio buttons
- Sliders
- Switches
- Time pickers

### Text Inputs

- Text fields (filled, outlined)
- Search bars

### M3 Expressive — New Components

- **Button groups**: Apply shape, motion, and width changes to make buttons more interactive.
- **Split buttons**: Combined action and dropdown in a single component.
- **Loading indicators**: Progress displays for actions under five seconds; replace most indeterminate circular indicators.
- **Toolbars**: Refreshed with expressive styling.
- **Refreshed FABs**: Updated with expressive animations.
- **15 new or refreshed components** total.

---

## Theming and Customization

### Design Tokens

M3 uses a **design token** architecture for consistent, portable theming:

- **Reference tokens**: Raw palette values (e.g., `md.ref.palette.primary40`).
- **System tokens**: Role-based assignments (e.g., `md.sys.color.primary`).
- **Component tokens**: Specific component values (e.g., `md.comp.filled-button.container.color`).

### Theme Builder

Google provides a [Material Theme Builder](https://m3.material.io/theme-builder) tool:

- Generate complete M3 themes from a single seed color.
- Export themes as design tokens for Android, Flutter, Web, and Figma.
- Preview components with your custom theme in real time.

### Custom Theming

Themes can be customized across:

- **Color schemes**: Override any role in the palette.
- **Typography scales**: Swap typefaces and adjust sizing.
- **Shape scales**: Modify corner radii system-wide.
- **Elevation**: Adjust shadow and tonal surface behaviors.

---

## Accessibility

Material Design treats accessibility as a first-class concern:

- **Color contrast**: Tonal palettes guarantee WCAG AA contrast ratios.
- **Touch targets**: Minimum 48x48dp for interactive elements.
- **Focus indicators**: Visible keyboard and switch access indicators.
- **Screen reader support**: Components include built-in semantic structure.
- **Dynamic type**: Components adapt to user font-size preferences.
- **Reduced motion**: Motion respects system-level accessibility settings.
- **Dark theme**: Full support with accessible contrast ratios maintained.

---

## Platform Support

Material Design provides implementations for:

| Platform   | Library                    | Language      |
| ---------- | -------------------------- | ------------- |
| Android    | Jetpack Compose Material 3 | Kotlin        |
| Android    | MDC-Android                | XML / Java    |
| Flutter    | Flutter Material           | Dart          |
| Web        | MUI (Material UI)          | React / JS    |
| Web        | Material Web Components    | Web Components|
| iOS        | Material Components iOS    | Swift         |

---

## Design Resources

- **Figma**: Official Material 3 Design Kit with all components, styles, and tokens.
- **Material Theme Builder**: Generate and export themes.
- **Material Symbols**: Icon library with 2,500+ icons.
- **Sticker sheets**: Component reference for design tools.
- **Code samples**: Open-source reference implementations on GitHub.

---

## References and Sources

- [Material Design 3 — Official Site](https://m3.material.io/)
- [Material Design 3 Foundations](https://m3.material.io/foundations)
- [Material Design 3 Styles](https://m3.material.io/styles)
- [Get Started with Material Design 3](https://m3.material.io/get-started)
- [Google Design](https://design.google/)
- [Material 3 Expressive — Android Authority](https://www.androidauthority.com/google-material-3-expressive-features-changes-availability-supported-devices-3556392/)
- [Material 3 Expressive — Supercharge Design](https://supercharge.design/blog/material-3-expressive)
- [Material 3 Expressive — UX World / Medium](https://medium.com/uxdworld/material-3-expressive-googles-new-direction-in-ui-design-286dc8517ef5)
- [Material Design Wikipedia](https://en.wikipedia.org/wiki/Material_Design)
- [Material 3 in Jetpack Compose — Android Developers](https://developer.android.com/develop/ui/compose/designsystems/material3)
- [Google Material Design — Interaction Design Foundation](https://www.interaction-design.org/literature/article/google-s-material-design-android-design-language)
- [Material Design — Dezeen](https://www.dezeen.com/2025/05/28/google-ushers-in-age-of-expressive-interfaces-with-material-design-update/)
