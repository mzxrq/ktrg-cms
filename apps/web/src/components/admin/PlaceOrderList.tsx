"use client";

import { useState } from "react";
import { useLingui } from "@lingui/react/macro";
import { MenuIcon } from "@/components/icons";
import type { PlaceDraft } from "@/lib/admin/route-draft";

/** `keys` with `from` taken out and put where `to` stood (before it when moving up, after it when moving down). */
export function movedKeys(keys: readonly string[], from: string, to: string): string[] {
  const at = keys.indexOf(to);
  if (from === to || at < 0 || !keys.includes(from)) return [...keys];
  const rest = keys.filter((k) => k !== from);
  rest.splice(at, 0, from);
  return rest;
}

/**
 * The waypoints of the 経由地 tab as a short list beside the form: choose one to edit it, drag one to change the order.
 * Dragging is for a mouse; the form's 順番を前へ / 後ろへ buttons do the same from the keyboard.
 */
export function PlaceOrderList({ places, selectedKey, isDirty, hasProblem, onSelect, onReorder }: { places: PlaceDraft[]; selectedKey: string | null; isDirty: (key: string) => boolean; hasProblem: (key: string) => boolean; onSelect: (key: string) => void; onReorder: (keys: string[]) => void }) {
  const { t } = useLingui();
  const [dragged, setDragged] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const keys = places.map((p) => p.key);
  const end = () => {
    setDragged(null);
    setOver(null);
  };

  return (
    <ol aria-label={t`経由地の一覧（ドラッグで順番を変えられます）`} className="flex flex-col gap-1">
      {places.map((p, i) => {
        const selected = p.key === selectedKey;
        // A line where the dragged place will land: above the row when it moves up, below when it moves down.
        const mark = dragged && over === p.key && dragged !== p.key ? (keys.indexOf(dragged) > i ? "border-t-brand" : "border-b-brand") : "";
        return (
          <li
            key={p.key}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("text/plain", p.key); // Firefox starts a drag only with some data
              setDragged(p.key);
            }}
            onDragOver={(e) => {
              if (!dragged) return;
              e.preventDefault();
              setOver(p.key);
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (dragged && dragged !== p.key) onReorder(movedKeys(keys, dragged, p.key));
              end();
            }}
            onDragEnd={end}
            className={`border-y-4 border-transparent ${mark} ${dragged === p.key ? "opacity-40" : ""}`}
          >
            <button
              type="button"
              aria-current={selected ? "true" : undefined}
              onClick={() => onSelect(p.key)}
              className={`tap-target flex w-full cursor-grab items-center gap-2 rounded-xl border-2 px-2 py-1 text-left active:cursor-grabbing ${selected ? "border-ink bg-paper" : "border-transparent hover:bg-paper"}`}
            >
              <span aria-hidden="true" className="shrink-0 text-muted [&_svg]:size-5">
                <MenuIcon />
              </span>
              <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-strong text-base font-bold text-on-brand-strong">
                {i + 1}
              </span>
              <span className={`min-w-0 flex-1 break-words text-base ${selected ? "font-bold" : ""} ${hasProblem(p.key) ? "text-danger" : ""}`}>{p.nameJa || t`（名前がありません）`}</span>
              {isDirty(p.key) ? (
                <span title={t`未保存`} className="shrink-0 text-base font-bold text-accent">
                  ●<span className="sr-only">{t`未保存`}</span>
                </span>
              ) : null}
              <span className={`shrink-0 rounded-full px-2 text-base ${p.published ? "bg-moss font-bold text-paper" : "bg-surface"}`}>{p.published ? t`公開中` : t`下書き`}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
