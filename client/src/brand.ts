const env = import.meta.env;

export const brand = {
  name: env.VITE_BRAND_NAME ?? "Morrow & Moss",
  currency: env.VITE_BRAND_CURRENCY ?? "USD",
  tagline: env.VITE_BRAND_TAGLINE ?? "A softer start to your day.",
  address: env.VITE_BRAND_ADDRESS ?? "24 Garden Lane, Neighborhood, City",
  phone: env.VITE_BRAND_PHONE ?? "+1 555 010 0110",
  email: env.VITE_BRAND_EMAIL ?? "hello@example.com",
  hashtag: env.VITE_BRAND_HASHTAG ?? "MorrowAndMoss"
};
