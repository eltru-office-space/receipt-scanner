const express = require('express');
const multer = require('multer');
const Anthropic = require('@anthropic-ai/sdk');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Store upload in memory (no disk writes needed - this is a test app)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/heic', 'image/webp'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are accepted (JPG, PNG, HEIC, WEBP)'));
    }
  }
});

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

app.use(express.static(path.join(__dirname, 'public')));

// ─── Main scan endpoint ───────────────────────────────────────────────────────
app.post('/api/scan', upload.single('receipt'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No image file uploaded.' });
  }

  const b64 = req.file.buffer.toString('base64');
  const mediaType = req.file.mimetype === 'image/jpg' ? 'image/jpeg' : req.file.mimetype;

  // ── Step 1: Validate it's actually a grocery receipt ──────────────────────
  let validationResult;
  try {
    const validation = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 200,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: b64 } },
          {
            type: 'text',
            text: `Is this image a grocery store receipt? 
            
Grocery receipts come from stores like ShopRite, Stop & Shop, King Kullen, Aldi, Walmart, Trader Joe's, Whole Foods, Target, Costco, BJ's, Wegmans, Key Food, Western Beef, or any supermarket/grocery store.

Reject anything that is NOT a grocery receipt: restaurant bills, Amazon orders, gas station receipts (unless they include a grocery section), clothing store receipts, pharmacy-only receipts, gym receipts, hotel bills, etc.

Also reject if the image is blurry, unreadable, or not a receipt at all.

Respond ONLY with valid JSON:
{
  "is_grocery_receipt": true or false,
  "confidence": "high" or "medium" or "low",
  "store_detected": "store name or null",
  "rejection_reason": "reason if not a grocery receipt, otherwise null"
}`
          }
        ]
      }]
    });

    const raw = validation.content[0].text.replace(/```json|```/g, '').trim();
    validationResult = JSON.parse(raw);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to validate image: ' + err.message });
  }

  if (!validationResult.is_grocery_receipt) {
    return res.status(422).json({
      error: 'not_a_grocery_receipt',
      message: validationResult.rejection_reason || 'This does not appear to be a grocery store receipt.',
      store_detected: null
    });
  }

  // ── Step 2: Full receipt extraction ──────────────────────────────────────
  try {
    const extraction = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: b64 } },
          {
            type: 'text',
            text: `You are an expert grocery receipt parser. Carefully read every detail of this receipt.

This may be from ShopRite (uses "Price Plus" loyalty card), Stop & Shop (uses "GO Rewards" card), King Kullen, Aldi, Walmart, Trader Joe's, Whole Foods, or another grocery store on Long Island, NY.

Extract ALL information and return ONLY valid JSON with no markdown, no explanation:

{
  "store": {
    "name": "full store name",
    "chain": "chain name e.g. ShopRite, Stop and Shop",
    "address": "full address or null",
    "phone": "phone number or null",
    "cashier": "cashier name/number or null",
    "register": "register number or null",
    "transaction_id": "transaction or receipt number or null"
  },
  "date": "date string or null",
  "time": "time string or null",
  "items": [
    {
      "raw_text": "exact text from receipt",
      "name": "clean readable product name (decode abbreviations)",
      "brand": "brand name or null",
      "quantity": 1,
      "unit": "lb / ea / oz / kg / ct or null",
      "weight": null,
      "regular_price": 0.00,
      "sale_price": null,
      "loyalty_price": null,
      "final_price": 0.00,
      "is_on_sale": false,
      "is_loyalty_price": false,
      "is_taxable": false,
      "discount_amount": null,
      "category": "produce / dairy / meat / bakery / frozen / pantry / beverages / household / personal care / deli / other",
      "notes": "any relevant notes like per lb pricing, multipack, etc. or null"
    }
  ],
  "summary": {
    "item_count": 0,
    "subtotal": 0.00,
    "tax": 0.00,
    "tax_rate": null,
    "total": 0.00,
    "loyalty_savings": 0.00,
    "coupon_savings": 0.00,
    "sale_savings": 0.00,
    "total_savings": 0.00,
    "points_earned": null,
    "payment_method": "cash / credit / debit / ebt / split or null",
    "amount_tendered": null,
    "change": null
  },
  "loyalty_program": {
    "program_name": "Price Plus / GO Rewards / null",
    "card_number": "last 4 digits or null",
    "points_balance": null,
    "ytd_savings": null
  },
  "raw_notes": "any other text on the receipt not captured above like store hours, return policy, survey info, etc."
}

IMPORTANT RULES:
- final_price is what the customer actually paid for the item (after all discounts)
- regular_price is the shelf price before any discounts
- loyalty_price is the member/card price specifically
- Decode ALL abbreviations: CHKN BRST = Chicken Breast, WHL MLK = Whole Milk, OJ = Orange Juice, BF = Beef, etc.
- For weighted items (e.g. "1.23 lb @ $2.99/lb"), include weight and calculate final_price
- All prices MUST be numbers, never strings
- Unknown values = null
- Do NOT skip any line items, even if they are discounts, fees, or deposits`
          }
        ]
      }]
    });

    const raw = extraction.content[0].text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(raw);

    return res.json({
      success: true,
      confidence: validationResult.confidence,
      data: parsed
    });

  } catch (err) {
    return res.status(500).json({ error: 'Failed to parse receipt: ' + err.message });
  }
});

// ─── Error handler for multer ─────────────────────────────────────────────────
app.use((err, req, res, next) => {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'Image too large. Maximum size is 10MB.' });
  }
  return res.status(400).json({ error: err.message });
});

app.listen(PORT, () => {
  console.log(`Receipt scanner running on port ${PORT}`);
});
