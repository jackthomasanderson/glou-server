# 🎨 Clean UI Quick Reference Card

## Color Tokens Quick Access

```
PRIMARY PALETTE:
- Primary: #722B3D (Wine Red)
- Primary Container: #F5D5E3 (Light)
- On Primary: #FFFFFF (White text)

SEMANTIC:
- Tertiary (Success): #2F564B
- Warning: #B8A037
- Error: #C5241F
- Secondary (Info): #2D5169

SURFACES:
- Surface: #FFFBFE
- Surface Container: #F3EEF6
- Surface High: #ECE6F0
- On Surface: #1C1B1F
- On Surface Variant: #48454F

NEUTRAL:
- Outline: #79747E
- Divider: rgba(outline, 0.12)
```

---

## Component Sizes

```
BORDER RADIUS:
- Small buttons, inputs: 12px
- Cards, large elements: 16px

SHADOWS:
- Default: 0 2px 8px rgba(onSurface, 0.05)
- Hover: 0 4px 16px rgba(onSurface, 0.1)

SPACING (8px base):
- xs: 4px    (0.5)
- sm: 8px    (1)
- md: 16px   (2)
- lg: 24px   (3)
- xl: 32px   (4)
```

---

## Typography Weights

```
H1-H2: Weight 700 (Bold)
H3-H6: Weight 600 (Semi-bold)
Buttons: Weight 600
Body: Weight 400
```

---

## Responsive Breakpoints

```
Mobile:  < 600px  (1 column, bottom nav)
Tablet:  600-960px (2 column, nav rail)
Desktop: > 960px  (3+ column, drawer)
```

---

## Usage Quick Start

### Import Components
```jsx
import { CleanCard, CleanButton, StatCard } from './CleanUIComponents';
```

### Basic Card
```jsx
<CleanCard>
  <CardContent>Your content</CardContent>
</CleanCard>
```

### Button Variants
```jsx
<CleanButton variant="contained">Primary</CleanButton>
<CleanButton variant="outlined">Outlined</CleanButton>
<CleanButton variant="soft">Soft</CleanButton>
<CleanButton variant="text">Text</CleanButton>
```

### Stat Card
```jsx
<StatCard
  icon={<Icon />}
  label="Label"
  value="42"
  description="Bottles"
  color="tertiary"
/>
```

---

## Design System Files

- 📄 **Guidelines:** `UI_DESIGN_GUIDELINES.md` (300+ lines, comprehensive)
- 📦 **Components:** `web/src/components/CleanUIComponents.jsx`
- 🎨 **Theme:** `web/src/theme/appTheme.js`
- 📋 **Summary:** `CLEAN_UI_REDESIGN_SUMMARY.md`

---

## Key Principles

✅ **Minimalist** - Only essential elements  
✅ **Consistent** - Same design across all screens  
✅ **Accessible** - WCAG 2.1 AA compliant  
✅ **Responsive** - Works on all devices  
✅ **Professional** - Wine-themed, elegant  

---

## Theme Applied To

✅ Dashboard  
✅ Navigation  
✅ Cards & Buttons  
✅ Forms & Inputs  
✅ Tables  
✅ All Components  

---

**Build Status:** ✅ Success (16.87s)  
**Last Updated:** December 2025
