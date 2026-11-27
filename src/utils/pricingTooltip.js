// src/utils/pricingTooltip.js
// ─────────────────────────────────────────────────────────────
// Builds the lines shown in the "Recommended SP" tooltips (Intelligence table,
// Basic table, Take-Action modal) from ONE shape, so all three always say the
// same thing.
//
// Shape of `b` (all numbers, percent values are whole percents):
//   { gstPct, cobPct, marginPct, shopifyFeePct, gatewayPct,
//     packingCost, shippingCost (null = no weight data yet), weightKg }
// ─────────────────────────────────────────────────────────────

const rs = (n) => '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 });

// Table rows (/api/recommendations, /api/internal-recommendations) → shape above
export function rowToBreakdown(row) {
  if (!row || row.GSTPct == null) return null;
  return {
    gstPct       : row.GSTPct,
    cobPct       : row.COBPct,
    marginPct    : row.MarginPct,
    shopifyFeePct: row.ShopifyFeePct,
    gatewayPct   : row.GatewayPct,
    packingCost  : row.PackingCost,
    shippingCost : row.ShippingCost,
    weightKg     : row.WeightKg,
  };
}

// Take-Action modal (pricingBreakdown from /api/insights/take-action) → shape above
export function modalToBreakdown(pb) {
  if (!pb) return null;
  return {
    gstPct       : pb.gstPct,
    cobPct       : pb.costOfBusinessPct,
    marginPct    : pb.profitMarginPct,
    shopifyFeePct: pb.shopifyFeePct,
    gatewayPct   : pb.paymentGatewayPct,
    packingCost  : pb.packingCost,
    shippingCost : pb.shippingCost,
    weightKg     : pb.weightKg,
  };
}

export function pricingBreakdownLines(b) {
  if (!b) return [];
  const lines = [`GST ${b.gstPct}% · COB ${b.cobPct}% · Margin ${b.marginPct}%`];

  if (b.shopifyFeePct != null && b.gatewayPct != null) {
    lines.push(`Shopify fee ${b.shopifyFeePct}% · Payment gateway ${b.gatewayPct}% (of selling price)`);
  }
  if (b.packingCost != null) {
    lines.push(`Packing ${rs(b.packingCost)}`);
  }
  lines.push(
    b.shippingCost != null
      ? `Shipping ${rs(b.shippingCost)}${b.weightKg != null ? ` (${b.weightKg} kg)` : ''}`
      : 'Shipping not included yet (no weight data)'
  );
  return lines;
}