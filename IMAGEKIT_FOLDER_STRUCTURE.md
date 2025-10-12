# ImageKit Folder Structure

## Overview
All uploaded media (photos and videos) are now organized in a hierarchical folder structure in ImageKit for better organization and management.

## Folder Structure

```
ImageKit Root
├── {userId}/
│   ├── {slideshowName}/
│   │   ├── {streamName}/
│   │   │   ├── photo1.jpg
│   │   │   ├── photo2.jpg
│   │   │   └── video1.mp4
│   │   ├── {anotherStreamName}/
│   │   │   └── photo3.jpg
│   ├── {anotherSlideshowName}/
│   │   └── {streamName}/
│   │       └── photo4.jpg
```

## Example

For a user with ID `36b4e4fc-842c-40ed-a950-62c23708c6c3` who creates:
- Slideshow: "Summer Vacation 2024"
- Stream: "Beach Photos"

The folder path will be:
```
36b4e4fc-842c-40ed-a950-62c23708c6c3/Summer-Vacation-2024/Beach-Photos/
```

## Folder Name Sanitization

Folder names are automatically sanitized to be ImageKit-compatible:
- **Special characters removed**: Only `a-z`, `A-Z`, `0-9`, `-`, `_` allowed
- **Spaces converted**: Spaces become hyphens (`-`)
- **Multiple hyphens**: Collapsed to single hyphen

### Examples:
| Original Name | Sanitized Name |
|---------------|----------------|
| `Summer Vacation 2024` | `Summer-Vacation-2024` |
| `John's Photos!!!` | `Johns-Photos` |
| `My   Slideshow---Test` | `My-Slideshow-Test` |

## Duplicate Handling

### File Names
- **Automatic**: ImageKit's `useUniqueFileName: true` automatically appends unique identifiers to duplicate file names
- Example: `photo.jpg` → `photo_xyz123.jpg`

### Folder Names
- **No conflict**: Multiple slideshows can have the same name because they're under different user IDs
- **Same user, same name**: ImageKit allows multiple folders with the same name as long as files within them are unique
- Example: A user can have two slideshows both named "Vacation" and they will coexist as separate folders

## Benefits

### 1. **Organization**
- Easy to find specific content
- Clear ownership (user ID)
- Logical grouping (slideshow → stream)

### 2. **Deletion**
- Delete entire slideshow → deletes `userId/slideshowName/` folder
- Delete specific stream → deletes `userId/slideshowName/streamName/` folder
- Clean structure makes bulk operations easier

### 3. **Debugging**
- Easy to inspect in ImageKit dashboard
- Can quickly identify which user owns what content
- Can trace files back to their slideshow/stream

### 4. **Permissions & Management**
- Can set folder-level permissions if needed
- Easy to export/backup specific slideshows
- Can monitor storage per user

## Migration

### Old Uploads
Files uploaded before this update are in flat folders:
- `user_{userId}/photos/`
- `slideshows/`

### New Uploads
All new uploads use the new structure:
- `{userId}/{slideshowName}/{streamName}/`

### No Breaking Changes
- Old files still work perfectly
- URLs remain valid
- Gradual migration as users upload new content

## Code Implementation

### Upload Function
```typescript
// Fetches slideshow and stream info
const { data: stream } = await supabase
  .from('streams')
  .select('title, slideshow_id, slideshows(title)')
  .eq('id', streamId)
  .single();

// Generates folder path
const folder = generateFolderPath(
  userId,
  slideshowTitle,
  streamTitle
);

// Uploads to ImageKit
await uploadToImageKit(file, folder);
```

### Folder Path Generator
```typescript
export function generateFolderPath(
  userId: string,
  slideshowName: string,
  streamName: string
): string {
  const sanitizedSlideshow = sanitizeFolderName(slideshowName);
  const sanitizedStream = sanitizeFolderName(streamName);
  
  return `${userId}/${sanitizedSlideshow}/${sanitizedStream}`;
}
```

## ImageKit Dashboard

To view your folder structure in ImageKit:
1. Login to [ImageKit Dashboard](https://imagekit.io/dashboard)
2. Go to **Media Library**
3. Navigate through folders: `userId` → `SlideshowName` → `StreamName`

## Storage Path in Database

The `storage_path` field in the database stores the full path:
```
{userId}/{slideshowName}/{streamName}/filename_xyz123.jpg
```

This allows for:
- Direct file identification
- Easy deletion via path
- Reconstruction of folder hierarchy

## Future Enhancements

Possible future improvements:
- Folder-level CDN caching rules
- Per-slideshow access permissions
- Bulk export by slideshow
- Storage analytics per slideshow
- Automatic folder cleanup for deleted slideshows

