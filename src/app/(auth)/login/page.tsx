import { LoginForm } from "./login-form";
import { Package } from "lucide-react";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-6">
      <div className="flex flex-col items-center gap-8">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Package className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-bold">منصة الشحن البري</h1>
          <p className="text-sm text-muted-foreground">تسجيل الدخول لإدارة عمليات الشحن</p>
        </div>
        <LoginForm />
      </div>
    </div>
  );
}
