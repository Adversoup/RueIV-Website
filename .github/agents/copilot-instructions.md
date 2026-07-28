# RueIV Website — Project Guidelines

## What This Workspace Is
This workspace contains the **Modiva theme** for **ruefour.myshopify.com**. 
- Shopify theme files in `theme/`, `assets/`, `config/`
- Scripts in `scripts/` (Node.js + Python)
- NO other stores or themes here.

## Architecture
- **Theme:** Modiva-based custom Shopify theme
- **Scripts:** Node.js (Shopify Admin API via fetch) and Python (data import/export)
- **Config:** `.env` for store-specific secrets (SHOPIFY_STORE, SHOPIFY_ADMIN_ACCESS_TOKEN)
- **Theme files:** `theme/layout/`, `theme/sections/`, `theme/snippets/`, `theme/templates/`, `theme/assets/`

## Conventions
- **NEVER hardcode tokens** — always use `process.env.SHOPIFY_ADMIN_ACCESS_TOKEN` or `os.environ.get("SHOPIFY_ADMIN_ACCESS_TOKEN")`
- Shopify Liquid: filters can't be used inside `if`/`unless`. Always `assign` filtered value to a variable first.
- Scripts go in `scripts/` with `require('dotenv').config()` at the top.
- Python scripts go in `scripts/` or `tmp/` with `os.environ.get()` from `.env`.

## Commands
- `shopify theme dev` — local theme development
- `shopify theme push` — deploy theme
- Run scripts: `node scripts/xxx.js` or `python scripts/xxx.py`