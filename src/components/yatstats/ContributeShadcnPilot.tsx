"use client"

// Isolated shadcn/ui proof of concept. Existing payment/upload endpoints and
// shared drawer remain untouched; the preview is opt-in with ?ui=shadcn.
import { useContext, useEffect, useRef, useState } from "react"
import { SchoolContext } from "@/context/SchoolContext"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import {
  CONTRIBUTIONS, SPONSORSHIPS, THUMB_IMAGES, SponsorInquiry,
  type DeskCard, type SponsorCard
} from "@/components/yatstats/ContributeGuide"
import {
  PHOTO_TYPES, CONNECT_INQUIRY_EVENT, SPONSOR_INTERESTS,
  openContribute, type ContributeOpen, type SponsorInterest
} from "@/lib/contribute"

type Category = "contribute" | "connect"
type CurrentCard = DeskCard | SponsorCard

const FALLBACK_IMAGE = "/img/connect-contribute-portal.png"

function getCard(id: string): CurrentCard {
  return [...CONTRIBUTIONS, ...SPONSORSHIPS].find((item) => item.id === id) || CONTRIBUTIONS[0]
}

function PreviewArtwork({ item }: { item: CurrentCard }) {
  const image = THUMB_IMAGES[item.thumb]
  return (
    <div className="ccp-artwork">
      <img src={image.src} alt={"Illustrative example: " + item.title}
        style={image.position ? { objectPosition: image.position } : undefined}
        onError={(event) => {
          if (!event.currentTarget.src.endsWith(FALLBACK_IMAGE)) event.currentTarget.src = FALLBACK_IMAGE
        }} />
      <span className="ccp-artwork-caption">{image.label}</span>
    </div>
  )
}

function PhotoPlacement({ item }: { item: CurrentCard }) {
  const placement = "detail" in item && item.help
    ? PHOTO_TYPES.find((type) => type.id === item.help)?.spec
    : null
  return (
    <div className="ccp-preview-detail">
      <span className="ccp-kicker">WHERE IT APPEARS</span>
      <h3>{item.title}</h3>
      <p>{placement || item.instruction}</p>
      <PreviewArtwork item={item} />
      <p className="ccp-preview-note">Example imagery shows the kind of placement, not your final uploaded content.</p>
    </div>
  )
}

function DeskRow({
  item, active, onSelect, onPreview, onAction,
}: {
  item: CurrentCard
  active: boolean
  onSelect: () => void
  onPreview: () => void
  onAction: () => void
}) {
  const image = THUMB_IMAGES[item.thumb]
  return (
    <article id={item.id} className={"ccp-row" + (active ? " is-selected" : "")}
      onMouseEnter={onSelect} onFocus={onSelect}>
      <button type="button" className="ccp-row-main" onClick={onAction}
        aria-label={item.action + ": " + item.title}>
        <span className="ccp-row-image">
          <img loading="lazy" src={image.src} alt=""
            style={image.position ? { objectPosition: image.position } : undefined}
            onError={(event) => {
              if (!event.currentTarget.src.endsWith(FALLBACK_IMAGE)) event.currentTarget.src = FALLBACK_IMAGE
            }} />
        </span>
        <span className="ccp-row-copy">
          <span className="ccp-row-eyebrow">{item.eyebrow}</span>
          <strong className="ccp-row-title">{item.title}</strong>
          <span className="ccp-row-description">{item.instruction}</span>
          <span className="ccp-row-action">{item.action} <span aria-hidden="true">→</span></span>
        </span>
      </button>
      <button type="button" className="ccp-where-button" onClick={onPreview}
        aria-label={"See where " + item.title + " appears"}>SEE EXAMPLE</button>
    </article>
  )
}

export default function ContributeShadcnPilot({ schoolName }: { schoolName: string }) {
  const school = useContext(SchoolContext)
  const [category, setCategory] = useState<Category>("contribute")
  const [selectedId, setSelectedId] = useState("cc-photo")
  const [inquiry, setInquiry] = useState<SponsorInterest | null>(null)
  const [mobilePreview, setMobilePreview] = useState(false)
  const launchedShareLink = useRef(false)
  const selected = getCard(selectedId)

  const preview = (id: string) => {
    setSelectedId(id)
    setMobilePreview(true)
  }

  const action = (item: CurrentCard) => {
    setSelectedId(item.id)
    if ("detail" in item) {
      openContribute(item.detail)
      return
    }
    if (item.interest) setInquiry(item.interest)
  }

  // Row 3 sponsor / alumni shortcuts use this existing event.
  useEffect(() => {
    const onConnect = (event: Event) => {
      const interest = (event as CustomEvent<SponsorInterest>).detail
      if (!interest || !(interest in SPONSOR_INTERESTS)) return
      setCategory("connect")
      setInquiry(interest)
      setSelectedId(SPONSORSHIPS.find((item) => item.interest === interest)?.id || "cc-profile-sponsor")
    }
    window.addEventListener(CONNECT_INQUIRY_EVENT, onConnect)
    return () => window.removeEventListener(CONNECT_INQUIRY_EVENT, onConnect)
  }, [])

  // Preserve existing shared upload URLs (including player and purpose)
  // used in outreach emails and quick actions.
  useEffect(() => {
    if (launchedShareLink.current) return
    launchedShareLink.current = true
    const params = new URLSearchParams(window.location.search)
    const rawType = params.get("upload") || params.get("photoType")
    const photoType = PHOTO_TYPES.find((type) => type.id === rawType)?.id
    const action = params.get("contribute")
    if (!photoType && !["tip", "missing", "data", "photo"].includes(String(action || ""))) return
    const tab = photoType || action === "photo" ? "photo"
      : action === "tip" || action === "missing" || action === "data" ? action : "photo"
    const playerId = String(params.get("playerId") || "").trim()
    const open = (player?: ContributeOpen["player"]) => {
      requestAnimationFrame(() => openContribute({ tab, photoType, ...(player ? { player } : {}) }))
    }
    if (!playerId || !/^(?:YAT)?\d+$/i.test(playerId)) { open(); return }
    fetch("/api/contribute/seasons?playerId=" + encodeURIComponent(playerId))
      .then((response) => response.ok ? response.json() : null)
      .then((data) => {
        const player = data?.player
        if (!player?.name || !player?.hsid) return open()
        open({
          playerId,
          displayName: String(player.name),
          schoolId: String(player.hsid),
          schoolName: String(player.schoolName || schoolName),
        })
      })
      .catch(() => open())
  }, [schoolName])

  // Deep links from another YAT?STATS view must select the containing tab.
  useEffect(() => {
    const selectHash = () => {
      const id = window.location.hash.replace(/^#/, "")
      if (!id) return
      const connect = SPONSORSHIPS.some((item) => item.id === id) || id === "cc-connect"
      const contribute = CONTRIBUTIONS.some((item) => item.id === id) || id === "cc-contribute"
      if (!connect && !contribute) return
      setCategory(connect ? "connect" : "contribute")
      if (id.startsWith("cc-") && id !== "cc-connect" && id !== "cc-contribute") {
        setSelectedId(id)
        requestAnimationFrame(() => requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: "nearest", behavior: "smooth" })))
      }
    }
    selectHash()
    window.addEventListener("hashchange", selectHash)
    window.addEventListener("yat-contribute-navigate", selectHash)
    return () => {
      window.removeEventListener("hashchange", selectHash)
      window.removeEventListener("yat-contribute-navigate", selectHash)
    }
  }, [])

  const chooseTab = (next: string) => {
    const view = next === "connect" ? "connect" : "contribute"
    setCategory(view)
    setSelectedId(view === "connect" ? "cc-profile-sponsor" : "cc-photo")
  }

  return (
    <div className="yat-cc-pilot">
      <div className="ccp-intro">
        <div>
          <span className="ccp-kicker">YAT?STATS / TRANSACTION DESK · COMPONENT PREVIEW</span>
          <h1>Connect &amp; Contribute</h1>
          <p>{schoolName} · Select a transaction to get started.</p>
        </div>
        <a href="?ui=classic" className="ccp-compare-link">VIEW ORIGINAL</a>
      </div>
      <Tabs value={category} onValueChange={chooseTab} className="ccp-tabs">
        <TabsList aria-label="Connect and Contribute transactions" className="ccp-tab-list">
          <TabsTrigger value="contribute" className="ccp-tab-trigger">CONTRIBUTE</TabsTrigger>
          <TabsTrigger value="connect" className="ccp-tab-trigger">CONNECT</TabsTrigger>
        </TabsList>
        <div className="ccp-layout">
          <div className="ccp-transaction-panel">
            <TabsContent value="contribute" id="cc-contribute" className="ccp-transaction-list">
              <p className="ccp-tab-description">Photos, history, updates, and news.</p>
              {CONTRIBUTIONS.map((item) => (
                <DeskRow key={item.id} item={item} active={selectedId === item.id}
                  onSelect={() => setSelectedId(item.id)}
                  onPreview={() => preview(item.id)}
                  onAction={() => action(item)} />
              ))}
            </TabsContent>
            <TabsContent value="connect" id="cc-connect" className="ccp-transaction-list">
              <p className="ccp-tab-description">Sponsorships, alumni businesses, and player experiences.</p>
              {SPONSORSHIPS.map((item) => (
                <DeskRow key={item.id} item={item} active={selectedId === item.id}
                  onSelect={() => setSelectedId(item.id)}
                  onPreview={() => preview(item.id)}
                  onAction={() => action(item)} />
              ))}
              <p className="ccp-footnote">Sponsorships use the existing inquiry form. Checkout is not yet enabled.</p>
            </TabsContent>
          </div>
          <aside className="ccp-desktop-preview" aria-label="Selected transaction preview">
            <PhotoPlacement item={selected} />
            <button type="button" className="ccp-preview-action" onClick={() => action(selected)}>
              {selected.action} <span aria-hidden="true">→</span>
            </button>
          </aside>
        </div>
      </Tabs>

      <Sheet open={Boolean(inquiry)} onOpenChange={(open) => { if (!open) setInquiry(null) }}>
        <SheetContent side="left" className="ccp-inquiry-sheet">
          <SheetHeader>
            <span className="ccp-kicker">CONNECT / {String(school?.hsName || schoolName).toUpperCase()}</span>
            <SheetTitle>{inquiry ? SPONSOR_INTERESTS[inquiry] : "Connect"}</SheetTitle>
            <SheetDescription>Enter your details and send your request to the YAT?STATS team.</SheetDescription>
            <SheetClose className="ccp-sheet-close" aria-label="Close inquiry">×</SheetClose>
          </SheetHeader>
          {inquiry ? <SponsorInquiry key={inquiry} interest={inquiry} onClose={() => setInquiry(null)} /> : null}
        </SheetContent>
      </Sheet>

      <Sheet open={mobilePreview} onOpenChange={setMobilePreview}>
        <SheetContent side="right" className="ccp-placement-sheet">
          <SheetHeader>
            <span className="ccp-kicker">YAT?STATS / PLACEMENT</span>
            <SheetTitle>{selected.title}</SheetTitle>
            <SheetDescription>See what this contribution or placement looks like.</SheetDescription>
            <SheetClose className="ccp-sheet-close" aria-label="Close example">×</SheetClose>
          </SheetHeader>
          <PhotoPlacement item={selected} />
          <button type="button" className="ccp-preview-action" onClick={() => { setMobilePreview(false); action(selected) }}>
            {selected.action} <span aria-hidden="true">→</span>
          </button>
        </SheetContent>
      </Sheet>
    </div>
  )
}
