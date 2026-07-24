import json, urllib.request, time, os

token = os.environ["SHOPIFY_ADMIN_ACCESS_TOKEN"]
store = "ruefour.myshopify.com"
api = f"https://{store}/admin/api/2024-10/graphql.json"

products = [
    ("gid://shopify/Product/9023164219523", "Quiet Luxury", ["D4C5B0","E8DFD0","B8A896","C9BBA8","A69582","DDD3C4"]),
    ("gid://shopify/Product/9023164252291", "Coastal Modern", ["B8CDD6","D6E5EC","8FB3C2","A3C4D1","7BA1B2","C5DAE3"]),
    ("gid://shopify/Product/9023164285059", "Industrial Loft", ["8C7B6B","A69585","6B5A4A","B5A494","7A695A","C4B3A3"]),
    ("gid://shopify/Product/9023164317827", "Japandi Study", ["C8C0B0","DDD6C8","B0A898","E5DFD2","A09888","D2CBB8"]),
    ("gid://shopify/Product/9023164350595", "Art Deco Lounge", ["2C3E50","8E6F3E","1A252F","6B5530","3D5066","A68B5B"]),
    ("gid://shopify/Product/9023164383363", "Mediterranean", ["C4703F","E8B88A","A05A30","D4956A","8B4A25","F0CCA5"]),
]

labels = ["Hero","Detail+1","Detail+2","Accent+1","Accent+2","Texture"]

for pid, name, colors in products:
    media_list = []
    for i, c in enumerate(colors):
        w, h = (1200, 800) if i == 0 else ((800, 600) if i < 3 else (600, 600))
        url = f"https://placehold.co/{w}x{h}/{c}/FFFFFF/png?text={labels[i]}"
        media_list.append({"originalSource": url, "alt": f"{name} {labels[i]}", "mediaContentType": "IMAGE"})

    q = {
        "query": """mutation($pid: ID!, $media: [CreateMediaInput!]!) {
            productCreateMedia(productId: $pid, media: $media) {
                media { alt status }
                mediaUserErrors { field message }
            }
        }""",
        "variables": {"pid": pid, "media": media_list}
    }

    payload = json.dumps(q).encode()
    req = urllib.request.Request(api, data=payload, headers={"X-Shopify-Access-Token": token, "Content-Type": "application/json"})
    resp = urllib.request.urlopen(req)
    result = json.loads(resp.read())
    errs = result.get("data", {}).get("productCreateMedia", {}).get("mediaUserErrors", [])
    media = result.get("data", {}).get("productCreateMedia", {}).get("media", [])
    if errs:
        print(f"ERR {name}: {errs}")
    else:
        print(f"OK  {name}: {len(media)} images")
    time.sleep(0.5)

print("Done!")
