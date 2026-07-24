import json, urllib.request, os

store = "ruefour.myshopify.com"
token = os.environ.get("SHOPIFY_ADMIN_ACCESS_TOKEN")

collections_to_create = [
    {"title": "Lighting - Floor Display", "handle": "lighting-floor-display", "tag": "category:lighting"},
    {"title": "Rugs - Floor Display", "handle": "rugs-floor-display", "tag": "category:rugs"},
    {"title": "Accessories - Floor Display", "handle": "accessories-floor-display", "tag": "category:accessories"},
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
                    {"column": "TAG", "relation": "EQUALS", "condition": c["tag"]},
                    {"column": "TAG", "relation": "EQUALS", "condition": "floor-display"},
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
