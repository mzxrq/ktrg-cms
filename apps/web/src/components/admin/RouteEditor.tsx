"use client";

import { CreditInput } from "./CreditInput";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { useLingui } from "@lingui/react/macro";
import { useErrorMessages } from "@/components/useErrorMessages";
import { CheckIcon, DocumentIcon, ListIcon, MapIcon, PinIcon } from "@/components/admin/admin-icons";
import { api } from "@/lib/api";
import { outcome } from "@/lib/admin/admin-client";
import { checklist, factsFromDraft, progress, type EditorTab } from "@/lib/admin/checklist";
import { walkedStats, type TextField, type RouteDraft, stampFromChoices } from "@/lib/admin/route-draft";
import { RubyEditor } from "./RubyEditor";
import { draftProblems, placeChanged, type DraftProblem } from "@/lib/admin/save-plan";
import { useRouteDraft } from "./useRouteDraft";
import { CourseMapEditor, PublishedEditGuard, RestoreOffer, SaveButton, SaveState, useConfirmRemoval } from "./CourseMapEditor";
import type { AdminSharedSpot } from "@/lib/admin/types";
import { adminTab, adminTabRow, Check, Field, inputClass, MultilingualField, NumberInput, Section, TextInput } from "./fields";
import { LivePreview } from "./LivePreview";
import { walkStyleOf } from "@/lib/walk-style";
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
import { PlaceOrderList } from "./PlaceOrderList";
import { PlaceTable } from "./PlaceTable";
import { SharedPlaces } from "./SharedPlaces";
import { useChecklistLabels } from "./useChecklistLabels";
import { confirmDialog } from "@/components/ConfirmDialog";

const TABS: EditorTab[] = ["overview", "text", "map", "places", "check"];
const TAB_ICONS: Record<EditorTab, ReactNode> = { overview: <ListIcon />, text: <DocumentIcon />, map: <MapIcon />, places: <PinIcon />, check: <CheckIcon /> };
const isTab = (v: string | null): v is EditorTab => v !== null && (TABS as string[]).includes(v);
const WIDE = "(min-width: 96rem)"; // Tailwind's 2xl
const subscribeWide = (onChange: () => void) => {
  const m = window.matchMedia(WIDE);
  m.addEventListener("change", onChange);
  return () => m.removeEventListener("change", onChange);
};

export function RouteEditor({ initial, order, locale, shared = [], sharedWith = {}, routeNames = {}, back }: { back?: ReactNode; initial: RouteDraft; order: number; locale: string; shared?: AdminSharedSpot[]; sharedWith?: Record<string, string[]>; routeNames?: Record<string, string> }) {
  const { t } = useLingui();
  const router = useRouter();
  const messages = useErrorMessages();
  // The live preview: beside the form from 2xl, in its place below that. Hidden on the map tab, which needs the whole width.
  // On by itself where it fits beside the form, until the toggle is pressed.
  const wide = useSyncExternalStore(subscribeWide, () => window.matchMedia(WIDE).matches, () => false);
  const [previewChoice, setPreview] = useState<boolean | null>(null);
  const preview = previewChoice ?? wide;
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
    if (!wide) setPreview(false); // narrow: the preview covers the form, so a tab shows the form again
    const url = new URL(window.location.href);
    url.searchParams.set("tab", next);
    window.history.replaceState(null, "", url.href); // a string: the service worker library forwards this value, and a URL object cannot be sent
  };
  const d = useRouteDraft(initial, {
    onShowProblem: (kind) => {
      setSection(kind.startsWith("place_") ? "places" : "overview");
      // The places tab shows one waypoint's form at a time: open the one with the problem.
      const place = draftProblems(draft).find((x) => x.kind === kind && "key" in x);
      if (place && "key" in place) setSelectedKey(place.key);
    },
    onCreated: (id) => router.replace(`/admin/routes/${id}`),
  });
  const {
    dispatch, draft, saved, saving, busyKey, problems, setMessage, selectedKey, setSelectedKey,
    guarded, savePlace, unpublishAll, setPublished,
  } = d;
  const isNew = draft.id === null;

  async function deleteRoute() {
    if (!draft.id || saving) return;
    if (!(await confirmDialog({ title: t`削除しますか？`, body: t`このコースを削除します。この操作は取り消せません。よろしいですか？`, yes: t`削除する` }))) return;
    const res = await outcome(api.admin.routes({ id: draft.id }).delete());
    if (res.ok) router.replace(`/admin/routes`);
    else setMessage({ kind: "error", text: messages[res.key] });
  }

  // ---- what the form needs -------------------------------------------------------------------------------
  const savedByKey = useMemo(() => new Map(saved.places.map((p) => [p.key, p])), [saved.places]);
  // Places of this course that other courses hold too: listed in the shared block, and removing one asks first.
  const lent = draft.places.flatMap((p) => (p.id && sharedWith[p.id] ? [{ key: p.key, name: locale === "en" && p.nameEn ? p.nameEn : p.nameJa, routeIds: sharedWith[p.id]! }] : []));
  const confirmRemoval = useConfirmRemoval(draft, sharedWith, routeNames, locale, setMessage);
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
  const showPreview = preview && section !== "map";
  // The title bar's height, for the columns that stay in view under it while the page scrolls.
  const head = useRef<HTMLDivElement>(null);
  const [headHeight, setHeadHeight] = useState(0);
  useEffect(() => {
    const el = head.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setHeadHeight(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // The places tab shows the chosen waypoint's form (the first one until another is chosen).
  const current = draft.places.find((p) => p.key === selectedKey) ?? draft.places[0] ?? null;
  const currentIndex = current ? draft.places.indexOf(current) : -1;
  const choosePlace = (key: string) => {
    setSelectedKey(key);
    const form = document.getElementById("place-form");
    if (form && form.getBoundingClientRect().top < headHeight) form.scrollIntoView({ block: "start" });
  };

  return (
    // inert while saving: an edit made then (the map, Ctrl+Z) would be overwritten by the saved copy without a word.
    <div className="flex flex-col gap-5" inert={saving || busyKey !== null} aria-busy={saving} style={{ "--head": `${headHeight}px` } as CSSProperties}>
      <PublishedEditGuard d={d} />
      {/* Title bar: always in reach, with the one button that matters and the tabs. On a narrow window the name goes on its own line under the
          buttons (squeezed beside them it would be one letter wide), and the saved line wraps instead of being pushed out. */}
      <div ref={head} className="sticky top-0 z-20 -mx-4 flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line bg-paper px-4 pt-3 lg:-mx-8 lg:px-8">
        {back}
        <h1 className="order-last min-w-0 basis-full break-words text-2xl font-bold lg:order-none lg:basis-0 lg:flex-1">{isNew ? t`新規コース` : draft.nameJa || t`（名称未設定）`}</h1>
        <p className="order-last min-w-0 basis-full text-base text-muted lg:order-none lg:basis-auto lg:flex-none" aria-live="polite">
          <SaveState d={d} locale={locale} isNew={isNew} />
        </p>
        <SaveButton d={d} />
        {/* The tabs stay in the bar, so another part of the course is one click away however far down the page is. */}
        <div className="order-last flex basis-full items-center gap-3">
          <nav aria-label={t`編集タブ`} className={`${adminTabRow} min-w-0 flex-1`} role="tablist">
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
          {section !== "map" ? (
            <button type="button" aria-pressed={preview} onClick={() => setPreview(!preview)} className={`tap-target shrink-0 rounded-full border px-5 text-lg font-bold ${preview ? "border-ink bg-ink text-paper" : "border-line"}`}>
              {t`プレビュー`}
            </button>
          ) : null}
        </div>
      </div>

      <RestoreOffer d={d} initial={initial} locale={locale} />

      {/* With the preview on: beside the form from 2xl; narrower, one thing at a time (beside a 27rem preview the form is under 500 px at 1280). */}
      <div className={`grid gap-6 ${showPreview ? "2xl:grid-cols-[minmax(0,1fr)_27rem]" : ""}`}>
        <div className={`flex min-w-0 flex-col gap-5 ${showPreview ? "hidden 2xl:flex" : ""}`}>
          <div id="editor-panel" role="tabpanel" aria-labelledby={`tab-${section}`} className="flex flex-col gap-5">
            {section === "overview" ? (
              <>
                <Section title={t`基本情報`}>
                  <MultilingualField id="route-name" field="name" translations={draft.translations} onTranslations={(v) => dispatch({ type: "translations", value: v })} label={t`コース名`} ja={draft.nameJa} en={draft.nameEn} onJa={text("nameJa")} onEn={text("nameEn")} required invalid={problemOf("route_name")} />
                  <Field label={t`コース名のふりがな（読み）`} htmlFor="ruby-0" hint={t`入力した漢字の上にふりがなが小さく表示されます（ひらがな）。`}>
                    <RubyEditor name={draft.nameJa} value={draft.nameKana} onChange={text("nameKana")} />
                  </Field>
                  {problemOf("route_name") ? <p role="alert" className="text-base font-bold text-danger">{t`日本語のコース名を入力してください。`}</p> : null}
                  <div className="grid gap-4 sm:grid-cols-2">
                    <MunicipalitiesField id="route-muni" invalid={problemOf("route_municipalities")} value={draft.municipalities} onChange={(value) => dispatch({ type: "municipalities", value })} />
                    <Field label={t`コース形式`} htmlFor="route-walk-style" hint={t`スタート・ゴールの表示が変わります。`}>
                      <select id="route-walk-style" value={draft.walkStyle ?? ""} onChange={(e) => dispatch({ type: "walkStyle", value: walkStyleOf(e.target.value) })} className={inputClass}>
                        <option value="">{t`未選択`}</option>
                        <option value="one_way">{t`片道（別地点がゴール）`}</option>
                        <option value="loop">{t`周回（出発地点に戻る）`}</option>
                        <option value="out_and_back">{t`往復（同じルートを戻る）`}</option>
                      </select>
                    </Field>
                  </div>
                </Section>

                <Section title={t`距離・時間・難易度`}>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <Field label={t`距離`} htmlFor="route-distance" hint={distanceAuto ? t`ルート線から自動計算されます（ここでは編集できません）。` : draft.distanceManual ? t`手動入力（空にするとルート線から自動計算）` : t`ルート線を引くと自動で入力されます。`}>
                      <NumberInput id="route-distance" value={draft.distanceKm} min={0} max={2000} suffix="km" readOnly={distanceAuto} onChange={(v) => dispatch({ type: "distance", value: v })} />
                    </Field>
                    <Field label={t`獲得標高（登り）`} htmlFor="route-climb" hint={climbAuto ? t`ルートの標高から自動計算されます（ここでは編集できません）。` : draft.climbManual ? t`手動入力（空にすると標高から自動計算）` : t`ルート線を引くと標高から自動で入力されます。`}>
                      <NumberInput id="route-climb" value={draft.elevationGainM} min={0} max={10000} integer suffix="m" readOnly={climbAuto} onChange={(v) => dispatch({ type: "climb", value: v })} />
                    </Field>
                    <Field label={t`徒歩時間`} htmlFor="route-time" hint={timeAuto ? t`距離と獲得標高から自動計算されます（ここでは編集できません）。` : draft.timeManual ? t`手動入力（空にすると距離と獲得標高から自動計算）` : t`距離と獲得標高から自動計算されます。`}>
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
                    <summary className="cursor-pointer text-base font-bold">{t`難易度の自由記述（任意）`}</summary>
                    <div className="mt-2">
                      <Field label={t`難易度（自由記述）`} htmlFor="route-difficulty">
                        <TextInput id="route-difficulty" value={draft.difficulty} onChange={text("difficulty")} maxLength={100} />
                      </Field>
                    </div>
                  </details>
                  ) : null}
                </Section>

                <Section title={t`写真`}>
                  <Field label={t`コース写真`} htmlFor="route-photo">
                    <PhotoField id="route-photo" url={draft.photoUrl} onChange={text("photoUrl")} invalid={problemOf("photo_link")}>
                      <Field label={t`写真のタイトル（被写体）`} htmlFor="route-photo-name" hint={t`大きな写真の下にクレジットと一緒に表示されます。`}>
                        <div className="grid gap-2 sm:grid-cols-2">
                          <TextInput id="route-photo-name" value={draft.photoNameJa} onChange={text("photoNameJa")} maxLength={200} placeholder={t`例：金剛山の山頂`} />
                          <TextInput id="route-photo-name-en" lang="en" value={draft.photoNameEn} onChange={text("photoNameEn")} maxLength={200} placeholder={t`英語（任意）`} ariaLabel={t`写真のタイトル（英語）`} />
                        </div>
                      </Field>
                      <Field label={t`クレジット・出典`} htmlFor="route-photo-credit" hint={t`写真の上下に ℹ︎ アイコン付きで表示されます。左に撮影者やライセンス、右に掲載元ページのURL（任意）を入力してください。`}>
                        <CreditInput id="route-photo-credit" value={draft.photoCredit} onChange={text("photoCredit")} placeholder={t`例：山田太郎, CC BY-SA 4.0`} />
                      </Field>
                    </PhotoField>
                    <PhotoFocusPicker url={draft.photoUrl} focus={draft.photoFocus} onChange={(value) => dispatch({ type: "photoFocus", value })} />
                  </Field>
                  {problemOf("photo_link") ? <p role="alert" className="text-base font-bold text-danger">{t`写真URLは https:// で始まる形式で入力してください。`}</p> : null}
                </Section>

                <Section title={t`動画`}>
                  <Field label={t`動画URL（YouTube またはアップロード動画）`} htmlFor="route-video" hint={t`https:// で始まるURLを入力してください。空にすると動画は表示されません。`}>
                    <TextInput id="route-video" value={draft.videoUrl} onChange={text("videoUrl")} maxLength={500} invalid={problemOf("video_link")} />
                  </Field>
                  {problemOf("video_link") ? <p role="alert" className="text-base font-bold text-danger">{t`YouTube またはアップロード動画の https:// で始まるURLを入力してください。`}</p> : null}
                  <VideoUpload onUploaded={text("videoUrl")} />
                  {parseVideoFile(draft.videoUrl) ? <SubtitleUpload videoUrl={draft.videoUrl} uploaded={draft.videoSubtitles} onUploaded={() => dispatch({ type: "videoSubtitles", value: true })} /> : null}
                  <VideoPreview url={draft.videoUrl} title={draft.nameJa} subtitles={draft.videoSubtitles} language="ja" />
                  {draft.id ? <VideoHistory routeId={draft.id} onPick={text("videoUrl")} /> : null}
                </Section>

                <Section title={t`英語版の動画`}>
                  <Field label={t`英語版動画URL（YouTube またはアップロード動画）`} htmlFor="route-video-en" hint={t`英語版ページで日本語動画の代わりに表示されます。未入力の場合は日本語動画がそのまま表示されます。`}>
                    <TextInput id="route-video-en" value={draft.videoUrlEn} onChange={text("videoUrlEn")} maxLength={500} invalid={problemOf("video_link_en")} />
                  </Field>
                  {problemOf("video_link_en") ? <p role="alert" className="text-base font-bold text-danger">{t`YouTube またはアップロード動画の https:// で始まるURLを入力してください。`}</p> : null}
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
                  <MultilingualField id="route-desc" field="description" translations={draft.translations} onTranslations={(v) => dispatch({ type: "translations", value: v })} label={t`コースの説明`} ja={draft.descriptionJa} en={draft.descriptionEn} onJa={text("descriptionJa")} onEn={text("descriptionEn")} long="short" required />
                </Section>
                <Section title={t`歴史・由来`}>
                  <MultilingualField id="route-history" field="history" translations={draft.translations} onTranslations={(v) => dispatch({ type: "translations", value: v })} label={t`歴史・由来`} ja={draft.historyJa} en={draft.historyEn} onJa={text("historyJa")} onEn={text("historyEn")} long="short" />
                </Section>
                <Section title={t`アクセス・交通`}>
                  <Field label={t`徒歩案内の距離上限`} htmlFor="route-far" hint={t`現在地がコースからこの距離以上離れている場合、徒歩ではなく電車・バスでのアクセスを案内します（未入力時は 5 km）。`}>
                    <NumberInput id="route-far" value={draft.farDistanceM} min={500} max={200000} integer suffix="m" onChange={(v) => dispatch({ type: "farDistanceM", value: v })} />
                  </Field>
                  <AccessPointsEditor value={draft.accessPoints} onChange={(value) => dispatch({ type: "accessPoints", value })} />
                  <MultilingualField id="route-access" field="access" translations={draft.translations} onTranslations={(v) => dispatch({ type: "translations", value: v })} label={t`アクセス・交通の補足`} ja={draft.accessJa} en={draft.accessEn} onJa={text("accessJa")} onEn={text("accessEn")} long="short" />
                  <p className="text-base text-muted">{t`上の一覧に収まらないアクセス情報（乗り換え、時刻、帰路の案内など）を自由に記入できます。`}</p>
                </Section>
                <Section title={t`出典`}>
                  <MultilingualField id="route-source" field="source" translations={draft.translations} onTranslations={(v) => dispatch({ type: "translations", value: v })} label={t`出典`} ja={draft.sourceJa} en={draft.sourceEn} onJa={text("sourceJa")} onEn={text("sourceEn")} long="short" />
                  <p className="text-base text-muted">{t`本文の参考資料や確認した公式サイトを記載します。コース詳細ページの下部に表示されます。`}</p>
                </Section>
              </>
            ) : null}

            {section === "map" ? (
              <>
              <Section title={t`地図・ルート`} id="map-section">
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
                <div role="group" aria-label={t`表示形式`} className="flex flex-wrap gap-2">
                  {(["table", "detail"] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      aria-pressed={placesView === v}
                      onClick={() => setPlacesView(v)}
                      className={`tap-target rounded-full border-2 px-5 text-lg font-bold ${placesView === v ? "border-ink bg-ink text-paper" : "border-line"}`}
                    >
                      {v === "table" ? t`表形式で一括入力` : t`1か所ずつ詳細編集`}
                    </button>
                  ))}
                </div>
                {firstAlong ? (
                  // The same setting as コース形式 in 基本情報 (周回 / 往復 come back to the start): visitors then see this place as the start and again as the goal, one page and one stamp.
                  <div className="rounded-xl border border-line bg-paper px-4">
                    <Check
                      id="route-start-is-goal"
                      checked={comesBack}
                      onChange={(on) => dispatch({ type: "walkStyle", value: on ? (draft.walkStyle === "out_and_back" ? "out_and_back" : "loop") : "one_way" })}
                    >
                      {t`「${firstAlong.nameJa || t`1番目の経由地`}」をゴールにも設定する（出発地点に戻る）`}
                    </Check>
                    {comesBack ? <p className="pb-3 text-base text-muted">{t`戻り用の経由地を別に作成する必要はありません。利用者にはスタートとゴールの両方にこのスポットが表示されます。`}</p> : null}
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
                    {t`経由地がまだありません。`}{" "}
                    <button type="button" onClick={() => setSection("map")} className="font-bold text-accent underline underline-offset-4">
                      {t`「地図・ルート」で経由地を追加`}
                    </button>
                  </p>
                ) : (
                  // The list stays in view on the left (drag to reorder, click to choose); the chosen waypoint's form beside it.
                  <div className="grid gap-4 xl:grid-cols-[17rem_minmax(0,1fr)]">
                    <div className="min-w-0 xl:sticky xl:top-[calc(var(--head)+1rem)] xl:max-h-[calc(100dvh-var(--head)-2rem)] xl:self-start xl:overflow-y-auto [overflow-anchor:none]">
                      <PlaceOrderList
                        places={draft.places}
                        selectedKey={current?.key ?? null}
                        isDirty={(key) => placeChanged(draft.places.find((p) => p.key === key)!, savedByKey.get(key))}
                        hasProblem={(key) => problems.some((p) => "key" in p && p.key === key)}
                        onSelect={choosePlace}
                        onReorder={(keys) => dispatch({ type: "reorderPlaces", keys })}
                      />
                    </div>
                    <ol id="place-form" className="min-w-0 scroll-mt-[calc(var(--head)+1rem)]">
                      {current ? (
                        <PlacePanel
                          key={current.key}
                          place={current}
                          number={currentIndex + 1}
                          selected
                          dirty={placeChanged(current, savedByKey.get(current.key))}
                          busy={busyKey !== null || saving}
                          canMoveUp={currentIndex > 0}
                          canMoveDown={currentIndex < draft.places.length - 1}
                          invalidName={problemOf("place_name", current.key)}
                          invalidPhoto={problemOf("place_photo_link", current.key)}
                          stampFrom={stampFromChoices(draft.places, current.key)}
                          onChange={(patch) => guarded(current.key, { type: "place", key: current.key, patch })}
                          onRemove={async () => {
                            if (!(await confirmRemoval(current.key))) return;
                            dispatch({ type: "removePlace", key: current.key });
                            setSelectedKey(null);
                          }}
                          onMove={(step) => {
                            const keys = draft.places.map((x) => x.key);
                            const j = currentIndex + step;
                            [keys[currentIndex], keys[j]] = [keys[j]!, keys[currentIndex]!];
                            dispatch({ type: "reorderPlaces", keys });
                          }}
                          canSave={draft.id !== null}
                          onSave={() => void savePlace(current.key)}
                          onPublish={() => setPublished(current.key, true)}
                          onUnpublish={() => setPublished(current.key, false)}
                        />
                      ) : null}
                    </ol>
                  </div>
                )}
                {problems.some((p) => p.kind === "place_position") ? <p role="alert" className="text-base font-bold text-danger">{t`緯度と経度は両方入力するか、両方空にしてください。`}</p> : null}
                {draft.id ? <SharedPlaces routeId={draft.id} initial={shared} lent={lent} routeNames={routeNames} locale={locale} /> : null}
                {draft.places.some((p) => p.id && p.published) ? (
                  <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-paper p-3">
                    <button type="button" disabled={busyKey !== null} onClick={() => void unpublishAll()} className="tap-target rounded-full border-2 border-danger px-5 text-lg font-bold text-danger disabled:opacity-40">
                      {busyKey === "all" ? t`処理中…` : t`すべて非公開にする`}
                    </button>
                    <p className="min-w-0 flex-1 text-base text-muted">{t`公開中の経由地をすべて下書きに戻します。コースは「準備中」として一覧に残ります。`}</p>
                  </div>
                ) : null}
              </Section>
            ) : null}

            {section === "check" ? (
              <Section title={t`公開前チェック`}>
                <p className="text-base text-muted">{t`未保存の変更も含めてチェックしています。`}</p>
                {(
                  [
                    [true, t`必須項目`],
                    [false, t`推奨項目`],
                  ] as const
                ).map(([required, title]) => (
                  <div key={String(required)} className="flex flex-col gap-2">
                    <h3 className="text-lg font-bold">{title}</h3>
                    <ul className="flex flex-col gap-2">
                      {checks
                        .filter((i) => i.required === required)
                        .map((i) => (
                          <li key={i.id} className="flex flex-wrap items-center gap-3 rounded-xl bg-paper p-3">
                            <span className={`w-20 shrink-0 rounded-full px-3 py-1 text-center text-base font-bold ${i.done ? "bg-moss text-paper" : required ? "bg-danger text-paper" : "bg-surface"}`}>{i.done ? t`完了` : t`未完了`}</span>
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

        <div className={`min-w-0 ${showPreview ? "" : "hidden"}`}>
          {/* Never taller than the screen (so its bottom is always reachable), and the browser is told not to re-anchor the page to it while it scrolls inside. */}
          <div className="2xl:sticky 2xl:top-[calc(var(--head)+1rem)] 2xl:max-h-[calc(100dvh-var(--head)-2rem)] 2xl:overflow-y-auto [contain:paint] [overflow-anchor:none]">
            <LivePreview draft={draft} order={order} locale={locale} />
          </div>
        </div>
      </div>
    </div>
  );
}
