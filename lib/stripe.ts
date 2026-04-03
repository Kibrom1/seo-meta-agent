import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-03-25.dahlia",
});

export async function reportTokenUsage(
  stripeCustomerId: string,
  tokensUsed: number
): Promise<void> {
  if (!stripeCustomerId || tokensUsed <= 0) return;
  await stripe.billing.meterEvents.create({
    event_name: "seo_agent_tokens",
    payload: {
      stripe_customer_id: stripeCustomerId,
      value: String(tokensUsed),
    },
  });
}

export async function createStripeCustomer(email: string): Promise<string> {
  const customer = await stripe.customers.create({ email });
  return customer.id;
}

export { stripe };
