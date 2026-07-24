// supabase/functions/verify-razorpay-payment/index.ts
//
// This is the ONLY place in the whole app allowed to mark an order
// "Success". It recomputes Razorpay's HMAC signature server-side using the
// secret key (which never touches the browser) and only writes to the
// database if it matches. The browser can no longer forge a "paid" status.
//
// Deploy:  supabase functions deploy verify-razorpay-payment
// Secrets: reuses RAZORPAY_KEY_SECRET set for create-razorpay-order

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
    const {
      order_id,
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    } = await req.json();

    if (!order_id || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return json({ error: "Missing required fields" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Make sure this callback actually belongs to the order it claims to.
    const { data: order, error: fetchError } = await supabase
      .from("orders")
      .select("id, razorpay_order_id, payment_status")
      .eq("id", order_id)
      .maybeSingle();

    if (fetchError || !order) {
      return json({ error: "Order not found" }, 404);
    }
    if (order.razorpay_order_id !== razorpay_order_id) {
      return json({ error: "Order/payment mismatch" }, 400);
    }

    const expectedSignature = await hmacSha256Hex(
      `${razorpay_order_id}|${razorpay_payment_id}`,
      Deno.env.get("RAZORPAY_KEY_SECRET")!,
    );

    if (expectedSignature !== razorpay_signature) {
      console.warn(`Signature mismatch for order ${order_id}`);
      return json({ error: "Invalid payment signature" }, 400);
    }

    // Signature checks out — this is a genuine, paid Razorpay transaction.
    const { error: updateError } = await supabase
      .from("orders")
      .update({
        payment_status: "Success",
        payment_id: razorpay_payment_id,
      })
      .eq("id", order_id);

    if (updateError) {
      console.error(updateError);
      return json({ error: "Could not update order" }, 500);
    }

    return json({ success: true });
  } catch (err) {
    console.error(err);
    return json({ error: "Unexpected server error" }, 500);
  }
});

async function hmacSha256Hex(message: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
