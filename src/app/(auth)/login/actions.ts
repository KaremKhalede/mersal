"use server";

import { redirect } from "next/navigation";
import { login } from "@/lib/auth";

export type LoginState = { error?: string };

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) return { error: "أدخل البريد الإلكتروني وكلمة المرور" };

  const result = await login(email, password);
  if ("error" in result) return { error: result.error };

  const { user } = result;
  if (user.userType === "PLATFORM_ADMIN") redirect("/platform");
  if (user.userType === "DRIVER") redirect("/driver");
  redirect("/app");
}
