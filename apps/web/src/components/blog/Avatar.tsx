import Image from "next/image";
import { UserIcon } from "@/components/icons";

/**
 * A round photo of a person, or their first letter on a coloured disc when there is no photo (a person icon when there is no
 * name either). The one avatar: the profile card, the admin menu, the blog byline and comments (2026-11-27, user: two
 * different discs for one person).
 */
export function Avatar({ src, name, size = 40 }: { src: string | null; name: string | null; size?: number }) {
  const box = { width: size, height: size };
  if (src) return <Image src={src} alt="" width={size} height={size} style={box} className="shrink-0 rounded-full object-cover" unoptimized />;
  const letter = name?.trim() ? [...name.trim()][0] : null;
  return (
    <span aria-hidden="true" style={{ ...box, fontSize: size * 0.45 }} className="grid shrink-0 place-items-center rounded-full bg-brand-strong font-bold text-on-brand-strong [&_svg]:size-1/2">
      {letter ?? <UserIcon />}
    </span>
  );
}
