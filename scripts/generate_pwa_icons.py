import os
from PIL import Image

def generate_icons():
    # Use the sharp-cli trimmed logo as the source
    trimmed_path = r"d:\Projects\exp\openrelay\public\trimmed_logo.png"
    public_dir = r"d:\Projects\exp\openrelay\public"
    
    if not os.path.exists(trimmed_path):
        print(f"Error: Trimmed logo file not found at {trimmed_path}")
        return

    print(f"Loading trimmed logo from {trimmed_path}")
    with Image.open(trimmed_path) as img:
        img = img.convert("RGBA")
        
        # 1. Generate icon-192.png
        icon_192 = img.resize((192, 192), Image.Resampling.LANCZOS)
        icon_192.save(os.path.join(public_dir, "icon-192.png"), "PNG")
        print("Generated icon-192.png")
        
        # 2. Generate icon-512.png
        icon_512 = img.resize((512, 512), Image.Resampling.LANCZOS)
        icon_512.save(os.path.join(public_dir, "icon-512.png"), "PNG")
        print("Generated icon-512.png")
        
        # 3. Generate icon-maskable.png (add extra black background padding for safe OS masking)
        maskable_size = 512
        inner_size = 384
        
        # Create solid black background
        bg_color = (0, 0, 0, 255)
        maskable = Image.new("RGBA", (maskable_size, maskable_size), bg_color)
        
        # Resize original transparent trimmed logo to fit in the safe area
        inner_img = img.resize((inner_size, inner_size), Image.Resampling.LANCZOS)
        
        # Paste in center using alpha channel as mask
        offset = (maskable_size - inner_size) // 2
        maskable.paste(inner_img, (offset, offset), inner_img)
        
        maskable.save(os.path.join(public_dir, "icon-maskable.png"), "PNG")
        print("Generated icon-maskable.png")

if __name__ == "__main__":
    generate_icons()
