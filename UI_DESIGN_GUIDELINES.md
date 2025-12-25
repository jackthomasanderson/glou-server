# 🎨 Clean UI Design Guidelines v1.0

## Overview

This document defines the clean, modern UI design standards for Glou Server's collection management application. All components should follow these guidelines to maintain visual consistency, accessibility, and user experience.

**Last Updated:** December 2025  
**Theme Version:** Clean Modern v1.0  
**Primary Color:** Wine Red (#722B3D)

---

## 📐 Design Principles

1. **Minimalism** - Only essential elements, no visual clutter
2. **Consistency** - Unified design language across all screens
3. **Clarity** - Clear hierarchy and purpose for every element
4. **Accessibility** - WCAG 2.1 AA compliance at minimum
5. **Responsiveness** - Perfect on all device sizes (mobile, tablet, desktop)
6. **Interaction** - Smooth transitions and intuitive feedback

---

## 🎯 Color System

### Primary Palette
```
Primary (Wine Red):        #722B3D
Primary Container:         #F5D5E3
On Primary:               #FFFFFF
On Primary Container:     #2C0F1D
```

### Semantic Colors
```
Success/Tertiary:  #2F564B (Teal green)
Warning:           #B8A037 (Golden)
Error:             #C5241F (Red)
Info/Secondary:    #2D5169 (Blue)
```

### Surface Colors
```
Surface (Background):      #FFFBFE
Surface Container:         #F3EEF6
Surface Container High:    #ECE6F0
Surface Container Highest: #E6DFE9
On Surface:               #1C1B1F
On Surface Variant:       #48454F
```

### Neutral Colors
```
Outline:         #79747E
Outline Variant: #CAC7D0
Divider:         rgba(outline, 0.12)
```

---

## 🔤 Typography System

### Font Family
- **Font:** Roboto (Google Fonts)
- **Fallback:** Helvetica, Arial, sans-serif

### Heading Hierarchy
| Level | Size | Weight | Line Height | Usage |
|-------|------|--------|-------------|-------|
| H1 | 32px | 700 | 1.25 | Page titles |
| H2 | 28px | 700 | 1.29 | Section headers |
| H3 | 24px | 600 | 1.33 | Subsection titles |
| H4 | 22px | 600 | 1.27 | Card titles |
| H5 | 16px | 600 | 1.5 | Strong labels |
| H6 | 14px | 600 | 1.43 | Emphasis text |

### Body Text
| Style | Size | Weight | Line Height | Usage |
|-------|------|--------|-------------|-------|
| Body 1 | 16px | 400 | 1.6 | Main content |
| Body 2 | 14px | 400 | 1.57 | Secondary content |
| Button | 14px | 600 | 1.43 | Action buttons |
| Caption | 12px | 500 | 1.33 | Helper text |

### Examples
```jsx
// Page title
<Typography variant="h1">Wine Collection</Typography>

// Section header
<Typography variant="h5" sx={{ fontWeight: 600 }}>Ready to Drink</Typography>

// Description text
<Typography variant="body2" sx={{ color: theme.palette.onSurfaceVariant }}>
  Manage your collection with ease
</Typography>
```

---

## 📦 Component Specifications

### Cards
**Border Radius:** 16px  
**Shadow (default):** `0 2px 8px rgba(onSurface, 0.05)`  
**Shadow (hover):** `0 4px 16px rgba(onSurface, 0.1)`  
**Border:** `1px solid rgba(outline, 0.12)`  
**Hover Transform:** `translateY(-2px)`

```jsx
<Card sx={{
  backgroundColor: theme.palette.surface,
  border: `1px solid ${alpha(theme.palette.outline, 0.12)}`,
  borderRadius: '16px',
  boxShadow: `0 2px 8px ${alpha(theme.palette.onSurface, 0.05)}`,
  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
  '&:hover': {
    boxShadow: `0 4px 16px ${alpha(theme.palette.onSurface, 0.1)}`,
    transform: 'translateY(-2px)',
  }
}}>
  {/* Content */}
</Card>
```

### Buttons
**Border Radius:** 12px  
**Padding:** 10px 24px  
**Font Weight:** 600  
**Box Shadow (hover):** `0 2px 8px rgba(primary, 0.25)`

#### Variants

**Contained (Primary)**
```jsx
<Button variant="contained" sx={{
  backgroundColor: theme.palette.primary.main,
  color: theme.palette.onPrimary,
  boxShadow: `0 2px 8px ${alpha(theme.palette.primary.main, 0.25)}`,
  '&:hover': {
    backgroundColor: theme.palette.primaryContainer,
    transform: 'translateY(-2px)',
  }
}} />
```

**Outlined (Secondary)**
```jsx
<Button variant="outlined" sx={{
  borderColor: theme.palette.outline,
  borderWidth: '1.5px',
  color: theme.palette.primary.main,
  '&:hover': {
    backgroundColor: alpha(theme.palette.primary.main, 0.08),
  }
}} />
```

**Soft (Tertiary)**
```jsx
<Button variant="soft" sx={{
  backgroundColor: alpha(theme.palette.primary.main, 0.1),
  color: theme.palette.primary.main,
  '&:hover': {
    backgroundColor: alpha(theme.palette.primary.main, 0.15),
  }
}} />
```

### Input Fields
**Border Radius:** 12px  
**Background:** `surfaceContainerHigh`  
**Border:** `1px solid rgba(outline, 0.12)`  
**Focus Border:** `2px solid primary`

```jsx
<TextField sx={{
  '& .MuiOutlinedInput-root': {
    backgroundColor: theme.palette.surfaceContainerHigh,
    borderRadius: '12px',
    '& fieldset': {
      borderColor: alpha(theme.palette.outline, 0.12),
    },
    '&:hover fieldset': {
      borderColor: alpha(theme.palette.outline, 0.2),
    },
    '&.Mui-focused fieldset': {
      borderColor: theme.palette.primary.main,
      borderWidth: '2px',
    },
  },
}} />
```

### Navigation Items
**Border Radius:** 10px  
**Selected State:** 
- Background: `alpha(primary, 0.1)`
- Border: `1.5px solid primary`
- Text Color: primary
- Font Weight: 600

```jsx
<ListItemButton sx={{
  borderRadius: '10px',
  backgroundColor: currentPage === item.id ? alpha(theme.palette.primary.main, 0.1) : 'transparent',
  border: currentPage === item.id ? `1.5px solid ${theme.palette.primary.main}` : 'none',
  color: currentPage === item.id ? theme.palette.primary.main : theme.palette.onSurfaceVariant,
  fontWeight: currentPage === item.id ? 600 : 500,
}} />
```

---

## 📏 Spacing System

Based on 8px base unit (Material Design 3 standard):

| Size | Pixels | Token |
|------|--------|-------|
| xs | 4px | spacing(0.5) |
| sm | 8px | spacing(1) |
| md | 16px | spacing(2) |
| lg | 24px | spacing(3) |
| xl | 32px | spacing(4) |
| 2xl | 40px | spacing(5) |

### Common Patterns
```jsx
// Section padding
sx={{ padding: 3 }} // 24px

// Card content spacing
sx={{ gap: 2, marginBottom: 3 }} // 16px gap, 24px margin

// Component spacing
sx={{ spacing: 2 }} // 16px between items

// Tight spacing (inputs in form)
sx={{ gap: 1 }} // 8px
```

---

## 🎭 Shadow System

| Level | Shadow | Usage |
|-------|--------|-------|
| Subtle | `0 2px 8px rgba(onSurface, 0.05)` | Cards, hover states |
| Medium | `0 4px 12px rgba(onSurface, 0.1)` | Elevated cards, modals |
| Strong | `0 8px 24px rgba(onSurface, 0.15)` | Dialogs, dropdowns |

```jsx
// Subtle
boxShadow: `0 2px 8px ${alpha(theme.palette.onSurface, 0.05)}`

// Medium on hover
'&:hover': {
  boxShadow: `0 4px 12px ${alpha(theme.palette.onSurface, 0.1)}`
}

// Strong
boxShadow: `0 8px 24px ${alpha(theme.palette.onSurface, 0.15)}`
```

---

## ⚡ Transitions & Animations

**Standard Duration:** 0.2s - 0.3s  
**Easing Function:** `cubic-bezier(0.4, 0, 0.2, 1)` (Material default)

```jsx
// Smooth color change
transition: 'all 0.2s ease'

// Card lift effect
transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'

// Complex animation
transition: 'background-color 0.2s ease, box-shadow 0.2s ease'
```

### Common Patterns
```jsx
// Button hover
transform: 'translateY(-2px)'
boxShadow: 'elevated'

// Card hover
transform: 'translateY(-2px)'
boxShadow: 'elevated'
borderColor: 'alpha(primary, 0.2)'
```

---

## 🔄 Responsive Design

### Breakpoints (Material Design 3)
| Size | Range | Usage |
|------|-------|-------|
| Mobile | < 600px | Single column, bottom nav |
| Tablet | 600px - 960px | 2-column, side nav rail |
| Desktop | > 960px | 3+ column, left drawer |

```jsx
const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
const isTablet = useMediaQuery(theme.breakpoints.between('sm', 'md'));
const isDesktop = useMediaQuery(theme.breakpoints.up('md'));
```

### Grid Spacing
```jsx
// Always use Grid with responsive sizing
<Grid container spacing={3}>
  <Grid item xs={12} sm={6} md={3}>
    {/* Full on mobile, half on tablet, quarter on desktop */}
  </Grid>
</Grid>
```

---

## ♿ Accessibility Guidelines

### Color Contrast
- **Minimum Ratio:** 4.5:1 for normal text, 3:1 for large text
- Test with: [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/)

### Focus States
```jsx
'&:focus-visible': {
  outline: `2px solid ${theme.palette.primary.main}`,
  outlineOffset: '2px',
}
```

### ARIA Labels
```jsx
// Buttons without text
<IconButton aria-label="Close dialog">
  <CloseIcon />
</IconButton>

// Icon-only navigation
<ListItemButton aria-label="Dashboard">
  <DashboardIcon />
</ListItemButton>
```

### Semantic HTML
- Use `<button>` for actions
- Use `<nav>` for navigation
- Use `<section>` for content sections
- Never use divs for interactive elements

---

## 🎨 Using the Component Library

### Import Components
```jsx
import {
  CleanCard,
  CleanButton,
  StatCard,
  SectionTitle,
  InfoBanner,
} from '../components/CleanUIComponents';
```

### StatCard Example
```jsx
<Grid container spacing={3}>
  <Grid item xs={12} sm={6} md={3}>
    <StatCard
      icon={<WineIcon />}
      label="Ready to Drink"
      value={42}
      description="bottles available"
      color="tertiary"
    />
  </Grid>
</Grid>
```

### Info Banner Example
```jsx
<InfoBanner
  type="warning"
  message="This wine is past its peak. Consider drinking soon."
  icon={<WarningIcon />}
  action={<CleanButton>See Details</CleanButton>}
/>
```

---

## 📋 Component Checklist

When creating a new component, ensure:

- [ ] Uses semantic color tokens (not hex values)
- [ ] Border radius is 12px or 16px
- [ ] Shadows follow the shadow system
- [ ] Hover states have transform/shadow elevation
- [ ] Transitions are smooth (0.2s - 0.3s)
- [ ] Responsive layout for mobile/tablet/desktop
- [ ] ARIA labels for accessibility
- [ ] Font weights match typography system
- [ ] Spacing uses 8px base unit
- [ ] Supports both light theme (default)
- [ ] Works with bilingual text (FR/EN)

---

## 🚀 Implementation Examples

### Dashboard Section
```jsx
<Box sx={{ padding: 3 }}>
  <SectionTitle>Wine Collection Statistics</SectionTitle>
  
  <Grid container spacing={3} sx={{ marginBottom: 4 }}>
    <Grid item xs={12} sm={6} md={3}>
      <StatCard
        icon={<LocalDrinkIcon />}
        label="Ready to Drink"
        value={45}
        description="bottles available"
        color="tertiary"
      />
    </Grid>
    {/* More cards... */}
  </Grid>

  <SectionTitle>Actions</SectionTitle>
  <Stack direction="row" spacing={2}>
    <CleanButton>Add Wine</CleanButton>
    <CleanButton variant="outlined">Export Data</CleanButton>
  </Stack>
</Box>
```

### Form Section
```jsx
<CleanCard sx={{ padding: 3, marginBottom: 2 }}>
  <SectionTitle>Collection Settings</SectionTitle>
  
  <Stack spacing={2}>
    <TextField 
      label="Collection Name" 
      fullWidth 
    />
    <TextField 
      label="Description" 
      fullWidth 
      multiline 
      rows={3} 
    />
  </Stack>

  <Box sx={{ marginTop: 3, display: 'flex', gap: 2 }}>
    <CleanButton>Save Changes</CleanButton>
    <CleanButton variant="outlined">Cancel</CleanButton>
  </Box>
</CleanCard>
```

---

## 🔄 Migration Guide (from old theme)

### Old → New
```jsx
// OLD
backgroundColor: theme.palette.surfaceLight
border: `1px solid ${theme.palette.divider}`
borderRadius: '12px'

// NEW
backgroundColor: theme.palette.surface
border: `1px solid ${alpha(theme.palette.outline, 0.12)}`
borderRadius: '16px'
```

---

## 📞 Support & Updates

For questions or suggestions about the UI guidelines:
1. Check [CleanUIComponents.jsx](./CleanUIComponents.jsx)
2. Review component implementations in `web/src/components/`
3. Test in the application UI

---

**Version:** 1.0 | **Status:** Active | **Last Updated:** December 2025
