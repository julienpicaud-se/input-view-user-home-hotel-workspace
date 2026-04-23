import { createFileRoute, useNavigate } from "@tanstack/react-router";
import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import { Send, Sparkles, Loader2, Hotel as HotelIcon } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { z } from "zod";
import { PageContainer, PageHeader } from "@/components/page-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { sendAssistantMessage } from "@/server/assistant.functions";
import { getActiveHotelId } from "@/lib/hotel";

const assistantSearchSchema = z.object({
  prompt: z.string().optional(),
});

export const Route = createFileRoute("/assistant")({
  validateSearch: assistantSearchSchema,
  head: () => ({
    meta: [
      { title: "AI assistant — RA+" },
      {
        name: "description",
        content: "Ask RA+ about your hotel's energy, water, waste and emissions.",
      },
    ],
  }),
  component: AssistantPage,
});

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const STARTER_PROMPTS = [
  "Why did my electricity rise last month?",
  "What 3 actions will cut my water use most?",
  "Draft a sustainability update for guests.",
  "How do I compare to peers right now?",
];

function AssistantPage() {
  const send = useServerFn(sendAssistantMessage);
  const navigate = useNavigate();
  const search = Route.useSearch();
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [input, setInput] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const consumedPromptRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, loading]);

  async function handleSend(text: string) {
    if (!text.trim() || loading) return;
    const userMsg: ChatMessage = { role: "user", content: text.trim() };
    const history = messages.slice(-10);
    setMessages((m) => [...m, userMsg]);
    setInput("");
    setLoading(true);
    try {
      const res = await send({ data: { message: userMsg.content, history, hotelId: getActiveHotelId() } });
      if (res.ok) {
        setMessages((m) => [...m, { role: "assistant", content: res.content }]);
      } else {
        toast.error(res.error);
        setMessages((m) => m.slice(0, -1));
      }
    } catch {
      toast.error("Something went wrong");
      setMessages((m) => m.slice(0, -1));
    } finally {
      setLoading(false);
    }
  }

  // Auto-send a prompt arriving from another page (e.g. chart explainer "Ask Sera")
  React.useEffect(() => {
    const incoming = search.prompt?.trim();
    if (!incoming) return;
    if (consumedPromptRef.current === incoming) return;
    if (loading) return;
    consumedPromptRef.current = incoming;
    void handleSend(incoming);
    // Clear the URL param so reloads don't re-fire the prompt
    void navigate({ to: "/assistant", search: {}, replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.prompt, loading]);

  return (
    <PageContainer>
      <PageHeader
        eyebrow="AI assistant"
        title="Ask RA+"
        subtitle="Your AI sustainability consultant. Grounded in your hotel's actual data."
        actions={
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs">
            <HotelIcon className="h-3.5 w-3.5 text-secondary" />
            The Marbella Grand · 120 rooms
          </span>
        }
      />

      <Card className="flex h-[calc(100vh-280px)] min-h-[480px] flex-col overflow-hidden rounded-3xl border-border/70 p-0">
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-6 md:px-10">
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/30 text-accent-foreground">
                <Sparkles className="h-6 w-6" />
              </div>
              <h2 className="mt-5 font-serif text-2xl font-semibold">
                How can I help today?
              </h2>
              <p className="mt-2 max-w-md text-sm text-muted-foreground">
                I have your latest 12 months of utility data and peer
                comparisons. Try one of these prompts to get started.
              </p>
              <div className="mt-6 grid w-full max-w-2xl grid-cols-1 gap-2.5 sm:grid-cols-2">
                {STARTER_PROMPTS.map((p) => (
                  <button
                    key={p}
                    onClick={() => handleSend(p)}
                    className="rounded-xl border border-border bg-card px-4 py-3 text-left text-sm transition hover:border-accent hover:bg-accent/10"
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              <AnimatePresence initial={false}>
                {messages.map((m, i) => (
                  <MessageBubble key={i} message={m} />
                ))}
              </AnimatePresence>
              {loading && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  RA+ is thinking…
                </div>
              )}
            </div>
          )}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleSend(input);
          }}
          className="border-t border-border bg-card px-4 py-3 md:px-6"
        >
          <div className="flex items-end gap-2 rounded-2xl border border-border bg-background px-3 py-2 focus-within:ring-1 focus-within:ring-ring">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void handleSend(input);
                }
              }}
              placeholder="Ask anything about your sustainability performance…"
              rows={1}
              className="flex-1 resize-none bg-transparent py-1.5 text-sm focus:outline-none"
            />
            <Button
              type="submit"
              size="icon"
              disabled={loading || !input.trim()}
              className="h-9 w-9 rounded-xl"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </form>
      </Card>
    </PageContainer>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex ${isUser ? "justify-end" : "justify-start"}`}
    >
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
          isUser
            ? "bg-secondary text-secondary-foreground"
            : "border border-border bg-card text-foreground"
        }`}
      >
        {isUser ? (
          <div className="whitespace-pre-wrap">{message.content}</div>
        ) : (
          <div className="prose prose-sm max-w-none prose-headings:font-serif prose-headings:font-semibold prose-p:my-2 prose-p:text-foreground prose-strong:text-foreground prose-li:my-0.5 prose-ul:my-2">
            <ReactMarkdown>{message.content}</ReactMarkdown>
          </div>
        )}
      </div>
    </motion.div>
  );
}
