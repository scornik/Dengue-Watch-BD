// Public (browser-safe) configuration. Never put service-role keys here:
// the web app only ever uses the anon/publishable key; privileged work runs
// in Supabase Edge Functions.
export const env = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  mapStyleUrl: process.env.NEXT_PUBLIC_MAP_STYLE_URL ?? "https://tiles.openfreemap.org/styles/liberty",
  vapidPublicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "",
  clipModelId: process.env.NEXT_PUBLIC_CLIP_MODEL_ID ?? "Xenova/clip-vit-base-patch32",
  sourceUrl: process.env.NEXT_PUBLIC_SOURCE_URL ?? "https://github.com/scornik/Dengue-Watch-BD",
  contactEmail: process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? "ashik.elahi.cse@gmail.com",
};

export const functionsUrl = (name: string) => `${env.supabaseUrl}/functions/v1/${name}`;
export const publicStorageUrl = (bucket: string, path: string) =>
  `${env.supabaseUrl}/storage/v1/object/public/${bucket}/${path}`;
