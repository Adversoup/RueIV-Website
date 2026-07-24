import json, urllib.request, os
from collections import Counter

store = "ruefour.myshopify.com"
token = os.environ.get("SHOPIFY_ADMIN_ACCESS_TOKEN")

url = f"https://{store}/admin/api/2024-10/graphql.json"
headers = {"Content-Type": "application/json", "X-Shopify-Access-Token": token}

cursor = None
all_products = []
page = 0

while True:
    page += 1
    after = f', after: "{cursor}"' if cursor else ""
    query = f"""{{
      products(first: 250{after}) {{
        edges {{
          cursor
          node {{
            id
            title
            handle
            vendor
            productType
          }}
        }}
        pageInfo {{ hasNextPage }}
      }}
    }}"""
    
    req = urllib.request.Request(url, data=json.dumps({"query": query}).encode(), headers=headers)
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read())
    
    edges = data["data"]["products"]["edges"]
    for e in edges:
        n = e["node"]
        all_products.append({
            "id": n["id"],
            "title": n["title"],
            "handle": n["handle"],
            "vendor": n["vendor"],
            "type": n["productType"],
        })
    
    if not data["data"]["products"]["pageInfo"]["hasNextPage"]:
        break
    cursor = edges[-1]["cursor"]
    
    if page % 20 == 0:
        print(f"  Fetched {len(all_products)} products so far...")

print(f"\nTotal products fetched: {len(all_products)}")

# Check for duplicate handles
handle_counts = Counter(p["handle"] for p in all_products)
dupes = {h: c for h, c in handle_counts.items() if c > 1}

if dupes:
    print(f"\n=== DUPLICATE HANDLES: {len(dupes)} ===")
    # Sort by count descending
    for handle, count in sorted(dupes.items(), key=lambda x: -x[1])[:50]:
        products = [p for p in all_products if p["handle"] == handle]
        print(f"\n  '{handle}' appears {count} times:")
        for p in products[:5]:
            print(f"    {p['id']} | {p['title']} | {p['vendor']}")
        if count > 5:
            print(f"    ... and {count - 5} more")
else:
    print("\nNo duplicate handles found.")

# Check for duplicate titles
title_counts = Counter(p["title"] for p in all_products)
title_dupes = {t: c for t, c in title_counts.items() if c > 1}
print(f"\n=== DUPLICATE TITLES: {len(title_dupes)} ===")
if title_dupes:
    for title, count in sorted(title_dupes.items(), key=lambda x: -x[1])[:30]:
        products = [p for p in all_products if p["title"] == title]
        print(f"\n  '{title}' x{count} | vendors: {set(p['vendor'] for p in products)}")
        for p in products[:3]:
            print(f"    {p['id']} | handle: {p['handle']}")
        if count > 3:
            print(f"    ... and {count - 3} more")

# Summary by vendor
print("\n=== PRODUCTS BY VENDOR ===")
vendor_counts = Counter(p["vendor"] for p in all_products)
for v, c in sorted(vendor_counts.items(), key=lambda x: -x[1]):
    print(f"  {v}: {c}")
