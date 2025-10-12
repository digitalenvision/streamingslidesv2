# Video and Photo Centering & Margin Fix

## Issue
Videos and photos were not being properly centered, and margins were not being applied correctly on the top and left sides.

## Root Cause
The issue was with how Tailwind classes were interacting with Framer Motion animations. The `max-w-full max-h-full` classes combined with `w-full h-full` on the parent were causing layout issues where:
- Content was not perfectly centered
- Margins were not uniformly applied
- Videos specifically had alignment issues

## Solution
Switched from Tailwind utility classes to inline styles for more precise control over the layout:

### Before
```jsx
<motion.div className="w-full h-full flex items-center justify-center">
  <video className="max-w-full max-h-full object-contain" />
  <img className="max-w-full max-h-full object-contain" />
</motion.div>
```

### After
```jsx
<motion.div 
  className="relative w-full h-full"
  style={{
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  }}
>
  <video style={{
    maxWidth: '100%',
    maxHeight: '100%',
    width: 'auto',
    height: 'auto',
    objectFit: 'contain',
  }} />
  <img style={{
    maxWidth: '100%',
    maxHeight: '100%',
    width: 'auto',
    height: 'auto',
    objectFit: 'contain',
  }} />
</motion.div>
```

## Key Changes

1. **Parent container**: Uses inline `display: flex` with `alignItems: center` and `justifyContent: center`
2. **Media elements**: Use inline styles with explicit `width: auto` and `height: auto`
3. **Object fit**: Explicitly set to `contain` to preserve aspect ratio
4. **Max constraints**: `maxWidth: 100%` and `maxHeight: 100%` ensure content stays within bounds

## Why This Works

1. **Explicit flexbox**: Inline styles take precedence and ensure proper centering
2. **Auto dimensions**: `width: auto` and `height: auto` let the browser calculate optimal size
3. **Max constraints**: Prevent content from overflowing the container
4. **Object-fit contain**: Ensures aspect ratio is maintained while fitting within bounds

## Testing

### Visual Check
1. Go to slideshow preview
2. Check that:
   - Photos are centered vertically and horizontally
   - Videos are centered vertically and horizontally
   - Margin creates even spacing on all sides (top, right, bottom, left)

### Console Check
Open browser console and look for:
```
SlideshowPreview: Margin/spacing applied: 10%
```

### Test Different Margins
Try these margin values in Slideshow Settings:
- **0%**: Content should fill entire screen, perfectly centered
- **5%**: Small even border on all sides
- **10%**: Medium border, content still centered
- **20%**: Large border, content centered in remaining space

### Test Different Aspect Ratios
Test with:
- **Portrait photos** (tall): Should be centered with space on left/right
- **Landscape photos** (wide): Should be centered with space on top/bottom
- **Square photos**: Should be centered perfectly
- **Portrait videos**: Should be centered with space on left/right
- **Landscape videos**: Should be centered with space on top/bottom

## Expected Results

### With 0% Margin
```
┌─────────────────────────────────┐
│                                 │
│    [PHOTO/VIDEO CENTERED]       │
│                                 │
└─────────────────────────────────┘
```

### With 15% Margin
```
┌─────────────────────────────────┐
│                                 │
│   ┌───────────────────────┐     │
│   │                       │     │
│   │  [PHOTO/VIDEO]        │     │
│   │    CENTERED           │     │
│   │                       │     │
│   └───────────────────────┘     │
│                                 │
└─────────────────────────────────┘
```

### Portrait Photo (even with margin)
```
┌─────────────────────────────────┐
│                                 │
│        ┌───────────┐             │
│        │           │             │
│        │  PHOTO    │             │
│        │ CENTERED  │             │
│        │           │             │
│        └───────────┘             │
│                                 │
└─────────────────────────────────┘
```

### Landscape Video (even with margin)
```
┌─────────────────────────────────┐
│                                 │
│  ┌─────────────────────────┐    │
│  │      VIDEO CENTERED     │    │
│  └─────────────────────────┘    │
│                                 │
└─────────────────────────────────┘
```

## Troubleshooting

### Content Still Not Centered
1. Clear browser cache
2. Hard refresh (Cmd+Shift+R or Ctrl+Shift+R)
3. Check browser console for errors
4. Verify margin value in console log

### Margin Only on One Side
1. Check the console log: `Margin/spacing applied: X%`
2. Inspect element in DevTools
3. Verify the container has all four properties: `top`, `left`, `right`, `bottom`
4. Make sure you're looking at preview, not editor

### Video Appears Stretched
1. Check that `objectFit: 'contain'` is applied
2. Verify `width: auto` and `height: auto` are set
3. Video might be corrupted or have incorrect metadata

## Files Modified

- `/src/pages/SlideshowPreview.tsx`: Updated video and image rendering with inline styles for precise centering and margin control

## Related Issues Fixed

This also ensures that:
- Framer Motion transitions work smoothly with proper centering
- Different aspect ratios are handled correctly
- Content never overflows or gets cut off
- Margins are applied uniformly on all sides

