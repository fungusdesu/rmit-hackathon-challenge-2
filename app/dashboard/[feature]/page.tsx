"use client";

import { notFound, useParams } from "next/navigation";
import FeaturePreview, { featurePreviews } from "../feature-preview";

export default function FeaturePage() {
  const { feature } = useParams<{ feature: string }>();
  if (!Object.hasOwn(featurePreviews, feature)) notFound();
  return <FeaturePreview feature={featurePreviews[feature]} />;
}
