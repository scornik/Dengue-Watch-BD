import { env } from "@/lib/env";

/** The person behind the project, shown in the footer, on /about and on /contact. */
export const CREATOR = {
  name: "Mohammad Ashik Elahi",
  initials: "MAE",
  linkedin: "https://www.linkedin.com/in/ashikelahicse",
  /** apps/web/public/creator.jpg: a square photo, ~400 px. The initials show if it fails to load. */
  photo: "/creator.jpg",
  email: env.contactEmail,
};
