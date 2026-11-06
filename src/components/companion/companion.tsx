"use client";

import { Mochi } from "@/components/character/mochi";
import type { Accessory, BodyColor, EyeColor } from "@/lib/types";

/** The animated companion (2D SVG: light enough for any phone). */
export function Companion(props: { color: BodyColor; eyeColor?: EyeColor; accessory?: Accessory; interactive?: boolean; sparkles?: boolean }) {
  return (
    <div className="grid h-full w-full place-items-center">
      <div className="aspect-[240/250] h-full max-h-full max-w-full">
        <Mochi color={props.color} eyeColor={props.eyeColor} accessory={props.accessory} interactive={props.interactive ?? true} />
      </div>
    </div>
  );
}
