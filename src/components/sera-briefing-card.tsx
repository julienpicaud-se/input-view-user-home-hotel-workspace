import * as React from "react";
import {
  AlertTriangle,
  ArrowRight,
  Loader2,
  MessageCircle,
  Minus,
  RefreshCw,
  Search,
  Send,
  Sparkles,
  TrendingDown,
  Wand2,
  X,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { sendAssistantMessage, type BriefingPayload } from "@/server/assistant.functions";
import { getActiveHotelId } from "@/lib/hotel";

interface SeraBriefingCardProps {
  firstName: string;
  loading: boolean;
  refreshing: boolean;
  briefing: BriefingPayload | null;
  error: string | null;
  onRefresh: () => void;
  onAsk: () => void;
}

interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export function SeraBriefingCard({
  firstName,
  loading,
  refreshing,
  briefing,
  error,
  onRefresh,
  onAsk,
}: SeraBriefingCardProps) {
  const send = useServerFn(sendAssistantMessage);
  const hotelId = getActiveHotelId();
  const storageKey = React.useMemo(
    () => `sera:briefing-chat:${hotelId ?? "default"}`,
    [hotelId],
  );
  const [turns, setTurns] = React.useState<ChatTurn[]>([]);
  const [input, setInput] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [hydrated, setHydrated] = React.useState(false);
  const scrollRef = React.useRef<HTMLDivElement | null>(null);

  // Load persisted chat history when hotel changes
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as ChatTurn[];
        if (Array.isArray(parsed)) {
          setTurns(
            parsed.filter(
              (t) =>
                t &&
                (t.role === "user" || t.role === "assistant") &&
                typeof t.content === "string",
            ),
          );
        } else {
          setTurns([]);
        }
      } else {
        setTurns([]);
      }
    } catch {
      setTurns([]);
    }
    setHydrated(true);
  }, [storageKey]);

  // Persist chat history whenever it changes (after initial hydration)
  React.useEffect(() => {
    if (!hydrated || typeof window === "undefined") return;
    try {
      if (turns.length === 0) {
        window.localStorage.removeItem(storageKey);
      } else {
        window.localStorage.setItem(storageKey, JSON.stringify(turns));
      }
    } catch {
      // Ignore quota / serialization errors
    }
  }, [turns, storageKey, hydrated]);

  React.useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [turns, pending]);

  async function handleAsk(text: string) {
    const trimmed = text.trim();
    if (!trimmed || pending) return;

    // Build a short context message so Sera knows what briefing the user is reacting to.
    const briefingContext = briefing
      ? `Context — today's briefing for ${firstName}:\nHeadline: ${briefing.headline}\nSummary: ${briefing.summary}\nFocus: ${briefing.focus}`
      : "";

    const history: ChatTurn[] = [];
    if (briefingContext && turns.length === 0) {
      history.push({ role: "assistant", content: briefingContext });
    }
    history.push(...turns);

    const userTurn: ChatTurn = { role: "user", content: trimmed };
    setTurns((t) => [...t, userTurn]);
    setInput("");
    setPending(true);

    try {
      const res = await send({
        data: {
          message: trimmed,
          history,
          hotelId,
        },
      });
      if (res.ok) {
        setTurns((t) => [...t, { role: "assistant", content: res.content }]);
      } else {
        toast.error(res.error);
        setTurns((t) => t.slice(0, -1));
      }
    } catch {
      toast.error("Something went wrong");
      setTurns((t) => t.slice(0, -1));
    } finally {
      setPending(false);
    }
  }

  const showChat = turns.length > 0 || pending;

  return (
    <Card className="relative overflow-hidden rounded-2xl border-border/60 bg-gradient-to-br from-primary/8 via-card to-accent/12 p-5 md:p-6">
      <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-primary/10 blur-3xl" />
      <div className="relative flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                Sera · Your daily briefing
              </div>
              <div className="font-serif text-lg font-semibold text-foreground">
                Personalised for {firstName}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading || refreshing}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-background/60 px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Refresh briefing"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">{refreshing ? "Refreshing" : "Refresh"}</span>
          </button>
        </div>

        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <div className="flex flex-wrap gap-2 pt-1">
              <Skeleton className="h-6 w-24" />
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-6 w-28" />
            </div>
          </div>
        ) : error ? (
          <div className="rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm text-foreground">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
              <div>
                <p>{error}</p>
                <button
                  type="button"
                  onClick={onRefresh}
                  className="mt-2 text-xs font-medium text-primary underline-offset-4 hover:underline"
                >
                  Try again
                </button>
              </div>
            </div>
          </div>
        ) : briefing ? (
          <>
            <p className="font-serif text-xl leading-snug text-foreground md:text-2xl">
              {briefing.headline}
            </p>
            <p className="text-sm leading-relaxed text-muted-foreground md:text-[15px]">
              {briefing.summary}
            </p>

            {briefing.highlights.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {briefing.highlights.map((h, i) => {
                  const tone =
                    h.tone === "positive"
                      ? "border-success/30 bg-success/10 text-success"
                      : h.tone === "warning"
                        ? "border-warning/30 bg-warning/10 text-warning"
                        : "border-border/60 bg-muted text-foreground";
                  const Icon =
                    h.tone === "positive"
                      ? TrendingDown
                      : h.tone === "warning"
                        ? AlertTriangle
                        : Minus;
                  return (
                    <span
                      key={i}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${tone}`}
                    >
                      <Icon className="h-3 w-3" />
                      {h.label}
                    </span>
                  );
                })}
              </div>
            )}

            <div className="flex flex-col items-start gap-3 rounded-xl border border-border/50 bg-background/50 p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-2 text-sm text-foreground">
                <Wand2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span>
                  <span className="font-medium">Today's focus:</span>{" "}
                  <span className="text-muted-foreground">{briefing.focus}</span>
                </span>
              </div>
              <Button size="sm" variant="outline" onClick={onAsk} className="shrink-0">
                Open analysis
                <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </Button>
            </div>

            {/* Inline chat with Sera */}
            <div className="rounded-xl border border-border/50 bg-background/40">
              <div className="flex items-center justify-between gap-2 border-b border-border/50 px-3 py-2">
                <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                  <MessageCircle className="h-3.5 w-3.5" />
                  Ask Sera about this briefing
                </div>
                {turns.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setTurns([])}
                    className="text-[11px] text-muted-foreground hover:text-foreground"
                  >
                    Clear
                  </button>
                )}
              </div>

              {showChat && (
                <div
                  ref={scrollRef}
                  className="max-h-72 space-y-3 overflow-y-auto px-3 py-3"
                >
                  {turns.map((t, i) => (
                    <div
                      key={i}
                      className={`flex ${t.role === "user" ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                          t.role === "user"
                            ? "bg-primary text-primary-foreground"
                            : "border border-border/60 bg-card text-foreground"
                        }`}
                      >
                        {t.role === "user" ? (
                          <div className="whitespace-pre-wrap">{t.content}</div>
                        ) : (
                          <div className="prose prose-sm max-w-none prose-p:my-1.5 prose-p:text-foreground prose-strong:text-foreground prose-li:my-0.5 prose-ul:my-1.5">
                            <ReactMarkdown>{t.content}</ReactMarkdown>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  {pending && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Sera is thinking…
                    </div>
                  )}
                </div>
              )}

              {/* Suggested clarification questions */}
              {briefing.questions.length > 0 && !pending && (
                <div className="flex flex-wrap gap-1.5 px-3 pt-3">
                  {briefing.questions.map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => void handleAsk(q)}
                      className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background/60 px-2.5 py-1 text-xs text-foreground transition hover:border-primary/40 hover:bg-primary/5"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              )}

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void handleAsk(input);
                }}
                className="flex items-end gap-2 px-3 py-3"
              >
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void handleAsk(input);
                    }
                  }}
                  placeholder="Ask a follow-up question…"
                  rows={1}
                  className="flex-1 resize-none rounded-lg border border-border/60 bg-background px-3 py-2 text-sm focus:border-primary/40 focus:outline-none focus:ring-1 focus:ring-primary/30"
                />
                <Button
                  type="submit"
                  size="icon"
                  disabled={pending || !input.trim()}
                  className="h-9 w-9 shrink-0 rounded-lg"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </form>
            </div>
          </>
        ) : null}
      </div>
    </Card>
  );
}
