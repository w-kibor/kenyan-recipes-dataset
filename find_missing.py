import pandas as pd
df = pd.read_csv('Recipes_with_Images.csv')
missing = df[df['image_path'].isna() | (df['image_path'] == '')]
with open(r'c:\Users\ELITEBOOK\.gemini\antigravity\brain\861d9408-8b5a-4b9b-a19e-257bb612f797\missing_recipes.md', 'w', encoding='utf-8') as f:
    f.write('# Recipes Missing Images\n\n')
    f.write('Here is the list of recipes that could not be automatically matched with a high-quality online image. You can manually find images for these and add their paths to `Recipes_with_Images.csv`.\n\n')
    for idx, row in missing.iterrows():
        title = str(row['title']).strip().replace('\n', ' ').replace('\r', ' ')
        f.write(f'- [ ] **{title}**\n')
print("Successfully wrote missing_recipes.md")
