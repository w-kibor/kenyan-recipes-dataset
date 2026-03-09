import pandas as pd
import os
import re

def normalize_name(name):
    # Remove special characters, handle extra spaces, lower case
    name = str(name).lower()
    name = re.sub(r'[^a-z0-9]', '', name)
    return name

def main():
    df = pd.read_csv('Recipes_with_Images.csv')
    
    # Get all images in the images directory
    image_dir = 'images'
    image_files = os.listdir(image_dir)
    
    # Build a dictionary of normalized name to actual path
    image_map = {}
    for f in image_files:
        if f.lower().endswith(('.png', '.jpg', '.jpeg', '.webp')):
            name_without_ext = os.path.splitext(f)[0]
            norm_name = normalize_name(name_without_ext)
            image_map[norm_name] = os.path.join(image_dir, f)
            
    # Update the missing images
    updated_count = 0
    missing_count = 0
    for idx, row in df.iterrows():
        if pd.isna(row['image_path']) or row['image_path'] == '':
            title = row['title']
            norm_title = normalize_name(title)
            
            if norm_title in image_map:
                df.at[idx, 'image_path'] = image_map[norm_title]
                updated_count += 1
            else:
                # Try simple variations
                found = False
                for img_norm, img_path in image_map.items():
                    if img_norm in norm_title or norm_title in img_norm:
                        df.at[idx, 'image_path'] = img_path
                        updated_count += 1
                        found = True
                        break
                
                if not found:
                    missing_count += 1
                    print(f"Could not find image for: {title} (Normalized: {norm_title})")
                    
    df.to_csv('Recipes_with_Images.csv', index=False)
    print(f"Successfully updated {updated_count} records. Still missing: {missing_count}.")

if __name__ == '__main__':
    main()
