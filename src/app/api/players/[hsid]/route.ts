import { NextResponse } from "next/server";

export async function GET(
  _request: Request,
  { params }: { params: { hsid: string } }
) {
  return NextResponse.json({ hsid: params.hsid });
}

// This file was updated to use the latest versions of Next.js, React, and ReactDOM.
// To ensure compatibility, please run the following command:
// npm install next@latest react@latest react-dom@latest
