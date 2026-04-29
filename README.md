# Receipt Scanner — Vision Model Test

A grocery receipt scanner powered by Claude Vision. Upload a receipt photo, get full structured breakdown of every item, price, loyalty savings, and totals.

## Supported Stores
ShopRite, Stop & Shop, King Kullen, Aldi, Walmart, Trader Joe's, Whole Foods, Target, Costco, BJ's, Wegmans, Key Food, and any grocery store.

## Features
- Validates image is actually a grocery receipt (rejects restaurants, Amazon, etc.)
- Decodes abbreviations (CHKN BRST → Chicken Breast)
- Separates regular price vs loyalty card price vs sale price
- Detects ShopRite Price Plus and Stop & Shop GO Rewards savings
- Categorizes every item (produce, dairy, meat, frozen, etc.)
- Filterable line items (on sale, loyalty price, taxable)
- Shows total savings breakdown

## Deploy to Railway

1. Push this folder to a GitHub repo
2. Go to railway.app → New Project → Deploy from GitHub repo
3. Select your repo
4. Go to Variables tab → Add variable:
   - Key: `ANTHROPIC_API_KEY`
   - Value: your key from console.anthropic.com
5. Railway auto-deploys. Your URL appears in Settings → Domains.

## Local Development

```bash
npm install
ANTHROPIC_API_KEY=your-key-here node server.js
```
Then open http://localhost:3000
