import json, urllib.request, os

store = "ruefour.myshopify.com"
token = os.environ["SHOPIFY_ADMIN_ACCESS_TOKEN"]
menu_id = "gid://shopify/Menu/251733704835"

C = {
    "textiles": "gid://shopify/Collection/446565744771",
    "textiles-upholstery": "gid://shopify/Collection/446565810307",
    "textiles-drapery": "gid://shopify/Collection/446565843075",
    "textiles-sheers": "gid://shopify/Collection/446565908611",
    "textiles-decorative": "gid://shopify/Collection/446565941379",
    "textiles-outdoor": "gid://shopify/Collection/446566039683",
    "textiles-leather": "gid://shopify/Collection/446566006915",
    "wallcovering": "gid://shopify/Collection/446566072451",
    "wallcovering-wallpapers": "gid://shopify/Collection/446566105219",
    "wallcovering-vinyl": "gid://shopify/Collection/446566137987",
    "wallcovering-naturals": "gid://shopify/Collection/446566203523",
    "wallcovering-leather": "gid://shopify/Collection/446566301827",
    "wallcovering-murals": "gid://shopify/Collection/446566269059",
    "wallcovering-hand-painted": "gid://shopify/Collection/446566236291",
    "wallcovering-metallic": "gid://shopify/Collection/446566334595",
    "wallcovering-textures": "gid://shopify/Collection/446566367363",
    "wallcovering-florals": "gid://shopify/Collection/446566432899",
    "wallcovering-geometric": "gid://shopify/Collection/446566465667",
    "wallcovering-animal-skin": "gid://shopify/Collection/446566498435",
    "lighting": "gid://shopify/Collection/446566531203",
    "lighting-ceiling-lights": "gid://shopify/Collection/446566563971",
    "lighting-pendants": "gid://shopify/Collection/446566629507",
    "lighting-flush-mounts": "gid://shopify/Collection/446566662275",
    "lighting-wall-lights": "gid://shopify/Collection/446566727811",
    "lighting-table-lamps": "gid://shopify/Collection/446566760579",
    "lighting-floor-lamps": "gid://shopify/Collection/446566826115",
    "lighting-portable-lamps": "gid://shopify/Collection/446566858883",
    "lighting-bathroom-lighting": "gid://shopify/Collection/446566891651",
    "lighting-outdoor": "gid://shopify/Collection/446566924419",
    "lighting-lampshades": "gid://shopify/Collection/446566957187",
    "lighting-quick-ship": "gid://shopify/Collection/446566989955",
    "lighting-floor-display": "gid://shopify/Collection/446594646147",
    "furniture": "gid://shopify/Collection/446567022723",
    "furniture-living-room": "gid://shopify/Collection/446567055491",
    "furniture-dining-room": "gid://shopify/Collection/446567088259",
    "furniture-bedroom": "gid://shopify/Collection/446567121027",
    "furniture-office": "gid://shopify/Collection/446567153795",
    "furniture-seating": "gid://shopify/Collection/446567219331",
    "furniture-sofas": "gid://shopify/Collection/446567252099",
    "furniture-sectionals": "gid://shopify/Collection/446567284867",
    "furniture-occasional-chairs": "gid://shopify/Collection/446567317635",
    "furniture-dining-chairs": "gid://shopify/Collection/446567350403",
    "furniture-benches-ottomans": "gid://shopify/Collection/446567383171",
    "furniture-stools": "gid://shopify/Collection/446567415939",
    "furniture-beds": "gid://shopify/Collection/446567448707",
    "furniture-tables": "gid://shopify/Collection/446567481475",
    "furniture-bedside-tables": "gid://shopify/Collection/446567514243",
    "furniture-coffee-tables": "gid://shopify/Collection/446567547011",
    "furniture-dining-tables": "gid://shopify/Collection/446567579779",
    "furniture-side-tables": "gid://shopify/Collection/446567612547",
    "furniture-consoles": "gid://shopify/Collection/446567678083",
    "furniture-desks": "gid://shopify/Collection/446567710851",
    "furniture-casegoods": "gid://shopify/Collection/446567743619",
    "furniture-cabinets": "gid://shopify/Collection/446567809155",
    "furniture-sideboards": "gid://shopify/Collection/446567841923",
    "furniture-bars": "gid://shopify/Collection/446596087939",
    "furniture-chests": "gid://shopify/Collection/446596120707",
    "furniture-etagere": "gid://shopify/Collection/446596153475",
    "furniture-credenza": "gid://shopify/Collection/446596186243",
    "furniture-quick-ship": "gid://shopify/Collection/446567874691",
    "furniture-floor-display": "gid://shopify/Collection/446567940227",
    "rugs": "gid://shopify/Collection/446567972995",
    "rugs-quick-ship": "gid://shopify/Collection/446568038531",
    "rugs-floor-display": "gid://shopify/Collection/446594678915",
    "accessories": "gid://shopify/Collection/446568136835",
    "accessories-cushions": "gid://shopify/Collection/446568235139",
    "accessories-mirrors": "gid://shopify/Collection/446568267907",
    "accessories-throws": "gid://shopify/Collection/446568202371",
    "accessories-floor-display": "gid://shopify/Collection/446594711683",
    "quick-ship": "gid://shopify/Collection/446568366211",
    "designers": "gid://shopify/Collection/446568398979",
    "arte": "gid://shopify/Collection/446568431747",
    "carlucci": "gid://shopify/Collection/446568464515",
    "chivasso": "gid://shopify/Collection/446568497283",
    "cmo": "gid://shopify/Collection/446568530051",
    "de-le-cuona": "gid://shopify/Collection/446568595587",
    "elitis": "gid://shopify/Collection/446568628355",
    "fabricut": "gid://shopify/Collection/446568661123",
    "jab": "gid://shopify/Collection/446568693891",
    "jennifer-shorto": "gid://shopify/Collection/446568726659",
    "porta-romana": "gid://shopify/Collection/446568759427",
    "s-harris": "gid://shopify/Collection/446568792195",
    "trend": "gid://shopify/Collection/446568824963",
}

P = {
    "vibe-studio": "gid://shopify/Page/114680365187",
    "moodboards": "gid://shopify/Page/114688065667",
}

def col(title, handle):
    return {"title": title, "type": "COLLECTION", "resourceId": C[handle]}

def http(title, url):
    return {"title": title, "type": "HTTP", "url": "https://ruefour.myshopify.com" + url}

def page(title, handle):
    return {"title": title, "type": "PAGE", "resourceId": P[handle]}

items = [
    # TEXTILES (flat list, no sub-groups)
    {**col("Textiles", "textiles"), "items": [
        col("All Textiles", "textiles"),
        col("Upholstery", "textiles-upholstery"),
        col("Drapery", "textiles-drapery"),
        col("Sheers", "textiles-sheers"),
        col("Decorative", "textiles-decorative"),
        col("Leather", "textiles-leather"),
        col("Outdoor", "textiles-outdoor"),
    ]},

    # WALLCOVERING
    {**col("Wallcovering", "wallcovering"), "items": [
        col("All Wallcovering", "wallcovering"),
        {**col("Shop By Material", "wallcovering"), "items": [
            col("Wallpapers", "wallcovering-wallpapers"),
            col("Vinyl", "wallcovering-vinyl"),
            col("Naturals", "wallcovering-naturals"),
            col("Hand Painted", "wallcovering-hand-painted"),
            col("Murals", "wallcovering-murals"),
            col("Leather", "wallcovering-leather"),
            col("Metallic", "wallcovering-metallic"),
        ]},
        {**col("Shop By Design", "wallcovering"), "items": [
            col("Textures", "wallcovering-textures"),
            col("Florals", "wallcovering-florals"),
            col("Geometric", "wallcovering-geometric"),
            col("Animal / Skin", "wallcovering-animal-skin"),
        ]},
    ]},

    # LIGHTING (flat list)
    {**col("Lighting", "lighting"), "items": [
        col("All Lighting", "lighting"),
        col("Ceiling Lights", "lighting-ceiling-lights"),
        col("Pendants", "lighting-pendants"),
        col("Flush Mounts", "lighting-flush-mounts"),
        col("Wall Lights", "lighting-wall-lights"),
        col("Table Lamps", "lighting-table-lamps"),
        col("Floor Lamps", "lighting-floor-lamps"),
        col("Portable Lamps", "lighting-portable-lamps"),
        col("Bathroom Lighting", "lighting-bathroom-lighting"),
        col("Outdoor", "lighting-outdoor"),
        col("Lampshades", "lighting-lampshades"),
        col("Quick Ship", "lighting-quick-ship"),
        col("Floor Display", "lighting-floor-display"),
    ]},

    # FURNITURE
    {**col("Furniture", "furniture"), "items": [
        col("All Furniture", "furniture"),
        {**col("Shop By Room", "furniture"), "items": [
            col("Living Room", "furniture-living-room"),
            col("Dining Room", "furniture-dining-room"),
            col("Bedroom", "furniture-bedroom"),
            col("Office", "furniture-office"),
        ]},
        {**col("Seating", "furniture-seating"), "items": [
            col("Sofas", "furniture-sofas"),
            col("Sectionals", "furniture-sectionals"),
            col("Occasional Chairs", "furniture-occasional-chairs"),
            col("Dining Chairs", "furniture-dining-chairs"),
            col("Benches & Ottomans", "furniture-benches-ottomans"),
            col("Stools", "furniture-stools"),
            col("Beds", "furniture-beds"),
        ]},
        {**col("Tables", "furniture-tables"), "items": [
            col("Bedside Tables", "furniture-bedside-tables"),
            col("Coffee Tables", "furniture-coffee-tables"),
            col("Dining Tables", "furniture-dining-tables"),
            col("Side Tables", "furniture-side-tables"),
            col("Consoles", "furniture-consoles"),
            col("Desks", "furniture-desks"),
        ]},
        {**col("Casegoods", "furniture-casegoods"), "items": [
            col("Cabinets", "furniture-cabinets"),
            col("Sideboards", "furniture-sideboards"),
            col("Bars", "furniture-bars"),
            col("Chests", "furniture-chests"),
            col("Bedside Tables", "furniture-bedside-tables"),
            col("Coffee Tables", "furniture-coffee-tables"),
            col("Dining Tables", "furniture-dining-tables"),
            col("Side Tables", "furniture-side-tables"),
            col("Etagere", "furniture-etagere"),
            col("Desks", "furniture-desks"),
            col("Credenza", "furniture-credenza"),
        ]},
        col("Quick Ship", "furniture-quick-ship"),
        col("Floor Display", "furniture-floor-display"),
    ]},

    # RUGS
    {**col("Rugs", "rugs"), "items": [
        col("All Rugs", "rugs"),
        col("Shop By Size", "rugs"),
        col("Quick Ship", "rugs-quick-ship"),
        col("Floor Display", "rugs-floor-display"),
    ]},

    # ACCESSORIES
    {**col("Accessories", "accessories"), "items": [
        col("Cushions", "accessories-cushions"),
        col("Mirrors", "accessories-mirrors"),
        col("Throws", "accessories-throws"),
        col("Floor Display", "accessories-floor-display"),
    ]},

    # SHOP THE VIBE (no submenu)
    page("Shop The Vibe", "vibe-studio"),

    # DESIGNERS
    {**col("Designers", "designers"), "items": [
        col("All Designers", "designers"),
        col("Arte", "arte"),
        col("Carlucci", "carlucci"),
        col("Chivasso", "chivasso"),
        col("CMO", "cmo"),
        col("de Le Cuona", "de-le-cuona"),
        col("Élitis", "elitis"),
        col("FABRICUT", "fabricut"),
        col("JAB", "jab"),
        col("Jennifer Shorto", "jennifer-shorto"),
        col("Porta Romana", "porta-romana"),
        col("S.HARRIS", "s-harris"),
        col("TREND", "trend"),
    ]},

    # QUICK SHIP (no submenu)
    col("Quick Ship", "quick-ship"),
]

mutation = """mutation menuUpdate($id: ID!, $title: String!, $items: [MenuItemUpdateInput!]!) {
  menuUpdate(id: $id, title: $title, items: $items) {
    menu { id title }
    userErrors { field message }
  }
}"""

variables = {"id": menu_id, "title": "Main Menu", "items": items}
payload = json.dumps({"query": mutation, "variables": variables})
req = urllib.request.Request(
    f"https://{store}/admin/api/2024-01/graphql.json",
    data=payload.encode(),
    headers={"Content-Type": "application/json", "X-Shopify-Access-Token": token},
)
with urllib.request.urlopen(req) as resp:
    result = json.loads(resp.read())
    print(json.dumps(result, indent=2))
