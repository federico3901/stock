import { NextResponse } from "next/server";
import { AUTH_COOKIE, authToken, safeEqual } from "@/lib/auth";

export async function POST(req: Request) {
  const expected = process.env.APP_PASSWORD;
  if (!expected) return NextResponse.json({ ok: true });
  let password = "";
  try {
    password = String((await req.json()).password ?? "");
  } catch {
    /* corpo mancante */
  }
  if (!safeEqual(await authToken(password), await authToken(expected))) {
    // piccolo ritardo contro i tentativi a raffica
    await new Promise((r) => setTimeout(r, 600));
    return NextResponse.json({ error: "Password errata." }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE, await authToken(expected), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 90,
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(AUTH_COOKIE);
  return res;
}
