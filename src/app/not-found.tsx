import Link from "next/link";
import { Compass, Package } from "lucide-react";

/**
 * The root 404. Beyond catching notFound() at the top level, this is what Next.js serves for any
 * URL that matches no route at all — so it is reached by people who are not signed in and may not
 * know what this application is.
 *
 * It therefore links to /login rather than a dashboard: sending an anonymous visitor to /app would
 * only bounce them through a redirect. Signed-in users are sent on to their own section by the
 * proxy once they land there.
 */
export default function RootNotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted/30 px-4 py-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
        <Package className="h-6 w-6" />
      </div>

      <span className="mt-8 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
        <Compass className="h-7 w-7" />
      </span>
      <h1 className="mt-4 text-xl font-bold">الصفحة غير موجودة</h1>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
        الرابط الذي فتحته غير صحيح أو أن الصفحة لم تعد متاحة.
      </p>

      <Link
        href="/login"
        className="mt-6 inline-flex h-9 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
      >
        الذهاب إلى تسجيل الدخول
      </Link>
    </div>
  );
}
