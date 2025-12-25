# 📋 Clean UI Implementation Checklist

## For Updating Existing Screens

Use this checklist when refactoring existing screens to use the new Clean UI components.

---

## Pre-Implementation

- [ ] Review [UI_DESIGN_GUIDELINES.md](./UI_DESIGN_GUIDELINES.md)
- [ ] Read [CLEAN_UI_QUICK_REF.md](./CLEAN_UI_QUICK_REF.md)
- [ ] Check existing implementations (CollectionDashboard, AdaptiveNavigationShell)
- [ ] Plan component structure on paper/whiteboard

---

## Component Audit

For the screen you're updating, list:

**Screen Name:** ___________________

**Current Components:**
- [ ] Cards/Containers
- [ ] Buttons
- [ ] Forms/Inputs
- [ ] Tables
- [ ] Navigation elements
- [ ] Typography
- [ ] Spacing/Layout

**Candidate for Cleanup:**
- [ ] Uses hardcoded colors (should use theme tokens)
- [ ] Has inconsistent shadows
- [ ] Missing hover effects
- [ ] Non-responsive layouts
- [ ] Doesn't follow 8px spacing grid

---

## Implementation Steps

### Step 1: Import Clean Components
```jsx
import {
  CleanCard,
  CleanButton,
  StatCard,
  SectionTitle,
  InfoBanner,
  DataTable,
  TagGroup,
  EmptyState,
  SkeletonLoader,
} from '../components/CleanUIComponents';
```

- [ ] All needed components imported
- [ ] No unused imports

### Step 2: Replace Card Containers
```jsx
// OLD
<Card sx={{ backgroundColor: theme.palette.surfaceLight, ... }}>

// NEW
<CleanCard elevation>
  {/* content */}
</CleanCard>
```

- [ ] All generic cards replaced with CleanCard
- [ ] Proper elevation attribute set
- [ ] Card styles removed (handled by component)

### Step 3: Replace Buttons
```jsx
// OLD
<Button variant="contained" sx={{ backgroundColor: ... }}>

// NEW
<CleanButton variant="contained">
```

- [ ] All buttons use CleanButton
- [ ] Correct variants chosen (contained, outlined, soft, text)
- [ ] Custom button styles removed
- [ ] Hover effects preserved

### Step 4: Update Typography
```jsx
// OLD
<Typography variant="h6" sx={{ fontWeight: 400 }}>

// NEW
<Typography variant="h5" sx={{ fontWeight: 600 }}>
  OR use
<SectionTitle>
```

- [ ] Headings use weight 600-700
- [ ] Body text uses weight 400
- [ ] Line heights follow specs (1.6 for body, 1.25-1.5 for headings)
- [ ] Color tokens used (not hex values)

### Step 5: Fix Colors
```jsx
// OLD
sx={{ color: '#333333' }}

// NEW
sx={{ color: theme.palette.onSurface }}
```

- [ ] All hardcoded colors replaced
- [ ] Semantic tokens used throughout
- [ ] Color contrast checked (WCAG AA)
- [ ] No color overrides in component styles

### Step 6: Fix Borders
```jsx
// OLD
border: `1px solid ${theme.palette.divider}`

// NEW
border: `1px solid ${alpha(theme.palette.outline, 0.12)}`
```

- [ ] All borders use alpha transparency
- [ ] Dividers use new system
- [ ] No dark/harsh borders

### Step 7: Fix Spacing
```jsx
// OLD
sx={{ padding: '24px', margin: '10px' }}

// NEW
sx={{ padding: 3, margin: 1 }}  // Using 8px grid
```

- [ ] All spacing uses 8px grid (1 = 8px)
- [ ] Consistent gaps between elements
- [ ] No random pixel values

### Step 8: Add Hover Effects
```jsx
// OLD
'&:hover': { boxShadow: '...' }

// NEW
'&:hover': {
  boxShadow: `0 4px 16px ${alpha(theme.palette.onSurface, 0.1)}`,
  transform: 'translateY(-2px)',
  transition: 'all 0.3s ease'
}
```

- [ ] All interactive elements have hover state
- [ ] Shadows elevated on hover
- [ ] Transform/lift effect applied where appropriate
- [ ] Smooth transitions (0.2s-0.3s)

### Step 9: Responsive Design
```jsx
// Check all breakpoints
<Box sx={{ 
  display: 'grid',
  gridTemplateColumns: {
    xs: '1fr',      // Mobile: 1 column
    sm: '1fr 1fr',  // Tablet: 2 columns
    md: 'repeat(3, 1fr)' // Desktop: 3+ columns
  },
  gap: 2 // 16px spacing
}}>
```

- [ ] Mobile layout works (< 600px)
- [ ] Tablet layout works (600-960px)
- [ ] Desktop layout works (> 960px)
- [ ] All breakpoints tested in DevTools
- [ ] Touch-friendly sizes on mobile

### Step 10: Accessibility
```jsx
// Button without text needs aria-label
<CleanButton aria-label="Delete item">
  <DeleteIcon />
</CleanButton>

// Icon buttons need labels
<IconButton aria-label="Close dialog">
  <CloseIcon />
</IconButton>
```

- [ ] Focus states visible (outline on :focus-visible)
- [ ] ARIA labels on icon-only buttons
- [ ] Color contrast ≥ 4.5:1 (WCAG AA)
- [ ] Semantic HTML used
- [ ] Tested with keyboard navigation

---

## Specific Component Patterns

### Card Section
```jsx
<Box sx={{ padding: 3 }}>
  <SectionTitle>Section Name</SectionTitle>
  
  <CleanCard sx={{ marginBottom: 2 }}>
    <CardContent>
      {/* content */}
    </CardContent>
  </CleanCard>
</Box>
```

- [ ] SectionTitle used for headers
- [ ] CleanCard wraps content
- [ ] Proper spacing applied

### Button Group
```jsx
<Stack direction="row" spacing={2}>
  <CleanButton>Primary</CleanButton>
  <CleanButton variant="outlined">Secondary</CleanButton>
</Stack>
```

- [ ] Buttons in Stack for alignment
- [ ] 16px gap between buttons (spacing={2})
- [ ] Primary action emphasized

### Stat Cards
```jsx
<Grid container spacing={3}>
  <Grid item xs={12} sm={6} md={3}>
    <StatCard
      icon={<Icon />}
      label="Label"
      value={amount}
      description="Details"
      color="primary"
    />
  </Grid>
</Grid>
```

- [ ] Grid used for responsive layout
- [ ] StatCard for metrics
- [ ] Color theme applied
- [ ] Icons provided

### Form Section
```jsx
<Stack spacing={2}>
  <TextField label="Name" fullWidth />
  <TextField label="Description" fullWidth multiline rows={3} />
  <Stack direction="row" spacing={2}>
    <CleanButton>Save</CleanButton>
    <CleanButton variant="outlined">Cancel</CleanButton>
  </Stack>
</Stack>
```

- [ ] TextField components used
- [ ] Labels provided
- [ ] Actions at bottom
- [ ] Proper spacing

### Table Section
```jsx
<DataTable
  headers={['Column 1', 'Column 2', 'Column 3']}
  rows={data.map(row => [row.col1, row.col2, row.col3])}
/>
```

- [ ] DataTable component used
- [ ] Headers defined
- [ ] Data formatted as rows
- [ ] Responsive on mobile

### Empty State
```jsx
<EmptyState
  icon={<SearchIcon sx={{ fontSize: 48 }} />}
  title="No wines found"
  description="Try adjusting your filters"
  action={<CleanButton>Clear Filters</CleanButton>}
/>
```

- [ ] EmptyState used for no-data scenarios
- [ ] Icon provided
- [ ] Descriptive message
- [ ] Optional action button

---

## Testing Checklist

After implementation:

### Visual Testing
- [ ] Colors look correct
- [ ] Spacing is consistent (8px grid)
- [ ] No misaligned elements
- [ ] Shadows appear correct
- [ ] Typography hierarchy clear

### Responsive Testing
- [ ] Mobile (375px - iPhone SE)
- [ ] Tablet (768px - iPad)
- [ ] Desktop (1920px - Desktop)
- [ ] Tested in Chrome DevTools responsive mode

### Interactive Testing
- [ ] Button hover effects work
- [ ] Card hover effects smooth
- [ ] Links navigate correctly
- [ ] Forms submit/validate
- [ ] Dropdowns open/close
- [ ] Animations smooth (no jank)

### Accessibility Testing
- [ ] Tab navigation works
- [ ] Focus visible on all interactive elements
- [ ] Color contrast ≥ 4.5:1
- [ ] Screen reader friendly (test with NVDA/JAWS)
- [ ] No keyboard traps

### Browser Testing
- [ ] Chrome (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Edge (latest)
- [ ] Mobile Safari
- [ ] Chrome Mobile

---

## Common Mistakes to Avoid

❌ **DON'T:**
- Hardcode color values
- Use non-semantic spacing (10px, 13px, etc.)
- Mix old and new components
- Forget aria-labels on icon buttons
- Skip mobile testing
- Use dividers instead of borders
- Forget hover effects
- Ignore focus states
- Use px instead of theme spacing

✅ **DO:**
- Use theme.palette tokens
- Use 8px spacing grid
- Keep styles consistent
- Add accessibility attributes
- Test all breakpoints
- Use alpha transparency
- Add smooth transitions
- Visible focus indicators
- Use theme spacing system

---

## Performance Checklist

- [ ] No new npm packages added
- [ ] Build time similar (< 20s)
- [ ] Bundle size check (using `npm run build`)
- [ ] No console errors
- [ ] No console warnings (except expected)
- [ ] Fast interactions (no lag)

---

## Review Checklist

Before submitting PR:

- [ ] All components use CleanUIComponents or standard MUI
- [ ] No hardcoded colors or spacing
- [ ] Responsive on mobile/tablet/desktop
- [ ] Accessibility standards met
- [ ] No breaking changes
- [ ] Documentation updated if needed
- [ ] Tested in multiple browsers
- [ ] Performance acceptable
- [ ] Code is clean and readable

---

## Documentation

When done:

- [ ] Add JSDoc comments to custom components
- [ ] Update component props documentation
- [ ] Note any deviations from guidelines
- [ ] Document any custom styling decisions
- [ ] Link to relevant guideline sections

---

## Sign-Off

**Screen Name:** ___________________  
**Developer:** ___________________  
**Date:** ___________________  
**Review Status:** ☐ Pending ☐ Approved  

**Reviewed By:** ___________________  
**Notes:**
```
[Add any notes about implementation]
```

---

## Examples of Complete Implementations

### ✅ CollectionDashboard.jsx
- Uses CleanCard for sections
- StatCard for metrics
- Proper spacing and shadows
- Responsive grid layout
- Smooth hover effects

### ✅ AdaptiveNavigationShell.jsx
- Modern navigation styling
- Selected state with borders
- Responsive layouts
- Smooth transitions
- Proper ARIA labels

---

## Resources

- [UI Design Guidelines](./UI_DESIGN_GUIDELINES.md)
- [Quick Reference](./CLEAN_UI_QUICK_REF.md)
- [Component Library](./web/src/components/CleanUIComponents.jsx)
- [Theme Configuration](./web/src/theme/appTheme.js)

---

**Print this checklist** and keep it nearby while refactoring screens!

Last Updated: December 2025
