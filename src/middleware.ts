import { NextRequest, NextResponse } from "next/server";

/**
 * Shared-secret auth for the single operator. First visit with
 * ?key=<ADMIN_SECRET> sets a cookie; everything else is denied.
 * /api/inngest is excluded — Inngest authenticates with signed requests.
 */
export function middleware(req: NextRequest) {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) {
    return new NextResponse(
      "Server is missing the ADMIN_SECRET environment variable. Add every variable from .env.example in Vercel → Project → Settings → Environment Variables, then redeploy.",
      { status: 500 }
    );
  }

  const keyParam = req.nextUrl.searchParams.get("key");
  if (keyParam === secret) {
    const url = req.nextUrl.clone();
    url.searchParams.delete("key");
    const res = NextResponse.redirect(url);
    res.cookies.set("admin", secret, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30,
    });
    return res;
  }

  if (req.cookies.get("admin")?.value === secret) return NextResponse.next();

  // API callers may send the secret as a bearer token instead.
  const auth = req.headers.get("authorization");
  if (auth === `Bearer ${secret}`) return NextResponse.next();

  return new NextResponse("Unauthorized — open /desk?key=<ADMIN_SECRET>", {
    status: 401,
  });
}

export const config = {
  matcher: ["/((?!api/inngest|_next/static|_next/image|favicon.ico).*)"],
};
