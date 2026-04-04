import Stripe from "stripe";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

// Only instantiate Stripe if the key is present (prevents build-time crashes)
const stripe = stripeSecretKey 
  ? new Stripe(stripeSecretKey, { apiVersion: "2026-03-25.dahlia" })
  : null;

export async function reportTokenUsage(
  stripeCustomerId: string,
  tokensUsed: number
): Promise<void> {
  if (!stripeCustomerId || tokensUsed <= 0 || !stripe) return;
  await stripe.billing.meterEvents.create({
    event_name: "seo_agent_tokens",
    payload: {
      stripe_customer_id: stripeCustomerId,
      value: String(tokensUsed),
    },
  });
}

export async function createStripeCustomer(email: string): Promise<string> {
  if (!stripe) throw new Error("Stripe secret key is missing");
  const customer = await stripe.customers.create({ email });
  return customer.id;
}

export { stripe };
