// supabase/functions/create-razorpay-order/index.ts
//
// Creates a Razorpay order SERVER-SIDE. The amount charged is read from the
// `orders` row in the database — never from the browser/localStorage — so a
// customer can no longer edit localStorage to pay less than the real price.
//
// Deploy:   supabase functions deploy create-razorpay-order
// Secrets:  supabase secrets set RAZORPAY_KEY_ID=xxx RAZORPAY_KEY_SECRET=xxx
//
// Call from the browser with:
//   const { data, error } = await client.functions.invoke("create-razorpay-order", {
//     body: { order_id: targetOrderId }
//   });

import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { order_id } = await req.json();
    if (!order_id) {
      return json({ error: "order_id is required" }, 400);
    }

    // Service-role client: bypasses RLS, used ONLY inside this trusted function.
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: order, error: fetchError } = await supabase
      .from("orders")
      .select("id, amount, payment_status")
      .eq("id", order_id)
      .maybeSingle();

    if (fetchError || !order) {
      return json({ error: "Order not found" }, 404);
    }

    if (["success", "paid", "completed", "paid cash"].includes(
      (order.payment_status || "").toLowerCase(),
    )) {
      return json({ error: "Order is already paid" }, 409);
    }

    const amountPaise = Math.round(Number(order.amount) * 100);
    if (!amountPaise || amountPaise <= 0) {
      return json({ error: "Order has no valid amount" }, 400);
    }

    const keyId = Deno.env.get("RAZORPAY_KEY_ID")!;
    const keySecret = Deno.env.get("RAZORPAY_KEY_SECRET")!;

    const rzpResponse = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Basic " + btoa(`${keyId}:${keySecret}`),
      },
      body: JSON.stringify({
        amount: amountPaise,
        currency: "INR",
        receipt: `order_${order.id}`,
        notes: { our_order_id: String(order.id) },
      }),
    });

    if (!rzpResponse.ok) {
      const errText = await rzpResponse.text();
      console.error("Razorpay order creation failed:", errText);
      return json({ error: "Could not create payment order" }, 502);
    }

    const rzpOrder = await rzpResponse.json();

    // Remember the Razorpay order id so verify-razorpay-payment can check
    // the callback actually belongs to THIS order (prevents replay/mixing).
    const { error: updateError } = await supabase
      .from("orders")
      .update({ razorpay_order_id: rzpOrder.id, payment_status: "Processing" })
      .eq("id", order.id);

    if (updateError) {
      console.error("Failed to store razorpay_order_id:", updateError);
    }

    return json({
      key_id: keyId, // public key id — safe to return to the browser
      razorpay_order_id: rzpOrder.id,
      amount: amountPaise,
      currency: "INR",
    });
  } catch (err) {
    console.error(err);
    return json({ error: "Unexpected server error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
