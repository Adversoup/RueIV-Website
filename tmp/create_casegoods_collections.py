import json, urllib.request, os

store = "ruefour.myshopify.com"
token = os.environ.get("SHOPIFY_ADMIN_ACCESS_TOKEN")

collections_to_create = [
    {"title": "Furniture - Bars", "handle": "furniture-bars", "tag": "subcategory:bars"},
    {"title": "Furniture - Chests", "handle": "furniture-chests", "tag": "subcategory:chests"},
    {"title": "Furniture - Etagere", "handle": "furniture-etagere", "tag": "subcategory:etagere"},
    {"title": "Furniture - Credenza", "handle": "furniture-credenza", "tag": "subcategory:credenza"},
]

mutation = """mutation collectionCreate($input: CollectionInput!) {
  collectionCreate(input: $input) {
    collection { id title handle }
    userErrors { field message }
  }
}"""

for c in collections_to_create:
    variables = {
        "input": {
            "title": c["title"],
            "handle": c["handle"],
            "ruleSet": {
                "appliedDisjunctively": False,
                "rules": [
                    {"column": "TAG", "relation": "EQUALS", "condition": "category:furniture"},
                    {"column": "TAG", "relation": "EQUALS", "condition": c["tag"]},
                ]
            }
        }
    }
    payload = json.dumps({"query": mutation, "variables": variables})
    req = urllib.request.Request(
        f"https://{store}/admin/api/2024-10/graphql.json",
        data=payload.encode(),
        headers={"Content-Type": "application/json", "X-Shopify-Access-Token": token},
    )
    with urllib.request.urlopen(req) as resp:
        result = json.loads(resp.read())
        d = result.get("data", {}).get("collectionCreate", {})
        coll = d.get("collection")
        errs = d.get("userErrors")
        if coll:
            print(f"Created: {coll['title']} -> {coll['id']} (handle: {coll['handle']})")
        if errs and len(errs) > 0:
            print(f"Errors for {c['title']}: {errs}")
