"use client";

import dynamic from "next/dynamic";
import type { Accessory, BodyColor, EyeColor } from "@/lib/types";

const Stage = dynamic(() => import("@/components/companion/stage"), {
  ssr: false,
  loading: () => (
    <div className="grid h-full w-full place-items-center">
      <div className="h-28 w-28 animate-pulse rounded-full bg-gradient-to-br from-pink-200 to-violet-200" />
    </div>
  ),
});

/** The 3D companion. WebGL only runs in the browser, so it's never server-rendered. */
export function Companion(props: { color: BodyColor; eyeColor?: EyeColor; accessory?: Accessory; interactive?: boolean; sparkles?: boolean }) {
  return <Stage {...props} />;
}
