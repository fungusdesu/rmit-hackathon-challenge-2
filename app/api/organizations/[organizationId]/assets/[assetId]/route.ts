import { NextRequest } from "next/server";
import { requirePrincipal } from "@/lib/auth/server";
import { assertSafeWrite, assetErrorResponse, assetJson, readAssetBody } from "@/lib/assets/http";
import { deleteAsset, getAsset, updateAsset } from "@/lib/assets/service";

type Context = { params: Promise<{ organizationId: string; assetId: string }> };

export async function GET(request: NextRequest, context: Context) {
  try {
    const principal = await requirePrincipal(request);
    const { organizationId, assetId } = await context.params;
    return assetJson({ asset: await getAsset(organizationId, assetId, principal) });
  } catch (error) {
    return assetErrorResponse(error);
  }
}

export async function PATCH(request: NextRequest, context: Context) {
  try {
    assertSafeWrite(request);
    const principal = await requirePrincipal(request);
    const { organizationId, assetId } = await context.params;
    return assetJson({ asset: await updateAsset(organizationId, assetId, principal, await readAssetBody(request)) });
  } catch (error) {
    return assetErrorResponse(error);
  }
}

export async function DELETE(request: NextRequest, context: Context) {
  try {
    assertSafeWrite(request, false);
    const principal = await requirePrincipal(request);
    const { organizationId, assetId } = await context.params;
    await deleteAsset(organizationId, assetId, principal);
    return assetJson({ deleted: true });
  } catch (error) {
    return assetErrorResponse(error);
  }
}
