import pandas as pd
import requests
import os
import time
from ddgs import DDGS
import re
import warnings

warnings.filterwarnings('ignore')

input_csv = "RecipesImp.csv"
output_csv = "Recipes_with_Images.csv"
images_dir = "images"

os.makedirs(images_dir, exist_ok=True)
print(f"Reading {input_csv}...")
df = pd.read_csv(input_csv)

def clean_filename(title):
    # Remove chars that aren't alphanumeric or spaces/hyphens
    # Also replace newlines with space
    title_str = str(title).replace('\n', ' ').replace('\r', ' ')
    clean = re.sub(r'[^a-zA-Z0-9\s\-]', '', title_str)
    # squish spaces and replace with underscore
    clean = re.sub(r'\s+', '_', clean).strip('_')
    return clean

def fetch_image_url(query):
    for attempt in range(4):
        try:
            results = DDGS().images(query, max_results=1)
            if results and len(results) > 0:
                return results[0]['image']
            break # if no results but no error, break
        except Exception as e:
            err_msg = str(e)
            print(f"  [DDG Error: {err_msg[:50]}...]")
            if "403" in err_msg or "Ratelimit" in err_msg:
                sleep_time = 10 * (attempt + 1)
                print(f"  [Rate limited. Sleeping {sleep_time}s...]")
                time.sleep(sleep_time)
            else:
                break
    return None

def download_image(url, filepath):
    try:
        headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'}
        response = requests.get(url, headers=headers, stream=True, timeout=10)
        if response.status_code == 200:
            with open(filepath, 'wb') as f:
                for chunk in response.iter_content(1024):
                    f.write(chunk)
            return True
        else:
            print(f"  [Fetch failed: {response.status_code}]")
    except Exception as e:
        print(f"  [Download exception: {str(e)[:50]}]")
    return False

image_paths = []

print(f"Starting to process {len(df)} recipes...")
for index, row in df.iterrows():
    title = row['title']
    safe_title = clean_filename(title)
    
    # Keep recipe name under reasonable length
    if len(safe_title) > 50:
        safe_title = safe_title[:50]
        
    image_filename = f"{safe_title}.jpg"
    image_filepath = os.path.join(images_dir, image_filename)
    relative_path = f"images/{image_filename}"
    
    # For query, remove weird newlines and parentheses
    clean_query = str(title).replace('\n', ' ').replace('\r', ' ')
    clean_query = re.sub(r'\(.*?\)', '', clean_query).strip()
    
    print(f"[{index+1}/{len(df)}] {clean_query}")
    
    if os.path.exists(image_filepath):
        print(f"  -> Exists: {image_filename}")
        image_paths.append(relative_path)
        continue

    query = f"{clean_query} recipe image"
    image_url = fetch_image_url(query)
    
    if image_url:
        success = download_image(image_url, image_filepath)
        if success:
            print(f"  -> Saved: {image_filename}")
            image_paths.append(relative_path)
            time.sleep(3)
        else:
            print(f"  -> Failed to download")
            image_paths.append("")
            time.sleep(2)
    else:
        print(f"  -> No image found.")
        image_paths.append("")
        time.sleep(3) 

df['image_path'] = image_paths
df.to_csv(output_csv, index=False)
print(f"Done! Saved combined dataset to {output_csv}")
