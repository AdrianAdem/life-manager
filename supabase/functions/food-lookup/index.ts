// Food Lookup Edge Function
// Layer 1: Barcode → OpenFoodFacts
// Layer 2: Text search → OpenFoodFacts
// Layer 3: AI freitext → Claude Haiku

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const OFF_BASE = "https://world.openfoodfacts.org";
const OFF_SEARCH = "https://world.openfoodfacts.net/cgi/search.pl";

interface OFFProduct {
  code?: string;
  product_name?: string;
  brands?: string;
  nutriments?: Record<string, number>;
  serving_size?: string;
}

function extractNutrients(p: OFFProduct) {
  const n = p.nutriments ?? {};
  return {
    calories: Math.round(n["energy-kcal_100g"] ?? n["energy-kcal"] ?? 0),
    protein: Math.round((n["proteins_100g"] ?? 0) * 10) / 10,
    carbs: Math.round((n["carbohydrates_100g"] ?? 0) * 10) / 10,
    fat: Math.round((n["fat_100g"] ?? 0) * 10) / 10,
    fiber: Math.round((n["fiber_100g"] ?? 0) * 10) / 10,
  };
}

// Barcode lookup
async function handleBarcode(barcode: string) {
  const res = await fetch(
    `${OFF_BASE}/api/v2/product/${barcode}?fields=code,product_name,brands,nutriments,serving_size`,
    { headers: { "User-Agent": "LifeManager/1.0" } }
  );
  if (!res.ok) return { found: false };
  const data = await res.json();
  if (data.status !== 1 || !data.product) return { found: false };
  const p = data.product as OFFProduct;
  const nutrients = extractNutrients(p);
  return {
    found: true,
    food: {
      id: p.code ?? barcode,
      name: p.product_name ?? "Unbekannt",
      brand: p.brands ?? null,
      servings: [{
        id: "100g",
        description: "100g",
        metricAmount: 100,
        metricUnit: "g",
        ...nutrients,
      }],
    },
  };
}

// Text search
async function handleSearch(query: string, page = 0) {
  const params = new URLSearchParams({
    search_terms: query,
    search_simple: "1",
    action: "process",
    json: "1",
    page_size: "20",
    page: String(page + 1),
    fields: "code,product_name,brands,nutriments",
  });
  const res = await fetch(`${OFF_SEARCH}?${params}`, {
    headers: { "User-Agent": "LifeManager/1.0" },
  });
  if (!res.ok) return { results: [], totalResults: 0 };
  const data = await res.json();
  const products = (data.products ?? []) as OFFProduct[];
  return {
    results: products
      .filter((p) => p.product_name)
      .map((p) => {
        const n = extractNutrients(p);
        return {
          id: p.code ?? "",
          name: p.product_name ?? "",
          brand: p.brands ?? null,
          description: `${n.calories} kcal · P${n.protein}g · K${n.carbs}g · F${n.fat}g pro 100g`,
        };
      }),
    totalResults: data.count ?? 0,
  };
}

// Get food details
async function handleFood(foodId: string) {
  const res = await fetch(
    `${OFF_BASE}/api/v2/product/${foodId}?fields=code,product_name,brands,nutriments,serving_size`,
    { headers: { "User-Agent": "LifeManager/1.0" } }
  );
  if (!res.ok) return { found: false };
  const data = await res.json();
  if (data.status !== 1 || !data.product) return { found: false };
  const p = data.product as OFFProduct;
  const nutrients = extractNutrients(p);
  return {
    found: true,
    food: {
      id: p.code ?? foodId,
      name: p.product_name ?? "Unbekannt",
      brand: p.brands ?? null,
      servings: [{
        id: "100g",
        description: "100g",
        metricAmount: 100,
        metricUnit: "g",
        ...nutrients,
      }],
    },
  };
}

// AI parse via Claude Haiku
async function handleAI(text: string) {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-20250414",
      max_tokens: 1024,
      messages: [{
        role: "user",
        content: `Parse this food description into individual items with nutritional estimates per item.
Return ONLY a JSON array, no markdown, no explanation.
Each item: { "name": string, "amount_g": number, "calories": number, "protein_g": number, "carbs_g": number, "fat_g": number }

Food description: "${text}"`,
      }],
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Claude API error: ${res.status} ${err}`);
  }
  const data = await res.json();
  const content = data.content?.[0]?.text ?? "[]";
  const match = content.match(/\[[\s\S]*\]/);
  return match ? JSON.parse(match[0]) : [];
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  try {
    const url = new URL(req.url);
    const path = url.pathname.split("/").pop();
    const body = await req.json();
    let result;
    switch (path) {
      case "barcode": result = await handleBarcode(body.barcode); break;
      case "search": result = await handleSearch(body.query, body.page ?? 0); break;
      case "food": result = await handleFood(body.food_id); break;
      case "ai": result = await handleAI(body.text); break;
      default:
        return new Response(JSON.stringify({ error: "Unknown endpoint" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
