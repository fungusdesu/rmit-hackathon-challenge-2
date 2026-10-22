import { NextRequest } from "next/server";
import { requirePrincipal } from "@/lib/auth/server";
import { assertSafeWrite, assetErrorResponse, assetJson, readAssetBody } from "@/lib/assets/http";
import { createAsset, listAssets } from "@/lib/assets/service";

type Context = { params: Promise<{ organizationId: string }> };

export async function GET(request: NextRequest, context: Context) {
  try {
    const principal = await requirePrincipal(request);
    const { organizationId } = await context.params;
    return assetJson({ assets: await listAssets(organizationId, principal) });
  } catch (error) {
    return assetErrorResponse(error);
  }
}

export async function POST(request: NextRequest, context: Context) {
  try {
    assertSafeWrite(request);
    const principal = await requirePrincipal(request);
    const { organizationId } = await context.params;
    const asset = await createAsset(organizationId, principal, await readAssetBody(request));
    return assetJson({ asset }, 201);
  } catch (error) {
    return assetErrorResponse(error);
  }
}
