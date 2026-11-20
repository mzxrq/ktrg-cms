"use client";

import { CreditInput } from "./CreditInput";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";
import { useLingui } from "@lingui/react/macro";
import { useErrorMessages } from "@/components/useErrorMessages";
import { CheckIcon, DocumentIcon, ListIcon, MapIcon, PinIcon } from "@/components/icons";
import { api } from "@/lib/api";
import { outcome } from "@/lib/admin/admin-client";
import { checklist, factsFromDraft, progress, type EditorTab } from "@/lib/admin/checklist";
import { walkedStats, type TextField, type RouteDraft, stampFromChoices } from "@/lib/admin/route-draft";
import { RubyEditor } from "./RubyEditor";
import { placeChanged, type DraftProblem } from "@/lib/admin/save-plan";
import { useRouteDraft } from "./useRouteDraft";
import { CourseMapEditor, RestoreOffer } from "./CourseMapEditor";
import type { AdminSharedSpot } from "@/lib/admin/types";
import { formatUpdated } from "@/lib/format";
import { adminTab, adminTabRow, Check, Field, inputClass, MultilingualField, NumberInput, Section, TextInput } from "./fields";
import { LivePreview } from "./LivePreview";
import { walkStyleOf } from "@/lib/walk-style";
import { PublishedEditDialog } from "./PublishedEditDialog";
import { AccessPointsEditor } from "./AccessPointsEditor";
import { GradingFields } from "./GradingFields";
import { MunicipalitiesField } from "./MunicipalitiesField";
import { PhotoField } from "./PhotoField";
import { PhotoFocusPicker } from "./PhotoFocusPicker";
import { RouteHistory } from "./RouteHistory";
import { NearbyPlacesManager } from "./DirectoryPicker";
import { SubtitleUpload } from "./SubtitleUpload";
import { VideoUpload } from "./VideoUpload";
import { VideoHistory } from "./VideoHistory";
import { VideoPreview } from "./VideoPreview";
import { parseVideoFile } from "@/lib/video";
import { PlacePanel } from "./PlacePanel";
import { PlaceTable } from "./PlaceTable";
import { SharedPlaces } from "./SharedPlaces";
import { useChecklistLabels } from "./useChecklistLabels";
import { confirmDialog } from "@/components/ConfirmDialog";

const TABS: EditorTab[] = ["overview", "text", "map", "places", "check"];
const TAB_ICONS: Record<EditorTab, ReactNode> = { overview: <ListIcon />, text: <DocumentIcon />, map: <MapIcon />, places: <PinIcon />, check: <CheckIcon /> };
const isTab = (v: string | null): v is EditorTab => v !== null && (TABS as string[]).includes(v);

export function RouteEditor({ initial, order, locale, shared = [], sharedWith = {}, routeNames = {}, back }: { back?: ReactNode; initial: RouteDraft; order: number; locale: string; shared?: AdminSharedSpot[]; sharedWith?: Record<string, string[]>; routeNames?: Record<string, string> }) {
  const { t } = useLingui();
  const router = useRouter();
  const messages = useErrorMessages();
  const [view, setView] = useState<"edit" | "preview">("edit");
  // The places tab: a table to type many at once (where a new route starts), or the detailed panel per place.
  const [placesView, setPlacesView] = useState<"table" | "detail">(() => (initial.id === null ? "table" : "detail"));
  const params = useSearchParams();
  const [section, setSectionState] = useState<EditorTab>(() => {
    const q = params.get("tab");
    return isTab(q) ? q : "overview";
  });
  const labels = useChecklistLabels();
  const setSection = (next: EditorTab) => {
    setSectionState(next);
    setView("edit");
    const url = new URL(window.location.href);
    url.searchParams.set("tab", next);
    window.history.replaceState(null, "", url.href); // a string: the service worker library forwards this value, and a URL object cannot be sent
  };
  const d = useRouteDraft(initial, {
    onShowProblem: (kind) => setSection(kind.startsWith("place_") ? "places" : "overview"),
    onCreated: (id) => router.replace(`/admin/routes/${id}`),
  });
  const {
    dispatch, draft, saved, dirty, saving, busyKey, problems, setMessage, selectedKey, setSelectedKey,
    pendingEdit, setPendingEdit, guarded, save, savePlace, unpublishAll, setPublished,
  } = d;
  const isNew = draft.id === null;

  async function deleteRoute() {
    if (!draft.id || saving) return;
    if (!(await confirmDialog({ title: t`削除しますか？`, body: t`このコースを削除します。元に戻せません。よろしいですか？`, yes: t`削除する` }))) return;
    const res = await outcome(api.admin.routes({ id: draft.id }).delete());
    if (res.ok) router.replace(`/admin/routes`);
    else setMessage({ kind: "error", text: messages[res.key] });
  }

  // ---- what the form needs -------------------------------------------------------------------------------
  const savedByKey = useMemo(() => new Map(saved.places.map((p) => [p.key, p])), [saved.places]);
  // Places of this course that other courses hold too: listed in the shared block, and removing one asks first.
  const lent = draft.places.flatMap((p) => (p.id && sharedWith[p.id] ? [{ key: p.key, name: locale === "en" && p.nameEn ? p.nameEn : p.nameJa, routeIds: sharedWith[p.id]! }] : []));
  const confirmRemoval = async (key: string) => {
    const one = lent.find((x) => x.key === key);
    if (!one) return true;
    const name = one.name;
    const where = one.routeIds.map((id) => routeNames[id]).filter(Boolean).join(", ");
    return confirmDialog({ title: t`経由地を消しますか？`, body: t`「${name}」は、ほかのコース（${where}）にも置いてあります。消すと、そこからも消えます。よろしいですか？`, yes: t`消す` });
  };
  const problemOf = (kind: DraftProblem["kind"], key?: string) => problems.some((p) => p.kind === kind && (!("key" in p) || p.key === key));
  // A walk that comes back to where it began (周回 or 往復); its first waypoint on the way is the start and the goal.
  const comesBack = draft.walkStyle === "loop" || draft.walkStyle === "out_and_back";
  const firstAlong = draft.places.find((p) => !p.stopBy) ?? null;
  const text = (field: TextField) => (value: string) => dispatch({ type: "text", field, value });
  // A number that comes from the line is shown, not typed; one that was typed (or has nothing to come from) stays typeable.
  const distanceAuto = !draft.distanceManual && draft.line.length >= 2;
  const climbAuto = !draft.climbManual && draft.elevationGainM !== null;
  const timeAuto = !draft.timeManual && draft.expectedTimeMin !== null;
  const checks = useMemo(() => checklist(factsFromDraft(draft)), [draft]);
  const missingRequired = progress(checks).requiredTotal - progress(checks).requiredDone;

  return (
    <div className={`flex flex-col gap-5 ${saving ? "[&_fieldset]:pointer-events-none" : ""}`} aria-busy={saving}>
      <PublishedEditDialog
        name={pendingEdit ? (draft.places.find((p) => p.key === pendingEdit.key)?.nameJa || t`名前のない経由地`) : null}
        onProceed={() => {
          if (pendingEdit) dispatch(pendingEdit.action);
          setPendingEdit(null);
        }}
        onCancel={() => setPendingEdit(null)}
      />
      {/* Title bar: always in reach, with the one button that matters. On a narrow window the name goes on its own line under the
          buttons (squeezed beside them it would be one letter wide), and the saved line wraps instead of being pushed out. */}
      <div className="sticky top-0 z-20 -mx-4 flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line bg-paper px-4 py-3 lg:-mx-8 lg:px-8">
        {back}
        <h1 className="order-last min-w-0 basis-full break-words text-2xl font-bold lg:order-none lg:basis-0 lg:flex-1">{isNew ? t`新しいコース` : draft.nameJa || t`（名前がありません）`}</h1>
        <p className="order-last min-w-0 basis-full text-base text-muted lg:order-none lg:basis-auto lg:flex-none" aria-live="polite">
          {dirty ? t`保存していない変更があります` : isNew ? "" : t`保存済み（更新 ${formatUpdated(locale, draft.updatedAt ?? new Date().toISOString())}）`}
        </p>
        <button type="button" disabled={!dirty || saving || busyKey !== null} onClick={save} className="tap-target rounded-full bg-ink px-8 text-xl font-bold text-paper disabled:opacity-40">
          {saving ? t`保存中…` : t`保存する`}
        </button>
      </div>

      <RestoreOffer d={d} initial={initial} locale={locale} />

      {/* Narrower than 2xl: one thing at a time (the form needs the room; beside a 27rem preview it is under 500 px wide at 1280). */}
      <div className={`${adminTabRow} 2xl:hidden`} role="tablist" aria-label={t`表示の切り替え`}>
        {(["edit", "preview"] as const).map((id) => (
          <button key={id} type="button" role="tab" aria-selected={view === id} onClick={() => setView(id)} className={`${adminTab(view === id)} flex-1`}>
            {id === "edit" ? t`入力` : t`プレビュー`}
          </button>
        ))}
      </div>

      {/* The map tab uses the whole width (the map and its waypoint list); every other tab has the live preview beside it. */}
      <div className={`grid gap-6 ${section === "map" ? "" : "2xl:grid-cols-[minmax(0,1fr)_27rem]"}`}>
        <div className={`flex min-w-0 flex-col gap-5 ${view === "edit" ? "" : "hidden 2xl:flex"}`}>
          <nav aria-label={t`編集する内容`} className={adminTabRow} role="tablist">
            {TABS.map((id) => (
              <button
                key={id}
                type="button"
                role="tab"
                id={`tab-${id}`}
                aria-selected={section === id}
                aria-controls="editor-panel"
                onClick={() => setSection(id)}
                className={adminTab(section === id)}
              >
                {TAB_ICONS[id]}
                {labels.tab[id]}
                {id === "check" && missingRequired > 0 ? <span className="ml-2 rounded-full bg-danger px-2 text-base text-paper">{missingRequired}</span> : null}
              </button>
            ))}
          </nav>

          <div id="editor-panel" role="tabpanel" aria-labelledby={`tab-${section}`} className="flex flex-col gap-5">
            {section === "overview" ? (
              <>
                <Section title={t`基本`}>
                  <MultilingualField id="route-name" field="name" translations={draft.translations} onTranslations={(v) => dispatch({ type: "translations", value: v })} label={t`コースの名前`} ja={draft.nameJa} en={draft.nameEn} onJa={text("nameJa")} onEn={text("nameEn")} required invalid={problemOf("route_name")} />
                  <Field label={t`コースの名前の読み（ふりがな）`} htmlFor="ruby-0" hint={t`読みを入れた漢字の上に、小さく表示されます（ひらがな）。`}>
                    <RubyEditor name={draft.nameJa} value={draft.nameKana} onChange={text("nameKana")} />
                  </Field>
                  {problemOf("route_name") ? <p role="alert" className="text-base font-bold text-danger">{t`日本語の名前を入れてください。`}</p> : null}
                  <div className="grid gap-4 sm:grid-cols-2">
                    <MunicipalitiesField id="route-muni" invalid={problemOf("route_municipalities")} value={draft.municipalities} onChange={(value) => dispatch({ type: "municipalities", value })} />
                    <Field label={t`歩き方`} htmlFor="route-walk-style" hint={t`「スタート・ゴール」の見せ方が変わります。`}>
                      <select id="route-walk-style" value={draft.walkStyle ?? ""} onChange={(e) => dispatch({ type: "walkStyle", value: walkStyleOf(e.target.value) })} className={inputClass}>
                        <option value="">{t`未選択`}</option>
                        <option value="one_way">{t`片道（別の場所へ）`}</option>
                        <option value="loop">{t`周回（元の場所へ）`}</option>
                        <option value="out_and_back">{t`往復（同じ道）`}</option>
                      </select>
                    </Field>
                  </div>
                </Section>

                <Section title={t`数字`}>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <Field label={t`距離`} htmlFor="route-distance" hint={distanceAuto ? t`線から自動で作られます。ここでは変えられません。` : draft.distanceManual ? t`手入力（空にすると、線から自動）` : t`線を引くと、自動で入ります。`}>
                      <NumberInput id="route-distance" value={draft.distanceKm} min={0} max={2000} suffix="km" readOnly={distanceAuto} onChange={(v) => dispatch({ type: "distance", value: v })} />
                    </Field>
                    <Field label={t`登り（獲得標高）`} htmlFor="route-climb" hint={climbAuto ? t`線の標高から自動で作られます。ここでは変えられません。` : draft.climbManual ? t`手入力（空にすると、標高から自動）` : t`線を引くと、標高から自動で入ります。`}>
                      <NumberInput id="route-climb" value={draft.elevationGainM} min={0} max={10000} integer suffix="m" readOnly={climbAuto} onChange={(v) => dispatch({ type: "climb", value: v })} />
                    </Field>
                    <Field label={t`歩く時間`} htmlFor="route-time" hint={timeAuto ? t`距離と登りから自動で作られます。ここでは変えられません。` : draft.timeManual ? t`手入力（空にすると、距離と登りから自動）` : t`距離と登りから自動で計算`}>
                      <NumberInput id="route-time" value={draft.expectedTimeMin} min={0} max={20000} integer suffix={t`分`} readOnly={timeAuto} onChange={(v) => dispatch({ type: "time", value: v })} />
                    </Field>
                  </div>
                  <GradingFields
                    draft={draft}
                    descentM={walkedStats(draft.line, draft.legs).descent}
                    onPhysical={(value) => dispatch({ type: "physicalLevel", value })}
                    onTechnical={(value) => dispatch({ type: "technicalLevel", value })}
                  />
                  {/* Kept only while a course still has old text here, so it can be cleared; the stars replace it. */}
                  {draft.difficulty !== "" || saved.difficulty !== "" ? (
                  <details className="rounded-xl border border-line bg-paper px-4 py-2" open>
                    <summary className="cursor-pointer text-base font-bold">{t`むずかしさを、ひとことで書く（任意）`}</summary>
                    <div className="mt-2">
                      <Field label={t`むずかしさ（ひとこと）`} htmlFor="route-difficulty" hint={t`入れた文字が、そのまま表示されます。体力の目安・道のけわしさを選んだときは、そちらを先に表示します。`}>
                        <TextInput id="route-difficulty" value={draft.difficulty} onChange={text("difficulty")} maxLength={100} />
                      </Field>
                    </div>
                  </details>
                  ) : null}
                </Section>

                <Section title={t`写真`}>
                  <Field label={t`コースの写真`} htmlFor="route-photo">
                    <PhotoField id="route-photo" url={draft.photoUrl} onChange={text("photoUrl")} invalid={problemOf("photo_link")}>
                      <Field label={t`名前（写っているもの）`} htmlFor="route-photo-name" hint={t`大きな写真の下に、出どころと一緒に表示されます。`}>
                        <div className="grid gap-2 sm:grid-cols-2">
                          <TextInput id="route-photo-name" value={draft.photoNameJa} onChange={text("photoNameJa")} maxLength={200} placeholder={t`例：金剛山の山頂`} />
                          <TextInput id="route-photo-name-en" lang="en" value={draft.photoNameEn} onChange={text("photoNameEn")} maxLength={200} placeholder={t`英語（なくてもよい）`} ariaLabel={t`名前（英語）`} />
                        </div>
                      </Field>
                      <Field label={t`写真の出どころ`} htmlFor="route-photo-credit" hint={t`写真の上や下に ℹ︎ と一緒に表示されます。左に撮った人や使用条件を、右に写真を載せているページのリンク（なくてもよい）を入れます。`}>
                        <CreditInput id="route-photo-credit" value={draft.photoCredit} onChange={text("photoCredit")} placeholder={t`例：山田太郎, CC BY-SA 4.0`} />
                      </Field>
                    </PhotoField>
                    <PhotoFocusPicker url={draft.photoUrl} focus={draft.photoFocus} onChange={(value) => dispatch({ type: "photoFocus", value })} />
                  </Field>
                  {problemOf("photo_link") ? <p role="alert" className="text-base font-bold text-danger">{t`写真のリンクは、https:// で始まるものだけ使えます。`}</p> : null}
                </Section>

                <Section title={t`動画`}>
                  <Field label={t`動画のリンク（YouTube、またはアップロードした動画）`} htmlFor="route-video" hint={t`https:// で始まるリンクを入れます。空にすると、動画は表示されません。`}>
                    <TextInput id="route-video" value={draft.videoUrl} onChange={text("videoUrl")} maxLength={500} invalid={problemOf("video_link")} />
                  </Field>
                  {problemOf("video_link") ? <p role="alert" className="text-base font-bold text-danger">{t`YouTube、またはアップロードした動画の、https:// で始まるリンクにしてください。`}</p> : null}
                  <VideoUpload onUploaded={text("videoUrl")} />
                  {parseVideoFile(draft.videoUrl) ? <SubtitleUpload videoUrl={draft.videoUrl} uploaded={draft.videoSubtitles} onUploaded={() => dispatch({ type: "videoSubtitles", value: true })} /> : null}
                  <VideoPreview url={draft.videoUrl} title={draft.nameJa} subtitles={draft.videoSubtitles} language="ja" />
                  {draft.id ? <VideoHistory routeId={draft.id} onPick={text("videoUrl")} /> : null}
                </Section>

                <Section title={t`英語版の動画`}>
                  <Field label={t`英語版の動画のリンク（YouTube、またはアップロードした動画）`} htmlFor="route-video-en" hint={t`英語でサイトを見ている人に、日本語の動画のかわりに表示されます。空にすると、日本語の動画がそのまま表示されます。`}>
                    <TextInput id="route-video-en" value={draft.videoUrlEn} onChange={text("videoUrlEn")} maxLength={500} invalid={problemOf("video_link_en")} />
                  </Field>
                  {problemOf("video_link_en") ? <p role="alert" className="text-base font-bold text-danger">{t`YouTube、またはアップロードした動画の、https:// で始まるリンクにしてください。`}</p> : null}
                  <VideoUpload onUploaded={text("videoUrlEn")} />
                  {parseVideoFile(draft.videoUrlEn) ? <SubtitleUpload language="en" videoUrl={draft.videoUrlEn} uploaded={draft.videoSubtitlesEn} onUploaded={() => dispatch({ type: "videoSubtitlesEn", value: true })} /> : null}
                  <VideoPreview url={draft.videoUrlEn} title={draft.nameEn || draft.nameJa} subtitles={draft.videoSubtitlesEn} language="en" />
                </Section>

                {draft.id ? <RouteHistory routeId={draft.id} locale={locale} /> : null}
              </>
            ) : null}

            {section === "text" ? (
              <>
                <Section title={t`コースの説明`}>
                  <MultilingualField id="route-desc" field="description" translations={draft.translations} onTranslations={(v) => dispatch({ type: "translations", value: v })} label={t`コースの説明`} ja={draft.descriptionJa} en={draft.descriptionEn} onJa={text("descriptionJa")} onEn={text("descriptionEn")} long="short" />
                </Section>
                <Section title={t`歴史・由来`}>
                  <MultilingualField id="route-history" field="history" translations={draft.translations} onTranslations={(v) => dispatch({ type: "translations", value: v })} label={t`歴史・由来`} ja={draft.historyJa} en={draft.historyEn} onJa={text("historyJa")} onEn={text("historyEn")} long="short" />
                </Section>
                <Section title={t`アクセス・交通`}>
                  <Field label={t`遠いとみなす距離`} htmlFor="route-far" hint={t`コースからこれより離れていると、ナビは歩く道ではなく、電車やバスでの行き方を案内します。空なら 5 km。`}>
                    <NumberInput id="route-far" value={draft.farDistanceM} min={500} max={200000} integer suffix="m" onChange={(v) => dispatch({ type: "farDistanceM", value: v })} />
                  </Field>
                  <AccessPointsEditor value={draft.accessPoints} onChange={(value) => dispatch({ type: "accessPoints", value })} />
                  <MultilingualField id="route-access" field="access" translations={draft.translations} onTranslations={(v) => dispatch({ type: "translations", value: v })} label={t`アクセス・交通の補足`} ja={draft.accessJa} en={draft.accessEn} onJa={text("accessJa")} onEn={text("accessEn")} long="short" />
                  <p className="text-base text-muted">{t`上の一覧に入らない行き方（乗りかえ、時刻、帰りの方法など）を、自由に書きます。`}</p>
                </Section>
                <Section title={t`出典`}>
                  <MultilingualField id="route-source" field="source" translations={draft.translations} onTranslations={(v) => dispatch({ type: "translations", value: v })} label={t`出典`} ja={draft.sourceJa} en={draft.sourceEn} onJa={text("sourceJa")} onEn={text("sourceEn")} long="short" />
                  <p className="text-base text-muted">{t`この文章のもとにした資料や、確かめた公式サイトを書きます。コースのページの下に表示されます。`}</p>
                </Section>
              </>
            ) : null}

            {section === "map" ? (
              <>
              <Section title={t`地図と線`} id="map-section">
                {draft.id ? (
                  <NearbyPlacesManager
                    routeId={draft.id}
                    from={(() => {
                      const ref = draft.places.find((p) => p.lat !== null && p.lng !== null);
                      return ref && ref.lat !== null && ref.lng !== null ? { lat: ref.lat, lng: ref.lng } : null;
                    })()}
                  />
                ) : null}
                <CourseMapEditor d={d} confirmRemoval={confirmRemoval} />
              </Section>
              </>
            ) : null}

            {section === "places" ? (
              <Section title={t`経由地（${draft.places.length}か所）`}>
                <div role="group" aria-label={t`場所の見せ方`} className="flex flex-wrap gap-2">
                  {(["table", "detail"] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      aria-pressed={placesView === v}
                      onClick={() => setPlacesView(v)}
                      className={`tap-target rounded-full border-2 px-5 text-lg font-bold ${placesView === v ? "border-ink bg-ink text-paper" : "border-line"}`}
                    >
                      {v === "table" ? t`表でまとめて入力` : t`1か所ずつ詳しく`}
                    </button>
                  ))}
                </div>
                {firstAlong ? (
                  // The same setting as 歩き方 in 基本 (周回 / 往復 come back to the start): visitors then see this place as the start and again as the goal, one page and one stamp.
                  <div className="rounded-xl border border-line bg-paper px-4">
                    <Check
                      id="route-start-is-goal"
                      checked={comesBack}
                      onChange={(on) => dispatch({ type: "walkStyle", value: on ? (draft.walkStyle === "out_and_back" ? "out_and_back" : "loop") : "one_way" })}
                    >
                      {t`「${firstAlong.nameJa || t`1番目の経由地`}」をゴールにもする（出発した場所にもどる）`}
                    </Check>
                    {comesBack ? <p className="pb-3 text-base text-muted">{t`もどりの経由地を別に作る必要はありません。利用者には、スタートとゴールの両方にこの場所が表示されます。`}</p> : null}
                  </div>
                ) : null}
                {placesView === "table" ? (
                  <PlaceTable
                    places={draft.places}
                    busy={busyKey !== null || saving}
                    invalidName={(key) => problemOf("place_name", key)}
                    onChange={(key, patch) => guarded(key, { type: "place", key, patch })}
                    onRemove={(key) => void confirmRemoval(key).then((yes) => yes && dispatch({ type: "removePlace", key }))}
                    onAdd={() => dispatch({ type: "addRow", key: crypto.randomUUID() })}
                  />
                ) : draft.places.length === 0 ? (
                  <p className="rounded-xl bg-paper p-4 text-lg">
                    {t`まだありません。`}{" "}
                    <button type="button" onClick={() => setSection("map")} className="font-bold text-accent underline underline-offset-4">
                      {t`「地図と線」で経由地を置く`}
                    </button>
                  </p>
                ) : (
                  <ol className="flex flex-col gap-3">
                    {draft.places.map((p, i) => (
                      <PlacePanel
                        key={p.key}
                        place={p}
                        number={i + 1}
                        selected={p.key === selectedKey}
                        dirty={placeChanged(p, savedByKey.get(p.key))}
                        busy={busyKey !== null || saving}
                        canMoveUp={i > 0}
                        canMoveDown={i < draft.places.length - 1}
                        invalidName={problemOf("place_name", p.key)}
                        invalidPhoto={problemOf("place_photo_link", p.key)}
                        stampFrom={stampFromChoices(draft.places, p.key)}
                        onSelect={() => setSelectedKey(p.key === selectedKey ? null : p.key)}
                        onChange={(patch) => guarded(p.key, { type: "place", key: p.key, patch })}
                        onRemove={async () => {
                          if (!(await confirmRemoval(p.key))) return;
                          dispatch({ type: "removePlace", key: p.key });
                          setSelectedKey(null);
                        }}
                        onMove={(step) => {
                          const keys = draft.places.map((x) => x.key);
                          const j = i + step;
                          [keys[i], keys[j]] = [keys[j]!, keys[i]!];
                          dispatch({ type: "reorderPlaces", keys });
                        }}
                        canSave={draft.id !== null}
                        onSave={() => void savePlace(p.key)}
                        onPublish={() => setPublished(p.key, true)}
                        onUnpublish={() => setPublished(p.key, false)}
                      />
                    ))}
                  </ol>
                )}
                {problems.some((p) => p.kind === "place_position") ? <p role="alert" className="text-base font-bold text-danger">{t`緯度と経度は、両方入れるか、両方空にしてください。`}</p> : null}
                {draft.id ? <SharedPlaces routeId={draft.id} initial={shared} lent={lent} routeNames={routeNames} locale={locale} /> : null}
                {draft.places.some((p) => p.id && p.published) ? (
                  <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-paper p-3">
                    <button type="button" disabled={busyKey !== null} onClick={() => void unpublishAll()} className="tap-target rounded-full border-2 border-danger px-5 text-lg font-bold text-danger disabled:opacity-40">
                      {busyKey === "all" ? t`処理しています…` : t`すべての公開をやめる`}
                    </button>
                    <p className="min-w-0 flex-1 text-base text-muted">{t`公開中の経由地をまとめて下書きに戻します。コースは「準備中」として、一覧に残ります。`}</p>
                  </div>
                ) : null}
              </Section>
            ) : null}

            {section === "check" ? (
              <Section title={t`公開前のチェック`}>
                <p className="text-base text-muted">{t`保存していない内容も含めて調べています。`}</p>
                {(
                  [
                    [true, t`必要なこと`],
                    [false, t`あると、もっとよいこと`],
                  ] as const
                ).map(([required, title]) => (
                  <div key={String(required)} className="flex flex-col gap-2">
                    <h3 className="text-lg font-bold">{title}</h3>
                    <ul className="flex flex-col gap-2">
                      {checks
                        .filter((i) => i.required === required)
                        .map((i) => (
                          <li key={i.id} className="flex flex-wrap items-center gap-3 rounded-xl bg-paper p-3">
                            <span className={`w-20 shrink-0 rounded-full px-3 py-1 text-center text-base font-bold ${i.done ? "bg-moss text-paper" : required ? "bg-danger text-paper" : "bg-surface"}`}>{i.done ? t`できた` : t`まだ`}</span>
                            <span className="min-w-0 flex-1 text-lg">{labels.item[i.id]}</span>
                            {!i.done ? (
                              <button type="button" onClick={() => setSection(i.tab)} className="tap-target rounded-full border border-line px-4 text-base font-bold">
                                {t`${labels.tab[i.tab]}を開く`}
                              </button>
                            ) : null}
                          </li>
                        ))}
                    </ul>
                  </div>
                ))}
              </Section>
            ) : null}
          </div>

          {!isNew ? (
            <div className="flex flex-col gap-2 pb-10">
              <button type="button" onClick={deleteRoute} disabled={draft.places.length > 0 || saving} className="tap-target w-fit rounded-full border-2 border-danger px-5 text-lg font-bold text-danger disabled:opacity-40">
                {t`このコースを削除`}
              </button>
              {draft.places.length > 0 ? <p className="text-base text-muted">{t`経由地が残っているコースは削除できません。`}</p> : null}
            </div>
          ) : null}
        </div>

        <div className={`min-w-0 ${view === "preview" ? "" : section === "map" ? "hidden" : "hidden 2xl:block"}`}>
          {/* Never taller than the screen (so its bottom is always reachable), and the browser is told not to re-anchor the page to it while it scrolls inside. */}
          <div className="2xl:sticky 2xl:top-24 2xl:max-h-[calc(100dvh-7rem)] 2xl:overflow-y-auto [contain:paint] [overflow-anchor:none]">
            <LivePreview draft={draft} order={order} locale={locale} />
          </div>
        </div>
      </div>
    </div>
  );
}
