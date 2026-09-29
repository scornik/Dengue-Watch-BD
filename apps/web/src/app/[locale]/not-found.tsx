import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

export default function NotFound() {
  const t = useTranslations("common");
  return (
    <div className="card text-center">
      <h1 className="text-xl font-bold">{t("notFound")}</h1>
      <Link href="/" className="btn-primary mt-4">
        {t("home")}
      </Link>
    </div>
  );
}
